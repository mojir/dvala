/**
 * Tests for composable concurrent branches.
 *
 * Verifies that parallel/race/settled work with dynamically constructed
 * arrays of functions — the key benefit of the array-of-functions design.
 */

import { describe, expect, it } from 'vitest'
import { createDvala } from '../src/createDvala'

const dvala = createDvala()

// ---------------------------------------------------------------------------
// Dynamic branch construction
// ---------------------------------------------------------------------------

describe('dynamic branch arrays', () => {
  it('branches built with for comprehension', async () => {
    const result = await dvala.runAsync(
      `let tasks = for(x in [10, 20, 30]) -> (-> x * 2);
      parallel(tasks)`,
    )

    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      expect(result.value).toEqual([20, 40, 60])
    }
  })

  it('branches built with map', async () => {
    const result = await dvala.runAsync(
      `let values = [1, 2, 3];
      let tasks = map(values, (v) -> (-> v * 10));
      parallel(tasks)`,
    )

    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      expect(result.value).toEqual([10, 20, 30])
    }
  })

  it('branches filtered before execution', async () => {
    const result = await dvala.runAsync(
      `let tasks = [-> 1, -> 2, -> 3, -> 4];
      let firstTwo = take(tasks, 2);
      parallel(firstTwo)`,
    )

    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      expect(result.value).toEqual([1, 2])
    }
  })

  it('branches concatenated from multiple sources', async () => {
    const result = await dvala.runAsync(
      `let critical = [-> 1, -> 2];
      let optional = [-> 3];
      parallel(critical ++ optional)`,
    )

    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      expect(result.value).toEqual([1, 2, 3])
    }
  })

  it('branches sliced with take/drop', async () => {
    const result = await dvala.runAsync(
      `let allTasks = [-> 10, -> 20, -> 30, -> 40, -> 50];
      parallel(take(allTasks, 3))`,
    )

    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      expect(result.value).toEqual([10, 20, 30])
    }
  })
})

// ---------------------------------------------------------------------------
// Race with dynamic branches
// ---------------------------------------------------------------------------

describe('race with dynamic branches', () => {
  it('race with for-built branches', async () => {
    const result = await dvala.runAsync('race(for(x in [42, 99]) -> (-> x))')

    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      // First to complete wins — both are sync so either could win
      expect([42, 99]).toContain(result.value)
    }
  })
})

// ---------------------------------------------------------------------------
// Settled with dynamic branches
// ---------------------------------------------------------------------------

describe('settled with dynamic branches', () => {
  it('settled collects tagged results from for-built branches', async () => {
    const result = await dvala.runAsync('settled(for(x in [1, 2, 3]) -> (-> x * 10))')

    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      const values = result.value as unknown[]
      expect(values).toHaveLength(3)
      for (let i = 0; i < 3; i++) {
        expect((values[i] as unknown[])[0]).toEqual(expect.objectContaining({ name: 'ok' }))
        expect((values[i] as unknown[])[1]).toBe((i + 1) * 10)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe('validation', () => {
  it('parallel rejects non-array argument', async () => {
    const result = await dvala.runAsync('parallel(42)')
    expect(result.type).toBe('error')
  })

  it('parallel rejects array with non-function elements', async () => {
    const result = await dvala.runAsync('parallel([1, 2, 3])')
    expect(result.type).toBe('error')
  })

  it('parallel rejects empty array', async () => {
    const result = await dvala.runAsync('parallel([])')
    expect(result.type).toBe('error')
  })
})
