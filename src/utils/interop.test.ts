import { describe, expect, it } from 'vitest'
import { assertValidHostValue, validateFromJS } from './interop'
import { isPersistentMap, PersistentMap, PersistentVector } from './persistent'

describe('assertValidHostValue', () => {
  const ctx = 'test'

  // ── Valid values ──────────────────────────────────────────────────────

  describe('valid values', () => {
    it('should accept null', () => {
      expect(() => assertValidHostValue(null, ctx)).not.toThrow()
    })

    it('should accept string', () => {
      expect(() => assertValidHostValue('hello', ctx)).not.toThrow()
    })

    it('should accept number', () => {
      expect(() => assertValidHostValue(42, ctx)).not.toThrow()
    })

    it('should accept boolean', () => {
      expect(() => assertValidHostValue(true, ctx)).not.toThrow()
    })

    it('should accept plain array', () => {
      expect(() => assertValidHostValue([1, 'two', null], ctx)).not.toThrow()
    })

    it('should accept plain object', () => {
      expect(() => assertValidHostValue({ a: 1, b: 'two' }, ctx)).not.toThrow()
    })

    it('should accept nested plain structures', () => {
      expect(() => assertValidHostValue({ a: [1, { b: 2 }] }, ctx)).not.toThrow()
    })

    it('should accept PersistentVector', () => {
      expect(() => assertValidHostValue(PersistentVector.empty(), ctx)).not.toThrow()
    })

    it('should accept PersistentMap', () => {
      expect(() => assertValidHostValue(PersistentMap.empty(), ctx)).not.toThrow()
    })
  })

  // ── Rejected types ────────────────────────────────────────────────────

  describe('rejected types', () => {
    it('should reject undefined', () => {
      expect(() => assertValidHostValue(undefined, ctx))
        .toThrow(TypeError)
      expect(() => assertValidHostValue(undefined, ctx))
        .toThrow(/undefined.*is not a valid Dvala value.*Use null/)
    })

    it('should reject functions', () => {
      expect(() => assertValidHostValue(() => 1, ctx))
        .toThrow(TypeError)
      expect(() => assertValidHostValue(() => 1, ctx))
        .toThrow(/JS functions.*cannot enter the Dvala runtime/)
    })

    it('should reject symbols', () => {
      expect(() => assertValidHostValue(Symbol('x'), ctx))
        .toThrow(TypeError)
      expect(() => assertValidHostValue(Symbol('x'), ctx))
        .toThrow(/Symbols.*are not valid Dvala values/)
    })

    it('should reject bigint', () => {
      expect(() => assertValidHostValue(BigInt(42), ctx))
        .toThrow(TypeError)
      expect(() => assertValidHostValue(BigInt(42), ctx))
        .toThrow(/BigInt.*is not supported.*Convert to number/)
    })

    it('should reject Date', () => {
      expect(() => assertValidHostValue(new Date(), ctx))
        .toThrow(TypeError)
      expect(() => assertValidHostValue(new Date(), ctx))
        .toThrow(/Date objects.*are not valid Dvala values/)
    })

    it('should reject Map', () => {
      expect(() => assertValidHostValue(new Map(), ctx))
        .toThrow(TypeError)
      expect(() => assertValidHostValue(new Map(), ctx))
        .toThrow(/Map.*is not a valid Dvala value.*Convert to a plain object/)
    })

    it('should reject Set', () => {
      expect(() => assertValidHostValue(new Set(), ctx))
        .toThrow(TypeError)
      expect(() => assertValidHostValue(new Set(), ctx))
        .toThrow(/Set.*is not a valid Dvala value.*Convert to an array/)
    })

    it('should reject RegExp', () => {
      expect(() => assertValidHostValue(/foo/, ctx))
        .toThrow(TypeError)
      expect(() => assertValidHostValue(/foo/, ctx))
        .toThrow(/RegExp.*is not a valid Dvala value/)
    })

    it('should reject class instances', () => {
      class Foo { x = 1 }
      expect(() => assertValidHostValue(new Foo(), ctx))
        .toThrow(TypeError)
      expect(() => assertValidHostValue(new Foo(), ctx))
        .toThrow(/Class instance \(Foo\).*Spread to a plain object/)
    })
  })

  // ── Circular references ───────────────────────────────────────────────

  describe('circular references', () => {
    it('should reject circular object reference', () => {
      const obj: Record<string, unknown> = { a: 1 }
      obj.self = obj
      expect(() => assertValidHostValue(obj, ctx))
        .toThrow(/Circular reference/)
    })

    it('should reject circular array reference', () => {
      const arr: unknown[] = [1, 2]
      arr.push(arr)
      expect(() => assertValidHostValue(arr, ctx))
        .toThrow(/Circular reference/)
    })
  })

  // ── Path tracking ─────────────────────────────────────────────────────

  describe('path tracking', () => {
    it('should include path for nested undefined', () => {
      expect(() => assertValidHostValue({ user: { name: undefined } }, ctx))
        .toThrow(/at \.user\.name/)
    })

    it('should include path for nested array element', () => {
      expect(() => assertValidHostValue({ tags: [1, undefined, 3] }, ctx))
        .toThrow(/at \.tags\[1\]/)
    })

    it('should include path for deeply nested function', () => {
      expect(() => assertValidHostValue({ a: { b: [{ c: () => 1 }] } }, ctx))
        .toThrow(/at \.a\.b\[0\]\.c/)
    })

    it('should not include path for top-level invalid value', () => {
      expect(() => assertValidHostValue(undefined, ctx))
        .toThrow('test: undefined is not a valid Dvala value. Use null instead.')
    })
  })

  // ── Context in messages ───────────────────────────────────────────────

  describe('context in error messages', () => {
    it('should include context string in error', () => {
      expect(() => assertValidHostValue(undefined, 'scope binding "x"'))
        .toThrow('scope binding "x": undefined is not a valid Dvala value.')
    })
  })
})

describe('validateFromJS', () => {
  it('should return converted value for valid input', () => {
    const result = validateFromJS({ a: [1, 2] }, 'test')
    expect(isPersistentMap(result)).toBe(true)
  })

  it('should throw for invalid input before conversion', () => {
    expect(() => validateFromJS({ a: undefined }, 'test'))
      .toThrow(TypeError)
  })
})
