import { describe, expect, it } from 'vitest'
import { createDvala } from '../src/createDvala'

const dvala = createDvala()
const run = (code: string) => dvala.run(code)

describe('code templates', () => {
  describe('basic code template syntax', () => {
    it('should parse a simple code template', () => {
      // A code template returns AST data, not an evaluated value
      const result = run('```42```')
      // Should be an AST node: ["Num", 42, 0]
      expect(result).toEqual(['Num', 42, 0])
    })

    it('should parse a string literal template', () => {
      const result = run('```"hello"```')
      expect(result).toEqual(['Str', 'hello', 0])
    })

    it('should parse a symbol reference template', () => {
      const result = run('```x```')
      expect(result).toEqual(['Sym', 'x', 0])
    })

    it('should parse a boolean template', () => {
      expect(run('```true```')).toEqual(['Reserved', 'true', 0])
    })

    it('should parse a binary expression template', () => {
      const result = run('```1 + 2```')
      // Should be a Call node: ["Call", [["Builtin", "+", ...], [["Num", 1, ...], ["Num", 2, ...]]], ...]
      expect(Array.isArray(result)).toBe(true)
      const arr = result as unknown[]
      expect(arr[0]).toBe('Call')
    })
  })

  describe('splice interpolation', () => {
    it('should splice a simple expression', () => {
      // ${expr} evaluates expr and inserts the result into the AST
      const result = run('let node = ["Num", 99, 0]; ```${node}```')
      // The splice inserts the value of `node` directly
      expect(result).toEqual(['Num', 99, 0])
    })

    it('should splice into a larger expression', () => {
      const result = run(`
        let a = ["Num", 1, 0];
        let b = ["Num", 2, 0];
        \`\`\`\${a} + \${b}\`\`\`
      `)
      // Should produce: ["Call", [["Builtin", "+", 0], [["Num", 1, 0], ["Num", 2, 0]]], 0]
      const arr = result as unknown[]
      expect(arr[0]).toBe('Call')
      const payload = arr[1] as unknown[]
      const args = payload[1] as unknown[][]
      expect(args[0]).toEqual(['Num', 1, 0])
      expect(args[1]).toEqual(['Num', 2, 0])
    })

    it('should evaluate splice expressions in the current scope', () => {
      const result = run('let x = 42; ```${["Num", x, 0]}```')
      expect(result).toEqual(['Num', 42, 0])
    })
  })

  describe('multi-statement templates', () => {
    it('should handle templates with multiple statements', () => {
      // Multiple statements in a template produce an array of AST nodes
      const result = run('```let x = 1; x + 1```')
      expect(Array.isArray(result)).toBe(true)
      const arr = result as unknown[]
      // Should be an array of two AST nodes
      expect(arr.length).toBe(2)
    })
  })

  describe('macro integration', () => {
    it('should use code template in a macro to construct AST', () => {
      // A macro that doubles its argument: x + x
      const result = run(`
        let double = macro (ast) -> \`\`\`\${ast} + \${ast}\`\`\`;
        double(21)
      `)
      expect(result).toBe(42)
    })

    it('should use code template to construct if expression', () => {
      const result = run(`
        let unless = macro (cond, body) -> \`\`\`if not(\${cond}) then \${body} else null end\`\`\`;
        unless(false, 42)
      `)
      expect(result).toBe(42)
    })

    it('should return null for unless with true condition', () => {
      const result = run(`
        let unless = macro (cond, body) -> \`\`\`if not(\${cond}) then \${body} else null end\`\`\`;
        unless(true, 42)
      `)
      expect(result).toBeNull()
    })
  })

  describe('implicit spread', () => {
    it('should spread an array of AST nodes into function arguments', () => {
      // When ${expr} evaluates to an array of AST nodes, they spread into the parent
      const result = run(`
        let args = [["Num", 1, 0], ["Num", 2, 0]];
        \`\`\`+(\${args})\`\`\`
      `)
      // Should produce: ["Call", [["Builtin", "+", 0], [["Num", 1, 0], ["Num", 2, 0]]], 0]
      const arr = result as unknown[]
      expect(arr[0]).toBe('Call')
      const payload = arr[1] as unknown[]
      const fnArgs = payload[1] as unknown[][]
      expect(fnArgs).toEqual([['Num', 1, 0], ['Num', 2, 0]])
    })

    it('should not spread a single AST node', () => {
      // A single AST node (starts with string) is inserted as-is, not spread
      const result = run(`
        let node = ["Num", 42, 0];
        \`\`\`\${node}\`\`\`
      `)
      expect(result).toEqual(['Num', 42, 0])
    })

    it('should spread nodes in a block context', () => {
      // A macro that wraps statements in a do...end block
      const result = run(`
        let stmts = [["Num", 1, 0], ["Num", 42, 0]];
        let block = \`\`\`do \${stmts} end\`\`\`;
        block
      `)
      // block should be a Block node containing the spread statements
      const arr = result as unknown[]
      expect(arr[0]).toBe('Block')
      const body = arr[1] as unknown[][]
      expect(body.length).toBe(2)
      expect(body[0]).toEqual(['Num', 1, 0])
      expect(body[1]).toEqual(['Num', 42, 0])
    })
  })

  describe('hygiene', () => {
    it('should not capture caller variables with same name as macro internals', () => {
      // The macro introduces a param `n` that would shadow the caller's `n`
      // Without hygiene: (n) -> n + <caller's n> — param `n` shadows splice
      // With hygiene: (__gensym_n_X__) -> __gensym_n_X__ + <caller's n> — no collision
      const result = run(`
        let makeAdder = macro (ast) -> \`\`\`(n) -> n + \${ast}\`\`\`;
        let n = 100;
        let f = makeAdder(n);
        f(1)
      `)
      // Should be 101 (1 + 100), not 2 (1 + 1)
      expect(result).toBe(101)
    })

    it('should gensym let bindings in templates', () => {
      // The macro's `tmp` should not collide with the caller's `tmp`
      const result = run(`
        let wrap = macro (ast) -> \`\`\`do let tmp = \${ast}; tmp * 2 end\`\`\`;
        let tmp = 5;
        wrap(tmp + 1)
      `)
      // tmp + 1 = 6, then 6 * 2 = 12
      expect(result).toBe(12)
    })

    it('should preserve spliced symbol identity', () => {
      // Spliced AST should keep the caller's names, not be renamed
      const result = run(`
        let id = macro (ast) -> \`\`\`\${ast}\`\`\`;
        let x = 42;
        id(x)
      `)
      expect(result).toBe(42)
    })

    it('should handle multiple bindings independently', () => {
      const result = run(`
        let compute = macro (ast) -> \`\`\`do let a = \${ast}; let b = a + 1; a + b end\`\`\`;
        let a = 100;
        let b = 200;
        compute(a + b)
      `)
      // a = 100 + 200 = 300 (gensymed), b = 301 (gensymed), result = 300 + 301 = 601
      expect(result).toBe(601)
    })
  })

  describe('N-backtick nesting', () => {
    it('should support 4-backtick delimiters', () => {
      const result = run('````42````')
      expect(result).toEqual(['Num', 42, 0])
    })

    it('should support 5-backtick delimiters', () => {
      const result = run('`````42`````')
      expect(result).toEqual(['Num', 42, 0])
    })
  })
})
