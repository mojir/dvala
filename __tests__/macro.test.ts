import { describe, expect, it } from 'vitest'
import { createDvala } from '../src/createDvala'

const dvala = createDvala()
const run = (code: string) => dvala.run(code)

describe('macro system', () => {
  describe('macro definition', () => {
    it('should parse macro keyword', () => {
      expect(() => run('macro (ast) -> ast')).not.toThrow()
    })

    it('should return "macro" for typeOf', () => {
      expect(run('typeOf(macro (ast) -> ast)')).toBe('macro')
    })

    it('should return true for isMacro', () => {
      expect(run('isMacro(macro (ast) -> ast)')).toBe(true)
    })

    it('should return false for isFunction', () => {
      expect(run('isFunction(macro (ast) -> ast)')).toBe(false)
    })

    it('should be assignable to a variable', () => {
      expect(run('let m = macro (ast) -> ast; isMacro(m)')).toBe(true)
    })
  })

  describe('macro invocation', () => {
    it('should pass argument as AST and evaluate the result', () => {
      // The macro receives the AST of `42` and returns it unchanged
      // The evaluator then evaluates the returned AST → 42
      expect(run('let id = macro (ast) -> ast; id(42)')).toBe(42)
    })

    it('should pass expression AST unevaluated', () => {
      // The macro receives AST of `1 + 2`, not the value 3
      // Returns it unchanged, evaluator evaluates → 3
      expect(run('let id = macro (ast) -> ast; id(1 + 2)')).toBe(3)
    })

    it('should pass let expression as AST', () => {
      expect(run('let id = macro (ast) -> ast; id(let x = 42); x')).toBe(42)
    })

    it('should receive AST that is an array', () => {
      // The macro body checks typeOf on its argument — which is an AST node (array)
      expect(run('let check = macro (ast) -> do let t = typeOf(ast); ["Str", t, 0] end; check(42)')).toBe('array')
    })

    it('should work with multiple arguments', () => {
      // Macro receives two AST nodes
      expect(run('let pick = macro (a, b) -> a; pick(1, 2)')).toBe(1)
    })
  })
})
