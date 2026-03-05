import { describe, expect, it } from 'vitest'
import { dedupSubTrees, expandPoolRefs, isPoolRef } from './dedupSubTrees'

describe('dedupSubTrees', () => {
  describe('no dedup', () => {
    it('should return unchanged roots when all sub-trees are unique', () => {
      const result = dedupSubTrees([{ a: 1 }, { b: 2 }], 0)
      expect(result.roots).toEqual([{ a: 1 }, { b: 2 }])
      expect(Object.keys(result.pool)).toHaveLength(0)
    })

    it('should return unchanged roots when inputs are primitives', () => {
      const result = dedupSubTrees([1, 'hello', null, true], 0)
      expect(result.roots).toEqual([1, 'hello', null, true])
      expect(Object.keys(result.pool)).toHaveLength(0)
    })

    it('should return empty pool for empty roots', () => {
      const result = dedupSubTrees([], 0)
      expect(result.roots).toEqual([])
      expect(Object.keys(result.pool)).toHaveLength(0)
    })
  })

  describe('basic dedup', () => {
    it('should dedup identical sub-trees across roots', () => {
      const shared = { x: 1, y: 2, z: 3, data: 'enough-data-to-pass-threshold' }
      const root1 = { a: shared }
      const root2 = { b: shared }
      const result = dedupSubTrees([root1, root2], 0)

      // The shared object should be in the pool
      expect(Object.keys(result.pool).length).toBeGreaterThan(0)

      // Each root should have a pool ref where the shared object was
      const ref1 = (result.roots[0] as Record<string, unknown>).a
      const ref2 = (result.roots[1] as Record<string, unknown>).b
      expect(isPoolRef(ref1)).toBe(true)
      expect(isPoolRef(ref2)).toBe(true)
      expect(ref1).toEqual(ref2)
    })

    it('should dedup identical sub-trees within a single root', () => {
      const shared = { data: 'shared-value-with-enough-length' }
      const root = { a: { ...shared }, b: { ...shared } }
      const result = dedupSubTrees([root], 0)

      expect(Object.keys(result.pool).length).toBeGreaterThan(0)
    })

    it('should dedup identical arrays', () => {
      const shared = [1, 2, 3, 'extra-data-for-size']
      const root1 = { items: [...shared] }
      const root2 = { items: [...shared] }
      const result = dedupSubTrees([root1, root2], 0)

      expect(Object.keys(result.pool).length).toBeGreaterThan(0)
    })
  })

  describe('threshold filtering', () => {
    it('should not pool sub-trees below threshold', () => {
      const root1 = { a: { x: 1 } }
      const root2 = { b: { x: 1 } }
      // { x: 1 } is about 6 bytes — set threshold high
      const result = dedupSubTrees([root1, root2], 1000)
      expect(Object.keys(result.pool)).toHaveLength(0)
    })

    it('should pool sub-trees at or above threshold', () => {
      const shared = { key: 'a-sufficiently-long-string-value-for-pooling' }
      const root1 = { a: { ...shared } }
      const root2 = { b: { ...shared } }
      const result = dedupSubTrees([root1, root2], 10)
      expect(Object.keys(result.pool).length).toBeGreaterThan(0)
    })
  })

  describe('__csRef markers', () => {
    it('should not corrupt __csRef markers', () => {
      const root1 = {
        contextStacks: [{ id: 0, contexts: [{ x: 1 }] }],
        frame: { cs: { __csRef: 0 }, data: 'some-long-data-for-size-check' },
      }
      const root2 = {
        contextStacks: [{ id: 0, contexts: [{ x: 1 }] }],
        frame: { cs: { __csRef: 0 }, data: 'some-long-data-for-size-check' },
      }
      const result = dedupSubTrees([root1, root2], 0)

      // Expand and verify __csRef is preserved
      const expanded1 = expandPoolRefs(result.roots[0], result.pool)
      const expanded2 = expandPoolRefs(result.roots[1], result.pool)
      expect(expanded1).toEqual(root1)
      expect(expanded2).toEqual(root2)
    })
  })

  describe('round-trip', () => {
    it('should restore original data after expand', () => {
      const shared = { name: 'widget', config: { width: 100, height: 200, label: 'test-label' } }
      const root1 = { a: { ...shared }, meta: 'root1' }
      const root2 = { b: { ...shared }, meta: 'root2' }
      const root3 = { c: { ...shared }, meta: 'root3' }

      const result = dedupSubTrees([root1, root2, root3], 0)

      const restored = result.roots.map(r => expandPoolRefs(r, result.pool))
      expect(restored[0]).toEqual(root1)
      expect(restored[1]).toEqual(root2)
      expect(restored[2]).toEqual(root3)
    })

    it('should handle undefined values in objects', () => {
      const shared = { val: undefined, data: 'long-enough-string-for-threshold' }
      const root1 = { a: { ...shared } }
      const root2 = { b: { ...shared } }
      const result = dedupSubTrees([root1, root2], 0)

      const restored = result.roots.map(r => expandPoolRefs(r, result.pool))
      expect(restored[0]).toEqual(root1)
      expect(restored[1]).toEqual(root2)
    })

    it('should handle deeply nested shared structures', () => {
      const innerShared = { deep: 'value-with-sufficient-length-for-pooling' }
      const outerShared = { inner: { ...innerShared }, extra: 'outer-data-to-make-it-big-enough' }
      const root1 = { a: { ...outerShared } }
      const root2 = { b: { ...outerShared } }
      const root3 = { c: { inner: { ...innerShared }, extra: 'different' } }

      const result = dedupSubTrees([root1, root2, root3], 0)

      const restored = result.roots.map(r => expandPoolRefs(r, result.pool))
      expect(restored[0]).toEqual(root1)
      expect(restored[1]).toEqual(root2)
      expect(restored[2]).toEqual(root3)
    })

    it('should not mutate original roots', () => {
      const shared = { key: 'a-long-enough-value-for-pooling-to-work' }
      const root1 = { a: { ...shared } }
      const root2 = { b: { ...shared } }
      const origRoot1 = JSON.parse(JSON.stringify(root1)) as typeof root1
      const origRoot2 = JSON.parse(JSON.stringify(root2)) as typeof root2

      dedupSubTrees([root1, root2], 0)

      expect(root1).toEqual(origRoot1)
      expect(root2).toEqual(origRoot2)
    })
  })
})

describe('expandPoolRefs', () => {
  it('should expand single-level refs', () => {
    const pool = { 0: { a: 1, b: 2 } }
    const value = { ref: { __poolRef: 0 } }
    const result = expandPoolRefs(value, pool)
    expect(result).toEqual({ ref: { a: 1, b: 2 } })
  })

  it('should expand nested refs', () => {
    const pool: Record<number, unknown> = {
      0: { inner: 'data' },
      1: { outer: { __poolRef: 0 } },
    }
    const value = { top: { __poolRef: 1 } }
    const result = expandPoolRefs(value, pool)
    expect(result).toEqual({ top: { outer: { inner: 'data' } } })
  })

  it('should throw on unknown pool ref', () => {
    const pool = {}
    const value = { ref: { __poolRef: 999 } }
    expect(() => expandPoolRefs(value, pool)).toThrow('Unknown pool ref: 999')
  })

  it('should return primitives unchanged', () => {
    expect(expandPoolRefs(42, {})).toBe(42)
    expect(expandPoolRefs('hello', {})).toBe('hello')
    expect(expandPoolRefs(null, {})).toBe(null)
    expect(expandPoolRefs(true, {})).toBe(true)
  })

  it('should return data with no refs unchanged structurally', () => {
    const value = { a: [1, 2, { b: 'c' }] }
    const result = expandPoolRefs(value, {})
    expect(result).toEqual(value)
  })

  it('should expand refs in arrays', () => {
    const pool = { 0: { x: 1 } }
    const value = [{ __poolRef: 0 }, 'other', { __poolRef: 0 }]
    const result = expandPoolRefs(value, pool)
    expect(result).toEqual([{ x: 1 }, 'other', { x: 1 }])
  })
})

describe('isPoolRef', () => {
  it('should identify valid pool refs', () => {
    expect(isPoolRef({ __poolRef: 0 })).toBe(true)
    expect(isPoolRef({ __poolRef: 42 })).toBe(true)
  })

  it('should reject non-pool-ref values', () => {
    expect(isPoolRef(null)).toBe(false)
    expect(isPoolRef(42)).toBe(false)
    expect(isPoolRef('not-a-ref')).toBe(false)
    expect(isPoolRef({ __poolRef: 'string' })).toBe(false)
    expect(isPoolRef({ __poolRef: 0, extra: 'key' })).toBe(false)
    expect(isPoolRef({})).toBe(false)
    expect(isPoolRef({ __csRef: 0 })).toBe(false)
  })
})
