import { describe, expect, it } from 'vitest'
import { allBuiltinModules } from '../allModules'
import { createDvala } from '../createDvala'
import type { Any } from '../interface'
import { parse } from '../parser'
import type { AstNode } from '../parser/types'
import { minifyTokenStream } from '../tokenizer/minifyTokenStream'
import { tokenize } from '../tokenizer/tokenize'
import { toJS } from '../utils/interop'
import { createContextStack } from './ContextStack'
import type { FoldResult } from './foldEvaluate'
import { evaluateNodeForFold } from './foldEvaluate'

// Shared module map — same registrations for both eval paths so module
// imports resolve identically in runNormal and runFold.
const moduleMap = new Map(allBuiltinModules.map(m => [m.name, m]))

// Parse a Dvala source snippet to a single AST node. Requires the source
// to be a single top-level expression (no let-bindings, no semicolons).
function parseExpression(source: string): AstNode {
  const tokens = tokenize(source, true, undefined)
  const minified = minifyTokenStream(tokens, { removeWhiteSpace: true })
  const ast = parse(minified)
  if (ast.length !== 1) {
    throw new Error(`parseExpression expected a single expression, got ${ast.length} top-level nodes: ${source}`)
  }
  return ast[0]!
}

const dvala = createDvala({ modules: allBuiltinModules })
function runNormal(source: string): unknown {
  return dvala.run(source)
}

// Run the same source through the fold sandbox. The `ok: true` value is
// normalised via `toJS` so the shape matches `runNormal`'s return (plain
// arrays / plain objects, not PersistentVector / PersistentMap). The
// context stack uses the same module registry as runNormal so module
// imports resolve identically.
function runFold(source: string): FoldResult {
  const node = parseExpression(source)
  const result = evaluateNodeForFold(node, createContextStack({}, moduleMap))
  if (result.ok) {
    return { ok: true, value: toJS(result.value) as Any }
  }
  return result
}

// For every case, assert both paths agree. Covers the Phase B invariant:
// fold(expr) and eval(expr) produce the same observable result for pure
// code, and fold surfaces @dvala.error when eval would throw a DvalaError.
describe('evaluateNodeForFold — differential equivalence with normal evaluator', () => {
  // --- math.ts (core) ---
  describe('math: arithmetic and rounding', () => {
    const cases: { src: string; expected: number }[] = [
      // +, -, *, / (binary and variadic)
      { src: '1 + 2', expected: 3 },
      { src: '+(1, 2, 3, 4)', expected: 10 },
      { src: '10 - 3', expected: 7 },
      { src: '-(10)', expected: -10 },
      { src: '-(100, 1, 2, 3)', expected: 94 },
      { src: '4 * 5', expected: 20 },
      { src: '*(2, 3, 4)', expected: 24 },
      { src: '20 / 4', expected: 5 },
      { src: '/(16, 2, 2)', expected: 4 },
      // integer division / modulo
      { src: '17 % 5', expected: 2 },
      { src: 'quot(17, 5)', expected: 3 },
      { src: 'mod(-7, 3)', expected: 2 },
      // unary
      { src: 'inc(41)', expected: 42 },
      { src: 'dec(43)', expected: 42 },
      { src: 'abs(-5)', expected: 5 },
      { src: 'abs(5)', expected: 5 },
      { src: 'sign(-3.14)', expected: -1 },
      { src: 'sign(0)', expected: 0 },
      { src: 'sign(42)', expected: 1 },
      // roots and powers
      { src: 'sqrt(9)', expected: 3 },
      { src: 'sqrt(0)', expected: 0 },
      { src: 'cbrt(27)', expected: 3 },
      { src: 'cbrt(-8)', expected: -2 },
      { src: '2 ^ 10', expected: 1024 },
      { src: '5 ^ 0', expected: 1 },
      // rounding
      { src: 'floor(3.9)', expected: 3 },
      { src: 'floor(-3.1)', expected: -4 },
      { src: 'ceil(3.1)', expected: 4 },
      { src: 'ceil(-3.9)', expected: -3 },
      { src: 'round(2.5)', expected: 3 },
      { src: 'round(-2.5)', expected: -2 },
      { src: 'round(1.23456789, 4)', expected: 1.2346 },
      { src: 'trunc(3.9)', expected: 3 },
      { src: 'trunc(-3.9)', expected: -3 },
      // min/max
      { src: 'min(3, 1, 2)', expected: 1 },
      { src: 'min(-5, -10)', expected: -10 },
      { src: 'max(3, 1, 2)', expected: 3 },
      { src: 'max(-5, -10)', expected: -5 },
      // identity values for variadic
      { src: '+()', expected: 0 },
      { src: '*()', expected: 1 },
    ]

    for (const { src, expected } of cases) {
      it(src, () => {
        expect(runNormal(src)).toBe(expected)
        expect(runFold(src)).toEqual({ ok: true, value: expected })
      })
    }
  })

  // --- bitwise.ts (core) ---
  describe('bitwise', () => {
    const cases: { src: string; expected: number }[] = [
      { src: '1 << 10', expected: 1024 },
      { src: '2048 >> 10', expected: 2 },
      { src: '-16 >>> 2', expected: 1073741820 },
      { src: '0b0011 & 0b0110', expected: 0b0010 },
      { src: '0b0011 | 0b0110', expected: 0b0111 },
      { src: '0b0011 xor 0b0110', expected: 0b0101 },
      { src: '&(0b1111, 0b1010, 0b1100)', expected: 0b1000 },
      { src: '|(0b0001, 0b0010, 0b0100)', expected: 0b0111 },
    ]

    for (const { src, expected } of cases) {
      it(src, () => {
        expect(runNormal(src)).toBe(expected)
        expect(runFold(src)).toEqual({ ok: true, value: expected })
      })
    }
  })

  // --- predicates.ts (core) ---
  describe('predicates', () => {
    const cases: { src: string; expected: boolean }[] = [
      // type kind
      { src: 'isNumber(42)', expected: true },
      { src: 'isNumber("hi")', expected: false },
      { src: 'isNumber(null)', expected: false },
      { src: 'isString("hi")', expected: true },
      { src: 'isString(42)', expected: false },
      { src: 'isBoolean(true)', expected: true },
      { src: 'isBoolean(0)', expected: false },
      { src: 'isNull(null)', expected: true },
      { src: 'isNull(0)', expected: false },
      { src: 'isAtom(:ok)', expected: true },
      { src: 'isAtom("ok")', expected: false },
      { src: 'isArray([1, 2])', expected: true },
      { src: 'isArray("hi")', expected: false },
      { src: 'isObject({ a: 1 })', expected: true },
      { src: 'isObject([])', expected: false },
      // numeric refinements
      { src: 'isInteger(5)', expected: true },
      { src: 'isInteger(5.5)', expected: false },
      { src: 'isZero(0)', expected: true },
      { src: 'isZero(0.001)', expected: false },
      { src: 'isPos(1)', expected: true },
      { src: 'isPos(0)', expected: false },
      { src: 'isNeg(-1)', expected: true },
      { src: 'isNeg(0)', expected: false },
      { src: 'isEven(4)', expected: true },
      { src: 'isEven(3)', expected: false },
      { src: 'isOdd(5)', expected: true },
      { src: 'isOdd(4)', expected: false },
      // boolean helpers
      { src: 'isTrue(true)', expected: true },
      { src: 'isTrue(1)', expected: false },
      { src: 'isFalse(false)', expected: true },
      { src: 'isFalse(null)', expected: false },
      // collection emptiness
      { src: 'isEmpty([])', expected: true },
      { src: 'isEmpty([1])', expected: false },
      { src: 'isEmpty("")', expected: true },
      { src: 'isEmpty("x")', expected: false },
      { src: 'isEmpty({})', expected: true },
      { src: 'isEmpty(null)', expected: true },
      { src: 'isNotEmpty([1, 2])', expected: true },
      { src: 'isNotEmpty([])', expected: false },
    ]

    for (const { src, expected } of cases) {
      it(src, () => {
        expect(runNormal(src)).toBe(expected)
        expect(runFold(src)).toEqual({ ok: true, value: expected })
      })
    }
  })

  // --- misc.ts (core): comparison, equality, typeOf ---
  describe('misc: comparison, equality, typeOf', () => {
    const cases: { src: string; expected: unknown }[] = [
      // ==, !=
      { src: '1 == 1', expected: true },
      { src: '1 == 2', expected: false },
      { src: '"a" == "a"', expected: true },
      { src: '1 != 2', expected: true },
      { src: '1 != 1', expected: false },
      { src: '==([1, 2], [1, 2])', expected: true },
      { src: '==({ a: 1 }, { a: 1 })', expected: true },
      // <, <=, >, >=
      { src: '1 < 2', expected: true },
      { src: '2 < 1', expected: false },
      { src: '2 <= 2', expected: true },
      { src: '3 > 2', expected: true },
      { src: '2 >= 2', expected: true },
      // not, boolean
      { src: '!(true)', expected: false },
      { src: '!(false)', expected: true },
      { src: '!(null)', expected: true },
      { src: '!(0)', expected: true },
      { src: 'boolean(1)', expected: true },
      { src: 'boolean(0)', expected: false },
      { src: 'boolean("")', expected: false },
      // compare
      { src: 'compare(1, 2)', expected: -1 },
      { src: 'compare(2, 2)', expected: 0 },
      { src: 'compare(3, 2)', expected: 1 },
      { src: 'compare("a", "b")', expected: -1 },
      { src: 'compare(:apple, :banana)', expected: -1 },
      // typeOf
      { src: 'typeOf(42)', expected: 'number' },
      { src: 'typeOf("hi")', expected: 'string' },
      { src: 'typeOf(true)', expected: 'boolean' },
      { src: 'typeOf(null)', expected: 'null' },
      { src: 'typeOf(:ok)', expected: 'atom' },
      { src: 'typeOf([])', expected: 'array' },
      { src: 'typeOf({})', expected: 'object' },
    ]

    for (const { src, expected } of cases) {
      it(src, () => {
        expect(runNormal(src)).toEqual(expected)
        expect(runFold(src)).toEqual({ ok: true, value: expected })
      })
    }
  })

  // --- string.ts (core) ---
  describe('strings (core)', () => {
    const cases: { src: string; expected: unknown }[] = [
      { src: 'count("hello")', expected: 5 },
      { src: 'count("")', expected: 0 },
      { src: 'upperCase("abc")', expected: 'ABC' },
      { src: 'lowerCase("ABC")', expected: 'abc' },
      { src: 'trim("  hi  ")', expected: 'hi' },
      { src: 'trim("")', expected: '' },
      { src: 'isBlank("")', expected: true },
      { src: 'isBlank("   \t")', expected: true },
      { src: 'isBlank("x")', expected: false },
      { src: 'isBlank(null)', expected: true },
      { src: 'str(1, 2, 3)', expected: '123' },
      { src: 'str()', expected: '' },
      { src: 'str(:ok)', expected: ':ok' },
      { src: 'number("42")', expected: 42 },
      { src: 'number("-3.14")', expected: -3.14 },
    ]

    for (const { src, expected } of cases) {
      it(src, () => {
        expect(runNormal(src)).toEqual(expected)
        expect(runFold(src)).toEqual({ ok: true, value: expected })
      })
    }
  })

  // --- object.ts (core) ---
  describe('object', () => {
    const cases: { src: string; expected: unknown }[] = [
      { src: 'keys({ a: 1, b: 2 })', expected: ['a', 'b'] },
      { src: 'keys({})', expected: [] },
      { src: 'vals({ a: 1, b: 2 })', expected: [1, 2] },
      { src: 'find({ a: 1 }, "a")', expected: ['a', 1] },
      { src: 'find({ a: 1 }, "missing")', expected: null },
      { src: 'dissoc({ a: 1, b: 2 }, "a")', expected: { b: 2 } },
      { src: 'selectKeys({ a: 1, b: 2, c: 3 }, ["a", "b"])', expected: { a: 1, b: 2 } },
    ]

    for (const { src, expected } of cases) {
      it(src, () => {
        expect(runNormal(src)).toEqual(expected)
        expect(runFold(src)).toEqual({ ok: true, value: expected })
      })
    }
  })

  // --- sequence.ts (core) ---
  describe('sequence', () => {
    const cases: { src: string; expected: unknown }[] = [
      { src: 'nth([10, 20, 30], 0)', expected: 10 },
      { src: 'nth([10, 20, 30], 2)', expected: 30 },
      { src: 'nth([10, 20, 30], 5)', expected: null },
      { src: 'nth([10, 20, 30], 5, 99)', expected: 99 },
      { src: 'nth("abc", 1)', expected: 'b' },
      { src: 'first([1, 2, 3])', expected: 1 },
      { src: 'first([])', expected: null },
      { src: 'last([1, 2, 3])', expected: 3 },
      { src: 'last([])', expected: null },
      { src: 'second([1, 2, 3])', expected: 2 },
      { src: 'indexOf([10, 20, 30], 20)', expected: 1 },
      { src: 'indexOf([10, 20, 30], 99)', expected: null },
      { src: 'reverse([1, 2, 3])', expected: [3, 2, 1] },
      { src: 'take([1, 2, 3, 4], 2)', expected: [1, 2] },
      { src: 'drop([1, 2, 3, 4], 2)', expected: [3, 4] },
      { src: 'takeLast([1, 2, 3, 4], 2)', expected: [3, 4] },
      { src: 'dropLast([1, 2, 3, 4], 2)', expected: [1, 2] },
      { src: 'slice([1, 2, 3, 4], 1, 3)', expected: [2, 3] },
      { src: 'rest([1, 2, 3])', expected: [2, 3] },
      { src: 'push([1, 2], 3)', expected: [1, 2, 3] },
      { src: 'pop([1, 2, 3])', expected: [1, 2] },
    ]

    for (const { src, expected } of cases) {
      it(src, () => {
        expect(runNormal(src)).toEqual(expected)
        expect(runFold(src)).toEqual({ ok: true, value: expected })
      })
    }
  })

  // --- collection.ts (core) ---
  describe('collection', () => {
    const cases: { src: string; expected: unknown }[] = [
      { src: 'count([1, 2, 3])', expected: 3 },
      { src: 'count({ a: 1 })', expected: 1 },
      { src: 'count(null)', expected: 0 },
      { src: 'get([10, 20, 30], 1)', expected: 20 },
      { src: 'get([10, 20, 30], 99, "default")', expected: 'default' },
      { src: 'get({ a: 1 }, "a")', expected: 1 },
      { src: 'get({ a: 1 }, "missing", 99)', expected: 99 },
      { src: 'contains([1, 2, 3], 2)', expected: true },
      { src: 'contains([1, 2, 3], 99)', expected: false },
      { src: 'contains({ a: 1 }, "a")', expected: true },
      { src: 'contains("hello", "ell")', expected: true },
      { src: 'assoc([1, 2, 3], 1, 99)', expected: [1, 99, 3] },
      { src: 'assoc({ a: 1 }, "b", 2)', expected: { a: 1, b: 2 } },
      { src: '++([1, 2], [3, 4])', expected: [1, 2, 3, 4] },
      { src: '"ab" ++ "cd"', expected: 'abcd' },
    ]

    for (const { src, expected } of cases) {
      it(src, () => {
        expect(runNormal(src)).toEqual(expected)
        expect(runFold(src)).toEqual({ ok: true, value: expected })
      })
    }
  })

  // --- array.ts (core) ---
  describe('array', () => {
    const cases: { src: string; expected: unknown }[] = [
      { src: 'range(3)', expected: [0, 1, 2] },
      { src: 'range(0)', expected: [] },
      { src: 'range(1, 4)', expected: [1, 2, 3] },
      { src: 'range(0, 10, 2)', expected: [0, 2, 4, 6, 8] },
      { src: 'repeat("x", 3)', expected: ['x', 'x', 'x'] },
      { src: 'repeat(0, 0)', expected: [] },
      { src: 'flatten([1, [2, 3], [4, [5]]])', expected: [1, 2, 3, 4, 5] },
      { src: 'flatten([1, [2, [3]]], 1)', expected: [1, 2, [3]] },
    ]

    for (const { src, expected } of cases) {
      it(src, () => {
        expect(runNormal(src)).toEqual(expected)
        expect(runFold(src)).toEqual({ ok: true, value: expected })
      })
    }
  })

  // --- regexp.ts (core) ---
  describe('regexp', () => {
    const cases: { src: string; expected: unknown }[] = [
      { src: 'replace("Duck duck", "u", "i")', expected: 'Dick duck' },
      { src: 'replaceAll("Duck duck", "u", "i")', expected: 'Dick dick' },
      { src: 'reMatch("foo123", #"[0-9]+")', expected: ['123'] },
      { src: 'reMatch("abc", #"[0-9]+")', expected: null },
    ]

    for (const { src, expected } of cases) {
      it(src, () => {
        expect(runNormal(src)).toEqual(expected)
        expect(runFold(src)).toEqual({ ok: true, value: expected })
      })
    }
  })

  // --- functional.ts (core): pure TS impls only (|> and apply are Dvala-impl) ---
  describe('functional: identity, comp, constantly', () => {
    it('identity(42)', () => {
      expect(runNormal('identity(42)')).toBe(42)
      expect(runFold('identity(42)')).toEqual({ ok: true, value: 42 })
    })

    // comp and constantly return function values. We don't compare function
    // identity — just assert fold succeeds and the returned values are the
    // same shape/type from both paths.
    it('comp returns a function, both paths agree on shape', () => {
      const normal = runNormal('comp(inc, inc)')
      const fold = runFold('comp(inc, inc)')
      expect(fold.ok).toBe(true)
      if (fold.ok) {
        expect(typeof fold.value).toBe(typeof normal)
      }
    })

    it('constantly returns a function, both paths agree on shape', () => {
      const normal = runNormal('constantly(42)')
      const fold = runFold('constantly(42)')
      expect(fold.ok).toBe(true)
      if (fold.ok) {
        expect(typeof fold.value).toBe(typeof normal)
      }
    })
  })

  // --- Failure cases — fold surfaces the effect name; normal eval throws. ---
  describe('partial ops — @dvala.error surface', () => {
    const cases: string[] = [
      '1 / 0',
      'sqrt(-1)',
      '1 % 0',
      'cbrt(0) / 0',
      'number("not-a-number")',
    ]

    for (const src of cases) {
      it(`${src} — fold surfaces @dvala.error, normal eval throws`, () => {
        expect(() => runNormal(src)).toThrow()

        const fold = runFold(src)
        expect(fold).toEqual({ ok: false, reason: 'effect', effectName: 'dvala.error' })
      })
    }
  })

  // --- modules/math (all 17 TS-impl builtins) ---
  describe('module: math', () => {
    const cases: { src: string; expected: number }[] = [
      // Trig
      { src: 'do let { sin } = import("math"); sin(0) end', expected: 0 },
      { src: 'do let { cos } = import("math"); cos(0) end', expected: 1 },
      { src: 'do let { tan } = import("math"); tan(0) end', expected: 0 },
      { src: 'do let { asin } = import("math"); asin(0) end', expected: 0 },
      { src: 'do let { acos } = import("math"); acos(1) end', expected: 0 },
      { src: 'do let { atan } = import("math"); atan(0) end', expected: 0 },
      // Hyperbolic
      { src: 'do let { sinh } = import("math"); sinh(0) end', expected: 0 },
      { src: 'do let { cosh } = import("math"); cosh(0) end', expected: 1 },
      { src: 'do let { tanh } = import("math"); tanh(0) end', expected: 0 },
      { src: 'do let { asinh } = import("math"); asinh(0) end', expected: 0 },
      { src: 'do let { acosh } = import("math"); acosh(1) end', expected: 0 },
      { src: 'do let { atanh } = import("math"); atanh(0) end', expected: 0 },
      // Logarithms
      { src: 'do let { ln } = import("math"); ln(1) end', expected: 0 },
      { src: 'do let { log2 } = import("math"); log2(8) end', expected: 3 },
      { src: 'do let { log10 } = import("math"); log10(1000) end', expected: 3 },
      // Angle conversions
      { src: 'do let { toRad } = import("math"); toRad(180) end', expected: Math.PI },
      { src: 'do let { toDeg } = import("math"); toDeg(0) end', expected: 0 },
    ]

    for (const { src, expected } of cases) {
      it(src, () => {
        expect(runNormal(src)).toBeCloseTo(expected, 10)
        const fold = runFold(src)
        expect(fold.ok).toBe(true)
        if (fold.ok)
          expect(fold.value as number).toBeCloseTo(expected, 10)
      })
    }
  })

  // --- modules/string (extensions beyond core/string) ---
  describe('module: string (extensions)', () => {
    const cases: { src: string; expected: unknown }[] = [
      { src: 'do let { splitLines } = import("string"); splitLines("a\\nb\\nc") end', expected: ['a', 'b', 'c'] },
      { src: 'do let { fromCharCode } = import("string"); fromCharCode(65) end', expected: 'A' },
      { src: 'do let { toCharCode } = import("string"); toCharCode("A") end', expected: 65 },
      { src: 'do let { encodeUriComponent } = import("string"); encodeUriComponent("hello world") end', expected: 'hello%20world' },
      { src: 'do let { decodeUriComponent } = import("string"); decodeUriComponent("hello%20world") end', expected: 'hello world' },
      { src: 'do let { encodeBase64 } = import("string"); encodeBase64("hi") end', expected: 'aGk=' },
      { src: 'do let { decodeBase64 } = import("string"); decodeBase64("aGk=") end', expected: 'hi' },
    ]

    for (const { src, expected } of cases) {
      it(src, () => {
        expect(runNormal(src)).toEqual(expected)
        expect(runFold(src)).toEqual({ ok: true, value: expected })
      })
    }
  })

  // --- modules/assertion (success paths; failures surface @dvala.error) ---
  describe('module: assertion (success paths)', () => {
    const cases: string[] = [
      'do let { assertEqual } = import("assertion"); assertEqual(1, 1) end',
      'do let { assertNotEqual } = import("assertion"); assertNotEqual(1, 2) end',
      'do let { assertGt } = import("assertion"); assertGt(2, 1) end',
      'do let { assertLt } = import("assertion"); assertLt(1, 2) end',
      'do let { assertTrue } = import("assertion"); assertTrue(true) end',
      'do let { assertFalse } = import("assertion"); assertFalse(false) end',
      'do let { assertNull } = import("assertion"); assertNull(null) end',
    ]

    for (const src of cases) {
      it(src, () => {
        expect(runNormal(src)).toBeNull()
        expect(runFold(src)).toEqual({ ok: true, value: null })
      })
    }
  })

  describe('module: assertion (failure → @dvala.error)', () => {
    const cases: string[] = [
      'do let { assertEqual } = import("assertion"); assertEqual(1, 2) end',
      'do let { assertTrue } = import("assertion"); assertTrue(false) end',
      'do let { assertGt } = import("assertion"); assertGt(1, 2) end',
    ]

    for (const src of cases) {
      it(`${src} — surfaces @dvala.error`, () => {
        expect(() => runNormal(src)).toThrow()
        expect(runFold(src)).toEqual({ ok: false, reason: 'effect', effectName: 'dvala.error' })
      })
    }
  })

  // --- modules/ast (constructors & predicates) ---
  describe('module: ast', () => {
    const cases: string[] = [
      'do let { num } = import("ast"); num(42) end',
      'do let { strNode } = import("ast"); strNode("hi") end',
      'do let { bool } = import("ast"); bool(true) end',
      'do let { nil } = import("ast"); nil() end',
      'do let { sym } = import("ast"); sym("x") end',
      'do let { isNum, num } = import("ast"); isNum(num(5)) end',
      'do let { isStr, strNode } = import("ast"); isStr(strNode("hi")) end',
      'do let { isSym, sym } = import("ast"); isSym(sym("x")) end',
      'do let { nodeType, num } = import("ast"); nodeType(num(5)) end',
    ]

    for (const src of cases) {
      it(src, () => {
        const normal = runNormal(src)
        const fold = runFold(src)
        expect(fold.ok).toBe(true)
        if (fold.ok)
          expect(fold.value).toEqual(normal)
      })
    }
  })

  // --- modules/collection (TS-impl; skipping higher-order like mapi/filteri/reducei) ---
  describe('module: collection (extensions)', () => {
    const cases: { src: string; expected: unknown }[] = [
      { src: 'do let { getIn } = import("collection"); getIn({ a: { b: 42 } }, ["a", "b"]) end', expected: 42 },
      { src: 'do let { getIn } = import("collection"); getIn({ a: 1 }, ["missing", "x"], "default") end', expected: 'default' },
      { src: 'do let { assocIn } = import("collection"); assocIn({ a: { b: 1 } }, ["a", "b"], 99) end', expected: { a: { b: 99 } } },
      { src: 'do let { notEmpty } = import("collection"); notEmpty([1, 2, 3]) end', expected: [1, 2, 3] },
      { src: 'do let { notEmpty } = import("collection"); notEmpty([]) end', expected: null },
    ]

    for (const { src, expected } of cases) {
      it(src, () => {
        expect(runNormal(src)).toEqual(expected)
        expect(runFold(src)).toEqual({ ok: true, value: expected })
      })
    }
  })

  // --- modules/sequence (extensions beyond core/sequence; TS-impl only) ---
  describe('module: sequence (extensions)', () => {
    const cases: { src: string; expected: unknown }[] = [
      { src: 'do let { lastIndexOf } = import("sequence"); lastIndexOf([1, 2, 3, 2], 2) end', expected: 3 },
      { src: 'do let { lastIndexOf } = import("sequence"); lastIndexOf([1, 2, 3], 99) end', expected: null },
      { src: 'do let { distinct } = import("sequence"); distinct([1, 2, 2, 3, 1]) end', expected: [1, 2, 3] },
      { src: 'do let { unshift } = import("sequence"); unshift([2, 3], 1) end', expected: [1, 2, 3] },
      { src: 'do let { removeAt } = import("sequence"); removeAt([10, 20, 30], 1) end', expected: [10, 30] },
      { src: 'do let { splitAt } = import("sequence"); splitAt([1, 2, 3, 4], 2) end', expected: [[1, 2], [3, 4]] },
      { src: 'do let { interleave } = import("sequence"); interleave([1, 2, 3], [10, 20, 30]) end', expected: [1, 10, 2, 20, 3, 30] },
      { src: 'do let { interpose } = import("sequence"); interpose([1, 2, 3], 0) end', expected: [1, 0, 2, 0, 3] },
      { src: 'do let { isStartsWith } = import("sequence"); isStartsWith("Hello world", "Hello") end', expected: true },
      { src: 'do let { isStartsWith } = import("sequence"); isStartsWith("Hello world", "bye") end', expected: false },
      { src: 'do let { isEndsWith } = import("sequence"); isEndsWith("Hello world", "world") end', expected: true },
    ]

    for (const { src, expected } of cases) {
      it(src, () => {
        expect(runNormal(src)).toEqual(expected)
        expect(runFold(src)).toEqual({ ok: true, value: expected })
      })
    }
  })

  // --- modules/vector ---
  describe('module: vector', () => {
    const cases: { src: string; expected: unknown }[] = [
      { src: 'do let { sum } = import("vector"); sum([1, 2, 3]) end', expected: 6 },
      { src: 'do let { prod } = import("vector"); prod([2, 3, 4]) end', expected: 24 },
      { src: 'do let { mean } = import("vector"); mean([2, 4, 6]) end', expected: 4 },
      { src: 'do let { median } = import("vector"); median([3, 1, 2]) end', expected: 2 },
      { src: 'do let { minIndex } = import("vector"); minIndex([3, 1, 2]) end', expected: 1 },
      { src: 'do let { maxIndex } = import("vector"); maxIndex([1, 3, 2]) end', expected: 1 },
      { src: 'do let { cumsum } = import("vector"); cumsum([1, 2, 3]) end', expected: [1, 3, 6] },
      { src: 'do let { cumprod } = import("vector"); cumprod([1, 2, 3]) end', expected: [1, 2, 6] },
      { src: 'do let { isMonotonic } = import("vector"); isMonotonic([1, 2, 3]) end', expected: true },
      { src: 'do let { isIncreasing } = import("vector"); isIncreasing([1, 2, 3]) end', expected: true },
      { src: 'do let { isStrictlyIncreasing } = import("vector"); isStrictlyIncreasing([1, 2, 2]) end', expected: false },
      { src: 'do let { linspace } = import("vector"); linspace(0, 1, 5) end', expected: [0, 0.25, 0.5, 0.75, 1] },
      { src: 'do let { sortIndices } = import("vector"); sortIndices([30, 10, 20]) end', expected: [1, 2, 0] },
    ]

    for (const { src, expected } of cases) {
      it(src, () => {
        expect(runNormal(src)).toEqual(expected)
        expect(runFold(src)).toEqual({ ok: true, value: expected })
      })
    }
  })

  // --- modules/matrix ---
  describe('module: matrix', () => {
    const cases: { src: string; expected: unknown }[] = [
      { src: 'do let { mul } = import("matrix"); mul([[1, 2], [3, 4]], [[5, 6], [7, 8]]) end', expected: [[19, 22], [43, 50]] },
      { src: 'do let { det } = import("matrix"); det([[1, 2], [3, 4]]) end', expected: -2 },
      { src: 'do let { trace } = import("matrix"); trace([[1, 2], [3, 4]]) end', expected: 5 },
      { src: 'do let { isSquare } = import("matrix"); isSquare([[1, 2], [3, 4]]) end', expected: true },
      { src: 'do let { isSquare } = import("matrix"); isSquare([[1, 2, 3]]) end', expected: false },
      { src: 'do let { isDiagonal } = import("matrix"); isDiagonal([[1, 0], [0, 2]]) end', expected: true },
      { src: 'do let { isSymmetric } = import("matrix"); isSymmetric([[1, 2], [2, 1]]) end', expected: true },
      { src: 'do let { isIdentity } = import("matrix"); isIdentity([[1, 0], [0, 1]]) end', expected: true },
    ]

    for (const { src, expected } of cases) {
      it(src, () => {
        expect(runNormal(src)).toEqual(expected)
        expect(runFold(src)).toEqual({ ok: true, value: expected })
      })
    }
  })

  // --- modules/linearAlgebra ---
  describe('module: linearAlgebra', () => {
    const cases: { src: string; expected: unknown }[] = [
      { src: 'do let { dot } = import("linearAlgebra"); dot([1, 2, 3], [4, 5, 6]) end', expected: 32 },
      { src: 'do let { cross } = import("linearAlgebra"); cross([1, 0, 0], [0, 1, 0]) end', expected: [0, 0, 1] },
      { src: 'do let { lerp } = import("linearAlgebra"); lerp([0, 0], [10, 10], 0.5) end', expected: [5, 5] },
      { src: 'do let { euclideanDistance } = import("linearAlgebra"); euclideanDistance([0, 0], [3, 4]) end', expected: 5 },
      { src: 'do let { isOrthogonal } = import("linearAlgebra"); isOrthogonal([1, 0], [0, 1]) end', expected: true },
      { src: 'do let { isParallel } = import("linearAlgebra"); isParallel([1, 2], [2, 4]) end', expected: true },
      { src: 'do let { cosineSimilarity } = import("linearAlgebra"); cosineSimilarity([1, 0], [1, 0]) end', expected: 1 },
    ]

    for (const { src, expected } of cases) {
      it(src, () => {
        expect(runNormal(src)).toEqual(expected)
        expect(runFold(src)).toEqual({ ok: true, value: expected })
      })
    }
  })

  // --- modules/grid ---
  describe('module: grid', () => {
    const cases: { src: string; expected: unknown }[] = [
      { src: 'do let { shape } = import("grid"); shape([[1, 2, 3], [4, 5, 6]]) end', expected: [2, 3] },
      { src: 'do let { fill } = import("grid"); fill(2, 2, 0) end', expected: [[0, 0], [0, 0]] },
      { src: 'do let { transpose } = import("grid"); transpose([[1, 2], [3, 4]]) end', expected: [[1, 3], [2, 4]] },
      { src: 'do let { flipH } = import("grid"); flipH([[1, 2], [3, 4]]) end', expected: [[2, 1], [4, 3]] },
      { src: 'do let { flipV } = import("grid"); flipV([[1, 2], [3, 4]]) end', expected: [[3, 4], [1, 2]] },
      { src: 'do let { row } = import("grid"); row([[1, 2], [3, 4]], 0) end', expected: [1, 2] },
      { src: 'do let { col } = import("grid"); col([[1, 2], [3, 4]], 1) end', expected: [2, 4] },
    ]

    for (const { src, expected } of cases) {
      it(src, () => {
        expect(runNormal(src)).toEqual(expected)
        expect(runFold(src)).toEqual({ ok: true, value: expected })
      })
    }
  })

  // --- modules/numberTheory (extensions) ---
  describe('module: numberTheory (extensions)', () => {
    const cases: { src: string; expected: unknown }[] = [
      { src: 'do let { isCoprime } = import("numberTheory"); isCoprime(8, 9) end', expected: true },
      { src: 'do let { isCoprime } = import("numberTheory"); isCoprime(4, 6) end', expected: false },
      { src: 'do let { isDivisibleBy } = import("numberTheory"); isDivisibleBy(10, 5) end', expected: true },
      { src: 'do let { multinomial } = import("numberTheory"); multinomial(1, 2, 1) end', expected: 12 },
      { src: 'do let { eulerTotient } = import("numberTheory"); eulerTotient(9) end', expected: 6 },
      { src: 'do let { sigma } = import("numberTheory"); sigma(6) end', expected: 12 },
      { src: 'do let { modExp } = import("numberTheory"); modExp(2, 10, 1000) end', expected: 24 },
    ]

    for (const { src, expected } of cases) {
      it(src, () => {
        expect(runNormal(src)).toEqual(expected)
        expect(runFold(src)).toEqual({ ok: true, value: expected })
      })
    }
  })

  // --- modules/string ---
  describe('module: string', () => {
    const cases: { src: string; expected: unknown }[] = [
      { src: 'do let { capitalize } = import("string"); capitalize("hello") end', expected: 'Hello' },
      { src: 'do let { padLeft } = import("string"); padLeft("x", 4) end', expected: '   x' },
      { src: 'do let { padRight } = import("string"); padRight("x", 4) end', expected: 'x   ' },
      { src: 'do let { stringRepeat } = import("string"); stringRepeat("ab", 3) end', expected: 'ababab' },
      { src: 'do let { trimLeft } = import("string"); trimLeft("  hi") end', expected: 'hi' },
      { src: 'do let { trimRight } = import("string"); trimRight("hi  ") end', expected: 'hi' },
    ]

    for (const { src, expected } of cases) {
      it(src, () => {
        expect(runNormal(src)).toEqual(expected)
        expect(runFold(src)).toEqual({ ok: true, value: expected })
      })
    }
  })

  // --- modules/json ---
  describe('module: json', () => {
    const cases: { src: string; expected: unknown }[] = [
      { src: 'do let { jsonParse } = import("json"); jsonParse("42") end', expected: 42 },
      { src: 'do let { jsonParse } = import("json"); jsonParse("\\"hi\\"") end', expected: 'hi' },
      { src: 'do let { jsonParse } = import("json"); jsonParse("[1, 2, 3]") end', expected: [1, 2, 3] },
      { src: 'do let { jsonParse } = import("json"); jsonParse("{\\"a\\": 1}") end', expected: { a: 1 } },
      { src: 'do let { jsonStringify } = import("json"); jsonStringify(42) end', expected: '42' },
      { src: 'do let { jsonStringify } = import("json"); jsonStringify([1, 2, 3]) end', expected: '[1,2,3]' },
    ]

    for (const { src, expected } of cases) {
      it(src, () => {
        expect(runNormal(src)).toEqual(expected)
        expect(runFold(src)).toEqual({ ok: true, value: expected })
      })
    }
  })

  // --- modules/number-theory ---
  describe('module: numberTheory', () => {
    const cases: { src: string; expected: unknown }[] = [
      { src: 'do let { factorial } = import("numberTheory"); factorial(5) end', expected: 120 },
      { src: 'do let { factorial } = import("numberTheory"); factorial(0) end', expected: 1 },
      { src: 'do let { isPrime } = import("numberTheory"); isPrime(7) end', expected: true },
      { src: 'do let { isPrime } = import("numberTheory"); isPrime(8) end', expected: false },
      { src: 'do let { gcd } = import("numberTheory"); gcd(12, 18) end', expected: 6 },
      { src: 'do let { lcm } = import("numberTheory"); lcm(4, 6) end', expected: 12 },
    ]

    for (const { src, expected } of cases) {
      it(src, () => {
        expect(runNormal(src)).toEqual(expected)
        expect(runFold(src)).toEqual({ ok: true, value: expected })
      })
    }
  })

  // --- modules/bitwise ---
  describe('module: bitwise', () => {
    const cases: { src: string; expected: number }[] = [
      { src: 'do let { bitNot } = import("bitwise"); bitNot(0) end', expected: -1 },
      { src: 'do let { bitAndNot } = import("bitwise"); bitAndNot(0b1111, 0b0011) end', expected: 0b1100 },
    ]

    for (const { src, expected } of cases) {
      it(src, () => {
        expect(runNormal(src)).toBe(expected)
        expect(runFold(src)).toEqual({ ok: true, value: expected })
      })
    }
  })

  // --- modules/convert ---
  describe('module: convert', () => {
    const cases: { src: string; expected: number }[] = [
      { src: 'do let { kmToM } = import("convert"); kmToM(1) end', expected: 1000 },
      { src: 'do let { mToKm } = import("convert"); mToKm(2500) end', expected: 2.5 },
      { src: 'do let { kgToLb } = import("convert"); round(kgToLb(1), 4) end', expected: 2.2046 },
    ]

    for (const { src, expected } of cases) {
      it(src, () => {
        expect(runNormal(src)).toBe(expected)
        expect(runFold(src)).toEqual({ ok: true, value: expected })
      })
    }
  })

  // --- Budget exhaustion ---
  it('bails with reason=budget when step cap is exceeded', () => {
    const smallBudgetFold = evaluateNodeForFold(
      parseExpression('1 + 2 + 3 + 4 + 5'),
      createContextStack(),
      1,
    )
    expect(smallBudgetFold).toEqual({ ok: false, reason: 'budget' })

    const okFold = evaluateNodeForFold(
      parseExpression('1 + 2 + 3 + 4 + 5'),
      createContextStack(),
    )
    expect(okFold).toEqual({ ok: true, value: 15 })
  })

  // --- Top-level Perform (no handler available in fold sandbox) ---
  it('reports the effect name for a direct top-level perform', () => {
    // Performing an unhandled effect surfaces as reason=effect. This hits the
    // `step.type === 'Perform'` branch (distinct from the DvalaError-wrapped
    // 'dvala.error' path exercised by division-by-zero etc.).
    const fold = evaluateNodeForFold(
      parseExpression('perform(@my.custom, 1)'),
      createContextStack({}, moduleMap),
    )
    expect(fold).toEqual({ ok: false, reason: 'effect', effectName: 'my.custom' })
  })

  // --- Free variables fall silently into reason=error ---
  it('fails silently (reason=error) when a free variable cannot be resolved', () => {
    // `undefinedVar` is not in the fold sandbox's context stack — ReferenceError
    // is caught and mapped to { ok: false, reason: 'error' } so the caller doesn't
    // emit a spurious warning.
    const fold = evaluateNodeForFold(
      parseExpression('undefinedVar + 1'),
      createContextStack({}, moduleMap),
    )
    expect(fold).toEqual({ ok: false, reason: 'error' })
  })
})
