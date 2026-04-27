import { describe, expect, it } from 'vitest'
import { createDvala } from '../src/createDvala'
import { astModule } from '../src/builtin/modules/ast'
import { handlerModule } from '../src/builtin/modules/effectHandler'
import { MAX_MACRO_EXPANSION_DEPTH } from '../src/constants/constants'

const dvala = createDvala({ modules: [astModule, handlerModule] })
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
  })

  describe('macroexpand', () => {
    it('should return expanded AST without evaluating it', () => {
      const result = run(`
        let double = macro (ast) -> quote $^{ast} + $^{ast} end;
        macroexpand(double, quote 21 end)
      `)
      // Should return AST data, not the evaluated result 42
      expect(Array.isArray(result)).toBe(true)
      const arr = result as unknown[]
      expect(arr[0]).toBe('Call')
    })

    it('should produce AST that prettyPrints correctly', () => {
      const result = dvala.run(`
        let { prettyPrint } = import("ast");
        let double = macro (ast) -> quote $^{ast} + $^{ast} end;
        macroexpand(double, quote 21 end) |> prettyPrint
      `)
      expect(result).toBe('21 + 21')
    })

    it('should throw if first argument is not a macro', () => {
      expect(() => run('macroexpand((x) -> x, 1)')).toThrow('macroexpand: first argument must be a macro')
    })

    it('should work with multi-arg macros', () => {
      const result = run(`
        let pick = macro (a, b) -> a;
        macroexpand(pick, quote 1 end, quote 2 end)
      `)
      expect(result).toEqual(['Num', 1, -1])
    })
  })

  describe('macros inside handler blocks', () => {
    it('should work inside handler blocks without interference', () => {
      // Anonymous macros inside effect handling blocks should expand normally
      const result = run(`
        let double = macro (ast) -> do
          let node = ast;
          ["Call", [["Builtin", "+", 0], [node, node]], 0]
        end;
        do
          with handler @other.eff(arg) -> resume(arg) end;
          double(21)
        end
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
        let { prettyPrint } = import("ast");
        let assert = macro (cond) ->
          quote if $^{cond} then "pass" else "fail" end end;
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
  quote if $^{cond} then true else myError("fail") end end;
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

  describe('expansion depth limit', () => {
    it('should throw when macro expansion exceeds depth limit', () => {
      // Macro that calls itself — infinite expansion
      expect(() =>
        run(`
        let inf = macro (ast) -> inf(ast);
        inf(1)
      `),
      ).toThrow(`Maximum macro expansion depth (${MAX_MACRO_EXPANSION_DEPTH}) exceeded`)
    })

    it('should throw for mutually recursive macros', () => {
      // Two macros calling each other — infinite expansion
      expect(() =>
        run(`
        let a = macro (ast) -> b(ast);
        let b = macro (ast) -> a(ast);
        a(1)
      `),
      ).toThrow(`Maximum macro expansion depth (${MAX_MACRO_EXPANSION_DEPTH}) exceeded`)
    })

    it('should propagate original error message through handler', () => {
      // When a macro expansion fails and an error handler catches it,
      // the handler should receive the original error message — not a
      // secondary "M-node cannot be evaluated" error.
      expect(
        run(`
        let inf = macro (ast) -> inf(ast);
        do with handler @dvala.error(err) -> resume(err.message) end; inf(1) end
      `),
      ).toContain('Maximum macro expansion depth')
    })

    it('should return handler value when macro expansion error is caught by fallback', () => {
      expect(
        run(`
        let { fallback } = import("effectHandler");
        let inf = macro (ast) -> inf(ast);
        fallback("default")(-> inf(1))
      `),
      ).toBe('default')
    })

    it('should allow legitimate nested macro expansion', () => {
      // Macro that expands to code containing another macro call — two levels deep
      expect(
        run(`
        let addOne = macro (ast) -> quote $^{ast} + 1 end;
        let addTwo = macro (ast) -> quote addOne(addOne($^{ast})) end;
        addTwo(10)
      `),
      ).toBe(12)
    })
  })

  describe('binding-position splice', () => {
    it('should splice a simple name into let binding', () => {
      expect(
        run(`
        let defConst = macro (n, v) -> quote let $^{n} = $^{v} end;
        defConst(myVar, 42);
        myVar
      `),
      ).toBe(42)
    })

    it('should splice an array destructuring pattern', () => {
      expect(
        run(`
        let defConst = macro (n, v) -> quote let $^{n} = $^{v} end;
        defConst([a, b], [1, 2]);
        a + b
      `),
      ).toBe(3)
    })

    it('should splice an object destructuring pattern', () => {
      expect(
        run(`
        let defConst = macro (n, v) -> quote let $^{n} = $^{v} end;
        defConst({ x: x, y: y }, { x: 10, y: 20 });
        x + y
      `),
      ).toBe(30)
    })

    it('should splice nested destructuring', () => {
      expect(
        run(`
        let defConst = macro (n, v) -> quote let $^{n} = $^{v} end;
        defConst([a, [b, c]], [1, [2, 3]]);
        a + b + c
      `),
      ).toBe(6)
    })

    it('should splice rest element in array pattern', () => {
      expect(
        run(`
        let defConst = macro (n, v) -> quote let $^{n} = $^{v} end;
        defConst([head, ...tail], [1, 2, 3]);
        tail
      `),
      ).toEqual([2, 3])
    })
  })
})
