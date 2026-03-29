import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../createDvala'
import { handlerModule } from '.'

const dvala = createDvala({ modules: [handlerModule] })

describe('handler module', () => {
  describe('fallback', () => {
    it('should return fallback value on error', () => {
      expect(dvala.run(`
        let { fallback } = import(effectHandler);
        do with fallback(0); 0 / 0 end
      `)).toBe(0)
    })

    it('should not affect successful expressions', () => {
      expect(dvala.run(`
        let { fallback } = import(effectHandler);
        do with fallback(0); 10 / 2 end
      `)).toBe(5)
    })

    it('should work with string fallback', () => {
      expect(dvala.run(`
        let { fallback } = import(effectHandler);
        do with fallback("default"); 0 / 0 end
      `)).toBe('default')
    })

    it('should work with null fallback', () => {
      expect(dvala.run(`
        let { fallback } = import(effectHandler);
        do with fallback(null); 0 / 0 end
      `)).toBeNull()
    })

    it('should abort (not resume) on error', () => {
      expect(dvala.run(`
        let { fallback } = import(effectHandler);
        do
          with fallback(0);
          let x = 0 / 0;
          x + 1
        end
      `)).toBe(0)
    })

    it('should work with h(-> body) callable form', () => {
      expect(dvala.run(`
        let { fallback } = import(effectHandler);
        fallback(42)(-> 0 / 0)
      `)).toBe(42)
    })
  })

  describe('retry', () => {
    it('should propagate error after retries exhausted', () => {
      expect(dvala.run(`
        let { retry, fallback } = import(effectHandler);
        do
          with fallback("gave up");
          retry(2, -> 0 / 0)
        end
      `)).toBe('gave up')
    })

    it('should return body result on success', () => {
      expect(dvala.run(`
        let { retry } = import(effectHandler);
        retry(3, -> 42)
      `)).toBe(42)
    })

    it('should propagate error when n=0', () => {
      expect(dvala.run(`
        let { retry, fallback } = import(effectHandler);
        do
          with fallback("caught");
          retry(0, -> 0 / 0)
        end
      `)).toBe('caught')
    })
  })
})
