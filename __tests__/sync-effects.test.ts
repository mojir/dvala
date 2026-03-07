import { describe, expect, it } from 'vitest'
import { createDvala } from '../src/createDvala'

const dvala = createDvala()

describe('runSync with sync effect handlers', () => {
  describe('basic resume', () => {
    it('resumes with a value from a sync handler', () => {
      const result = dvala.run('perform(effect(my.ask))', {
        effectHandlers: {
          'my.ask': ({ resume }) => resume(42),
        },
      })
      expect(result).toBe(42)
    })

    it('handler receives effect args', () => {
      const result = dvala.run('perform(effect(my.add), 3, 4)', {
        effectHandlers: {
          'my.add': ({ args, resume }) => resume((args[0] as number) + ((args[1] ?? 0) as number)),
        },
      })
      expect(result).toBe(7)
    })

    it('handler receives effectName', () => {
      let capturedName: string | undefined
      dvala.run('perform(effect(my.effect))', {
        effectHandlers: {
          'my.effect': ({ effectName, resume }) => {
            capturedName = effectName
            resume(null)
          },
        },
      })
      expect(capturedName).toBe('my.effect')
    })

    it('resume value is used as result of perform expression', () => {
      const result = dvala.run(`
        let x = perform(effect(my.val));
        x * 2
      `, {
        effectHandlers: {
          'my.val': ({ resume }) => resume(10),
        },
      })
      expect(result).toBe(20)
    })

    it('works with multiple perform calls', () => {
      const result = dvala.run(`
        let a = perform(effect(my.val), 1);
        let b = perform(effect(my.val), 2);
        a + b
      `, {
        effectHandlers: {
          'my.val': ({ args, resume }) => resume(args[0] ?? null),
        },
      })
      expect(result).toBe(3)
    })
  })

  describe('fail', () => {
    it('fail() causes an error to be thrown', () => {
      expect(() =>
        dvala.run('perform(effect(my.bad))', {
          effectHandlers: {
            'my.bad': ({ fail }) => fail('something went wrong'),
          },
        }),
      ).toThrow('something went wrong')
    })

    it('fail() with no message throws a generic error', () => {
      expect(() =>
        dvala.run('perform(effect(my.bad))', {
          effectHandlers: {
            'my.bad': ({ fail }) => fail(),
          },
        }),
      ).toThrow()
    })
  })

  describe('next', () => {
    it('next() passes to the next matching handler', () => {
      const result = dvala.run('perform(effect(my.effect))', {
        effectHandlers: {
          'my.effect': ({ next }) => next(),
          'my.*': ({ resume }) => resume('fallback'),
        },
      })
      expect(result).toBe('fallback')
    })

    it('next() with no further handler throws unhandled effect', () => {
      expect(() =>
        dvala.run('perform(effect(my.effect))', {
          effectHandlers: {
            'my.effect': ({ next }) => next(),
          },
        }),
      ).toThrow()
    })
  })

  describe('pattern matching', () => {
    it('wildcard * matches any effect', () => {
      const result = dvala.run('perform(effect(any.effect))', {
        effectHandlers: {
          '*': ({ resume }) => resume('caught'),
        },
      })
      expect(result).toBe('caught')
    })

    it('node.* matches the node itself and descendants', () => {
      const results = [
        dvala.run('perform(effect(my))', {
          effectHandlers: { 'my.*': ({ resume }) => resume(1) },
        }),
        dvala.run('perform(effect(my.child))', {
          effectHandlers: { 'my.*': ({ resume }) => resume(2) },
        }),
        dvala.run('perform(effect(my.child.deep))', {
          effectHandlers: { 'my.*': ({ resume }) => resume(3) },
        }),
      ]
      expect(results).toEqual([1, 2, 3])
    })

    it('exact pattern does not match descendants', () => {
      expect(() =>
        dvala.run('perform(effect(my.child))', {
          effectHandlers: {
            my: ({ resume }) => resume(1),
          },
        }),
      ).toThrow()
    })
  })

  describe('side effects', () => {
    it('handler can produce side effects', () => {
      const log: string[] = []
      dvala.run('perform(effect(my.log), "hello")', {
        effectHandlers: {
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
        dvala.run('perform(effect(my.unhandled))', { effectHandlers: {} }),
      ).toThrow()
    })

    it('runSync without effectHandlers still works (no change)', () => {
      expect(dvala.run('1 + 2')).toBe(3)
    })

    it('throws if handler calls resume twice', () => {
      expect(() =>
        dvala.run('perform(effect(my.effect))', {
          effectHandlers: {
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
    it('local do...with handler wins over effectHandlers', () => {
      const result = dvala.run(`
        do
          perform(effect(my.effect), "local")
        with
          case effect(my.effect) then ([msg]) -> upper-case(msg)
        end
      `, {
        effectHandlers: {
          'my.effect': ({ resume }) => resume('host'),
        },
      })
      expect(result).toBe('LOCAL')
    })
  })
})
