import { describe, expect, it } from 'vitest'
import { Dvala } from '../src/Dvala/Dvala'
import type { DvalaFunction } from '../src/parser/types'

describe('async support', () => {
  describe('async.run with sync functions', () => {
    const dvala = new Dvala()

    it('should handle simple sync operations', async () => {
      expect(await dvala.async.run('1 + 2')).toBe(3)
    })

    it('should handle map with sync functions', async () => {
      expect(await dvala.async.run('map([1, 2, 3], inc)')).toEqual([2, 3, 4])
    })

    it('should handle filter with sync functions', async () => {
      expect(await dvala.async.run('filter([1, 2, 3, 4, 5], odd?)')).toEqual([1, 3, 5])
    })

    it('should handle reduce with sync functions', async () => {
      expect(await dvala.async.run('reduce([1, 2, 3], +, 0)')).toBe(6)
    })
  })

  describe('async.apply', () => {
    it('should apply a dvala function with async.apply', async () => {
      const dvala = new Dvala()
      const fn = dvala.run('-> $ + 1') as DvalaFunction
      const result = await dvala.async.apply(fn, [9])
      expect(result).toBe(10)
    })
  })
})
