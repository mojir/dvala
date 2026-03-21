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
})
