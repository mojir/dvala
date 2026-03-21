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
      expect(dvala.run('handle 1 + 2 + 3 with [(eff, arg, nxt) -> nxt(eff, arg)] end')).toBe(6)
    })

    it('should handle a single effect with a single handler', () => {
      const result = dvala.run(`do
        let h = (eff, arg, nxt) ->
          if eff == @my.eff then arg + 1
          else nxt(eff, arg)
          end;
        handle perform(@my.eff, 42) with [h] end
      end`)
      expect(result).toBe(43)
    })

    it('should handle multiple effects in the body', () => {
      const result = dvala.run(`do
        let h = (eff, arg, nxt) ->
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
        let h1 = (eff, arg, nxt) ->
          if eff == @my.a then "a:" ++ arg
          else nxt(eff, arg)
          end;
        let h2 = (eff, arg, nxt) ->
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
        let h = (eff, arg, nxt) ->
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
          with [(eff, arg, nxt) -> nxt(eff, arg)]
          end
        with [(eff, arg, nxt) -> if eff == @my.inner then "outer:" ++ arg else nxt(eff, arg) end]
        end
      `)
      expect(result).toBe('outer:hello')
    })

    it('should allow handler to transform downstream result', () => {
      const result = dvala.run(`do
        let logger = (eff, arg, nxt) -> do
          let result = nxt(eff, arg);
          "logged:" ++ str(result)
        end;
        let handler = (eff, arg, nxt) ->
          if eff == @my.eff then arg * 2
          else nxt(eff, arg)
          end;
        handle perform(@my.eff, 21) with [logger, handler] end
      end`)
      expect(result).toBe('logged:42')
    })

    it('should allow next to modify the effect before forwarding', () => {
      const result = dvala.run(`do
        let aliaser = (eff, arg, nxt) ->
          if eff == @old.name then nxt(@new.name, arg)
          else nxt(eff, arg)
          end;
        let handler = (eff, arg, nxt) ->
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
        let h-outer = (eff, arg, nxt) ->
          if eff == @my.outer then "outer:" ++ arg
          else nxt(eff, arg)
          end;
        let h-inner = (eff, arg, nxt) ->
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
        with [(eff, arg, nxt) ->
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
        with [(eff, arg, nxt) ->
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
        with [(eff, arg, nxt) ->
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
        with [(eff, arg, nxt) -> if eff == @my.eff then arg else nxt(eff, arg) end]
        end
      `)).toThrow('boom')
    })

    it('nested handlers both passing @dvala.error via nxt should throw', () => {
      expect(() => dvala.run(`
        handle
          handle
            perform(@dvala.error, "boom")
          with [(eff, arg, nxt) -> nxt(eff, arg)]
          end
        with [(eff, arg, nxt) -> nxt(eff, arg)]
        end
      `)).toThrow('boom')
    })

    it('runtime error with no @dvala.error handler should throw', () => {
      expect(() => dvala.run(`
        handle
          0 / 0
        with [(eff, arg, nxt) -> if eff == @my.eff then arg else nxt(eff, arg) end]
        end
      `)).toThrow()
    })

    it('unhandled effect error caught by @dvala.error handler', () => {
      const result = dvala.run(`
        handle
          perform(@no.handler, "data")
        with [(eff, arg, nxt) -> if eff == @dvala.error then "caught: " ++ arg else nxt(eff, arg) end]
        end
      `)
      expect(result).toBe('caught: Unhandled effect: \'no.handler\'')
    })

    it('inner handler catches @dvala.error, outer never reached', () => {
      const result = dvala.run(`
        handle
          handle
            perform(@dvala.error, "boom")
          with [(eff, arg, nxt) -> if eff == @dvala.error then "inner: " ++ arg else nxt(eff, arg) end]
          end
        with [(eff, arg, nxt) -> if eff == @dvala.error then "outer: " ++ arg else nxt(eff, arg) end]
        end
      `)
      expect(result).toBe('inner: boom')
    })

    it('inner passes @dvala.error via nxt, outer catches it', () => {
      const result = dvala.run(`
        handle
          handle
            perform(@dvala.error, "boom")
          with [(eff, arg, nxt) -> nxt(eff, arg)]
          end
        with [(eff, arg, nxt) -> if eff == @dvala.error then "outer: " ++ arg else nxt(eff, arg) end]
        end
      `)
      expect(result).toBe('outer: boom')
    })

    it('runtime error in handler body propagates past own scope', () => {
      const result = dvala.run(`
        handle
          handle
            perform(@my.eff, "data")
          with [(eff, arg, nxt) -> if eff == @my.eff then 0 / 0 else nxt(eff, arg) end]
          end
        with [(eff, arg, nxt) -> if eff == @dvala.error then "outer caught" else nxt(eff, arg) end]
        end
      `)
      expect(result).toBe('outer caught')
    })

    it('nested HandleWith: inner skipped, outer catches @dvala.error', () => {
      const result = dvala.run(`
        handle
          handle
            0 / 0
          with [(eff, arg, nxt) -> if eff == @my.eff then arg else nxt(eff, arg) end]
          end
        with [(eff, arg, nxt) -> if eff == @dvala.error then "caught" else nxt(eff, arg) end]
        end
      `)
      expect(result).toBe('caught')
    })

    it('non-matching handler and no outer handler should throw', () => {
      expect(() => dvala.run(`
        handle
          0 / 0
        with [(eff, arg, nxt) -> if eff == @my.eff then arg else nxt(eff, arg) end]
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
        with [(eff, arg, nxt) -> if eff == @dvala.error then "local caught" else nxt(eff, arg) end]
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
          perform(@dvala.io.println, "hi")
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
          (eff, arg, nxt) -> if eff == @b then arg * 3 else nxt(eff, arg) end
        ]
        end
      `)
      expect(result).toBe(80)
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

  describe('wildcard handler shorthand', () => {
    it('@dvala.* matches dvala.io.println', () => {
      const result = dvala.run(`
        handle perform(@dvala.io.println, "hi")
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

    it('@dvala.* matches dvala.io.read-line', () => {
      const result = dvala.run(`
        handle perform(@dvala.io.read-line, null)
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

    it('@dvala.io.* matches dvala.io.println but not dvala.error', () => {
      const result = dvala.run(`
        handle
          perform(@dvala.io.println, "hi")
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
        handle perform(@dvala.io.println, "hi")
        with [silence-io]
        end
      `)
      expect(result).toBe(null)
    })
  })
})
