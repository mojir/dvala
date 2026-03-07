import { describe, expect, it } from 'vitest'
import { runSync } from '../src/effects'

describe('runSync with sync effect handlers', () => {
  describe('basic resume', () => {
    it('resumes with a value from a sync handler', () => {
      const result = runSync('perform(effect(my.ask))', {
        syncHandlers: {
          'my.ask': ({ resume }) => resume(42),
        },
      })
      expect(result).toBe(42)
    })

    it('handler receives effect args', () => {
      const result = runSync('perform(effect(my.add), 3, 4)', {
        syncHandlers: {
          'my.add': ({ args, resume }) => resume((args[0] as number) + ((args[1] ?? 0) as number)),
        },
      })
      expect(result).toBe(7)
    })

    it('handler receives effectName', () => {
      let capturedName: string | undefined
      runSync('perform(effect(my.effect))', {
        syncHandlers: {
          'my.effect': ({ effectName, resume }) => {
            capturedName = effectName
            resume(null)
          },
        },
      })
      expect(capturedName).toBe('my.effect')
    })

    it('resume value is used as result of perform expression', () => {
      const result = runSync(`
        let x = perform(effect(my.val));
        x * 2
      `, {
        syncHandlers: {
          'my.val': ({ resume }) => resume(10),
        },
      })
      expect(result).toBe(20)
    })

    it('works with multiple perform calls', () => {
      const result = runSync(`
        let a = perform(effect(my.val), 1);
        let b = perform(effect(my.val), 2);
        a + b
      `, {
        syncHandlers: {
          'my.val': ({ args, resume }) => resume(args[0] ?? null),
        },
      })
      expect(result).toBe(3)
    })
  })

  describe('fail', () => {
    it('fail() causes an error to be thrown', () => {
      expect(() =>
        runSync('perform(effect(my.bad))', {
          syncHandlers: {
            'my.bad': ({ fail }) => fail('something went wrong'),
          },
        }),
      ).toThrow('something went wrong')
    })

    it('fail() with no message throws a generic error', () => {
      expect(() =>
        runSync('perform(effect(my.bad))', {
          syncHandlers: {
            'my.bad': ({ fail }) => fail(),
          },
        }),
      ).toThrow()
    })
  })

  describe('next', () => {
    it('next() passes to the next matching handler', () => {
      const result = runSync('perform(effect(my.effect))', {
        syncHandlers: {
          'my.effect': ({ next }) => next(),
          'my.*': ({ resume }) => resume('fallback'),
        },
      })
      expect(result).toBe('fallback')
    })

    it('next() with no further handler throws unhandled effect', () => {
      expect(() =>
        runSync('perform(effect(my.effect))', {
          syncHandlers: {
            'my.effect': ({ next }) => next(),
          },
        }),
      ).toThrow()
    })
  })

  describe('pattern matching', () => {
    it('wildcard * matches any effect', () => {
      const result = runSync('perform(effect(any.effect))', {
        syncHandlers: {
          '*': ({ resume }) => resume('caught'),
        },
      })
      expect(result).toBe('caught')
    })

    it('node.* matches the node itself and descendants', () => {
      const results = [
        runSync('perform(effect(my))', {
          syncHandlers: { 'my.*': ({ resume }) => resume(1) },
        }),
        runSync('perform(effect(my.child))', {
          syncHandlers: { 'my.*': ({ resume }) => resume(2) },
        }),
        runSync('perform(effect(my.child.deep))', {
          syncHandlers: { 'my.*': ({ resume }) => resume(3) },
        }),
      ]
      expect(results).toEqual([1, 2, 3])
    })

    it('exact pattern does not match descendants', () => {
      expect(() =>
        runSync('perform(effect(my.child))', {
          syncHandlers: {
            my: ({ resume }) => resume(1),
          },
        }),
      ).toThrow()
    })
  })

  describe('side effects', () => {
    it('handler can produce side effects', () => {
      const log: string[] = []
      runSync('perform(effect(my.log), "hello")', {
        syncHandlers: {
          'my.log': ({ args, resume }) => {
            log.push(args[0] as string)
            resume(null)
          },
        },
      })
      expect(log).toEqual(['hello'])
    })
  })

  describe('error cases', () => {
    it('throws on unhandled effect', () => {
      expect(() =>
        runSync('perform(effect(my.unhandled))', { syncHandlers: {} }),
      ).toThrow()
    })

    it('runSync without syncHandlers still works (no change)', () => {
      expect(runSync('1 + 2')).toBe(3)
    })

    it('throws if handler calls resume twice', () => {
      expect(() =>
        runSync('perform(effect(my.effect))', {
          syncHandlers: {
            'my.effect': ({ resume }) => {
              resume(1)
              resume(2)
            },
          },
        }),
      ).toThrow()
    })
  })

  describe('local handlers take priority over sync host handlers', () => {
    it('local do...with handler wins over syncHandlers', () => {
      const result = runSync(`
        do
          perform(effect(my.effect), "local")
        with
          case effect(my.effect) then ([msg]) -> upper-case(msg)
        end
      `, {
        syncHandlers: {
          'my.effect': ({ resume }) => resume('host'),
        },
      })
      expect(result).toBe('LOCAL')
    })
  })
})
