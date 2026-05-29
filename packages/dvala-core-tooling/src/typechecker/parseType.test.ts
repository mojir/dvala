import { afterEach, describe, expect, it } from 'vitest'
import {
  parseTypeAnnotation,
  parseFunctionTypeAnnotation,
  registerTypeAlias,
  resetTypeAliases,
  TypeParseError,
} from './parseType'
import {
  NumberType,
  IntegerType,
  StringType,
  BooleanType,
  NullType,
  Unknown,
  Never,
  RegexType,
  atom,
  literal,
  fn,
  array,
  tuple,
  neg,
  union,
  effectSet,
  effectSetToString,
  handlerType,
  typeToString,
  typeEquals,
} from './types'
import { declareEffect, resetEffectRegistry } from './effectTypes'
import { isSubtype } from './subtype'

afterEach(() => {
  resetEffectRegistry()
  resetTypeAliases()
})

// ---------------------------------------------------------------------------
// Primitive types
// ---------------------------------------------------------------------------

describe('parseType — primitives', () => {
  it('Number', () => {
    expect(parseTypeAnnotation('Number')).toBe(NumberType)
  })

  it('Integer', () => {
    expect(parseTypeAnnotation('Integer')).toBe(IntegerType)
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
// Nullable types (T?)
// ---------------------------------------------------------------------------

describe('parseType — nullable', () => {
  it('Number? = Number | Null', () => {
    const t = parseTypeAnnotation('Number?')
    expect(isSubtype(NumberType, t)).toBe(true)
    expect(isSubtype(NullType, t)).toBe(true)
  })

  it('String? = String | Null', () => {
    const t = parseTypeAnnotation('String?')
    expect(isSubtype(StringType, t)).toBe(true)
    expect(isSubtype(NullType, t)).toBe(true)
  })

  it('Number?[] = array of nullable numbers', () => {
    const t = parseTypeAnnotation('Number?[]')
    expect(typeEquals(t, array(union(NumberType, NullType)))).toBe(true)
  })

  it(':ok? = :ok | Null', () => {
    const t = parseTypeAnnotation(':ok?')
    expect(isSubtype(atom('ok'), t)).toBe(true)
    expect(isSubtype(NullType, t)).toBe(true)
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
// Type aliases
// ---------------------------------------------------------------------------

describe('parseType — type aliases', () => {
  it('expands simple aliases', () => {
    registerTypeAlias('Id', [], 'Number')

    const t = parseTypeAnnotation('Id')
    expect(typeEquals(t, { tag: 'Alias', name: 'Id', args: [], expanded: NumberType })).toBe(true)
  })

  it('expands generic aliases with one type argument', () => {
    registerTypeAlias('Box', [{ name: 'T' }], '{ value: T }')

    const t = parseTypeAnnotation('Box<Number>')
    expect(
      typeEquals(t, {
        tag: 'Alias',
        name: 'Box',
        args: [NumberType],
        expanded: { tag: 'Record', fields: new Map([['value', NumberType]]), open: false },
      }),
    ).toBe(true)
  })

  it('expands generic aliases with multiple type arguments', () => {
    registerTypeAlias('Result', [{ name: 'T' }, { name: 'E' }], '{ tag: :ok, value: T } | { tag: :error, error: E }')

    const t = parseTypeAnnotation('Result<Number, String>')
    expect(
      typeEquals(t, {
        tag: 'Alias',
        name: 'Result',
        args: [NumberType, StringType],
        expanded: union(
          {
            tag: 'Record',
            fields: new Map([
              ['tag', atom('ok')],
              ['value', NumberType],
            ]),
            open: false,
          },
          {
            tag: 'Record',
            fields: new Map([
              ['tag', atom('error')],
              ['error', StringType],
            ]),
            open: false,
          },
        ),
      }),
    ).toBe(true)
  })

  it('supports nested generic alias expansion', () => {
    registerTypeAlias('Box', [{ name: 'T' }], '{ value: T }')
    registerTypeAlias('MaybeBox', [{ name: 'T' }], 'Box<T> | Null')

    const t = parseTypeAnnotation('MaybeBox<Number>')
    expect(
      typeEquals(t, {
        tag: 'Alias',
        name: 'MaybeBox',
        args: [NumberType],
        expanded: union(
          {
            tag: 'Alias',
            name: 'Box',
            args: [NumberType],
            expanded: { tag: 'Record', fields: new Map([['value', NumberType]]), open: false },
          },
          NullType,
        ),
      }),
    ).toBe(true)
  })

  it('errors on wrong number of type arguments', () => {
    registerTypeAlias('Box', [{ name: 'T' }], '{ value: T }')

    expect(() => parseTypeAnnotation('Box')).toThrow(TypeParseError)
    expect(() => parseTypeAnnotation('Box<Number, String>')).toThrow(TypeParseError)
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

  it('(String) -> @{http.get} Number', () => {
    const t = parseTypeAnnotation('(String) -> @{http.get} Number')
    expect(typeEquals(t, fn([StringType], NumberType, effectSet(['http.get'])))).toBe(true)
  })

  it('() -> @{log, ...} Null', () => {
    const t = parseTypeAnnotation('() -> @{log, ...} Null')
    expect(typeEquals(t, fn([], NullType, effectSet(['log'], true)))).toBe(true)
  })

  it('(String) -> @ { http . get } Number', () => {
    const t = parseTypeAnnotation('(String) -> @ { http . get } Number')
    expect(typeEquals(t, fn([StringType], NumberType, effectSet(['http.get'])))).toBe(true)
  })

  it('(Number, ...Number[]) -> Number', () => {
    const t = parseTypeAnnotation('(Number, ...Number[]) -> Number')
    expect(typeEquals(t, fn([NumberType], NumberType, effectSet([]), undefined, NumberType))).toBe(true)
  })

  it('(...Unknown[]) -> Unknown[]', () => {
    const t = parseTypeAnnotation('(...Unknown[]) -> Unknown[]')
    expect(typeEquals(t, fn([], array(Unknown), effectSet([]), undefined, Unknown))).toBe(true)
  })

  it('Handler<Number, Number, @{test.log}>', () => {
    declareEffect('test.log', StringType, NullType)

    const t = parseTypeAnnotation('Handler<Number, Number, @{test.log}>')
    expect(
      typeEquals(
        t,
        handlerType(NumberType, NumberType, new Map([['test.log', { argType: StringType, retType: NullType }]])),
      ),
    ).toBe(true)
  })

  // --- Phase 4-A: Handler<…> 4-slot form with @{introduced} ---

  it('Handler<Number, Number, @{test.log}, @{}> — explicit empty introduced equals 3-slot form', () => {
    declareEffect('test.log', StringType, NullType)
    const t4 = parseTypeAnnotation('Handler<Number, Number, @{test.log}, @{}>')
    const t3 = parseTypeAnnotation('Handler<Number, Number, @{test.log}>')
    expect(typeEquals(t4, t3)).toBe(true)
  })

  it('Handler<Number, Number, @{test.log}, @{io.print}> — 4-slot form with real introduced set', () => {
    declareEffect('test.log', StringType, NullType)
    const t = parseTypeAnnotation('Handler<Number, Number, @{test.log}, @{io.print}>')
    if (t.tag !== 'Handler') throw new Error('expected Handler')
    expect(t.introduced.effects.has('io.print')).toBe(true)
    expect(t.introduced.tail.tag).toBe('Closed')
  })

  it('union of function types (overloads)', () => {
    const t = parseTypeAnnotation('((Number, Number) -> Number) | ((String, String) -> String)')
    expect(t.tag).toBe('Union')
  })
})

// ---------------------------------------------------------------------------
// Phase 4-A: row-variable effect polymorphism — parser + data model only.
// Biunification behaviour (subtyping, constrain) is enabled in Phase B.
// ---------------------------------------------------------------------------

describe('parseType — row-variable tails (Phase 4-A)', () => {
  it('@{e | r} — single row-var tail produces RowVar with identity', () => {
    const t = parseTypeAnnotation('() -> @{log | r} Null')
    if (t.tag !== 'Function') throw new Error('expected Function')
    expect(t.effects.effects.has('log')).toBe(true)
    expect(t.effects.tail.tag).toBe('RowVar')
  })

  it('@{| r} — row-var-only tail (empty effects)', () => {
    const t = parseTypeAnnotation('() -> @{| r} Null')
    if (t.tag !== 'Function') throw new Error('expected Function')
    expect(t.effects.effects.size).toBe(0)
    expect(t.effects.tail.tag).toBe('RowVar')
  })

  it('same row-var name within one annotation → shared RowVar identity', () => {
    // Same `r` in thunk arg and return position must reference the same row var.
    const t = parseTypeAnnotation('(() -> @{choose | r} String) -> @{dvala.random.item | r} String')
    if (t.tag !== 'Function') throw new Error('expected Function')
    const arg = t.params[0]
    if (!arg || arg.tag !== 'Function') throw new Error('expected Function arg')
    if (arg.effects.tail.tag !== 'RowVar' || t.effects.tail.tag !== 'RowVar') {
      throw new Error('expected RowVar tails')
    }
    expect(arg.effects.tail.id).toBe(t.effects.tail.id)
  })

  it('different row-var names within one annotation → distinct RowVars', () => {
    const t = parseTypeAnnotation('(() -> @{a | r} String) -> @{b | s} String')
    if (t.tag !== 'Function') throw new Error('expected Function')
    const arg = t.params[0]
    if (!arg || arg.tag !== 'Function') throw new Error('expected Function arg')
    if (arg.effects.tail.tag !== 'RowVar' || t.effects.tail.tag !== 'RowVar') {
      throw new Error('expected RowVar tails')
    }
    expect(arg.effects.tail.id).not.toBe(t.effects.tail.id)
  })

  it('independent annotations do not share row-var ids across parses', () => {
    // Each parseTypeAnnotation call uses its own counter, so two unrelated
    // parses producing "r" tails result in independent identities.
    const t1 = parseTypeAnnotation('() -> @{| r} Null')
    const t2 = parseTypeAnnotation('() -> @{| r} Null')
    if (t1.tag !== 'Function' || t2.tag !== 'Function') throw new Error('expected Function')
    if (t1.effects.tail.tag !== 'RowVar' || t2.effects.tail.tag !== 'RowVar') throw new Error('expected RowVar')
    // Not checking id equality — what matters is each call gets a fresh
    // counter, so these are structurally distinct even if they happen to
    // share an id number.
    expect(t1.effects.tail.id).toBe(0)
    expect(t2.effects.tail.id).toBe(0)
    expect(t1.effects.tail).not.toBe(t2.effects.tail)
  })

  it('row-var and open-tail forms are distinct shapes', () => {
    const tRow = parseTypeAnnotation('() -> @{| r} Null')
    const tOpen = parseTypeAnnotation('() -> @{...} Null')
    if (tRow.tag !== 'Function' || tOpen.tag !== 'Function') throw new Error('expected Function')
    expect(tRow.effects.tail.tag).toBe('RowVar')
    expect(tOpen.effects.tail.tag).toBe('Open')
  })

  it('@{r} — single lowercase-letter name without | prefix parses as an effect name, not a row var', () => {
    // "r" alone is ambiguous with a short effect name. The `|` separator is
    // the only signal for a row-var tail. Guards against parser restructure
    // regressions (e.g. if someone were to reorder the branches and try to
    // interpret a single lowercase letter as a row-var name).
    const t = parseTypeAnnotation('() -> @{r} Null')
    if (t.tag !== 'Function') throw new Error('expected Function')
    expect(t.effects.effects.has('r')).toBe(true)
    expect(t.effects.tail.tag).toBe('Closed')
  })

  it('row-var subtyping: identical row-var signatures are subtypes of each other', () => {
    // Two annotations produce independent row vars (fresh per parse),
    // but the concrete parts match and isSubtype treats row-var tails
    // conservatively — this confirms the wire-up, not the propagation.
    // End-to-end propagation tests live in infer.test.ts under
    // "effect row variables (Phase 4-A Phase B)".
    const tA = parseTypeAnnotation('(() -> @{choose | r} Null) -> @{dvala.random.item | r} Null')
    const tB = parseTypeAnnotation('(() -> @{choose | r} Null) -> @{dvala.random.item | r} Null')
    expect(isSubtype(tA, tB)).toBe(true)
  })
})

describe('effectSetToString — display policy for row-var tails (Phase 4-A)', () => {
  it('Closed tail prints as @{effects}', () => {
    expect(effectSetToString(effectSet(['log']))).toBe('@{log}')
  })

  it('empty Closed tail prints as empty string (pure)', () => {
    expect(effectSetToString(effectSet([]))).toBe('')
  })

  it('Open tail prints as @{effects, ...}', () => {
    expect(effectSetToString(effectSet(['log'], true))).toBe('@{log, ...}')
  })

  it('empty Open tail prints as @{...}', () => {
    expect(effectSetToString(effectSet([], true))).toBe('@{...}')
  })

  it('RowVar tail prints as @{effects | ρN}', () => {
    const t = parseTypeAnnotation('() -> @{log | r} Null')
    if (t.tag !== 'Function') throw new Error('expected Function')
    // First row var allocated during parse is id=0 → ρ0.
    expect(effectSetToString(t.effects)).toBe('@{log | ρ0}')
  })

  it('empty RowVar tail prints as @{ρN}', () => {
    const t = parseTypeAnnotation('() -> @{| r} Null')
    if (t.tag !== 'Function') throw new Error('expected Function')
    expect(effectSetToString(t.effects)).toBe('@{ρ0}')
  })

  it('round-trip: shared row var in thunk arg and return type', () => {
    const t = parseTypeAnnotation('(() -> @{choose | r} String) -> @{dvala.random.item | r} String')
    // Printed form uses the same ρ id for both — confirms shared identity.
    const rendered = typeToString(t)
    expect(rendered).toContain('@{choose | ρ0}')
    expect(rendered).toContain('@{dvala.random.item | ρ0}')
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

// Phase 2.5c — `asserts {binder | body}` return-type annotation. Sibling
// surface to type-guards (`x is T`); produces a Boolean-returning function
// with side metadata identifying which parameter the call narrows.
describe('parseFunctionType — asserts return (Phase 2.5c)', () => {
  it('(x: Number) -> asserts {x | x > 0}', () => {
    const result = parseFunctionTypeAnnotation('(x: Number) -> asserts {x | x > 0}')
    // Function shape: takes Number, returns Boolean (asserts metadata
    // doesn't change the declared return type).
    expect(result.type.tag).toBe('Function')
    if (result.type.tag !== 'Function') return
    expect(result.type.params.length).toBe(1)
    expect(typeEquals(result.type.params[0]!, NumberType)).toBe(true)
    expect(typeEquals(result.type.ret, BooleanType)).toBe(true)
    // Asserts metadata: paramIndex 0, binder 'x', source string.
    expect(result.type.asserts?.paramIndex).toBe(0)
    expect(result.type.asserts?.binder).toBe('x')
    expect(result.type.asserts?.source).toBe('x | x > 0')
    // Side fields on ParsedFunctionType still populated for callers
    // that read them (BuiltinTypeInfo migration follows in step 6).
    expect(result.assertsParam).toBe('x')
    expect(result.assertsPredicate?.binder).toBe('x')
  })

  // Multi-parameter: the binder name identifies which parameter is
  // asserted. paramIndex on the Function type points to position 1
  // (the 'b' parameter).
  it('(a: Number, b: Number) -> asserts {b | b > 0}', () => {
    const result = parseFunctionTypeAnnotation('(a: Number, b: Number) -> asserts {b | b > 0}')
    expect(result.type.tag).toBe('Function')
    if (result.type.tag !== 'Function') return
    expect(result.type.params.length).toBe(2)
    expect(result.type.asserts?.paramIndex).toBe(1)
    expect(result.type.asserts?.binder).toBe('b')
    expect(result.assertsParam).toBe('b')
  })

  it('rejects when binder does not match any parameter', () => {
    expect(() => parseFunctionTypeAnnotation('(x: Number) -> asserts {n | n > 0}')).toThrow(TypeParseError)
    expect(() => parseFunctionTypeAnnotation('(x: Number) -> asserts {n | n > 0}')).toThrow(
      /binder 'n' does not match any parameter/,
    )
  })

  // Backtrack-not-throw: `asserts` isn't a reserved type name, so a
  // user-defined alias (`type asserts = Number`) should still work as
  // a return-type position. Mirrors how `is` falls through in
  // tryParseTypeGuard when the param name doesn't match.
  // Backtrack-not-throw: `asserts` isn't a reserved type name, so a
  // user-defined alias (`type asserts = Number`) should still work as
  // a return-type position. The returned type is an `Alias` wrapper
  // around Number — that's the regular type-alias path doing its
  // job, not the asserts path firing.
  it('falls through to regular return type when not followed by `{`', () => {
    registerTypeAlias('asserts', [], 'Number')
    const result = parseFunctionTypeAnnotation('(x: Number) -> asserts')
    expect(result.type.tag).toBe('Function')
    expect(result.assertsParam).toBeUndefined()
    expect(result.assertsPredicate).toBeUndefined()
  })

  it('regular function (no asserts)', () => {
    const result = parseFunctionTypeAnnotation('(Number) -> String')
    expect(result.assertsParam).toBeUndefined()
    expect(result.assertsPredicate).toBeUndefined()
  })

  // Round-trip: parse → typeToString → parse must produce a structurally
  // equal type. Anchors the rendering format and guards against drift
  // between the parser and the formatter.
  it('round-trips through typeToString', () => {
    const inputs = [
      '(x: Number) -> asserts {x | x > 0}',
      '(a: Number, b: Number) -> asserts {b | b > 0}',
      '(xs: Number[]) -> asserts {xs | count(xs) > 0}',
    ]
    for (const input of inputs) {
      const parsed = parseFunctionTypeAnnotation(input)
      const rendered = typeToString(parsed.type)
      const reparsed = parseFunctionTypeAnnotation(rendered)
      expect(typeEquals(parsed.type, reparsed.type), `round-trip failed for ${input}: rendered as ${rendered}`).toBe(
        true,
      )
    }
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

  it('error on non-array rest param type', () => {
    expect(() => parseTypeAnnotation('(...Number) -> Number')).toThrow(TypeParseError)
  })

  it('error on invalid input', () => {
    expect(() => parseTypeAnnotation('???')).toThrow(TypeParseError)
  })
})

// ---------------------------------------------------------------------------
// Indexed-access types: keyof T and T[K]
// ---------------------------------------------------------------------------

describe('parseType — keyof and indexed access', () => {
  it('keyof of a closed record is a union of literal-string keys', () => {
    expect(typeToString(parseTypeAnnotation('keyof {a: Number, b: String}'))).toBe('"a" | "b"')
  })

  it('keyof of an open record widens to String', () => {
    expect(typeToString(parseTypeAnnotation('keyof {a: Number, ...}'))).toBe('String')
  })

  it('T["name"] resolves to the matching field type', () => {
    expect(typeToString(parseTypeAnnotation('{a: Number, b: String}["b"]'))).toBe('String')
  })

  it('T[keyof T] on a closed record is the union of field types', () => {
    expect(typeToString(parseTypeAnnotation('{a: Number, b: String}[keyof {a: Number, b: String}]'))).toBe(
      'Number | String',
    )
  })

  it('closed record with missing key is Never', () => {
    expect(typeToString(parseTypeAnnotation('{a: Number}["missing"]'))).toBe('Never')
  })

  it('open record with missing key is Unknown', () => {
    expect(typeToString(parseTypeAnnotation('{a: Number, ...}["missing"]'))).toBe('Unknown')
  })

  it('identifier starting with "keyof" is not the keyword', () => {
    // `keyofThing` is an unknown alias (resolves to Unknown), NOT
    // `keyof Thing` (which would be `keyof Unknown` = `String`). The
    // keyword boundary check prevents the greedy parse.
    expect(typeToString(parseTypeAnnotation('keyofThing'))).toBe('Unknown')
    expect(typeToString(parseTypeAnnotation('keyof Thing'))).toBe('String')
  })

  it('postfix chain: T["a"][] builds an array of the field type', () => {
    expect(typeToString(parseTypeAnnotation('{a: Number}["a"][]'))).toBe('Number[]')
  })
})
