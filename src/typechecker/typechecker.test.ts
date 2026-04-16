import { describe, expect, it } from 'vitest'
import {
  NumberType, StringType, BooleanType, NullType,
  Unknown, Never, RegexType, PureEffects,
  atom, literal, fn, tuple, record, array, sequence, toSequenceType, union, inter, neg, handlerType,
  typeToString, typeEquals,
} from './types'
import type { Type } from './types'
import { isSubtype } from './subtype'
import { simplify } from './simplify'

// ---------------------------------------------------------------------------
// Type constructors
// ---------------------------------------------------------------------------

describe('type constructors', () => {
  it('union flattens nested unions', () => {
    const t = union(NumberType, union(StringType, BooleanType))
    expect(t.tag).toBe('Union')
    if (t.tag === 'Union') expect(t.members).toHaveLength(3)
  })

  it('union removes Never', () => {
    expect(union(NumberType, Never)).toBe(NumberType)
  })

  it('union with Unknown is Unknown', () => {
    expect(union(NumberType, Unknown)).toBe(Unknown)
  })

  it('union deduplicates', () => {
    const t = union(NumberType, NumberType, StringType)
    expect(t.tag).toBe('Union')
    if (t.tag === 'Union') expect(t.members).toHaveLength(2)
  })

  it('union of single type returns the type', () => {
    expect(union(NumberType)).toBe(NumberType)
  })

  it('union of zero types is Never', () => {
    expect(union()).toBe(Never)
  })

  it('intersection flattens nested intersections', () => {
    const t = inter(NumberType, inter(StringType, BooleanType))
    expect(t.tag).toBe('Inter')
    if (t.tag === 'Inter') expect(t.members).toHaveLength(3)
  })

  it('intersection removes Unknown', () => {
    expect(inter(NumberType, Unknown)).toBe(NumberType)
  })

  it('intersection with Never is Never', () => {
    expect(inter(NumberType, Never)).toBe(Never)
  })

  it('neg double negation', () => {
    expect(neg(neg(NumberType))).toBe(NumberType)
  })

  it('neg Never is Unknown', () => {
    expect(neg(Never)).toBe(Unknown)
  })

  it('neg Unknown is Never', () => {
    expect(neg(Unknown)).toBe(Never)
  })
})

// ---------------------------------------------------------------------------
// typeToString
// ---------------------------------------------------------------------------

describe('typeToString', () => {
  it('primitives', () => {
    expect(typeToString(NumberType)).toBe('Number')
    expect(typeToString(StringType)).toBe('String')
    expect(typeToString(BooleanType)).toBe('Boolean')
    expect(typeToString(NullType)).toBe('Null')
  })

  it('atoms', () => {
    expect(typeToString(atom('ok'))).toBe(':ok')
  })

  it('literals', () => {
    expect(typeToString(literal(42))).toBe('42')
    expect(typeToString(literal('hello'))).toBe('"hello"')
    expect(typeToString(literal(true))).toBe('true')
  })

  it('function types', () => {
    expect(typeToString(fn([NumberType, NumberType], NumberType))).toBe('(Number, Number) -> Number')
  })

  it('rest function types', () => {
    expect(typeToString(fn([NumberType], NumberType, undefined, undefined, NumberType))).toBe('(Number, ...Number[]) -> Number')
  })

  it('tuple types', () => {
    expect(typeToString(tuple([StringType, NumberType]))).toBe('[String, Number]')
  })

  it('record types', () => {
    expect(typeToString(record({ name: StringType, age: NumberType }))).toBe('{name: String, age: Number}')
    expect(typeToString(record({ name: StringType }, true))).toBe('{name: String, ...}')
  })

  it('array types', () => {
    expect(typeToString(array(NumberType))).toBe('Number[]')
  })

  it('sequence types render specialized tuple and array forms', () => {
    expect(typeToString(sequence([StringType, NumberType], Never))).toBe('[String, Number]')
    expect(typeToString(sequence([], NumberType, 0))).toBe('Number[]')
  })

  it('sequence types render familiar syntax for prefix-constrained tails', () => {
    expect(typeToString(sequence([literal(1)], NumberType, 1))).toBe('[1, ...Number[]]')
  })

  it('sequence types add length qualifier when min length exceeds prefix', () => {
    expect(typeToString(sequence([literal(1)], NumberType, 2))).toBe('[1, ...Number[]] (length 2+)')
  })

  it('sequence types add length qualifier for bounded ranges', () => {
    expect(typeToString(sequence([], NumberType, 2, 5))).toBe('[...Number[]] (length 2..5)')
  })

  it('union types', () => {
    expect(typeToString(union(NumberType, StringType))).toBe('Number | String')
  })

  it('negation types', () => {
    expect(typeToString(neg(NullType))).toBe('!Null')
  })

  it('bounds', () => {
    expect(typeToString(Unknown)).toBe('Unknown')
    expect(typeToString(Never)).toBe('Never')
  })
})

// ---------------------------------------------------------------------------
// typeEquals
// ---------------------------------------------------------------------------

describe('typeEquals', () => {
  it('same primitives are equal', () => {
    expect(typeEquals(NumberType, NumberType)).toBe(true)
  })

  it('different primitives are not equal', () => {
    expect(typeEquals(NumberType, StringType)).toBe(false)
  })

  it('same atoms are equal', () => {
    expect(typeEquals(atom('ok'), atom('ok'))).toBe(true)
  })

  it('different atoms are not equal', () => {
    expect(typeEquals(atom('ok'), atom('error'))).toBe(false)
  })

  it('same literals are equal', () => {
    expect(typeEquals(literal(42), literal(42))).toBe(true)
  })

  it('records with same fields are equal', () => {
    const r1 = record({ name: StringType, age: NumberType })
    const r2 = record({ name: StringType, age: NumberType })
    expect(typeEquals(r1, r2)).toBe(true)
  })

  it('records with different open/closed are not equal', () => {
    expect(typeEquals(record({ x: NumberType }), record({ x: NumberType }, true))).toBe(false)
  })

  it('sequences with same shape are equal', () => {
    expect(typeEquals(sequence([literal(1)], NumberType, 1), sequence([literal(1)], NumberType, 1))).toBe(true)
  })

  it('sequences with different bounds are not equal', () => {
    expect(typeEquals(sequence([literal(1)], NumberType, 1), sequence([literal(1)], NumberType, 2))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Sequence normalization helpers
// ---------------------------------------------------------------------------

describe('sequence normalization helpers', () => {
  it('normalizes arrays into open-ended homogeneous sequences', () => {
    expect(typeEquals(toSequenceType(array(NumberType))!, sequence([], NumberType, 0))).toBe(true)
  })

  it('normalizes tuples into exact-length sequences', () => {
    expect(typeEquals(toSequenceType(tuple([NumberType, StringType]))!, sequence([NumberType, StringType], Never))).toBe(true)
  })

  it('normalizes sequence min length to cover the prefix', () => {
    const normalized = sequence([NumberType, StringType], NumberType, 0)
    expect(normalized.minLength).toBe(2)
    expect(normalized.maxLength).toBeUndefined()
  })

  it('normalizes impossible tails with Never into exact sequences', () => {
    const normalized = sequence([NumberType], Never, 0, 3)
    expect(normalized.minLength).toBe(1)
    expect(normalized.maxLength).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Subtyping — primitives
// ---------------------------------------------------------------------------

describe('subtyping — primitives', () => {
  it('Number <: Number', () => {
    expect(isSubtype(NumberType, NumberType)).toBe(true)
  })

  it('Number </: String', () => {
    expect(isSubtype(NumberType, StringType)).toBe(false)
  })

  it('String </: Number', () => {
    expect(isSubtype(StringType, NumberType)).toBe(false)
  })

  it('all four primitives are self-subtypes', () => {
    for (const t of [NumberType, StringType, BooleanType, NullType]) {
      expect(isSubtype(t, t)).toBe(true)
    }
  })

  it('no primitive is subtype of another', () => {
    const prims = [NumberType, StringType, BooleanType, NullType]
    for (const a of prims) {
      for (const b of prims) {
        if (a !== b) expect(isSubtype(a, b)).toBe(false)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Subtyping — bounds (Never, Unknown)
// ---------------------------------------------------------------------------

describe('subtyping — bounds', () => {
  it('Never <: T for all T', () => {
    expect(isSubtype(Never, NumberType)).toBe(true)
    expect(isSubtype(Never, StringType)).toBe(true)
    expect(isSubtype(Never, Unknown)).toBe(true)
    expect(isSubtype(Never, Never)).toBe(true)
    expect(isSubtype(Never, union(NumberType, StringType))).toBe(true)
  })

  it('T <: Unknown for all T', () => {
    expect(isSubtype(NumberType, Unknown)).toBe(true)
    expect(isSubtype(StringType, Unknown)).toBe(true)
    expect(isSubtype(Never, Unknown)).toBe(true)
    expect(isSubtype(Unknown, Unknown)).toBe(true)
  })

  it('Unknown </: T (except Unknown)', () => {
    expect(isSubtype(Unknown, NumberType)).toBe(false)
    expect(isSubtype(Unknown, Never)).toBe(false)
  })

  it('T </: Never (except Never)', () => {
    expect(isSubtype(NumberType, Never)).toBe(false)
    expect(isSubtype(Unknown, Never)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Subtyping — literals
// ---------------------------------------------------------------------------

describe('subtyping — literals', () => {
  it('42 <: Number', () => {
    expect(isSubtype(literal(42), NumberType)).toBe(true)
  })

  it('"hello" <: String', () => {
    expect(isSubtype(literal('hello'), StringType)).toBe(true)
  })

  it('true <: Boolean', () => {
    expect(isSubtype(literal(true), BooleanType)).toBe(true)
  })

  it('42 </: String', () => {
    expect(isSubtype(literal(42), StringType)).toBe(false)
  })

  it('"hello" </: Number', () => {
    expect(isSubtype(literal('hello'), NumberType)).toBe(false)
  })

  it('42 <: 42', () => {
    expect(isSubtype(literal(42), literal(42))).toBe(true)
  })

  it('42 </: 43', () => {
    expect(isSubtype(literal(42), literal(43))).toBe(false)
  })

  it('Number </: 42 (a primitive is not a subtype of a literal)', () => {
    expect(isSubtype(NumberType, literal(42))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Subtyping — atoms
// ---------------------------------------------------------------------------

describe('subtyping — atoms', () => {
  it(':ok <: :ok', () => {
    expect(isSubtype(atom('ok'), atom('ok'))).toBe(true)
  })

  it(':ok </: :error', () => {
    expect(isSubtype(atom('ok'), atom('error'))).toBe(false)
  })

  it(':ok </: String (atoms are not primitives)', () => {
    expect(isSubtype(atom('ok'), StringType)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Subtyping — unions
// ---------------------------------------------------------------------------

describe('subtyping — unions', () => {
  it('Number <: Number | String', () => {
    expect(isSubtype(NumberType, union(NumberType, StringType))).toBe(true)
  })

  it('String <: Number | String', () => {
    expect(isSubtype(StringType, union(NumberType, StringType))).toBe(true)
  })

  it('Number | String </: Number', () => {
    expect(isSubtype(union(NumberType, StringType), NumberType)).toBe(false)
  })

  it('Number | String <: Number | String | Boolean', () => {
    expect(isSubtype(
      union(NumberType, StringType),
      union(NumberType, StringType, BooleanType),
    )).toBe(true)
  })

  it('42 <: Number | String', () => {
    expect(isSubtype(literal(42), union(NumberType, StringType))).toBe(true)
  })

  it(':ok | :error <: :ok | :error | :pending', () => {
    expect(isSubtype(
      union(atom('ok'), atom('error')),
      union(atom('ok'), atom('error'), atom('pending')),
    )).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Subtyping — intersections
// ---------------------------------------------------------------------------

describe('subtyping — intersections', () => {
  it('T <: T1 and T <: T2 implies T <: T1 & T2', () => {
    // Never <: Number & String (because Never <: everything)
    expect(isSubtype(Never, inter(NumberType, StringType))).toBe(true)
  })

  it('{name: String, age: Number} <: {name: String} & {age: Number}', () => {
    const full = record({ name: StringType, age: NumberType })
    const nameOnly = record({ name: StringType }, true)
    const ageOnly = record({ age: NumberType }, true)
    expect(isSubtype(full, inter(nameOnly, ageOnly))).toBe(true)
  })

  it('Number & String is empty (disjoint intersection)', () => {
    // Number & String <: Never (because Number and String are disjoint)
    expect(isSubtype(inter(NumberType, StringType), Never)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Subtyping — negation
// ---------------------------------------------------------------------------

describe('subtyping — negation', () => {
  it('Number <: !String (disjoint types)', () => {
    expect(isSubtype(NumberType, neg(StringType))).toBe(true)
  })

  it('Number </: !Number', () => {
    expect(isSubtype(NumberType, neg(NumberType))).toBe(false)
  })

  it(':ok <: !String (atoms are not strings)', () => {
    expect(isSubtype(atom('ok'), neg(StringType))).toBe(true)
  })

  it(':ok <: !:error (different atoms are disjoint)', () => {
    expect(isSubtype(atom('ok'), neg(atom('error')))).toBe(true)
  })

  it(':ok </: !:ok', () => {
    expect(isSubtype(atom('ok'), neg(atom('ok')))).toBe(false)
  })

  it('!String <: !String (reflexive)', () => {
    expect(isSubtype(neg(StringType), neg(StringType))).toBe(true)
  })

  it('!Number <: !42 (contravariant: 42 <: Number implies !Number <: !42)', () => {
    expect(isSubtype(neg(NumberType), neg(literal(42)))).toBe(true)
  })

  it('42 <: Number & !0', () => {
    expect(isSubtype(literal(42), inter(NumberType, neg(literal(0))))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Subtyping — functions
// ---------------------------------------------------------------------------

describe('subtyping — functions', () => {
  it('(Number) -> String <: (Number) -> String', () => {
    expect(isSubtype(fn([NumberType], StringType), fn([NumberType], StringType))).toBe(true)
  })

  it('covariant return: (Number) -> 42 <: (Number) -> Number', () => {
    expect(isSubtype(fn([NumberType], literal(42)), fn([NumberType], NumberType))).toBe(true)
  })

  it('contravariant params: (Number|String) -> Number <: (Number) -> Number', () => {
    expect(isSubtype(
      fn([union(NumberType, StringType)], NumberType),
      fn([NumberType], NumberType),
    )).toBe(true)
  })

  it('wrong variance: (Number) -> Number </: (Number|String) -> Number', () => {
    expect(isSubtype(
      fn([NumberType], NumberType),
      fn([union(NumberType, StringType)], NumberType),
    )).toBe(false)
  })

  it('arity mismatch: (Number) -> Number </: (Number, String) -> Number', () => {
    expect(isSubtype(
      fn([NumberType], NumberType),
      fn([NumberType, StringType], NumberType),
    )).toBe(false)
  })

  it('rest params accept longer fixed arities', () => {
    expect(isSubtype(
      fn([NumberType], NumberType, undefined, undefined, NumberType),
      fn([NumberType, NumberType, NumberType], NumberType),
    )).toBe(true)
  })

  it('rest subtyping stays contravariant', () => {
    expect(isSubtype(
      fn([union(NumberType, StringType)], NumberType, undefined, undefined, union(NumberType, StringType)),
      fn([NumberType], NumberType, undefined, undefined, NumberType),
    )).toBe(true)
  })

  it('fixed arity is not subtype of rest domain with smaller minimum arity', () => {
    expect(isSubtype(
      fn([NumberType, NumberType], NumberType),
      fn([NumberType], NumberType, undefined, undefined, NumberType),
    )).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Subtyping — tuples
// ---------------------------------------------------------------------------

describe('subtyping — tuples', () => {
  it('[Number, String] <: [Number, String]', () => {
    expect(isSubtype(tuple([NumberType, StringType]), tuple([NumberType, StringType]))).toBe(true)
  })

  it('[42, "hi"] <: [Number, String]', () => {
    expect(isSubtype(tuple([literal(42), literal('hi')]), tuple([NumberType, StringType]))).toBe(true)
  })

  it('[Number, String] </: [String, Number]', () => {
    expect(isSubtype(tuple([NumberType, StringType]), tuple([StringType, NumberType]))).toBe(false)
  })

  it('length mismatch: [Number] </: [Number, String]', () => {
    expect(isSubtype(tuple([NumberType]), tuple([NumberType, StringType]))).toBe(false)
  })

  it('[Number, String] <: (Number | String)[] (tuple <: array)', () => {
    expect(isSubtype(
      tuple([NumberType, StringType]),
      array(union(NumberType, StringType)),
    )).toBe(true)
  })

  it('[Number, String] <: Sequence<[Number, String], ...Never[], len=2..2>', () => {
    expect(isSubtype(
      tuple([NumberType, StringType]),
      sequence([NumberType, StringType], Never),
    )).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Subtyping — arrays
// ---------------------------------------------------------------------------

describe('subtyping — arrays', () => {
  it('Number[] <: Number[]', () => {
    expect(isSubtype(array(NumberType), array(NumberType))).toBe(true)
  })

  it('42[] <: Number[] (covariant)', () => {
    expect(isSubtype(array(literal(42)), array(NumberType))).toBe(true)
  })

  it('Number[] </: String[]', () => {
    expect(isSubtype(array(NumberType), array(StringType))).toBe(false)
  })

  it('42[] <: Sequence<[], ...Number[], len=0..>', () => {
    expect(isSubtype(array(literal(42)), sequence([], NumberType, 0))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Subtyping — sequences
// ---------------------------------------------------------------------------

describe('subtyping — sequences', () => {
  it('exact sequences subtype matching wider element types', () => {
    expect(isSubtype(
      sequence([literal(42), literal('hi')], Never),
      sequence([NumberType, StringType], Never),
    )).toBe(true)
  })

  it('prefix-constrained sequences subtype homogeneous arrays when every position fits', () => {
    expect(isSubtype(
      sequence([NumberType], NumberType, 1),
      array(NumberType),
    )).toBe(true)
  })

  it('sequence length intervals must be contained', () => {
    expect(isSubtype(
      sequence([], NumberType, 0),
      sequence([], NumberType, 1),
    )).toBe(false)
  })

  it('sequence prefixes must respect target element types', () => {
    expect(isSubtype(
      sequence([StringType], NumberType, 1),
      array(NumberType),
    )).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Subtyping — records
// ---------------------------------------------------------------------------

describe('subtyping — records', () => {
  it('{name: String, age: Number} <: {name: String} (width subtyping with open target)', () => {
    expect(isSubtype(
      record({ name: StringType, age: NumberType }),
      record({ name: StringType }, true),
    )).toBe(true)
  })

  it('{name: "Alice"} <: {name: String} (depth subtyping with open target)', () => {
    expect(isSubtype(
      record({ name: literal('Alice') }),
      record({ name: StringType }, true),
    )).toBe(true)
  })

  it('{name: String} </: {name: String, age: Number} (missing field)', () => {
    expect(isSubtype(
      record({ name: StringType }),
      record({ name: StringType, age: NumberType }),
    )).toBe(false)
  })

  it('closed record with extra fields </: closed record', () => {
    expect(isSubtype(
      record({ name: StringType, age: NumberType }),
      record({ name: StringType }),
    )).toBe(false)
  })

  it('closed record <: open record with same fields', () => {
    expect(isSubtype(
      record({ name: StringType }),
      record({ name: StringType }, true),
    )).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Subtyping — regex
// ---------------------------------------------------------------------------

describe('subtyping — regex', () => {
  it('Regex <: Regex', () => {
    expect(isSubtype(RegexType, RegexType)).toBe(true)
  })

  it('Regex </: String', () => {
    expect(isSubtype(RegexType, StringType)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Subtyping — negation
// ---------------------------------------------------------------------------

describe('subtyping — negation', () => {
  it('Number <: !String (disjoint types)', () => {
    expect(isSubtype(NumberType, neg(StringType))).toBe(true)
  })

  it('Number </: !Number (same type)', () => {
    expect(isSubtype(NumberType, neg(NumberType))).toBe(false)
  })

  it('42 <: !String (literal disjoint with negated primitive)', () => {
    expect(isSubtype(literal(42), neg(StringType))).toBe(true)
  })

  it('!Number <: !Number (equal negations)', () => {
    expect(isSubtype(neg(NumberType), neg(NumberType))).toBe(true)
  })

  it('!String <: !Number iff Number <: String — false', () => {
    expect(isSubtype(neg(StringType), neg(NumberType))).toBe(false)
  })

  it('!Number </: String (negation on left is conservative)', () => {
    expect(isSubtype(neg(NumberType), StringType)).toBe(false)
  })

  it(':ok <: !Number (atom disjoint with negated primitive)', () => {
    expect(isSubtype(atom('ok'), neg(NumberType))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Subtyping — handlers
// ---------------------------------------------------------------------------

describe('subtyping — handlers', () => {
  const h1 = handlerType(NumberType, StringType, new Map([['eff', { argType: NumberType, retType: StringType }]]))
  const h2 = handlerType(NumberType, StringType, new Map([['eff', { argType: NumberType, retType: StringType }]]))
  const h3 = handlerType(NumberType, StringType, new Map([['other', { argType: NumberType, retType: StringType }]]))

  it('identical handlers are subtypes', () => {
    expect(isSubtype(h1, h2)).toBe(true)
  })

  it('handlers with different effect names are not subtypes', () => {
    expect(isSubtype(h1, h3)).toBe(false)
  })

  it('handlers with different effect count are not subtypes', () => {
    const hEmpty = handlerType(NumberType, StringType, new Map())
    expect(isSubtype(h1, hEmpty)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Subtyping — AnyFunction
// ---------------------------------------------------------------------------

describe('subtyping — AnyFunction', () => {
  const anyFn: Type = { tag: 'AnyFunction' }

  it('Function <: AnyFunction', () => {
    expect(isSubtype(fn([NumberType], StringType), anyFn)).toBe(true)
  })

  it('AnyFunction <: AnyFunction', () => {
    expect(isSubtype(anyFn, anyFn)).toBe(true)
  })

  it('AnyFunction </: Function', () => {
    expect(isSubtype(anyFn, fn([NumberType], StringType))).toBe(false)
  })

  it('Number </: AnyFunction', () => {
    expect(isSubtype(NumberType, anyFn)).toBe(false)
  })

  it('intersection of functions <: AnyFunction', () => {
    expect(isSubtype(
      inter(fn([NumberType], NumberType), fn([StringType], StringType)),
      anyFn,
    )).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Subtyping — aliases and recursive types
// ---------------------------------------------------------------------------

describe('subtyping — aliases and recursive types', () => {
  it('alias is transparent — expanded form is compared', () => {
    const alias: Type = { tag: 'Alias', name: 'MyNum', args: [], expanded: NumberType }
    expect(isSubtype(alias, NumberType)).toBe(true)
    expect(isSubtype(NumberType, alias)).toBe(true)
  })

  it('alias with different args produces different cache keys', () => {
    const aliasNum: Type = { tag: 'Alias', name: 'Box', args: [NumberType], expanded: record({ value: NumberType }) }
    const aliasStr: Type = { tag: 'Alias', name: 'Box', args: [StringType], expanded: record({ value: StringType }) }
    expect(isSubtype(aliasNum, aliasStr)).toBe(false)
  })

  it('recursive type unfolds for subtyping', () => {
    // μ0.Number | [0] — a recursive list of numbers
    const recType: Type = { tag: 'Recursive', id: 0, body: union(NumberType, tuple([{ tag: 'Var', id: 0, level: 0, lowerBounds: [], upperBounds: [] }])) }
    // Number is a subtype of the recursive type (it's one of the union members)
    expect(isSubtype(NumberType, recType)).toBe(true)
  })

  it('recursive type on left unfolds for subtyping', () => {
    // μ0.Number — a recursive type that is just Number
    const recType: Type = { tag: 'Recursive', id: 0, body: NumberType }
    expect(isSubtype(recType, NumberType)).toBe(true)
  })

  it('recursive type substitutes vars through structural types', () => {
    // μ0.{value: Number, next: 0 | Null} — a linked list node
    const selfVar: Type = { tag: 'Var', id: 0, level: 0, lowerBounds: [], upperBounds: [] }
    const recType: Type = {
      tag: 'Recursive',
      id: 0,
      body: record({ value: NumberType, next: union(selfVar, NullType) }),
    }
    // A concrete node with null next is a subtype of the recursive type
    const concreteNode = record({ value: NumberType, next: NullType })
    expect(isSubtype(concreteNode, recType)).toBe(true)
  })

  it('recursive type with function body substitutes correctly', () => {
    // μ0.(Number) -> 0 — a recursive function returning itself
    const selfVar: Type = { tag: 'Var', id: 0, level: 0, lowerBounds: [], upperBounds: [] }
    const recFn: Type = { tag: 'Recursive', id: 0, body: fn([NumberType], selfVar) }
    // Any (Number) -> ... function should partially match
    expect(isSubtype(recFn, { tag: 'AnyFunction' })).toBe(true)
  })

  it('recursive type with array body substitutes correctly', () => {
    // μ0.Number | Number[] — array union
    const selfVar: Type = { tag: 'Var', id: 0, level: 0, lowerBounds: [], upperBounds: [] }
    const recType: Type = { tag: 'Recursive', id: 0, body: union(NumberType, array(selfVar)) }
    expect(isSubtype(NumberType, recType)).toBe(true)
  })

  it('recursive type with negation substitutes correctly', () => {
    // μ0.!0 — meaningless but exercises substituteVar through negation
    const selfVar: Type = { tag: 'Var', id: 0, level: 0, lowerBounds: [], upperBounds: [] }
    const recType: Type = { tag: 'Recursive', id: 0, body: neg(selfVar) }
    // Never <: anything
    expect(isSubtype(Never, recType)).toBe(true)
  })

  it('recursive type with intersection substitutes correctly', () => {
    const selfVar: Type = { tag: 'Var', id: 0, level: 0, lowerBounds: [], upperBounds: [] }
    const recType: Type = { tag: 'Recursive', id: 0, body: inter(NumberType, selfVar) }
    expect(isSubtype(Never, recType)).toBe(true)
  })

  it('recursive type with alias body substitutes correctly', () => {
    const selfVar: Type = { tag: 'Var', id: 0, level: 0, lowerBounds: [], upperBounds: [] }
    const aliasBody: Type = { tag: 'Alias', name: 'Wrapper', args: [selfVar], expanded: union(NumberType, selfVar) }
    const recType: Type = { tag: 'Recursive', id: 0, body: aliasBody }
    expect(isSubtype(NumberType, recType)).toBe(true)
  })

  it('nested recursive type does not substitute shadowed variables', () => {
    const selfVar: Type = { tag: 'Var', id: 0, level: 0, lowerBounds: [], upperBounds: [] }
    // μ0.(μ0.Number) — inner recursive shadows the outer variable
    const innerRec: Type = { tag: 'Recursive', id: 0, body: NumberType }
    const recType: Type = { tag: 'Recursive', id: 0, body: union(selfVar, innerRec) }
    expect(isSubtype(NumberType, recType)).toBe(true)
  })

  it('recursive type with sequence body substitutes correctly', () => {
    const selfVar: Type = { tag: 'Var', id: 0, level: 0, lowerBounds: [], upperBounds: [] }
    const recType: Type = { tag: 'Recursive', id: 0, body: union(NumberType, sequence([selfVar], Never)) }
    expect(isSubtype(NumberType, recType)).toBe(true)
  })

  it('recursive type with rest-param function substitutes correctly', () => {
    const selfVar: Type = { tag: 'Var', id: 0, level: 0, lowerBounds: [], upperBounds: [] }
    // μ0.(Number, ...Number[]) -> 0 — function with rest param referencing self
    const recFn: Type = { tag: 'Recursive', id: 0, body: fn([NumberType], selfVar, undefined, undefined, NumberType) }
    expect(isSubtype(recFn, { tag: 'AnyFunction' })).toBe(true)
  })

  it('Unknown <: Unknown via cycle detection cache', () => {
    // This exercises the Unknown and Var branches of typeId indirectly
    // through the cycle detection cache
    expect(isSubtype(Unknown, Unknown)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Subtyping — disjointness edge cases
// ---------------------------------------------------------------------------

describe('subtyping — disjointness', () => {
  it('Atom and Primitive are disjoint', () => {
    expect(isSubtype(atom('ok'), neg(NumberType))).toBe(true)
    expect(isSubtype(atom('ok'), neg(StringType))).toBe(true)
  })

  it('Literal and non-matching Atom are disjoint', () => {
    expect(isSubtype(literal(42), neg(atom('ok')))).toBe(true)
  })

  it('Regex and Primitive are disjoint', () => {
    expect(isSubtype(RegexType, neg(NumberType))).toBe(true)
  })

  it('AnyFunction and Primitive are disjoint', () => {
    const anyFn: Type = { tag: 'AnyFunction' }
    expect(isSubtype(anyFn, neg(NumberType))).toBe(true)
  })

  it('Function and Record are disjoint', () => {
    expect(isSubtype(fn([NumberType], NumberType), neg(record({ x: NumberType })))).toBe(true)
  })

  it('intersection of disjoint types <: Never', () => {
    expect(isSubtype(inter(NumberType, StringType), Never)).toBe(true)
  })

  it('intersection of primitive and non-matching atom <: Never', () => {
    expect(isSubtype(inter(NumberType, atom('ok')), Never)).toBe(true)
  })

  it('intersection of primitive and non-matching literal <: Never', () => {
    expect(isSubtype(inter(NumberType, literal('hello')), Never)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Subtyping — effects
// ---------------------------------------------------------------------------

describe('subtyping — function effects', () => {
  it('pure function <: effectful function (fewer effects is subtype)', () => {
    const pure = fn([NumberType], NumberType, PureEffects)
    const effectful = fn([NumberType], NumberType, { effects: new Set(['io']), open: false })
    expect(isSubtype(pure, effectful)).toBe(true)
  })

  it('effectful function </: pure function', () => {
    const pure = fn([NumberType], NumberType, PureEffects)
    const effectful = fn([NumberType], NumberType, { effects: new Set(['io']), open: false })
    expect(isSubtype(effectful, pure)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Simplification
// ---------------------------------------------------------------------------

describe('simplify', () => {
  it('Number | 42 → Number (absorb literal into primitive)', () => {
    const t = simplify(union(NumberType, literal(42)))
    expect(typeEquals(t, NumberType)).toBe(true)
  })

  it('42 | Number → Number (order independent)', () => {
    const t = simplify(union(literal(42), NumberType))
    expect(typeEquals(t, NumberType)).toBe(true)
  })

  it('Number | Never → Number', () => {
    const t = simplify(union(NumberType, Never))
    expect(typeEquals(t, NumberType)).toBe(true)
  })

  it('Number & Unknown → Number', () => {
    const t = simplify(inter(NumberType, Unknown))
    expect(typeEquals(t, NumberType)).toBe(true)
  })

  it('Number & String → Never (disjoint primitives)', () => {
    const t = simplify(inter(NumberType, StringType))
    expect(typeEquals(t, Never)).toBe(true)
  })

  it('Number & !String → Number (trivial negation collapse)', () => {
    const t = simplify(inter(NumberType, neg(StringType)))
    expect(typeEquals(t, NumberType)).toBe(true)
  })

  it('!!Number → Number (double negation)', () => {
    const t = simplify(neg(neg(NumberType)))
    expect(typeEquals(t, NumberType)).toBe(true)
  })

  it('Number | Number → Number (dedup)', () => {
    const t = simplify(union(NumberType, NumberType))
    expect(typeEquals(t, NumberType)).toBe(true)
  })

  it('simplifies nested function types', () => {
    const t = simplify(fn([union(NumberType, Never)], inter(StringType, Unknown)))
    expect(typeEquals(t, fn([NumberType], StringType))).toBe(true)
  })

  it('Number & 42 → 42 (narrow supertype in intersection)', () => {
    const t = simplify(inter(NumberType, literal(42)))
    expect(typeEquals(t, literal(42))).toBe(true)
  })

  it('exact Sequence simplifies to tuple', () => {
    const t = simplify(sequence([NumberType, StringType], Never))
    expect(typeEquals(t, tuple([NumberType, StringType]))).toBe(true)
  })

  it('open-ended homogeneous Sequence simplifies to array', () => {
    const t = simplify(sequence([], NumberType, 0))
    expect(typeEquals(t, array(NumberType))).toBe(true)
  })

  it('Sequence with impossible length interval simplifies to Never', () => {
    const t = simplify({
      tag: 'Sequence',
      prefix: [NumberType],
      rest: NumberType,
      minLength: 2,
      maxLength: 1,
    })
    expect(typeEquals(t, Never)).toBe(true)
  })

  it('Sequence with Never in its prefix simplifies to Never', () => {
    const t = simplify(sequence([Never], NumberType, 1))
    expect(typeEquals(t, Never)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Design doc examples
// ---------------------------------------------------------------------------

describe('design doc examples', () => {
  it('inferred type of match function', () => {
    // f: (Number | String) -> Number
    const fType = fn([union(NumberType, StringType)], NumberType)
    expect(isSubtype(fType, fn([NumberType], NumberType))).toBe(true)
    expect(isSubtype(fType, fn([StringType], NumberType))).toBe(true)
  })

  it('tagged union: Result<Number, String>', () => {
    const ok = record({ tag: atom('ok'), value: NumberType })
    const err = record({ tag: atom('error'), error: StringType })
    const result = union(ok, err)
    expect(isSubtype(ok, result)).toBe(true)
    expect(isSubtype(err, result)).toBe(true)
  })

  it('Number & !0 represents non-zero numbers', () => {
    // 42 <: Number & !0
    expect(isSubtype(literal(42), inter(NumberType, neg(literal(0))))).toBe(true)
    // 0 </: Number & !0
    expect(isSubtype(literal(0), inter(NumberType, neg(literal(0))))).toBe(false)
  })

  it('effect sets as subtyping: fewer effects is subtype', () => {
    // Model effects as atom unions: @{log} <: @{log, fetch}
    const logOnly = atom('log')
    const logAndFetch = union(atom('log'), atom('fetch'))
    expect(isSubtype(logOnly, logAndFetch)).toBe(true)
  })
})
