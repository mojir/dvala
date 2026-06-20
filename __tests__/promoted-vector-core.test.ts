import { describe, expect, it } from 'vitest'
import { createDvala } from '@mojir/dvala-core-tooling'

// These builtins were promoted from the `vector` module into the core language
// and re-implemented in `.dvala` (math.dvala / sequence.dvala / predicates.dvala).
// Cover every branch: empty/non-empty, tie-breaking, ordering, and the
// `isVector` / non-empty input guards.
describe('promoted vector core builtins', () => {
  for (const dvala of [createDvala(), createDvala({ debug: true })]) {
    it('sum reduces, handles empty, and guards non-vectors', () => {
      expect(dvala.run('sum([1, 2, 3, 4, 5])')).toBe(15)
      expect(dvala.run('sum([1, -2, 3])')).toBe(2)
      expect(dvala.run('sum([])')).toBe(0)
      expect(() => dvala.run('sum([1, "a"])')).toThrow()
    })

    it('prod reduces, handles empty, and guards non-vectors', () => {
      expect(dvala.run('prod([1, 2, 3, 4, 5])')).toBe(120)
      expect(dvala.run('prod([1, -2, 3])')).toBe(-6)
      expect(dvala.run('prod([])')).toBe(1)
      expect(() => dvala.run('prod("nope")')).toThrow()
    })

    it('cumsum scans, handles empty, and guards non-vectors', () => {
      expect(dvala.run('cumsum([1, 2, 3, 4])')).toEqual([1, 3, 6, 10])
      expect(dvala.run('cumsum([1, -2, 3])')).toEqual([1, -1, 2])
      expect(dvala.run('cumsum([])')).toEqual([])
      expect(() => dvala.run('cumsum([1, "a"])')).toThrow()
    })

    it('cumprod scans, handles empty, and guards non-vectors', () => {
      expect(dvala.run('cumprod([1, 2, 3, 4])')).toEqual([1, 2, 6, 24])
      expect(dvala.run('cumprod([2, 0, 5])')).toEqual([2, 0, 0])
      expect(dvala.run('cumprod([])')).toEqual([])
      expect(() => dvala.run('cumprod("nope")')).toThrow()
    })

    it('minIndex returns earliest min and throws on empty/non-vector', () => {
      expect(dvala.run('minIndex([3, 1, 2])')).toBe(1)
      expect(dvala.run('minIndex([3, 1, 2, 1])')).toBe(1) // tie -> earliest
      expect(dvala.run('minIndex([5])')).toBe(0)
      expect(() => dvala.run('minIndex([])')).toThrow()
      expect(() => dvala.run('minIndex([1, "a"])')).toThrow()
    })

    it('maxIndex returns earliest max and throws on empty/non-vector', () => {
      expect(dvala.run('maxIndex([1, 3, 2])')).toBe(1)
      expect(dvala.run('maxIndex([1, 3, 2, 3])')).toBe(1) // tie -> earliest
      expect(dvala.run('maxIndex([5])')).toBe(0)
      expect(() => dvala.run('maxIndex([])')).toThrow()
      expect(() => dvala.run('maxIndex([1, "a"])')).toThrow()
    })

    it('sortIndices returns a stable argsort and handles empty/non-vector', () => {
      expect(dvala.run('sortIndices([30, 10, 20])')).toEqual([1, 2, 0])
      expect(dvala.run('sortIndices([30, 10, 20, 10])')).toEqual([1, 3, 2, 0]) // stable on ties
      expect(dvala.run('sortIndices([])')).toEqual([])
      expect(() => dvala.run('sortIndices([1, "a"])')).toThrow()
    })

    it('countValues tallies by count desc then value asc, handles empty/non-vector', () => {
      expect(dvala.run('countValues([3, 1, 3, 2, 1, 1])')).toEqual([
        [1, 3],
        [3, 2],
        [2, 1],
      ])
      // distinct values, all count 1 -> sorted by value ascending
      expect(dvala.run('countValues([3, 1, 2])')).toEqual([
        [1, 1],
        [2, 1],
        [3, 1],
      ])
      expect(dvala.run('countValues([])')).toEqual([])
      expect(() => dvala.run('countValues([1, "a"])')).toThrow()
    })

    it('isIncreasing / isDecreasing cover both arms, empties, and guards', () => {
      expect(dvala.run('isIncreasing([1, 2, 2, 3])')).toBe(true)
      expect(dvala.run('isIncreasing([1, 3, 2])')).toBe(false)
      expect(dvala.run('isIncreasing([])')).toBe(true)
      expect(dvala.run('isIncreasing([5])')).toBe(true)
      expect(dvala.run('isDecreasing([3, 2, 2, 1])')).toBe(true)
      expect(dvala.run('isDecreasing([3, 1, 2])')).toBe(false)
      expect(() => dvala.run('isIncreasing([1, "a"])')).toThrow()
      expect(() => dvala.run('isDecreasing([1, "a"])')).toThrow()
    })

    it('isStrictlyIncreasing / isStrictlyDecreasing cover both arms and guards', () => {
      expect(dvala.run('isStrictlyIncreasing([1, 2, 3])')).toBe(true)
      expect(dvala.run('isStrictlyIncreasing([1, 2, 2])')).toBe(false)
      expect(dvala.run('isStrictlyDecreasing([3, 2, 1])')).toBe(true)
      expect(dvala.run('isStrictlyDecreasing([2, 2, 1])')).toBe(false)
      expect(() => dvala.run('isStrictlyIncreasing([1, "a"])')).toThrow()
      expect(() => dvala.run('isStrictlyDecreasing([1, "a"])')).toThrow()
    })

    it('isMonotonic / isStrictlyMonotonic cover increasing, decreasing, and neither', () => {
      expect(dvala.run('isMonotonic([1, 2, 3])')).toBe(true) // increasing arm
      expect(dvala.run('isMonotonic([3, 2, 1])')).toBe(true) // decreasing arm
      expect(dvala.run('isMonotonic([1, 3, 2])')).toBe(false) // neither
      expect(dvala.run('isStrictlyMonotonic([1, 2, 3])')).toBe(true) // increasing arm
      expect(dvala.run('isStrictlyMonotonic([3, 2, 1])')).toBe(true) // decreasing arm
      expect(dvala.run('isStrictlyMonotonic([1, 2, 2])')).toBe(false) // neither (not strict)
    })
  }
})
