import { describe, expect, it } from 'vitest'
import { createDvala } from '../src/createDvala'

describe('pure mode', () => {
  describe('core builtins', () => {
    it('should allow pure functions in pure mode', () => {
      const dvala = createDvala()
      expect(dvala.run('1 + 2', { pure: true })).toBe(3)
    })

    it('should allow all core builtins in pure mode (none are impure)', () => {
      const dvala = createDvala()
      expect(dvala.run('map([1, 2, 3], -> $ * 2)', { pure: true })).toEqual([2, 4, 6])
      expect(dvala.run('str("hello", " ", "world")', { pure: true })).toBe('hello world')
    })
  })

  describe('effects', () => {
    it('should throw when performing effects in pure mode (sync)', () => {
      const dvala = createDvala()
      expect(() => dvala.run('perform(@dvala.sleep, 1000)', { pure: true })).toThrow(
        "Cannot perform effect 'dvala.sleep' in pure mode",
      )
    })

    it('should throw when performing effects in pure mode (async)', async () => {
      const dvala = createDvala()
      const result = await dvala.runAsync('perform(@dvala.sleep, 1000)', { pure: true })
      expect(result.type).toBe('error')
      if (result.type === 'error') {
        expect(result.error.message).toContain("Cannot perform effect 'dvala.sleep' in pure mode")
      }
    })
  })

  describe('async', () => {
    it('should allow pure code in async pure mode', async () => {
      const dvala = createDvala()
      await expect(dvala.runAsync('1 + 2', { pure: true })).resolves.toMatchObject({ type: 'completed', value: 3 })
    })
  })
})
