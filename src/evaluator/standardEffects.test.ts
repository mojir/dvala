import { describe, expect, it, vi } from 'vitest'
import type { Any } from '../interface'
import { fromJS } from '../utils/interop'
import { PersistentVector } from '../utils/persistent'
import { EFFECT_SYMBOL, FUNCTION_SYMBOL, REGEXP_SYMBOL } from '../utils/symbols'
import { getStandardEffectHandler, standardEffectNames } from './standardEffects'
import type { ContinuationStack } from './frames'

// Cast a plain JS value to Any for passing to handlers that inspect it at runtime
function asAny(value: unknown): Any {
  return value as unknown as Any
}

// Convert a plain JS value to the Dvala persistent representation (PV/PM) for handlers
function fromJsAny(value: unknown): Any {
  return fromJS(value)
}

// A minimal continuation stack for testing — standard effects don't inspect frames
const emptyK: ContinuationStack = null

describe('standardEffects', () => {
  describe('standardEffectNames', () => {
    it('should contain all standard effects', () => {
      expect(standardEffectNames).toEqual(new Set([
        'dvala.io.print',
        'dvala.io.error',
        'dvala.io.read',
        'dvala.io.pick',
        'dvala.io.confirm',
        'dvala.io.readStdin',
        'dvala.random',
        'dvala.random.uuid',
        'dvala.random.int',
        'dvala.random.item',
        'dvala.random.shuffle',
        'dvala.time.now',
        'dvala.time.zone',
        'dvala.sleep',
        'dvala.checkpoint',
      ]))
    })
  })

  describe('getStandardEffectHandler', () => {
    it('should return a handler for known effects', () => {
      expect(getStandardEffectHandler('dvala.io.print')).toBeTypeOf('function')
      expect(getStandardEffectHandler('dvala.io.error')).toBeTypeOf('function')
      expect(getStandardEffectHandler('dvala.io.read')).toBeTypeOf('function')
      expect(getStandardEffectHandler('dvala.io.pick')).toBeTypeOf('function')
      expect(getStandardEffectHandler('dvala.io.confirm')).toBeTypeOf('function')
      expect(getStandardEffectHandler('dvala.io.readStdin')).toBeTypeOf('function')
      expect(getStandardEffectHandler('dvala.random')).toBeTypeOf('function')
      expect(getStandardEffectHandler('dvala.random.uuid')).toBeTypeOf('function')
      expect(getStandardEffectHandler('dvala.random.int')).toBeTypeOf('function')
      expect(getStandardEffectHandler('dvala.random.item')).toBeTypeOf('function')
      expect(getStandardEffectHandler('dvala.random.shuffle')).toBeTypeOf('function')
      expect(getStandardEffectHandler('dvala.time.now')).toBeTypeOf('function')
      expect(getStandardEffectHandler('dvala.time.zone')).toBeTypeOf('function')
      expect(getStandardEffectHandler('dvala.sleep')).toBeTypeOf('function')
    })

    it('should return undefined for unknown effects', () => {
      expect(getStandardEffectHandler('llm.complete')).toBeUndefined()
      expect(getStandardEffectHandler('dvala.unknown')).toBeUndefined()
      expect(getStandardEffectHandler('')).toBeUndefined()
    })
  })

  // ── I/O effects ──────────────────────────────────────────────────────────

  describe('dvala.io.print handler', () => {
    it('should write to stdout without newline and return the string', () => {
      const handler = getStandardEffectHandler('dvala.io.print')!
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
      try {
        const result = handler('hello', emptyK)
        expect(result).toEqual({ type: 'Value', value: 'hello', k: emptyK })
        expect(spy).toHaveBeenCalledWith('hello')
      } finally {
        spy.mockRestore()
      }
    })

    it('should format and write a number', () => {
      const handler = getStandardEffectHandler('dvala.io.print')!
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
      try {
        const result = handler(42, emptyK)
        expect(result).toEqual({ type: 'Value', value: 42, k: emptyK })
        expect(spy).toHaveBeenCalledWith('42')
      } finally {
        spy.mockRestore()
      }
    })

    it('should format and write an object', () => {
      const handler = getStandardEffectHandler('dvala.io.print')!
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
      try {
        const obj = { a: 1 }
        const result = handler(asAny(obj), emptyK)
        expect(result).toEqual({ type: 'Value', value: obj, k: emptyK })
        expect(spy).toHaveBeenCalledWith('{\n  "a": 1\n}')
      } finally {
        spy.mockRestore()
      }
    })

    it('should return original value unchanged (identity)', () => {
      const handler = getStandardEffectHandler('dvala.io.print')!
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
      try {
        const arr = [1, 2, 3]
        const result = handler(asAny(arr), emptyK) as { type: string; value: unknown; k: unknown }
        expect(result.value).toBe(arr) // same reference
      } finally {
        spy.mockRestore()
      }
    })

    it('should use console.log in non-Node environments', () => {
      const handler = getStandardEffectHandler('dvala.io.print')!
      const originalWrite = process.stdout.write.bind(process.stdout)
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      Object.defineProperty(process.stdout, 'write', { value: undefined, configurable: true, writable: true })
      try {
        const result = handler('hello', emptyK)
        expect(result).toEqual({ type: 'Value', value: 'hello', k: emptyK })
        expect(consoleSpy).toHaveBeenCalledWith('hello')
      } finally {
        Object.defineProperty(process.stdout, 'write', { value: originalWrite, configurable: true, writable: true })
        consoleSpy.mockRestore()
      }
    })
  })

  describe('dvala.io.error handler', () => {
    it('should write to stderr with newline and return the string', () => {
      const handler = getStandardEffectHandler('dvala.io.error')!
      const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
      try {
        const result = handler('oops', emptyK)
        expect(result).toEqual({ type: 'Value', value: 'oops', k: emptyK })
        expect(spy).toHaveBeenCalledWith('oops\n')
      } finally {
        spy.mockRestore()
      }
    })

    it('should format and write a number to stderr', () => {
      const handler = getStandardEffectHandler('dvala.io.error')!
      const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
      try {
        const result = handler(42, emptyK)
        expect(result).toEqual({ type: 'Value', value: 42, k: emptyK })
        expect(spy).toHaveBeenCalledWith('42\n')
      } finally {
        spy.mockRestore()
      }
    })

    it('should use console.error in non-Node environments', () => {
      const handler = getStandardEffectHandler('dvala.io.error')!
      const originalWrite = process.stdout.write.bind(process.stdout)
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      // Make isNode() return false by removing process.stdout.write
      Object.defineProperty(process.stdout, 'write', { value: undefined, configurable: true, writable: true })
      try {
        const result = handler('browser-error', emptyK)
        expect(result).toEqual({ type: 'Value', value: 'browser-error', k: emptyK })
        expect(consoleSpy).toHaveBeenCalledWith('browser-error')
      } finally {
        Object.defineProperty(process.stdout, 'write', { value: originalWrite, configurable: true, writable: true })
        consoleSpy.mockRestore()
      }
    })
  })

  describe('dvala.io.read handler', () => {
    it('should use globalThis.prompt when available and return user input', () => {
      const handler = getStandardEffectHandler('dvala.io.read')!
      const originalPrompt = globalThis.prompt
      try {
        globalThis.prompt = vi.fn(() => 'user input')
        const result = handler('Enter name:', emptyK) as { type: string; value: unknown; k: unknown }
        expect(result.type).toBe('Value')
        expect(result.value).toBe('user input')
        expect(globalThis.prompt).toHaveBeenCalledWith('Enter name:')
      } finally {
        globalThis.prompt = originalPrompt
      }
    })

    it('should return null when prompt is cancelled', () => {
      const handler = getStandardEffectHandler('dvala.io.read')!
      const originalPrompt = globalThis.prompt
      try {
        globalThis.prompt = vi.fn(() => null)
        const result = handler('Enter name:', emptyK) as { type: string; value: unknown; k: unknown }
        expect(result.type).toBe('Value')
        expect(result.value).toBeNull()
      } finally {
        globalThis.prompt = originalPrompt
      }
    })

    it('should use empty string as message when arg is not a string', () => {
      const handler = getStandardEffectHandler('dvala.io.read')!
      const originalPrompt = globalThis.prompt
      try {
        globalThis.prompt = vi.fn(() => 'ok')
        void handler(42, emptyK)
        expect(globalThis.prompt).toHaveBeenCalledWith('')
      } finally {
        globalThis.prompt = originalPrompt
      }
    })

    it('should throw when prompt is not available (Node.js environment)', () => {
      const handler = getStandardEffectHandler('dvala.io.read')!
      const originalPrompt = globalThis.prompt
      try {
        // @ts-expect-error -- simulating Node.js environment without prompt
        globalThis.prompt = undefined
        expect(() => handler('msg', emptyK)).toThrow('not supported in this environment')
      } finally {
        globalThis.prompt = originalPrompt
      }
    })
  })

  describe('dvala.io.pick handler', () => {
    const items = ['Apple', 'Banana', 'Cherry']

    it('should return selected index via globalThis.prompt', () => {
      const handler = getStandardEffectHandler('dvala.io.pick')!
      const originalPrompt = globalThis.prompt
      try {
        globalThis.prompt = vi.fn(() => '1')
        const result = handler(fromJsAny({ items }), emptyK) as { type: string; value: unknown; k: unknown }
        expect(result.type).toBe('Value')
        expect(result.value).toBe(1)
      } finally {
        globalThis.prompt = originalPrompt
      }
    })

    it('should return null when prompt is cancelled', () => {
      const handler = getStandardEffectHandler('dvala.io.pick')!
      const originalPrompt = globalThis.prompt
      try {
        globalThis.prompt = vi.fn(() => null)
        const result = handler(fromJsAny({ items }), emptyK) as { type: string; value: unknown; k: unknown }
        expect(result.type).toBe('Value')
        expect(result.value).toBeNull()
      } finally {
        globalThis.prompt = originalPrompt
      }
    })

    it('should return default index when user submits empty input with default option', () => {
      const handler = getStandardEffectHandler('dvala.io.pick')!
      const originalPrompt = globalThis.prompt
      try {
        globalThis.prompt = vi.fn(() => '')
        const result = handler(fromJsAny({ items, options: { default: 2 } }), emptyK) as { type: string; value: unknown; k: unknown }
        expect(result.type).toBe('Value')
        expect(result.value).toBe(2)
      } finally {
        globalThis.prompt = originalPrompt
      }
    })

    it('should return null when user submits empty input with no default', () => {
      const handler = getStandardEffectHandler('dvala.io.pick')!
      const originalPrompt = globalThis.prompt
      try {
        globalThis.prompt = vi.fn(() => '')
        const result = handler(fromJsAny({ items }), emptyK) as { type: string; value: unknown; k: unknown }
        expect(result.type).toBe('Value')
        expect(result.value).toBeNull()
      } finally {
        globalThis.prompt = originalPrompt
      }
    })

    it('should include custom prompt label in message', () => {
      const handler = getStandardEffectHandler('dvala.io.pick')!
      const originalPrompt = globalThis.prompt
      try {
        globalThis.prompt = vi.fn(() => '0')
        void handler(fromJsAny({ items, options: { prompt: 'Pick a fruit:' } }), emptyK)
        expect((globalThis.prompt as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toContain('Pick a fruit:')
      } finally {
        globalThis.prompt = originalPrompt
      }
    })

    it('should throw on empty items array', () => {
      const handler = getStandardEffectHandler('dvala.io.pick')!
      const originalPrompt = globalThis.prompt
      try {
        globalThis.prompt = vi.fn(() => '0')
        expect(() => handler(fromJsAny({ items: [] }), emptyK)).toThrow('must not be empty')
      } finally {
        globalThis.prompt = originalPrompt
      }
    })

    it('should throw on non-array first argument', () => {
      const handler = getStandardEffectHandler('dvala.io.pick')!
      expect(() => handler(fromJsAny({ items: 'not-an-array' }), emptyK)).toThrow('must be an array')
    })

    it('should throw when items contain non-strings', () => {
      const handler = getStandardEffectHandler('dvala.io.pick')!
      const originalPrompt = globalThis.prompt
      try {
        globalThis.prompt = vi.fn(() => '0')
        expect(() => handler(fromJsAny({ items: ['ok', 42] }), emptyK)).toThrow('must be a string')
      } finally {
        globalThis.prompt = originalPrompt
      }
    })

    it('should throw when default index is out of bounds', () => {
      const handler = getStandardEffectHandler('dvala.io.pick')!
      const originalPrompt = globalThis.prompt
      try {
        globalThis.prompt = vi.fn(() => '0')
        expect(() => handler(fromJsAny({ items, options: { default: 10 } }), emptyK)).toThrow('out of bounds')
      } finally {
        globalThis.prompt = originalPrompt
      }
    })

    it('should throw on invalid selection string', () => {
      const handler = getStandardEffectHandler('dvala.io.pick')!
      const originalPrompt = globalThis.prompt
      try {
        globalThis.prompt = vi.fn(() => 'banana')
        expect(() => handler(fromJsAny({ items }), emptyK)).toThrow('invalid selection')
      } finally {
        globalThis.prompt = originalPrompt
      }
    })

    it('should throw when prompt is not available (Node.js environment)', () => {
      const handler = getStandardEffectHandler('dvala.io.pick')!
      const originalPrompt = globalThis.prompt
      try {
        // @ts-expect-error -- simulating Node.js environment without prompt
        globalThis.prompt = undefined
        expect(() => handler(fromJsAny({ items }), emptyK)).toThrow('not supported in this environment')
      } finally {
        globalThis.prompt = originalPrompt
      }
    })

    it('should throw when options is not an object (line 267)', () => {
      const handler = getStandardEffectHandler('dvala.io.pick')!
      expect(() => handler(fromJsAny({ items, options: 'not-an-object' }), emptyK)).toThrow('must be an object')
    })

    it('should throw when options is an array (line 267)', () => {
      const handler = getStandardEffectHandler('dvala.io.pick')!
      expect(() => handler(fromJsAny({ items, options: [1, 2] }), emptyK)).toThrow('must be an object')
    })

    it('should throw when options.prompt is not a string (line 272)', () => {
      const handler = getStandardEffectHandler('dvala.io.pick')!
      expect(() => handler(fromJsAny({ items, options: { prompt: 42 } }), emptyK)).toThrow('prompt must be a string')
    })

    it('should throw when options.default is not an integer (line 278)', () => {
      const handler = getStandardEffectHandler('dvala.io.pick')!
      expect(() => handler(fromJsAny({ items, options: { default: 1.5 } }), emptyK)).toThrow('default must be an integer')
    })

    it('should throw when options.default is a string (line 278)', () => {
      const handler = getStandardEffectHandler('dvala.io.pick')!
      expect(() => handler(fromJsAny({ items, options: { default: 'foo' } }), emptyK)).toThrow('default must be an integer')
    })
  })

  describe('dvala.io.confirm handler', () => {
    it('should return true when confirm is accepted', () => {
      const handler = getStandardEffectHandler('dvala.io.confirm')!
      const originalConfirm = globalThis.confirm
      try {
        globalThis.confirm = vi.fn(() => true)
        const result = handler('Are you sure?', emptyK) as { type: string; value: unknown; k: unknown }
        expect(result.type).toBe('Value')
        expect(result.value).toBe(true)
        expect(globalThis.confirm).toHaveBeenCalledWith('Are you sure?')
      } finally {
        globalThis.confirm = originalConfirm
      }
    })

    it('should return false when confirm is cancelled', () => {
      const handler = getStandardEffectHandler('dvala.io.confirm')!
      const originalConfirm = globalThis.confirm
      try {
        globalThis.confirm = vi.fn(() => false)
        const result = handler('Delete?', emptyK) as { type: string; value: unknown; k: unknown }
        expect(result.type).toBe('Value')
        expect(result.value).toBe(false)
      } finally {
        globalThis.confirm = originalConfirm
      }
    })

    it('should accept options object with default boolean', () => {
      const handler = getStandardEffectHandler('dvala.io.confirm')!
      const originalConfirm = globalThis.confirm
      try {
        globalThis.confirm = vi.fn(() => true)
        const result = handler(fromJsAny({ question: 'Proceed?', options: { default: true } }), emptyK) as { type: string; value: unknown; k: unknown }
        expect(result.type).toBe('Value')
        expect(result.value).toBe(true)
      } finally {
        globalThis.confirm = originalConfirm
      }
    })

    it('should throw on non-string first argument', () => {
      const handler = getStandardEffectHandler('dvala.io.confirm')!
      expect(() => handler(42, emptyK)).toThrow('must be a string')
    })

    it('should throw on non-object second argument', () => {
      const handler = getStandardEffectHandler('dvala.io.confirm')!
      const originalConfirm = globalThis.confirm
      try {
        globalThis.confirm = vi.fn(() => true)
        expect(() => handler(fromJsAny({ question: 'Sure?', options: 'bad' }), emptyK)).toThrow('must be an object')
      } finally {
        globalThis.confirm = originalConfirm
      }
    })

    it('should throw when options.default is not a boolean', () => {
      const handler = getStandardEffectHandler('dvala.io.confirm')!
      const originalConfirm = globalThis.confirm
      try {
        globalThis.confirm = vi.fn(() => true)
        expect(() => handler(fromJsAny({ question: 'Sure?', options: { default: 1 } }), emptyK)).toThrow('must be a boolean')
      } finally {
        globalThis.confirm = originalConfirm
      }
    })

    it('should throw when confirm is not available (Node.js environment)', () => {
      const handler = getStandardEffectHandler('dvala.io.confirm')!
      const originalConfirm = globalThis.confirm
      try {
        // @ts-expect-error -- simulating Node.js environment without confirm
        globalThis.confirm = undefined
        expect(() => handler('Sure?', emptyK)).toThrow('not supported in this environment')
      } finally {
        globalThis.confirm = originalConfirm
      }
    })
  })

  describe('dvala.io.readStdin handler', () => {
    it('should resolve with concatenated stdin chunks', async () => {
      const handler = getStandardEffectHandler('dvala.io.readStdin')!
      const mockStdin = {
        setEncoding: vi.fn(),
        on: vi.fn(),
        resume: vi.fn(),
      }
      const stdinSpy = vi.spyOn(process, 'stdin', 'get').mockReturnValue(mockStdin as unknown as typeof process.stdin)
      try {
        const promise = handler(null, emptyK)
        // Simulate data events followed by end
        const onCalls = mockStdin.on.mock.calls as [string, (...args: unknown[]) => void][]
        const dataHandler = onCalls.find(c => c[0] === 'data')![1] as (chunk: string) => void
        const endHandler = onCalls.find(c => c[0] === 'end')![1] as () => void
        dataHandler('hello ')
        dataHandler('world')
        endHandler()

        const result = await promise as { type: string; value: unknown; k: unknown }
        expect(result.type).toBe('Value')
        expect(result.value).toBe('hello world')
        expect(mockStdin.setEncoding).toHaveBeenCalledWith('utf-8')
        expect(mockStdin.resume).toHaveBeenCalled()
      } finally {
        stdinSpy.mockRestore()
      }
    })

    it('should reject when stdin emits an error', async () => {
      const handler = getStandardEffectHandler('dvala.io.readStdin')!
      const mockStdin = {
        setEncoding: vi.fn(),
        on: vi.fn(),
        resume: vi.fn(),
      }
      const stdinSpy = vi.spyOn(process, 'stdin', 'get').mockReturnValue(mockStdin as unknown as typeof process.stdin)
      try {
        const promise = handler(null, emptyK)
        const onCalls = mockStdin.on.mock.calls as [string, (...args: unknown[]) => void][]
        const errorHandler = onCalls.find(c => c[0] === 'error')![1] as (err: Error) => void
        errorHandler(new Error('read failed'))

        await expect(promise).rejects.toThrow('read failed')
      } finally {
        stdinSpy.mockRestore()
      }
    })

    it('should throw when stdin is not available', () => {
      const handler = getStandardEffectHandler('dvala.io.readStdin')!
      const stdinSpy = vi.spyOn(process, 'stdin', 'get').mockReturnValue(null as unknown as typeof process.stdin)
      try {
        expect(() => handler(null, emptyK)).toThrow('not supported in this environment')
      } finally {
        stdinSpy.mockRestore()
      }
    })
  })

  // ── Random effects ───────────────────────────────────────────────────────

  describe('dvala.random handler', () => {
    it('should return a ValueStep with a number in [0, 1)', () => {
      const handler = getStandardEffectHandler('dvala.random')!
      const result = handler(null, emptyK) as { type: string; value: number; k: unknown }
      expect(result.type).toBe('Value')
      expect(result.value).toBeGreaterThanOrEqual(0)
      expect(result.value).toBeLessThan(1)
    })
  })

  describe('dvala.random.uuid handler', () => {
    it('should return a valid UUID v4 string', () => {
      const handler = getStandardEffectHandler('dvala.random.uuid')!
      const result = handler(null, emptyK) as { type: string; value: string; k: unknown }
      expect(result.type).toBe('Value')
      expect(result.value).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/)
    })
  })

  describe('dvala.random.int handler', () => {
    it('should return an integer in [min, max)', () => {
      const handler = getStandardEffectHandler('dvala.random.int')!
      const result = handler(asAny([0, 10]), emptyK) as { type: string; value: number; k: unknown }
      expect(result.type).toBe('Value')
      expect(Number.isInteger(result.value)).toBe(true)
      expect(result.value).toBeGreaterThanOrEqual(0)
      expect(result.value).toBeLessThan(10)
    })

    it('should throw when max <= min', () => {
      const handler = getStandardEffectHandler('dvala.random.int')!
      expect(() => handler(asAny([5, 5]), emptyK)).toThrow('must be greater than min')
      expect(() => handler(asAny([5, 3]), emptyK)).toThrow('must be greater than min')
    })

    it('should throw on non-integer arguments', () => {
      const handler = getStandardEffectHandler('dvala.random.int')!
      expect(() => handler(asAny([1.5, 10]), emptyK)).toThrow('must be an integer')
      expect(() => handler(asAny([0, 10.5]), emptyK)).toThrow('must be an integer')
    })

    it('should include type name when min is not a number', () => {
      const handler = getStandardEffectHandler('dvala.random.int')!
      expect(() => handler(asAny(['foo', 10]), emptyK)).toThrow('got string')
    })

    it('should include type name when max is not a number', () => {
      const handler = getStandardEffectHandler('dvala.random.int')!
      expect(() => handler(asAny([0, 'bar']), emptyK)).toThrow('got string')
    })
  })

  describe('dvala.random.item handler', () => {
    it('should return an element from the array', () => {
      const handler = getStandardEffectHandler('dvala.random.item')!
      const arr = [10, 20, 30]
      const result = handler(asAny(arr), emptyK) as { type: string; value: number; k: unknown }
      expect(result.type).toBe('Value')
      expect(arr).toContain(result.value)
    })

    it('should throw on empty array', () => {
      const handler = getStandardEffectHandler('dvala.random.item')!
      expect(() => handler(asAny([]), emptyK)).toThrow('empty array')
    })

    it('should throw on non-array argument', () => {
      const handler = getStandardEffectHandler('dvala.random.item')!
      expect(() => handler('string', emptyK)).toThrow('must be an array')
    })
  })

  describe('dvala.random.shuffle handler', () => {
    it('should return a new array with the same elements', () => {
      const handler = getStandardEffectHandler('dvala.random.shuffle')!
      const arr = [1, 2, 3, 4, 5]
      const result = handler(fromJsAny(arr), emptyK) as { type: string; value: PersistentVector; k: unknown }
      expect(result.type).toBe('Value')
      expect(result.value.size).toBe(arr.length)
      expect([...result.value].sort()).toEqual([...arr].sort())
    })

    it('should not mutate the original array', () => {
      const handler = getStandardEffectHandler('dvala.random.shuffle')!
      const arr = [1, 2, 3, 4, 5]
      const original = [...arr]
      void handler(fromJsAny(arr), emptyK)
      expect(arr).toEqual(original)
    })

    it('should return an empty array when given an empty array', () => {
      const handler = getStandardEffectHandler('dvala.random.shuffle')!
      const result = handler(fromJsAny([]), emptyK) as { type: string; value: PersistentVector; k: unknown }
      expect(result.type).toBe('Value')
      expect(result.value).toEqual(PersistentVector.empty())
    })

    it('should throw on non-array argument', () => {
      const handler = getStandardEffectHandler('dvala.random.shuffle')!
      expect(() => handler('string', emptyK)).toThrow('must be an array')
    })
  })

  // ── Time effects ─────────────────────────────────────────────────────────

  describe('dvala.time.now handler', () => {
    it('should return a ValueStep with a number', () => {
      const handler = getStandardEffectHandler('dvala.time.now')!
      const before = Date.now()
      const result = handler(null, emptyK) as { type: string; value: number; k: unknown }
      const after = Date.now()
      expect(result.type).toBe('Value')
      expect(result.value).toBeGreaterThanOrEqual(before)
      expect(result.value).toBeLessThanOrEqual(after)
    })
  })

  describe('dvala.time.zone handler', () => {
    it('should return a non-empty string', () => {
      const handler = getStandardEffectHandler('dvala.time.zone')!
      const result = handler(null, emptyK) as { type: string; value: string; k: unknown }
      expect(result.type).toBe('Value')
      expect(typeof result.value).toBe('string')
      expect(result.value.length).toBeGreaterThan(0)
    })
  })

  // ── Async effects ────────────────────────────────────────────────────────

  describe('dvala.sleep handler', () => {
    it('should return a Promise that resolves with a ValueStep', async () => {
      const handler = getStandardEffectHandler('dvala.sleep')!
      const result = handler(10, emptyK)
      expect(result).toBeInstanceOf(Promise)
      const step = await result
      expect(step).toEqual({ type: 'Value', value: null, k: emptyK })
    })

    it('should throw on negative ms', () => {
      const handler = getStandardEffectHandler('dvala.sleep')!
      expect(() => handler(-1, emptyK)).toThrow('non-negative number')
    })

    it('should throw on non-number argument', () => {
      const handler = getStandardEffectHandler('dvala.sleep')!
      expect(() => handler('fast', emptyK)).toThrow('non-negative number')
    })
  })

  // ── formatForOutput special-type branches ────────────────────────────────

  describe('formatForOutput special type branches', () => {
    it('should format a builtin DvalaFunction', () => {
      const handler = getStandardEffectHandler('dvala.io.print')!
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
      const builtinFn = { [FUNCTION_SYMBOL]: true, functionType: 'Builtin', normalBuiltinSymbolType: 42 }
      try {
        void handler(asAny(builtinFn), emptyK)
        expect(spy).toHaveBeenCalledWith('<builtin function 42>')
      } finally {
        spy.mockRestore()
      }
    })

    it('should format a native JS RegExp', () => {
      const handler = getStandardEffectHandler('dvala.io.print')!
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
      try {
        void handler(/abc/g as unknown as Any, emptyK)
        expect(spy).toHaveBeenCalledWith('/abc/g')
      } finally {
        spy.mockRestore()
      }
    })
  })

  // ── replaceSpecialValues branches (triggered via print on arrays/objects) ──

  describe('formatForOutput / replaceSpecialValues special value branches', () => {
    it('should format a DvalaFunction inside an array', () => {
      const handler = getStandardEffectHandler('dvala.io.print')!
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
      const fn = { [FUNCTION_SYMBOL]: true, functionType: 'UserDefined', name: 'myFn' }
      try {
        void handler(asAny([fn]), emptyK)
        expect(spy).toHaveBeenCalledWith('[\n  "<function myFn>"\n]')
      } finally {
        spy.mockRestore()
      }
    })

    it('should format an EffectRef inside an array', () => {
      const handler = getStandardEffectHandler('dvala.io.print')!
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
      const effectRef = { [EFFECT_SYMBOL]: true, name: 'dvala.io.print' }
      try {
        void handler(asAny([effectRef]), emptyK)
        expect(spy).toHaveBeenCalledWith('[\n  "<effect dvala.io.print>"\n]')
      } finally {
        spy.mockRestore()
      }
    })

    it('should format a RegularExpression inside an array', () => {
      const handler = getStandardEffectHandler('dvala.io.print')!
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
      const re = { [REGEXP_SYMBOL]: true, s: 'abc', f: 'g' }
      try {
        void handler(asAny([re]), emptyK)
        expect(spy).toHaveBeenCalledWith('[\n  "/abc/g"\n]')
      } finally {
        spy.mockRestore()
      }
    })
  })
})
