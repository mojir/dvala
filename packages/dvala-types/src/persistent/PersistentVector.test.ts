import { describe, expect, it } from 'vitest'
import { PersistentVector, TransientVector } from './PersistentVector'

// Trie structure constants — must stay in sync with PersistentVector.ts
const WIDTH = 32 // branching factor

// Boundary indices where the trie gains a new level:
//   Level 1 → 2: first full trie flush at size 32+1 = 33
//   Level 2 → 3: first slot 2 at size 2*1024+1 = 2049
const BOUNDARIES = [
  0,
  1,
  WIDTH - 1,
  WIDTH,
  WIDTH + 1,
  WIDTH * WIDTH - 1,
  WIDTH * WIDTH,
  WIDTH * WIDTH + 1,
  2 * WIDTH * WIDTH - 1,
  2 * WIDTH * WIDTH,
  2 * WIDTH * WIDTH + 1,
]

function makeRange(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i)
}

describe('PersistentVector', () => {
  // ---------------------------------------------------------------------------
  // Construction
  // ---------------------------------------------------------------------------

  describe('empty', () => {
    it('has size 0', () => {
      expect(PersistentVector.empty().size).toBe(0)
    })

    it('get returns undefined', () => {
      expect(PersistentVector.empty().get(0)).toBeUndefined()
    })

    it('iterates zero elements', () => {
      expect([...PersistentVector.empty()]).toEqual([])
    })

    it('empty() always returns the same singleton', () => {
      expect(PersistentVector.empty()).toBe(PersistentVector.empty())
    })
  })

  describe('from', () => {
    it('builds from an empty iterable', () => {
      expect(PersistentVector.from([]).size).toBe(0)
    })

    it('builds from a plain array', () => {
      const pv = PersistentVector.from([10, 20, 30])
      expect(pv.size).toBe(3)
      expect(pv.get(0)).toBe(10)
      expect(pv.get(1)).toBe(20)
      expect(pv.get(2)).toBe(30)
    })

    it('builds correctly at all trie boundaries', () => {
      for (const n of BOUNDARIES.filter(b => b > 0)) {
        const arr = makeRange(n)
        const pv = PersistentVector.from(arr)
        expect(pv.size).toBe(n)
        expect(pv.toArray()).toEqual(arr)
      }
    })

    it('round-trips a large array', () => {
      const arr = makeRange(3000)
      expect(PersistentVector.from(arr).toArray()).toEqual(arr)
    })
  })

  // ---------------------------------------------------------------------------
  // get
  // ---------------------------------------------------------------------------

  describe('get', () => {
    it('returns undefined for negative index', () => {
      expect(PersistentVector.from([1, 2, 3]).get(-1)).toBeUndefined()
    })

    it('returns undefined for index >= size', () => {
      const pv = PersistentVector.from([1, 2, 3])
      expect(pv.get(3)).toBeUndefined()
      expect(pv.get(100)).toBeUndefined()
    })

    it('returns correct values at all trie boundaries', () => {
      const n = 2 * WIDTH * WIDTH + 10
      const pv = PersistentVector.from(makeRange(n))
      for (const i of BOUNDARIES) {
        if (i < n) expect(pv.get(i)).toBe(i)
      }
    })

    // Regression: get() returned an internal INode at index 2048.
    // pushTailMut/pushTailPersistent used makeNode(newPathArr(...)) which
    // added one extra level of trie wrapping when creating a new subtree path.
    it('regression: returns a value (not a trie node) at index 2048', () => {
      const pv = PersistentVector.from(makeRange(3000))
      const val = pv.get(2048)
      expect(typeof val).toBe('number')
      expect(val).toBe(2048)
    })

    it('returns correct values for all indices in a 3000-element vector', () => {
      const pv = PersistentVector.from(makeRange(3000))
      for (let i = 0; i < 3000; i++) {
        expect(pv.get(i)).toBe(i)
      }
    })
  })

  // ---------------------------------------------------------------------------
  // size / length
  // ---------------------------------------------------------------------------

  describe('size and length', () => {
    it('size matches element count', () => {
      for (const n of [0, 1, WIDTH, WIDTH + 1, WIDTH * WIDTH, WIDTH * WIDTH + 1, 3000]) {
        expect(PersistentVector.from(makeRange(n)).size).toBe(n)
      }
    })

    it('length is an alias for size', () => {
      const pv = PersistentVector.from([1, 2, 3])
      expect(pv.length).toBe(pv.size)
    })
  })

  // ---------------------------------------------------------------------------
  // append
  // ---------------------------------------------------------------------------

  describe('append', () => {
    it('appends to an empty vector', () => {
      const pv = PersistentVector.empty<number>().append(42)
      expect(pv.size).toBe(1)
      expect(pv.get(0)).toBe(42)
    })

    it('does not mutate the original', () => {
      const pv = PersistentVector.from([1, 2, 3])
      const pv2 = pv.append(4)
      expect(pv.size).toBe(3)
      expect(pv.get(3)).toBeUndefined()
      expect(pv2.size).toBe(4)
      expect(pv2.get(3)).toBe(4)
    })

    it('appends correctly across every trie boundary', () => {
      let pv = PersistentVector.empty<number>()
      for (let i = 0; i < 2 * WIDTH * WIDTH + 10; i++) {
        pv = pv.append(i)
        expect(pv.size).toBe(i + 1)
        expect(pv.get(i)).toBe(i)
        // spot-check a few earlier indices remain correct
        if (i >= 1) expect(pv.get(i - 1)).toBe(i - 1)
        if (i >= WIDTH) expect(pv.get(i - WIDTH)).toBe(i - WIDTH)
      }
    })

    it('all previously appended values are still accessible', () => {
      let pv = PersistentVector.empty<number>()
      for (let i = 0; i < 3000; i++) pv = pv.append(i)
      expect(pv.toArray()).toEqual(makeRange(3000))
    })
  })

  // ---------------------------------------------------------------------------
  // set
  // ---------------------------------------------------------------------------

  describe('set', () => {
    it('returns this when index is out of range', () => {
      const pv = PersistentVector.from([1, 2, 3])
      expect(pv.set(-1, 0)).toBe(pv)
      expect(pv.set(3, 0)).toBe(pv)
    })

    it('does not mutate the original', () => {
      const pv = PersistentVector.from([1, 2, 3])
      const pv2 = pv.set(1, 99)
      expect(pv.get(1)).toBe(2)
      expect(pv2.get(1)).toBe(99)
    })

    it('sets at index 0', () => {
      const pv = PersistentVector.from([1, 2, 3]).set(0, 99)
      expect(pv.get(0)).toBe(99)
      expect(pv.get(1)).toBe(2)
    })

    it('sets at last index', () => {
      const pv = PersistentVector.from([1, 2, 3]).set(2, 99)
      expect(pv.get(2)).toBe(99)
      expect(pv.get(1)).toBe(2)
    })

    it('sets at every trie boundary index without disturbing neighbours', () => {
      const n = 2 * WIDTH * WIDTH + 10
      const base = PersistentVector.from(makeRange(n))
      for (const i of BOUNDARIES.filter(b => b < n)) {
        const updated = base.set(i, -1)
        expect(updated.get(i)).toBe(-1)
        if (i > 0) expect(updated.get(i - 1)).toBe(i - 1)
        if (i < n - 1) expect(updated.get(i + 1)).toBe(i + 1)
        // original unchanged
        expect(base.get(i)).toBe(i)
      }
    })

    it('size is unchanged after set', () => {
      const pv = PersistentVector.from([1, 2, 3])
      expect(pv.set(1, 99).size).toBe(3)
    })
  })

  // ---------------------------------------------------------------------------
  // prepend
  // ---------------------------------------------------------------------------

  describe('prepend', () => {
    it('prepends to an empty vector', () => {
      const pv = PersistentVector.empty<number>().prepend(1)
      expect(pv.size).toBe(1)
      expect(pv.get(0)).toBe(1)
    })

    it('shifts all existing elements right', () => {
      const pv = PersistentVector.from([2, 3, 4]).prepend(1)
      expect(pv.toArray()).toEqual([1, 2, 3, 4])
    })

    it('does not mutate the original', () => {
      const pv = PersistentVector.from([2, 3])
      const pv2 = pv.prepend(1)
      expect(pv.toArray()).toEqual([2, 3])
      expect(pv2.toArray()).toEqual([1, 2, 3])
    })
  })

  // ---------------------------------------------------------------------------
  // iteration
  // ---------------------------------------------------------------------------

  describe('iteration', () => {
    it('iterates empty vector', () => {
      expect([...PersistentVector.empty()]).toEqual([])
    })

    it('iterates small vector in insertion order', () => {
      expect([...PersistentVector.from([3, 1, 4])]).toEqual([3, 1, 4])
    })

    it('iterates all elements in order across trie boundaries', () => {
      const arr = makeRange(3000)
      expect([...PersistentVector.from(arr)]).toEqual(arr)
    })

    it('can iterate the same vector multiple times', () => {
      const pv = PersistentVector.from([1, 2, 3])
      expect([...pv]).toEqual([1, 2, 3])
      expect([...pv]).toEqual([1, 2, 3])
    })
  })

  // ---------------------------------------------------------------------------
  // toArray
  // ---------------------------------------------------------------------------

  describe('toArray', () => {
    it('returns empty array for empty vector', () => {
      expect(PersistentVector.empty().toArray()).toEqual([])
    })

    it('returns a copy (mutation does not affect the vector)', () => {
      const pv = PersistentVector.from([1, 2, 3])
      const arr = pv.toArray()
      arr[0] = 999
      expect(pv.get(0)).toBe(1)
    })
  })

  // ---------------------------------------------------------------------------
  // equals
  // ---------------------------------------------------------------------------

  describe('equals', () => {
    it('empty vectors are equal', () => {
      expect(PersistentVector.empty().equals(PersistentVector.empty())).toBe(true)
    })

    it('equal vectors', () => {
      const a = PersistentVector.from([1, 2, 3])
      const b = PersistentVector.from([1, 2, 3])
      expect(a.equals(b)).toBe(true)
    })

    it('different size vectors are not equal', () => {
      expect(PersistentVector.from([1, 2]).equals(PersistentVector.from([1, 2, 3]))).toBe(false)
    })

    it('different elements', () => {
      expect(PersistentVector.from([1, 2, 3]).equals(PersistentVector.from([1, 2, 4]))).toBe(false)
    })

    it('same reference is equal', () => {
      const pv = PersistentVector.from([1, 2, 3])
      expect(pv.equals(pv)).toBe(true)
    })

    it('uses custom equality function', () => {
      const a = PersistentVector.from([1.0, 2.0])
      const b = PersistentVector.from([1.1, 2.1])
      expect(a.equals(b, (x, y) => Math.abs(x - y) < 0.5)).toBe(true)
      expect(a.equals(b, (x, y) => Math.abs(x - y) < 0.05)).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // Transient (bulk construction)
  // ---------------------------------------------------------------------------

  describe('TransientVector', () => {
    it('builds an empty vector', () => {
      const t = new TransientVector(0, 5, [], [])
      expect(t.persistent().size).toBe(0)
    })

    it('appends elements and converts to persistent', () => {
      const t = new TransientVector<number>(0, 5, [], [])
      for (let i = 0; i < 100; i++) t.append(i)
      const pv = t.persistent()
      expect(pv.size).toBe(100)
      expect(pv.toArray()).toEqual(makeRange(100))
    })

    it('matches PersistentVector.from for large input', () => {
      const arr = makeRange(3000)
      const t = new TransientVector<number>(0, 5, [], [])
      for (const x of arr) t.append(x)
      expect(t.persistent().toArray()).toEqual(arr)
    })

    it('asTransient / persistent round-trip preserves all values', () => {
      const pv = PersistentVector.from(makeRange(3000))
      const t = pv.asTransient()
      t.append(3000)
      const pv2 = t.persistent()
      expect(pv2.size).toBe(3001)
      expect(pv2.get(3000)).toBe(3000)
      // original unchanged
      expect(pv.size).toBe(3000)
    })
  })

  // ---------------------------------------------------------------------------
  // Structural sharing
  // ---------------------------------------------------------------------------

  describe('structural sharing', () => {
    it('shared prefix: early elements are identical objects', () => {
      const pv1 = PersistentVector.from([{ id: 1 }, { id: 2 }])
      const pv2 = pv1.append({ id: 3 })
      // Shared nodes — same reference
      expect(pv1.get(0)).toBe(pv2.get(0))
      expect(pv1.get(1)).toBe(pv2.get(1))
    })

    it('set: only the updated path is new; rest is shared', () => {
      const obj = { id: 1 }
      const pv1 = PersistentVector.from([obj, obj, obj])
      const pv2 = pv1.set(1, { id: 99 })
      expect(pv2.get(0)).toBe(obj) // shared
      expect(pv2.get(1)).not.toBe(obj) // new
      expect(pv2.get(2)).toBe(obj) // shared
    })
  })
})
