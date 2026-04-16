import { beforeAll, describe, expect, it } from 'vitest'
import { parse } from '../parser'
import { tokenize } from '../tokenizer/tokenize'
import { minifyTokenStream } from '../tokenizer/minifyTokenStream'
import { builtin } from '../builtin'
import { createDvala } from '../createDvala'
import type { Type } from './types'
import {
  NumberType, StringType, NullType,
  Unknown, Never,
  atom, literal, fn, record, array, inter, neg,
  effectSet, typeToString,
} from './types'
import {
  InferenceContext, TypeEnv,
  inferExpr, constrain, expandType,
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
    registerModuleType(mod.name, mod.functions)
  }
  // Declare test effects used in effect set and handler tests
  declareEffect('my.eff', Unknown, Unknown)
  declareEffect('log', Unknown, Unknown)
  declareEffect('fetch', Unknown, Unknown)
  declareEffect('other.eff', Unknown, Unknown)
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
  const ast = parseToAst(source)
  const ctx = new InferenceContext()
  const env = new TypeEnv()
  const typeMap = new Map<number, Type>()

  let result: Type = Never
  for (const node of ast) {
    result = inferExpr(node, ctx, env, typeMap)
  }
  return result
}

/** Infer and expand (resolve variables to concrete types). */
function inferAndExpand(source: string): Type {
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
  it('if true then 42 else "hello" end → Number | String', () => {
    const t = inferAndExpand('if true then 42 else "hello" end')
    // Result is a union of the two branches
    expect(isSubtype(literal(42), t)).toBe(true)
    expect(isSubtype(literal('hello'), t)).toBe(true)
  })

  it('if true then 42 else 43 end → both are numbers', () => {
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

    const t = inferAndExpand(`
      let useExtra = true;
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

    const t = inferAndExpand(`
      let useExtra = true;
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
      registerModuleType(mod.name, mod.functions)
    }

    // Verify re-initialization worked
    expect(isTypeGuard('isNumber')).toBe(true)
  })
})
