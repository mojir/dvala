import { describe, expect, it } from 'vitest'
import { createDvala } from '../src/createDvala'
import { mathUtilsModule } from '../src/builtin/modules/math'
import type { DvalaBundle } from '../src/bundler/interface'

describe('createDvala', () => {
  describe('basic run', () => {
    it('runs a simple program', () => {
      const d = createDvala()
      expect(d.run('1 + 2')).toBe(3)
    })

    it('runs with factory bindings', () => {
      const d = createDvala({ bindings: { x: 10 } })
      expect(d.run('x * 2')).toBe(20)
    })

    it('runs with per-run bindings', () => {
      const d = createDvala()
      expect(d.run('x + 1', { bindings: { x: 5 } })).toBe(6)
    })

    it('per-run bindings shadow factory bindings', () => {
      const d = createDvala({ bindings: { x: 1 } })
      expect(d.run('x', { bindings: { x: 99 } })).toBe(99)
    })

    it('factory and per-run bindings merge', () => {
      const d = createDvala({ bindings: { x: 1 } })
      expect(d.run('x + y', { bindings: { y: 2 } })).toBe(3)
    })

    it('runs with factory modules', () => {
      const d = createDvala({ modules: [mathUtilsModule] })
      expect(d.run('let m = import("math"); m.ln(1)')).toBe(0)
    })
  })

  describe('caching', () => {
    it('caches parsed ASTs', () => {
      const d = createDvala({ cache: 10 })
      d.run('1 + 2')
      d.run('1 + 2') // should hit cache
      expect(d.run('1 + 2')).toBe(3)
    })
  })

  describe('sync effect handlers', () => {
    it('run uses effectHandlers from factory', () => {
      const d = createDvala({
        effectHandlers: [
          { pattern: 'my.val', handler: ({ resume }) => resume(42) },
        ],
      })
      expect(d.run('perform(@my.val)')).toBe(42)
    })

    it('run uses effectHandlers from per-run options', () => {
      const d = createDvala()
      expect(d.run('perform(@my.val)', {
        effectHandlers: [
          { pattern: 'my.val', handler: ({ resume }) => resume(99) },
        ],
      })).toBe(99)
    })

    it('per-run effectHandlers are stacked on top of factory effectHandlers', () => {
      const d = createDvala({
        effectHandlers: [
          { pattern: 'my.*', handler: ({ resume }) => resume('factory') },
        ],
      })
      expect(d.run('perform(@my.specific)', {
        effectHandlers: [
          { pattern: 'my.specific', handler: ({ resume }) => resume('run') },
        ],
      })).toBe('run')
    })
  })

  describe('pure mode', () => {
    it('pure mode with effectHandlers throws at run time', () => {
      const d = createDvala()
      expect(() => d.run('1 + 1', {
        pure: true,
        // @ts-expect-error -- deliberately testing runtime guard for type-prevented combination
        effectHandlers: [
          { pattern: 'my.effect', handler: ({ resume }: { resume: (v: number) => void }) => resume(1) },
        ],
      })).toThrow('Cannot use pure mode with effect handlers')
    })

    it('pure mode with factory effectHandlers throws at run time', () => {
      const d = createDvala({
        effectHandlers: [
          { pattern: 'my.effect', handler: ({ resume }) => resume(1) },
        ],
      })
      expect(() => d.run('1 + 1', { pure: true })).toThrow('Cannot use pure mode with effect handlers')
    })
  })

  describe('runAsync', () => {
    it('runs a simple async program', async () => {
      const d = createDvala()
      const result = await d.runAsync('1 + 2')
      expect(result).toMatchObject({ type: 'completed', value: 3, definedBindings: {} })
    })

    it('runs with factory bindings', async () => {
      const d = createDvala({ bindings: { x: 10 } })
      const result = await d.runAsync('x * 2')
      expect(result).toMatchObject({ type: 'completed', value: 20, definedBindings: {} })
    })

    it('runs with effectHandlers from factory', async () => {
      const d = createDvala({
        effectHandlers: [
          { pattern: 'my.ask', handler: async ({ resume }) => resume(42) },
        ],
      })
      const result = await d.runAsync('perform(@my.ask)')
      expect(result).toMatchObject({ type: 'completed', value: 42, definedBindings: {} })
    })

    it('runs with effectHandlers from per-run options', async () => {
      const d = createDvala()
      const result = await d.runAsync('perform(@my.ask)', {
        effectHandlers: [
          { pattern: 'my.ask', handler: async ({ resume }) => resume(7) },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 7, definedBindings: {} })
    })

    it('per-run effectHandlers are stacked on top of factory effectHandlers', async () => {
      const d = createDvala({
        effectHandlers: [
          { pattern: 'my.*', handler: async ({ resume }) => resume('factory') },
        ],
      })
      const result = await d.runAsync('perform(@my.specific)', {
        effectHandlers: [
          { pattern: 'my.specific', handler: async ({ resume }) => resume('run') },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 'run', definedBindings: {} })
    })

    it('returns error result on Dvala error', async () => {
      const d = createDvala()
      const result = await d.runAsync('perform(@dvala.error, "oops")')
      expect(result.type).toBe('error')
    })

    it('pure mode with effectHandlers throws at run time', async () => {
      const d = createDvala()
      await expect(d.runAsync('1 + 1', {
        pure: true,
        // @ts-expect-error -- deliberately testing runtime guard for type-prevented combination
        effectHandlers: [
          { pattern: 'my.effect', handler: async ({ resume }: { resume: (v: number) => void }) => resume(1) },
        ],
      })).rejects.toThrow('pure mode')
    })
  })

  describe('reuse', () => {
    it('factory can be reused across multiple runs', () => {
      const d = createDvala({ bindings: { base: 10 } })
      expect(d.run('base + 1')).toBe(11)
      expect(d.run('base + 2')).toBe(12)
      expect(d.run('base + 3')).toBe(13)
    })
  })

  describe('run with DvalaBundle', () => {
    it('runs a bundle with no file modules', () => {
      const d = createDvala()
      const bundle: DvalaBundle = { program: '1 + 2', fileModules: [] }
      expect(d.run(bundle)).toBe(3)
    })

    it('runs a bundle with file modules', () => {
      const d = createDvala()
      const bundle: DvalaBundle = {
        program: 'let m = import("mylib"); m.x + 1',
        fileModules: [['mylib', '{ x: 10 }']],
      }
      expect(d.run(bundle)).toBe(11)
    })
  })

  describe('runAsync with DvalaBundle', () => {
    it('runs a bundle with no file modules async', async () => {
      const d = createDvala()
      const bundle: DvalaBundle = { program: '1 + 2', fileModules: [] }
      const result = await d.runAsync(bundle)
      expect(result).toMatchObject({ type: 'completed', value: 3, definedBindings: {} })
    })

    it('runs a bundle with file modules async', async () => {
      const d = createDvala()
      const bundle: DvalaBundle = {
        program: 'let m = import("mylib"); m.x * 3',
        fileModules: [['mylib', '{ x: 5 }']],
      }
      const result = await d.runAsync(bundle)
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toBe(15)
      }
    })
  })

  describe('runAsync catch paths', () => {
    it('wraps non-DvalaError non-TypeError in DvalaError', async () => {
      const d = createDvala()
      const fakeBundle = {
        fileModules: [],
        get program(): string { throw new RangeError('boom') },
      }

      const result = await d.runAsync(fakeBundle as any)
      expect(result.type).toBe('error')
    })

    it('rethrows TypeError from try block', async () => {
      const d = createDvala()

      await expect(d.runAsync(null as any)).rejects.toThrow(TypeError)
    })
  })

  describe('getUndefinedSymbols', () => {
    it('returns undefined symbols in a program', () => {
      const d = createDvala()
      const symbols = d.getUndefinedSymbols('x + y')
      expect(symbols).toContain('x')
      expect(symbols).toContain('y')
    })

    it('does not include factory bindings as undefined', () => {
      const d = createDvala({ bindings: { x: 1 } })
      const symbols = d.getUndefinedSymbols('x + y')
      expect(symbols).not.toContain('x')
      expect(symbols).toContain('y')
    })

    it('does not include factory module functions as undefined', () => {
      const d = createDvala({ modules: [mathUtilsModule] })
      const symbols = d.getUndefinedSymbols('x + 1')
      expect(symbols).toContain('x')
    })
  })

  describe('getAutoCompleter', () => {
    it('returns an AutoCompleter instance', () => {
      const d = createDvala()
      const completer = d.getAutoCompleter('1 + ', 4)
      expect(completer).toBeDefined()
    })
  })
})
