import { describe, expect, it } from 'vitest'
import { createDvala } from '../src/createDvala'
import type { RunResult } from '../src/evaluator/effectTypes'
import type { DvalaFunction } from '../src/parser/types'

function value(result: RunResult): unknown {
  if (result.type !== 'completed')
    throw new Error(`Expected completed, got ${result.type}`)
  return result.value
}

describe('async support', () => {
  describe('runAsync with sync functions', () => {
    const dvala = createDvala()

    it('should handle simple sync operations', async () => {
      expect(value(await dvala.runAsync('1 + 2'))).toBe(3)
    })

    it('should handle map with sync functions', async () => {
      expect(value(await dvala.runAsync('map([1, 2, 3], inc)'))).toEqual([2, 3, 4])
    })

    it('should handle filter with sync functions', async () => {
      expect(value(await dvala.runAsync('filter([1, 2, 3, 4, 5], odd?)'))).toEqual([1, 3, 5])
    })

    it('should handle reduce with sync functions', async () => {
      expect(value(await dvala.runAsync('reduce([1, 2, 3], +, 0)'))).toBe(6)
    })
  })

  describe('apply via bindings', () => {
    it('should apply a dvala function via bindings', async () => {
      const dvala = createDvala()
      const fn = dvala.run('-> $ + 1') as DvalaFunction
      expect(value(await dvala.runAsync('fn(9)', { bindings: { fn } }))).toBe(10)
    })
  })
})
