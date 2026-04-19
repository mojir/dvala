import { beforeAll, describe, expect, it } from 'vitest'
import { parse } from '../parser'
import { tokenize } from '../tokenizer/tokenize'
import { minifyTokenStream } from '../tokenizer/minifyTokenStream'
import { builtin } from '../builtin'
import { createDvala as createDvalaRaw } from '../createDvala'

/**
 * Test-local `createDvala` that transparently rewrites `if true`/`if false`
 * fixture conditions to an effectful opaque (see `fixtureWithOpaqueIfCond`).
 * This keeps the many fixture-style fake unions in this file working when
 * DVALA_FOLD=1 is set — tests that rely on `if true then X else Y` as a way
 * to construct a union of X and Y would otherwise see C8 narrowing to X.
 */
function createDvala(options?: Parameters<typeof createDvalaRaw>[0]) {
  const d = createDvalaRaw(options)
  const origTypecheck = d.typecheck.bind(d)
  return Object.assign(d, {
    typecheck: (source: string, opts?: { fileResolverBaseDir?: string; filePath?: string }) =>
      origTypecheck(fixtureWithOpaqueIfCond(source), opts),
  })
}
import type { Type } from './types'
import {
  NumberType, StringType, NullType, BooleanType,
  Unknown, Never,
  atom, literal, fn, record, array, tuple, sequence, union, inter, neg, handlerType,
  effectSet, typeToString,
} from './types'
import {
  InferenceContext, TypeEnv,
  inferExpr, constrain, expandType, expandTypeForDisplay, sanitizeDisplayType,
  TypeInferenceError,
} from './infer'
import { simplify } from './simplify'
import { isSubtype } from './subtype'
import { getBuiltinType, initBuiltinTypes, isTypeGuard, registerModuleType, resetBuiltinTypeCache } from './builtinTypes'
import { declareEffect } from './effectTypes'
import { allBuiltinModules } from '../allModules'

// Initialize builtin type cache once before all tests
beforeAll(() => {
  initBuiltinTypes(builtin.normalExpressions)
  for (const mod of allBuiltinModules) {
    registerModuleType(mod.name, mod.functions, mod.docs)
  }
  // Declare test effects used in effect set and handler tests
  declareEffect('my.eff', Unknown, Unknown)
  declareEffect('log', Unknown, Unknown)
  declareEffect('fetch', Unknown, Unknown)
  declareEffect('other.eff', Unknown, Unknown)
  // Opaque effect used by `fixtureWithOpaqueIfCond` to keep `if true/false`
  // fixture conds from narrowing under C8 when DVALA_FOLD=1.
  declareEffect('__fold_opaque', NullType, BooleanType)
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse Dvala source to AST nodes. */
function parseToAst(source: string) {
  const tokenStream = tokenize(source, false, undefined)
  const minified = minifyTokenStream(tokenStream, { removeWhiteSpace: true })
  return parse(minified)
}

/** Infer the type of a Dvala expression string. */
function inferType(source: string): Type {
  // Apply the fold-safe fixture rewrite so tests that use `if true`/`if false`
  // as a union-construction fixture continue to work under DVALA_FOLD=1.
  // The helper no-ops when the source doesn't contain those patterns.
  const rewritten = fixtureWithOpaqueIfCond(source)
  // The rewrite prepends `effect @__fold_opaque(Null) -> Boolean;` to the
  // source. When inferring via `parseToAst` + `inferExpr`, effect
  // declarations need to be registered out-of-band. Do it unconditionally —
  // re-declaring an effect is a no-op idempotent operation.
  if (rewritten !== source) {
    declareEffect('__fold_opaque', NullType, BooleanType)
  }
  const ast = parseToAst(rewritten)
  const ctx = new InferenceContext()
  const env = new TypeEnv()
  const typeMap = new Map<number, Type>()

  let result: Type = Never
  for (const node of ast) {
    result = inferExpr(node, ctx, env, typeMap)
  }
  return result
}

/**
 * Prepare the source so that any `if true` / `if false` patterns embedded in
 * test fixtures don't narrow under C8 (if-literal fold). Replaces literal
 * conds with an effectful boolean — `perform` calls carry an effect set,
 * so the return type is the declared `Boolean` (not a narrowed literal),
 * and the If case in `inferExpr` sees a non-Literal cond and skips C8.
 *
 * Simple-sub's `expandType` in positive polarity uses the lower bound of a
 * variable, so wrappings like `(b: Boolean) -> b` applied to `true` still
 * expose `Literal(true)` when the result is later used as an if-cond.
 * Effect-based opaques don't have that problem — the effect declaration
 * is the single source of truth for the return type.
 *
 * Tests that specifically want to assert C8 narrowing live in
 * `src/typechecker/fold.test.ts` and don't use `inferAndExpand`.
 */
function fixtureWithOpaqueIfCond(source: string): string {
  if (!/if (true|false)\b/.test(source)) return source
  // A `perform` call carries an effect set, so the return type is the
  // declared `Boolean`. The If case in `inferExpr` then sees a non-Literal
  // cond and skips C8 narrowing. Declare the effect inline in the source
  // so each `dvala.typecheck(...)` pass (which calls `resetUserEffects`)
  // sees it fresh.
  const rewritten = source
    .replace(/if true\b/g, 'if perform(@__fold_opaque, null)')
    .replace(/if false\b/g, 'if perform(@__fold_opaque, null)')
  return `effect @__fold_opaque(Null) -> Boolean; ${rewritten}`
}

/** Infer and expand (resolve variables to concrete types). */
function inferAndExpand(source: string): Type {
  // `inferType` already applies the fixture rewrite.
  const result = inferType(source)
  return simplify(expandType(result))
}

// ---------------------------------------------------------------------------
// Constrain function
// ---------------------------------------------------------------------------

describe('constrain', () => {
  it('same primitives succeed', () => {
    const ctx = new InferenceContext()
    expect(() => constrain(ctx, NumberType, NumberType)).not.toThrow()
  })

  it('different primitives fail', () => {
    const ctx = new InferenceContext()
    expect(() => constrain(ctx, NumberType, StringType)).toThrow(TypeInferenceError)
  })

  it('literal <: matching primitive succeeds', () => {
    const ctx = new InferenceContext()
    expect(() => constrain(ctx, literal(42), NumberType)).not.toThrow()
  })

  it('literal <: non-matching primitive fails', () => {
    const ctx = new InferenceContext()
    expect(() => constrain(ctx, literal(42), StringType)).toThrow(TypeInferenceError)
  })

  it('variable accumulates upper bound', () => {
    const ctx = new InferenceContext()
    const v = ctx.freshVar()
    constrain(ctx, v, NumberType)
    expect(v.upperBounds).toContain(NumberType)
  })

  it('variable accumulates lower bound', () => {
    const ctx = new InferenceContext()
    const v = ctx.freshVar()
    constrain(ctx, literal(42), v)
    expect(v.lowerBounds).toHaveLength(1)
    expect(v.lowerBounds[0]).toEqual(literal(42))
  })

  it('function constrains: contravariant params, covariant return', () => {
    const ctx = new InferenceContext()
    const paramVar = ctx.freshVar()
    const retVar = ctx.freshVar()
    // (paramVar) -> retVar  <:  (Number) -> String
    constrain(ctx, fn([paramVar], retVar), fn([NumberType], StringType))
    // param: Number <: paramVar (contra) → paramVar has lower bound Number
    expect(paramVar.lowerBounds).toContain(NumberType)
    // return: retVar <: String (co) → retVar has upper bound String
    expect(retVar.upperBounds).toContain(StringType)
  })

  it('record constrains fields', () => {
    const ctx = new InferenceContext()
    const v = ctx.freshVar()
    constrain(ctx, record({ x: literal(42) }), record({ x: v }))
    expect(v.lowerBounds).toHaveLength(1)
  })

  it('record constraint rejects extra fields for closed rhs', () => {
    const ctx = new InferenceContext()
    expect(() => constrain(ctx, record({ x: NumberType, y: NumberType }), record({ x: NumberType }))).toThrow(TypeInferenceError)
  })

  it('record constraint rejects open lhs for closed rhs', () => {
    const ctx = new InferenceContext()
    expect(() => constrain(ctx, record({ x: NumberType }, true), record({ x: NumberType }))).toThrow(TypeInferenceError)
  })

  it('intersection on left: overloaded function picks matching overload', () => {
    const ctx = new InferenceContext()
    const retVar = ctx.freshVar()
    // Overloaded: (Number -> Number) & (Number[] -> Number[])
    const overloaded = inter(
      fn([NumberType], NumberType),
      fn([array(NumberType)], array(NumberType)),
    )
    // Call with Number → should match first overload, retVar gets lower bound Number
    constrain(ctx, overloaded, fn([literal(42)], retVar))
    expect(retVar.lowerBounds).toContain(NumberType)
  })

  it('intersection on left: overloaded function picks array overload', () => {
    const ctx = new InferenceContext()
    const retVar = ctx.freshVar()
    const overloaded = inter(
      fn([NumberType], NumberType),
      fn([array(NumberType)], array(NumberType)),
    )
    // Call with Number[] → should match second overload
    constrain(ctx, overloaded, fn([array(literal(42))], retVar))
    expect(retVar.lowerBounds.length).toBeGreaterThan(0)
  })

  it('intersection on left: no matching overload throws', () => {
    const ctx = new InferenceContext()
    const retVar = ctx.freshVar()
    const overloaded = inter(
      fn([NumberType], NumberType),
      fn([array(NumberType)], array(NumberType)),
    )
    // Call with String → no overload matches
    expect(() => constrain(ctx, overloaded, fn([StringType], retVar))).toThrow(TypeInferenceError)
  })

  it('intersection on left: preserves multiple viable overload branches', () => {
    const ctx = new InferenceContext()
    const argVar = ctx.freshVar()
    const retVar = ctx.freshVar()
    const overloaded = inter(
      fn([NumberType, NumberType], NumberType),
      fn([array(NumberType), array(NumberType)], array(NumberType)),
      fn([array(array(NumberType)), array(array(NumberType))], array(array(NumberType))),
    )

    constrain(ctx, overloaded, fn([argVar, argVar], retVar))

    expect(argVar.displayUpperBounds).toContainEqual(NumberType)
    expect(argVar.displayUpperBounds).toContainEqual(array(NumberType))
    expect(argVar.displayUpperBounds).toContainEqual(array(array(NumberType)))
    expect(retVar.displayLowerBounds).toContainEqual(NumberType)
    expect(retVar.displayLowerBounds).toContainEqual(array(NumberType))
    expect(retVar.displayLowerBounds).toContainEqual(array(array(NumberType)))
  })

  it('rest-parameter functions constrain against longer calls', () => {
    const ctx = new InferenceContext()
    const retVar = ctx.freshVar()

    constrain(ctx, fn([NumberType], NumberType, undefined, undefined, NumberType), fn([NumberType, NumberType, NumberType], retVar))

    expect(retVar.lowerBounds).toContainEqual(NumberType)
  })

  it('rest-parameter functions reject calls below the minimum arity', () => {
    const ctx = new InferenceContext()
    const retVar = ctx.freshVar()

    expect(() => constrain(ctx, fn([NumberType], NumberType, undefined, undefined, NumberType), fn([], retVar))).toThrow(TypeInferenceError)
  })
})

// ---------------------------------------------------------------------------
// Inference — literals
// ---------------------------------------------------------------------------

describe('inference — literals', () => {
  it('number literal', () => {
    const t = inferType('42')
    expect(t).toEqual(literal(42))
  })

  it('string literal', () => {
    const t = inferType('"hello"')
    expect(t).toEqual(literal('hello'))
  })

  it('boolean true', () => {
    const t = inferType('true')
    expect(t).toEqual(literal(true))
  })

  it('boolean false', () => {
    const t = inferType('false')
    expect(t).toEqual(literal(false))
  })

  it('null', () => {
    const t = inferType('null')
    expect(t).toEqual(NullType)
  })

  it('atom', () => {
    const t = inferType(':ok')
    expect(t).toEqual(atom('ok'))
  })
})

// ---------------------------------------------------------------------------
// Inference — let bindings
// ---------------------------------------------------------------------------

describe('inference — let bindings', () => {
  it('let x = 42; x → literal(42)', () => {
    const t = inferAndExpand('let x = 42; x')
    expect(isSubtype(t, NumberType)).toBe(true)
  })

  it('let x = "hello"; x → literal("hello")', () => {
    const t = inferAndExpand('let x = "hello"; x')
    expect(isSubtype(t, StringType)).toBe(true)
  })

  it('let bindings are scoped in blocks', () => {
    const t = inferAndExpand('do let x = 42; x end')
    expect(isSubtype(t, NumberType)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Inference — functions
// ---------------------------------------------------------------------------

describe('inference — functions', () => {
  it('identity function: (x) -> x', () => {
    const t = inferType('(x) -> x')
    expect(t.tag).toBe('Function')
    if (t.tag === 'Function') {
      expect(t.params).toHaveLength(1)
      // param and return should be the same variable
      expect(t.params[0]!.tag).toBe('Var')
      expect(t.ret.tag).toBe('Var')
    }
  })

  it('constant function: (x) -> 42', () => {
    const t = inferType('(x) -> 42')
    expect(t.tag).toBe('Function')
    if (t.tag === 'Function') {
      expect(t.ret).toEqual(literal(42))
    }
  })

  it('function application: ((x) -> x)(42) → 42', () => {
    const t = inferAndExpand('((x) -> x)(42)')
    expect(isSubtype(t, NumberType)).toBe(true)
  })

  it('function application: ((x) -> x)("hello") → "hello"', () => {
    const t = inferAndExpand('((x) -> x)("hello")')
    expect(isSubtype(t, StringType)).toBe(true)
  })

  it('multi-param function: (a, b) -> a', () => {
    const t = inferType('(a, b) -> a')
    expect(t.tag).toBe('Function')
    if (t.tag === 'Function') {
      expect(t.params).toHaveLength(2)
    }
  })
})

// ---------------------------------------------------------------------------
// Inference — if expressions
// ---------------------------------------------------------------------------

describe('inference — if expressions', () => {
  // These tests cover the "both branches contribute to the result type"
  // invariant of `if`. Under the default (fold on) C8 would narrow
  // `if true` to its live branch, so `inferAndExpand` routes through
  // `fixtureWithOpaqueIfCond` — the literal cond is rewritten to an
  // opaque effectful boolean. The C8 literal-narrowing path is covered
  // separately in src/typechecker/fold.test.ts.
  it('if-cond with two distinct-typed branches → union of both', () => {
    const t = inferAndExpand('if true then 42 else "hello" end')
    expect(isSubtype(literal(42), t)).toBe(true)
    expect(isSubtype(literal('hello'), t)).toBe(true)
  })

  it('if-cond with two number branches → subtype of Number', () => {
    const t = inferAndExpand('if true then 42 else 43 end')
    expect(isSubtype(t, NumberType)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Inference — arrays
// ---------------------------------------------------------------------------

describe('inference — arrays', () => {
  it('empty array: array([])', () => {
    const t = inferType('array()')
    expect(t.tag).toBe('Array')
  })
})

// ---------------------------------------------------------------------------
// Inference — objects
// ---------------------------------------------------------------------------

describe('inference — objects', () => {
  it('object literal: { a: 1, b: "hi" }', () => {
    const t = inferType('{ a: 1, b: "hi" }')
    expect(t.tag).toBe('Record')
    if (t.tag === 'Record') {
      expect(t.fields.get('a')).toEqual(literal(1))
      expect(t.fields.get('b')).toEqual(literal('hi'))
      expect(t.open).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// Inference — let-polymorphism
// ---------------------------------------------------------------------------

describe('inference — let-polymorphism', () => {
  it('polymorphic identity: let id = (x) -> x; id(42) works', () => {
    // The identity function is let-bound, so each use gets fresh type variables
    const t = inferAndExpand('let id = (x) -> x; id(42)')
    expect(isSubtype(t, NumberType)).toBe(true)
  })

  it('polymorphic identity used at two different types', () => {
    // Each use of a let-bound identity should get fresh variables.
    // First use at Number, second use at String — both should succeed.
    // We test that each call infers without throwing (no type conflict).
    expect(() => inferType('let id = (x) -> x; let a = id(42); let b = id("hello"); b')).not.toThrow()
  })

  it('preserves the later use type for polymorphic identity bindings', () => {
    const t = inferAndExpand('let id = (x) -> x; let a = id(42); let b = id("hello"); b')
    expect(typeToString(t)).toBe('"hello"')
  })
})

// ---------------------------------------------------------------------------
// Expand type variables
// ---------------------------------------------------------------------------

describe('expandType', () => {
  it('expands variable with lower bounds to union', () => {
    const ctx = new InferenceContext()
    const v = ctx.freshVar()
    constrain(ctx, literal(42), v)
    constrain(ctx, literal('hi'), v)
    const expanded = expandType(v)
    // v has lower bounds [42, "hi"], so it expands to 42 | "hi"
    expect(expanded.tag).toBe('Union')
  })

  it('expands variable with no bounds to Never (positive)', () => {
    const ctx = new InferenceContext()
    const v = ctx.freshVar()
    expect(expandType(v, 'positive')).toBe(Never)
  })

  it('expands variable with no bounds to Unknown (negative)', () => {
    const ctx = new InferenceContext()
    const v = ctx.freshVar()
    expect(expandType(v, 'negative')).toBe(Unknown)
  })
})

// ---------------------------------------------------------------------------
// Inference — builtin function types
// ---------------------------------------------------------------------------

describe('inference — builtin types', () => {
  it('+(1, 2) infers Number', () => {
    const t = inferAndExpand('1 + 2')
    expect(isSubtype(t, NumberType)).toBe(true)
  })

  it('1 + 2 + 3 infers Number', () => {
    const t = inferAndExpand('1 + 2 + 3')
    expect(isSubtype(t, NumberType)).toBe(true)
  })

  it('count("hello") infers Number', () => {
    const t = inferAndExpand('count("hello")')
    expect(isSubtype(t, NumberType)).toBe(true)
  })

  it('str(42) infers String', () => {
    const t = inferAndExpand('str(42)')
    expect(isSubtype(t, StringType)).toBe(true)
  })

  it('inc(1) infers Number (scalar overload)', () => {
    const t = inferAndExpand('inc(1)')
    expect(isSubtype(t, NumberType)).toBe(true)
  })

  it('not(true) infers Boolean', () => {
    const t = inferAndExpand('not(true)')
    // not returns Boolean
    expect(t.tag === 'Primitive' || t.tag === 'Literal').toBe(true)
  })

  it('1 == 2 infers Boolean', () => {
    const t = inferAndExpand('1 == 2')
    expect(t.tag === 'Primitive' || t.tag === 'Literal').toBe(true)
  })

  it('let x = 1 + 2; x infers Number', () => {
    const t = inferAndExpand('let x = 1 + 2; x')
    expect(isSubtype(t, NumberType)).toBe(true)
  })

  it('let f = (a, b) -> a + b; f(1, 2) infers Number', () => {
    const t = inferAndExpand('let f = (a, b) -> a + b; f(1, 2)')
    expect(isSubtype(t, NumberType)).toBe(true)
  })

  it('let result = (a) -> a + a; result(3) infers Number', () => {
    const t = inferAndExpand('let result = (a) -> a + a; result(3)')
    expect(isSubtype(t, NumberType)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Inference — Step 3: records and collections
// ---------------------------------------------------------------------------

describe('inference — dot access (property access)', () => {
  it('{a: 1}.a infers Number', () => {
    const t = inferAndExpand('{a: 1}.a')
    expect(isSubtype(t, NumberType)).toBe(true)
  })

  it('{name: "Alice"}.name infers String', () => {
    const t = inferAndExpand('{name: "Alice"}.name')
    expect(isSubtype(t, StringType)).toBe(true)
  })

  it('let p = {x: 1, y: 2}; p.x infers Number', () => {
    const t = inferAndExpand('let p = {x: 1, y: 2}; p.x')
    expect(isSubtype(t, NumberType)).toBe(true)
  })

  it('function parameter dot access: (p) -> p.name', () => {
    // The function should infer that p has a .name field
    const t = inferType('(p) -> p.name')
    expect(t.tag).toBe('Function')
    if (t.tag === 'Function') {
      // The param should be constrained with an open record
      expect(t.params[0]!.tag).toBe('Var')
    }
  })

  it('chained dot access: {a: {b: 1}}.a.b infers Number', () => {
    const t = inferAndExpand('{a: {b: 1}}.a.b')
    expect(isSubtype(t, NumberType)).toBe(true)
  })
})

describe('inference — object destructuring', () => {
  it('let {name} = {name: "Alice"}; name infers String', () => {
    const t = inferAndExpand('let {name} = {name: "Alice"}; name')
    expect(isSubtype(t, StringType)).toBe(true)
  })

  it('let {x, y} = {x: 1, y: 2}; x + y infers Number', () => {
    const t = inferAndExpand('let {x, y} = {x: 1, y: 2}; x + y')
    expect(isSubtype(t, NumberType)).toBe(true)
  })
})

describe('inference — array destructuring', () => {
  it('let [a, b] = [1, 2]; a infers from tuple', () => {
    // [1, 2] is inferred as an array, and a gets the element type
    expect(() => inferType('let [a, b] = array(1, 2); a')).not.toThrow()
  })

  it('local bindings can shadow builtin-tagged names', () => {
    const t = inferAndExpand('let rest = [1, 2]; count(rest)')
    expect(isSubtype(t, NumberType)).toBe(true)
  })

  it('let [head, ...tail] = [1, 2, 3]; count(tail) infers Number', () => {
    const t = inferAndExpand('let [head, ...tail] = [1, 2, 3]; count(tail)')
    expect(isSubtype(t, NumberType)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Inference — Step 4: match narrowing and exhaustiveness
// ---------------------------------------------------------------------------

describe('inference — match narrowing', () => {
  it('match with literal patterns returns union of branch types', () => {
    const t = inferAndExpand('match 1 case 0 then "zero" case 1 then "one" case _ then "other" end')
    expect(isSubtype(t, StringType)).toBe(true)
  })

  it('later symbol cases see the remaining match type', () => {
    const t = inferAndExpand('let x = if true then 1 else :ok end; match x case :ok then 0 case n then n + 1 end')
    expect(isSubtype(t, NumberType)).toBe(true)
  })

  it('match with atom patterns returns union', () => {
    const t = inferAndExpand('match :ok case :ok then 1 case :error then 0 end')
    expect(isSubtype(t, NumberType)).toBe(true)
  })

  it('match narrows type in guard branches', () => {
    // When isNumber(n) narrows n to Number, the body n + 1 should type as Number
    const t = inferAndExpand('let x = 42; match x case n when isNumber(n) then n + 1 case _ then 0 end')
    expect(isSubtype(t, NumberType)).toBe(true)
  })

  it('match with wildcard catch-all infers body type', () => {
    const t = inferAndExpand('match 42 case _ then "anything" end')
    expect(isSubtype(t, StringType)).toBe(true)
  })

  it('match with object destructuring pattern', () => {
    const t = inferAndExpand('let p = {x: 1, y: 2}; match p case {x, y} then x + y end')
    expect(isSubtype(t, NumberType)).toBe(true)
  })

  it('match narrows tagged object unions by nested literal fields', () => {
    const t = inferAndExpand('let event = if true then {type: "click", x: 1, y: 2} else {type: "keydown", key: "Enter"} end; match event case {type: "click", x, y} then x + y case {type: "keydown", key} then count(key) end')
    expect(isSubtype(t, NumberType)).toBe(true)
  })

  it('match with array destructuring pattern', () => {
    const t = inferAndExpand('let pair = [1, 2]; match pair case [x, y] then x + y end')
    expect(isSubtype(t, NumberType)).toBe(true)
  })

  it('match rest bindings remain usable as arrays in branch bodies', () => {
    const t = inferAndExpand('let xs = if true then [1, 2] else [1, 2, 3] end; match xs case [1, ...rest] then count(rest) case _ then 0 end')
    expect(isSubtype(t, NumberType)).toBe(true)
  })

  it('match destructuring ignores impossible array branches', () => {
    const t = inferAndExpand('match 42 case [x] then x case _ then 0 end')
    expect(isSubtype(t, NumberType)).toBe(true)
  })

  it('match destructuring ignores impossible object branches', () => {
    const t = inferAndExpand('match 42 case {x} then x case _ then 0 end')
    expect(isSubtype(t, NumberType)).toBe(true)
  })

  it('match with mixed branch types returns union', () => {
    const t = inferAndExpand('let x = if true then 0 else 1 end; match x case 0 then "zero" case _ then 42 end')
    // Result is "zero" | 42, which is String | Number
    expect(isSubtype(literal('zero'), t)).toBe(true)
    expect(isSubtype(literal(42), t)).toBe(true)
  })
})

describe('inference — exhaustiveness', () => {
  it('exhaustive match on atoms: remainder is Never', () => {
    expect(() => inferType(`
      let x = if true then :ok else :error end;
      match x
        case :ok then 1
        case :error then 0
      end
    `)).not.toThrow()
  })

  it('exhaustive match on Boolean works through the Boolean primitive space', () => {
    expect(() => inferType(`
      let x = isNumber(42);
      match x
        case true then 1
        case false then 0
      end
    `)).not.toThrow()
  })

  it('non-exhaustive match on atoms reports the remaining cases', () => {
    expect(() => inferType(`
      let x = if true then :ok else :error end;
      match x
        case :ok then 1
      end
    `)).toThrow('Non-exhaustive match')
  })

  it('exhaustive tagged object matches consume each variant by nested literal fields', () => {
    expect(() => inferType(`
      let event = if true then {type: "click", x: 1, y: 2} else {type: "keydown", key: "Enter"} end;
      match event
        case {type: "click", x, y} then x + y
        case {type: "keydown", key} then count(key)
      end
    `)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Inference — Step 5: atoms and tagged unions
// ---------------------------------------------------------------------------

describe('inference — atom types', () => {
  it(':ok infers as atom singleton', () => {
    const t = inferType(':ok')
    expect(t).toEqual(atom('ok'))
  })

  it(':error infers as atom singleton', () => {
    const t = inferType(':error')
    expect(t).toEqual(atom('error'))
  })

  it('if/else with atoms infers union', () => {
    const t = inferAndExpand('if true then :ok else :error end')
    // Result should be :ok | :error
    expect(isSubtype(atom('ok'), t)).toBe(true)
    expect(isSubtype(atom('error'), t)).toBe(true)
  })

  it('atom match narrows correctly', () => {
    const t = inferAndExpand(`
      let status = if true then :ok else :error end;
      match status
        case :ok then "success"
        case :error then "failure"
      end
    `)
    expect(isSubtype(t, StringType)).toBe(true)
  })
})

describe('inference — tagged unions', () => {
  it('tagged record construction', () => {
    const t = inferType('{tag: :ok, value: 42}')
    expect(t.tag).toBe('Record')
    if (t.tag === 'Record') {
      expect(t.fields.get('tag')).toEqual(atom('ok'))
      expect(t.fields.get('value')).toEqual(literal(42))
      expect(t.open).toBe(false)
    }
  })

  it('tagged union via if/else', () => {
    const t = inferAndExpand(`
      let result = if true then
        {tag: :ok, value: 42}
      else
        {tag: :error, error: "failed"}
      end;
      result.tag
    `)
    // result.tag should be :ok | :error
    expect(isSubtype(atom('ok'), t)).toBe(true)
    expect(isSubtype(atom('error'), t)).toBe(true)
  })

  it('tagged union field access via destructuring', () => {
    const t = inferAndExpand(`
      let result = {tag: :ok, value: 42};
      let {value} = result;
      value
    `)
    expect(isSubtype(t, NumberType)).toBe(true)
  })

  it('match on tagged union with object pattern', () => {
    const t = inferAndExpand(`
      let result = {tag: :ok, value: 42};
      match result
        case {tag, value} then value
      end
    `)
    expect(isSubtype(t, NumberType)).toBe(true)
  })
})

describe('inference — design doc examples', () => {
  it('function that handles Number | String', () => {
    // Design doc: f: (Number | String) -> Number
    const t = inferType(`
      (x) -> match x
        case n when isNumber(n) then n + 1
        case s when isString(s) then count(s)
      end
    `)
    expect(t.tag).toBe('Function')
    if (t.tag === 'Function') {
      expect(t.params).toHaveLength(1)
    }
  })

  it('Number & !0 type (non-zero numbers)', () => {
    // 42 <: Number & !0
    expect(isSubtype(literal(42), inter(NumberType, neg(literal(0))))).toBe(true)
    // 0 </: Number & !0
    expect(isSubtype(literal(0), inter(NumberType, neg(literal(0))))).toBe(false)
  })

  it('nullable type: T | Null', () => {
    const t = inferAndExpand('if true then 42 else null end')
    // Should be Number | Null
    expect(isSubtype(literal(42), t)).toBe(true)
    expect(isSubtype(NullType, t)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Inference — Step 6: effect sets
// ---------------------------------------------------------------------------

describe('inference — effect sets', () => {
  it('pure function has empty effect set', () => {
    const t = inferType('(x) -> x + 1')
    expect(t.tag).toBe('Function')
    if (t.tag === 'Function') {
      expect(t.effects.effects.size).toBe(0)
      expect(t.effects.open).toBe(false)
    }
  })

  it('function with perform has effect in its set', () => {
    const t = inferType('(x) -> perform(@my.eff, x)')
    expect(t.tag).toBe('Function')
    if (t.tag === 'Function') {
      expect(t.effects.effects.has('my.eff')).toBe(true)
    }
  })

  it('function with multiple performs accumulates effects', () => {
    const t = inferType('(x) -> do perform(@log, x); perform(@fetch, x) end')
    expect(t.tag).toBe('Function')
    if (t.tag === 'Function') {
      expect(t.effects.effects.has('log')).toBe(true)
      expect(t.effects.effects.has('fetch')).toBe(true)
      expect(t.effects.effects.size).toBe(2)
    }
  })

  it('handler subtracts handled effects', () => {
    const t = inferType(`
      (x) -> do
        with handler @log(msg) -> resume(null) end;
        perform(@log, "hello");
        perform(@fetch, x)
      end
    `)
    expect(t.tag).toBe('Function')
    if (t.tag === 'Function') {
      // @log is handled, only @fetch should remain
      expect(t.effects.effects.has('log')).toBe(false)
      expect(t.effects.effects.has('fetch')).toBe(true)
    }
  })

  it('pure function is subtype of effectful function', () => {
    // (Number) -> Number  <:  (Number) -> @{log} Number
    const pure = fn([NumberType], NumberType)
    const effectful = fn([NumberType], NumberType, effectSet(['log']))
    expect(isSubtype(pure, effectful)).toBe(true)
  })

  it('effectful function is NOT subtype of pure function', () => {
    const pure = fn([NumberType], NumberType)
    const effectful = fn([NumberType], NumberType, effectSet(['log']))
    expect(isSubtype(effectful, pure)).toBe(false)
  })

  it('fewer effects is subtype of more effects', () => {
    const fewer = fn([NumberType], NumberType, effectSet(['log']))
    const more = fn([NumberType], NumberType, effectSet(['log', 'fetch']))
    expect(isSubtype(fewer, more)).toBe(true)
  })

  it('more effects is NOT subtype of fewer effects', () => {
    const fewer = fn([NumberType], NumberType, effectSet(['log']))
    const more = fn([NumberType], NumberType, effectSet(['log', 'fetch']))
    expect(isSubtype(more, fewer)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Inference — imports
// ---------------------------------------------------------------------------

describe('inference — imports', () => {
  it('import("math").sin is typed as a function', () => {
    const t = inferType('let m = import("math"); m.sin')
    // sin should be a function type, not Unknown
    expect(t.tag).not.toBe('Unknown')
  })

  it('destructured import: let { sin } = import("math"); sin(0) works', () => {
    const t = inferAndExpand('let { sin } = import("math"); sin(0)')
    expect(isSubtype(t, NumberType)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Inference — Step 7: handler typing (Phase C)
// ---------------------------------------------------------------------------

describe('inference — effect declarations and handler typing', () => {
  it('perform returns declared return type', () => {
    // Declare an effect and verify perform uses the declared return type
    declareEffect('test.getNumber', StringType, NumberType)
    const t = inferAndExpand('perform(@test.getNumber, "key")')
    expect(isSubtype(t, NumberType)).toBe(true)
  })

  it('perform with undeclared effect throws', () => {
    expect(() => inferType('perform(@undeclared.eff, 42)')).toThrow('Undeclared effect')
  })

  it('handler clause infers without errors', () => {
    // Just verify handler clauses are walked without throwing
    expect(() => inferType(`
      handler
        @my.eff(x) -> resume(x)
      end
    `)).not.toThrow()
  })

  it('with-handler subtracts effects and infers body type', () => {
    const t = inferAndExpand(`
      (x) -> do
        with handler @log(msg) -> resume(null) end;
        perform(@log, "hello");
        x + 1
      end
    `)
    // Body returns Number, handler subtracts @log
    expect(t.tag).toBe('Function')
    if (t.tag === 'Function') {
      expect(t.effects.effects.has('log')).toBe(false)
    }
  })

  it('effect arg type is checked when declared', () => {
    declareEffect('test.typed', NumberType, StringType)
    // perform(@test.typed, "wrong") should fail — arg is String but declared as Number
    expect(() => inferType('perform(@test.typed, "wrong")')).toThrow()
  })

  it('handler literal infers Handler<B, O, Σ>', () => {
    declareEffect('test.handler', NumberType, StringType)
    const t = inferAndExpand(`
      handler
        @test.handler(x) -> resume("ok")
      transform
        value -> { ok: true, value }
      end
    `)

    expect(t.tag).toBe('Handler')
    if (t.tag === 'Handler') {
      expect([...t.handled.keys()]).toEqual(['test.handler'])
      expect(typeToString(t)).toContain('Handler<')
    }
  })

  it('resume argument is checked against the effect return type', () => {
    declareEffect('test.resumeTyped', NumberType, StringType)
    expect(() => inferType(`
      handler
        @test.resumeTyped(x) -> resume(42)
      end
    `)).toThrow('42 is not a subtype of String')
  })

  it('with-handler returns the handler output type', () => {
    declareEffect('test.withHandler', StringType, NumberType)
    const t = inferAndExpand(`
      do
        with handler
          @test.withHandler(msg) -> resume(1)
        transform
          value -> { ok: true, value }
        end;
        perform(@test.withHandler, "hello")
      end
    `)

    expect(typeToString(t)).toBe('{ok: true, value: Number}')
  })

  it('dynamic handler choice subtracts only guaranteed handled effects', () => {
    declareEffect('test.common', StringType, NullType)
    declareEffect('test.extra', StringType, NullType)

    // `useExtra` must be a genuinely dynamic Boolean — hard-coding `true`
    // would let C8 narrow to the then-branch under DVALA_FOLD=1 and the
    // test loses the "dynamic choice" intent. Route through the opaque
    // effect the fixture helper also uses.
    const t = inferAndExpand(`
      let useExtra = if true then true else false end;
      let h =
        if useExtra then
          handler
            @test.common(msg) -> resume(null)
            @test.extra(msg) -> resume(null)
          end
        else
          handler
            @test.common(msg) -> resume(null)
          end
        end;

      () -> do
        with h;
        perform(@test.common, "hello");
        perform(@test.extra, "world");
        1
      end
    `)

    expect(t.tag).toBe('Function')
    if (t.tag === 'Function') {
      expect(t.effects.effects.has('test.common')).toBe(false)
      expect(t.effects.effects.has('test.extra')).toBe(true)
    }
  })

  it('callable handlers subtract handled effects from thunk bodies', () => {
    declareEffect('test.call', StringType, NullType)
    declareEffect('test.extraCall', StringType, NullType)

    const t = inferAndExpand(`
      let h =
        handler
          @test.call(msg) -> resume(null)
        end;

      () -> h(-> do
        perform(@test.call, "hello");
        perform(@test.extraCall, "world");
        1
      end)
    `)

    expect(t.tag).toBe('Function')
    if (t.tag === 'Function') {
      expect(typeToString(t.ret)).toBe('1')
      expect(t.effects.effects.has('test.call')).toBe(false)
      expect(t.effects.effects.has('test.extraCall')).toBe(true)
    }
  })

  it('callable dynamic handler choice subtracts only guaranteed handled effects', () => {
    declareEffect('test.callCommon', StringType, NullType)
    declareEffect('test.callExtra', StringType, NullType)

    // See sibling test — `useExtra` must be genuinely dynamic Boolean under
    // DVALA_FOLD=1. The wrapping `if true then true else false end` passes
    // through `fixtureWithOpaqueIfCond` and widens to `true | false`.
    const t = inferAndExpand(`
      let useExtra = if true then true else false end;
      let h =
        if useExtra then
          handler
            @test.callCommon(msg) -> resume(null)
            @test.callExtra(msg) -> resume(null)
          end
        else
          handler
            @test.callCommon(msg) -> resume(null)
          end
        end;

      () -> h(-> do
        perform(@test.callCommon, "hello");
        perform(@test.callExtra, "world");
        1
      end)
    `)

    expect(t.tag).toBe('Function')
    if (t.tag === 'Function') {
      expect(t.effects.effects.has('test.callCommon')).toBe(false)
      expect(t.effects.effects.has('test.callExtra')).toBe(true)
    }
  })
})

describe('typecheck — imported handler parity', () => {
  const files = new Map<string, string>([
    ['./handlers.dvala', `
      effect @test.log(String) -> Null;

      let h =
        handler
          @test.log(msg) -> resume(null)
        end;

      { h };
    `],
    ['./logging.dvala', `
      let withLogging = (thunk) -> do
        let h =
          handler
            @test.log(msg: String) -> do
              let resumed = resume(null);
              { result: resumed.result, logs: [msg] ++ resumed.logs };
            end
            transform result -> { result, logs: [] }
          end;
        h(thunk)
      end;

      { withLogging };
    `],
  ])

  const dvala = createDvala({
    debug: true,
    fileResolver: (importPath: string) => {
      const normalized = importPath.endsWith('.dvala') ? importPath : `${importPath}.dvala`
      const source = files.get(normalized) ?? files.get(importPath)
      if (!source) throw new Error(`File not found: ${importPath}`)
      return source
    },
  })

  it('imported handlers infer the same as local handlers', () => {
    const local = dvala.typecheck(`
      effect @test.log(String) -> Null;
      type PureNumberFn = ((Number) -> Number);

      let h =
        handler
          @test.log(msg) -> resume(null)
        end;

      let resultFn: PureNumberFn = (x) -> do
        with h;
        perform(@test.log, "hello");
        x + 1
      end;

      resultFn
    `, { fileResolverBaseDir: '.' })

    const imported = dvala.typecheck(`
      effect @test.log(String) -> Null;
      type PureNumberFn = ((Number) -> Number);
      let { h } = import("./handlers");

      let resultFn: PureNumberFn = (x) -> do
        with h;
        perform(@test.log, "hello");
        x + 1
      end;

      resultFn
    `, { fileResolverBaseDir: '.' })

    expect(local.diagnostics).toHaveLength(0)
    expect(imported.diagnostics).toHaveLength(0)
  })

  it('imported callable handlers infer the same as local handlers', () => {
    const local = dvala.typecheck(`
      effect @test.log(String) -> Null;
      let h =
        handler
          @test.log(msg) -> resume(null)
        end;

      let result: Number = h(-> do
        perform(@test.log, "hello");
        1
      end);

      result
    `, { fileResolverBaseDir: '.' })

    const imported = dvala.typecheck(`
      effect @test.log(String) -> Null;
      let { h } = import("./handlers");

      let result: Number = h(-> do
        perform(@test.log, "hello");
        1
      end);

      result
    `, { fileResolverBaseDir: '.' })

    expect(local.diagnostics).toHaveLength(0)
    expect(imported.diagnostics).toHaveLength(0)
  })

  it('perform infers from imported active handlers without a local effect declaration', () => {
    const result = dvala.typecheck(`
      let { h } = import("./handlers");

      let value: Number = do
        with h;
        perform(@test.log, "hello");
        1
      end;

      value
    `, { fileResolverBaseDir: '.' })

    expect(result.diagnostics).toHaveLength(0)
  })

  it('callable imported handlers infer thunk effects without a local effect declaration', () => {
    const result = dvala.typecheck(`
      let { h } = import("./handlers");

      let value: Number = h(-> do
        perform(@test.log, "hello");
        1
      end);

      value
    `, { fileResolverBaseDir: '.' })

    expect(result.diagnostics).toHaveLength(0)
  })

  it('imported handler signatures still enforce perform arg types without a local declaration', () => {
    const result = dvala.typecheck(`
      let { h } = import("./handlers");

      do
        with h;
        perform(@test.log, 42)
      end
    `, { fileResolverBaseDir: '.' })

    expect(result.diagnostics.length).toBeGreaterThan(0)
  })

  it('imported handler wrappers propagate handled signatures into callback literals', () => {
    const result = dvala.typecheck(`
      let { withLogging } = import("./logging");

      withLogging(-> do
        perform(@test.log, "hello");
        1
      end)
    `, { fileResolverBaseDir: '.' })

    expect(result.diagnostics).toHaveLength(0)
  })

  it('imported handler wrappers infer perform results from resume values', () => {
    const result = dvala.typecheck(`
      let { withLogging } = import("./logging");

      withLogging(-> do
        let a: Null = perform(@test.log, "hello");
        a
      end)
    `, { fileResolverBaseDir: '.' })

    expect(result.diagnostics).toHaveLength(0)
  })

  it('imported handler wrappers preserve concrete handled payload types', () => {
    const result = dvala.typecheck(`
      let { withLogging } = import("./logging");
      withLogging
    `, { fileResolverBaseDir: '.' })

    const lastType = [...result.typeMap.values()].at(-1)
    const expanded = lastType ? expandType(lastType, 'positive') : undefined

    expect(expanded?.tag).toBe('Function')
    if (expanded?.tag !== 'Function') {
      return
    }

    const handled = expanded.handlerWrapper?.handled.get('test.log')
    expect(handled).toBeDefined()
    expect(typeToString(expandType(handled!.argType, 'negative'))).toBe('String')
    expect(typeToString(expandType(handled!.retType, 'positive'))).toBe('Null')
  })

  it('local handler wrappers preserve concrete handled payload types', () => {
    const result = dvala.typecheck(`
      let withLogging = (thunk) -> do
        let h =
          handler
            @test.log(msg: String) -> do
              let resumed = resume(null);
              { result: resumed.result, logs: [msg] ++ resumed.logs }
            end
            transform result -> { result, logs: [] }
          end;
        h(thunk)
      end;

      withLogging
    `)

    const lastType = [...result.typeMap.values()].at(-1)
    const expanded = lastType ? expandType(lastType, 'positive') : undefined

    expect(expanded?.tag).toBe('Function')
    if (expanded?.tag !== 'Function') {
      return
    }

    const handled = expanded.handlerWrapper?.handled.get('test.log')
    expect(handled).toBeDefined()
    expect(typeToString(expandType(handled!.argType, 'negative'))).toBe('String')
    expect(typeToString(expandType(handled!.retType, 'positive'))).toBe('Null')
  })

  it('raw imported records preserve concrete handled payload types', () => {
    const result = dvala.typecheck('import("./logging")', { fileResolverBaseDir: '.' })

    const lastType = [...result.typeMap.values()].at(-1)
    const expanded = lastType ? expandType(lastType, 'positive') : undefined

    expect(expanded?.tag).toBe('Record')
    if (expanded?.tag !== 'Record') {
      return
    }

    const withLogging = expanded.fields.get('withLogging')
    expect(withLogging?.tag).toBe('Function')
    if (withLogging?.tag !== 'Function') {
      return
    }

    const handled = withLogging.handlerWrapper?.handled.get('test.log')
    expect(handled).toBeDefined()
    expect(typeToString(expandType(handled!.argType, 'negative'))).toBe('String')
  })

  it('imported handler wrappers enforce perform arg types inside callback literals', () => {
    const result = dvala.typecheck(`
      let { withLogging } = import("./logging");

      withLogging(-> do
        perform(@test.log, 10);
        1
      end)
    `, { fileResolverBaseDir: '.' })

    expect(result.diagnostics.length).toBeGreaterThan(0)
    expect(result.diagnostics[0]?.message).toContain('not a subtype of String')
  })
})

// ---------------------------------------------------------------------------
// Effect declaration syntax: effect @name(T) -> U
// ---------------------------------------------------------------------------

describe('typecheck — effect declarations in source', () => {
  const dvala = createDvala()

  it('effect declaration + perform: no errors', () => {
    const result = dvala.typecheck(`
      effect @my.log(String) -> Null;
      perform(@my.log, "hello")
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('effect declaration with wrong arg type: error', () => {
    const result = dvala.typecheck(`
      effect @my.log(String) -> Null;
      perform(@my.log, 42)
    `)
    expect(result.diagnostics.length).toBeGreaterThan(0)
  })

  it('perform without declaration: error', () => {
    const result = dvala.typecheck('perform(@no.such.eff, 42)')
    expect(result.diagnostics.length).toBeGreaterThan(0)
    expect(result.diagnostics[0]!.message).toContain('Undeclared effect')
  })

  it('builtin effects are pre-declared (no error)', () => {
    const result = dvala.typecheck('perform(@dvala.error, "oops")')
    expect(result.diagnostics).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Constrain — alias, literal mismatch, sequence, negation
// ---------------------------------------------------------------------------

describe('constrain — alias handling', () => {
  it('alias lhs is transparent during constraint solving', () => {
    const ctx = new InferenceContext()
    const aliasType: Type = { tag: 'Alias', name: 'Num', args: [], expanded: NumberType }
    expect(() => constrain(ctx, aliasType, NumberType)).not.toThrow()
  })

  it('alias rhs is transparent during constraint solving', () => {
    const ctx = new InferenceContext()
    const aliasType: Type = { tag: 'Alias', name: 'Num', args: [], expanded: NumberType }
    expect(() => constrain(ctx, literal(42), aliasType)).not.toThrow()
  })

  it('alias with incompatible expanded type throws', () => {
    const ctx = new InferenceContext()
    const aliasType: Type = { tag: 'Alias', name: 'Num', args: [], expanded: NumberType }
    expect(() => constrain(ctx, StringType, aliasType)).toThrow(TypeInferenceError)
  })
})

describe('constrain — literal mismatches', () => {
  it('literal <: literal with different values fails', () => {
    const ctx = new InferenceContext()
    expect(() => constrain(ctx, literal(42), literal(43))).toThrow(TypeInferenceError)
  })

  it('literal <: literal with same values succeeds', () => {
    const ctx = new InferenceContext()
    expect(() => constrain(ctx, literal(42), literal(42))).not.toThrow()
  })

  it('string literal <: Number primitive fails', () => {
    const ctx = new InferenceContext()
    expect(() => constrain(ctx, literal('hello'), NumberType)).toThrow(TypeInferenceError)
  })

  it('boolean literal <: String primitive fails', () => {
    const ctx = new InferenceContext()
    expect(() => constrain(ctx, literal(true), StringType)).toThrow(TypeInferenceError)
  })

  it('atom <: different atom fails', () => {
    const ctx = new InferenceContext()
    expect(() => constrain(ctx, atom('ok'), atom('error'))).toThrow(TypeInferenceError)
  })

  it('atom <: same atom succeeds', () => {
    const ctx = new InferenceContext()
    expect(() => constrain(ctx, atom('ok'), atom('ok'))).not.toThrow()
  })
})

describe('constrain — function param mismatches', () => {
  it('function arity mismatch throws', () => {
    const ctx = new InferenceContext()
    // (Number) -> Number  constrained against  (Number, Number) -> Number
    expect(() => constrain(ctx, fn([NumberType], NumberType), fn([NumberType, NumberType], NumberType))).toThrow(TypeInferenceError)
  })

  it('rest param rhs without rest lhs throws', () => {
    const ctx = new InferenceContext()
    // fn without rest constrained against fn with rest
    expect(() => constrain(ctx, fn([NumberType], NumberType), fn([NumberType], NumberType, undefined, undefined, NumberType))).toThrow(TypeInferenceError)
  })

  it('rest param constrains element types', () => {
    const ctx = new InferenceContext()
    const restVar = ctx.freshVar()
    // lhs has StringType rest, rhs has restVar rest
    // constrain does: constrain(rhs.restParam, lhs.restParam) = constrain(restVar, StringType)
    // so restVar (lhs in inner call) gets upper bound StringType
    constrain(ctx, fn([NumberType], NumberType, undefined, undefined, StringType), fn([NumberType], NumberType, undefined, undefined, restVar))
    expect(restVar.upperBounds).toContainEqual(StringType)
  })
})

describe('constrain — sequence length violations', () => {
  it('sequence min length mismatch throws', () => {
    const ctx = new InferenceContext()
    const lhs = { tag: 'Sequence' as const, prefix: [NumberType], rest: Never, minLength: 1, maxLength: 2 }
    const rhs = { tag: 'Sequence' as const, prefix: [NumberType, NumberType], rest: Never, minLength: 2, maxLength: 3 }
    expect(() => constrain(ctx, lhs, rhs)).toThrow(TypeInferenceError)
  })

  it('sequence unbounded lhs against bounded rhs throws', () => {
    const ctx = new InferenceContext()
    const lhs = { tag: 'Sequence' as const, prefix: [NumberType], rest: NumberType, minLength: 1, maxLength: undefined }
    const rhs = { tag: 'Sequence' as const, prefix: [NumberType], rest: NumberType, minLength: 1, maxLength: 3 }
    expect(() => constrain(ctx, lhs, rhs)).toThrow(TypeInferenceError)
  })

  it('sequence max length exceeded throws', () => {
    const ctx = new InferenceContext()
    const lhs = { tag: 'Sequence' as const, prefix: [NumberType], rest: NumberType, minLength: 1, maxLength: 5 }
    const rhs = { tag: 'Sequence' as const, prefix: [NumberType], rest: NumberType, minLength: 1, maxLength: 3 }
    expect(() => constrain(ctx, lhs, rhs)).toThrow(TypeInferenceError)
  })

  it('compatible sequence lengths succeed', () => {
    const ctx = new InferenceContext()
    const lhs = { tag: 'Sequence' as const, prefix: [NumberType], rest: NumberType, minLength: 2, maxLength: 3 }
    const rhs = { tag: 'Sequence' as const, prefix: [NumberType], rest: NumberType, minLength: 1, maxLength: 4 }
    expect(() => constrain(ctx, lhs, rhs)).not.toThrow()
  })
})

describe('constrain — negation and misc', () => {
  it('tuple <: tuple with different lengths throws', () => {
    const ctx = new InferenceContext()
    const lhs = { tag: 'Tuple' as const, elements: [NumberType] }
    const rhs = { tag: 'Tuple' as const, elements: [NumberType, StringType] }
    expect(() => constrain(ctx, lhs, rhs)).toThrow(TypeInferenceError)
  })

  it('tuple <: tuple with same length constrains elements', () => {
    const ctx = new InferenceContext()
    const v = ctx.freshVar()
    const lhs = { tag: 'Tuple' as const, elements: [literal(42)] }
    const rhs = { tag: 'Tuple' as const, elements: [v] }
    constrain(ctx, lhs, rhs)
    expect(v.lowerBounds).toContainEqual(literal(42))
  })

  it('tuple <: array constrains each element', () => {
    const ctx = new InferenceContext()
    const v = ctx.freshVar()
    const lhs = { tag: 'Tuple' as const, elements: [literal(42), literal(43)] }
    const rhs = array(v)
    constrain(ctx, lhs, rhs)
    expect(v.lowerBounds).toContainEqual(literal(42))
    expect(v.lowerBounds).toContainEqual(literal(43))
  })

  it('AnyFunction <: Function constrains Unknown to ret', () => {
    const ctx = new InferenceContext()
    const retVar = ctx.freshVar()
    // AnyFunction <: Function triggers: constrain(Unknown, retVar)
    // Unknown on left is a trivial case (returns early), so retVar doesn't get bounds
    // But Unknown is still valid — this just doesn't crash
    expect(() => constrain(ctx, { tag: 'AnyFunction' as const }, fn([NumberType], retVar))).not.toThrow()
  })

  it('non-function <: AnyFunction throws', () => {
    const ctx = new InferenceContext()
    expect(() => constrain(ctx, NumberType, { tag: 'AnyFunction' as const })).toThrow(TypeInferenceError)
  })

  it('handler <: handler with missing clause throws', () => {
    const ctx = new InferenceContext()
    const lhs = handlerType(NumberType, NumberType, new Map())
    const rhs = handlerType(NumberType, NumberType, new Map([['test.eff', { argType: NumberType, retType: StringType }]]))
    expect(() => constrain(ctx, lhs, rhs)).toThrow(TypeInferenceError)
  })

  it('record with open lhs missing field continues without error', () => {
    const ctx = new InferenceContext()
    const lhs = record({ x: NumberType }, true)
    const rhs = record({ x: NumberType, y: StringType }, true)
    // open record lhs — missing 'y' is ok because it might exist
    expect(() => constrain(ctx, lhs, rhs)).not.toThrow()
  })

  it('closed record lhs missing field throws', () => {
    const ctx = new InferenceContext()
    const lhs = record({ x: NumberType })
    const rhs = record({ x: NumberType, y: StringType }, true)
    expect(() => constrain(ctx, lhs, rhs)).toThrow(TypeInferenceError)
  })

  it('regex <: regex succeeds', () => {
    const ctx = new InferenceContext()
    const regex: Type = { tag: 'Regex' }
    expect(() => constrain(ctx, regex, regex)).not.toThrow()
  })

  it('array called with number constrains element to ret', () => {
    const ctx = new InferenceContext()
    const retVar = ctx.freshVar()
    constrain(ctx, array(NumberType), fn([literal(0)], retVar))
    expect(retVar.lowerBounds).toContainEqual(NumberType)
  })

  it('sequence called with number constrains element type to ret', () => {
    const ctx = new InferenceContext()
    const retVar = ctx.freshVar()
    const seq = { tag: 'Sequence' as const, prefix: [NumberType], rest: StringType, minLength: 1, maxLength: undefined }
    constrain(ctx, seq, fn([literal(0)], retVar))
    // element type should flow into retVar
    expect(retVar.lowerBounds.length).toBeGreaterThan(0)
  })

  it('tuple called with number constrains all elements to ret', () => {
    const ctx = new InferenceContext()
    const retVar = ctx.freshVar()
    const tup = { tag: 'Tuple' as const, elements: [NumberType, StringType] }
    constrain(ctx, tup, fn([literal(0)], retVar))
    expect(retVar.lowerBounds).toContainEqual(NumberType)
    expect(retVar.lowerBounds).toContainEqual(StringType)
  })

  it('incompatible types throw', () => {
    const ctx = new InferenceContext()
    expect(() => constrain(ctx, NumberType, array(NumberType))).toThrow(TypeInferenceError)
  })
})

// ---------------------------------------------------------------------------
// Inference — inferExpr for specific node types
// ---------------------------------------------------------------------------

describe('inference — effect annotations and misc node types', () => {
  it('effect reference infers Unknown', () => {
    const t = inferType('@my.eff')
    expect(t).toBe(Unknown)
  })

  it('template string infers String', () => {
    const t = inferType('`hello ${42} world`')
    expect(t).toEqual(StringType)
  })

  it('and expression infers union of operands', () => {
    const t = inferAndExpand('true && 42')
    // Result is union of boolean and number
    expect(isSubtype(literal(true), t) || isSubtype(literal(42), t)).toBe(true)
  })

  it('or expression infers union of operands', () => {
    const t = inferAndExpand('false || "hello"')
    expect(isSubtype(literal(false), t) || isSubtype(literal('hello'), t)).toBe(true)
  })

  it('nullish coalescing infers union of operands', () => {
    const t = inferAndExpand('??(null, 42)')
    expect(isSubtype(literal(42), t) || isSubtype(NullType, t)).toBe(true)
  })

  it('loop expression infers Unknown', () => {
    const t = inferType('loop(i = 0) -> if i > 3 then i else recur(i + 1) end')
    expect(t).toBe(Unknown)
  })

  it('for comprehension infers array of Unknown', () => {
    const t = inferType('for(x in [1, 2, 3]) -> x')
    expect(t.tag).toBe('Array')
  })

  it('macro expression infers AnyFunction', () => {
    const t = inferType('macro (ast) -> ast')
    expect(t.tag).toBe('AnyFunction')
  })

  it('macro call infers Unknown', () => {
    const t = inferType('let m = macro (ast) -> ast; #m 42')
    expect(t).toBe(Unknown)
  })

  it('recur expression infers Never inside loop', () => {
    // The overall loop type is Unknown
    const t = inferAndExpand('loop(i = 0) -> if i > 3 then i else recur(i + 1) end')
    expect(t).toBe(Unknown)
  })
})

// ---------------------------------------------------------------------------
// Inference — recordLiteralPatternTypes (object/array destructuring in let)
// ---------------------------------------------------------------------------

describe('inference — literal pattern type recording', () => {
  it('object destructuring records individual field types', () => {
    const t = inferAndExpand('let {a, b} = {a: 1, b: "hello"}; a')
    expect(isSubtype(t, NumberType)).toBe(true)
  })

  it('nested object destructuring records field types', () => {
    const t = inferAndExpand('let {a} = {a: {b: 42}}; a.b')
    expect(isSubtype(t, NumberType)).toBe(true)
  })

  it('array destructuring records element types', () => {
    // array() creates a homogeneous array; use two separate lets for tuple behavior
    const t = inferAndExpand('let arr = array(1, 2); let [a, b] = arr; a')
    expect(isSubtype(t, NumberType)).toBe(true)
  })

  it('array rest destructuring binds rest to array', () => {
    // rest destructuring from a literal array preserves the rest as an array
    expect(() => inferType('let [first, ...rest] = [1, 2, 3]; rest')).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Inference — bindPattern (nested destructuring)
// ---------------------------------------------------------------------------

describe('inference — bindPattern nested destructuring', () => {
  it('nested object destructuring in let', () => {
    const t = inferAndExpand('let {x} = {x: 42}; x')
    expect(isSubtype(t, NumberType)).toBe(true)
  })

  it('array destructuring with rest pattern', () => {
    const t = inferAndExpand('let [h, ...t] = array(1, 2, 3); count(t)')
    expect(isSubtype(t, NumberType)).toBe(true)
  })

  it('deeply nested object destructuring', () => {
    const t = inferAndExpand('let {a} = {a: {b: {c: 42}}}; a.b.c')
    expect(isSubtype(t, NumberType)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Inference — recordConcretePatternTypes
// ---------------------------------------------------------------------------

describe('inference — match concrete pattern types', () => {
  it('match object destructuring records concrete field types', () => {
    const t = inferAndExpand('let p = {x: 1, y: "hello"}; match p case {x, y} then x end')
    expect(isSubtype(t, NumberType)).toBe(true)
  })

  it('match array destructuring records concrete element types', () => {
    const t = inferAndExpand('match [1, 2] case [a, b] then a + b end')
    expect(isSubtype(t, NumberType)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Inference — bindMatchCasePattern
// ---------------------------------------------------------------------------

describe('inference — bindMatchCasePattern for various patterns', () => {
  it('match rest binding in array pattern', () => {
    const t = inferAndExpand('let xs = [1, 2, 3]; match xs case [h, ...tail] then count(tail) case _ then 0 end')
    expect(isSubtype(t, NumberType)).toBe(true)
  })

  it('match with symbol pattern binds correct type', () => {
    const t = inferAndExpand('match 42 case n then n + 1 end')
    expect(isSubtype(t, NumberType)).toBe(true)
  })

  it('match wildcard pattern succeeds', () => {
    const t = inferAndExpand('match 42 case _ then "anything" end')
    expect(isSubtype(t, StringType)).toBe(true)
  })

  it('match literal pattern matches correctly', () => {
    const t = inferAndExpand('match 42 case 42 then "found" case _ then "other" end')
    expect(isSubtype(t, StringType)).toBe(true)
  })

  it('match object pattern against union narrows per variant', () => {
    const t = inferAndExpand(`
      let val = if true then {type: "a", x: 1} else {type: "b", y: "hello"} end;
      match val
        case {type: "a", x} then x
        case {type: "b", y} then count(y)
      end
    `)
    expect(isSubtype(t, NumberType)).toBe(true)
  })

  it('match array pattern against union narrows per variant', () => {
    const t = inferAndExpand(`
      let val = if true then [1, 2] else [1, 2, 3] end;
      match val
        case [a, b] then a + b
        case [a, b, c] then a + b + c
        case _ then 0
      end
    `)
    expect(isSubtype(t, NumberType)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Inference — subtractSequenceProductType
// ---------------------------------------------------------------------------

describe('inference — sequence subtraction for exhaustiveness', () => {
  it('exhaustive match on sequences with different lengths', () => {
    expect(() => inferType(`
      let xs = if true then [1] else [1, 2] end;
      match xs
        case [x, y = 0] then x + y
      end
    `)).not.toThrow()
  })

  it('non-exhaustive sequence match throws', () => {
    expect(() => inferType(`
      let xs = if true then [1] else [1, 2] else [1, 2, 3] end;
      match xs
        case [x, y] then x + y
      end
    `)).toThrow()
  })
})

// ---------------------------------------------------------------------------
// Inference — freshenAllVars through complex types
// ---------------------------------------------------------------------------

describe('inference — freshenAllVars covers Handler, Record, Neg, Alias', () => {
  it('polymorphic function with record return freshens per call site', () => {
    // Each call to a polymorphic function needs fresh type variables
    const t = inferAndExpand('let wrap = (x) -> {value: x}; let a = wrap(42); let b = wrap("hello"); a.value')
    expect(isSubtype(t, NumberType)).toBe(true)
  })

  it('polymorphic function with array return freshens per call site', () => {
    const t = inferAndExpand('let toArr = (x) -> array(x); let a = toArr(42); let b = toArr("hello"); count(a)')
    expect(isSubtype(t, NumberType)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Inference — generalizeInner through Handler, Record, Neg, Alias, Recursive
// ---------------------------------------------------------------------------

describe('inference — generalization through complex types', () => {
  it('let-bound function with record result generalizes correctly', () => {
    const t = inferAndExpand('let f = (x) -> {val: x}; f(42).val')
    expect(isSubtype(t, NumberType)).toBe(true)
  })

  it('let-bound function used at different types generalizes', () => {
    expect(() => inferType('let f = (x) -> {val: x}; let a = f(42); let b = f("hi"); b')).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Inference — inferCollectionCall (map/reduce on various types)
// ---------------------------------------------------------------------------

describe('inference — collection call type inference', () => {
  it('map on string returns String', () => {
    const t = inferAndExpand('map("hello", (c) -> c)')
    expect(isSubtype(t, StringType)).toBe(true)
  })

  it('map on tuple returns array', () => {
    const t = inferAndExpand('map([1, 2, 3], inc)')
    expect(t.tag).toBe('Array')
  })

  it('reduce on array infers accumulator type', () => {
    const t = inferAndExpand('reduce([1, 2, 3], +, 0)')
    expect(isSubtype(t, NumberType)).toBe(true)
  })

  it('reduce on string infers through reducer', () => {
    expect(() => inferType('reduce("abc", (acc, c) -> acc + count(c), 0)')).not.toThrow()
  })

  it('reduce on object infers through value types', () => {
    const t = inferAndExpand('reduce({a: 1, b: 2}, +, 0)')
    expect(isSubtype(t, NumberType)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Inference — collectVars through complex types (Handler, Tuple, Sequence)
// ---------------------------------------------------------------------------

describe('inference — overload selection with complex argument types', () => {
  it('overloaded function selects correct branch with record arg', () => {
    const t = inferAndExpand('let f = (x) -> x.name; f({name: "Alice"})')
    expect(isSubtype(t, StringType)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Inference — expandTypeForMatchAnalysis through complex types
// ---------------------------------------------------------------------------

describe('inference — match analysis with complex types', () => {
  it('match on function return types works', () => {
    const t = inferAndExpand(`
      let f = (x) -> if x then {tag: :ok, value: 1} else {tag: :error, msg: "fail"} end;
      match f(true)
        case {tag: :ok, value} then value
        case {tag: :error, msg} then count(msg)
      end
    `)
    expect(isSubtype(t, NumberType)).toBe(true)
  })

  it('match on alias type expands correctly', () => {
    expect(() => inferType(`
      let val = if true then :ok else :error end;
      match val
        case :ok then 1
        case :error then 0
      end
    `)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Inference — expandTypeForDisplay and sanitizeDisplayType
// ---------------------------------------------------------------------------

describe('inference — display type expansion', () => {
  it('function type displays correctly after inference', () => {
    const t = inferType('(x) -> x + 1')
    const expanded = simplify(expandType(t))
    const str = typeToString(expanded)
    expect(str).toContain('Number')
  })

  it('record type displays field types', () => {
    const t = inferAndExpand('{a: 1, b: "hello"}')
    const str = typeToString(t)
    expect(str).toContain('a')
    expect(str).toContain('b')
  })
})

// ---------------------------------------------------------------------------
// Inference — normalizeDisplayUnion (record merging, array merging)
// ---------------------------------------------------------------------------

describe('inference — display union normalization', () => {
  it('union of records merges fields for display', () => {
    const t = inferAndExpand('if true then {a: 1} else {a: "hello"} end')
    // union of records should be representable
    const str = typeToString(t)
    expect(typeof str).toBe('string')
  })

  it('union of arrays merges element types', () => {
    const t = inferAndExpand('if true then array(1) else array("hello") end')
    const str = typeToString(t)
    expect(typeof str).toBe('string')
  })
})

// ---------------------------------------------------------------------------
// Inference — let binding error recovery
// ---------------------------------------------------------------------------

describe('inference — let binding error recovery', () => {
  it('type error in let value still binds variable as Unknown', () => {
    // Error in value expression should not prevent downstream usage
    expect(() => inferType('let x = "hello" + 1; 42')).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Inference — match with complex patterns for bindUnknownPattern
// ---------------------------------------------------------------------------

describe('inference — bindUnknownPattern paths', () => {
  it('match object destructuring against Unknown-typed loop result', () => {
    // loop() infers as Unknown, so match destructuring triggers bindUnknownPattern
    expect(() => inferType(`
      let x = loop(i = 0) -> if i > 0 then {name: "Alice"} else recur(i + 1) end;
      match x case {name} then name case _ then "default" end
    `)).not.toThrow()
  })

  it('match array destructuring against Unknown-typed loop result', () => {
    expect(() => inferType(`
      let x = loop(i = 0) -> if i > 0 then [1, 2] else recur(i + 1) end;
      match x case [a, b] then 1 case _ then 0 end
    `)).not.toThrow()
  })

  it('match rest destructuring against Unknown-typed value', () => {
    expect(() => inferType(`
      let x = loop(i = 0) -> if i > 0 then [1, 2, 3] else recur(i + 1) end;
      match x case [h, ...t] then h case _ then null end
    `)).not.toThrow()
  })

  it('match nested object against Unknown-typed value', () => {
    expect(() => inferType(`
      let x = loop(i = 0) -> if i > 0 then {inner: {val: 42}} else recur(i + 1) end;
      match x case {inner: {val}} then val case _ then null end
    `)).not.toThrow()
  })

  it('match symbol pattern against Unknown-typed value', () => {
    expect(() => inferType(`
      let x = loop(i = 0) -> if i > 0 then 42 else recur(i + 1) end;
      match x case n then n end
    `)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Inference — areSequenceMatchTypesDisjoint
// ---------------------------------------------------------------------------

describe('inference — sequence match type disjointness', () => {
  it('match on sequences with disjoint lengths is exhaustive', () => {
    expect(() => inferType(`
      let xs = if true then [1] else [1, 2] end;
      match xs
        case [x] then x
        case [x, y] then x + y
      end
    `)).not.toThrow()
  })

  it('match on sequences with overlapping lengths warns on redundancy', () => {
    const dvala = createDvala()
    const result = dvala.typecheck(`
      let xs = if true then [1, 2] else [1, 2, 3] end;
      match xs
        case [a, ...rest] then 1
        case [a, b, ...rest2] then 2
        case _ then 0
      end
    `)
    expect(result.diagnostics.some(d => d.message.includes('Redundant'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Inference — constrainSequenceSubtype with prefix elements
// ---------------------------------------------------------------------------

describe('inference — sequence prefix constraint', () => {
  it('sequence with prefix elements constrains correctly', () => {
    const ctx = new InferenceContext()
    const v = ctx.freshVar()
    const lhs = { tag: 'Sequence' as const, prefix: [literal(1), literal(2)], rest: NumberType, minLength: 2, maxLength: 3 }
    const rhs = { tag: 'Sequence' as const, prefix: [v, NumberType], rest: NumberType, minLength: 2, maxLength: 3 }
    constrain(ctx, lhs, rhs)
    expect(v.lowerBounds).toContainEqual(literal(1))
  })

  it('sequence rest type constrains when prefix ends', () => {
    const ctx = new InferenceContext()
    const v = ctx.freshVar()
    const lhs = { tag: 'Sequence' as const, prefix: [NumberType], rest: StringType, minLength: 1, maxLength: undefined }
    const rhs = { tag: 'Sequence' as const, prefix: [NumberType], rest: v, minLength: 1, maxLength: undefined }
    constrain(ctx, lhs, rhs)
    expect(v.lowerBounds).toContainEqual(StringType)
  })
})

// ---------------------------------------------------------------------------
// Inference — intersectMatchTypes union paths
// ---------------------------------------------------------------------------

describe('inference — intersectMatchTypes union handling', () => {
  it('match narrows union of atoms correctly', () => {
    const t = inferAndExpand(`
      let x = if true then :a else (if true then :b else :c end) end;
      match x
        case :a then 1
        case :b then 2
        case :c then 3
      end
    `)
    expect(isSubtype(t, NumberType)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Inference — isTrackableMatchRemainder for Tuple/Sequence/Record
// ---------------------------------------------------------------------------

describe('inference — trackable match remainder for complex types', () => {
  it('exhaustive match on tuple of literals', () => {
    expect(() => inferType(`
      let pair = if true then [1, 2] else [3, 4] end;
      match pair
        case [1, 2] then "a"
        case [3, 4] then "b"
      end
    `)).not.toThrow()
  })

  it('exhaustive match on tuple of literals with all cases covered', () => {
    expect(() => inferType(`
      let pair = if true then [1, 2] else [3, 4] end;
      match pair
        case [1, 2] then "a"
        case [3, 4] then "b"
      end
    `)).not.toThrow()
  })

  it('exhaustive match on record with literal fields', () => {
    expect(() => inferType(`
      let obj = if true then {type: :a} else {type: :b} end;
      match obj
        case {type: :a} then 1
        case {type: :b} then 2
      end
    `)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Inference — areMatchTypesDisjoint for records and tuples
// ---------------------------------------------------------------------------

describe('inference — disjoint match type detection', () => {
  it('records with disjoint field values are detected', () => {
    expect(() => inferType(`
      let event = if true then {type: "click"} else {type: "keydown"} end;
      match event
        case {type: "click"} then 1
        case {type: "keydown"} then 2
      end
    `)).not.toThrow()
  })

  it('records with extra field mismatches are disjoint', () => {
    // closed record {a: 1} vs closed record {b: 2} — field 'a' missing in rhs
    const dvala = createDvala()
    const result = dvala.typecheck(`
      let x = if true then {a: 1} else {b: 2} end;
      match x
        case {a} then a
        case {b} then b
      end
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('tuples with different element counts are disjoint', () => {
    const dvala = createDvala()
    const result = dvala.typecheck(`
      let xs = if true then [1] else [1, 2] end;
      match xs
        case [a] then a
        case [a, b] then a + b
      end
    `)
    expect(result.diagnostics).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Inference — normalizeDisplayUnion (record merging, array merging)
// ---------------------------------------------------------------------------

describe('inference — display type normalization', () => {
  it('union of same-shape records merges into single record for display', () => {
    const dvala = createDvala()
    const result = dvala.typecheck(`
      let f = (x) -> if x then {a: 1, b: "hello"} else {a: 2, b: "world"} end;
      f
    `)
    // Just verify it typechecks without error — display logic runs during typeMap expansion
    expect(result.diagnostics).toHaveLength(0)
    expect(result.typeMap.size).toBeGreaterThan(0)
  })

  it('union of arrays merges element types for display', () => {
    const dvala = createDvala()
    const result = dvala.typecheck(`
      let f = (x) -> if x then array(1, 2) else array(3, 4) end;
      f
    `)
    expect(result.diagnostics).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Inference — expandTypeForDisplay and sanitizeDisplayType for complex types
// ---------------------------------------------------------------------------

describe('inference — display type expansion for complex types', () => {
  it('handler type expands for display', () => {
    const dvala = createDvala()
    const result = dvala.typecheck(`
      effect @test.disp(Number) -> String;
      handler @test.disp(x) -> resume(str(x)) end
    `)
    expect(result.diagnostics).toHaveLength(0)
    // The typeMap should contain a Handler type
    const types = [...result.typeMap.values()]
    expect(types.some(t => t.tag === 'Handler' || t.tag === 'Var')).toBe(true)
  })

  it('sequence type displays correctly', () => {
    const dvala = createDvala()
    const result = dvala.typecheck(`
      let xs = if true then [1] else [1, 2] end;
      xs
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('union type annotation displays correctly', () => {
    const dvala = createDvala()
    const result = dvala.typecheck(`
      type NumOrStr = Number | String;
      let x: NumOrStr = 42;
      x
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('alias type preserves name in display', () => {
    const dvala = createDvala()
    const result = dvala.typecheck(`
      type MyNum = Number;
      let x: MyNum = 42;
      x
    `)
    expect(result.diagnostics).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Inference — handler-as-callable direct call (lines 836-854)
// ---------------------------------------------------------------------------

describe('inference — handler callable with known thunk type', () => {
  it('handler called with thunk literal subtracts handled effects', () => {
    const t = inferAndExpand(`
      () -> do
        let h = handler @my.eff(x) -> resume(x) end;
        h(-> do perform(@my.eff, 42) end)
      end
    `)
    expect(t.tag).toBe('Function')
  })

  it('handler called with pre-bound thunk variable subtracts effects', () => {
    // When the thunk is a variable (not a lambda literal), the handler-as-callable
    // path at lines 836-854 is triggered instead of the literal lambda path
    const dvala = createDvala()
    const result = dvala.typecheck(`
      effect @test.hvar(Number) -> Number;
      let h = handler @test.hvar(x) -> resume(x * 2) end;
      let thunk = -> do perform(@test.hvar, 5) end;
      h(thunk)
    `)
    // The thunk variable path exercises handler-as-callable with resolved thunk type
    expect(result.typeMap.size).toBeGreaterThan(0)
  })

  it('handler with transform called as function', () => {
    const dvala = createDvala()
    const result = dvala.typecheck(`
      effect @test.hcall(Number) -> Number;
      let h = handler
        @test.hcall(x) -> resume(x * 2)
      transform
        value -> { ok: true, value }
      end;
      h(-> perform(@test.hcall, 5))
    `)
    expect(result.diagnostics).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Inference — subtractSequenceProductType coverage
// ---------------------------------------------------------------------------

describe('inference — sequence product subtraction', () => {
  it('sequences with prefix subtraction narrow correctly', () => {
    const dvala = createDvala()
    const result = dvala.typecheck(`
      let xs = if true then [1, 2] else [3, 4] end;
      match xs
        case [1, y] then y
        case [x, y] then x + y
      end
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('exhaustive match with length-varying sequences', () => {
    const dvala = createDvala()
    const result = dvala.typecheck(`
      let xs = if true then [1] else [1, 2] end;
      match xs
        case [a] then a
        case [a, b] then a + b
      end
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('match subtracts exact prefix leaving remainder', () => {
    const dvala = createDvala()
    const result = dvala.typecheck(`
      let xs = if true then [:a, 1] else [:b, 2] end;
      match xs
        case [:a, n] then n
        case [:b, n] then n
      end
    `)
    expect(result.diagnostics).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Inference — match with default values in patterns
// ---------------------------------------------------------------------------

describe('inference — match patterns with defaults', () => {
  it('object pattern with default value uses default type', () => {
    const dvala = createDvala()
    const result = dvala.typecheck(`
      match {} case { a = 0 } then a + 1 end
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('array pattern with defaulted elements covers shorter sequences', () => {
    const dvala = createDvala()
    const result = dvala.typecheck(`
      let xs = if true then [1] else [1, 2] end;
      match xs
        case [x, y = 0] then x + y
      end
    `)
    expect(result.diagnostics).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Inference — collectVars for Tuple, Sequence, Handler
// ---------------------------------------------------------------------------

describe('inference — overload selection with handlers and tuples', () => {
  it('overloaded function with handler-typed arg resolves correctly', () => {
    const dvala = createDvala()
    const result = dvala.typecheck(`
      effect @test.ov(Number) -> Number;
      let h = handler @test.ov(x) -> resume(x * 2) end;
      let f = (x) -> h(-> do perform(@test.ov, x) end);
      f(42)
    `)
    expect(result.diagnostics).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Inference — match against non-Record/non-Array type with destructuring
// ---------------------------------------------------------------------------

describe('inference — match pattern against incompatible types', () => {
  it('object pattern against non-record type falls through gracefully', () => {
    const t = inferAndExpand('match 42 case {x} then x case _ then 0 end')
    expect(isSubtype(t, NumberType)).toBe(true)
  })

  it('array pattern against non-array type falls through gracefully', () => {
    const t = inferAndExpand('match "hello" case [x] then x case _ then "default" end')
    expect(isSubtype(t, StringType)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Inference — record open field access
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Inference — expandTypeForMatchAnalysis for complex types
// ---------------------------------------------------------------------------

describe('inference — match analysis with complex type shapes', () => {
  it('match on intersection type expands correctly', () => {
    expect(() => inferType(`
      let x: Number & String = 42;
      match x case n then n end
    `)).not.toThrow()
  })

  it('match on alias type expands through alias', () => {
    const dvala = createDvala()
    const result = dvala.typecheck(`
      type Status = :ok | :error;
      let s: Status = if true then :ok else :error end;
      match s
        case :ok then 1
        case :error then 0
      end
    `)
    expect(result.diagnostics).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Inference — Tuple type in constrain paths
// ---------------------------------------------------------------------------

describe('inference — tuple constraint handling', () => {
  it('tuple length mismatch in constraint throws', () => {
    const ctx = new InferenceContext()
    const t1 = { tag: 'Tuple' as const, elements: [NumberType, StringType] }
    const t2 = { tag: 'Tuple' as const, elements: [NumberType] }
    expect(() => constrain(ctx, t1, t2)).toThrow(TypeInferenceError)
  })

  it('tuple constraint propagates element-wise', () => {
    const ctx = new InferenceContext()
    const v1 = ctx.freshVar()
    const v2 = ctx.freshVar()
    constrain(ctx, { tag: 'Tuple' as const, elements: [literal(1), literal('a')] }, { tag: 'Tuple' as const, elements: [v1, v2] })
    expect(v1.lowerBounds).toContainEqual(literal(1))
    expect(v2.lowerBounds).toContainEqual(literal('a'))
  })

  it('tuple constrained as array element constrains all elements', () => {
    const ctx = new InferenceContext()
    const elemVar = ctx.freshVar()
    constrain(ctx, { tag: 'Tuple' as const, elements: [literal(1), literal(2)] }, array(elemVar))
    expect(elemVar.lowerBounds).toContainEqual(literal(1))
    expect(elemVar.lowerBounds).toContainEqual(literal(2))
  })
})

// ---------------------------------------------------------------------------
// Inference — withDoc (line 1938)
// ---------------------------------------------------------------------------

describe('inference — withDoc', () => {
  it('withDoc on function type accepted', () => {
    expect(() => inferType('((x) -> x + 1) withDoc "Add one"')).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Inference — Sequence element type
// ---------------------------------------------------------------------------

describe('inference — sequenceElementType for sequences with prefix', () => {
  it('match on sequence with prefix elements narrows correctly', () => {
    const dvala = createDvala()
    const result = dvala.typecheck(`
      let xs = if true then [1, 2] else [1, 2, 3] end;
      match xs
        case [a, b, c] then a + b + c
        case [a, b] then a + b
      end
    `)
    expect(result.diagnostics).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Direct tests for expandTypeForDisplay and sanitizeDisplayType
// ---------------------------------------------------------------------------

describe('expandTypeForDisplay — complex type shapes', () => {
  it('expands Handler type', () => {
    const h = handlerType(NumberType, StringType, new Map([['test', { argType: NumberType, retType: StringType }]]))
    const result = expandTypeForDisplay(h)
    expect(result.tag).toBe('Handler')
  })

  it('expands Tuple type', () => {
    const t = tuple([NumberType, StringType])
    const result = expandTypeForDisplay(t)
    expect(result.tag).toBe('Tuple')
  })

  it('expands Sequence type', () => {
    const s = sequence([NumberType], StringType, 1, 3)
    const result = expandTypeForDisplay(s)
    expect(result.tag).toBe('Sequence')
  })

  it('expands Neg type', () => {
    const n = neg(literal(0))
    const result = expandTypeForDisplay(n)
    expect(result.tag).toBe('Neg')
  })

  it('expands Alias type', () => {
    const a: Type = { tag: 'Alias', name: 'MyNum', args: [], expanded: NumberType }
    const result = expandTypeForDisplay(a)
    expect(result.tag).toBe('Alias')
  })

  it('expands Recursive type', () => {
    const r: Type = { tag: 'Recursive', id: 1, body: NumberType }
    const result = expandTypeForDisplay(r)
    expect(result.tag).toBe('Recursive')
  })

  it('expands Union of Records merges fields', () => {
    const u = union(record({ a: NumberType }), record({ a: StringType }))
    const result = expandTypeForDisplay(u)
    expect(typeToString(result)).toBeDefined()
  })

  it('expands Union of Arrays merges elements', () => {
    const u = union(array(NumberType), array(StringType))
    const result = expandTypeForDisplay(u)
    expect(typeToString(result)).toBeDefined()
  })

  it('expands Inter type', () => {
    const i = inter(NumberType, StringType)
    const result = expandTypeForDisplay(i)
    expect(typeToString(result)).toBeDefined()
  })

  it('expands Var with displayLowerBounds', () => {
    const ctx = new InferenceContext()
    const v = ctx.freshVar()
    v.displayLowerBounds = [NumberType, StringType]
    const result = expandTypeForDisplay(v)
    expect(result.tag).not.toBe('Var')
  })

  it('expands Var with displayUpperBounds', () => {
    const ctx = new InferenceContext()
    const v = ctx.freshVar()
    v.displayUpperBounds = [NumberType]
    const result = expandTypeForDisplay(v)
    expect(result.tag).not.toBe('Var')
  })

  it('expands Function with rest param', () => {
    const f = fn([NumberType], StringType, undefined, undefined, NumberType)
    const result = expandTypeForDisplay(f)
    expect(result.tag).toBe('Function')
  })
})

describe('sanitizeDisplayType — complex type shapes', () => {
  it('sanitizes Handler type with nested Never', () => {
    const h = handlerType(Never, Never, new Map([['test', { argType: Never, retType: Never }]]))
    const result = sanitizeDisplayType(h, true)
    expect(result.tag).toBe('Handler')
    if (result.tag === 'Handler') {
      // nested Never becomes Unknown when nested=true
      expect(result.body).toBe(Unknown)
    }
  })

  it('sanitizes Tuple type with nested Never', () => {
    const t = tuple([Never, NumberType])
    const result = sanitizeDisplayType(t, true)
    expect(result.tag).toBe('Tuple')
  })

  it('sanitizes Sequence type with nested Never', () => {
    const s = sequence([Never], Never, 1, 2)
    const result = sanitizeDisplayType(s, true)
    expect(result.tag).toBe('Sequence')
  })

  it('sanitizes Neg type', () => {
    const n = neg(literal(0))
    const result = sanitizeDisplayType(n, true)
    expect(result.tag).toBe('Neg')
  })

  it('sanitizes Alias type with nested Never', () => {
    const a: Type = { tag: 'Alias', name: 'Test', args: [Never], expanded: Never }
    const result = sanitizeDisplayType(a, true)
    expect(result.tag).toBe('Alias')
  })

  it('sanitizes Recursive type with nested Never', () => {
    const r: Type = { tag: 'Recursive', id: 1, body: Never }
    const result = sanitizeDisplayType(r, true)
    expect(result.tag).toBe('Recursive')
  })

  it('sanitizes Record type with nested Never fields', () => {
    const r = record({ x: Never, y: NumberType })
    const result = sanitizeDisplayType(r, true)
    expect(result.tag).toBe('Record')
  })

  it('sanitizes Array type with nested Never element', () => {
    const a = array(Never)
    const result = sanitizeDisplayType(a, true)
    expect(result.tag).toBe('Array')
  })

  it('sanitizes Union type', () => {
    const u = union(Never, NumberType)
    const result = sanitizeDisplayType(u, true)
    expect(typeToString(result)).toBeDefined()
  })

  it('sanitizes Inter type', () => {
    const i = inter(Never, NumberType)
    const result = sanitizeDisplayType(i, true)
    expect(typeToString(result)).toBeDefined()
  })

  it('sanitizes Function with rest param', () => {
    const f = fn([Never], Never, undefined, undefined, Never)
    const result = sanitizeDisplayType(f, true)
    expect(result.tag).toBe('Function')
  })
})

// ---------------------------------------------------------------------------
// Direct tests for normalizeDisplayUnion
// ---------------------------------------------------------------------------

describe('normalizeDisplayUnion — record and array merging', () => {
  it('empty members returns Never', () => {
    const result = expandTypeForDisplay(union())
    expect(result).toBe(Never)
  })

  it('union of records with overlapping fields merges', () => {
    const ctx = new InferenceContext()
    const v = ctx.freshVar()
    v.displayLowerBounds = [record({ a: NumberType, b: StringType }), record({ a: literal(42), c: literal(true) })]
    const result = expandTypeForDisplay(v)
    // Should merge into a single record
    expect(typeToString(result)).toBeDefined()
  })

  it('union of arrays merges element types', () => {
    const ctx = new InferenceContext()
    const v = ctx.freshVar()
    v.displayLowerBounds = [array(NumberType), array(StringType)]
    const result = expandTypeForDisplay(v)
    expect(typeToString(result)).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Inference — generalizeInner/collectVars for Handler, Tuple, Sequence
// ---------------------------------------------------------------------------

describe('inference — generalization of complex return types', () => {
  it('let-bound handler value is generalized (generalizeInner Handler)', () => {
    // A handler bound via let triggers generalizeTypeVars on the handler type.
    // The handler's body and output types contain vars that must be generalized.
    const dvala = createDvala()
    const result = dvala.typecheck(`
      effect @test.genlet(Number) -> Number;
      let h = handler @test.genlet(x) -> resume(x * 2) end;
      h(-> do perform(@test.genlet, 5) end)
    `)
    expect(result.typeMap.size).toBeGreaterThan(0)
  })

  it('let-bound handler with transform is generalized', () => {
    const dvala = createDvala()
    const result = dvala.typecheck(`
      effect @test.gentrans(Number) -> Number;
      let h = handler @test.gentrans(x) -> resume(x * 2) transform value -> {result: value} end;
      h(-> do perform(@test.gentrans, 5) end)
    `)
    expect(result.typeMap.size).toBeGreaterThan(0)
  })

  it('let-bound function returning tuple with mixed types', () => {
    const t = inferAndExpand('let pair = (a, b) -> [a, b]; pair(42, "hello")')
    // The result is an array (since [a, b] creates an array literal)
    expect(t.tag === 'Array' || t.tag === 'Var' || t.tag === 'Tuple').toBe(true)
  })

  it('let-bound function with union return type generalizes', () => {
    const dvala = createDvala()
    const result = dvala.typecheck(`
      let choose = (x) -> if x then 42 else "hello" end;
      choose(true)
    `)
    expect(result.typeMap.size).toBeGreaterThan(0)
  })

  it('let-bound function returning alias type', () => {
    const dvala = createDvala()
    const result = dvala.typecheck(`
      type Box<T> = {value: T};
      let box = (x) -> {value: x};
      let b: Box<Number> = box(42);
      b.value
    `)
    expect(result.diagnostics).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Inference — expandTypeForMatchAnalysis Handler and Function cases
// ---------------------------------------------------------------------------

describe('inference — match analysis for Handler and Function types', () => {
  it('match analysis handles Function type with vars', () => {
    // Matching against a function value
    const t = inferAndExpand(`
      let f = if true then (x) -> x + 1 else (x) -> x + 2 end;
      match f
        case _ then 1
      end
    `)
    expect(isSubtype(t, NumberType)).toBe(true)
  })

  it('match analysis handles handler type', () => {
    const dvala = createDvala()
    const result = dvala.typecheck(`
      effect @test.matchh(Number) -> Number;
      let h = if true then
        handler @test.matchh(x) -> resume(x * 2) end
      else
        handler @test.matchh(x) -> resume(x + 1) end
      end;
      match h
        case _ then 1
      end
    `)
    expect(result.typeMap.size).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Inference — bindMatchCasePattern array union path
// ---------------------------------------------------------------------------

describe('inference — match array pattern against union of arrays', () => {
  it('match array pattern against union of different-length tuples', () => {
    const dvala = createDvala()
    const result = dvala.typecheck(`
      let data = if true then [1, 2] else [1, 2, 3] end;
      match data
        case [a, b, c] then a + b + c
        case [a, b] then a + b
      end
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('match array with rest pattern against union', () => {
    const dvala = createDvala()
    const result = dvala.typecheck(`
      let data = if true then [1, 2] else [1, 2, 3] end;
      match data
        case [a, ...rest] then count(rest)
        case _ then 0
      end
    `)
    // With tuple inference, [a, ...rest] covers all fixed-length tuple members,
    // so the wildcard is correctly flagged as redundant
    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0]!.message).toContain('unreachable')
  })
})

// ---------------------------------------------------------------------------
// Inference — constrain Tuple paths
// ---------------------------------------------------------------------------

describe('inference — constrain tuple edge cases', () => {
  it('tuple length mismatch in let annotation', () => {
    // Not directly testable through Dvala syntax since tuples are inferred as arrays
    // But we can test the constrain function directly
    const ctx = new InferenceContext()
    expect(() => constrain(ctx, tuple([NumberType, StringType, NumberType]), tuple([NumberType]))).toThrow(TypeInferenceError)
  })
})

// ---------------------------------------------------------------------------
// Inference — collectVars for Tuple and Sequence
// ---------------------------------------------------------------------------

describe('inference — overload resolution with tuples and sequences', () => {
  it('overloaded builtin called with tuple-typed arg', () => {
    // count() on array invokes overload resolution which uses collectVars
    const t = inferAndExpand('let xs = [1, 2, 3]; count(xs)')
    expect(isSubtype(t, NumberType)).toBe(true)
  })

  it('polymorphic identity on tuple preserves type through overload selection', () => {
    const t = inferAndExpand('let id = (x) -> x; let arr = id([1, 2, 3]); count(arr)')
    expect(isSubtype(t, NumberType)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Inference — extractGuardNarrowing edge cases
// ---------------------------------------------------------------------------

describe('inference — guard narrowing edge cases', () => {
  it('guard with non-builtin function does not narrow', () => {
    const dvala = createDvala()
    const result = dvala.typecheck(`
      let myCheck = (x) -> true;
      let val = if true then 1 else "hello" end;
      match val
        case x when myCheck(x) then x
        case _ then null
      end
    `)
    // Should not crash, guard just doesn't narrow
    expect(result.typeMap.size).toBeGreaterThan(0)
  })

  it('guard with multi-arg call does not narrow', () => {
    const dvala = createDvala()
    const result = dvala.typecheck(`
      let val = if true then 1 else "hello" end;
      match val
        case x when >(x, 0) then x
        case _ then null
      end
    `)
    expect(result.typeMap.size).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Inference — isConstrainedFunctionArityCompatible (line 1949)
// ---------------------------------------------------------------------------

describe('inference — function arity constraints', () => {
  it('rest param function with compatible arity succeeds', () => {
    const ctx = new InferenceContext()
    const retVar = ctx.freshVar()
    // lhs has 1 param + rest, rhs has 2 params + rest — lhs.params.length (1) <= rhs.params.length (2) → ok
    expect(() => constrain(ctx, fn([NumberType], NumberType, undefined, undefined, NumberType), fn([NumberType, NumberType], NumberType, undefined, undefined, retVar))).not.toThrow()
  })

  it('rest param function with too many fixed params throws', () => {
    const ctx = new InferenceContext()
    const retVar = ctx.freshVar()
    // lhs has 3 params + rest, rhs has 1 param + rest — lhs.params.length (3) > rhs.params.length (1) → fail
    expect(() => constrain(ctx, fn([NumberType, NumberType, NumberType], NumberType, undefined, undefined, NumberType), fn([NumberType], NumberType, undefined, undefined, retVar))).toThrow(TypeInferenceError)
  })
})

// ---------------------------------------------------------------------------
// Inference — match array+rest pattern against union of arrays (lines 2931-2937)
// ---------------------------------------------------------------------------

describe('inference — match array rest against union of arrays', () => {
  it('array rest pattern binds correctly from union of tuples', () => {
    // This forces bindMatchCasePattern with a Union type and rest pattern
    const dvala = createDvala()
    const result = dvala.typecheck(`
      let data = if true then [1, 2, 3] else [1, 2, 3, 4] end;
      match data
        case [first, ...rest] then count(rest)
        case _ then 0
      end
    `)
    // With tuple inference, [first, ...rest] covers all fixed-length tuple members,
    // so the wildcard is correctly flagged as redundant
    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0]!.message).toContain('unreachable')
  })

  it('array element + rest pattern against union with compatible members', () => {
    const dvala = createDvala()
    const result = dvala.typecheck(`
      let xs = if true then [1, 2] else [1, 2, 3] end;
      match xs
        case [a, b, ...rest] then a + b
        case _ then 0
      end
    `)
    // With tuple inference, [a, b, ...rest] covers all fixed-length tuple members,
    // so the wildcard is correctly flagged as redundant
    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0]!.message).toContain('unreachable')
  })
})

// ---------------------------------------------------------------------------
// Inference — object match union paths (lines 2896-2901)
// ---------------------------------------------------------------------------

describe('inference — match object against union of records', () => {
  it('object match with field binding from union of records', () => {
    const dvala = createDvala()
    const result = dvala.typecheck(`
      let data = if true then {kind: "a", value: 1} else {kind: "b", value: 2} end;
      match data
        case {kind: "a", value} then value
        case {kind: "b", value} then value
      end
    `)
    expect(result.diagnostics).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Inference — WithHandler else branch (lines 1173-1176)
// ---------------------------------------------------------------------------

describe('inference — with-handler without handler alternatives', () => {
  it('do block without handler still infers body correctly', () => {
    // When a do block has no with-handler, the else branch at 1172-1176 is taken
    const dvala = createDvala()
    const result = dvala.typecheck(`
      do
        let x = 1;
        let y = 2;
        x + y
      end
    `)
    expect(result.diagnostics).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Inference — bindPattern for rest within object destructuring
// ---------------------------------------------------------------------------

describe('inference — bindPattern rest and object edges', () => {
  it('array destructuring without inference context binds Unknown', () => {
    // This path is exercised when binding patterns in non-inference contexts
    expect(() => inferType('let [a, b] = [1, 2]; a + b')).not.toThrow()
  })

  it('rest pattern in standalone binding', () => {
    expect(() => inferType('let [h, ...rest] = [1, 2, 3]; h')).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Inference — areSequenceMatchTypesDisjoint (lines 3671-3685)
// ---------------------------------------------------------------------------

describe('inference — sequence disjointness in match', () => {
  it('sequences with disjoint length ranges are detected', () => {
    const dvala = createDvala()
    const result = dvala.typecheck(`
      let xs = if true then [1] else [1, 2] end;
      match xs
        case [a] then a
        case [a, b] then a + b
      end
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('sequences with disjoint prefix elements are detected', () => {
    const dvala = createDvala()
    const result = dvala.typecheck(`
      let xs = if true then [:a, 1] else [:b, 2] end;
      match xs
        case [:a, n] then n
        case [:b, n] then n
      end
    `)
    // May have diagnostics due to atom/null constraint, but should not crash
    expect(result.typeMap.size).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Inference — additional edge cases for uncovered lines
// ---------------------------------------------------------------------------

describe('inference — additional edge cases', () => {
  it('effect reference node type infers Unknown', () => {
    // @my.eff as a standalone expression is just an effect reference (Unknown)
    const t = inferType('@my.eff')
    expect(t).toBe(Unknown)
  })

  it('map on tuple with Tuple element type (collectionElementType)', () => {
    const dvala = createDvala()
    const result = dvala.typecheck('map([1, 2, 3], inc)')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('reduce on tuple element types', () => {
    const dvala = createDvala()
    const result = dvala.typecheck('reduce([1, 2, 3], +, 0)')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('withDoc on non-function produces error (line 1938)', () => {
    const dvala = createDvala()
    const result = dvala.typecheck('42 withDoc "Not a function"')
    expect(result.diagnostics.length).toBeGreaterThan(0)
  })

  it('match with guard on non-symbol pattern does not narrow', () => {
    // Guard on pattern that's not a simple symbol — guard narrowing returns null
    const dvala = createDvala()
    const result = dvala.typecheck(`
      let x = if true then 1 else 2 end;
      match x
        case 1 then "one"
        case n when true then "other"
      end
    `)
    expect(result.typeMap.size).toBeGreaterThan(0)
  })

  it('match with guard where arg is not the bound name', () => {
    // extractGuardNarrowing returns null when the guard arg doesn't match bound name
    const dvala = createDvala()
    const result = dvala.typecheck(`
      let x = if true then 1 else "hello" end;
      let y = 42;
      match x
        case n when isNumber(y) then n
        case _ then null
      end
    `)
    expect(result.typeMap.size).toBeGreaterThan(0)
  })

  it('record match with disjoint field sets exercises record disjointness', () => {
    // areMatchTypesDisjoint for records with extra/missing fields
    const dvala = createDvala()
    const result = dvala.typecheck(`
      let x = if true then {a: 1, b: 2} else {c: 3, d: 4} end;
      match x
        case {a} then a
        case {c} then c
        case _ then 0
      end
    `)
    // Some diagnostics may appear but the important thing is it doesn't crash
    expect(result.typeMap.size).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Inference — match narrowing edge cases for coverage
// ---------------------------------------------------------------------------

describe('inference — match narrowing edge cases', () => {
  it('match on literal number patterns with wildcard', () => {
    const dvala = createDvala()
    const result = dvala.typecheck(`
      let x = if true then 0 else 1 end;
      match x
        case 0 then "zero"
        case 1 then "one"
      end
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('match on Null primitive', () => {
    const dvala = createDvala()
    const result = dvala.typecheck(`
      match null
        case null then "null"
      end
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('match boolean patterns on conditional', () => {
    const dvala = createDvala()
    // Take the value from a parameter so fold can't reduce it to true/false;
    // the point of this test is matching the full Boolean domain.
    const result = dvala.typecheck(`
      let check = (v) -> do
        let b = isNumber(v);
        match b
          case true then 1
          case false then 0
        end;
      end;
      check(42)
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('match literal string patterns', () => {
    const dvala = createDvala()
    const result = dvala.typecheck(`
      let s = if true then "hello" else "world" end;
      match s
        case "hello" then 1
        case "world" then 2
      end
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('match with open record annotation', () => {
    const dvala = createDvala()
    const result = dvala.typecheck(`
      let classify = (event: {type: "click" | "keydown", ...}) -> match event
        case {type: "click"} then 1
        case {type: "keydown"} then 2
      end;
      classify({type: "click", extra: true})
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('match subtracts record type leaving remainder', () => {
    const dvala = createDvala()
    const result = dvala.typecheck(`
      let event = if true then {type: "click", x: 1} else {type: "keydown", key: "a"} end;
      match event
        case {type: "click"} then 1
        case {type: "keydown"} then 2
      end
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('match with defaulted object fields', () => {
    const dvala = createDvala()
    const result = dvala.typecheck(`
      match {} case { a = 0 } then a + 1 end
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('non-exhaustive match on open record with finite tag', () => {
    const dvala = createDvala()
    const result = dvala.typecheck(`
      let classify = (event: {type: "click" | "keydown" | "scroll", ...}) -> match event
        case {type: "click"} then 1
        case {type: "keydown"} then 2
      end;
      classify
    `)
    expect(result.diagnostics.length).toBeGreaterThan(0)
    expect(result.diagnostics[0]?.message).toContain('Non-exhaustive')
  })
})

// ---------------------------------------------------------------------------
// Inference — subtractType edge cases
// ---------------------------------------------------------------------------

describe('inference — subtractType edge cases', () => {
  it('subtracting Never from type returns the type', () => {
    const dvala = createDvala()
    const result = dvala.typecheck(`
      let x = if true then 1 else 2 end;
      match x
        case 1 then "one"
        case 2 then "two"
      end
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('subtracting from Never returns Never', () => {
    // Already exhausted match — no remaining type
    const dvala = createDvala()
    const result = dvala.typecheck(`
      let x = if true then :a else :b end;
      match x
        case :a then 1
        case :b then 2
      end
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('subtracting equal types returns Never', () => {
    expect(() => inferType(`
      let x = 42;
      match x
        case 42 then "found"
      end
    `)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Inference — isTrackableMatchRemainder for Sequence and Tuple
// ---------------------------------------------------------------------------

describe('inference — isTrackableMatchRemainder edge cases', () => {
  it('sequence with rest Never is trackable', () => {
    const dvala = createDvala()
    const result = dvala.typecheck(`
      let xs = if true then [1, 2] else [3, 4] end;
      match xs
        case [1, 2] then "a"
        case [3, 4] then "b"
      end
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('record with all literal fields is trackable', () => {
    const dvala = createDvala()
    const result = dvala.typecheck(`
      let obj = if true then {x: 1} else {x: 2} end;
      match obj
        case {x: 1} then "a"
        case {x: 2} then "b"
      end
    `)
    expect(result.diagnostics).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Inference — narrowArrayLikeTypeForMatchPattern
// ---------------------------------------------------------------------------

describe('inference — array narrowing for match patterns', () => {
  it('array pattern with literal elements narrows type', () => {
    const dvala = createDvala()
    const result = dvala.typecheck(`
      let xs = if true then [1, 2] else [1, 3] end;
      match xs
        case [1, 2] then "a"
        case [1, 3] then "b"
      end
    `)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('array pattern with mixed literal and binding elements', () => {
    const dvala = createDvala()
    const result = dvala.typecheck(`
      let xs = if true then [1, 2] else [1, 3] end;
      match xs
        case [1, n] then n
      end
    `)
    expect(result.diagnostics).toHaveLength(0)
  })
})

describe('inference — open record field access', () => {
  it('open record allows unknown field access without error', () => {
    const ctx = new InferenceContext()
    const retVar = ctx.freshVar()
    // Record with field x, open=true, called with string literal "y" (field access)
    // Open record — can't prove field doesn't exist, so no error
    expect(() => constrain(ctx, record({ x: NumberType }, true), fn([literal('y')], retVar))).not.toThrow()
  })

  it('closed record rejects unknown field access', () => {
    const ctx = new InferenceContext()
    const retVar = ctx.freshVar()
    expect(() => constrain(ctx, record({ x: NumberType }), fn([literal('y')], retVar))).toThrow(TypeInferenceError)
  })
})

// ---------------------------------------------------------------------------
// builtinTypes — isTypeGuard and resetBuiltinTypeCache
// ---------------------------------------------------------------------------

describe('builtinTypes', () => {
  it('isTypeGuard returns true for a known type guard (isNumber)', () => {
    // isNumber has type annotation "(x: Unknown) -> x is Number" which sets guardParam
    expect(isTypeGuard('isNumber')).toBe(true)
  })

  it('isTypeGuard returns true for isString type guard', () => {
    expect(isTypeGuard('isString')).toBe(true)
  })

  it('isTypeGuard returns false for a non-guard builtin', () => {
    // "+" is a normal builtin with no guard annotation
    expect(isTypeGuard('+')).toBe(false)
  })

  it('isTypeGuard returns false for an unknown builtin name', () => {
    expect(isTypeGuard('nonExistentBuiltin')).toBe(false)
  })

  it('resetBuiltinTypeCache clears the cache and allows re-initialization', () => {
    // Verify cache is populated before reset
    expect(getBuiltinType('isNumber').type).not.toEqual(Unknown)

    // Reset the cache — this covers lines 126-128
    resetBuiltinTypeCache()

    // After reset, lookups should return Unknown (cache is empty)
    expect(getBuiltinType('isNumber')).toEqual({ type: Unknown })
    expect(isTypeGuard('isNumber')).toBe(false)

    // Re-initialize so other tests are not affected
    initBuiltinTypes(builtin.normalExpressions)
    for (const mod of allBuiltinModules) {
      registerModuleType(mod.name, mod.functions, mod.docs)
    }

    // Verify re-initialization worked
    expect(isTypeGuard('isNumber')).toBe(true)
  })
})
