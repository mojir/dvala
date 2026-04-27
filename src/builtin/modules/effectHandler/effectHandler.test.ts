import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../createDvala'
import { handlerModule } from '.'

const dvala = createDvala({ modules: [handlerModule] })

describe('handler module', () => {
  describe('fallback', () => {
    it('should return fallback value on error', () => {
      expect(
        dvala.run(`
        let { fallback } = import("effectHandler");
        do with fallback(0); 0 / 0 end
      `),
      ).toBe(0)
    })

    it('should not affect successful expressions', () => {
      expect(
        dvala.run(`
        let { fallback } = import("effectHandler");
        do with fallback(0); 10 / 2 end
      `),
      ).toBe(5)
    })

    it('should work with string fallback', () => {
      expect(
        dvala.run(`
        let { fallback } = import("effectHandler");
        do with fallback("default"); 0 / 0 end
      `),
      ).toBe('default')
    })

    it('should work with null fallback', () => {
      expect(
        dvala.run(`
        let { fallback } = import("effectHandler");
        do with fallback(null); 0 / 0 end
      `),
      ).toBeNull()
    })

    it('should abort (not resume) on error', () => {
      expect(
        dvala.run(`
        let { fallback } = import("effectHandler");
        do
          with fallback(0);
          let x = 0 / 0;
          x + 1
        end
      `),
      ).toBe(0)
    })

    it('should work with h(-> body) callable form', () => {
      expect(
        dvala.run(`
        let { fallback } = import("effectHandler");
        fallback(42)(-> 0 / 0)
      `),
      ).toBe(42)
    })
  })

  describe('chooseAll', () => {
    it('collects all results for a single choice', () => {
      expect(
        dvala.run(`
        let { chooseAll } = import("effectHandler");
        chooseAll(-> perform(@choose, [1, 2, 3]) * 10)
      `),
      ).toEqual([10, 20, 30])
    })

    it('produces cartesian product for two choices', () => {
      const result = dvala.run(`
        let { chooseAll } = import("effectHandler");
        chooseAll(-> do
          let a = perform(@choose, [1, 2]);
          let b = perform(@choose, [10, 20]);
          [a, b]
        end)
      `) as number[][]
      expect(result.sort((x, y) => x[0]! - y[0]! || x[1]! - y[1]!)).toEqual([
        [1, 10],
        [1, 20],
        [2, 10],
        [2, 20],
      ])
    })

    it('returns singleton when no choices are performed', () => {
      expect(
        dvala.run(`
        let { chooseAll } = import("effectHandler");
        chooseAll(-> 42)
      `),
      ).toEqual([42])
    })
  })

  describe('chooseFirst', () => {
    it('picks the first option', () => {
      expect(
        dvala.run(`
        let { chooseFirst } = import("effectHandler");
        chooseFirst(-> perform(@choose, [1, 2, 3]) * 10)
      `),
      ).toBe(10)
    })

    it('works with a single option', () => {
      expect(
        dvala.run(`
        let { chooseFirst } = import("effectHandler");
        chooseFirst(-> perform(@choose, [99]))
      `),
      ).toBe(99)
    })
  })

  describe('chooseRandom', () => {
    it('returns one of the options', () => {
      const result = dvala.run(`
        let { chooseRandom } = import("effectHandler");
        chooseRandom(-> perform(@choose, [1, 2, 3]))
      `)
      expect([1, 2, 3]).toContain(result)
    })
  })

  describe('chooseTake', () => {
    it('takes first n results', () => {
      expect(
        dvala.run(`
        let { chooseTake } = import("effectHandler");
        chooseTake(2, -> perform(@choose, [1, 2, 3]) * 10)
      `),
      ).toEqual([10, 20])
    })

    it('returns all results when n >= total', () => {
      expect(
        dvala.run(`
        let { chooseTake } = import("effectHandler");
        chooseTake(10, -> perform(@choose, [1, 2, 3]) * 10)
      `),
      ).toEqual([10, 20, 30])
    })

    it('returns empty array when n=0', () => {
      expect(
        dvala.run(`
        let { chooseTake } = import("effectHandler");
        chooseTake(0, -> perform(@choose, [1, 2, 3]))
      `),
      ).toEqual([])
    })
  })

  describe('retry', () => {
    it('should propagate error after retries exhausted', () => {
      expect(
        dvala.run(`
        let { retry, fallback } = import("effectHandler");
        do
          with fallback("gave up");
          retry(2, -> 0 / 0)
        end
      `),
      ).toBe('gave up')
    })

    it('should return body result on success', () => {
      expect(
        dvala.run(`
        let { retry } = import("effectHandler");
        retry(3, -> 42)
      `),
      ).toBe(42)
    })

    it('should propagate error when n=0', () => {
      expect(
        dvala.run(`
        let { retry, fallback } = import("effectHandler");
        do
          with fallback("caught");
          retry(0, -> 0 / 0)
        end
      `),
      ).toBe('caught')
    })
  })
})
