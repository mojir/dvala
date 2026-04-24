import { describe, expect, it } from 'vitest'
import { createDvala } from '../src/createDvala'
import { astModule } from '../src/builtin/modules/ast'

const dvala = createDvala({ modules: [astModule] })
const run = (code: string) => dvala.run(code)

describe('quote...end code templates', () => {
  describe('basic syntax', () => {
    it('should parse a simple quote', () => {
      // A quote returns AST data, not an evaluated value
      const result = run('quote 42 end')
      // Should be an AST node: ["Num", 42, -1]
      expect(result).toEqual(['Num', 42, -1])
    })

    it('should parse a string literal template', () => {
      const result = run('quote "hello" end')
      expect(result).toEqual(['Str', 'hello', -1])
    })

    it('should parse a symbol reference template', () => {
      const result = run('quote x end')
      expect(result).toEqual(['Sym', 'x', -1])
    })

    it('should parse a boolean template', () => {
      expect(run('quote true end')).toEqual(['Reserved', 'true', -1])
    })

    it('should parse a binary expression template', () => {
      const result = run('quote 1 + 2 end')
      // Should be a Call node: ["Call", [["Builtin", "+", ...], [["Num", 1, ...], ["Num", 2, ...]]], ...]
      expect(Array.isArray(result)).toBe(true)
      const arr = result as unknown[]
      expect(arr[0]).toBe('Call')
    })
  })

  describe('splice interpolation ($^{})', () => {
    it('should splice a simple expression', () => {
      // $^{expr} evaluates expr and inserts the result into the AST
      const result = run('let node = ["Num", 99, -1]; quote $^{node} end')
      // The splice inserts the value of `node` directly
      expect(result).toEqual(['Num', 99, -1])
    })

    it('should splice into a larger expression', () => {
      const result = run(`
        let a = ["Num", 1, -1];
        let b = ["Num", 2, -1];
        quote $^{a} + $^{b} end
      `)
      // Should produce: ["Call", [["Builtin", "+", -1], [["Num", 1, -1], ["Num", 2, -1]]], -1]
      const arr = result as unknown[]
      expect(arr[0]).toBe('Call')
      const payload = arr[1] as unknown[]
      const args = payload[1] as unknown[][]
      expect(args[0]).toEqual(['Num', 1, -1])
      expect(args[1]).toEqual(['Num', 2, -1])
    })

    it('should evaluate splice expressions in the current scope', () => {
      const result = run('let x = 42; quote $^{["Num", x, -1]} end')
      expect(result).toEqual(['Num', 42, -1])
    })
  })

  describe('multi-statement templates', () => {
    it('should handle templates with multiple statements', () => {
      // Multiple statements in a template produce an array of AST nodes
      const result = run('quote let x = 1; x + 1 end')
      expect(Array.isArray(result)).toBe(true)
      const arr = result as unknown[]
      // Should be an array of two AST nodes
      expect(arr.length).toBe(2)
    })
  })

  describe('macro integration', () => {
    it('should use quote in a macro to construct AST', () => {
      // A macro that doubles its argument: x + x
      const result = run(`
        let double = macro (ast) -> quote $^{ast} + $^{ast} end;
        double(21)
      `)
      expect(result).toBe(42)
    })

    it('should use quote to construct if expression', () => {
      const result = run(`
        let unless = macro (cond, body) -> quote if !($^{cond}) then $^{body} else null end end;
        unless(false, 42)
      `)
      expect(result).toBe(42)
    })

    it('should return null for unless with true condition', () => {
      const result = run(`
        let unless = macro (cond, body) -> quote if !($^{cond}) then $^{body} else null end end;
        unless(true, 42)
      `)
      expect(result).toBeNull()
    })
  })

  describe('implicit spread', () => {
    it('should spread an array of AST nodes into function arguments', () => {
      // When $^{expr} evaluates to an array of AST nodes, they spread into the parent
      const result = run(`
        let args = [["Num", 1, -1], ["Num", 2, -1]];
        quote +($^{args}) end
      `)
      // Should produce: ["Call", [["Builtin", "+", -1], [["Num", 1, -1], ["Num", 2, -1]]], -1]
      const arr = result as unknown[]
      expect(arr[0]).toBe('Call')
      const payload = arr[1] as unknown[]
      const fnArgs = payload[1] as unknown[][]
      expect(fnArgs).toEqual([['Num', 1, -1], ['Num', 2, -1]])
    })

    it('should not spread a single AST node', () => {
      // A single AST node (starts with string) is inserted as-is, not spread
      const result = run(`
        let node = ["Num", 42, -1];
        quote $^{node} end
      `)
      expect(result).toEqual(['Num', 42, -1])
    })

    it('should spread nodes in a block context', () => {
      // A macro that wraps statements in a do...end block
      const result = run(`
        let stmts = [["Num", 1, -1], ["Num", 42, -1]];
        let block = quote do $^{stmts} end end;
        block
      `)
      // block should be a Block node containing the spread statements
      const arr = result as unknown[]
      expect(arr[0]).toBe('Block')
      const body = arr[1] as unknown[][]
      expect(body.length).toBe(2)
      expect(body[0]).toEqual(['Num', 1, -1])
      expect(body[1]).toEqual(['Num', 42, -1])
    })
  })

  describe('hygiene', () => {
    it('should not capture caller variables with same name as macro internals', () => {
      const result = run(`
        let makeAdder = macro (ast) -> quote (n) -> n + $^{ast} end;
        let n = 100;
        let f = makeAdder(n);
        f(1)
      `)
      // Should be 101 (1 + 100), not 2 (1 + 1)
      expect(result).toBe(101)
    })

    it('should gensym let bindings in templates', () => {
      const result = run(`
        let wrap = macro (ast) -> quote do let tmp = $^{ast}; tmp * 2 end end;
        let tmp = 5;
        wrap(tmp + 1)
      `)
      // tmp + 1 = 6, then 6 * 2 = 12
      expect(result).toBe(12)
    })

    it('should preserve spliced symbol identity', () => {
      const result = run(`
        let id = macro (ast) -> quote $^{ast} end;
        let x = 42;
        id(x)
      `)
      expect(result).toBe(42)
    })

    it('should handle multiple bindings independently', () => {
      const result = run(`
        let compute = macro (ast) -> quote do let a = $^{ast}; let b = a + 1; a + b end end;
        let a = 100;
        let b = 200;
        compute(a + b)
      `)
      // a = 100 + 200 = 300 (gensymed), b = 301 (gensymed), result = 300 + 301 = 601
      expect(result).toBe(601)
    })
  })

  describe('nested quotes (deferred splices)', () => {
    it('should support macro generating macro with $^^{}', () => {
      const result = run(`
        let makeApplier = macro (fn) ->
          quote
            macro (ast) -> quote $^^{fn}($^{ast}) end
          end;
        let doubleIt = makeApplier((x) -> x * 2);
        doubleIt(21)
      `)
      expect(result).toBe(42)
    })

    it('should support macro generating macro with different operations', () => {
      const result = run(`
        let makeBinOp = macro (op) ->
          quote
            macro (ast) -> quote $^{ast} $^^{op} $^{ast} end
          end;
        let square = makeBinOp(*);
        square(7)
      `)
      expect(result).toBe(49)
    })

    it('should error on splice level exceeding quote depth', () => {
      expect(() => run('quote $^^{x} end')).toThrow(/Splice level 2 but only 1 quote level/)
    })
  })
})
