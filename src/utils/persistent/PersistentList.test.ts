import { describe, expect, it } from 'vitest'
import { cons, isEmpty as isPersistentListEmpty, listFromArray, listToArray, type PersistentList } from './PersistentList'

describe('PersistentList', () => {
  // ---------------------------------------------------------------------------
  // isEmpty
  // ---------------------------------------------------------------------------

  describe('isEmpty', () => {
    it('null is empty', () => {
      expect(isPersistentListEmpty(null)).toBe(true)
    })

    it('cons cell is not empty', () => {
      expect(isPersistentListEmpty(cons(1, null))).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // cons
  // ---------------------------------------------------------------------------

  describe('cons', () => {
    it('prepends a value to null', () => {
      const list = cons(42, null)
      expect(list.head).toBe(42)
      expect(list.tail).toBeNull()
    })

    it('prepends a value to an existing list', () => {
      const list = cons(1, cons(2, cons(3, null)))
      expect(list.head).toBe(1)
      expect(list.tail!.head).toBe(2)
      expect(list.tail!.tail!.head).toBe(3)
      expect(list.tail!.tail!.tail).toBeNull()
    })

    it('does not mutate the existing list', () => {
      const tail = cons(2, null)
      const list = cons(1, tail)
      expect(tail.head).toBe(2)
      expect(tail.tail).toBeNull()
      expect(list.head).toBe(1)
    })

    it('supports structural sharing: same tail, two heads', () => {
      const shared = cons(3, null)
      const a = cons(1, shared)
      const b = cons(2, shared)
      // Both tails are the same object
      expect(a.tail).toBe(shared)
      expect(b.tail).toBe(shared)
      expect(a.head).toBe(1)
      expect(b.head).toBe(2)
    })
  })

  // ---------------------------------------------------------------------------
  // listToArray
  // ---------------------------------------------------------------------------

  describe('listToArray', () => {
    it('converts null to empty array', () => {
      expect(listToArray(null)).toEqual([])
    })

    it('converts a single-element list', () => {
      expect(listToArray(cons(42, null))).toEqual([42])
    })

    it('preserves order (head first)', () => {
      const list = cons(1, cons(2, cons(3, null)))
      expect(listToArray(list)).toEqual([1, 2, 3])
    })

    it('handles a large list', () => {
      let list: PersistentList<number> = null
      for (let i = 999; i >= 0; i--) list = cons(i, list)
      expect(listToArray(list)).toEqual(Array.from({ length: 1000 }, (_, i) => i))
    })
  })

  // ---------------------------------------------------------------------------
  // listFromArray
  // ---------------------------------------------------------------------------

  describe('listFromArray', () => {
    it('converts empty array to null', () => {
      expect(listFromArray([])).toBeNull()
    })

    it('head of result is first element of array', () => {
      const list = listFromArray([1, 2, 3])
      expect(list!.head).toBe(1)
    })

    it('round-trips through listToArray', () => {
      const arr = [1, 2, 3, 4, 5]
      expect(listToArray(listFromArray(arr))).toEqual(arr)
    })

    it('handles a large array', () => {
      const arr = Array.from({ length: 1000 }, (_, i) => i)
      expect(listToArray(listFromArray(arr))).toEqual(arr)
    })
  })

  // ---------------------------------------------------------------------------
  // Immutability / structural sharing
  // ---------------------------------------------------------------------------

  describe('immutability', () => {
    it('cons does not modify its tail argument', () => {
      const original = cons(2, cons(3, null))
      const extended = cons(1, original)
      // original is unchanged
      expect(original.head).toBe(2)
      expect(listToArray(original)).toEqual([2, 3])
      // extended contains the original as its tail
      expect(listToArray(extended)).toEqual([1, 2, 3])
    })

    it('two lists sharing a tail: modifying one does not affect the other', () => {
      const shared: PersistentList<number> = cons(3, cons(4, null))
      const list1 = cons(1, shared)
      const list2 = cons(2, shared)
      expect(listToArray(list1)).toEqual([1, 3, 4])
      expect(listToArray(list2)).toEqual([2, 3, 4])
      // shared is unchanged
      expect(listToArray(shared)).toEqual([3, 4])
    })

    it('list nodes are plain objects (not class instances) — safe to share across forks', () => {
      const node = cons(1, null)
      // Structural: only head and tail properties, no hidden mutable state
      expect(Object.keys(node).sort()).toEqual(['head', 'tail'])
    })
  })

  // ---------------------------------------------------------------------------
  // Use as a stack
  // ---------------------------------------------------------------------------

  describe('stack usage', () => {
    it('push and pop pattern', () => {
      let stack: PersistentList<number> = null
      // push 1, 2, 3
      stack = cons(3, stack)
      stack = cons(2, stack)
      stack = cons(1, stack)
      // pop: head is most recently pushed
      expect(stack!.head).toBe(1)
      stack = stack!.tail
      expect(stack!.head).toBe(2)
      stack = stack!.tail
      expect(stack!.head).toBe(3)
      stack = stack!.tail
      expect(stack).toBeNull()
    })

    it('forking: two stacks sharing state', () => {
      // Simulate multi-shot continuation: two resumptions from the same snapshot
      let base: PersistentList<string> = null
      base = cons('frame1', base)
      base = cons('frame2', base)

      // Fork: both paths extend the same base
      const pathA = cons('frameA', base)
      const pathB = cons('frameB', base)

      expect(listToArray(pathA)).toEqual(['frameA', 'frame2', 'frame1'])
      expect(listToArray(pathB)).toEqual(['frameB', 'frame2', 'frame1'])
      // base is unchanged
      expect(listToArray(base)).toEqual(['frame2', 'frame1'])
    })
  })
})
