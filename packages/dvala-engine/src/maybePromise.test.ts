import { describe, expect, it } from 'vitest'
import {
  chain,
  everySequential,
  filterSequential,
  findIndexSequential,
  forEachSequential,
  mapSequential,
  reduceSequential,
  someSequential,
  tryCatch,
} from './maybePromise'

describe('chain', () => {
  it('should handle sync value', () => {
    expect(chain(2, v => v * 3)).toBe(6)
  })

  it('should handle promise value', async () => {
    expect(await chain(Promise.resolve(2), v => v * 3)).toBe(6)
  })

  it('should handle sync value with async fn', async () => {
    expect(await chain(2, v => Promise.resolve(v * 3))).toBe(6)
  })
})

describe('mapSequential', () => {
  it('should handle sync callbacks', () => {
    expect(mapSequential([1, 2, 3], x => x * 2)).toEqual([2, 4, 6])
  })

  it('should handle async callback on first element', async () => {
    expect(await mapSequential([1, 2, 3], x => Promise.resolve(x * 2))).toEqual([2, 4, 6])
  })

  it('should handle async callback on middle element', async () => {
    const result = mapSequential([1, 2, 3], (x, i) => (i === 1 ? Promise.resolve(x * 2) : x * 2))
    expect(await result).toEqual([2, 4, 6])
  })

  it('should handle empty array', () => {
    expect(mapSequential([], x => x)).toEqual([])
  })
})

describe('reduceSequential', () => {
  it('should handle sync callbacks', () => {
    expect(reduceSequential([1, 2, 3], (acc, x) => acc + x, 0)).toBe(6)
  })

  it('should handle async callback on first element', async () => {
    expect(await reduceSequential([1, 2, 3], (acc, x) => Promise.resolve(acc + x), 0)).toBe(6)
  })

  it('should handle async callback on middle element', async () => {
    const result = reduceSequential([1, 2, 3], (acc, x, i) => (i === 1 ? Promise.resolve(acc + x) : acc + x), 0)
    expect(await result).toBe(6)
  })
})

describe('forEachSequential', () => {
  it('should handle sync callbacks', () => {
    const results: number[] = []
    void forEachSequential([1, 2, 3], x => {
      results.push(x)
    })
    expect(results).toEqual([1, 2, 3])
  })

  it('should handle async callback on first element', async () => {
    const results: number[] = []
    await forEachSequential([1, 2, 3], x => {
      results.push(x)
      return Promise.resolve()
    })
    expect(results).toEqual([1, 2, 3])
  })

  it('should handle async callback on middle element', async () => {
    const results: number[] = []
    await forEachSequential([1, 2, 3], (x, i) => {
      results.push(x)
      if (i === 1) return Promise.resolve()
      return undefined
    })
    expect(results).toEqual([1, 2, 3])
  })
})

describe('tryCatch', () => {
  it('should return sync value', () => {
    expect(
      tryCatch(
        () => 42,
        () => -1,
      ),
    ).toBe(42)
  })

  it('should catch sync error', () => {
    expect(
      tryCatch(
        () => {
          throw new Error('fail')
        },
        () => -1,
      ),
    ).toBe(-1)
  })

  it('should return async value', async () => {
    expect(
      await tryCatch(
        () => Promise.resolve(42),
        () => -1,
      ),
    ).toBe(42)
  })

  it('should catch async rejection', async () => {
    expect(
      await tryCatch(
        () => Promise.reject(new Error('fail')),
        () => -1,
      ),
    ).toBe(-1)
  })
})

describe('someSequential', () => {
  it('should return true for sync truthy', () => {
    expect(someSequential([0, 1, 2], x => x > 0)).toBe(true)
  })

  it('should return false for sync all falsy', () => {
    expect(someSequential([0, 0, 0], x => x > 0)).toBe(false)
  })

  it('should handle async callback on first element', async () => {
    expect(await someSequential([1, 2, 3], x => Promise.resolve(x > 2))).toBe(true)
  })

  it('should handle async callback returning false then true', async () => {
    expect(await someSequential([0, 0, 1], (x, i) => (i === 0 ? Promise.resolve(x > 0) : x > 0))).toBe(true)
  })

  it('should return false for async all falsy', async () => {
    expect(await someSequential([0, 0, 0], x => Promise.resolve(x > 0))).toBe(false)
  })

  it('should handle async on middle element with truthy result', async () => {
    expect(await someSequential([0, 1, 0], (x, i) => (i === 0 ? Promise.resolve(false) : x > 0))).toBe(true)
  })
})

describe('everySequential', () => {
  it('should return true for sync all truthy', () => {
    expect(everySequential([1, 2, 3], x => x > 0)).toBe(true)
  })

  it('should return false for sync falsy', () => {
    expect(everySequential([1, 0, 3], x => x > 0)).toBe(false)
  })

  it('should handle async callback all truthy', async () => {
    expect(await everySequential([1, 2, 3], x => Promise.resolve(x > 0))).toBe(true)
  })

  it('should handle async callback with falsy on first', async () => {
    expect(await everySequential([0, 1, 2], x => Promise.resolve(x > 0))).toBe(false)
  })

  it('should handle async on middle element with falsy result', async () => {
    expect(await everySequential([1, 0, 3], (x, i) => (i === 0 ? Promise.resolve(true) : x > 0))).toBe(false)
  })
})

describe('filterSequential', () => {
  it('should handle sync callbacks', () => {
    expect(filterSequential([1, 2, 3, 4], x => x % 2 === 0)).toEqual([2, 4])
  })

  it('should handle async callback on first element that passes', async () => {
    expect(await filterSequential([1, 2, 3], x => Promise.resolve(x > 1))).toEqual([2, 3])
  })

  it('should handle async callback on first element that fails', async () => {
    expect(await filterSequential([1, 2, 3], x => Promise.resolve(x > 2))).toEqual([3])
  })

  it('should handle async on middle element', async () => {
    expect(
      await filterSequential([1, 2, 3, 4], (x, i) => (i === 1 ? Promise.resolve(x % 2 === 0) : x % 2 === 0)),
    ).toEqual([2, 4])
  })
})

describe('findIndexSequential', () => {
  it('should find sync match', () => {
    expect(findIndexSequential([1, 2, 3], x => x === 2)).toBe(1)
  })

  it('should return -1 if no sync match', () => {
    expect(findIndexSequential([1, 2, 3], x => x === 5)).toBe(-1)
  })

  it('should handle async callback finding match on first', async () => {
    expect(await findIndexSequential([1, 2, 3], x => Promise.resolve(x === 1))).toBe(0)
  })

  it('should handle async callback finding match later', async () => {
    expect(await findIndexSequential([1, 2, 3], x => Promise.resolve(x === 3))).toBe(2)
  })

  it('should return -1 for async no match', async () => {
    expect(await findIndexSequential([1, 2, 3], x => Promise.resolve(x === 5))).toBe(-1)
  })

  it('should handle async on middle element', async () => {
    expect(await findIndexSequential([1, 2, 3], (x, i) => (i === 0 ? Promise.resolve(false) : x === 2))).toBe(1)
  })
})
