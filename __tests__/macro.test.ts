import { describe, expect, it } from 'vitest'
import { createDvala } from '../src/createDvala'
import { astModule } from '../src/builtin/modules/ast'

const dvala = createDvala({ modules: [astModule] })
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

  describe('qualified name', () => {
    it('should parse macro with qualified name', () => {
      expect(() => run('macro@mylib.id (ast) -> ast')).not.toThrow()
    })

    it('should return qualified name via qualifiedName()', () => {
      expect(run('let m = macro@mylib.id (ast) -> ast; qualifiedName(m)')).toBe('mylib.id')
    })

    it('should return null for anonymous macro', () => {
      expect(run('let m = macro (ast) -> ast; qualifiedName(m)')).toBeNull()
    })

    it('should return effect name via qualifiedName()', () => {
      expect(run('qualifiedName(@dvala.io.print)')).toBe('dvala.io.print')
    })

    it('should return null for non-qualified values', () => {
      expect(run('qualifiedName(42)')).toBeNull()
      expect(run('qualifiedName("hello")')).toBeNull()
      expect(run('qualifiedName((x) -> x)')).toBeNull()
    })

    it('should still be a macro with qualified name', () => {
      expect(run('isMacro(macro@mylib.id (ast) -> ast)')).toBe(true)
      expect(run('typeOf(macro@mylib.id (ast) -> ast)')).toBe('macro')
    })

    it('should invoke correctly with qualified name', () => {
      expect(run('let id = macro@mylib.id (ast) -> ast; id(1 + 2)')).toBe(3)
    })

    it('should emit @dvala.macro.expand for named macros', () => {
      // Named macros emit the effect — a handler can intercept it.
      // The handler returns an AST node that gets evaluated in the calling scope.
      const result = run(`
        let id = macro@mylib.id (ast) -> ast;
        handle
          id(42)
        with [(arg, eff, nxt) ->
          if eff == @dvala.macro.expand then ["Num", 99999, 0]
          else nxt(eff, arg)
          end
        ] end
      `)
      // Handler returned AST for 99999, which gets evaluated → 99999
      expect(result).toBe(99999)
    })
  })

  describe('macroexpand', () => {
    it('should return expanded AST without evaluating it', () => {
      const result = run(`
        let double = macro (ast) -> \`\`\`\${ast} + \${ast}\`\`\`;
        macroexpand(double, \`\`\`21\`\`\`)
      `)
      // Should return AST data, not the evaluated result 42
      expect(Array.isArray(result)).toBe(true)
      const arr = result as unknown[]
      expect(arr[0]).toBe('Call')
    })

    it('should produce AST that prettyPrints correctly', () => {
      const result = dvala.run(`
        let { prettyPrint } = import(ast);
        let double = macro (ast) -> \`\`\`\${ast} + \${ast}\`\`\`;
        macroexpand(double, \`\`\`21\`\`\`) |> prettyPrint
      `)
      expect(result).toBe('21 + 21')
    })

    it('should throw if first argument is not a macro', () => {
      expect(() => run('macroexpand((x) -> x, 1)')).toThrow('macroexpand: first argument must be a macro')
    })

    it('should work with multi-arg macros', () => {
      const result = run(`
        let pick = macro (a, b) -> a;
        macroexpand(pick, \`\`\`1\`\`\`, \`\`\`2\`\`\`)
      `)
      expect(result).toEqual(['Num', 1, 0])
    })
  })

  describe('anonymous macros and @dvala.macro.expand', () => {
    it('should not emit @dvala.macro.expand for anonymous macros', () => {
      // Anonymous macros bypass the effect system entirely.
      // A handle...with block for @dvala.macro.expand should NOT intercept them.
      const result = run(`
        let id = macro (ast) -> ast;
        handle
          id(42)
        with [(arg, eff, nxt) ->
          if eff == @dvala.macro.expand then 99999
          else nxt(eff, arg)
          end
        ] end
      `)
      // Should be 42 (direct call), not 99999 (intercepted)
      expect(result).toBe(42)
    })

    it('should work inside handle...with blocks without being intercepted', () => {
      // Anonymous macros inside effect handling blocks should expand normally
      const result = run(`
        let double = macro (ast) -> do
          let node = ast;
          ["Call", [["Builtin", "+", 0], [node, node]], 0]
        end;
        handle
          double(21)
        with [(arg, eff, nxt) -> nxt(eff, arg)] end
      `)
      expect(result).toBe(42)
    })
  })

  describe('macro shadowing builtins', () => {
    it('should allow a macro to shadow a builtin name', () => {
      // `assert` is a builtin — shadowing it with a macro should work
      const result = run(`
        let assert = macro (cond) -> cond;
        assert(1 + 2)
      `)
      expect(result).toBe(3)
    })

    it('should invoke the macro, not the builtin, when shadowed', () => {
      // The builtin `assert` throws on falsy values, but the macro should
      // intercept the call and return the AST evaluation result instead.
      const result = run(`
        let { prettyPrint } = import(ast);
        let assert = macro (cond) ->
          \`\`\`if \${cond} then "pass" else "fail" end\`\`\`;
        assert(1 > 5)
      `)
      expect(result).toBe('fail')
    })

    it('should work with other shadowed builtins like count or str', () => {
      const result = run(`
        let str = macro (ast) -> ["Str", "intercepted", 0];
        str(anything)
      `)
      expect(result).toBe('intercepted')
    })
  })

  describe('error source position in macro-expanded code', () => {
    // Debug mode is needed to capture source positions
    const debugDvala = createDvala({ modules: [astModule], debug: true })
    const runDebug = (code: string) => debugDvala.run(code)

    it('should point errors to the macro call site, not internal code', () => {
      try {
        runDebug(`let myError = -> perform(@dvala.error, $);
let myAssert = macro (cond) ->
  \`\`\`if \${cond} then true else myError("fail") end\`\`\`;
myAssert(1 > 5)`)
        expect.unreachable('should have thrown')
      } catch (e: unknown) {
        const err = e as { sourceCodeInfo?: { position: { line: number; column: number } } }
        // Error should point to the myAssert(...) call on line 4, not myError definition on line 1
        expect(err.sourceCodeInfo).toBeDefined()
        expect(err.sourceCodeInfo!.position.line).toBe(4)
      }
    })

    it('should preserve source position for errors with existing location', () => {
      // Non-macro error should keep its original location
      try {
        runDebug('1 + "x"')
        expect.unreachable('should have thrown')
      } catch (e: unknown) {
        const err = e as { sourceCodeInfo?: { position: { line: number } } }
        expect(err.sourceCodeInfo).toBeDefined()
        expect(err.sourceCodeInfo!.position.line).toBe(1)
      }
    })
  })
})
