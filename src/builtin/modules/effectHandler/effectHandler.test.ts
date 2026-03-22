import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../createDvala'
import { handlerModule } from '.'

const dvala = createDvala({ modules: [handlerModule] })

describe('handler module', () => {
  describe('fallback', () => {
    it('should return fallback value on error', () => {
      expect(dvala.run(`
        let { fallback } = import(effectHandler);
        (0 / 0) ||> fallback(0)
      `)).toBe(0)
    })

    it('should not affect successful expressions', () => {
      expect(dvala.run(`
        let { fallback } = import(effectHandler);
        (10 / 2) ||> fallback(0)
      `)).toBe(5)
    })

    it('should work with string fallback', () => {
      expect(dvala.run(`
        let { fallback } = import(effectHandler);
        (0 / 0) ||> fallback("default")
      `)).toBe('default')
    })

    it('should work with null fallback', () => {
      expect(dvala.run(`
        let { fallback } = import(effectHandler);
        (0 / 0) ||> fallback(null)
      `)).toBeNull()
    })

    it('should resume continuation with fallback value', () => {
      expect(dvala.run(`
        let { fallback } = import(effectHandler);
        handle
          let x = 0 / 0;
          x + 1
        with fallback(0)
        end
      `)).toBe(1)
    })
  })

  describe('retry', () => {
    it('should propagate error after retries exhausted', () => {
      expect(dvala.run(`
        let { retry, fallback } = import(effectHandler);
        perform(@my.eff, "data")
          ||> [retry(2), @my.eff(x) -> perform(@dvala.error, "fail")]
          ||> fallback("gave up")
      `)).toBe('gave up')
    })

    it('should pass through successful effects', () => {
      expect(dvala.run(`
        let { retry } = import(effectHandler);
        perform(@my.eff, 21)
          ||> [retry(3), @my.eff(x) -> x * 2]
      `)).toBe(42)
    })

    it('should pass @dvala.error through unchanged', () => {
      expect(dvala.run(`
        let { retry, fallback } = import(effectHandler);
        (0 / 0) ||> [retry(3), fallback(99)]
      `)).toBe(99)
    })

    it('should work with fallback in same handler chain', () => {
      expect(dvala.run(`
        let { retry, fallback } = import(effectHandler);
        perform(@my.eff, "x")
          ||> [retry(1), @my.eff(x) -> perform(@dvala.error, "boom"), fallback("safe")]
      `)).toBe('safe')
    })

    it('should resume continuation on success', () => {
      expect(dvala.run(`
        let { retry } = import(effectHandler);
        handle
          let x = perform(@my.eff, 10);
          x + 1
        with [retry(3), @my.eff(x) -> x * 2]
        end
      `)).toBe(21)
    })
  })
})
