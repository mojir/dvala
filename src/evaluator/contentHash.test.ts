import { describe, expect, it } from 'vitest'
import { contentHash } from './contentHash'

describe('contentHash', () => {
  describe('primitives', () => {
    it('should hash null', () => {
      expect(typeof contentHash(null)).toBe('number')
    })

    it('should hash undefined', () => {
      expect(typeof contentHash(undefined)).toBe('number')
    })

    it('should hash booleans', () => {
      expect(contentHash(true)).not.toBe(contentHash(false))
    })

    it('should hash numbers', () => {
      expect(contentHash(42)).not.toBe(contentHash(43))
      expect(contentHash(0)).not.toBe(contentHash(-0))
      expect(contentHash(3.14)).toBe(contentHash(3.14))
    })

    it('should hash strings', () => {
      expect(contentHash('hello')).toBe(contentHash('hello'))
      expect(contentHash('hello')).not.toBe(contentHash('world'))
      expect(contentHash('')).toBe(contentHash(''))
    })

    it('should distinguish different primitive types', () => {
      // These are all conceptually "zero-ish" but must hash differently
      const hashes = new Set([
        contentHash(null),
        contentHash(undefined),
        contentHash(false),
        contentHash(0),
        contentHash(''),
        contentHash([]),
        contentHash({}),
      ])
      expect(hashes.size).toBe(7)
    })
  })

  describe('arrays', () => {
    it('should produce identical hashes for identical arrays', () => {
      expect(contentHash([1, 2, 3])).toBe(contentHash([1, 2, 3]))
    })

    it('should produce different hashes for different arrays', () => {
      expect(contentHash([1, 2, 3])).not.toBe(contentHash([1, 2, 4]))
      expect(contentHash([1, 2, 3])).not.toBe(contentHash([1, 2]))
      expect(contentHash([1, 2])).not.toBe(contentHash([2, 1]))
    })

    it('should handle nested arrays', () => {
      expect(contentHash([[1, 2], [3, 4]])).toBe(contentHash([[1, 2], [3, 4]]))
      expect(contentHash([[1, 2], [3, 4]])).not.toBe(contentHash([[1, 2], [3, 5]]))
    })

    it('should handle empty arrays', () => {
      expect(contentHash([])).toBe(contentHash([]))
    })
  })

  describe('objects', () => {
    it('should produce identical hashes for identical objects', () => {
      expect(contentHash({ a: 1, b: 2 })).toBe(contentHash({ a: 1, b: 2 }))
    })

    it('should produce different hashes for different objects', () => {
      expect(contentHash({ a: 1 })).not.toBe(contentHash({ a: 2 }))
      expect(contentHash({ a: 1 })).not.toBe(contentHash({ b: 1 }))
    })

    it('should not be affected by key order', () => {
      expect(contentHash({ a: 1, b: 2, c: 3 })).toBe(contentHash({ c: 3, a: 1, b: 2 }))
      expect(contentHash({ z: 'last', a: 'first' })).toBe(contentHash({ a: 'first', z: 'last' }))
    })

    it('should handle nested objects', () => {
      const obj1 = { a: { b: { c: 1 } } }
      const obj2 = { a: { b: { c: 1 } } }
      const obj3 = { a: { b: { c: 2 } } }
      expect(contentHash(obj1)).toBe(contentHash(obj2))
      expect(contentHash(obj1)).not.toBe(contentHash(obj3))
    })

    it('should handle empty objects', () => {
      expect(contentHash({})).toBe(contentHash({}))
    })
  })

  describe('mixed structures', () => {
    it('should handle objects containing arrays', () => {
      const val = { items: [1, 2, 3], name: 'test' }
      expect(contentHash(val)).toBe(contentHash({ items: [1, 2, 3], name: 'test' }))
    })

    it('should handle arrays containing objects', () => {
      const val = [{ a: 1 }, { b: 2 }]
      expect(contentHash(val)).toBe(contentHash([{ a: 1 }, { b: 2 }]))
    })

    it('should handle deeply nested mixed structures', () => {
      const deep = {
        level1: [
          { level2: [1, 'two', null, { level3: true }] },
        ],
      }
      const same = {
        level1: [
          { level2: [1, 'two', null, { level3: true }] },
        ],
      }
      const different = {
        level1: [
          { level2: [1, 'two', null, { level3: false }] },
        ],
      }
      expect(contentHash(deep)).toBe(contentHash(same))
      expect(contentHash(deep)).not.toBe(contentHash(different))
    })
  })

  describe('determinism', () => {
    it('should produce the same hash across multiple calls', () => {
      const value = { foo: [1, { bar: 'baz' }, null, true] }
      const hash1 = contentHash(value)
      const hash2 = contentHash(value)
      const hash3 = contentHash(value)
      expect(hash1).toBe(hash2)
      expect(hash2).toBe(hash3)
    })

    it('should return unsigned 32-bit integers', () => {
      const values = [null, true, 42, 'test', [1, 2], { a: 1 }, undefined]
      for (const v of values) {
        const h = contentHash(v)
        expect(h).toBeGreaterThanOrEqual(0)
        expect(h).toBeLessThanOrEqual(0xFFFFFFFF)
        expect(Number.isInteger(h)).toBe(true)
      }
    })
  })

  describe('performance', () => {
    it.skip('should hash a 50 KB object tree in < 5 ms', () => {
      // Build a ~50 KB object tree
      const items = Array.from({ length: 200 }, (_, i) => ({
        id: i,
        name: `item-${i}-${'x'.repeat(50)}`,
        tags: [`tag-${i}-a`, `tag-${i}-b`, `tag-${i}-c`],
        nested: { value: i * 3.14, flag: i % 2 === 0 },
      }))
      const tree = { version: 1, items }

      // Warm up
      contentHash(tree)

      const start = performance.now()
      const iterations = 10
      for (let i = 0; i < iterations; i++) {
        contentHash(tree)
      }
      const elapsed = (performance.now() - start) / iterations

      expect(elapsed).toBeLessThan(5)
    })
  })

  describe('collision resistance', () => {
    it('should produce distinct hashes for structurally similar values', () => {
      // Test cases that naive hashing might confuse
      const hashes = new Set([
        contentHash([1, [2, 3]]),
        contentHash([[1, 2], 3]),
        contentHash([[1], [2, 3]]),
        contentHash([1, 2, 3]),
        contentHash({ 0: 1, 1: 2, 2: 3 }),
        contentHash('123'),
        contentHash(123),
      ])
      expect(hashes.size).toBe(7)
    })
  })
})
