import { describe, expect, it } from 'vitest'
import { createDvala } from '../src/createDvala'
import { mathUtilsModule } from '../src/builtin/modules/math'

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
      expect(d.run('let m = import(math); m.ln(1)')).toBe(0)
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
        effectHandlers: {
          'my.val': ({ resume }) => resume(42),
        },
      })
      expect(d.run('perform(effect(my.val))')).toBe(42)
    })

    it('run uses effectHandlers from per-run options', () => {
      const d = createDvala()
      expect(d.run('perform(effect(my.val))', {
        effectHandlers: { 'my.val': ({ resume }) => resume(99) },
      })).toBe(99)
    })

    it('per-run effectHandlers are stacked on top of factory effectHandlers', () => {
      const d = createDvala({
        effectHandlers: { 'my.*': ({ resume }) => resume('factory') },
      })
      expect(d.run('perform(effect(my.specific))', {
        effectHandlers: { 'my.specific': ({ resume }) => resume('run') },
      })).toBe('run')
    })
  })

  describe('pure mode', () => {
    it('pure mode with effectHandlers throws at run time', () => {
      const d = createDvala()
      expect(() => d.run('1 + 1', {
        pure: true,
        // @ts-expect-error -- deliberately testing runtime guard for type-prevented combination
        effectHandlers: { 'my.effect': ({ resume }: { resume: (v: number) => void }) => resume(1) },
      })).toThrow('Cannot use pure mode with effect handlers')
    })

    it('pure mode with factory effectHandlers throws at run time', () => {
      const d = createDvala({
        effectHandlers: { 'my.effect': ({ resume }) => resume(1) },
      })
      expect(() => d.run('1 + 1', { pure: true })).toThrow('Cannot use pure mode with effect handlers')
    })
  })

  describe('runAsync', () => {
    it('runs a simple async program', async () => {
      const d = createDvala()
      const result = await d.runAsync('1 + 2')
      expect(result).toEqual({ type: 'completed', value: 3, definedBindings: {} })
    })

    it('runs with factory bindings', async () => {
      const d = createDvala({ bindings: { x: 10 } })
      const result = await d.runAsync('x * 2')
      expect(result).toEqual({ type: 'completed', value: 20, definedBindings: {} })
    })

    it('runs with effectHandlers from factory', async () => {
      const d = createDvala({
        effectHandlers: {
          'my.ask': async ({ resume }) => resume(42),
        },
      })
      const result = await d.runAsync('perform(effect(my.ask))')
      expect(result).toEqual({ type: 'completed', value: 42, definedBindings: {} })
    })

    it('runs with effectHandlers from per-run options', async () => {
      const d = createDvala()
      const result = await d.runAsync('perform(effect(my.ask))', {
        effectHandlers: { 'my.ask': async ({ resume }) => resume(7) },
      })
      expect(result).toEqual({ type: 'completed', value: 7, definedBindings: {} })
    })

    it('per-run effectHandlers are stacked on top of factory effectHandlers', async () => {
      const d = createDvala({
        effectHandlers: { 'my.*': async ({ resume }) => resume('factory') },
      })
      const result = await d.runAsync('perform(effect(my.specific))', {
        effectHandlers: { 'my.specific': async ({ resume }) => resume('run') },
      })
      expect(result).toEqual({ type: 'completed', value: 'run', definedBindings: {} })
    })

    it('returns error result on Dvala error', async () => {
      const d = createDvala()
      const result = await d.runAsync('perform(effect(dvala.error), "oops")')
      expect(result.type).toBe('error')
    })

    it('pure mode with effectHandlers throws at run time', async () => {
      const d = createDvala()
      await expect(d.runAsync('1 + 1', {
        pure: true,
        // @ts-expect-error -- deliberately testing runtime guard for type-prevented combination
        effectHandlers: { 'my.effect': async ({ resume }: { resume: (v: number) => void }) => resume(1) },
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
})
