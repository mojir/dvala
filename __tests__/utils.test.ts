import { describe, expect, it } from 'vitest'
import type { RegularExpression, SymbolNode } from '../src/parser/types'
import { collHasKey, deepEqual, smartTrim, toNonNegativeInteger } from '../src/utils'
import { REGEXP_SYMBOL } from '../src/utils/symbols'
import { valueToString } from '../src/utils/debug/debugTools'
import { NodeTypes } from '../src/constants/constants'
import { PersistentMap, PersistentVector } from '../src/utils/persistent'

describe('utils', () => {
  it('collHasKey', () => {
    expect(collHasKey(10, 1)).toBe(false)

    expect(collHasKey('Albert', 1)).toBe(true)
    expect(collHasKey('Albert', -1)).toBe(false)
    expect(collHasKey('Albert', 1.2)).toBe(false)
    expect(collHasKey('Albert', 6)).toBe(false)
    expect(collHasKey('', 0)).toBe(false)

    expect(collHasKey(PersistentVector.from([1, 2, 3]), 1)).toBe(true)
    expect(collHasKey(PersistentVector.from([1, 2, 3]), 6)).toBe(false)
    expect(collHasKey(PersistentVector.empty(), 0)).toBe(false)

    expect(collHasKey(PersistentMap.fromRecord({ a: 1, b: 2 }), 'a')).toBe(true)
    expect(collHasKey(PersistentMap.fromRecord({ a: 1, b: 2 }), 'b')).toBe(true)
    expect(collHasKey(PersistentMap.fromRecord({ a: 1, b: 2 }), 'c')).toBe(false)
    expect(collHasKey(PersistentMap.empty(), 0)).toBe(false)
    expect(collHasKey(PersistentMap.empty(), 'a')).toBe(false)
  })

  const primitives = [0, 1, true, false, null, 'Albert', 'Mojir']
  describe('deepEqual', () => {
    it('primitives', () => {
      for (const a of primitives) {
        for (const b of primitives)
          expect(deepEqual(a, b)).toBe(a === b)
      }
    })
    it('regExp', () => {
      const a: RegularExpression = {
        [REGEXP_SYMBOL]: true,
        s: '^ab',
        f: '',
      }
      const b: RegularExpression = {
        [REGEXP_SYMBOL]: true,
        s: '^ab',
        f: '',
      }
      const c: RegularExpression = {
        [REGEXP_SYMBOL]: true,
        s: '^ab',
        f: 'g',
      }
      const d: RegularExpression = {
        [REGEXP_SYMBOL]: true,
        s: '^ab',
        f: 'g',
      }
      expect(deepEqual(a, a)).toBe(true)
      expect(deepEqual(a, b)).toBe(true)
      expect(deepEqual(a, c)).toBe(false)
      expect(deepEqual(a, d)).toBe(false)
      expect(deepEqual(b, b)).toBe(true)
      expect(deepEqual(b, c)).toBe(false)
      expect(deepEqual(b, d)).toBe(false)
      expect(deepEqual(c, c)).toBe(true)
      expect(deepEqual(c, d)).toBe(true)
    })
    it('nested structures', () => {
      expect(deepEqual(PersistentVector.from([1, 2, 3]), PersistentVector.from([1, 2, 3]))).toBe(true)
      expect(deepEqual(PersistentMap.fromRecord({ a: 1, b: 2 }), PersistentMap.fromRecord({ a: 1, b: 2 }))).toBe(true)
      const nested1 = PersistentVector.from([1, 2, PersistentMap.fromRecord({ a: 1, b: 2 })])
      const nested2 = PersistentVector.from([1, 2, PersistentMap.fromRecord({ b: 2, a: 1 })])
      expect(deepEqual(nested1, nested2)).toBe(true)
    })
  })
  it('toNonNegativeInteger', () => {
    expect(toNonNegativeInteger(0)).toBe(0)
    expect(toNonNegativeInteger(-0.1)).toBe(0)
    expect(toNonNegativeInteger(-100)).toBe(0)
    expect(toNonNegativeInteger(0.01)).toBe(1)
    expect(toNonNegativeInteger(2.01)).toBe(3)
    expect(toNonNegativeInteger(4.0)).toBe(4)
  })

  describe('helpers', () => {
    const n: SymbolNode = [NodeTypes.Sym, 'Foo', 0]
    it('valueToString', () => {
      expect(valueToString(new Error('An error'))).toBe('Error: An error')
      expect(valueToString(n)).toBe('Sym-node')
    })
  })

  describe('smartTrim', () => {
    it('smartTrim', () => {
      // Removes leading and trailing empty lines and trims common indentation
      expect(
        smartTrim(`
      line1
        line2
      line3
    `),
      ).toBe(`
line1
  line2
line3`.trim())

      // Handles no indentation
      expect(
        smartTrim(`
line1
line2
line3
`),
      ).toBe('line1\nline2\nline3')

      // Handles only whitespace lines
      expect(
        smartTrim(`

      
    `),
      ).toBe('')

      // Handles single line
      expect(smartTrim('  single line  ')).toBe('single line')

      // Handles mixed indentation
      expect(
        smartTrim(`
        a
      b
        c
    `),
      ).toBe(`  a
b
  c`)

      // Handles no leading/trailing whitespace
      expect(smartTrim('foo\nbar')).toBe('foo\nbar')
    })
  })
})
