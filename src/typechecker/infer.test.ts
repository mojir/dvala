import { beforeAll, describe, expect, it } from 'vitest'
import { parse } from '../parser'
import { tokenize } from '../tokenizer/tokenize'
import { minifyTokenStream } from '../tokenizer/minifyTokenStream'
import { builtin } from '../builtin'
import type { Type } from './types'
import {
  NumberType, StringType, NullType,
  Unknown, Never,
  atom, literal, fn, record, array, inter, neg,
} from './types'
import {
  InferenceContext, TypeEnv,
  inferExpr, constrain, expandType,
  TypeInferenceError,
} from './infer'
import { simplify } from './simplify'
import { isSubtype } from './subtype'
import { initBuiltinTypes } from './builtinTypes'

// Initialize builtin type cache once before all tests
beforeAll(() => {
  initBuiltinTypes(builtin.normalExpressions)
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
})

// ---------------------------------------------------------------------------
// Inference — Step 4: match narrowing and exhaustiveness
// ---------------------------------------------------------------------------

describe('inference — match narrowing', () => {
  it('match with literal patterns returns union of branch types', () => {
    const t = inferAndExpand('match 1 case 0 then "zero" case 1 then "one" case _ then "other" end')
    expect(isSubtype(t, StringType)).toBe(true)
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

  it('match with mixed branch types returns union', () => {
    const t = inferAndExpand('match 1 case 0 then "zero" case _ then 42 end')
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
