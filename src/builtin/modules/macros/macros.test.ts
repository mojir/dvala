import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../createDvala'
import type { Handlers } from '../../../evaluator/effectTypes'
import { astModule } from '../ast'
import { macrosModule } from '.'

const dvala = createDvala({ modules: [macrosModule, astModule] })

// Helper: capture @dvala.io.print calls during an async run.
async function runAndCapturePrints(code: string): Promise<{ value: unknown; prints: string[] }> {
  const prints: string[] = []
  const handlers: Handlers = [
    { pattern: 'dvala.io.print', handler: ctx => {
      prints.push(String(ctx.arg))
      ctx.resume(null)
    } },
  ]
  const result = await dvala.runAsync(code, { effectHandlers: handlers })
  if (result.type !== 'completed')
    throw new Error(`run failed: ${JSON.stringify(result)}`)
  return { value: result.value, prints }
}

describe('macros module', () => {
  describe('unless', () => {
    it('evaluates body when condition is falsy', () => {
      expect(dvala.run(`
        let { unless } = import("macros");
        unless(false, 42)
      `)).toBe(42)
    })

    it('returns null when condition is truthy', () => {
      expect(dvala.run(`
        let { unless } = import("macros");
        unless(true, 42)
      `)).toBeNull()
    })

    it('does not evaluate body when condition is truthy', async () => {
      const { value, prints } = await runAndCapturePrints(`
        let { unless } = import("macros");
        unless(true, perform(@dvala.io.print, "should not fire"))
      `)
      expect(value).toBeNull()
      expect(prints).toEqual([])
    })
  })

  describe('cond', () => {
    it('picks the first matching branch', () => {
      expect(dvala.run(`
        let { cond } = import("macros");
        let describe = (x) -> cond(
          x < 0, "negative",
          x == 0, "zero",
          "positive"
        );
        [describe(-1), describe(0), describe(5)]
      `)).toEqual(['negative', 'zero', 'positive'])
    })

    it('returns null when no clause matches and no default is given', () => {
      expect(dvala.run(`
        let { cond } = import("macros");
        cond(false, "a", false, "b")
      `)).toBeNull()
    })

    it('does not evaluate non-matching branches', async () => {
      // chooseAll on only the matching branch's side effect — the other
      // branches must not fire. We use print as a proxy for "evaluated".
      const { value, prints } = await runAndCapturePrints(`
        let { cond } = import("macros");
        cond(
          false, perform(@dvala.io.print, "A"),
          true, perform(@dvala.io.print, "B"),
          perform(@dvala.io.print, "default")
        )
      `)
      expect(value).toBeNull()
      expect(prints).toEqual(['B'])
    })
  })

  describe('tap', () => {
    it('returns the original value', async () => {
      const { value } = await runAndCapturePrints(`
        let { tap } = import("macros");
        tap(42, perform(@dvala.io.print, "checkpoint"))
      `)
      expect(value).toBe(42)
    })

    it('runs the side effect', async () => {
      const { prints } = await runAndCapturePrints(`
        let { tap } = import("macros");
        tap(42, perform(@dvala.io.print, "checkpoint"))
      `)
      expect(prints).toEqual(['checkpoint'])
    })
  })

  describe('trace', () => {
    it('returns the wrapped function result', async () => {
      const { value } = await runAndCapturePrints(`
        let { trace } = import("macros");
        let add = trace((a, b) -> a + b);
        add(3, 4)
      `)
      expect(value).toBe(7)
    })

    it('prints entry args and exit value', async () => {
      const { prints } = await runAndCapturePrints(`
        let { trace } = import("macros");
        let add = trace((a, b) -> a + b);
        add(3, 4)
      `)
      expect(prints).toEqual(['ENTER: [3,4]', 'EXIT: 7'])
    })

    it('includes the binding name when used as a #trace let-decorator', async () => {
      const { prints, value } = await runAndCapturePrints(`
        let { trace } = import("macros");
        #trace
        let greet = (name) -> "hi, " ++ name;
        greet("Ada")
      `)
      expect(value).toBe('hi, Ada')
      expect(prints).toEqual(['ENTER greet: ["Ada"]', 'EXIT greet: hi, Ada'])
    })
  })

  describe('dbg', () => {
    it('returns the value unchanged', async () => {
      const { value } = await runAndCapturePrints(`
        let { dbg } = import("macros");
        dbg(1 + 2 * 3)
      `)
      expect(value).toBe(7)
    })

    it('prints the source expression alongside its value', async () => {
      const { prints } = await runAndCapturePrints(`
        let { dbg } = import("macros");
        dbg(1 + 2 * 3)
      `)
      expect(prints).toHaveLength(1)
      expect(prints[0]).toContain('=>')
      expect(prints[0]).toContain('7')
    })
  })
})
