import { describe, expect, it } from 'vitest'
import { createDvala } from '../src/createDvala'
import { resume } from '../src/resume'
import type { Handlers, RunResult } from '../src/evaluator/effectTypes'

const dvala = createDvala({ disableAutoCheckpoint: true })

describe('host boundary validation', () => {
  // ── Boundary 1: scope bindings ──────────────────────────────────────

  describe('scope bindings', () => {
    it('should accept valid scope values', () => {
      const result = dvala.run('x + y', { scope: { x: 10, y: 32 } })
      expect(result).toBe(42)
    })

    it('should reject undefined in scope', () => {
      expect(() => dvala.run('x', { scope: { x: undefined } }))
        .toThrow(TypeError)
      expect(() => dvala.run('x', { scope: { x: undefined } }))
        .toThrow(/scope binding "x".*undefined/)
    })

    it('should reject function in scope', () => {
      expect(() => dvala.run('x', { scope: { x: () => 1 } }))
        .toThrow(TypeError)
      expect(() => dvala.run('x', { scope: { x: () => 1 } }))
        .toThrow(/scope binding "x".*JS functions/)
    })

    it('should reject nested invalid values in scope', () => {
      expect(() => dvala.run('x', { scope: { x: { nested: undefined } } }))
        .toThrow(/scope binding "x".*undefined.*at \.nested/)
    })

    it('should reject Date in scope', () => {
      expect(() => dvala.run('x', { scope: { x: new Date() } }))
        .toThrow(/scope binding "x".*Date/)
    })

    it('should reject class instance in scope', () => {
      class Foo { val = 1 }
      expect(() => dvala.run('x', { scope: { x: new Foo() } }))
        .toThrow(/scope binding "x".*Class instance \(Foo\)/)
    })
  })

  // ── Boundary 2: resume() ────────────────────────────────────────────

  describe('resume() in effect handler', () => {
    it('should accept valid resume value', async () => {
      const handlers: Handlers = [
        { pattern: 'test.get', handler: ctx => { ctx.resume(42) } },
      ]
      const result = await dvala.runAsync('perform(@test.get)', {
        effectHandlers: handlers,
      })
      expect(result.type).toBe('completed')
      if (result.type === 'completed')
        expect(result.value).toBe(42)
    })

    it('should reject undefined resume value', async () => {
      const handlers: Handlers = [
        { pattern: 'test.get', handler: ctx => { ctx.resume(undefined) } },
      ]
      const result = await dvala.runAsync('perform(@test.get)', {
        effectHandlers: handlers,
      })
      expect(result.type).toBe('error')
      if (result.type === 'error')
        expect(result.error.message).toMatch(/resume\(\) in handler for 'test.get'.*undefined/)
    })

    it('should reject function resume value', async () => {
      const handlers: Handlers = [
        { pattern: 'test.get', handler: ctx => { ctx.resume(() => 1) } },
      ]
      const result = await dvala.runAsync('perform(@test.get)', {
        effectHandlers: handlers,
      })
      expect(result.type).toBe('error')
      if (result.type === 'error')
        expect(result.error.message).toMatch(/resume\(\) in handler for 'test.get'.*JS functions/)
    })
  })

  // ── Boundary 2b: async resume ───────────────────────────────────────

  describe('async resume() with promise', () => {
    it('should accept valid resolved value', async () => {
      const handlers: Handlers = [
        { pattern: 'test.fetch', handler: ctx => { ctx.resume(Promise.resolve(42)) } },
      ]
      const result = await dvala.runAsync('perform(@test.fetch)', {
        effectHandlers: handlers,
      })
      expect(result.type).toBe('completed')
      if (result.type === 'completed')
        expect(result.value).toBe(42)
    })

    it('should reject invalid resolved value from promise', async () => {
      const handlers: Handlers = [
        { pattern: 'test.fetch', handler: ctx => { ctx.resume(Promise.resolve(undefined)) } },
      ]
      const result = await dvala.runAsync('perform(@test.fetch)', {
        effectHandlers: handlers,
      })
      expect(result.type).toBe('error')
      if (result.type === 'error')
        expect(result.error.message).toMatch(/resume\(\).*undefined/)
    })
  })

  // ── Boundary 3: resumeFrom() ───────────────────────────────────────

  describe('resumeFrom() in effect handler', () => {
    it('should accept valid resumeFrom value', async () => {
      const handlers: Handlers = [
        { pattern: 'test.action', handler: ctx => {
          const snapshot = ctx.checkpoint('before')
          ctx.resumeFrom(snapshot, 99)
        } },
      ]
      const result = await dvala.runAsync('perform(@test.action)', {
        effectHandlers: handlers,
      })
      expect(result.type).toBe('completed')
      if (result.type === 'completed')
        expect(result.value).toBe(99)
    })

    it('should reject invalid resumeFrom value', async () => {
      const handlers: Handlers = [
        { pattern: 'test.action', handler: ctx => {
          const snapshot = ctx.checkpoint('before')
          ctx.resumeFrom(snapshot, undefined)
        } },
      ]
      const result = await dvala.runAsync('perform(@test.action)', {
        effectHandlers: handlers,
      })
      expect(result.type).toBe('error')
      if (result.type === 'error')
        expect(result.error.message).toMatch(/resumeFrom\(\).*undefined/)
    })
  })

  // ── Boundary 4: suspend/checkpoint meta ─────────────────────────────

  describe('suspend() meta validation', () => {
    it('should accept valid meta', async () => {
      const handlers: Handlers = [
        { pattern: 'test.pause', handler: ctx => { ctx.suspend({ reason: 'waiting' }) } },
      ]
      const result = await dvala.runAsync('perform(@test.pause)', {
        effectHandlers: handlers,
      })
      expect(result.type).toBe('suspended')
    })

    it('should reject function in suspend meta', async () => {
      const handlers: Handlers = [
        { pattern: 'test.pause', handler: ctx => { ctx.suspend({ callback: () => 1 }) } },
      ]
      const result = await dvala.runAsync('perform(@test.pause)', {
        effectHandlers: handlers,
      })
      expect(result.type).toBe('error')
      if (result.type === 'error')
        expect(result.error.message).toMatch(/suspend\(\) meta.*JS functions/)
    })
  })

  describe('checkpoint() meta validation', () => {
    it('should accept valid checkpoint meta', async () => {
      const handlers: Handlers = [
        { pattern: 'test.mark', handler: ctx => {
          ctx.checkpoint('mark', { tag: 'v1' })
          ctx.resume(null)
        } },
      ]
      const result = await dvala.runAsync('perform(@test.mark)', {
        effectHandlers: handlers,
      })
      expect(result.type).toBe('completed')
    })

    it('should reject function in checkpoint meta', async () => {
      const handlers: Handlers = [
        { pattern: 'test.mark', handler: ctx => {
          ctx.checkpoint('mark', { fn: () => 1 })
          ctx.resume(null)
        } },
      ]
      const result = await dvala.runAsync('perform(@test.mark)', {
        effectHandlers: handlers,
      })
      expect(result.type).toBe('error')
      if (result.type === 'error')
        expect(result.error.message).toMatch(/checkpoint\(\) meta.*JS functions/)
    })
  })

  // ── Boundary 1b: resume() scope in standalone resume ────────────────

  describe('standalone resume() scope validation', () => {
    it('should reject invalid scope values in resume', async () => {
      // Get a snapshot first by suspending
      const handlers: Handlers = [
        { pattern: 'test.pause', handler: ctx => { ctx.suspend() } },
      ]
      const suspended = await dvala.runAsync('perform(@test.pause)', {
        effectHandlers: handlers,
      }) as RunResult & { type: 'suspended' }

      expect(suspended.type).toBe('suspended')

      // Try to resume with invalid scope — returns error result (doesn't reject)
      const result = await resume(suspended.snapshot, null, {
        scope: { bad: undefined },
        handlers: [{ pattern: 'test.pause', handler: ctx => { ctx.resume(null) } }],
      })
      expect(result.type).toBe('error')
      if (result.type === 'error')
        expect(result.error.message).toMatch(/scope binding "bad".*undefined/)
    })
  })
})
