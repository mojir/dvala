import { describe, expect, it } from 'vitest'
import { parseTypeAnnotation, parseFunctionTypeAnnotation, TypeParseError } from './parseType'
import {
  NumberType, StringType, BooleanType, NullType,
  Unknown, Never, RegexType,
  atom, literal, fn, array, tuple, neg,
  typeEquals,
} from './types'
import { isSubtype } from './subtype'

// ---------------------------------------------------------------------------
// Primitive types
// ---------------------------------------------------------------------------

describe('parseType — primitives', () => {
  it('Number', () => {
    expect(parseTypeAnnotation('Number')).toBe(NumberType)
  })

  it('String', () => {
    expect(parseTypeAnnotation('String')).toBe(StringType)
  })

  it('Boolean', () => {
    expect(parseTypeAnnotation('Boolean')).toBe(BooleanType)
  })

  it('Null', () => {
    expect(parseTypeAnnotation('Null')).toBe(NullType)
  })

  it('Regex', () => {
    expect(parseTypeAnnotation('Regex')).toBe(RegexType)
  })

  it('Unknown', () => {
    expect(parseTypeAnnotation('Unknown')).toBe(Unknown)
  })

  it('Never', () => {
    expect(parseTypeAnnotation('Never')).toBe(Never)
  })
})

// ---------------------------------------------------------------------------
// Literal types
// ---------------------------------------------------------------------------

describe('parseType — literals', () => {
  it('number literal: 42', () => {
    expect(typeEquals(parseTypeAnnotation('42'), literal(42))).toBe(true)
  })

  it('negative number: -3', () => {
    expect(typeEquals(parseTypeAnnotation('-3'), literal(-3))).toBe(true)
  })

  it('string literal: "hello"', () => {
    expect(typeEquals(parseTypeAnnotation('"hello"'), literal('hello'))).toBe(true)
  })

  it('boolean literal: true', () => {
    expect(typeEquals(parseTypeAnnotation('true'), literal(true))).toBe(true)
  })

  it('boolean literal: false', () => {
    expect(typeEquals(parseTypeAnnotation('false'), literal(false))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Atom types
// ---------------------------------------------------------------------------

describe('parseType — atoms', () => {
  it(':ok', () => {
    expect(typeEquals(parseTypeAnnotation(':ok'), atom('ok'))).toBe(true)
  })

  it(':error', () => {
    expect(typeEquals(parseTypeAnnotation(':error'), atom('error'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Union and intersection
// ---------------------------------------------------------------------------

describe('parseType — unions and intersections', () => {
  it('Number | String', () => {
    const t = parseTypeAnnotation('Number | String')
    expect(isSubtype(NumberType, t)).toBe(true)
    expect(isSubtype(StringType, t)).toBe(true)
  })

  it('Number | String | Boolean', () => {
    const t = parseTypeAnnotation('Number | String | Boolean')
    expect(isSubtype(NumberType, t)).toBe(true)
    expect(isSubtype(BooleanType, t)).toBe(true)
  })

  it('Number & !0', () => {
    const t = parseTypeAnnotation('Number & !0')
    expect(isSubtype(literal(42), t)).toBe(true)
    expect(isSubtype(literal(0), t)).toBe(false)
  })

  it('{name: String} & {age: Number}', () => {
    const t = parseTypeAnnotation('{name: String} & {age: Number}')
    expect(t.tag).toBe('Inter')
  })
})

// ---------------------------------------------------------------------------
// Negation
// ---------------------------------------------------------------------------

describe('parseType — negation', () => {
  it('!Null', () => {
    const t = parseTypeAnnotation('!Null')
    expect(typeEquals(t, neg(NullType))).toBe(true)
  })

  it('!String', () => {
    const t = parseTypeAnnotation('!String')
    expect(isSubtype(NumberType, t)).toBe(true)
    expect(isSubtype(StringType, t)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Array and tuple types
// ---------------------------------------------------------------------------

describe('parseType — arrays and tuples', () => {
  it('Number[]', () => {
    const t = parseTypeAnnotation('Number[]')
    expect(typeEquals(t, array(NumberType))).toBe(true)
  })

  it('String[][]', () => {
    const t = parseTypeAnnotation('String[][]')
    expect(typeEquals(t, array(array(StringType)))).toBe(true)
  })

  it('[String, Number]', () => {
    const t = parseTypeAnnotation('[String, Number]')
    expect(typeEquals(t, tuple([StringType, NumberType]))).toBe(true)
  })

  it('[String, Number][]', () => {
    const t = parseTypeAnnotation('[String, Number][]')
    expect(typeEquals(t, array(tuple([StringType, NumberType])))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Record types
// ---------------------------------------------------------------------------

describe('parseType — records', () => {
  it('{name: String, age: Number}', () => {
    const t = parseTypeAnnotation('{name: String, age: Number}')
    expect(t.tag).toBe('Record')
    if (t.tag === 'Record') {
      expect(typeEquals(t.fields.get('name')!, StringType)).toBe(true)
      expect(typeEquals(t.fields.get('age')!, NumberType)).toBe(true)
      expect(t.open).toBe(false)
    }
  })

  it('{name: String, ...} (open record)', () => {
    const t = parseTypeAnnotation('{name: String, ...}')
    expect(t.tag).toBe('Record')
    if (t.tag === 'Record') {
      expect(t.open).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// Function types
// ---------------------------------------------------------------------------

describe('parseType — functions', () => {
  it('(Number, Number) -> Number', () => {
    const t = parseTypeAnnotation('(Number, Number) -> Number')
    expect(typeEquals(t, fn([NumberType, NumberType], NumberType))).toBe(true)
  })

  it('() -> String', () => {
    const t = parseTypeAnnotation('() -> String')
    expect(typeEquals(t, fn([], StringType))).toBe(true)
  })

  it('(String) -> Number', () => {
    const t = parseTypeAnnotation('(String) -> Number')
    expect(typeEquals(t, fn([StringType], NumberType))).toBe(true)
  })

  it('nested function: (Number) -> (String) -> Boolean', () => {
    const t = parseTypeAnnotation('(Number) -> (String) -> Boolean')
    expect(typeEquals(t, fn([NumberType], fn([StringType], BooleanType)))).toBe(true)
  })

  it('union of function types (overloads)', () => {
    const t = parseTypeAnnotation('((Number, Number) -> Number) | ((String, String) -> String)')
    expect(t.tag).toBe('Union')
  })
})

// ---------------------------------------------------------------------------
// Type guard syntax
// ---------------------------------------------------------------------------

describe('parseFunctionType — type guards', () => {
  it('(x: Unknown) -> x is Number', () => {
    const result = parseFunctionTypeAnnotation('(x: Unknown) -> x is Number')
    expect(typeEquals(result.type, fn([Unknown], BooleanType))).toBe(true)
    expect(result.guardParam).toBe('x')
    expect(typeEquals(result.guardType!, NumberType)).toBe(true)
  })

  it('(x: Unknown) -> x is String', () => {
    const result = parseFunctionTypeAnnotation('(x: Unknown) -> x is String')
    expect(result.guardParam).toBe('x')
    expect(typeEquals(result.guardType!, StringType)).toBe(true)
  })

  it('(x: Unknown) -> x is :ok', () => {
    const result = parseFunctionTypeAnnotation('(x: Unknown) -> x is :ok')
    expect(result.guardParam).toBe('x')
    expect(typeEquals(result.guardType!, atom('ok'))).toBe(true)
  })

  it('regular function (not a guard)', () => {
    const result = parseFunctionTypeAnnotation('(Number) -> String')
    expect(result.guardParam).toBeUndefined()
    expect(result.guardType).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Complex / real-world examples
// ---------------------------------------------------------------------------

describe('parseType — real-world builtin signatures', () => {
  it('+ operator: (Number, Number) -> Number', () => {
    const t = parseTypeAnnotation('(Number, Number) -> Number')
    expect(t.tag).toBe('Function')
  })

  it('count: (String | Unknown[]) -> Number', () => {
    const t = parseTypeAnnotation('(String | Unknown[]) -> Number')
    expect(t.tag).toBe('Function')
  })

  it('get: ({...}, String) -> Unknown', () => {
    const t = parseTypeAnnotation('({...}, String) -> Unknown')
    expect(t.tag).toBe('Function')
  })

  it('parenthesized type: (Number)', () => {
    const t = parseTypeAnnotation('(Number)')
    expect(typeEquals(t, NumberType)).toBe(true)
  })

  it('error on invalid input', () => {
    expect(() => parseTypeAnnotation('???')).toThrow(TypeParseError)
  })
})
