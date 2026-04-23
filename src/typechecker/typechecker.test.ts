import { describe, expect, it } from 'vitest'
import {
  NumberType, IntegerType, StringType, BooleanType, NullType,
  Unknown, Never, RegexType, PureEffects,
  atom, literal, fn, tuple, record, array, sequence, toSequenceType, union, inter, neg, handlerType, effectSet, indexType, keyofType,
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

  it('keyof placeholder renders with leading keyword', () => {
    // Stays as a Keyof when the inner isn't concrete (here: a raw Var).
    const raw: Type = { tag: 'Keyof', inner: NumberType }
    expect(typeToString(raw)).toBe('keyof Number')
  })

  it('indexed-access placeholder renders as T[K]', () => {
    const raw: Type = { tag: 'Index', target: NumberType, key: StringType }
    expect(typeToString(raw)).toBe('Number[String]')
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

  it('keyof placeholders with same inner are equal', () => {
    const a: Type = { tag: 'Keyof', inner: NumberType }
    const b: Type = { tag: 'Keyof', inner: NumberType }
    expect(typeEquals(a, b)).toBe(true)
  })

  it('indexed-access placeholders with same target and key are equal', () => {
    const a: Type = { tag: 'Index', target: NumberType, key: StringType }
    const b: Type = { tag: 'Index', target: NumberType, key: StringType }
    expect(typeEquals(a, b)).toBe(true)
  })

  it('indexed-access placeholders differ on key', () => {
    const a: Type = { tag: 'Index', target: NumberType, key: StringType }
    const b: Type = { tag: 'Index', target: NumberType, key: NumberType }
    expect(typeEquals(a, b)).toBe(false)
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

  it('no primitive is subtype of another (except Integer <: Number)', () => {
    const prims = [NumberType, StringType, BooleanType, NullType]
    for (const a of prims) {
      for (const b of prims) {
        if (a !== b) expect(isSubtype(a, b)).toBe(false)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Subtyping — Integer (subtype of Number)
// ---------------------------------------------------------------------------

describe('subtyping — Integer refines Number', () => {
  it('Integer <: Number', () => {
    expect(isSubtype(IntegerType, NumberType)).toBe(true)
  })

  it('Number </: Integer', () => {
    // Not every Number is an Integer (e.g. 3.14).
    expect(isSubtype(NumberType, IntegerType)).toBe(false)
  })

  it('Integer <: Integer', () => {
    expect(isSubtype(IntegerType, IntegerType)).toBe(true)
  })

  it('integer literal <: Integer', () => {
    expect(isSubtype(literal(42), IntegerType)).toBe(true)
    expect(isSubtype(literal(-7), IntegerType)).toBe(true)
    expect(isSubtype(literal(0), IntegerType)).toBe(true)
  })

  it('float literal </: Integer', () => {
    expect(isSubtype(literal(3.14), IntegerType)).toBe(false)
    expect(isSubtype(literal(0.5), IntegerType)).toBe(false)
  })

  it('integer literal <: Number (transitively via Integer)', () => {
    expect(isSubtype(literal(42), NumberType)).toBe(true)
  })

  it('Integer and String are disjoint', () => {
    expect(isSubtype(IntegerType, StringType)).toBe(false)
    expect(isSubtype(StringType, IntegerType)).toBe(false)
  })

  it('Integer is not disjoint with Number (shares all integer values)', () => {
    // This is the negation-subtyping facet: Integer is NOT <: !Number,
    // and Number is NOT <: !Integer — because their intersection is
    // non-empty (every integer is in both).
    expect(isSubtype(IntegerType, neg(NumberType))).toBe(false)
    expect(isSubtype(NumberType, neg(IntegerType))).toBe(false)
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

  it('Integer & Number is NOT empty (Integer <: Number, so the intersection is Integer)', () => {
    // Regression: isEmptyIntersection treated any pair of distinct primitive
    // names as disjoint, but Integer refines Number — their intersection is
    // Integer, not Never.
    expect(isSubtype(inter(IntegerType, NumberType), Never)).toBe(false)
  })

  it('Integer & Number & String is empty (String is disjoint from Integer and Number)', () => {
    // With three primitives, the pairwise loop must still flag the two
    // genuinely disjoint pairs (Integer/String, Number/String) while still
    // skipping the Integer/Number non-disjoint pair.
    expect(isSubtype(inter(IntegerType, NumberType, StringType), Never)).toBe(true)
  })

  it('Inter of function types differing only in effects does not poison cache', () => {
    // Same cache-collision shape as the Record case: typeId dropped effects
    // from Function identity, so two functions that differ only in their
    // effect row got the same cache key.
    const pure = fn([NumberType], NumberType, PureEffects)
    const noisy = fn([NumberType], NumberType, { effects: new Set(['bad']), tail: { tag: 'Closed' } })
    // Target whose param type neither function matches (String </: Number),
    // so both direct checks must fail.
    const target = fn([StringType], NumberType, PureEffects)
    expect(isSubtype(pure, target)).toBe(false)
    expect(isSubtype(noisy, target)).toBe(false)
    const i: Type = { tag: 'Inter', members: [pure, noisy] }
    expect(isSubtype(i, target)).toBe(false)
  })

  it('Inter of handlers differing only in introduced does not poison cache', () => {
    const h1 = handlerType(NumberType, NumberType, new Map(), PureEffects)
    const h2 = handlerType(NumberType, NumberType, new Map(), { effects: new Set(['bad']), tail: { tag: 'Closed' } })
    // Both differ from the target's body (String), so both fail individually.
    const target = handlerType(StringType, NumberType, new Map(), PureEffects)
    expect(isSubtype(h1, target)).toBe(false)
    expect(isSubtype(h2, target)).toBe(false)
    const i: Type = { tag: 'Inter', members: [h1, h2] }
    expect(isSubtype(i, target)).toBe(false)
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

  it('{a?: Number} </: {a: Number} (optional in S, required in T)', () => {
    // S's `a` may be absent at runtime, but T promises `a` is always present,
    // so S is NOT a subtype of T.
    const s: Type = {
      tag: 'Record',
      fields: new Map([['a', NumberType]]),
      open: false,
      optionalFields: new Set(['a']),
    }
    const t = record({ a: NumberType })
    expect(isSubtype(s, t)).toBe(false)
  })

  it('{a: Number} <: {a?: Number} (required in S, optional in T)', () => {
    // S always has `a`; T just requires that when `a` exists it has the right type.
    const s = record({ a: NumberType })
    const t: Type = {
      tag: 'Record',
      fields: new Map([['a', NumberType]]),
      open: false,
      optionalFields: new Set(['a']),
    }
    expect(isSubtype(s, t)).toBe(true)
  })

  it('{a?: Number} <: {a?: Number} (reflexive with optional)', () => {
    const mkOpt = (): Type => ({
      tag: 'Record',
      fields: new Map([['a', NumberType]]),
      open: false,
      optionalFields: new Set(['a']),
    })
    expect(isSubtype(mkOpt(), mkOpt())).toBe(true)
  })

  it('{name: String, ...} (open) </: {name: String} (closed)', () => {
    // Open S may have extra runtime fields that closed T forbids,
    // so open S is NOT a subtype of closed T — even when every declared
    // field matches.
    const open = record({ name: StringType }, true)
    const closed = record({ name: StringType })
    expect(isSubtype(open, closed)).toBe(false)
  })

  it('{name: String} (closed) <: {name: String, ...} (open) still holds', () => {
    // The other direction is sound: a closed record has no hidden fields,
    // so it satisfies an open target.
    const closed = record({ name: StringType })
    const open = record({ name: StringType }, true)
    expect(isSubtype(closed, open)).toBe(true)
  })

  it('unfolding a recursive record preserves optionalFields', () => {
    // `substituteVar` in subtype.ts rebuilt Record values without the
    // `optionalFields` sidecar — same class as the simplify.ts fix.
    // That silently promoted optional fields to required whenever a
    // recursive type was unfolded during subtype checking.
    const R: Type = {
      tag: 'Recursive',
      id: 1,
      body: {
        tag: 'Record',
        fields: new Map<string, Type>([
          ['a', NumberType],
          ['next', { tag: 'Var', id: 1, level: 0, lowerBounds: [], upperBounds: [] }],
        ]),
        open: false,
        optionalFields: new Set(['a']),
      },
    }
    const T: Type = {
      tag: 'Record',
      fields: new Map<string, Type>([
        ['a', NumberType],
        ['next', Unknown],
      ]),
      open: false,
    }
    // R's `a` may be absent; T requires it — so R is NOT a subtype of T.
    expect(isSubtype(R, T)).toBe(false)
  })

  it('Inter of two records differing only in optional-field sidecar does not poison the cache', () => {
    // Cache-key collision repro: typeId must distinguish records that differ
    // only in `optionalFields`, otherwise the cycle cache (seeded when the
    // first Inter member legitimately fails) returns true for the second —
    // a soundness violation.
    const A: Type = {
      tag: 'Record', fields: new Map([['x', NumberType]]), open: false,
    }
    const B: Type = {
      tag: 'Record', fields: new Map([['x', NumberType]]), open: false,
      optionalFields: new Set(['x']),
    }
    const T: Type = {
      tag: 'Record', fields: new Map([['x', IntegerType]]), open: false,
    }
    // Individual members fail:
    expect(isSubtype(A, T)).toBe(false) // Number </: Integer
    expect(isSubtype(B, T)).toBe(false) // B.x optional, T.x required
    // Inter([A, B]) = A (since A <: B), and A </: T, so the intersection is
    // not <: T either.
    const intersection: Type = { tag: 'Inter', members: [A, B] }
    expect(isSubtype(intersection, T)).toBe(false)
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

  it('handlers with contravariant arg types', () => {
    const hWide = handlerType(NumberType, StringType, new Map([['eff', { argType: union(NumberType, StringType), retType: StringType }]]))
    // h1 has eff.argType=Number, hWide has eff.argType=Number|String
    // Handler subtyping: target argType <: source argType (contravariant)
    expect(isSubtype(hWide, h1)).toBe(true)
  })

  it('handlers with incompatible arg types are not subtypes', () => {
    const hStr = handlerType(NumberType, StringType, new Map([['eff', { argType: StringType, retType: StringType }]]))
    expect(isSubtype(h1, hStr)).toBe(false)
  })

  it('handlers with incompatible return types are not subtypes', () => {
    const hNumRet = handlerType(NumberType, StringType, new Map([['eff', { argType: NumberType, retType: NumberType }]]))
    expect(isSubtype(h1, hNumRet)).toBe(false)
  })

  it('handlers with different body types are not subtypes', () => {
    const hDiffBody = handlerType(StringType, StringType, new Map([['eff', { argType: NumberType, retType: StringType }]]))
    expect(isSubtype(h1, hDiffBody)).toBe(false)
  })

  // Phase 4-B: covariant subtyping on `introduced`. A handler that introduces
  // fewer effects can stand in for one that introduces more.
  it('handler introducing fewer effects is a subtype', () => {
    const hPure = handlerType(NumberType, NumberType, new Map(), PureEffects)
    const hA = handlerType(NumberType, NumberType, new Map(), effectSet(['a']))
    expect(isSubtype(hPure, hA)).toBe(true)
  })

  it('handler introducing more effects is NOT a subtype', () => {
    const hPure = handlerType(NumberType, NumberType, new Map(), PureEffects)
    const hA = handlerType(NumberType, NumberType, new Map(), effectSet(['a']))
    // hA introduces {a}; a target that declares PureEffects (no introduced)
    // cannot safely accept hA — the caller would not expect `a` to fire.
    expect(isSubtype(hA, hPure)).toBe(false)
  })

  it('handler introduced subtyping is covariant across subsets', () => {
    const hA = handlerType(NumberType, NumberType, new Map(), effectSet(['a']))
    const hAB = handlerType(NumberType, NumberType, new Map(), effectSet(['a', 'b']))
    expect(isSubtype(hA, hAB)).toBe(true)
    expect(isSubtype(hAB, hA)).toBe(false)
  })

  it('handler introduced with disjoint effects is not a subtype either way', () => {
    const hA = handlerType(NumberType, NumberType, new Map(), effectSet(['a']))
    const hB = handlerType(NumberType, NumberType, new Map(), effectSet(['b']))
    expect(isSubtype(hA, hB)).toBe(false)
    expect(isSubtype(hB, hA)).toBe(false)
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

  it('recursive type with intersection body substitutes and unfolds', () => {
    const selfVar: Type = { tag: 'Var', id: 0, level: 0, lowerBounds: [], upperBounds: [] }
    // μ0.Number & 0 — unfolds to Number & (Number & ...)
    // Number should be subtype since intersection with self is idempotent
    const recType: Type = { tag: 'Recursive', id: 0, body: inter(NumberType, selfVar) }
    expect(isSubtype(literal(42), recType)).toBe(true)
  })

  it('recursive type with negation body substitutes and unfolds', () => {
    const selfVar: Type = { tag: 'Var', id: 0, level: 0, lowerBounds: [], upperBounds: [] }
    // μ0.Number | !0 — unfolds to Number | !(Number | !...), which contains Number
    const recType: Type = { tag: 'Recursive', id: 0, body: union(NumberType, neg(selfVar)) }
    expect(isSubtype(literal(42), recType)).toBe(true)
  })

  it('nested recursive with different id substitutes through outer', () => {
    const outerVar: Type = { tag: 'Var', id: 0, level: 0, lowerBounds: [], upperBounds: [] }
    // μ0.(μ1.String) | 0 — inner recursive has different id, outer substitutes through
    const innerRec: Type = { tag: 'Recursive', id: 1, body: StringType }
    const outerRec: Type = { tag: 'Recursive', id: 0, body: union(innerRec, outerVar) }
    expect(isSubtype(StringType, outerRec)).toBe(true)
  })

  it('type variable in subtype check exercises Var typeId', () => {
    const v: Type = { tag: 'Var', id: 99, level: 0, lowerBounds: [], upperBounds: [] }
    // Var </: Number (no bounds)
    expect(isSubtype(v, NumberType)).toBe(false)
    // Number </: Var
    expect(isSubtype(NumberType, v)).toBe(false)
  })

  it('Unknown <: Unknown via equality', () => {
    expect(isSubtype(Unknown, Unknown)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Subtyping — indexed-access placeholders
// ---------------------------------------------------------------------------

describe('subtyping — keyof and indexed access', () => {
  it('keyof of a concrete closed record is a subtype of the expected key union', () => {
    const k = keyofType(record({ a: NumberType, b: StringType }))
    expect(isSubtype(k, union(literal('a'), literal('b')))).toBe(true)
  })

  it('keyof of a concrete closed record is a subtype of String', () => {
    // Each member of the literal-key union is a String literal, and
    // literal strings are subtypes of String.
    const k = keyofType(record({ a: NumberType, b: StringType }))
    expect(isSubtype(k, StringType)).toBe(true)
  })

  it('concrete T["name"] is a subtype of the declared field type', () => {
    const t = indexType(record({ x: NumberType }), literal('x'))
    expect(isSubtype(t, NumberType)).toBe(true)
  })

  it('unresolved Keyof on a type variable stays a placeholder and is not a subtype', () => {
    // With a Var inside, keyofType returns the placeholder Keyof node;
    // isSubtype bails to `false` rather than guessing.
    const v: Type = { tag: 'Var', id: 99, level: 0, lowerBounds: [], upperBounds: [] }
    const k: Type = { tag: 'Keyof', inner: v }
    expect(isSubtype(k, StringType)).toBe(false)
  })

  it('unresolved Index stays a placeholder and is not a subtype', () => {
    const v: Type = { tag: 'Var', id: 99, level: 0, lowerBounds: [], upperBounds: [] }
    const x: Type = { tag: 'Index', target: v, key: literal('a') }
    expect(isSubtype(x, NumberType)).toBe(false)
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

  it('Number <: !(AnyFunction) — AnyFunction on right side of disjointness', () => {
    const anyFn: Type = { tag: 'AnyFunction' }
    expect(isSubtype(NumberType, neg(anyFn))).toBe(true)
  })

  it('union is disjoint with incompatible type via negation', () => {
    // (Number | String) <: !:ok — union members tested individually
    expect(isSubtype(union(NumberType, StringType), neg(atom('ok')))).toBe(true)
  })

  it('negated union — type disjoint with each union member', () => {
    // :ok <: !(Number | String) — right side is union in areDisjoint
    expect(isSubtype(atom('ok'), neg(union(NumberType, StringType)))).toBe(true)
  })

  it('intersection disjoint with type via negation', () => {
    // (Number & 42) <: !String — intersection on left, member disjoint with String
    expect(isSubtype(inter(NumberType, literal(42)), neg(StringType))).toBe(true)
  })

  it('type disjoint with intersection via negation', () => {
    // String <: !(Number & 42) — intersection on right in areDisjoint
    expect(isSubtype(StringType, neg(inter(NumberType, literal(42))))).toBe(true)
  })

  it('null literal does not match Null primitive in disjointness', () => {
    // Null is a primitive, not a literal — null values have tag Null, not Literal
    expect(isSubtype(NullType, neg(NumberType))).toBe(true)
  })

  it('Number <: !42 is false — 42 is a Number literal', () => {
    // Exercises Primitive-on-left, Literal-on-right disjointness (line 277)
    expect(isSubtype(NumberType, neg(literal(42)))).toBe(false)
  })

  it('String <: !42 is true — String and 42 are disjoint', () => {
    expect(isSubtype(StringType, neg(literal(42)))).toBe(true)
  })

  it('two non-disjoint ground types fall through to default', () => {
    // Record and Record — not provably disjoint, falls through to false
    expect(isSubtype(record({ x: NumberType }), neg(record({ x: StringType })))).toBe(false)
  })

  // Record / Tuple / Array / Sequence are all structurally disjoint
  // from Primitive, Atom, and Regex: no runtime value is at the same
  // time a record and a string, etc.
  it('record is disjoint from Primitive', () => {
    expect(isSubtype(record({ a: NumberType }), neg(StringType))).toBe(true)
    expect(isSubtype(StringType, neg(record({ a: NumberType })))).toBe(true)
  })

  it('record is disjoint from Atom', () => {
    expect(isSubtype(record({ a: NumberType }), neg(atom('ok')))).toBe(true)
    expect(isSubtype(atom('ok'), neg(record({ a: NumberType })))).toBe(true)
  })

  it('tuple is disjoint from Primitive', () => {
    expect(isSubtype(tuple([NumberType, StringType]), neg(BooleanType))).toBe(true)
    expect(isSubtype(BooleanType, neg(tuple([NumberType])))).toBe(true)
  })

  it('array is disjoint from Primitive', () => {
    expect(isSubtype(array(NumberType), neg(StringType))).toBe(true)
    expect(isSubtype(StringType, neg(array(NumberType)))).toBe(true)
  })

  it('record is disjoint from Regex', () => {
    expect(isSubtype(record({ a: NumberType }), neg(RegexType))).toBe(true)
    expect(isSubtype(RegexType, neg(record({ a: NumberType })))).toBe(true)
  })

  it('record is disjoint from Tuple (records have keys, tuples are indexed lists)', () => {
    expect(isSubtype(record({ a: NumberType }), neg(tuple([NumberType])))).toBe(true)
    expect(isSubtype(tuple([NumberType]), neg(record({ a: NumberType })))).toBe(true)
  })

  // Lock in the deliberate NON-disjointness: Tuple/Array/Sequence
  // may overlap (empty tuple is an empty array; Array IS a
  // Sequence-shaped subset). A future refactor that overclaims
  // disjointness would be unsound.
  it('tuple and Array are NOT disjoint (empty tuple overlaps with empty array)', () => {
    expect(isSubtype(tuple([]), neg(array(NumberType)))).toBe(false)
  })

  it('array and Sequence are NOT disjoint (array IS a sequence shape)', () => {
    expect(isSubtype(array(NumberType), neg(sequence([], NumberType, 0)))).toBe(false)
  })

  it('literal false does not match Null', () => {
    // false is Boolean, not Null — exercises literalMatchesPrimitive Null branch
    expect(isSubtype(literal(false), NullType)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Subtyping — effects
// ---------------------------------------------------------------------------

describe('subtyping — function effects', () => {
  it('pure function <: effectful function (fewer effects is subtype)', () => {
    const pure = fn([NumberType], NumberType, PureEffects)
    const effectful = fn([NumberType], NumberType, { effects: new Set(['io']), tail: { tag: 'Closed' } })
    expect(isSubtype(pure, effectful)).toBe(true)
  })

  it('effectful function </: pure function', () => {
    const pure = fn([NumberType], NumberType, PureEffects)
    const effectful = fn([NumberType], NumberType, { effects: new Set(['io']), tail: { tag: 'Closed' } })
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

  it('Number & Integer → Integer (not disjoint; narrow to subtype)', () => {
    const t = simplify(inter(NumberType, IntegerType))
    expect(typeEquals(t, IntegerType)).toBe(true)
  })

  it('Integer & Number → Integer (order independent)', () => {
    const t = simplify(inter(IntegerType, NumberType))
    expect(typeEquals(t, IntegerType)).toBe(true)
  })

  it('Number | Integer → Number (absorb subtype)', () => {
    const t = simplify(union(NumberType, IntegerType))
    expect(typeEquals(t, NumberType)).toBe(true)
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

  it('preserves optionalFields on Record', () => {
    // Regression: the Record case rebuilt the record without carrying the
    // `optionalFields` sidecar, turning optional fields into required ones
    // (unsound — callers would then assume the field is always present).
    const rec: Type = {
      tag: 'Record',
      fields: new Map([['a', NumberType]]),
      open: false,
      optionalFields: new Set(['a']),
    }
    const simplified = simplify(rec)
    expect(simplified.tag).toBe('Record')
    if (simplified.tag !== 'Record') return
    expect(simplified.optionalFields).toBeDefined()
    expect([...(simplified.optionalFields ?? [])]).toEqual(['a'])
  })

  it('simplifies keyof of a closed record to a union of key literals', () => {
    const t = simplify(keyofType(record({ a: NumberType, b: StringType })))
    expect(typeEquals(t, union(literal('a'), literal('b')))).toBe(true)
  })

  it('simplifies indexed access with literal key to the field type', () => {
    const t = simplify(indexType(record({ payload: StringType }), literal('payload')))
    expect(typeEquals(t, StringType)).toBe(true)
  })

  it('simplifies indexed access with union of literal keys to union of field types', () => {
    const r = record({ a: NumberType, b: StringType })
    const t = simplify(indexType(r, union(literal('a'), literal('b'))))
    expect(typeEquals(simplify(t), simplify(union(NumberType, StringType)))).toBe(true)
  })

  it('simplifies T[K] on optional field widens to T | Null', () => {
    const rOpt: Type = {
      tag: 'Record',
      fields: new Map([['age', NumberType]]),
      open: false,
      optionalFields: new Set(['age']),
    }
    const t = simplify(indexType(rOpt, literal('age')))
    expect(typeEquals(t, union(NumberType, NullType))).toBe(true)
  })

  it('Number & 42 → 42 (narrow supertype in intersection)', () => {
    const t = simplify(inter(NumberType, literal(42)))
    expect(typeEquals(t, literal(42))).toBe(true)
  })

  it('{a: Number} & {b: String} → {a: Number, b: String} (disjoint-key record merge)', () => {
    const t = simplify(inter(record({ a: NumberType }), record({ b: StringType })))
    expect(typeEquals(t, record({ a: NumberType, b: StringType }))).toBe(true)
  })

  it('{a: Number} & {a: Integer} → {a: Integer} (shared key narrows via field intersection)', () => {
    const t = simplify(inter(record({ a: NumberType }), record({ a: IntegerType })))
    expect(typeEquals(t, record({ a: IntegerType }))).toBe(true)
  })

  it('closed {a: Number} & closed {b: String} is closed (strictest of both)', () => {
    const t = simplify(inter(record({ a: NumberType }), record({ b: StringType })))
    if (t.tag !== 'Record') throw new Error(`expected Record, got ${t.tag}`)
    expect(t.open).toBe(false)
  })

  it('open {a: Number, ...} & closed {b: String} → closed {a: Number, b: String}', () => {
    const t = simplify(inter(record({ a: NumberType }, true), record({ b: StringType })))
    expect(typeEquals(t, record({ a: NumberType, b: StringType }))).toBe(true)
  })

  it('{a: Number} & {a: String} → Never (field intersection empty, field required)', () => {
    const t = simplify(inter(record({ a: NumberType }), record({ a: StringType })))
    expect(t.tag).toBe('Never')
  })

  it('three records fold left-to-right into a single merged record', () => {
    const t = simplify(inter(
      record({ a: NumberType }),
      record({ b: StringType }),
      record({ c: BooleanType }),
    ))
    expect(typeEquals(t, record({ a: NumberType, b: StringType, c: BooleanType }))).toBe(true)
  })

  it('record intersected with a disjoint primitive simplifies to Never', () => {
    // No value is both a record and a string. Issue #83 extended the
    // simplifier's disjointness check to recognize composite-vs-primitive
    // pairs via `areDisjoint`.
    expect(simplify(inter(record({ a: NumberType }), StringType)).tag).toBe('Never')
  })

  it('tuple intersected with a disjoint primitive simplifies to Never', () => {
    expect(simplify(inter(tuple([NumberType]), BooleanType)).tag).toBe('Never')
  })

  it('array intersected with a disjoint primitive simplifies to Never', () => {
    expect(simplify(inter(array(NumberType), StringType)).tag).toBe('Never')
  })

  it('record intersected with an atom simplifies to Never', () => {
    expect(simplify(inter(record({ a: NumberType }), atom('ok'))).tag).toBe('Never')
  })

  it('{a:Number} & {b:String} & Boolean simplifies to Never (merge then disjointness)', () => {
    // Exercises the two-stage pipeline: `mergeRecordMembers` first
    // folds the pair of records into `{a:Number, b:String}`, then
    // `hasDisjointKinds` sees Record × Boolean and returns Never.
    expect(simplify(inter(record({ a: NumberType }), record({ b: StringType }), BooleanType)).tag).toBe('Never')
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
