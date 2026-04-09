import { describe, expect, it } from 'vitest'
import { createDvala } from '../src/createDvala'
import { hostHandler } from '../src/evaluator/effectTypes'

const dvala = createDvala({ disableAutoCheckpoint: true })

describe('host interaction effects', () => {
  // ── @dvala.host ───────────────────────────────────────────────────────

  describe('@dvala.host', () => {
    it('should resolve host binding via hostHandler utility', async () => {
      const result = await dvala.runAsync('perform(@dvala.host, "x")', {
        effectHandlers: [hostHandler({ x: 42 })],
      })
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toBe(42)
      }
    })

    it('should resolve multiple host bindings', async () => {
      const result = await dvala.runAsync(
        'perform(@dvala.host, "a") + perform(@dvala.host, "b")',
        { effectHandlers: [hostHandler({ a: 10, b: 32 })] },
      )
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toBe(42)
      }
    })

    it('should resolve string host bindings', async () => {
      const result = await dvala.runAsync('perform(@dvala.host, "name")', {
        effectHandlers: [hostHandler({ name: 'dvala' })],
      })
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toBe('dvala')
      }
    })

    it('should resolve null host binding', async () => {
      const result = await dvala.runAsync('perform(@dvala.host, "x")', {
        effectHandlers: [hostHandler({ x: null })],
      })
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toBe(null)
      }
    })

    it('should error when host binding is not provided via hostHandler', async () => {
      const result = await dvala.runAsync('perform(@dvala.host, "missing")', {
        effectHandlers: [hostHandler({ x: 42 })],
      })
      expect(result.type).toBe('error')
    })

    it('should throw descriptive error when no @dvala.host handler is installed', async () => {
      const result = await dvala.runAsync('perform(@dvala.host, "x")', {
        effectHandlers: [],
      })
      expect(result.type).toBe('error')
      if (result.type === 'error') {
        expect(result.error.message).toContain('Host binding "x" not provided')
      }
    })

    it('should work with custom host handler function', async () => {
      const result = await dvala.runAsync('perform(@dvala.host, "config")', {
        effectHandlers: [{
          pattern: 'dvala.host',
          handler: ({ arg, resume }) => {
            if (arg === 'config') resume({ debug: true })
          },
        }],
      })
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        const val = result.value as Record<string, unknown>
        expect(val.debug).toBe(true)
      }
    })

    it('should work with let binding pattern', async () => {
      const result = await dvala.runAsync(
        'let x = perform(@dvala.host, "x"); x * 2',
        { effectHandlers: [hostHandler({ x: 21 })] },
      )
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toBe(42)
      }
    })

    it('should work with sync run via hostHandler', () => {
      const result = dvala.run('perform(@dvala.host, "x")', {
        effectHandlers: [hostHandler({ x: 99 })],
      })
      expect(result).toBe(99)
    })
  })

  // ── @dvala.env ────────────────────────────────────────────────────────

  describe('@dvala.env', () => {
    it('should read an environment variable', async () => {
      // HOME is almost universally set
      const result = await dvala.runAsync('perform(@dvala.env, "HOME")')
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(typeof result.value === 'string' || result.value === null).toBe(true)
      }
    })

    it('should return null for unset variable', async () => {
      const result = await dvala.runAsync('perform(@dvala.env, "DVALA_NONEXISTENT_TEST_VAR_999")')
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toBe(null)
      }
    })

    it('should work with nullish coalescing for defaults', async () => {
      const result = await dvala.runAsync('perform(@dvala.env, "DVALA_NONEXISTENT_TEST_VAR_999") ?? "default"')
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toBe('default')
      }
    })

    it('should work with sync run', () => {
      const result = dvala.run('perform(@dvala.env, "DVALA_NONEXISTENT_TEST_VAR_999") ?? "fallback"')
      expect(result).toBe('fallback')
    })

    it('should allow host to override with custom handler', async () => {
      const result = await dvala.runAsync('perform(@dvala.env, "SECRET")', {
        effectHandlers: [{
          pattern: 'dvala.env',
          handler: ({ arg, resume }) => {
            if (arg === 'SECRET') resume('hidden')
            else resume(null)
          },
        }],
      })
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toBe('hidden')
      }
    })
  })

  // ── @dvala.args ───────────────────────────────────────────────────────

  describe('@dvala.args', () => {
    it('should return an array', async () => {
      const result = await dvala.runAsync('perform(@dvala.args)')
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        // Result is converted to plain JS array by toJS in runAsync
        expect(Array.isArray(result.value)).toBe(true)
      }
    })

    it('should work with sync run', () => {
      const result = dvala.run('count(perform(@dvala.args))')
      expect(typeof result).toBe('number')
    })

    it('should allow host to override with custom handler', async () => {
      const result = await dvala.runAsync('perform(@dvala.args)', {
        effectHandlers: [{
          pattern: 'dvala.args',
          handler: ({ resume }) => {
            resume(['file.txt', '--verbose'])
          },
        }],
      })
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        const args = result.value as string[]
        expect(args).toEqual(['file.txt', '--verbose'])
      }
    })

    it('should allow destructuring args', async () => {
      const result = await dvala.runAsync(
        'let [first, ...rest] = perform(@dvala.args); { first, rest }',
        {
          effectHandlers: [{
            pattern: 'dvala.args',
            handler: ({ resume }) => resume(['a', 'b', 'c']),
          }],
        },
      )
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        const val = result.value as Record<string, unknown>
        expect(val.first).toBe('a')
        expect(val.rest).toEqual(['b', 'c'])
      }
    })
  })

  // ── hostHandler utility ───────────────────────────────────────────────

  describe('hostHandler utility', () => {
    it('should create a HandlerRegistration with dvala.host pattern', () => {
      const reg = hostHandler({ x: 1 })
      expect(reg.pattern).toBe('dvala.host')
      expect(typeof reg.handler).toBe('function')
    })

    it('should handle array values', async () => {
      const result = await dvala.runAsync('perform(@dvala.host, "items")', {
        effectHandlers: [hostHandler({ items: [1, 2, 3] })],
      })
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toEqual([1, 2, 3])
      }
    })

    it('should handle object values', async () => {
      const result = await dvala.runAsync('let o = perform(@dvala.host, "config"); o.debug', {
        effectHandlers: [hostHandler({ config: { debug: true, level: 3 } })],
      })
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toBe(true)
      }
    })
  })
})
