import { describe, expect, it } from 'vitest'
import { PersistentVector } from './PersistentVector'

describe('PersistentVector', () => {
  describe('get', () => {
    it('returns undefined for empty vector', () => {
      expect(PersistentVector.empty().get(0)).toBeUndefined()
    })

    it('returns correct value for small vector', () => {
      const pv = PersistentVector.from([10, 20, 30])
      expect(pv.get(0)).toBe(10)
      expect(pv.get(1)).toBe(20)
      expect(pv.get(2)).toBe(30)
    })

    it('returns undefined out of range', () => {
      const pv = PersistentVector.from([1, 2, 3])
      expect(pv.get(-1)).toBeUndefined()
      expect(pv.get(3)).toBeUndefined()
    })

    // Regression: get() returned an internal INode object instead of the value
    // at index 2048 (the first element of the third top-level trie slot).
    // Root cause: pushTailMut/pushTailPersistent used makeNode(newPathArr(...))
    // which created one extra level of trie wrapping.
    it('returns correct values across trie depth boundaries', () => {
      const n = 3000
      const pv = PersistentVector.from(Array.from({ length: n }, (_, i) => i))
      for (let i = 0; i < n; i++) {
        expect(pv.get(i)).toBe(i)
      }
    })

    it('returns correct values at trie slot boundary (index 1024 and 2048)', () => {
      const pv = PersistentVector.from(Array.from({ length: 3000 }, (_, i) => i))
      expect(pv.get(1023)).toBe(1023)
      expect(pv.get(1024)).toBe(1024)
      expect(pv.get(2047)).toBe(2047)
      expect(pv.get(2048)).toBe(2048) // was returning {array:[2048..2079]} before fix
      expect(pv.get(2049)).toBe(2049)
    })
  })

  describe('iteration', () => {
    it('iterates all elements in order for large vector', () => {
      const n = 3000
      const pv = PersistentVector.from(Array.from({ length: n }, (_, i) => i))
      let i = 0
      for (const x of pv) {
        expect(x).toBe(i)
        i++
      }
      expect(i).toBe(n)
    })
  })

  describe('append', () => {
    it('appends correctly across trie depth boundaries', () => {
      let pv = PersistentVector.empty<number>()
      for (let i = 0; i < 3000; i++) {
        pv = pv.append(i)
        expect(pv.size).toBe(i + 1)
        expect(pv.get(i)).toBe(i)
      }
    })
  })

  describe('set', () => {
    it('sets values at all positions including across trie boundaries', () => {
      const n = 3000
      const pv = PersistentVector.from(Array.from({ length: n }, (_, i) => i))
      for (const i of [0, 31, 32, 1023, 1024, 2047, 2048, 2079, 2080, 2999]) {
        const updated = pv.set(i, -1)
        expect(updated.get(i)).toBe(-1)
        // surrounding elements unchanged
        if (i > 0) expect(updated.get(i - 1)).toBe(i - 1)
        if (i < n - 1) expect(updated.get(i + 1)).toBe(i + 1)
        // original unchanged
        expect(pv.get(i)).toBe(i)
      }
    })
  })

  describe('size', () => {
    it('tracks size correctly', () => {
      const pv = PersistentVector.from([1, 2, 3])
      expect(pv.size).toBe(3)
      expect(pv.append(4).size).toBe(4)
    })
  })

  describe('from / toArray round-trip', () => {
    it('round-trips a large array', () => {
      const arr = Array.from({ length: 3000 }, (_, i) => i)
      const pv = PersistentVector.from(arr)
      expect(pv.toArray()).toEqual(arr)
    })
  })

  describe('structural sharing', () => {
    it('append does not mutate original', () => {
      const pv = PersistentVector.from([1, 2, 3])
      const pv2 = pv.append(4)
      expect(pv.size).toBe(3)
      expect(pv2.size).toBe(4)
      expect(pv.get(3)).toBeUndefined()
    })

    it('set does not mutate original', () => {
      const pv = PersistentVector.from([1, 2, 3])
      const pv2 = pv.set(1, 99)
      expect(pv.get(1)).toBe(2)
      expect(pv2.get(1)).toBe(99)
    })
  })
})
