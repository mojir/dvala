import { describe, expect, it } from 'vitest'
import { createDvala } from '../src/createDvala'
import { allBuiltinModules } from '../src/full'

const dvala = createDvala({ modules: allBuiltinModules })

describe('handle...with...end', () => {
  describe('basic', () => {
    it('should return body value when no effects and empty handler list', () => {
      expect(dvala.run('handle 42 with [] end')).toBe(42)
    })

    it('should return body value when no effects are performed', () => {
      expect(dvala.run('handle 1 + 2 + 3 with [(arg, eff, nxt) -> nxt(eff, arg)] end')).toBe(6)
    })

    it('should handle a single effect with a single handler', () => {
      const result = dvala.run(`do
        let h = (arg, eff, nxt) ->
          if eff == @my.eff then arg + 1
          else nxt(eff, arg)
          end;
        handle perform(@my.eff, 42) with [h] end
      end`)
      expect(result).toBe(43)
    })

    it('should handle multiple effects in the body', () => {
      const result = dvala.run(`do
        let h = (arg, eff, nxt) ->
          if eff == @my.eff then arg * 2
          else nxt(eff, arg)
          end;
        handle
          let a = perform(@my.eff, 3);
          let b = perform(@my.eff, 5);
          a + b
        with [h] end
      end`)
      expect(result).toBe(16)
    })

    it('should support multiple handlers in a list', () => {
      const result = dvala.run(`do
        let h1 = (arg, eff, nxt) ->
          if eff == @my.a then "a:" ++ arg
          else nxt(eff, arg)
          end;
        let h2 = (arg, eff, nxt) ->
          if eff == @my.b then "b:" ++ arg
          else nxt(eff, arg)
          end;
        handle
          perform(@my.a, "x") ++ " " ++ perform(@my.b, "y")
        with [h1, h2] end
      end`)
      expect(result).toBe('a:x b:y')
    })

    it('should accept a single handler function (not a list)', () => {
      const result = dvala.run(`do
        let h = (arg, eff, nxt) ->
          if eff == @my.eff then arg * 10
          else nxt(eff, arg)
          end;
        handle perform(@my.eff, 5) with h end
      end`)
      expect(result).toBe(50)
    })
  })

  describe('next(eff, arg)', () => {
    it('should propagate unhandled effects to outer scope', () => {
      const result = dvala.run(`
        handle
          handle
            perform(@my.inner, "hello")
          with [(arg, eff, nxt) -> nxt(eff, arg)]
          end
        with [(arg, eff, nxt) -> if eff == @my.inner then "outer:" ++ arg else nxt(eff, arg) end]
        end
      `)
      expect(result).toBe('outer:hello')
    })

    it('should allow handler to transform downstream result', () => {
      const result = dvala.run(`do
        let logger = (arg, eff, nxt) -> do
          let result = nxt(eff, arg);
          "logged:" ++ str(result)
        end;
        let handler = (arg, eff, nxt) ->
          if eff == @my.eff then arg * 2
          else nxt(eff, arg)
          end;
        handle perform(@my.eff, 21) with [logger, handler] end
      end`)
      expect(result).toBe('logged:42')
    })

    it('should allow next to modify the effect before forwarding', () => {
      const result = dvala.run(`do
        let aliaser = (arg, eff, nxt) ->
          if eff == @old.name then nxt(@new.name, arg)
          else nxt(eff, arg)
          end;
        let handler = (arg, eff, nxt) ->
          if eff == @new.name then "new:" ++ arg
          else nxt(eff, arg)
          end;
        handle perform(@old.name, "x") with [aliaser, handler] end
      end`)
      expect(result).toBe('new:x')
    })
  })

  describe('nested handle blocks', () => {
    it('should support nested handle blocks', () => {
      const result = dvala.run(`do
        let h-outer = (arg, eff, nxt) ->
          if eff == @my.outer then "outer:" ++ arg
          else nxt(eff, arg)
          end;
        let h-inner = (arg, eff, nxt) ->
          if eff == @my.inner then "inner:" ++ arg
          else nxt(eff, arg)
          end;
        handle
          handle
            perform(@my.inner, "a") ++ " " ++ perform(@my.outer, "b")
          with [h-inner] end
        with [h-outer] end
      end`)
      expect(result).toBe('inner:a outer:b')
    })
  })

  describe('runtime error catching', () => {
    it('should catch runtime errors via @dvala.error', () => {
      const result = dvala.run(`
        handle
          1 + "hello"
        with [(arg, eff, nxt) ->
          if eff == @dvala.error then "caught"
          else nxt(eff, arg)
          end
        ]
        end
      `)
      expect(result).toBe('caught')
    })

    it('should catch perform(@dvala.error) via handle...with', () => {
      const result = dvala.run(`
        handle
          perform(@dvala.error, "boom")
        with [(arg, eff, nxt) ->
          if eff == @dvala.error then "caught: " ++ arg
          else nxt(eff, arg)
          end
        ]
        end
      `)
      expect(result).toBe('caught: boom')
    })

    it('should propagate uncaught errors', () => {
      expect(() => dvala.run(`
        handle
          1 + "hello"
        with [(arg, eff, nxt) ->
          if eff == @my.other then "nope"
          else nxt(eff, arg)
          end
        ]
        end
      `)).toThrow()
    })
  })

  describe('@dvala.error infinite loop prevention', () => {
    it('perform(@dvala.error) with non-matching handler should throw', () => {
      expect(() => dvala.run(`
        handle
          perform(@dvala.error, "boom")
        with [(arg, eff, nxt) -> if eff == @my.eff then arg else nxt(eff, arg) end]
        end
      `)).toThrow('boom')
    })

    it('nested handlers both passing @dvala.error via nxt should throw', () => {
      expect(() => dvala.run(`
        handle
          handle
            perform(@dvala.error, "boom")
          with [(arg, eff, nxt) -> nxt(eff, arg)]
          end
        with [(arg, eff, nxt) -> nxt(eff, arg)]
        end
      `)).toThrow('boom')
    })

    it('runtime error with no @dvala.error handler should throw', () => {
      expect(() => dvala.run(`
        handle
          0 / 0
        with [(arg, eff, nxt) -> if eff == @my.eff then arg else nxt(eff, arg) end]
        end
      `)).toThrow()
    })

    it('unhandled effect error caught by @dvala.error handler', () => {
      const result = dvala.run(`
        handle
          perform(@no.handler, "data")
        with [(arg, eff, nxt) -> if eff == @dvala.error then "caught: " ++ arg else nxt(eff, arg) end]
        end
      `)
      expect(result).toBe('caught: Unhandled effect: \'no.handler\'')
    })

    it('inner handler catches @dvala.error, outer never reached', () => {
      const result = dvala.run(`
        handle
          handle
            perform(@dvala.error, "boom")
          with [(arg, eff, nxt) -> if eff == @dvala.error then "inner: " ++ arg else nxt(eff, arg) end]
          end
        with [(arg, eff, nxt) -> if eff == @dvala.error then "outer: " ++ arg else nxt(eff, arg) end]
        end
      `)
      expect(result).toBe('inner: boom')
    })

    it('inner passes @dvala.error via nxt, outer catches it', () => {
      const result = dvala.run(`
        handle
          handle
            perform(@dvala.error, "boom")
          with [(arg, eff, nxt) -> nxt(eff, arg)]
          end
        with [(arg, eff, nxt) -> if eff == @dvala.error then "outer: " ++ arg else nxt(eff, arg) end]
        end
      `)
      expect(result).toBe('outer: boom')
    })

    it('runtime error in handler body propagates past own scope', () => {
      const result = dvala.run(`
        handle
          handle
            perform(@my.eff, "data")
          with [(arg, eff, nxt) -> if eff == @my.eff then 0 / 0 else nxt(eff, arg) end]
          end
        with [(arg, eff, nxt) -> if eff == @dvala.error then "outer caught" else nxt(eff, arg) end]
        end
      `)
      expect(result).toBe('outer caught')
    })

    it('nested HandleWith: inner skipped, outer catches @dvala.error', () => {
      const result = dvala.run(`
        handle
          handle
            0 / 0
          with [(arg, eff, nxt) -> if eff == @my.eff then arg else nxt(eff, arg) end]
          end
        with [(arg, eff, nxt) -> if eff == @dvala.error then "caught" else nxt(eff, arg) end]
        end
      `)
      expect(result).toBe('caught')
    })

    it('non-matching handler and no outer handler should throw', () => {
      expect(() => dvala.run(`
        handle
          0 / 0
        with [(arg, eff, nxt) -> if eff == @my.eff then arg else nxt(eff, arg) end]
        end
      `)).toThrow()
    })
  })

  describe('@dvala.error with host handlers', () => {
    it('host handler for dvala.error that calls next() should error', async () => {
      const result = await dvala.runAsync('perform(@dvala.error, "test")', {
        effectHandlers: [
          { pattern: 'dvala.error', handler: async ctx => { ctx.next() } },
        ],
      })
      expect(result.type).toBe('error')
    })

    it('host handler for dvala.error that resumes should work', async () => {
      const result = await dvala.runAsync('perform(@dvala.error, "test")', {
        effectHandlers: [
          { pattern: 'dvala.error', handler: async ({ resume }) => { resume('recovered') } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 'recovered' })
    })

    it('local handle...with catches runtime error even with host dvala.error handler', async () => {
      const result = await dvala.runAsync(`
        handle
          0 / 0
        with [(arg, eff, nxt) -> if eff == @dvala.error then "local caught" else nxt(eff, arg) end]
        end
      `, {
        effectHandlers: [
          { pattern: 'dvala.error', handler: async ({ resume }) => { resume('host caught') } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 'local caught' })
    })
  })

  describe('handler shorthand', () => {
    it('basic @effect(param) -> body shorthand', () => {
      const result = dvala.run(`
        handle
          perform(@my.eff, 21)
        with [@my.eff(x) -> x * 2]
        end
      `)
      expect(result).toBe(42)
    })

    it('catches @dvala.error with shorthand', () => {
      const result = dvala.run(`
        handle 0 / 0
        with [@dvala.error(msg) -> "caught: " ++ msg]
        end
      `)
      expect(result).toBe('caught: Number is NaN')
    })

    it('non-matching effect falls through to nxt', () => {
      expect(() => dvala.run(`
        handle perform(@other, "x")
        with [@my.eff(x) -> x]
        end
      `)).toThrow('Unhandled effect')
    })

    it('shorthand as stored value', () => {
      const result = dvala.run(`
        let h = @my.eff(x) -> x + 1;
        handle perform(@my.eff, 41) with [h] end
      `)
      expect(result).toBe(42)
    })

    it('multiple shorthand handlers in list', () => {
      const result = dvala.run(`
        handle
          perform(@a, 10) + perform(@b, 20)
        with [
          @a(x) -> x * 2,
          @b(x) -> x * 3
        ]
        end
      `)
      expect(result).toBe(80)
    })

    it('wildcard effect matching', () => {
      const result = dvala.run(`
        handle
          perform(@dvala.io.print, "hi")
        with [@dvala.io.*(arg) -> null]
        end
      `)
      expect(result).toBe(null)
    })

    it('catch-all wildcard', () => {
      const result = dvala.run(`
        handle
          perform(@anything, "data")
        with [@*(arg) -> "caught: " ++ arg]
        end
      `)
      expect(result).toBe('caught: data')
    })

    it('mixed shorthand and full handler', () => {
      const result = dvala.run(`
        handle
          perform(@a, 10) + perform(@b, 20)
        with [
          @a(x) -> x * 2,
          (arg, eff, nxt) -> if eff == @b then arg * 3 else nxt(eff, arg) end
        ]
        end
      `)
      expect(result).toBe(80)
    })

    it('shorthand does not shadow outer variables named eff or nxt', () => {
      const result = dvala.run(`
        let eff = "outer-eff";
        let nxt = "outer-nxt";
        handle
          perform(@my.eff, 1)
        with [@my.eff(x) -> eff ++ " " ++ nxt]
        end
      `)
      expect(result).toBe('outer-eff outer-nxt')
    })

    it('shorthand with string payload', () => {
      const result = dvala.run(`
        handle perform(@greet, "world")
        with [@greet(name) -> "hello, " ++ name]
        end
      `)
      expect(result).toBe('hello, world')
    })

    it('shorthand with null payload', () => {
      const result = dvala.run(`
        handle perform(@tick, null)
        with [@tick(x) -> 42]
        end
      `)
      expect(result).toBe(42)
    })

    it('shorthand with complex body expression', () => {
      const result = dvala.run(`
        handle perform(@calc, 5)
        with [@calc(n) -> do
          let doubled = n * 2;
          let tripled = n * 3;
          doubled + tripled
        end]
        end
      `)
      expect(result).toBe(25)
    })

    it('shorthand handler passed to function', () => {
      const result = dvala.run(`
        let run-with = (body-fn, handlers) ->
          handle body-fn() with handlers end;
        run-with(-> perform(@my.eff, 10), [@my.eff(x) -> x * 5])
      `)
      expect(result).toBe(50)
    })

    it('nested shorthand handlers', () => {
      const result = dvala.run(`
        handle
          handle
            perform(@inner, 10)
          with [@inner(x) -> x + perform(@outer, x)]
          end
        with [@outer(x) -> x * 100]
        end
      `)
      expect(result).toBe(1010)
    })
  })

  describe('shorthand with 0 params ($ variables)', () => {
    it('basic zero-param shorthand uses $ for arg', () => {
      const result = dvala.run(`
        handle perform(@my.eff, 21)
        with [@my.eff -> $ * 2]
        end
      `)
      expect(result).toBe(42)
    })

    it('$2 is the effect reference', () => {
      const result = dvala.run(`
        handle perform(@my.eff, "hello")
        with [@my.eff -> effect-name($2)]
        end
      `)
      expect(result).toBe('my.eff')
    })

    it('$3 propagates to next handler', () => {
      const result = dvala.run(`
        handle perform(@my.eff, 10)
        with [
          @my.eff -> $ + $3($2, $),
          @my.eff -> $ * 3
        ]
        end
      `)
      expect(result).toBe(40)
    })

    it('zero-param wildcard', () => {
      const result = dvala.run(`
        handle perform(@anything, "data")
        with [@* -> "caught: " ++ $]
        end
      `)
      expect(result).toBe('caught: data')
    })

    it('zero-param stored as value', () => {
      const result = dvala.run(`
        let h = @my.eff -> $ + 1;
        handle perform(@my.eff, 41) with [h] end
      `)
      expect(result).toBe(42)
    })
  })

  describe('shorthand with 2 params (arg, eff)', () => {
    it('second param is the effect reference', () => {
      const result = dvala.run(`
        handle perform(@my.eff, "hello")
        with [@my.eff(x, e) -> x ++ ":" ++ effect-name(e)]
        end
      `)
      expect(result).toBe('hello:my.eff')
    })

    it('wildcard with effect inspection', () => {
      const result = dvala.run(`
        handle perform(@my.custom.action, "data")
        with [@my.*(x, e) -> effect-name(e) ++ "=" ++ x]
        end
      `)
      expect(result).toBe('my.custom.action=data')
    })

    it('nxt is not accessible with 2 params', () => {
      const result = dvala.run(`
        let outer-nxt = "safe";
        handle perform(@my.eff, 1)
        with [@my.eff(x, e) -> outer-nxt]
        end
      `)
      expect(result).toBe('safe')
    })
  })

  describe('shorthand with 3 params (arg, eff, nxt)', () => {
    it('third param is the propagation function', () => {
      const result = dvala.run(`
        handle perform(@my.eff, 10)
        with [
          @my.eff(x, e, n) -> x + n(e, x),
          @my.eff(x) -> x * 5
        ]
        end
      `)
      expect(result).toBe(60)
    })

    it('middleware logging pattern', () => {
      const result = dvala.run(`
        handle perform(@my.eff, 21)
        with [
          @my.eff(x, e, n) -> do let r = n(e, x); r + 1 end,
          @my.eff(x) -> x * 2
        ]
        end
      `)
      expect(result).toBe(43)
    })

    it('transform and propagate with wildcard', () => {
      const result = dvala.run(`
        handle perform(@my.eff, 10)
        with [
          @*(x, e, n) -> n(e, x * 2),
          @my.eff(x) -> x + 1
        ]
        end
      `)
      expect(result).toBe(21)
    })

    it('all three params with named variables', () => {
      const result = dvala.run(`
        handle perform(@my.eff, "val")
        with [@my.eff(arg, eff, nxt) -> arg ++ ":" ++ effect-name(eff)]
        end
      `)
      expect(result).toBe('val:my.eff')
    })
  })

  describe('shorthand without array wrapper', () => {
    it('single shorthand handler without brackets', () => {
      const result = dvala.run(`
        handle perform(@my.eff, 21)
        with @my.eff(x) -> x * 2
        end
      `)
      expect(result).toBe(42)
    })

    it('zero-param shorthand without brackets', () => {
      const result = dvala.run(`
        handle perform(@my.eff, 10)
        with @my.eff -> $ + 5
        end
      `)
      expect(result).toBe(15)
    })

    it('wildcard shorthand without brackets', () => {
      const result = dvala.run(`
        handle perform(@any.thing, "x")
        with @*(msg) -> "got: " ++ msg
        end
      `)
      expect(result).toBe('got: x')
    })
  })

  describe('wildcard handler shorthand', () => {
    it('@dvala.* matches dvala.io.print', () => {
      const result = dvala.run(`
        handle perform(@dvala.io.print, "hi")
        with [@dvala.*(arg) -> "intercepted"]
        end
      `)
      expect(result).toBe('intercepted')
    })

    it('@dvala.* matches dvala.error', () => {
      const result = dvala.run(`
        handle 0 / 0
        with [@dvala.*(arg) -> "caught"]
        end
      `)
      expect(result).toBe('caught')
    })

    it('@dvala.* matches dvala.io.read', () => {
      const result = dvala.run(`
        handle perform(@dvala.io.read, null)
        with [@dvala.*(arg) -> "mocked"]
        end
      `)
      expect(result).toBe('mocked')
    })

    it('@dvala.* catches dvala.error from unhandled non-dvala effects', () => {
      // @my.custom is unhandled → produces @dvala.error → caught by @dvala.*
      const result = dvala.run(`
        handle perform(@my.custom, "data")
        with [@dvala.*(arg) -> "caught: " ++ arg]
        end
      `)
      expect(result).toBe("caught: Unhandled effect: 'my.custom'")
    })

    it('@dvala.io.* matches dvala.io.print but not dvala.error', () => {
      const result = dvala.run(`
        handle
          perform(@dvala.io.print, "hi")
        with [@dvala.io.*(arg) -> "io intercepted"]
        end
      `)
      expect(result).toBe('io intercepted')
    })

    it('@dvala.io.* does not match dvala.error', () => {
      expect(() => dvala.run(`
        handle 0 / 0
        with [@dvala.io.*(arg) -> "caught"]
        end
      `)).toThrow()
    })

    it('@* matches any effect', () => {
      const result = dvala.run(`
        handle perform(@anything.at.all, "data")
        with [@*(arg) -> "universal catch"]
        end
      `)
      expect(result).toBe('universal catch')
    })

    it('@* catches runtime errors via dvala.error', () => {
      const result = dvala.run(`
        handle 0 / 0
        with [@*(arg) -> "caught all"]
        end
      `)
      expect(result).toBe('caught all')
    })

    it('wildcard with multiple effects, first handler wins', () => {
      const result = dvala.run(`
        handle
          perform(@my.a, "A") ++ perform(@my.b, "B")
        with [@my.*(arg) -> lower-case(arg)]
        end
      `)
      expect(result).toBe('ab')
    })

    it('specific handler takes priority over wildcard in chain', () => {
      const result = dvala.run(`
        handle
          perform(@my.special, "data")
        with [
          @my.special(arg) -> "specific: " ++ arg,
          @my.*(arg) -> "wildcard: " ++ arg
        ]
        end
      `)
      expect(result).toBe('specific: data')
    })

    it('wildcard catches what specific handler misses', () => {
      const result = dvala.run(`
        handle
          perform(@my.other, "data")
        with [
          @my.special(arg) -> "specific: " ++ arg,
          @my.*(arg) -> "wildcard: " ++ arg
        ]
        end
      `)
      expect(result).toBe('wildcard: data')
    })

    it('deeply nested wildcard matching', () => {
      const result = dvala.run(`
        handle perform(@com.myorg.service.action, "deep")
        with [@com.myorg.*(arg) -> "org caught: " ++ arg]
        end
      `)
      expect(result).toBe('org caught: deep')
    })

    it('@dvala.* does not directly match dvala-extra (no dot boundary)', () => {
      // @dvala-extra doesn't match dvala.* (no dot boundary)
      // But the unhandled effect produces @dvala.error which IS matched by @dvala.*
      const result = dvala.run(`
        handle perform(@dvala-extra, "data")
        with [@dvala.*(arg) -> "caught: " ++ arg]
        end
      `)
      expect(result).toBe("caught: Unhandled effect: 'dvala-extra'")
    })

    it('@my.* does not catch non-my effects even via dvala.error', () => {
      // @other.eff is unhandled → @dvala.error → but @my.* doesn't match dvala.error
      expect(() => dvala.run(`
        handle perform(@other.eff, "data")
        with [@my.*(arg) -> "caught"]
        end
      `)).toThrow()
    })

    it('wildcard stored as value', () => {
      const result = dvala.run(`
        let silence-io = @dvala.io.*(arg) -> null;
        handle perform(@dvala.io.print, "hi")
        with [silence-io]
        end
      `)
      expect(result).toBe(null)
    })
  })
})

describe('effect pipe ||>', () => {
  describe('basic', () => {
    it('simple effect pipe', () => {
      const result = dvala.run(`
        perform(@my.eff, 21) ||> @my.eff(x) -> x * 2
      `)
      expect(result).toBe(42)
    })

    it('pipe with named handler', () => {
      const result = dvala.run(`
        let h = @my.eff(x) -> x + 1;
        perform(@my.eff, 41) ||> h
      `)
      expect(result).toBe(42)
    })

    it('pipe with handler list', () => {
      const result = dvala.run(`
        (perform(@a, 10) + perform(@b, 20)) ||> [@a(x) -> x * 2, @b(x) -> x * 3]
      `)
      expect(result).toBe(80)
    })

    it('pipe with full handler', () => {
      const result = dvala.run(`
        perform(@my.eff, 21) ||> (arg, eff, nxt) -> if eff == @my.eff then arg * 2 else nxt(eff, arg) end
      `)
      expect(result).toBe(42)
    })

    it('error catching with pipe', () => {
      const result = dvala.run(`
        (0 / 0) ||> @dvala.error(msg) -> "caught: " ++ msg
      `)
      expect(result).toBe('caught: Number is NaN')
    })

    it('pipe with let binding', () => {
      const result = dvala.run(`
        let x = perform(@my.eff, 10) ||> @my.eff(v) -> v * 5;
        x + 1
      `)
      expect(result).toBe(51)
    })

    it('no effect — value passes through', () => {
      const result = dvala.run(`
        42 ||> @my.eff(x) -> x * 2
      `)
      expect(result).toBe(42)
    })
  })

  describe('chaining', () => {
    it('chained named handlers', () => {
      const result = dvala.run(`
        let h1 = @my.eff(x) -> x * 2;
        let h2 = @my.eff(x) -> x + 1;
        perform(@my.eff, 10) ||> h1 ||> h2
      `)
      expect(result).toBe(20)
    })

    it('chained inline shorthands', () => {
      const result = dvala.run(`
        perform(@a, 10) ||> @a(x) -> x + perform(@b, x) ||> @b(x) -> x * 3
      `)
      expect(result).toBe(40)
    })

    it('three handlers chained', () => {
      const result = dvala.run(`
        let h1 = @a(x) -> x + 1;
        let h2 = @b(x) -> x * 2;
        let h3 = @c(x) -> x ++ "!";
        (perform(@a, 10) + perform(@b, 5)) ||> h1 ||> h2 ||> h3
      `)
      expect(result).toBe(21)
    })
  })

  describe('equivalence with handle...with', () => {
    it('pipe equals handle...with for single handler', () => {
      const pipe = dvala.run('perform(@my.eff, 21) ||> @my.eff(x) -> x * 2')
      const block = dvala.run('handle perform(@my.eff, 21) with @my.eff(x) -> x * 2 end')
      expect(pipe).toBe(block)
    })

    it('pipe with list equals handle...with list', () => {
      const pipe = dvala.run(`
        (perform(@a, 10) + perform(@b, 20)) ||> [@a(x) -> x * 2, @b(x) -> x * 3]
      `)
      const block = dvala.run(`
        handle
          perform(@a, 10) + perform(@b, 20)
        with [@a(x) -> x * 2, @b(x) -> x * 3]
        end
      `)
      expect(pipe).toBe(block)
    })

    it('chained pipe equals nested handle...with', () => {
      const pipe = dvala.run(`
        let h1 = @a(x) -> x * 2;
        let h2 = @b(x) -> x + 1;
        perform(@a, 10) ||> h1 ||> h2
      `)
      const block = dvala.run(`
        let h1 = @a(x) -> x * 2;
        let h2 = @b(x) -> x + 1;
        handle (handle perform(@a, 10) with h1 end) with h2 end
      `)
      expect(pipe).toBe(block)
    })

    it('error catching pipe equals handle...with', () => {
      const pipe = dvala.run('(0 / 0) ||> @dvala.error(msg) -> 0')
      const block = dvala.run('handle 0 / 0 with @dvala.error(msg) -> 0 end')
      expect(pipe).toBe(block)
    })

    it('reusable handler pipe equals handle...with', () => {
      const pipe = dvala.run(`
        let safe-div = @dvala.error(msg) -> 0;
        (0 / 0) ||> safe-div
      `)
      const block = dvala.run(`
        let safe-div = @dvala.error(msg) -> 0;
        handle 0 / 0 with safe-div end
      `)
      expect(pipe).toBe(block)
    })

    it('middleware chaining pipe equals nested handle...with', () => {
      const pipe = dvala.run(`
        let auth = @auth.check(x) -> "user1";
        let db = @db.get(x) -> "data:" ++ x;
        let logger = (arg, eff, nxt) -> do let r = nxt(eff, arg); r end;
        perform(@db.get, "key") ||> logger ||> auth ||> db
      `)
      const block = dvala.run(`
        let auth = @auth.check(x) -> "user1";
        let db = @db.get(x) -> "data:" ++ x;
        let logger = (arg, eff, nxt) -> do let r = nxt(eff, arg); r end;
        handle (handle (handle perform(@db.get, "key") with logger end) with auth end) with db end
      `)
      expect(pipe).toBe(block)
    })

    it('inline shorthand chaining parses correctly without parens', () => {
      const withoutParens = dvala.run(`
        perform(@a, 10) ||> @a(x) -> x + perform(@b, x) ||> @b(x) -> x * 3
      `)
      const withParens = dvala.run(`
        (perform(@a, 10) ||> @a(x) -> x + perform(@b, x)) ||> @b(x) -> x * 3
      `)
      expect(withoutParens).toBe(withParens)
    })
  })

  describe('precedence', () => {
    it('||> has lower precedence than |>', () => {
      const result = dvala.run(`
        21 |> (x) -> perform(@my.eff, x) ||> @my.eff(x) -> x * 2
      `)
      expect(result).toBe(42)
    })

    it('||> has lower precedence than arithmetic', () => {
      const result = dvala.run(`
        (1 + perform(@my.eff, 20)) ||> @my.eff(x) -> x * 2
      `)
      expect(result).toBe(41)
    })
  })
})
