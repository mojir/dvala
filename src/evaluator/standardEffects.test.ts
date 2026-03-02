import { describe, expect, it } from 'vitest'
import { getStandardEffectHandler, standardEffectNames } from './standardEffects'
import type { ContinuationStack } from './frames'

// A minimal continuation stack for testing — standard effects don't inspect frames
const emptyK: ContinuationStack = []

describe('standardEffects', () => {
  describe('standardEffectNames', () => {
    it('should contain the 4 standard effects', () => {
      expect(standardEffectNames).toEqual(new Set([
        'dvala.log',
        'dvala.now',
        'dvala.random',
        'dvala.sleep',
      ]))
    })
  })

  describe('getStandardEffectHandler', () => {
    it('should return a handler for known effects', () => {
      expect(getStandardEffectHandler('dvala.log')).toBeTypeOf('function')
      expect(getStandardEffectHandler('dvala.now')).toBeTypeOf('function')
      expect(getStandardEffectHandler('dvala.random')).toBeTypeOf('function')
      expect(getStandardEffectHandler('dvala.sleep')).toBeTypeOf('function')
    })

    it('should return undefined for unknown effects', () => {
      expect(getStandardEffectHandler('llm.complete')).toBeUndefined()
      expect(getStandardEffectHandler('dvala.unknown')).toBeUndefined()
      expect(getStandardEffectHandler('')).toBeUndefined()
    })
  })

  describe('dvala.log handler', () => {
    it('should return a ValueStep with null', () => {
      const handler = getStandardEffectHandler('dvala.log')!
      const result = handler(['hello', 42], emptyK)
      expect(result).toEqual({ type: 'Value', value: null, k: emptyK })
    })
  })

  describe('dvala.now handler', () => {
    it('should return a ValueStep with a number', () => {
      const handler = getStandardEffectHandler('dvala.now')!
      const before = Date.now()
      const result = handler([], emptyK) as { type: string, value: number, k: unknown }
      const after = Date.now()
      expect(result.type).toBe('Value')
      expect(result.value).toBeGreaterThanOrEqual(before)
      expect(result.value).toBeLessThanOrEqual(after)
    })
  })

  describe('dvala.random handler', () => {
    it('should return a ValueStep with a number in [0, 1)', () => {
      const handler = getStandardEffectHandler('dvala.random')!
      const result = handler([], emptyK) as { type: string, value: number, k: unknown }
      expect(result.type).toBe('Value')
      expect(result.value).toBeGreaterThanOrEqual(0)
      expect(result.value).toBeLessThan(1)
    })
  })

  describe('dvala.sleep handler', () => {
    it('should return a Promise that resolves with a ValueStep', async () => {
      const handler = getStandardEffectHandler('dvala.sleep')!
      const result = handler([10], emptyK)
      expect(result).toBeInstanceOf(Promise)
      const step = await result
      expect(step).toEqual({ type: 'Value', value: null, k: emptyK })
    })

    it('should throw on negative ms', () => {
      const handler = getStandardEffectHandler('dvala.sleep')!
      expect(() => handler([-1], emptyK)).toThrow('non-negative number')
    })

    it('should throw on non-number argument', () => {
      const handler = getStandardEffectHandler('dvala.sleep')!
      expect(() => handler(['fast'], emptyK)).toThrow('non-negative number')
    })
  })
})
