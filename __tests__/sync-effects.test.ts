import { describe, expect, it } from 'vitest'
import { createDvala } from '../src/createDvala'

const dvala = createDvala()

describe('runSync with sync effect handlers', () => {
  describe('basic resume', () => {
    it('resumes with a value from a sync handler', () => {
      const result = dvala.run('perform(@my.ask)', {
        effectHandlers: [
          { pattern: 'my.ask', handler: ({ resume }) => resume(42) },
        ],
      })
      expect(result).toBe(42)
    })

    it('handler receives effect arg', () => {
      const result = dvala.run('perform(@my.add, [3, 4])', {
        effectHandlers: [
          { pattern: 'my.add', handler: ({ arg, resume }) => { const [a, b] = arg as number[]; resume(a! + b!) } },
        ],
      })
      expect(result).toBe(7)
    })

    it('handler receives effectName', () => {
      let capturedName: string | undefined
      dvala.run('perform(@my.effect)', {
        effectHandlers: [
          { pattern: 'my.effect', handler: ({ effectName, resume }) => {
            capturedName = effectName
            resume(null)
          } },
        ],
      })
      expect(capturedName).toBe('my.effect')
    })

    it('resume value is used as result of perform expression', () => {
      const result = dvala.run(`
        let x = perform(@my.val);
        x * 2
      `, {
        effectHandlers: [
          { pattern: 'my.val', handler: ({ resume }) => resume(10) },
        ],
      })
      expect(result).toBe(20)
    })

    it('works with multiple perform calls', () => {
      const result = dvala.run(`
        let a = perform(@my.val, 1);
        let b = perform(@my.val, 2);
        a + b
      `, {
        effectHandlers: [
          { pattern: 'my.val', handler: ({ arg, resume }) => resume(arg ?? null) },
        ],
      })
      expect(result).toBe(3)
    })
  })

  describe('fail', () => {
    it('fail() causes an error to be thrown', () => {
      expect(() =>
        dvala.run('perform(@my.bad)', {
          effectHandlers: [
            { pattern: 'my.bad', handler: ({ fail }) => fail('something went wrong') },
          ],
        }),
      ).toThrow('something went wrong')
    })

    it('fail() with no message throws a generic error', () => {
      expect(() =>
        dvala.run('perform(@my.bad)', {
          effectHandlers: [
            { pattern: 'my.bad', handler: ({ fail }) => fail() },
          ],
        }),
      ).toThrow()
    })
  })

  describe('next', () => {
    it('next() passes to the next matching handler', () => {
      const result = dvala.run('perform(@my.effect)', {
        effectHandlers: [
          { pattern: 'my.effect', handler: ({ next }) => next() },

          { pattern: 'my.*', handler: ({ resume }) => resume('fallback') },
        ],
      })
      expect(result).toBe('fallback')
    })

    it('next() with no further handler throws unhandled effect', () => {
      expect(() =>
        dvala.run('perform(@my.effect)', {
          effectHandlers: [
            { pattern: 'my.effect', handler: ({ next }) => next() },
          ],
        }),
      ).toThrow()
    })
  })

  describe('pattern matching', () => {
    it('wildcard * matches any effect', () => {
      const result = dvala.run('perform(@any.effect)', {
        effectHandlers: [
          { pattern: '*', handler: ({ resume }) => resume('caught') },
        ],
      })
      expect(result).toBe('caught')
    })

    it('node.* matches the node itself and descendants', () => {
      const results = [
        dvala.run('perform(@my)', {
          effectHandlers: [
            { pattern: 'my.*', handler: ({ resume }) => resume(1) },
          ],
        }),
        dvala.run('perform(@my.child)', {
          effectHandlers: [
            { pattern: 'my.*', handler: ({ resume }) => resume(2) },
          ],
        }),
        dvala.run('perform(@my.child.deep)', {
          effectHandlers: [
            { pattern: 'my.*', handler: ({ resume }) => resume(3) },
          ],
        }),
      ]
      expect(results).toEqual([1, 2, 3])
    })

    it('exact pattern does not match descendants', () => {
      expect(() =>
        dvala.run('perform(@my.child)', {
          effectHandlers: [
            { pattern: 'my', handler: ({ resume }) => resume(1) },
          ],
        }),
      ).toThrow()
    })
  })

  describe('side effects', () => {
    it('handler can produce side effects', () => {
      const log: string[] = []
      dvala.run('perform(@my.log, "hello")', {
        effectHandlers: [
          { pattern: 'my.log', handler: ({ arg, resume }) => {
            log.push(arg as string)
            resume(null)
          } },
        ],
      })
      expect(log).toEqual(['hello'])
    })
  })

  describe('error cases', () => {
    it('throws on unhandled effect', () => {
      expect(() =>
        dvala.run('perform(@my.unhandled)', { effectHandlers: [] }),
      ).toThrow()
    })

    it('runSync without effectHandlers still works (no change)', () => {
      expect(dvala.run('1 + 2')).toBe(3)
    })

    it('throws if handler calls resume twice', () => {
      expect(() =>
        dvala.run('perform(@my.effect)', {
          effectHandlers: [
            { pattern: 'my.effect', handler: ({ resume }) => {
              resume(1)
              resume(2)
            } },
          ],
        }),
      ).toThrow()
    })
  })

  describe('local handlers take priority over sync host handlers', () => {
    it('local handle...with handler wins over effectHandlers', () => {
      const result = dvala.run(`
        handle
          perform(@my.effect, "local")
        with [(arg, eff, nxt) -> if eff == @my.effect then upperCase(arg) else nxt(eff, arg) end]
        end
      `, {
        effectHandlers: [
          { pattern: 'my.effect', handler: ({ resume }) => resume('host') },
        ],
      })
      expect(result).toBe('LOCAL')
    })
  })
})
