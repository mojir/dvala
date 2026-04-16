import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { createDvala } from '../src/createDvala'
import { bundle } from '../src/bundler'
import { mathUtilsModule } from '../src/builtin/modules/math'
import type { DvalaModule } from '../src/builtin/modules/interface'
import type { DvalaBundle } from '../src/bundler/interface'
import type { Any } from '../src/interface'

const customTypedModule: DvalaModule = {
  name: 'custom',
  description: 'Test module for typecheck integration.',
  functions: {
    id: {
      evaluate: ([value]): Any => value as Any,
      arity: { min: 1, max: 1 },
      docs: {
        type: '(Number) -> Number',
        category: 'misc',
        returns: { type: 'number' },
        args: {
          value: { type: 'number' },
        },
        variants: [{ argumentNames: ['value'] }],
        description: 'Returns the provided value.',
        examples: ['let m = import("custom"); m.id(1)'],
      },
    },
  },
}

describe('createDvala', () => {
  describe('basic run', () => {
    it('runs a simple program', () => {
      const d = createDvala()
      expect(d.run('1 + 2')).toBe(3)
    })

    it('runs with per-run scope', () => {
      const d = createDvala()
      expect(d.run('x + 1', { scope: { x: 5 } })).toBe(6)
    })

    it('runs with per-run scope returning value directly', () => {
      const d = createDvala()
      expect(d.run('x', { scope: { x: 99 } })).toBe(99)
    })

    it('per-run scope provides bindings', () => {
      const d = createDvala()
      expect(d.run('x + y', { scope: { x: 1, y: 2 } })).toBe(3)
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

  describe('typecheck integration', () => {
    it('run emits non-blocking type diagnostics', () => {
      const diagnostics: string[] = []
      const d = createDvala({ onTypeDiagnostic: diagnostic => diagnostics.push(diagnostic.message) })

      expect(d.run('let x: Number = "hello"; 42')).toBe(42)
      expect(diagnostics.length).toBeGreaterThan(0)
    })

    it('runAsync emits non-blocking type diagnostics', async () => {
      const diagnostics: string[] = []
      const d = createDvala({ onTypeDiagnostic: diagnostic => diagnostics.push(diagnostic.message) })

      const result = await d.runAsync('let x: Number = "hello"; 42')

      expect(result).toMatchObject({ type: 'completed', value: 42, scope: {} })
      expect(diagnostics.length).toBeGreaterThan(0)
    })

    it('typecheck false suppresses diagnostics during run', () => {
      const diagnostics: string[] = []
      const d = createDvala({ typecheck: false, onTypeDiagnostic: diagnostic => diagnostics.push(diagnostic.message) })

      expect(d.run('let x: Number = "hello"; 42')).toBe(42)
      expect(diagnostics).toEqual([])
    })

    it('typechecks factory modules registered on the runner', () => {
      const diagnostics: string[] = []
      const d = createDvala({
        modules: [customTypedModule],
        onTypeDiagnostic: diagnostic => diagnostics.push(diagnostic.message),
      })

      expect(d.run('let m = import("custom"); m.id(1)')).toBe(1)
      expect(diagnostics).toEqual([])
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
      expect(result).toMatchObject({ type: 'completed', value: 3, scope: {} })
    })

    it('runs with per-run scope (async)', async () => {
      const d = createDvala()
      const result = await d.runAsync('x * 2', { scope: { x: 10 } })
      expect(result).toMatchObject({ type: 'completed', value: 20, scope: {} })
    })

    it('runs with effectHandlers from factory', async () => {
      const d = createDvala({
        effectHandlers: [
          { pattern: 'my.ask', handler: async ({ resume }) => resume(42) },
        ],
      })
      const result = await d.runAsync('perform(@my.ask)')
      expect(result).toMatchObject({ type: 'completed', value: 42, scope: {} })
    })

    it('runs with effectHandlers from per-run options', async () => {
      const d = createDvala()
      const result = await d.runAsync('perform(@my.ask)', {
        effectHandlers: [
          { pattern: 'my.ask', handler: async ({ resume }) => resume(7) },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 7, scope: {} })
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
      expect(result).toMatchObject({ type: 'completed', value: 'run', scope: {} })
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
      const d = createDvala()
      expect(d.run('base + 1', { scope: { base: 10 } })).toBe(11)
      expect(d.run('base + 2', { scope: { base: 10 } })).toBe(12)
      expect(d.run('base + 3', { scope: { base: 10 } })).toBe(13)
    })
  })

  describe('run with DvalaBundle', () => {
    it('runs a bundle with a simple AST', () => {
      const d = createDvala()
      // AST for: 1 + 2
      const simpleBundle: DvalaBundle = {
        version: 1,
        ast: {
          body: [['Call', [['Builtin', '+', 0], [['Num', 1, 0], ['Num', 2, 0]]], 0]],
        },
      }
      expect(d.run(simpleBundle)).toBe(3)
    })

    it('runs a bundle produced by the bundler', () => {
      const bundled = bundle(path.resolve(__dirname, 'bundler/fixtures/main.dvala'))
      const d = createDvala()
      expect(d.run(bundled)).toBe(50) // 42 + 8
    })
  })

  describe('runAsync with DvalaBundle', () => {
    it('runs a bundle async', async () => {
      const d = createDvala()
      const asyncBundle: DvalaBundle = {
        version: 1,
        ast: {
          body: [['Call', [['Builtin', '+', 0], [['Num', 1, 0], ['Num', 2, 0]]], 0]],
        },
      }
      const result = await d.runAsync(asyncBundle)
      expect(result).toMatchObject({ type: 'completed', value: 3 })
    })
  })

  describe('runAsync catch paths', () => {
    it('wraps non-DvalaError non-TypeError in DvalaError', async () => {
      const d = createDvala()
      const fakeBundle = {
        version: 1,
        get ast(): any { throw new RangeError('boom') },
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

    it('does not include scope bindings as undefined', () => {
      const d = createDvala()
      const symbols = d.getUndefinedSymbols('x + y', { scope: { x: 1 } })
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
