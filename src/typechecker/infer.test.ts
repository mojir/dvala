import { describe, expect, it } from 'vitest'
import { parse } from '../parser'
import { tokenize } from '../tokenizer/tokenize'
import { minifyTokenStream } from '../tokenizer/minifyTokenStream'
import type { Type } from './types'
import {
  NumberType, StringType, NullType,
  Unknown, Never,
  atom, literal, fn, record,
} from './types'
import {
  InferenceContext, TypeEnv,
  inferExpr, constrain, expandType,
  TypeInferenceError,
} from './infer'
import { simplify } from './simplify'
import { isSubtype } from './subtype'

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
