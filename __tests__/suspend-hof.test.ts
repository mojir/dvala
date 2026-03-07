import { describe, expect, it } from 'vitest'
import { resume as resumeContinuation } from '../src/resume'
import { createDvala } from '../src/createDvala'

const dvala = createDvala()

describe('suspend through migrated HOFs', () => {
  it('should suspend in simple perform (baseline)', async () => {
    const result = await dvala.runAsync(`
      perform(effect(my.get), 42)
    `, {
      effectHandlers: {
        'my.get': async ({ args, suspend }) => {
          suspend({ value: args[0] })
        },
      },
    })
    expect(result.type).toBe('suspended')
  })

  it('should suspend inside a direct for loop', async () => {
    const result = await dvala.runAsync(`
      for (x in [10]) -> perform(effect(my.get), x)
    `, {
      effectHandlers: {
        'my.get': async ({ args, suspend }) => {
          suspend({ requested: args[0] })
        },
      },
    })
    expect(result.type).toBe('suspended')
    if (result.type === 'suspended') {
      expect(result.snapshot.meta).toEqual({ requested: 10 })
    }
  })

  it('should resume a for loop across multiple elements', async () => {
    const result = await dvala.runAsync(`
      for (x in [1, 2]) -> perform(effect(my.test), x)
    `, {
      effectHandlers: {
        'my.test': async ({ args, suspend }) => {
          suspend({ value: args[0] })
        },
      },
    })
    if (result.type === 'error')
      throw result.error
    expect(result.type).toBe('suspended')
    if (result.type === 'suspended') {
      expect(result.snapshot.meta).toEqual({ value: 1 })
      const result2 = await resumeContinuation(result.snapshot, 10, {
        handlers: {
          'my.test': async ({ args, suspend }) => {
            suspend({ value: args[0] })
          },
        },
      })
      if (result2.type === 'error')
        throw result2.error
      expect(result2.type).toBe('suspended')
      if (result2.type === 'suspended') {
        expect(result2.snapshot.meta).toEqual({ value: 2 })
        const result3 = await resumeContinuation(result2.snapshot, 20, { handlers: {} })
        if (result3.type === 'error')
          throw result3.error
        expect(result3.type).toBe('completed')
        if (result3.type === 'completed') {
          expect(result3.value).toEqual([10, 20])
        }
      }
    }
  })

  it('should suspend inside a user-defined function calling perform', async () => {
    const result = await dvala.runAsync(`
      ((x) -> perform(effect(my.get), x))(42)
    `, {
      effectHandlers: {
        'my.get': async ({ args, suspend }) => {
          suspend({ requested: args[0] })
        },
      },
    })
    if (result.type === 'error') {
      throw result.error
    }
    expect(result.type).toBe('suspended')
  })

  it('should suspend inside for loop calling user function', async () => {
    const result = await dvala.runAsync(`
      for (x in [10]) -> ((y) -> perform(effect(my.get), y))(x)
    `, {
      effectHandlers: {
        'my.get': async ({ args, suspend }) => {
          suspend({ requested: args[0] })
        },
      },
    })
    if (result.type === 'error') {
      throw result.error
    }
    expect(result.type).toBe('suspended')
  })

  it('should run map through effects API without perform', async () => {
    const result = await dvala.runAsync('map([1, 2, 3], -> $ * $)')
    if (result.type === 'error') {
      throw result.error
    }
    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      expect(result.value).toEqual([1, 4, 9])
    }
  })

  it('should suspend inside map callback', async () => {
    // Minimal 2-element test to isolate resume issue
    const result = await dvala.runAsync(`
      map([1, 2], (x) -> perform(effect(my.approve), x))
    `, {
      effectHandlers: {
        'my.approve': async ({ args, suspend }) => {
          suspend({ value: args[0] })
        },
      },
    })
    if (result.type === 'error') {
      throw result.error
    }
    expect(result.type).toBe('suspended')
    if (result.type === 'suspended') {
      expect(result.snapshot.meta).toEqual({ value: 1 })

      const result2 = await resumeContinuation(result.snapshot, 10, {
        handlers: {
          'my.approve': async ({ args, suspend }) => {
            suspend({ value: args[0] })
          },
        },
      })
      if (result2.type === 'error') {
        throw result2.error
      }
      expect(result2.type).toBe('suspended')
      if (result2.type === 'suspended') {
        expect(result2.snapshot.meta).toEqual({ value: 2 })

        const result3 = await resumeContinuation(result2.snapshot, 20, {
          handlers: {},
        })
        if (result3.type === 'error') {
          throw result3.error
        }
        expect(result3.type).toBe('completed')
        if (result3.type === 'completed') {
          expect(result3.value).toEqual([10, 20])
        }
      }
    }
  })

  it('should suspend inside reduce callback and resume', async () => {
    const result = await dvala.runAsync(`
      reduce([1, 2, 3], (acc, x) -> acc + perform(effect(my.transform), x), 0)
    `, {
      effectHandlers: {
        'my.transform': async ({ args, suspend }) => {
          suspend({ transforming: args[0] })
        },
      },
    })
    if (result.type === 'error') {
      throw result.error
    }
    expect(result.type).toBe('suspended')
    if (result.type === 'suspended') {
      expect(result.snapshot.meta).toEqual({ transforming: 1 })
      const result2 = await resumeContinuation(result.snapshot, 10, {
        handlers: {
          'my.transform': async ({ args, suspend }) => {
            suspend({ transforming: args[0] })
          },
        },
      })
      expect(result2.type).toBe('suspended')
      if (result2.type === 'suspended') {
        expect(result2.snapshot.meta).toEqual({ transforming: 2 })
        const result3 = await resumeContinuation(result2.snapshot, 20, {
          handlers: {
            'my.transform': async ({ args, suspend }) => {
              suspend({ transforming: args[0] })
            },
          },
        })
        expect(result3.type).toBe('suspended')
        if (result3.type === 'suspended') {
          expect(result3.snapshot.meta).toEqual({ transforming: 3 })
          const result4 = await resumeContinuation(result3.snapshot, 30, {
            handlers: {},
          })
          expect(result4.type).toBe('completed')
          if (result4.type === 'completed') {
            expect(result4.value).toBe(60) // 0 + 10 + 20 + 30
          }
        }
      }
    }
  })

  it('should suspend inside filter callback and resume', async () => {
    const result = await dvala.runAsync(`
      filter([1, 2, 3, 4], (x) -> perform(effect(my.check), x))
    `, {
      effectHandlers: {
        'my.check': async ({ args, suspend }) => {
          suspend({ checking: args[0] })
        },
      },
    })
    expect(result.type).toBe('suspended')
    if (result.type === 'suspended') {
      expect(result.snapshot.meta).toEqual({ checking: 1 })
      const result2 = await resumeContinuation(result.snapshot, true, {
        handlers: {
          'my.check': async ({ args, suspend }) => {
            suspend({ checking: args[0] })
          },
        },
      })
      expect(result2.type).toBe('suspended')
      if (result2.type === 'suspended') {
        expect(result2.snapshot.meta).toEqual({ checking: 2 })
        const result3 = await resumeContinuation(result2.snapshot, false, {
          handlers: {
            'my.check': async ({ args, suspend }) => {
              suspend({ checking: args[0] })
            },
          },
        })
        expect(result3.type).toBe('suspended')
        if (result3.type === 'suspended') {
          expect(result3.snapshot.meta).toEqual({ checking: 3 })
          const result4 = await resumeContinuation(result3.snapshot, true, {
            handlers: {
              'my.check': async ({ args, suspend }) => {
                suspend({ checking: args[0] })
              },
            },
          })
          expect(result4.type).toBe('suspended')
          if (result4.type === 'suspended') {
            expect(result4.snapshot.meta).toEqual({ checking: 4 })
            const result5 = await resumeContinuation(result4.snapshot, false, {
              handlers: {},
            })
            expect(result5.type).toBe('completed')
            if (result5.type === 'completed') {
              expect(result5.value).toEqual([1, 3])
            }
          }
        }
      }
    }
  })
})
