import { describe, expect, it, vi } from 'vitest'
import { createDvala } from '../src/createDvala'
import { resume as baseResume } from '../src/resume'
import type { ResumeOptions } from '../src/resume'
import type { Handlers, Snapshot } from '../src/evaluator/effectTypes'
import { qualifiedNameMatchesPattern, findMatchingHandlers, generateUUID } from '../src/evaluator/effectTypes'
import { mathUtilsModule } from '../src/builtin/modules/math'
import type { Any } from '../src/interface'
import { PersistentMap } from '../src/utils/persistent'

const dvala = createDvala({ disableAutoCheckpoint: true })

// Wrapper that defaults to disableAutoCheckpoint: true, but allows explicit override
function resumeContinuation(snapshot: Snapshot, value: Any, options?: ResumeOptions) {
  return baseResume(snapshot, value, { disableAutoCheckpoint: true, ...options })
}

describe('phase 2 — Local Effect Handling', () => {
  describe('2a: @name special expression', () => {
    it('should return an effect reference', () => {
      const result = dvala.run('@dvala.io.print')
      expect(result).toHaveProperty('name', 'dvala.io.print')
    })

    it('should support dotted names', () => {
      const result = dvala.run('@llm.complete')
      expect(result).toHaveProperty('name', 'llm.complete')
    })

    it('should support deeply dotted names', () => {
      const result = dvala.run('@com.myco.human.approve')
      expect(result).toHaveProperty('name', 'com.myco.human.approve')
    })

    it('should support single-part names', () => {
      const result = dvala.run('@simple')
      expect(result).toHaveProperty('name', 'simple')
    })

    it('should return the same reference for the same name', () => {
      const result = dvala.run('==(@llm.complete, @llm.complete)')
      expect(result).toBe(true)
    })

    it('should return different references for different names', () => {
      const result = dvala.run('==(@llm.complete, @llm.summarize)')
      expect(result).toBe(false)
    })

    it('should be a first-class value (stored in variables)', () => {
      const result = dvala.run(`
        let eff = @llm.complete;
        eff
      `)
      expect(result).toHaveProperty('name', 'llm.complete')
    })
  })

  describe('2b: perform(eff, ...args) special expression', () => {
    it('should perform an effect with a local handler', () => {
      const result = dvala.run(`
        do
          with handler @my.effect(arg) -> resume(upperCase(arg)) end;
          perform(@my.effect, "hello")
        end
      `)
      expect(result).toBe('HELLO')
    })

    it('should perform an effect with no arguments', () => {
      const result = dvala.run(`
        do
          with handler @my.value(arg) -> resume(42) end;
          perform(@my.value)
        end
      `)
      expect(result).toBe(42)
    })

    it('should perform an effect with an array payload', () => {
      const result = dvala.run(`
        do
          with handler @my.add(arg) -> resume(do let [a, b] = arg; a + b end) end;
          perform(@my.add, [10, 20])
        end
      `)
      expect(result).toBe(30)
    })

    it('should pass single payload to the handler', () => {
      const result = dvala.run(`
        do
          with handler @my.count(arg) -> resume(count(arg)) end;
          perform(@my.count, ["a", "b", "c"])
        end
      `)
      expect(result).toBe(3)
    })

    it('should throw on unhandled effect', () => {
      expect(() => dvala.run('perform(@unhandled.effect, "arg")')).toThrow('Unhandled effect')
    })

    it('should use effect references from variables', () => {
      const result = dvala.run(`
        do
          with handler @my.effect(arg) -> resume("hello " ++ arg) end;
          let myEff = @my.effect;
          perform(myEff, "world")
        end
      `)
      expect(result).toBe('hello world')
    })
  })

  describe('2c: handler dispatch', () => {
    it('should match handlers by effect name', () => {
      const result = dvala.run(`
        do
          with handler
            @a(arg) -> resume(arg * 10)
            @b(arg) -> resume(arg * 100)
          end;
          perform(@a, 1) + perform(@b, 2)
        end
      `)
      expect(result).toBe(210) // 10 + 200
    })

    it('should use the first matching handler', () => {
      const result = dvala.run(`
        do
          with handler @my.eff(arg) -> resume("first: " ++ arg) end;
          perform(@my.eff, "test")
        end
      `)
      expect(result).toBe('first: test')
    })

    it('should delegate to outer handler when no local match', () => {
      const result = dvala.run(`
        do
          with handler @outer.eff(arg) -> resume("outer: " ++ arg) end;
          with handler @inner.eff(arg) -> resume("inner: " ++ arg) end;
          perform(@outer.eff, "value")
        end
      `)
      expect(result).toBe('outer: value')
    })

    it('should nest handler blocks correctly', () => {
      const result = dvala.run(`
        do
          with handler @outer(arg) -> resume("outer(" ++ arg ++ ")") end;
          with handler @inner(arg) -> resume("inner(" ++ arg ++ ")") end;
          let a = perform(@inner, "a");
          a ++ " + " ++ perform(@outer, "b")
        end
      `)
      expect(result).toBe('inner(a) + outer(b)')
    })

    it('should remove handler frame after match — handlers run outside scope', () => {
      // If the handler calls perform with the same effect, it should NOT match
      // the same handler (the frame was removed). It should match an outer handler.
      const result = dvala.run(`
        do
          with handler @my.eff(arg) -> resume("caught: " ++ arg) end;
          with handler @my.eff(arg) -> resume(perform(@my.eff, arg ++ "+delegated")) end;
          perform(@my.eff, "original")
        end
      `)
      expect(result).toBe('caught: original+delegated')
    })

    it('should allow handler return value to be the resume value', () => {
      const result = dvala.run(`
        do
          with handler @my.eff(arg) -> resume(arg + 10) end;
          let x = perform(@my.eff, 5);
          x * 2
        end
      `)
      expect(result).toBe(30) // (5 + 10) * 2
    })

    it('should allow effects inside handler body (delegating to outer)', () => {
      const result = dvala.run(`
        do
          with handler @dvala.io.print(arg) -> resume("logged: " ++ arg) end;
          with handler @my.eff(arg) -> resume(perform(@dvala.io.print, arg)) end;
          perform(@my.eff, "msg")
        end
      `)
      expect(result).toBe('logged: msg')
    })

    it('should skip handler frame on success (no effect performed)', () => {
      const result = dvala.run(`
        do
          with handler @my.eff(arg) -> resume(arg * 100) end;
          42
        end
      `)
      expect(result).toBe(42)
    })
  })

  describe('2d: effects and dvala.error interaction', () => {
    it('errors without dvala.error handler propagate as unhandled', () => {
      // perform(@dvala.error, { message: "boom" }) routes through dvala.error, but no handler -> propagates
      expect(() => dvala.run(`
        do
          with handler @my.eff(arg) -> resume(arg) end;
          perform(@dvala.error, { message: "boom" })
        end
      `)).toThrow('boom')
    })

    it('effects handled by matching handler; dvala.error not invoked on success', () => {
      const result = dvala.run(`
        do
          with handler @my.eff(arg) -> resume("handled: " ++ arg) end;
          perform(@my.eff, "data")
        end
      `)
      expect(result).toBe('handled: data')
    })

    it('errors from handlers propagate past inner scope to outer dvala.error handler', () => {
      const result = dvala.run(`
        do
          with handler @dvala.error(arg) -> resume("outer catch: " ++ arg) end;
          with handler @my.eff(arg) -> resume(perform(@dvala.error, "handler error: " ++ arg)) end;
          perform(@my.eff, "data")
        end
      `)
      // The error from the handler should NOT be caught by any inner scope.
      // It should propagate to the outer dvala.error handler.
      expect(result).toBe('outer catch: handler error: data')
    })

    it('body errors caught by dvala.error handler when present', () => {
      const result = dvala.run(`
        do
          with handler
            @my.eff(arg) -> resume(arg)
            @dvala.error(arg) -> resume("caught: " ++ arg)
          end;
          perform(@dvala.error, "body error")
        end
      `)
      expect(result).toBe('caught: body error')
    })

    it('effects handled; dvala.error handler not invoked when no error', () => {
      const result = dvala.run(`
        do
          with handler
            @my.eff(arg) -> resume(upperCase(arg))
            @dvala.error(arg) -> resume("caught: " ++ arg)
          end;
          perform(@my.eff, "hello")
        end
      `)
      expect(result).toBe('HELLO')
    })

    it('errors bypass non-dvala.error handlers and reach outer dvala.error handler', () => {
      const result = dvala.run(`
        do
          with handler @dvala.error(arg) -> resume("caught: " ++ arg) end;
          with handler @my.eff(arg) -> resume(arg) end;
          perform(@dvala.error, "body boom")
        end
      `)
      expect(result).toBe('caught: body boom')
    })

    it('unhandled effect error caught by dvala.error handler', () => {
      const result = dvala.run(`
        do
          with handler @dvala.error(arg) -> resume("caught: " ++ arg.message) end;
          perform(@no.handler, "data")
        end
      `)
      expect(result).toBe('caught: Unhandled effect: \'no.handler\'')
    })
  })

  describe('2e: effects as first-class values', () => {
    it('should pass effect references as function arguments', () => {
      const result = dvala.run(`
        let handleIt = (myEff, value) ->
          do
            with handler @my.eff(arg) -> resume(arg * 2) end;
            perform(myEff, value)
          end;
        handleIt(@my.eff, 21)
      `)
      expect(result).toBe(42)
    })

    it('should store effect references in data structures', () => {
      const result = dvala.run(`
        let effects = [@a, @b];
        do
          with handler
            @a(arg) -> resume(arg * 10)
            @b(arg) -> resume(arg * 100)
          end;
          perform(effects[0], 1) + perform(effects[1], 2)
        end
      `)
      expect(result).toBe(210)
    })

    it('should compare effect references correctly', () => {
      const result = dvala.run(`
        let eff1 = @same.name;
        let eff2 = @same.name;
        let eff3 = @different.name;
        [==(eff1, eff2), ==(eff1, eff3)]
      `)
      expect(result).toEqual([true, false])
    })
  })
})

describe('phase 3 — Host Async API', () => {
  describe('3a: runSync standalone function', () => {
    it('should evaluate a simple expression', () => {
      const result = dvala.run('[1, 2, 3] |> map(_, -> $ * $)')
      expect(result).toEqual([1, 4, 9])
    })

    it('should accept plain value bindings', () => {
      const result = dvala.run('x + y', {
        bindings: { x: 10, y: 32 },
      })
      expect(result).toBe(42)
    })

    it('should support modules', () => {
      const dvalaWithMath = createDvala({ modules: [mathUtilsModule] })
      const result = dvalaWithMath.run('let m = import("math"); m.ln(1)')
      expect(result).toBe(0)
    })
  })

  describe('3a: run standalone function', () => {
    it('should return completed result for simple expression', async () => {
      const result = await dvala.runAsync('[1, 2, 3] |> reduce(_, +, 0)')
      expect(result).toMatchObject({ type: 'completed', value: 6 })
    })

    it('should accept plain value bindings', async () => {
      const result = await dvala.runAsync('x + y', {
        bindings: { x: 10, y: 32 },
      })
      expect(result).toMatchObject({ type: 'completed', value: 42 })
    })

    it('should support modules', async () => {
      const dvalaWithMath = createDvala({ modules: [mathUtilsModule] })
      const result = await dvalaWithMath.runAsync('let m = import("math"); m.ln(1)')
      expect(result).toMatchObject({ type: 'completed', value: 0 })
    })

    it('should return error result for runtime errors', async () => {
      const result = await dvala.runAsync('perform(@dvala.error, { message: "boom" })')
      expect(result.type).toBe('error')
      if (result.type === 'error') {
        expect(result.error.message).toContain('boom')
      }
    })

    it('should return error result for syntax errors', async () => {
      const result = await dvala.runAsync('(((')
      expect(result.type).toBe('error')
    })
  })

  describe('3b: host handler — sync resume', () => {
    it('should resume with a synchronous value', async () => {
      const result = await dvala.runAsync(`
        perform(@my.double, 21)
      `, {
        effectHandlers: [
          { pattern: 'my.double', handler: async ({ arg, resume: doResume }) => {
            doResume((arg as number) * 2)
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 42 })
    })

    it('should resume with a computed value', async () => {
      const result = await dvala.runAsync(`
        let msg = perform(@my.greet, "world");
        msg
      `, {
        effectHandlers: [
          { pattern: 'my.greet', handler: async ({ arg, resume: doResume }) => {
            doResume(`Hello, ${arg}!`)
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 'Hello, world!' })
    })

    it('should handle multiple host effects sequentially', async () => {
      const result = await dvala.runAsync(`
        let a = perform(@my.add, [10, 20]);
        let b = perform(@my.add, [a, 12]);
        b
      `, {
        effectHandlers: [
          { pattern: 'my.add', handler: async ({ arg, resume: doResume }) => {
            const pair = arg as number[]
            doResume(pair[0]! + pair[1]!)
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 42 })
    })

    it('should resume with no-arg effect', async () => {
      const result = await dvala.runAsync(`
        perform(@my.now)
      `, {
        effectHandlers: [
          { pattern: 'my.now', handler: async ({ resume: doResume }) => {
            doResume(1234567890)
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 1234567890 })
    })
  })

  describe('3b: host handler — async resume', () => {
    it('should resume with an async value (promise)', async () => {
      const result = await dvala.runAsync(`
        perform(@my.fetch, "data")
      `, {
        effectHandlers: [
          { pattern: 'my.fetch', handler: async ({ arg, resume: doResume }) => {
            const value = await Promise.resolve(`fetched: ${arg}`)
            doResume(value)
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 'fetched: data' })
    })

    it('should resume with a promise value directly', async () => {
      const result = await dvala.runAsync(`
        perform(@my.delayed, 42)
      `, {
        effectHandlers: [
          { pattern: 'my.delayed', handler: async ({ arg, resume: doResume }) => {
            doResume(Promise.resolve(arg!))
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 42 })
    })

    it('should handle async errors from promise resume', async () => {
      const result = await dvala.runAsync(`
        do
          with handler @dvala.error(arg) -> resume("caught: " ++ arg.message) end;
          perform(@my.fail, "oops")
        end
      `, {
        effectHandlers: [
          { pattern: 'my.fail', handler: async ({ resume: doResume }) => {
            doResume(Promise.reject(new Error('async failure')))
          } },
        ],
      })
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toContain('caught: async failure')
      }
    })
  })

  describe('3b: host handler — unhandled effect', () => {
    it('should return error for unhandled effect with no handlers', async () => {
      const result = await dvala.runAsync('perform(@no.handler, "data")')
      expect(result.type).toBe('error')
      if (result.type === 'error') {
        expect(result.error.message).toContain('Unhandled effect: \'no.handler\'')
      }
    })

    it('should return error for unhandled effect with non-matching handlers', async () => {
      const result = await dvala.runAsync('perform(@missing.handler, "x")', {
        effectHandlers: [
          { pattern: 'other.handler', handler: async ({ resume: doResume }) => { doResume(null) } },
        ],
      })
      expect(result.type).toBe('error')
      if (result.type === 'error') {
        expect(result.error.message).toContain('Unhandled effect: \'missing.handler\'')
      }
    })
  })

  describe('3b: host handler — error handling', () => {
    it('should catch host handler errors in dvala.error handler', async () => {
      const result = await dvala.runAsync(`
        do
          with handler @dvala.error(arg) -> resume("caught: " ++ arg.message) end;
          perform(@my.fail)
        end
      `, {
        effectHandlers: [
          { pattern: 'my.fail', handler: async () => {
            throw new Error('handler boom')
          } },
        ],
      })
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toContain('caught: handler boom')
      }
    })

    it('should propagate handler errors as RunResult.error when no error handler', async () => {
      const result = await dvala.runAsync(`
        perform(@my.fail)
      `, {
        effectHandlers: [
          { pattern: 'my.fail', handler: async () => {
            throw new Error('handler error')
          } },
        ],
      })
      expect(result.type).toBe('error')
      if (result.type === 'error') {
        expect(result.error.message).toContain('handler error')
      }
    })
  })

  describe('3b: local handlers take precedence over host handlers', () => {
    it('should use local handler instead of host handler', async () => {
      const result = await dvala.runAsync(`
        do
          with handler @my.eff(arg) -> resume("local: " ++ arg) end;
          perform(@my.eff, "test")
        end
      `, {
        effectHandlers: [
          { pattern: 'my.eff', handler: async ({ arg, resume: doResume }) => {
            doResume(`host: ${arg}`)
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 'local: test' })
    })

    it('should delegate to host handler when local handler does not match', async () => {
      const result = await dvala.runAsync(`
        do
          with handler @my.eff(arg) -> resume("local: " ++ arg) end;
          perform(@other.eff, "test")
        end
      `, {
        effectHandlers: [
          { pattern: 'other.eff', handler: async ({ arg, resume: doResume }) => {
            doResume(`host: ${arg}`)
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 'host: test' })
    })

    it('should delegate from local handler to host handler via perform', async () => {
      const result = await dvala.runAsync(`
        do
          with handler @my.eff(arg) -> resume(perform(@my.eff, arg ++ "+enriched")) end;
          perform(@my.eff, "msg")
        end
      `, {
        effectHandlers: [
          { pattern: 'my.eff', handler: async ({ arg, resume: doResume }) => {
            doResume(`host(${arg})`)
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 'host(msg+enriched)' })
    })
  })

  describe('3b: host handler — suspend', () => {
    it('should return suspended result when handler calls suspend', async () => {
      const result = await dvala.runAsync(`
        let x = perform(@my.wait, "please approve");
        "approved: " ++ x
      `, {
        effectHandlers: [
          { pattern: 'my.wait', handler: async ({ arg, suspend }) => {
            suspend({ payload: arg })
          } },
        ],
      })
      expect(result.type).toBe('suspended')
      if (result.type === 'suspended') {
        expect(result.snapshot.meta).toEqual({ payload: 'please approve' })
        expect(result.snapshot).toBeDefined()
        expect(result.snapshot.continuation).toBeDefined()
      }
    })

    it('should return suspended result with no meta', async () => {
      const result = await dvala.runAsync(`
        perform(@my.pause)
      `, {
        effectHandlers: [
          { pattern: 'my.pause', handler: async ({ suspend }) => {
            suspend()
          } },
        ],
      })
      expect(result.type).toBe('suspended')
      if (result.type === 'suspended') {
        expect(result.snapshot.meta).toBeUndefined()
      }
    })
  })

  describe('3b2: host handler — halt', () => {
    it('should return halted result when handler calls halt with value', async () => {
      const result = await dvala.runAsync(`
        let x = perform(@my.stop, "reason");
        "should not reach: " ++ x
      `, {
        effectHandlers: [
          { pattern: 'my.stop', handler: async ({ arg, halt }) => {
            halt({ reason: arg })
          } },
        ],
      })
      expect(result.type).toBe('halted')
      if (result.type === 'halted') {
        expect(result.value).toEqual({ reason: 'reason' })
      }
    })

    it('should return halted result with null when halt called without value', async () => {
      const result = await dvala.runAsync(`
        perform(@my.abort)
      `, {
        effectHandlers: [
          { pattern: 'my.abort', handler: async ({ halt }) => {
            halt()
          } },
        ],
      })
      expect(result.type).toBe('halted')
      if (result.type === 'halted') {
        expect(result.value).toBeNull()
      }
    })

    it('should halt immediately without running subsequent code', async () => {
      const log: string[] = []
      const result = await dvala.runAsync(`
        do
          let a = perform(@my.log, "before");
          let b = perform(@my.halt);
          let c = perform(@my.log, "after");
          "done"
        end
      `, {
        effectHandlers: [
          { pattern: 'my.log', handler: async ({ arg, resume }) => {
            log.push(arg as string)
            resume(null)
          } },
          { pattern: 'my.halt', handler: async ({ halt }) => {
            halt('stopped')
          } },
        ],
      })
      expect(result.type).toBe('halted')
      expect(log).toEqual(['before'])
    })
  })

  describe('3c: AbortSignal', () => {
    it('should provide an abort signal to the handler', async () => {
      let receivedSignal: AbortSignal | undefined
      const result = await dvala.runAsync(`
        perform(@my.check)
      `, {
        effectHandlers: [
          { pattern: 'my.check', handler: async ({ signal, resume: doResume }) => {
            receivedSignal = signal
            doResume(true)
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: true })
      expect(receivedSignal).toBeDefined()
      expect(receivedSignal!.aborted).toBe(false)
    })
  })

  describe('3d: end-to-end integration', () => {
    it('should run a multi-step effect workflow', async () => {
      const log: string[] = []
      const result = await dvala.runAsync(`
        let llm = @llm.complete;
        let summary = perform(llm, "Summarize this doc");
        let critique = perform(llm, "Critique: " ++ summary);
        { summary: summary, critique: critique }
      `, {
        effectHandlers: [
          { pattern: 'llm.complete', handler: async ({ arg, resume: doResume }) => {
            log.push(arg as string)
            doResume(`[result for: ${arg}]`)
          } },
        ],
      })
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        const value = result.value as Record<string, string>
        expect(value.summary).toBe('[result for: Summarize this doc]')
        expect(value.critique).toBe('[result for: Critique: [result for: Summarize this doc]]')
      }
      expect(log).toEqual([
        'Summarize this doc',
        'Critique: [result for: Summarize this doc]',
      ])
    })

    it('should combine local and host handlers in one program', async () => {
      const result = await dvala.runAsync(`
        do
          let llm = @llm.complete;
          with handler @my.log(arg) -> resume("logged: " ++ arg) end;
          let msg = perform(llm, "prompt");
          perform(@my.log, msg)
        end
      `, {
        effectHandlers: [
          { pattern: 'llm.complete', handler: async ({ arg, resume: doResume }) => {
            doResume(`LLM says: ${arg}`)
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 'logged: LLM says: prompt' })
    })

    it('should handle dvala.error handler around host effect', async () => {
      const result = await dvala.runAsync(`
        do
          with handler @dvala.error(arg) -> resume("recovered: " ++ arg.message) end;
          perform(@my.risky)
        end
      `, {
        effectHandlers: [
          { pattern: 'my.risky', handler: async () => {
            throw new Error('infrastructure failure')
          } },
        ],
      })
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toContain('recovered: infrastructure failure')
      }
    })

    it('should work with bindings and handlers together', async () => {
      const result = await dvala.runAsync(`
        let result = perform(@my.compute, [x, y]);
        result
      `, {
        bindings: { x: 10, y: 32 },
        effectHandlers: [
          { pattern: 'my.compute', handler: async ({ arg, resume: doResume }) => {
            const pair = arg as number[]
            doResume(pair[0]! + pair[1]!)
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 42 })
    })

    it('should handle the LLM example from the API contract', async () => {
      const result = await dvala.runAsync(`
        let llm     = @llm.complete;
        let approve = @com.myco.human.approve;

        let report   = perform(llm, "Generate Q4 report");
        let decision = perform(approve, report);

        if decision.approved then
          perform(llm, "Finalize: " ++ report)
        else
          "Rejected: " ++ decision.reason
        end
      `, {
        effectHandlers: [
          { pattern: 'llm.complete', handler: async ({ arg, resume: doResume }) => {
            doResume(`[LLM: ${arg}]`)
          } },

          { pattern: 'com.myco.human.approve', handler: async ({ resume: doResume }) => {
            doResume({ approved: true, reason: null })
          } },
        ],
      })
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toBe('[LLM: Finalize: [LLM: Generate Q4 report]]')
      }
    })

    it('should handle the approval rejection case', async () => {
      const result = await dvala.runAsync(`
        let llm     = @llm.complete;
        let approve = @com.myco.human.approve;

        let report   = perform(llm, "Generate Q4 report");
        let decision = perform(approve, report);

        if decision.approved then
          perform(llm, "Finalize: " ++ report)
        else
          "Rejected: " ++ decision.reason
        end
      `, {
        effectHandlers: [
          { pattern: 'llm.complete', handler: async ({ arg, resume: doResume }) => {
            doResume(`[LLM: ${arg}]`)
          } },

          { pattern: 'com.myco.human.approve', handler: async ({ resume: doResume }) => {
            doResume({ approved: false, reason: 'Budget exceeded' })
          } },
        ],
      })
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toBe('Rejected: Budget exceeded')
      }
    })
  })
})

describe('phase 4 — Suspension & Resume', () => {
  describe('4a: serialization format', () => {
    it('should produce a valid JSON blob on suspend', async () => {
      const result = await dvala.runAsync(`
        perform(@my.wait, "data")
      `, {
        effectHandlers: [
          { pattern: 'my.wait', handler: async ({ suspend }) => { suspend({ info: 'test' }) } },
        ],
      })
      expect(result.type).toBe('suspended')
      if (result.type === 'suspended') {
        const blobData = result.snapshot.continuation as { version: number; k: unknown[]; contextStacks: unknown[] }
        expect(blobData.version).toBe(2)
        expect(blobData.k).toBeDefined()
        expect(blobData.contextStacks).toBeDefined()
        expect(Array.isArray(blobData.contextStacks)).toBe(true)
      }
    })

    it('should produce a Snapshot with all required fields', async () => {
      const result = await dvala.runAsync(`
        perform(@my.wait, "data")
      `, {
        effectHandlers: [
          { pattern: 'my.wait', handler: async ({ suspend }) => { suspend({ info: 'test' }) } },
        ],
      })
      expect(result.type).toBe('suspended')
      if (result.type === 'suspended') {
        const { snapshot } = result
        expect(snapshot.continuation).toBeDefined()
        expect(typeof snapshot.timestamp).toBe('number')
        expect(snapshot.timestamp).toBeGreaterThan(0)
        expect(typeof snapshot.index).toBe('number')
        expect(snapshot.index).toBe(0)
        expect(typeof snapshot.executionId).toBe('string')
        expect(snapshot.executionId.length).toBeGreaterThan(0)
        expect(snapshot.meta).toEqual({ info: 'test' })
      }
    })

    it('should include meta in the result', async () => {
      const result = await dvala.runAsync(`
        perform(@my.wait)
      `, {
        effectHandlers: [
          { pattern: 'my.wait', handler: async ({ suspend }) => { suspend({ assignedTo: 'team-a' }) } },
        ],
      })
      expect(result.type).toBe('suspended')
      if (result.type === 'suspended') {
        expect(result.snapshot.meta).toEqual({ assignedTo: 'team-a' })
      }
    })

    it('should handle suspend with no meta', async () => {
      const result = await dvala.runAsync(`
        perform(@my.wait)
      `, {
        effectHandlers: [
          { pattern: 'my.wait', handler: async ({ suspend }) => { suspend() } },
        ],
      })
      expect(result.type).toBe('suspended')
      if (result.type === 'suspended') {
        expect(result.snapshot.meta).toBeUndefined()
      }
    })
  })

  describe('4a-object: object-based serialization round-trip', () => {
    it('should produce a plain object continuation (not a string)', async () => {
      const result = await dvala.runAsync(`
        perform(@my.wait)
      `, {
        effectHandlers: [
          { pattern: 'my.wait', handler: async ({ suspend }) => { suspend() } },
        ],
      })
      expect(result.type).toBe('suspended')
      if (result.type === 'suspended') {
        expect(typeof result.snapshot.continuation).toBe('object')
        expect(result.snapshot.continuation).not.toBeNull()
      }
    })

    it('should survive JSON.stringify / JSON.parse round-trip', async () => {
      const r1 = await dvala.runAsync(`
        let x = perform(@my.wait);
        x + 1
      `, {
        effectHandlers: [
          { pattern: 'my.wait', handler: async ({ suspend }) => { suspend() } },
        ],
      })
      expect(r1.type).toBe('suspended')
      if (r1.type !== 'suspended')
        return

      // Simulate host persistence: full snapshot through JSON
      const json = JSON.stringify(r1.snapshot)
      const restored = JSON.parse(json) as typeof r1.snapshot

      const r2 = await resumeContinuation(restored, 41)
      expect(r2).toEqual({ type: 'completed', value: 42 })
    })

    it('should preserve meta through JSON round-trip', async () => {
      const r1 = await dvala.runAsync(`
        perform(@my.wait)
      `, {
        effectHandlers: [
          { pattern: 'my.wait', handler: async ({ suspend }) => { suspend({ key: 'value' }) } },
        ],
      })
      expect(r1.type).toBe('suspended')
      if (r1.type !== 'suspended')
        return

      const json = JSON.stringify(r1.snapshot)
      const restored = JSON.parse(json) as typeof r1.snapshot

      expect(restored.meta).toEqual({ key: 'value' })

      const r2 = await resumeContinuation(restored, 'done')
      expect(r2).toEqual({ type: 'completed', value: 'done' })
    })
  })

  describe('4a-snapshot-state: SnapshotState threading', () => {
    it('should provide empty snapshots array when no snapshots taken', async () => {
      let capturedSnapshots: unknown = null
      await dvala.runAsync(`
        perform(@my.check)
      `, {
        effectHandlers: [
          { pattern: 'my.check', handler: async ({ snapshots, resume: r }) => {
            capturedSnapshots = snapshots
            r(null)
          } },
        ],
      })
      expect(capturedSnapshots).toEqual([])
    })

    it('should provide checkpoint as a function on EffectContext', async () => {
      let checkpointType: string | null = null
      await dvala.runAsync(`
        perform(@my.check)
      `, {
        effectHandlers: [
          { pattern: 'my.check', handler: async ({ checkpoint, resume: r }) => {
            checkpointType = typeof checkpoint
            r(null)
          } },
        ],
      })
      expect(checkpointType).toBe('function')
    })

    it('should provide resumeFrom as a function on EffectContext', async () => {
      let resumeFromType: string | null = null
      await dvala.runAsync(`
        perform(@my.check)
      `, {
        effectHandlers: [
          { pattern: 'my.check', handler: async ({ resumeFrom, resume: r }) => {
            resumeFromType = typeof resumeFrom
            r(null)
          } },
        ],
      })
      expect(resumeFromType).toBe('function')
    })

    it('should create a snapshot when checkpoint is called', async () => {
      let capturedSnapshot: unknown = null
      const result = await dvala.runAsync(`
        let x = perform(@my.save);
        x + 1
      `, {
        effectHandlers: [
          { pattern: 'my.save', handler: async ({ checkpoint, resume: r }) => {
            capturedSnapshot = checkpoint('test', { label: 'test' })
            r(41)
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 42 })
      expect(capturedSnapshot).not.toBeNull()
      const snap = capturedSnapshot as { timestamp: number; index: number; executionId: string; meta: unknown; continuation: unknown }
      expect(snap.index).toBe(0)
      expect(typeof snap.executionId).toBe('string')
      expect(typeof snap.timestamp).toBe('number')
      expect(snap.meta).toEqual({ label: 'test' })
      expect(snap.continuation).toBeDefined()
    })

    it('should accumulate snapshots in order', async () => {
      let capturedSnapshots: readonly unknown[] = []
      const result = await dvala.runAsync(`
        perform(@my.first);
        perform(@my.second)
      `, {
        effectHandlers: [
          { pattern: 'my.first', handler: async ({ checkpoint, resume: r }) => {
            checkpoint('step 1', { step: 1 })
            r(null)
          } },

          { pattern: 'my.second', handler: async ctx => {
            ctx.checkpoint('step 2', { step: 2 })
            capturedSnapshots = ctx.snapshots
            ctx.resume('done')
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 'done' })
      expect(capturedSnapshots).toHaveLength(2)
      const s0 = capturedSnapshots[0] as { index: number; meta: unknown }
      const s1 = capturedSnapshots[1] as { index: number; meta: unknown }
      expect(s0.index).toBe(0)
      expect(s0.meta).toEqual({ step: 1 })
      expect(s1.index).toBe(1)
      expect(s1.meta).toEqual({ step: 2 })
    })

    it('should assign monotonically increasing indices to snapshots', async () => {
      const indices: number[] = []
      await dvala.runAsync(`
        perform(@my.a);
        perform(@my.b);
        perform(@my.c)
      `, {
        effectHandlers: [
          { pattern: 'my.*', handler: async ({ checkpoint, resume: r }) => {
            const snap = checkpoint('cp')
            indices.push((snap as { index: number }).index)
            r(null)
          } },
        ],
      })
      expect(indices).toEqual([0, 1, 2])
    })

    it('should not let host mutation of ctx.snapshots corrupt internal state', async () => {
      let snapshotsAfterMutation: readonly unknown[] = []
      const result = await dvala.runAsync(`
        perform(@dvala.checkpoint, "cp");
        perform(@my.mutate);
        perform(@my.check)
      `, {
        effectHandlers: [
          { pattern: 'my.mutate', handler: async ({ snapshots, resume: r }) => {
            // Host attempts to corrupt internal state by mutating the array
            ;(snapshots as unknown[]).length = 0
            ;(snapshots as unknown[]).push('garbage')
            r(null)
          } },

          { pattern: 'my.check', handler: async ({ snapshots, resume: r }) => {
            snapshotsAfterMutation = snapshots
            r(null)
          } },
        ],
      })
      expect(result.type).toBe('completed')
      // The internal snapshot list should be intact despite the mutation attempt
      expect(snapshotsAfterMutation).toHaveLength(1)
      expect(snapshotsAfterMutation[0]).toHaveProperty('index', 0)
      expect(snapshotsAfterMutation[0]).toHaveProperty('continuation')
    })
  })

  describe('4a-checkpoint: dvala.checkpoint effect', () => {
    it('should resume with null when no handler intercepts', async () => {
      const result = await dvala.runAsync(`
        let x = perform(@dvala.checkpoint, "cp");
        x
      `)
      expect(result).toMatchObject({ type: 'completed', value: null })
    })

    it('should always capture a snapshot even when no handler intercepts', async () => {
      let capturedSnapshots: readonly unknown[] = []
      await dvala.runAsync(`
        perform(@dvala.checkpoint, "cp");
        perform(@my.check)
      `, {
        effectHandlers: [
          { pattern: 'my.check', handler: async ({ snapshots, resume: r }) => {
            capturedSnapshots = snapshots
            r(null)
          } },
        ],
      })
      expect(capturedSnapshots).toHaveLength(1)
    })

    it('should always capture a snapshot even when a host handler intercepts', async () => {
      let capturedSnapshots: readonly unknown[] = []
      await dvala.runAsync(`
        perform(@dvala.checkpoint, "cp");
        perform(@my.check)
      `, {
        effectHandlers: [
          { pattern: 'dvala.checkpoint', handler: async ({ snapshots, resume: r }) => {
            capturedSnapshots = snapshots
            r('intercepted')
          } },

          { pattern: 'my.check', handler: async ({ resume: r }) => { r(null) } },
        ],
      })
      // The snapshot must be captured before the handler sees it
      expect(capturedSnapshots).toHaveLength(1)
    })

    it('should allow host handler to override resume value', async () => {
      const result = await dvala.runAsync(`
        perform(@dvala.checkpoint, "cp")
      `, {
        effectHandlers: [
          { pattern: 'dvala.checkpoint', handler: async ({ resume: r }) => { r(42) } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 42 })
    })

    it('should always capture a snapshot even when a local handler intercepts', async () => {
      let capturedSnapshots: readonly unknown[] = []
      const result = await dvala.runAsync(`
        let x = do
          with handler @dvala.checkpoint(arg) -> resume("from-local") end;
          perform(@dvala.checkpoint, "cp")
        end;
        perform(@my.check);
        x
      `, {
        effectHandlers: [
          { pattern: 'my.check', handler: async ({ snapshots, resume: r }) => {
            capturedSnapshots = snapshots
            r(null)
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 'from-local' })
      expect(capturedSnapshots).toHaveLength(1)
    })

    it('should capture snapshot even with a dvala.* wildcard handler', async () => {
      let capturedSnapshots: readonly unknown[] = []
      await dvala.runAsync(`
        perform(@dvala.checkpoint, "cp");
        perform(@my.check)
      `, {
        effectHandlers: [
          { pattern: 'dvala.*', handler: async ({ snapshots, resume: r }) => {
            capturedSnapshots = snapshots
            r('wildcard')
          } },

          { pattern: 'my.check', handler: async ({ snapshots, resume: r }) => {
            capturedSnapshots = snapshots
            r(null)
          } },
        ],
      })
      expect(capturedSnapshots).toHaveLength(1)
    })

    it('should capture checkpoint message in snapshot', async () => {
      let capturedSnapshots: readonly unknown[] = []
      await dvala.runAsync(`
        perform(@dvala.checkpoint, "analysis");
        perform(@my.check)
      `, {
        effectHandlers: [
          { pattern: 'my.check', handler: async ({ snapshots, resume: r }) => {
            capturedSnapshots = snapshots
            r(null)
          } },
        ],
      })
      expect(capturedSnapshots).toHaveLength(1)
      expect((capturedSnapshots[0] as { message: string }).message).toBe('analysis')
    })

    it('should have no meta when called with only message', async () => {
      let capturedSnapshots: readonly unknown[] = []
      await dvala.runAsync(`
        perform(@dvala.checkpoint, "cp");
        perform(@my.check)
      `, {
        effectHandlers: [
          { pattern: 'my.check', handler: async ({ snapshots, resume: r }) => {
            capturedSnapshots = snapshots
            r(null)
          } },
        ],
      })
      expect(capturedSnapshots).toHaveLength(1)
      expect((capturedSnapshots[0] as { meta?: unknown }).meta).toBeUndefined()
    })

    it('should accumulate multiple checkpoint snapshots in order', async () => {
      let capturedSnapshots: readonly unknown[] = []
      await dvala.runAsync(`
        perform(@dvala.checkpoint, "step 1");
        perform(@dvala.checkpoint, "step 2");
        perform(@dvala.checkpoint, "step 3");
        perform(@my.check)
      `, {
        effectHandlers: [
          { pattern: 'my.check', handler: async ({ snapshots, resume: r }) => {
            capturedSnapshots = snapshots
            r(null)
          } },
        ],
      })
      expect(capturedSnapshots).toHaveLength(3)
      expect((capturedSnapshots[0] as { index: number; message: string }).index).toBe(0)
      expect((capturedSnapshots[0] as { message: string }).message).toBe('step 1')
      expect((capturedSnapshots[1] as { index: number }).index).toBe(1)
      expect((capturedSnapshots[1] as { message: string }).message).toBe('step 2')
      expect((capturedSnapshots[2] as { index: number }).index).toBe(2)
      expect((capturedSnapshots[2] as { message: string }).message).toBe('step 3')
    })

    it('should work alongside ctx.checkpoint in host handler', async () => {
      let capturedSnapshots: readonly unknown[] = []
      await dvala.runAsync(`
        perform(@dvala.checkpoint, "from program");
        perform(@my.save);
        perform(@my.check)
      `, {
        effectHandlers: [
          { pattern: 'my.save', handler: async ({ checkpoint, resume: r }) => {
            checkpoint('from host', { from: 'host' })
            r(null)
          } },

          { pattern: 'my.check', handler: async ({ snapshots, resume: r }) => {
            capturedSnapshots = snapshots
            r(null)
          } },
        ],
      })
      expect(capturedSnapshots).toHaveLength(2)
      expect((capturedSnapshots[0] as { message: string }).message).toBe('from program')
      expect((capturedSnapshots[1] as { meta: unknown }).meta).toEqual({ from: 'host' })
    })
  })

  describe('5: resumeFrom on EffectContext', () => {
    it('should resume execution from a previous checkpoint', async () => {
      let callCount = 0
      const result = await dvala.runAsync(`
        let x = 10;
        perform(@dvala.checkpoint, "cp");
        let y = perform(@my.action);
        x + y
      `, {
        effectHandlers: [
          { pattern: 'my.action', handler: async ({ resume: r, snapshots, resumeFrom }) => {
            callCount++
            if (callCount === 1) {
              // First call: resume from the checkpoint
              resumeFrom(snapshots[0]!, 0)
            } else {
              // Second call: resume normally
              r(5)
            }
          } },
        ],
      })
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toBe(15)
      }
      expect(callCount).toBe(2)
    })

    it('should resume from checkpoint and produce correct value', async () => {
      let callCount = 0
      const result = await dvala.runAsync(`
        let x = 10;
        perform(@dvala.checkpoint, "cp");
        let y = perform(@my.get_value);
        x + y
      `, {
        effectHandlers: [
          { pattern: 'my.get_value', handler: async ({ resume: r, snapshots, resumeFrom }) => {
            callCount++
            if (callCount === 1) {
              // First call: resume from checkpoint to replay
              resumeFrom(snapshots[0]!, 0)
            } else {
              // Second call: resume normally
              r(32)
            }
          } },
        ],
      })
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toBe(42)
      }
      expect(callCount).toBe(2)
    })

    it('should discard snapshots after the target', async () => {
      let capturedSnapshots: readonly unknown[] = []
      let callCount = 0
      await dvala.runAsync(`
        perform(@dvala.checkpoint, "step 1");
        perform(@dvala.checkpoint, "step 2");
        perform(@dvala.checkpoint, "step 3");
        perform(@my.action)
      `, {
        effectHandlers: [
          { pattern: 'my.action', handler: async ({ snapshots, resumeFrom, resume: r }) => {
            callCount++
            if (callCount === 1) {
              // Resume from first checkpoint — should discard checkpoints 2 and 3
              resumeFrom(snapshots[0]!, null)
            } else {
              // Second call: capture remaining snapshots
              capturedSnapshots = [...snapshots]
              r(null)
            }
          } },
        ],
      })
      // After resumeFrom(snapshots[0]), snapshots with index > 0 are discarded
      // Re-execution creates new checkpoints at steps 2 and 3 (indices 3 and 4 since nextSnapshotIndex is NOT reset)
      expect(capturedSnapshots).toHaveLength(3) // original index 0 + two new ones
      expect((capturedSnapshots[0] as { index: number }).index).toBe(0)
      expect((capturedSnapshots[1] as { index: number }).index).toBe(3)
      expect((capturedSnapshots[2] as { index: number }).index).toBe(4)
    })

    it('should resume from the most recent snapshot', async () => {
      let callCount = 0
      const result = await dvala.runAsync(`
        perform(@dvala.checkpoint, "step 1");
        perform(@dvala.checkpoint, "step 2");
        let x = perform(@my.get_value);
        x
      `, {
        effectHandlers: [
          { pattern: 'my.get_value', handler: async ({ resume: r, snapshots, resumeFrom }) => {
            callCount++
            if (callCount === 1) {
              // Resume from the most recent snapshot (step 2)
              const lastSnapshot = snapshots[snapshots.length - 1]!
              resumeFrom(lastSnapshot, 0)
            } else {
              r(99)
            }
          } },
        ],
      })
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toBe(99)
      }
    })

    it('should throw error for invalid snapshot', async () => {
      const result = await dvala.runAsync(`
        perform(@my.action)
      `, {
        effectHandlers: [
          { pattern: 'my.action', handler: async ({ resumeFrom }) => {
            const fakeSnapshot = {
              id: 'fake-id',
              continuation: {},
              timestamp: Date.now(),
              index: 999,
              executionId: 'fake-run-id',
              message: 'fake',
            }
            resumeFrom(fakeSnapshot, null)
          } },
        ],
      })
      expect(result.type).toBe('error')
    })

    it('should not allow resumeFrom and resume on same context', async () => {
      const result = await dvala.runAsync(`
        perform(@dvala.checkpoint, "cp");
        perform(@my.action)
      `, {
        effectHandlers: [
          { pattern: 'my.action', handler: async ({ resume: r, snapshots, resumeFrom }) => {
            r(42)
            // Second operation should throw (assertNotSettled)
            try {
              resumeFrom(snapshots[0]!, 0)
            } catch {
              // Expected — already settled
            }
          } },
        ],
      })
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toBe(42)
      }
    })

    it('should report already-settled error before invalid-snapshot error in resumeFrom', async () => {
      // If resume() was already called, then resumeFrom() with a bad snapshot
      // should throw "already calling another operation", NOT "Invalid snapshot".
      // This verifies assertNotSettled runs before snapshot validation.
      let caughtMessage = ''
      const result = await dvala.runAsync(`
        perform(@dvala.checkpoint, "cp");
        perform(@my.action)
      `, {
        effectHandlers: [
          { pattern: 'my.action', handler: async ({ resume: r, resumeFrom }) => {
            r(42)
            try {
              const fakeSnapshot = { id: 'fake-id', continuation: {}, timestamp: 0, index: 999, executionId: 'bogus', message: 'fake' }
              resumeFrom(fakeSnapshot, 0)
            } catch (e: unknown) {
              caughtMessage = (e as Error).message
            }
          } },
        ],
      })
      expect(result.type).toBe('completed')
      expect(caughtMessage).toContain('already calling another operation')
      expect(caughtMessage).not.toContain('Invalid snapshot')
    })

    it('should preserve nextSnapshotIndex across resumeFrom', async () => {
      let capturedSnapshots: readonly unknown[] = []
      let callCount = 0
      await dvala.runAsync(`
        perform(@dvala.checkpoint, "step 1");
        perform(@dvala.checkpoint, "step 2");
        perform(@my.action)
      `, {
        effectHandlers: [
          { pattern: 'my.action', handler: async ({ snapshots, resumeFrom, resume: r }) => {
            callCount++
            if (callCount === 1) {
              // snapshots[0] has index 0, snapshots[1] has index 1
              // Resume from first checkpoint
              resumeFrom(snapshots[0]!, null)
            } else {
              capturedSnapshots = [...snapshots]
              r(null)
            }
          } },
        ],
      })
      // After resumeFrom from index 0, snapshot with index 1 is discarded
      // New checkpoint at step 2 gets index 2 (not 1) — nextSnapshotIndex is preserved
      expect((capturedSnapshots[0] as { index: number }).index).toBe(0)
      expect((capturedSnapshots[1] as { index: number }).index).toBe(2)
    })

    it('should preserve host bindings after resumeFrom', async () => {
      let callCount = 0
      const result = await dvala.runAsync(`
        perform(@dvala.checkpoint, "cp");
        let y = perform(@my.action);
        x + y
      `, {
        bindings: { x: 100 },
        effectHandlers: [
          { pattern: 'my.action', handler: async ({ resume: r, snapshots, resumeFrom }) => {
            callCount++
            if (callCount === 1) {
              // First call: rollback to checkpoint
              resumeFrom(snapshots[0]!, 0)
            } else {
              // Second call: resume normally
              r(5)
            }
          } },
        ],
      })
      // After resumeFrom, the host binding `x` should still be accessible
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toBe(105)
      }
      expect(callCount).toBe(2)
    })

    it('should preserve modules after resumeFrom', async () => {
      let callCount = 0
      const dvalaWithMath = createDvala({ modules: [mathUtilsModule] })
      const result = await dvalaWithMath.runAsync(`
        let m = import("math");
        perform(@dvala.checkpoint, "cp");
        let y = perform(@my.action);
        m.ln(y)
      `, {
        effectHandlers: [
          { pattern: 'my.action', handler: async ({ resume: r, snapshots, resumeFrom }) => {
            callCount++
            if (callCount === 1) {
              // snapshots[0] = 'Program start', snapshots[1] = the explicit 'cp' checkpoint (after m was imported)
              resumeFrom(snapshots[1]!, 0)
            } else {
              r(1)
            }
          } },
        ],
      })
      // After resumeFrom, the math module (providing `ln`) should still work
      if (result.type === 'error') {
        throw new Error(`Module test error: ${result.error.message}`)
      }
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toBe(0) // ln(1) = 0
      }
      expect(callCount).toBe(2)
    })

    it('should support checkpoint+resume pattern for crash recovery', async () => {
      // Validates the corrected API contract example: checkpoint() + resume()
      // (not suspend() + resume() which would throw "already settled")
      const checkpoints: unknown[] = []
      const result = await dvala.runAsync(`
        let llm = @llm.complete;
        let a = perform(llm, "step1");
        let b = perform(llm, "step2");
        a ++ " " ++ b
      `, {
        effectHandlers: [
          { pattern: 'llm.complete', handler: async ({ arg, resume: r, checkpoint }) => {
            const snap = checkpoint('prompt', { prompt: arg })
            checkpoints.push(snap)
            r(`result-of-${arg}`)
          } },
        ],
      })
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toBe('result-of-step1 result-of-step2')
      }
      expect(checkpoints).toHaveLength(2)
    })
  })

  describe('6: snapshots in suspension blobs', () => {
    it('should preserve snapshot history across suspend and resume', async () => {
      const handlers: Handlers = [
        { pattern: 'my.step', handler: async ({ suspend }) => { suspend() } },
      ]

      // Take a checkpoint, then suspend
      const r1 = await dvala.runAsync(`
        perform(@dvala.checkpoint, "step 1");
        let x = perform(@my.step);
        x
      `, { effectHandlers: handlers })
      expect(r1.type).toBe('suspended')
      if (r1.type !== 'suspended')
        return

      // After resume, ctx.snapshots should contain the checkpoint from before suspension
      const r2 = await resumeContinuation(r1.snapshot, 42)
      // The resumed program just returns x=42
      expect(r2).toEqual({ type: 'completed', value: 42 })
    })

    it('should make pre-suspension snapshots available via ctx.snapshots after resume', async () => {
      let capturedSnapshots: readonly unknown[] = []
      const handlers: Handlers = [
        { pattern: 'my.step', handler: async ({ suspend }) => { suspend() } },
      ]

      // Take two checkpoints, then suspend
      const r1 = await dvala.runAsync(`
        perform(@dvala.checkpoint, "step 1");
        perform(@dvala.checkpoint, "step 2");
        let x = perform(@my.step);
        perform(@my.check);
        x
      `, { effectHandlers: handlers })
      expect(r1.type).toBe('suspended')
      if (r1.type !== 'suspended')
        return

      const r2 = await resumeContinuation(r1.snapshot, 'hello', {
        handlers: [
          { pattern: 'my.check', handler: async ({ snapshots, resume: r }) => {
            capturedSnapshots = [...snapshots]
            r(null)
          } },
        ],
      })
      expect(r2).toEqual({ type: 'completed', value: 'hello' })
      // Two pre-suspension checkpoints should be preserved
      expect(capturedSnapshots).toHaveLength(2)
      expect((capturedSnapshots[0] as { message: string }).message).toBe('step 1')
      expect((capturedSnapshots[1] as { message: string }).message).toBe('step 2')
    })

    it('should append new snapshots after resume with correct indices', async () => {
      let capturedSnapshots: readonly unknown[] = []
      const handlers: Handlers = [
        { pattern: 'my.step', handler: async ({ suspend }) => { suspend() } },
      ]

      // Take one checkpoint (index 0), then suspend
      const r1 = await dvala.runAsync(`
        perform(@dvala.checkpoint, "step 1");
        let x = perform(@my.step);
        perform(@dvala.checkpoint, "after resume");
        perform(@my.check);
        x
      `, { effectHandlers: handlers })
      expect(r1.type).toBe('suspended')
      if (r1.type !== 'suspended')
        return

      const r2 = await resumeContinuation(r1.snapshot, 99, {
        handlers: [
          { pattern: 'my.check', handler: async ({ snapshots, resume: r }) => {
            capturedSnapshots = [...snapshots]
            r(null)
          } },
        ],
      })
      expect(r2).toEqual({ type: 'completed', value: 99 })
      // Pre-suspension checkpoint (index 0) + the suspension itself consumed an index
      // + new checkpoint after resume
      expect(capturedSnapshots).toHaveLength(2)
      expect((capturedSnapshots[0] as { index: number; message: string }).message).toBe('step 1')
      const newSnap = capturedSnapshots[1] as { index: number; message: string }
      expect(newSnap.message).toBe('after resume')
      // New snapshot index should be > the suspension index
      expect(newSnap.index).toBeGreaterThan((capturedSnapshots[0] as { index: number }).index)
    })

    it('should support resumeFrom with pre-suspension snapshots after resume', async () => {
      let callCount = 0
      const handlers: Handlers = [
        { pattern: 'my.step', handler: async ({ suspend }) => { suspend() } },
      ]

      // Take a checkpoint, then suspend
      const r1 = await dvala.runAsync(`
        perform(@dvala.checkpoint, "step 1");
        let x = perform(@my.step);
        let y = perform(@my.action);
        x + y
      `, { effectHandlers: handlers })
      expect(r1.type).toBe('suspended')
      if (r1.type !== 'suspended')
        return

      const r2 = await resumeContinuation(r1.snapshot, 10, {
        handlers: [
          { pattern: 'my.action', handler: async ({ resume: r, snapshots, resumeFrom }) => {
            callCount++
            if (callCount === 1) {
              // Resume from the pre-suspension checkpoint
              resumeFrom(snapshots[0]!, 0)
            } else {
              r(32)
            }
          } },

          { pattern: 'my.step', handler: async ({ resume: r }) => { r(10) } },
        ],
      })
      expect(r2.type).toBe('completed')
      if (r2.type === 'completed') {
        expect(r2.value).toBe(42) // x=10 + y=32
      }
    })

    it('should survive JSON round-trip for suspension blob with snapshots', async () => {
      const handlers: Handlers = [
        { pattern: 'my.step', handler: async ({ suspend }) => { suspend() } },
      ]

      const r1 = await dvala.runAsync(`
        perform(@dvala.checkpoint, "step 1");
        let x = perform(@my.step);
        x + 1
      `, { effectHandlers: handlers })
      expect(r1.type).toBe('suspended')
      if (r1.type !== 'suspended')
        return

      // Simulate persistence via JSON round-trip
      const json = JSON.stringify(r1.snapshot)
      const restored = JSON.parse(json) as typeof r1.snapshot

      const r2 = await resumeContinuation(restored, 41)
      expect(r2).toEqual({ type: 'completed', value: 42 })
    })
  })

  describe('8: maxSnapshots configuration', () => {
    it('should retain unlimited snapshots by default', async () => {
      let capturedSnapshots: readonly unknown[] = []
      await dvala.runAsync(`
        perform(@dvala.checkpoint, "step 1");
        perform(@dvala.checkpoint, "step 2");
        perform(@dvala.checkpoint, "step 3");
        perform(@dvala.checkpoint, "step 4");
        perform(@dvala.checkpoint, "step 5");
        perform(@my.check)
      `, {
        effectHandlers: [
          { pattern: 'my.check', handler: async ({ snapshots, resume: r }) => {
            capturedSnapshots = [...snapshots]
            r(null)
          } },
        ],
      })
      expect(capturedSnapshots).toHaveLength(5)
    })

    it('should evict oldest snapshot when maxSnapshots is exceeded', async () => {
      let capturedSnapshots: readonly unknown[] = []
      await dvala.runAsync(`
        perform(@dvala.checkpoint, "step 1");
        perform(@dvala.checkpoint, "step 2");
        perform(@dvala.checkpoint, "step 3");
        perform(@dvala.checkpoint, "step 4");
        perform(@my.check)
      `, {
        maxSnapshots: 3,
        effectHandlers: [
          { pattern: 'my.check', handler: async ({ snapshots, resume: r }) => {
            capturedSnapshots = [...snapshots]
            r(null)
          } },
        ],
      })
      // 4 checkpoints taken, limit is 3 — oldest (step 1) should be evicted
      expect(capturedSnapshots).toHaveLength(3)
      expect((capturedSnapshots[0] as { message: string }).message).toBe('step 2')
      expect((capturedSnapshots[1] as { message: string }).message).toBe('step 3')
      expect((capturedSnapshots[2] as { message: string }).message).toBe('step 4')
    })

    it('should evict from host checkpoint when maxSnapshots is exceeded', async () => {
      let capturedSnapshots: readonly unknown[] = []
      await dvala.runAsync(`
        perform(@dvala.checkpoint, "step 1");
        perform(@dvala.checkpoint, "step 2");
        perform(@my.save);
        perform(@my.check)
      `, {
        maxSnapshots: 2,
        effectHandlers: [
          { pattern: 'my.save', handler: async ({ checkpoint, resume: r }) => {
            checkpoint('host', { step: 'host' })
            r(null)
          } },

          { pattern: 'my.check', handler: async ({ snapshots, resume: r }) => {
            capturedSnapshots = [...snapshots]
            r(null)
          } },
        ],
      })
      // 3 total snapshots, limit 2 — oldest (step 1) evicted
      expect(capturedSnapshots).toHaveLength(2)
      expect((capturedSnapshots[0] as { message: string }).message).toBe('step 2')
      expect((capturedSnapshots[1] as { message: string }).message).toBe('host')
    })

    it('should fail gracefully when resumeFrom targets an evicted snapshot', async () => {
      let callCount = 0
      const result = await dvala.runAsync(`
        perform(@dvala.checkpoint, "step 1");
        perform(@dvala.checkpoint, "step 2");
        perform(@dvala.checkpoint, "step 3");
        perform(@my.action)
      `, {
        maxSnapshots: 2,
        effectHandlers: [
          { pattern: 'my.action', handler: async ({ resume: r, resumeFrom }) => {
            callCount++
            if (callCount === 1) {
              // Try to resumeFrom a snapshot that was evicted (step 1, index 0)
              const evictedSnapshot = {
                id: 'evicted-id',
                continuation: {},
                timestamp: Date.now(),
                index: 0,
                executionId: 'will-not-match',
                message: 'evicted',
              }
              try {
                resumeFrom(evictedSnapshot, null)
              } catch {
                // Expected — snapshot not found. Resume normally.
                r('recovered')
              }
            } else {
              r('done')
            }
          } },
        ],
      })
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toBe('recovered')
      }
    })

    it('should work with maxSnapshots: 1', async () => {
      let capturedSnapshots: readonly unknown[] = []
      await dvala.runAsync(`
        perform(@dvala.checkpoint, "step 1");
        perform(@dvala.checkpoint, "step 2");
        perform(@dvala.checkpoint, "step 3");
        perform(@my.check)
      `, {
        maxSnapshots: 1,
        effectHandlers: [
          { pattern: 'my.check', handler: async ({ snapshots, resume: r }) => {
            capturedSnapshots = [...snapshots]
            r(null)
          } },
        ],
      })
      expect(capturedSnapshots).toHaveLength(1)
      expect((capturedSnapshots[0] as { message: string }).message).toBe('step 3')
    })
  })

  describe('9: auto-checkpoint (enabled by default)', () => {
    it('should capture a snapshot at program start and after each non-checkpoint effect', async () => {
      let capturedSnapshots: readonly unknown[] = []
      await dvala.runAsync(`
        perform(@my.a);
        perform(@my.b);
        perform(@my.check)
      `, {
        disableAutoCheckpoint: false, // explicitly enable (dvala instance has it disabled for other tests)
        effectHandlers: [
          { pattern: 'my.a', handler: async ({ resume: r }) => { r(null) } },
          { pattern: 'my.b', handler: async ({ resume: r }) => { r(null) } },
          { pattern: 'my.check', handler: async ({ snapshots, resume: r }) => {
            capturedSnapshots = [...snapshots]
            r(null)
          } },
        ],
      })
      // program start + after my.a + after my.b = 3 snapshots when my.check handler runs
      expect(capturedSnapshots).toHaveLength(3)
      expect((capturedSnapshots[0] as { message: string }).message).toBe('Program start')
      expect((capturedSnapshots[1] as { message: string }).message).toBe('After my.a')
      expect((capturedSnapshots[2] as { message: string }).message).toBe('After my.b')
    })

    it('should not capture auto-checkpoints when disableAutoCheckpoint is true', async () => {
      let capturedSnapshots: readonly unknown[] = []
      await dvala.runAsync(`
        perform(@my.a);
        perform(@my.check)
      `, {
        disableAutoCheckpoint: true,
        effectHandlers: [
          { pattern: 'my.a', handler: async ({ resume: r }) => { r(null) } },
          { pattern: 'my.check', handler: async ({ snapshots, resume: r }) => {
            capturedSnapshots = [...snapshots]
            r(null)
          } },
        ],
      })
      expect(capturedSnapshots).toHaveLength(0)
    })

    it('should not dispatch dvala.checkpoint effect for auto-checkpoints', async () => {
      const checkpointMessages: string[] = []
      await dvala.runAsync(`
        perform(@my.action);
        42
      `, {
        disableAutoCheckpoint: false,
        effectHandlers: [
          { pattern: 'dvala.checkpoint', handler: async ({ arg, resume: r }) => {
            checkpointMessages.push(arg as string)
            r(null)
          } },
          { pattern: 'my.action', handler: async ({ resume: r }) => { r(null) } },
        ],
      })
      // Auto-checkpoints are captured silently — dvala.checkpoint is NOT dispatched
      expect(checkpointMessages).toEqual([])
    })

    it('should not auto-checkpoint for explicit dvala.checkpoint effects', async () => {
      const checkpointMessages: string[] = []
      await dvala.runAsync(`
        perform(@dvala.checkpoint, "manual");
        perform(@my.action)
      `, {
        disableAutoCheckpoint: false,
        effectHandlers: [
          { pattern: 'dvala.checkpoint', handler: async ({ arg, resume: r }) => {
            checkpointMessages.push(arg as string)
            r(null)
          } },
          { pattern: 'my.action', handler: async ({ resume: r }) => { r(null) } },
        ],
      })
      // Only the explicit dvala.checkpoint is dispatched — auto-checkpoints are silent
      expect(checkpointMessages).toEqual(['manual'])
    })

    it('should work with maxSnapshots', async () => {
      let capturedSnapshots: readonly unknown[] = []
      await dvala.runAsync(`
        perform(@my.a);
        perform(@my.b);
        perform(@my.c);
        perform(@my.check)
      `, {
        disableAutoCheckpoint: false,
        maxSnapshots: 2,
        effectHandlers: [
          { pattern: 'my.a', handler: async ({ resume: r }) => { r(null) } },
          { pattern: 'my.b', handler: async ({ resume: r }) => { r(null) } },
          { pattern: 'my.c', handler: async ({ resume: r }) => { r(null) } },
          { pattern: 'my.check', handler: async ({ snapshots, resume: r }) => {
            capturedSnapshots = [...snapshots]
            r(null)
          } },
        ],
      })
      // program start + after my.a + after my.b + after my.c = 4 snapshots total, limit 2 — only last 2 retained
      expect(capturedSnapshots).toHaveLength(2)
      expect((capturedSnapshots[0] as { message: string }).message).toBe('After my.b')
      expect((capturedSnapshots[1] as { message: string }).message).toBe('After my.c')
    })

    it('should complete normally when dvala.checkpoint handler is registered but auto-checkpoints are silent', async () => {
      // Auto-checkpoints no longer dispatch dvala.checkpoint — they are captured silently.
      // A dvala.checkpoint handler cannot intercept auto-checkpoints.
      const checkpointCalled: boolean[] = []
      const result = await dvala.runAsync(`
        perform(@my.action);
        42
      `, {
        disableAutoCheckpoint: false,
        effectHandlers: [
          { pattern: 'dvala.checkpoint', handler: async ({ resume: r }) => {
            checkpointCalled.push(true)
            r(null)
          } },
          { pattern: 'my.action', handler: async ({ resume: r }) => { r(null) } },
        ],
      })
      expect(result.type).toBe('completed')
      expect(checkpointCalled).toHaveLength(0)
    })

    it('should resume correctly after auto-checkpoint suspend', async () => {
      const r1 = await dvala.runAsync(`
        let x = perform(@my.action);
        x * 2
      `, {
        disableAutoCheckpoint: false,
        effectHandlers: [
          { pattern: 'dvala.checkpoint', handler: async ({ resume: r }) => { r(null) } },
          { pattern: 'my.action', handler: async ({ suspend }) => { suspend() } },
        ],
      })
      expect(r1.type).toBe('suspended')
      if (r1.type !== 'suspended') return

      const r2 = await resumeContinuation(r1.snapshot, 21, { disableAutoCheckpoint: false })
      expect(r2).toMatchObject({ type: 'completed', value: 42 })
    })
  })

  describe('10: terminal snapshots', () => {
    it('should include terminal snapshot in completed result when time travel enabled', async () => {
      const result = await dvala.runAsync(`
        perform(@my.action);
        42
      `, {
        disableAutoCheckpoint: false,
        effectHandlers: [
          { pattern: 'dvala.checkpoint', handler: async ({ resume: r }) => { r(null) } },
          { pattern: 'my.action', handler: async ({ resume: r }) => { r(null) } },
        ],
      })
      expect(result.type).toBe('completed')
      if (result.type !== 'completed') return

      expect(result.snapshot).toBeDefined()
      expect(result.snapshot?.message).toBe('Run completed successfully')
      expect(result.snapshot?.continuation).toBeDefined()
      // Terminal snapshots have empty continuation (k: [])
      const continuation = result.snapshot?.continuation as { k: unknown[] }
      expect(continuation.k).toEqual([])
      // Should contain the checkpoint history
      const snapshots = (result.snapshot?.continuation as { snapshots?: unknown[] })?.snapshots
      expect(snapshots).toBeDefined()
      expect(snapshots?.length).toBeGreaterThan(0)
    })

    it('should NOT include terminal snapshot when time travel disabled', async () => {
      const result = await dvala.runAsync(`
        perform(@my.action);
        42
      `, {
        disableAutoCheckpoint: true,
        effectHandlers: [
          { pattern: 'my.action', handler: async ({ resume: r }) => { r(null) } },
        ],
      })
      expect(result.type).toBe('completed')
      if (result.type !== 'completed') return

      expect(result.snapshot).toBeUndefined()
    })

    it('should include terminal snapshot even when no checkpoints collected', async () => {
      // Pure program with no effects - now includes terminal snapshot with result
      const result = await dvala.runAsync('1 + 2 + 3', {
        disableAutoCheckpoint: false,
      })
      expect(result.type).toBe('completed')
      if (result.type !== 'completed') return

      // Terminal snapshot is now always included with result metadata
      expect(result.snapshot).toBeDefined()
      expect(result.snapshot?.message).toBe('Run completed successfully')
      const meta = result.snapshot?.meta as { result?: number } | undefined
      expect(meta?.result).toBe(6)
    })

    it('should include terminal snapshot in error result when time travel enabled', async () => {
      const result = await dvala.runAsync(`
        perform(@my.action);
        throw("boom")
      `, {
        disableAutoCheckpoint: false,
        effectHandlers: [
          { pattern: 'dvala.checkpoint', handler: async ({ resume: r }) => { r(null) } },
          { pattern: 'my.action', handler: async ({ resume: r }) => { r(null) } },
        ],
      })
      expect(result.type).toBe('error')
      if (result.type !== 'error') return

      expect(result.snapshot).toBeDefined()
      expect(result.snapshot?.message).toBe('Run failed with error')
    })
  })

  describe('4b: resume() API', () => {
    it('should resume a simple suspended program', async () => {
      const r1 = await dvala.runAsync(`
        let k = 2;
        let x = perform(@my.wait);
        x * k
      `, {
        effectHandlers: [
          { pattern: 'my.wait', handler: async ({ suspend }) => { suspend() } },
        ],
      })
      expect(r1.type).toBe('suspended')
      if (r1.type !== 'suspended')
        return

      const r2 = await resumeContinuation(r1.snapshot, 21)
      expect(r2).toEqual({ type: 'completed', value: 42 })
    })

    it('should resume with a string value', async () => {
      const r1 = await dvala.runAsync(`
        let name = perform(@my.ask, "What is your name?");
        "Hello, " ++ name ++ "!"
      `, {
        effectHandlers: [
          { pattern: 'my.ask', handler: async ({ suspend, arg }) => { suspend({ prompt: arg }) } },
        ],
      })
      expect(r1.type).toBe('suspended')
      if (r1.type !== 'suspended')
        return

      const r2 = await resumeContinuation(r1.snapshot, 'Alice')
      expect(r2).toEqual({ type: 'completed', value: 'Hello, Alice!' })
    })

    it('should resume with an object value', async () => {
      const r1 = await dvala.runAsync(`
        let decision = perform(@my.approve, "report");
        if decision.approved then
          "Approved!"
        else
          "Rejected: " ++ decision.reason
        end
      `, {
        effectHandlers: [
          { pattern: 'my.approve', handler: async ({ suspend, arg }) => { suspend({ doc: arg }) } },
        ],
      })
      expect(r1.type).toBe('suspended')
      if (r1.type !== 'suspended')
        return

      const r2 = await resumeContinuation(r1.snapshot, PersistentMap.fromRecord({ approved: false, reason: 'Budget exceeded' }))
      expect(r2).toEqual({ type: 'completed', value: 'Rejected: Budget exceeded' })
    })

    it('should resume with null value', async () => {
      const r1 = await dvala.runAsync(`
        let x = perform(@my.wait);
        isNull(x)
      `, {
        effectHandlers: [
          { pattern: 'my.wait', handler: async ({ suspend }) => { suspend() } },
        ],
      })
      expect(r1.type).toBe('suspended')
      if (r1.type !== 'suspended')
        return

      const r2 = await resumeContinuation(r1.snapshot, null)
      expect(r2).toEqual({ type: 'completed', value: true })
    })

    it('should preserve variables defined before suspend', async () => {
      const r1 = await dvala.runAsync(`
        let a = 10;
        let b = 20;
        let c = perform(@my.wait);
        a + b + c
      `, {
        effectHandlers: [
          { pattern: 'my.wait', handler: async ({ suspend }) => { suspend() } },
        ],
      })
      expect(r1.type).toBe('suspended')
      if (r1.type !== 'suspended')
        return

      const r2 = await resumeContinuation(r1.snapshot, 12)
      expect(r2).toEqual({ type: 'completed', value: 42 })
    })

    it('should preserve closures across suspend/resume', async () => {
      const r1 = await dvala.runAsync(`
        let multiplier = 3;
        let scale = (x) -> x * multiplier;
        let value = perform(@my.wait);
        scale(value)
      `, {
        effectHandlers: [
          { pattern: 'my.wait', handler: async ({ suspend }) => { suspend() } },
        ],
      })
      expect(r1.type).toBe('suspended')
      if (r1.type !== 'suspended')
        return

      const r2 = await resumeContinuation(r1.snapshot, 14)
      expect(r2).toEqual({ type: 'completed', value: 42 })
    })

    it('should preserve comp functions across suspend/resume', async () => {
      const r1 = await dvala.runAsync(`
        let f = comp(inc, (x) -> x * 2);
        let value = perform(@my.wait);
        f(value)
      `, {
        effectHandlers: [
          { pattern: 'my.wait', handler: async ({ suspend }) => { suspend() } },
        ],
      })
      expect(r1.type).toBe('suspended')
      if (r1.type !== 'suspended')
        return

      const r2 = await resumeContinuation(r1.snapshot, 5)
      expect(r2).toEqual({ type: 'completed', value: 11 })
    })

    it('should handle multiple suspensions (re-suspend on resume)', async () => {
      const handlers: Handlers = [
        { pattern: 'my.step', handler: async ({ arg, suspend }) => {
          suspend({ step: arg })
        } },
      ]
      const r1 = await dvala.runAsync(`
        let a = perform(@my.step, 1);
        let b = perform(@my.step, 2);
        a + b
      `, { effectHandlers: handlers })

      expect(r1.type).toBe('suspended')
      if (r1.type !== 'suspended')
        return
      expect(r1.snapshot.meta).toEqual({ step: 1 })

      // Resume first suspension
      const r2 = await resumeContinuation(r1.snapshot, 10, { handlers })
      expect(r2.type).toBe('suspended')
      if (r2.type !== 'suspended')
        return
      expect(r2.snapshot.meta).toEqual({ step: 2 })

      // Resume second suspension
      const r3 = await resumeContinuation(r2.snapshot, 32)
      expect(r3).toEqual({ type: 'completed', value: 42 })
    })

    it('should support handlers on resume', async () => {
      const r1 = await dvala.runAsync(`
        let x = perform(@my.wait);
        perform(@my.compute, x)
      `, {
        effectHandlers: [
          { pattern: 'my.wait', handler: async ({ suspend }) => { suspend() } },

          { pattern: 'my.compute', handler: async ({ arg, resume: r }) => { r((arg as number) * 2) } },
        ],
      })
      expect(r1.type).toBe('suspended')
      if (r1.type !== 'suspended')
        return

      // Resume with handlers so my.compute works
      const r2 = await resumeContinuation(r1.snapshot, 21, {
        handlers: [
          { pattern: 'my.compute', handler: async ({ arg, resume: r }) => { r((arg as number) * 2) } },
        ],
      })
      expect(r2).toEqual({ type: 'completed', value: 42 })
    })

    it('should support bindings on resume', async () => {
      const r1 = await dvala.runAsync(`
        let x = perform(@my.wait);
        x + offset
      `, {
        bindings: { offset: 32 },
        effectHandlers: [
          { pattern: 'my.wait', handler: async ({ suspend }) => { suspend() } },
        ],
      })
      expect(r1.type).toBe('suspended')
      if (r1.type !== 'suspended')
        return

      // Resume with bindings
      const r2 = await resumeContinuation(r1.snapshot, 10, {
        bindings: { offset: 32 },
      })
      expect(r2).toEqual({ type: 'completed', value: 42 })
    })

    it('should return error for invalid continuation object', async () => {
      const result = await resumeContinuation({ id: 'test-id', continuation: { version: 1, k: 'bad', contextStacks: [] }, timestamp: 0, index: 0, executionId: 'test', message: 'test' }, 42)
      expect(result.type).toBe('error')
    })

    it('should return error for wrong version', async () => {
      const result = await resumeContinuation({ id: 'test-id', continuation: { version: 999, k: [], contextStacks: [] }, timestamp: 0, index: 0, executionId: 'test', message: 'test' }, 42)
      expect(result.type).toBe('error')
      if (result.type === 'error') {
        expect(result.error.message).toContain('Unsupported suspension blob version')
      }
    })

    it('should return error for unknown context stack ref in continuation', async () => {
      // A continuation with a __csRef pointing to a non-existent context stack
      const result = await resumeContinuation({
        id: 'test-id',
        continuation: {
          version: 2,
          k: [{ env: { __csRef: 999 } }],
          contextStacks: [],
        },
        timestamp: 0,
        index: 0,
        executionId: 'test',
        message: 'test',
      }, 42)
      expect(result.type).toBe('error')
      if (result.type === 'error') {
        expect(result.error.message).toContain('unknown context stack ref')
      }
    })

    it('should handle errors after resume', async () => {
      const r1 = await dvala.runAsync(`
        let x = perform(@my.wait);
        perform(@dvala.error, { message: "error: " ++ x })
      `, {
        effectHandlers: [
          { pattern: 'my.wait', handler: async ({ suspend }) => { suspend() } },
        ],
      })
      expect(r1.type).toBe('suspended')
      if (r1.type !== 'suspended')
        return

      const r2 = await resumeContinuation(r1.snapshot, 'boom')
      expect(r2.type).toBe('error')
      if (r2.type === 'error') {
        expect(r2.error.message).toContain('error: boom')
      }
    })

    it('should handle dvala.error handler after resume', async () => {
      const r1 = await dvala.runAsync(`
        do
          with handler @dvala.error(arg) -> resume("caught: " ++ arg.message) end;
          let x = perform(@my.wait);
          if x == "bad" then perform(@dvala.error, { message: "bad input" }) else x end
        end
      `, {
        effectHandlers: [
          { pattern: 'my.wait', handler: async ({ suspend }) => { suspend() } },
        ],
      })
      expect(r1.type).toBe('suspended')
      if (r1.type !== 'suspended')
        return

      const r2 = await resumeContinuation(r1.snapshot, 'bad')
      expect(r2).toEqual({ type: 'completed', value: 'caught: bad input' })
    })
  })

  describe('4c: NativeJsFunction not in blob', () => {
    it('should use host values before suspend without them leaking into blob', async () => {
      // Host values (plain data in bindings) are available during evaluation.
      // After suspend, the blob should not contain NativeJsFunctions.
      const r1 = await dvala.runAsync(`
        let doubled = factor * 5;
        let x = perform(@my.wait);
        doubled + x
      `, {
        bindings: { factor: 2 },
        effectHandlers: [
          { pattern: 'my.wait', handler: async ({ suspend }) => { suspend() } },
        ],
      })
      expect(r1.type).toBe('suspended')
      if (r1.type !== 'suspended')
        return

      // Resume — the blob is valid and doesn't contain JS functions
      const r2 = await resumeContinuation(r1.snapshot, 7)
      expect(r2).toEqual({ type: 'completed', value: 17 }) // 2*5 + 7
    })
  })

  describe('4d: end-to-end suspension workflow', () => {
    it('should complete a full suspend-store-resume cycle', async () => {
      // Simulate: Process 1 runs source, suspends at approval
      const source = `
        let report = perform(@llm.complete, "Generate Q4 report");
        let decision = perform(@com.myco.approve, report);
        if decision.approved then
          perform(@llm.complete, "Finalize: " ++ report)
        else
          "Rejected: " ++ decision.reason
        end
      `
      const handlers: Handlers = [
        { pattern: 'llm.complete', handler: async ({ arg, resume: doResume }) => {
          doResume(`[LLM: ${arg}]`)
        } },

        { pattern: 'com.myco.approve', handler: async ({ arg, suspend }) => {
          suspend({ payload: arg, assignedTo: 'finance-team' })
        } },
      ]

      const r1 = await dvala.runAsync(source, { effectHandlers: handlers })
      expect(r1.type).toBe('suspended')
      if (r1.type !== 'suspended')
        return

      // Simulate: Store snapshot in database
      const storedSnapshot = r1.snapshot
      const storedMeta = r1.snapshot.meta as Record<string, unknown>
      expect(storedMeta.assignedTo).toBe('finance-team')
      expect(storedMeta.payload).toBe('[LLM: Generate Q4 report]')

      // Simulate: Process 2 loads snapshot and resumes with approval
      const r2 = await resumeContinuation(storedSnapshot, PersistentMap.fromRecord({ approved: true, reason: null }), { handlers })
      expect(r2.type).toBe('completed')
      if (r2.type === 'completed') {
        expect(r2.value).toBe('[LLM: Finalize: [LLM: Generate Q4 report]]')
      }
    })

    it('should handle rejection in suspend-resume cycle', async () => {
      const source = `
        let x = perform(@my.wait);
        if x.approved then "Yes" else "No: " ++ x.reason end
      `
      const r1 = await dvala.runAsync(source, {
        effectHandlers: [
          { pattern: 'my.wait', handler: async ({ suspend }) => { suspend({ type: 'approval' }) } },
        ],
      })
      expect(r1.type).toBe('suspended')
      if (r1.type !== 'suspended')
        return

      const r2 = await resumeContinuation(r1.snapshot, PersistentMap.fromRecord({ approved: false, reason: 'denied' }))
      expect(r2).toEqual({ type: 'completed', value: 'No: denied' })
    })

    it('should handle multi-step workflow with several suspensions', async () => {
      const source = `
        let step1 = perform(@my.step, "step1");
        let step2 = perform(@my.step, "step2");
        let step3 = perform(@my.step, "step3");
        [step1, step2, step3]
      `
      const handlers: Handlers = [
        { pattern: 'my.step', handler: async ({ arg, suspend }) => {
          suspend({ step: arg })
        } },
      ]

      const r1 = await dvala.runAsync(source, { effectHandlers: handlers })
      expect(r1.type).toBe('suspended')
      if (r1.type !== 'suspended')
        return
      expect((r1.snapshot.meta as Record<string, unknown>).step).toBe('step1')

      const r2 = await resumeContinuation(r1.snapshot, 'A', { handlers })
      expect(r2.type).toBe('suspended')
      if (r2.type !== 'suspended')
        return
      expect((r2.snapshot.meta as Record<string, unknown>).step).toBe('step2')

      const r3 = await resumeContinuation(r2.snapshot, 'B', { handlers })
      expect(r3.type).toBe('suspended')
      if (r3.type !== 'suspended')
        return
      expect((r3.snapshot.meta as Record<string, unknown>).step).toBe('step3')

      const r4 = await resumeContinuation(r3.snapshot, 'C')
      expect(r4).toEqual({ type: 'completed', value: ['A', 'B', 'C'] })
    })

    it('should work with local handlers after resume', async () => {
      const r1 = await dvala.runAsync(`
        let x = perform(@my.wait);
        do
          with handler @my.local(arg) -> resume(upperCase(arg)) end;
          perform(@my.local, x)
        end
      `, {
        effectHandlers: [
          { pattern: 'my.wait', handler: async ({ suspend }) => { suspend() } },
        ],
      })
      expect(r1.type).toBe('suspended')
      if (r1.type !== 'suspended')
        return

      const r2 = await resumeContinuation(r1.snapshot, 'hello')
      expect(r2).toEqual({ type: 'completed', value: 'HELLO' })
    })

    it('should preserve deep nesting and closures across resume', async () => {
      const r1 = await dvala.runAsync(`
        let makeAdder = (n) -> (x) -> n + x;
        let add5 = makeAdder(5);
        let input = perform(@my.wait);
        add5(input)
      `, {
        effectHandlers: [
          { pattern: 'my.wait', handler: async ({ suspend }) => { suspend() } },
        ],
      })
      expect(r1.type).toBe('suspended')
      if (r1.type !== 'suspended')
        return

      const r2 = await resumeContinuation(r1.snapshot, 37)
      expect(r2).toEqual({ type: 'completed', value: 42 })
    })

    it('should handle loop/recur state after resume', async () => {
      const r1 = await dvala.runAsync(`
        let factor = perform(@my.wait);
        loop(i = 0, acc = 0) ->
          if i >= 5 then acc
          else recur(i + 1, acc + i * factor)
          end
      `, {
        effectHandlers: [
          { pattern: 'my.wait', handler: async ({ suspend }) => { suspend() } },
        ],
      })
      expect(r1.type).toBe('suspended')
      if (r1.type !== 'suspended')
        return

      // factor = 2, sum = 0*2 + 1*2 + 2*2 + 3*2 + 4*2 = 20
      const r2 = await resumeContinuation(r1.snapshot, 2)
      expect(r2).toEqual({ type: 'completed', value: 20 })
    })

    it('should handle arrays and objects across resume', async () => {
      const r1 = await dvala.runAsync(`
        let data = { name: "test", values: [1, 2, 3] };
        let extra = perform(@my.wait);
        { name: data.name, values: push(data.values, extra), count: count(data.values) + 1 }
      `, {
        effectHandlers: [
          { pattern: 'my.wait', handler: async ({ suspend }) => { suspend() } },
        ],
      })
      expect(r1.type).toBe('suspended')
      if (r1.type !== 'suspended')
        return

      const r2 = await resumeContinuation(r1.snapshot, 4)
      expect(r2).toEqual({
        type: 'completed',
        value: { name: 'test', values: [1, 2, 3, 4], count: 4 },
      })
    })
  })
})

describe('phase 5 — Standard Effects', () => {
  describe('5a: dvala.io.print', () => {
    it('should write to stdout and return value (via Dvala.run)', () => {
      const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
      try {
        const result = dvala.run('perform(@dvala.io.print, "test")')
        expect(result).toBe('test')
        expect(stdoutSpy).toHaveBeenCalledWith('test')
      } finally {
        stdoutSpy.mockRestore()
      }
    })

    it('should log null with no arguments', async () => {
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
      try {
        const result = await dvala.runAsync('perform(@dvala.io.print)')

        expect(result.type).toBe('completed')
        expect(spy).toHaveBeenCalledWith('null')
      } finally {
        spy.mockRestore()
      }
    })

    it('should be overridable by host handler', async () => {
      const logs: unknown[] = []
      const result = await dvala.runAsync('perform(@dvala.io.print, "custom")', {
        effectHandlers: [
          { pattern: 'dvala.io.print', handler: async ({ arg, resume: r }) => {
            logs.push(arg)
            r(null)
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: null })
      expect(logs).toEqual(['custom'])
    })

    it('should be overridable by local handler', () => {
      const result = dvala.run(`
        do
          with handler @dvala.io.print(arg) -> resume("logged: " ++ arg) end;
          perform(@dvala.io.print, "intercepted")
        end
      `)
      expect(result).toBe('logged: intercepted')
    })
  })

  describe('5b: dvala.time.now', () => {
    it('should return a timestamp (via run)', async () => {
      const before = Date.now()
      const result = await dvala.runAsync('perform(@dvala.time.now)')
      const after = Date.now()
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toBeGreaterThanOrEqual(before)
        expect(result.value).toBeLessThanOrEqual(after)
      }
    })

    it('should return a timestamp (via Dvala.run sync)', () => {
      const before = Date.now()
      const result = dvala.run('perform(@dvala.time.now)') as number
      const after = Date.now()
      expect(result).toBeGreaterThanOrEqual(before)
      expect(result).toBeLessThanOrEqual(after)
    })

    it('should be overridable by host handler for determinism', async () => {
      const fixedTime = 1700000000000
      const result = await dvala.runAsync('perform(@dvala.time.now)', {
        effectHandlers: [
          { pattern: 'dvala.time.now', handler: async ({ resume: r }) => r(fixedTime) },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: fixedTime })
    })

    it('should be overridable by local handler', () => {
      const result = dvala.run(`
        do
          with handler @dvala.time.now(arg) -> resume(1234567890) end;
          perform(@dvala.time.now)
        end
      `)
      expect(result).toBe(1234567890)
    })
  })

  describe('5c: dvala.random', () => {
    it('should return a number in [0, 1) (via run)', async () => {
      const result = await dvala.runAsync('perform(@dvala.random)')
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toBeGreaterThanOrEqual(0)
        expect(result.value).toBeLessThan(1)
      }
    })

    it('should return a number in [0, 1) (via Dvala.run sync)', () => {
      const result = dvala.run('perform(@dvala.random)') as number
      expect(result).toBeGreaterThanOrEqual(0)
      expect(result).toBeLessThan(1)
    })

    it('should be overridable by host handler for determinism', async () => {
      const result = await dvala.runAsync('perform(@dvala.random)', {
        effectHandlers: [
          { pattern: 'dvala.random', handler: async ({ resume: r }) => r(0.42) },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 0.42 })
    })

    it('should be overridable by local handler', () => {
      const result = dvala.run(`
        do
          with handler @dvala.random(arg) -> resume(0.5) end;
          perform(@dvala.random)
        end
      `)
      expect(result).toBe(0.5)
    })
  })

  describe('5d: dvala.sleep', () => {
    it('should sleep and return null (via run)', async () => {
      const result = await dvala.runAsync('perform(@dvala.sleep, 10)')
      expect(result).toMatchObject({ type: 'completed', value: null })
    })

    it('should throw in sync context', () => {
      expect(() => dvala.run('perform(@dvala.sleep, 10)'))
        .toThrow()
    })

    it('should reject negative ms', async () => {
      const result = await dvala.runAsync('perform(@dvala.sleep, -1)')
      expect(result.type).toBe('error')
    })

    it('should reject non-number argument', async () => {
      const result = await dvala.runAsync('perform(@dvala.sleep, "fast")')
      expect(result.type).toBe('error')
    })

    it('should be overridable by host handler', async () => {
      let sleepMs: number | undefined
      const result = await dvala.runAsync('perform(@dvala.sleep, 100)', {
        effectHandlers: [
          { pattern: 'dvala.sleep', handler: async ({ arg, resume: r }) => {
            sleepMs = arg as number
            r(null)
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: null })
      expect(sleepMs).toBe(100)
    })
  })

  describe('5e: standard effects in workflows', () => {
    it('should use multiple standard effects in sequence', async () => {
      const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
      try {
        const result = await dvala.runAsync(`
          do
            perform(@dvala.io.print, "Starting");
            let t = perform(@dvala.time.now);
            let r = perform(@dvala.random);
            perform(@dvala.io.print, "Done");
            { time: isNumber(t), random: isNumber(r) }
          end
        `)
        expect(result.type).toBe('completed')
        if (result.type === 'completed') {
          const value = result.value as Record<string, unknown>
          expect(value.time).toBe(true)
          expect(value.random).toBe(true)
        }
        expect(stdoutSpy).toHaveBeenCalledTimes(2)
      } finally {
        stdoutSpy.mockRestore()
      }
    })

    it('should work with standard effects + suspension', async () => {
      const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
      try {
        const r1 = await dvala.runAsync(`
          do
            perform(@dvala.io.print, "Before suspend");
            let input = perform(@my.wait);
            perform(@dvala.io.print, "After resume: " ++ input);
            input
          end
        `, {
          effectHandlers: [
            { pattern: 'my.wait', handler: async ({ suspend }) => { suspend({ prompt: 'Enter value' }) } },
          ],
        })
        expect(r1.type).toBe('suspended')
        if (r1.type !== 'suspended')
          return

        expect(stdoutSpy).toHaveBeenCalledTimes(1)
        expect(stdoutSpy).toHaveBeenCalledWith('Before suspend')
        stdoutSpy.mockClear()

        const r2 = await resumeContinuation(r1.snapshot, 'hello')
        expect(r2).toEqual({ type: 'completed', value: 'hello' })
        expect(stdoutSpy).toHaveBeenCalledTimes(1)
        expect(stdoutSpy).toHaveBeenCalledWith('After resume: hello')
      } finally {
        stdoutSpy.mockRestore()
      }
    })

    it('should allow overriding all standard effects for testing', async () => {
      const fixedTime = 1700000000000
      const result = await dvala.runAsync(`
        { now: perform(@dvala.time.now), rnd: perform(@dvala.random) }
      `, {
        effectHandlers: [
          { pattern: 'dvala.time.now', handler: async ({ resume: r }) => r(fixedTime) },

          { pattern: 'dvala.random', handler: async ({ resume: r }) => r(0.42) },
        ],
      })
      expect(result).toMatchObject({
        type: 'completed',
        value: { now: fixedTime, rnd: 0.42 },
      })
    })

    it('should work with runSync for sync standard effects', () => {
      const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
      try {
        const result = dvala.run(`
          do
            perform(@dvala.io.print, "sync log");
            let t = perform(@dvala.time.now);
            let r = perform(@dvala.random);
            isNumber(t) && isNumber(r)
          end
        `)
        expect(result).toBe(true)
        expect(stdoutSpy).toHaveBeenCalledWith('sync log')
      } finally {
        stdoutSpy.mockRestore()
      }
    })
  })
})

// ---------------------------------------------------------------------------
// Phase 6 — Parallel & Race
// ---------------------------------------------------------------------------

describe('phase 6 — Parallel & Race', () => {
  describe('6a: parallel(...expressions)', () => {
    it('should evaluate all branches and return array of results', async () => {
      const result = await dvala.runAsync(`
        parallel(
          1 + 2,
          3 + 4,
          5 + 6
        )
      `)
      expect(result).toMatchObject({ type: 'completed', value: [3, 7, 11] })
    })

    it('should return results in original order', async () => {
      // Branch 2 is faster than branch 1, but results are ordered by position
      const result = await dvala.runAsync(`
        parallel(
          perform(@slow.op, "first"),
          perform(@fast.op, "second")
        )
      `, {
        effectHandlers: [
          { pattern: 'slow.op', handler: async ({ arg, resume: res }) => {
            await new Promise(resolve => setTimeout(resolve, 50))
            res(`slow:${arg}`)
          } },

          { pattern: 'fast.op', handler: async ({ arg, resume: res }) => {
            await new Promise(resolve => setTimeout(resolve, 10))
            res(`fast:${arg}`)
          } },
        ],
      })
      expect(result).toMatchObject({
        type: 'completed',
        value: ['slow:first', 'fast:second'],
      })
    })

    it('should work with host effect handlers', async () => {
      const result = await dvala.runAsync(`
        let llm = @llm.complete;
        parallel(
          perform(llm, "Summarize"),
          perform(llm, "Critique"),
          perform(llm, "Keywords")
        )
      `, {
        effectHandlers: [
          { pattern: 'llm.complete', handler: async ({ arg, resume: res }) => {
            res(`result:${arg}`)
          } },
        ],
      })
      expect(result).toMatchObject({
        type: 'completed',
        value: ['result:Summarize', 'result:Critique', 'result:Keywords'],
      })
    })

    it('should error if any branch errors', async () => {
      const result = await dvala.runAsync(`
        parallel(
          1 + 2,
          perform(@dvala.error, "branch error"),
          5 + 6
        )
      `)
      expect(result.type).toBe('error')
    })

    it('should work with a single branch', async () => {
      const result = await dvala.runAsync(`
        parallel(42)
      `)
      expect(result).toMatchObject({ type: 'completed', value: [42] })
    })

    it('should handle standard effects in branches', async () => {
      const result = await dvala.runAsync(`
        parallel(
          perform(@dvala.random),
          perform(@dvala.random)
        )
      `)
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(Array.isArray(result.value)).toBe(true)
        const arr = result.value as number[]
        expect(arr).toHaveLength(2)
        expect(typeof arr[0]).toBe('number')
        expect(typeof arr[1]).toBe('number')
      }
    })

    it('should support destructuring the result', async () => {
      const result = await dvala.runAsync(`
        let [a, b, c] = parallel(
          perform(@llm, "task1"),
          perform(@llm, "task2"),
          perform(@llm, "task3")
        );
        { a: a, b: b, c: c }
      `, {
        effectHandlers: [
          { pattern: 'llm', handler: async ({ arg, resume: res }) => {
            res(`done:${arg}`)
          } },
        ],
      })
      expect(result).toMatchObject({
        type: 'completed',
        value: { a: 'done:task1', b: 'done:task2', c: 'done:task3' },
      })
    })

    describe('parallel suspension', () => {
      it('should suspend when any branch suspends', async () => {
        const result = await dvala.runAsync(`
          parallel(
            perform(@fast.op),
            perform(@needs.approval)
          )
        `, {
          effectHandlers: [
            { pattern: 'fast.op', handler: async ({ resume: res }) => {
              res('fast-result')
            } },

            { pattern: 'needs.approval', handler: async ({ suspend }) => {
              suspend({ assignedTo: 'team-lead' })
            } },
          ],
        })
        expect(result.type).toBe('suspended')
        if (result.type === 'suspended') {
          expect(result.snapshot.meta).toEqual({ assignedTo: 'team-lead' })
        }
      })

      it('should resume suspended parallel and complete', async () => {
        const handlers: Handlers = [
          { pattern: 'fast.op', handler: async ({ resume: res }) => { res('fast-result') } },

          { pattern: 'needs.approval', handler: async ({ suspend }) => {
            suspend({ assignedTo: 'team-lead' })
          } },
        ]

        const result1 = await dvala.runAsync(`
          parallel(
            perform(@fast.op),
            perform(@needs.approval)
          )
        `, { effectHandlers: handlers })

        expect(result1.type).toBe('suspended')
        if (result1.type !== 'suspended')
          return

        // Resume with the approval decision
        const result2 = await resumeContinuation(result1.snapshot, 'approved', { handlers })
        expect(result2).toEqual({
          type: 'completed',
          value: ['fast-result', 'approved'],
        })
      })

      it('should handle multiple suspended branches one at a time', async () => {
        const handlers: Handlers = [
          { pattern: 'approval.a', handler: async ({ suspend }) => {
            suspend({ step: 'A' })
          } },

          { pattern: 'approval.b', handler: async ({ suspend }) => {
            suspend({ step: 'B' })
          } },

          { pattern: 'approval.c', handler: async ({ suspend }) => {
            suspend({ step: 'C' })
          } },
        ]

        const result1 = await dvala.runAsync(`
          parallel(
            perform(@approval.a),
            perform(@approval.b),
            perform(@approval.c)
          )
        `, { effectHandlers: handlers })

        expect(result1.type).toBe('suspended')
        if (result1.type !== 'suspended')
          return

        // First resume
        const result2 = await resumeContinuation(result1.snapshot, 'value-A', { handlers })
        expect(result2.type).toBe('suspended')
        if (result2.type !== 'suspended')
          return

        // Second resume
        const result3 = await resumeContinuation(result2.snapshot, 'value-B', { handlers })
        expect(result3.type).toBe('suspended')
        if (result3.type !== 'suspended')
          return

        // Third resume — all branches done
        const result4 = await resumeContinuation(result3.snapshot, 'value-C', { handlers })
        expect(result4).toEqual({
          type: 'completed',
          value: ['value-A', 'value-B', 'value-C'],
        })
      })

      it('should preserve branch order even with mixed completion/suspension', async () => {
        const handlers: Handlers = [
          { pattern: 'fast', handler: async ({ resume: res }) => { res('fast-done') } },

          { pattern: 'slow.approve', handler: async ({ suspend }) => {
            suspend({ type: 'approval' })
          } },
        ]

        // Branch 0: suspends, Branch 1: completes, Branch 2: suspends
        const result1 = await dvala.runAsync(`
          parallel(
            perform(@slow.approve),
            perform(@fast),
            perform(@slow.approve)
          )
        `, { effectHandlers: handlers })

        expect(result1.type).toBe('suspended')
        if (result1.type !== 'suspended')
          return

        const result2 = await resumeContinuation(result1.snapshot, 'approved-0', { handlers })
        expect(result2.type).toBe('suspended')
        if (result2.type !== 'suspended')
          return

        const result3 = await resumeContinuation(result2.snapshot, 'approved-2', { handlers })
        expect(result3).toEqual({
          type: 'completed',
          value: ['approved-0', 'fast-done', 'approved-2'],
        })
      })

      it('should support the host-side resume loop pattern', async () => {
        const decisions = ['yes', 'no', 'maybe']
        let decisionIndex = 0
        const handlers: Handlers = [
          { pattern: 'ask.human', handler: async ({ arg, suspend }) => {
            suspend({ question: arg })
          } },
        ]

        let result = await dvala.runAsync(`
          parallel(
            perform(@ask.human, "Q1"),
            perform(@ask.human, "Q2"),
            perform(@ask.human, "Q3")
          )
        `, { effectHandlers: handlers })

        // Standard host-side loop — identical to single suspension
        while (result.type === 'suspended') {
          const decision = decisions[decisionIndex++]!
          result = await resumeContinuation(result.snapshot, decision, { handlers })
        }

        expect(result).toMatchObject({
          type: 'completed',
          value: ['yes', 'no', 'maybe'],
        })
      })
    })
  })

  describe('6b: race(...expressions)', () => {
    it('should return the first completed branch', async () => {
      const result = await dvala.runAsync(`
        race(
          perform(@slow.op, "tortoise"),
          perform(@fast.op, "hare")
        )
      `, {
        effectHandlers: [
          { pattern: 'slow.op', handler: async ({ arg, resume: res }) => {
            await new Promise(resolve => setTimeout(resolve, 50))
            res(`slow:${arg}`)
          } },

          { pattern: 'fast.op', handler: async ({ arg, resume: res }) => {
            res(`fast:${arg}`)
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 'fast:hare' })
    })

    it('should return the first completed even if others error', async () => {
      const result = await dvala.runAsync(`
        race(
          perform(@fail.op),
          perform(@ok.op)
        )
      `, {
        effectHandlers: [
          { pattern: 'fail.op', handler: async ({ resume: res }) => {
            res(Promise.reject(new Error('boom')))
          } },

          { pattern: 'ok.op', handler: async ({ resume: res }) => {
            res('success')
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 'success' })
    })

    it('should error if all branches error', async () => {
      const result = await dvala.runAsync(`
        race(
          perform(@dvala.error, "error-1"),
          perform(@dvala.error, "error-2")
        )
      `)
      expect(result.type).toBe('error')
      if (result.type === 'error') {
        expect(result.error.message).toContain('race: all branches failed')
      }
    })

    it('should work with pure expressions (first wins)', async () => {
      const result = await dvala.runAsync(`
        race(42, 99)
      `)
      // Both complete immediately — first completed in results order wins
      expect(result).toMatchObject({ type: 'completed', value: 42 })
    })

    it('should work with a single branch', async () => {
      const result = await dvala.runAsync(`
        race(perform(@op, "only"))
      `, {
        effectHandlers: [
          { pattern: 'op', handler: async ({ arg, resume: res }) => {
            res(`result:${arg}`)
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 'result:only' })
    })

    it('should suspend if all branches suspend (none complete)', async () => {
      const result = await dvala.runAsync(`
        race(
          perform(@slow.a),
          perform(@slow.b)
        )
      `, {
        effectHandlers: [
          { pattern: 'slow.a', handler: async ({ suspend }) => {
            suspend({ branch: 'A' })
          } },

          { pattern: 'slow.b', handler: async ({ suspend }) => {
            suspend({ branch: 'B' })
          } },
        ],
      })
      expect(result.type).toBe('suspended')
      if (result.type === 'suspended') {
        // Meta contains all branch metas
        expect(result.snapshot.meta).toEqual({
          type: 'race',
          branches: [{ branch: 'A' }, { branch: 'B' }],
        })
      }
    })

    it('should resume a suspended race with the winner value', async () => {
      const handlers: Handlers = [
        { pattern: 'slow.a', handler: async ({ suspend }) => { suspend({ branch: 'A' }) } },

        { pattern: 'slow.b', handler: async ({ suspend }) => { suspend({ branch: 'B' }) } },
      ]

      const result1 = await dvala.runAsync(`
        race(
          perform(@slow.a),
          perform(@slow.b)
        )
      `, { effectHandlers: handlers })

      expect(result1.type).toBe('suspended')
      if (result1.type !== 'suspended')
        return

      // Host decides the winner
      const result2 = await resumeContinuation(result1.snapshot, 'winner-value', { handlers })
      expect(result2).toEqual({ type: 'completed', value: 'winner-value' })
    })

    it('should prefer completed over suspended branches', async () => {
      const result = await dvala.runAsync(`
        race(
          perform(@suspend.op),
          perform(@complete.op)
        )
      `, {
        effectHandlers: [
          { pattern: 'suspend.op', handler: async ({ suspend }) => {
            suspend({ waiting: true })
          } },

          { pattern: 'complete.op', handler: async ({ resume: res }) => {
            res('completed-value')
          } },
        ],
      })
      // Completed branch wins over suspended
      expect(result).toMatchObject({ type: 'completed', value: 'completed-value' })
    })

    it('should pass signal to branch handlers', async () => {
      const abortReasons: string[] = []
      const result = await dvala.runAsync(`
        race(
          perform(@fast.op),
          perform(@slow.op)
        )
      `, {
        effectHandlers: [
          { pattern: 'fast.op', handler: async ({ resume: res }) => {
            res('fast-wins')
          } },

          { pattern: 'slow.op', handler: async ({ signal, resume: res }) => {
            // In practice, this handler would check signal before doing work
            if (signal.aborted) {
              abortReasons.push(signal.reason as string)
            }
            res('slow-loses')
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 'fast-wins' })
      // Note: abort happens after allSettled, so the slow handler may or may not see it
    })

    it('should use race result in subsequent computation', async () => {
      const result = await dvala.runAsync(`
        let winner = race(
          perform(@op.a),
          perform(@op.b)
        );
        "Winner: " ++ winner
      `, {
        effectHandlers: [
          { pattern: 'op.a', handler: async ({ resume: res }) => {
            await new Promise(resolve => setTimeout(resolve, 50))
            res('A')
          } },

          { pattern: 'op.b', handler: async ({ resume: res }) => {
            res('B')
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 'Winner: B' })
    })
  })

  describe('6: parallel and race edge cases', () => {
    it('parallel should not work in dvala.run()', () => {
      expect(() => dvala.run('parallel(1, 2, 3)')).toThrow('Unexpected async result in run()')
    })

    it('race should not work in dvala.run()', () => {
      expect(() => dvala.run('race(1, 2, 3)')).toThrow('Unexpected async result in run()')
    })

    it('parallel with nested parallel should work', async () => {
      const result = await dvala.runAsync(`
        parallel(
          parallel(1, 2),
          parallel(3, 4)
        )
      `)
      expect(result).toMatchObject({
        type: 'completed',
        value: [[1, 2], [3, 4]],
      })
    })

    it('parallel inside let binding should work', async () => {
      const result = await dvala.runAsync(`
        let results = parallel(
          perform(@op, "a"),
          perform(@op, "b")
        );
        map(results, -> "got:" ++ $)
      `, {
        effectHandlers: [
          { pattern: 'op', handler: async ({ arg, resume: res }) => { res(arg!) } },
        ],
      })
      expect(result).toMatchObject({
        type: 'completed',
        value: ['got:a', 'got:b'],
      })
    })

    it('race inside parallel should work', async () => {
      const result = await dvala.runAsync(`
        parallel(
          race(
            perform(@slow, "a"),
            perform(@fast, "b")
          ),
          race(
            perform(@fast, "c"),
            perform(@slow, "d")
          )
        )
      `, {
        effectHandlers: [
          { pattern: 'slow', handler: async ({ arg, resume: res }) => {
            await new Promise(resolve => setTimeout(resolve, 50))
            res(`slow:${arg}`)
          } },

          { pattern: 'fast', handler: async ({ arg, resume: res }) => {
            res(`fast:${arg}`)
          } },
        ],
      })
      expect(result).toMatchObject({
        type: 'completed',
        value: ['fast:b', 'fast:c'],
      })
    })

    it('parallel with handler errors in some branches', async () => {
      const result = await dvala.runAsync(`
        parallel(
          perform(@ok.op),
          perform(@err.op)
        )
      `, {
        effectHandlers: [
          { pattern: 'ok.op', handler: async ({ resume: res }) => { res('ok') } },

          { pattern: 'err.op', handler: async ({ resume: res }) => { res(Promise.reject(new Error('handler error'))) } },
        ],
      })
      // Error branches cause the whole parallel to error
      expect(result.type).toBe('error')
    })
  })
})

describe('step 1 — handler...end with do...with', () => {
  describe('basic handler with do...with', () => {
    it('should handle an effect — resume value resumes the perform call', () => {
      const result = dvala.run(`
        do
          with handler @my.log(arg) -> resume("logged: " ++ arg) end;
          perform(@my.log, "hello")
        end
      `)
      expect(result).toBe('logged: hello')
    })

    it('should pass single payload to the handler', () => {
      const result = dvala.run(`
        do
          with handler @my.add(arg) -> resume(do let [a, b] = arg; a + b end) end;
          perform(@my.add, [10, 20])
        end
      `)
      expect(result).toBe(30)
    })

    it('should work with no-arg perform', () => {
      const result = dvala.run(`
        do
          with handler @my.value(arg) -> resume(42) end;
          perform(@my.value)
        end
      `)
      expect(result).toBe(42)
    })

    it('should resume and continue the body computation', () => {
      const result = dvala.run(`
        do
          with handler @my.get(arg) -> resume(21) end;
          let x = perform(@my.get);
          x * 2
        end
      `)
      expect(result).toBe(42)
    })

    it('should skip handler frame on success (no effect performed)', () => {
      const result = dvala.run(`
        do
          with handler @my.eff(arg) -> resume(999) end;
          1 + 2
        end
      `)
      expect(result).toBe(3)
    })

    it('should handle multiple cases', () => {
      const result = dvala.run(`
        do
          with handler
            @a(arg) -> resume(arg * 10)
            @b(arg) -> resume(arg * 100)
          end;
          perform(@a, 1) + perform(@b, 2)
        end
      `)
      expect(result).toBe(210)
    })

    it('should delegate to outer handler when no local match', () => {
      const result = dvala.run(`
        do
          with handler @outer.eff(arg) -> resume("outer: " ++ arg) end;
          with handler @inner.eff(arg) -> resume("inner: " ++ arg) end;
          perform(@outer.eff, "value")
        end
      `)
      expect(result).toBe('outer: value')
    })

    it('should work with effect references from variables', () => {
      const result = dvala.run(`
        do
          with handler @my.eff(arg) -> resume("hello " ++ arg) end;
          let myEff = @my.eff;
          perform(myEff, "world")
        end
      `)
      expect(result).toBe('hello world')
    })

    it('should propagate errors via perform(@dvala.error)', () => {
      expect(() => dvala.run(`
        do
          with handler @my.eff(arg) -> resume(perform(@dvala.error, { message: "something went wrong" })) end;
          perform(@my.eff, "data")
        end
      `)).toThrow('something went wrong')
    })
  })

  describe('handler with body scoping', () => {
    it('should see outer bindings from the body', () => {
      const result = dvala.run(`
        let prefix = "pre-";
        do
          with handler @my.eff(arg) -> resume(prefix ++ arg) end;
          perform(@my.eff, "value")
        end
      `)
      expect(result).toBe('pre-value')
    })
  })
})

describe('step 2 — dvala.error standard effect', () => {
  it('do...with catches runtime error (not finite)', () => {
    expect(dvala.run(`
      do
        with handler @dvala.error(arg) -> resume(42) end;
        0 / 0
      end
    `)).toBe(42)
  })

  it('handler receives error message as first arg', () => {
    const result = dvala.run(`
      do
        with handler @dvala.error(arg) -> resume(arg.message) end;
        0 / 0
      end
    `)
    expect(result).toBe('Number is not finite')
  })

  it('handler return value resumes at the error site', () => {
    // Handler resumes with 0, which becomes the resume value of (0/0).
    // Execution continues: let x = 0; x + 1 => 1
    expect(dvala.run(`
      do
        with handler @dvala.error(arg) -> resume(0) end;
        let x = 0 / 0;
        x + 1
      end
    `)).toBe(1)
  })

  it('unhandled runtime error still propagates when no dvala.error handler', () => {
    expect(() => dvala.run(`
      do
        with handler @dvala.io.print(arg) -> resume(42) end;
        0 / 0
      end
    `)).toThrow()
  })

  it('unhandled runtime error propagates when no handler', () => {
    expect(() => dvala.run('0 / 0')).toThrow()
  })

  it('dvala.error handler does not intercept unrelated effects', () => {
    expect(dvala.run(`
      do
        with handler
          @dvala.error(arg) -> resume(0 - 1)
          @my.eff(arg) -> resume(arg * 2)
        end;
        perform(@my.eff, 99)
      end
    `)).toBe(198)
  })

  it('dvala.error handler can be nested inside outer do...with', () => {
    expect(dvala.run(`
      do
        with handler @dvala.error(arg) -> resume(77) end;
        with handler @dvala.io.print(arg) -> resume(0) end;
        0 / 0
      end
    `)).toBe(77)
  })

  it('error in handler propagates outward', () => {
    expect(dvala.run(`
      do
        with handler @dvala.error(arg) -> resume(55) end;
        with handler @dvala.error(arg) -> resume(0 / 0) end;
        0 / 0
      end
    `)).toBe(55)
  })

  it('dvala.error handler catches the error', () => {
    expect(dvala.run(`
      do
        with handler @dvala.error(arg) -> resume(42) end;
        0 / 0
      end
    `)).toBe(42)
  })

  it('dvala.error via host handler intercepts runtime errors', async () => {
    const result = await dvala.runAsync('0 / 0', {
      effectHandlers: [
        { pattern: 'dvala.error', handler: async ({ resume: doResume }) => { doResume(99) } },
      ],
    })
    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      expect(result.value).toBe(99)
    }
  })

  it('in-language dvala.error handler catches error from async host handler that throws', async () => {
    // When a host handler for dvala.io.print throws, it produces an ErrorStep.
    // tick() processes the ErrorStep and routes it through tryDispatchDvalaError,
    // which finds the in-language handler.
    const result = await dvala.runAsync(
      `do
        with handler @dvala.error(arg) -> resume(arg.message) end;
        perform(@dvala.io.print, "hello")
      end`,
      {
        effectHandlers: [
          { pattern: 'dvala.io.print', handler: async () => { throw new Error('async host error') } },
        ],
      },
    )
    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      expect(result.value).toBe('async host error')
    }
  })
})

describe('step 9 — effectName accessor', () => {
  it('should return the name of an effect', () => {
    expect(dvala.run('effectName(@dvala.error)')).toBe('dvala.error')
  })

  it('should work with dotted names', () => {
    expect(dvala.run('effectName(@llm.complete)')).toBe('llm.complete')
  })

  it('should work with deeply dotted names', () => {
    expect(dvala.run('effectName(@com.myco.foo.bar)')).toBe('com.myco.foo.bar')
  })

  it('should work with effect stored in variable', () => {
    expect(dvala.run('let e = @dvala.io.print; effectName(e)')).toBe('dvala.io.print')
  })

  it('should throw on non-effect argument', () => {
    expect(() => dvala.run('effectName("not an effect")')).toThrow()
  })
})

describe('step 10 — handler matching', () => {
  it('should match effect by name in handler clause', () => {
    const result = dvala.run(`
      do
        with handler @dvala.io.print(arg) -> resume("logged: " ++ arg) end;
        perform(@dvala.io.print, "hello")
      end
    `)
    expect(result).toBe('logged: hello')
  })

  it('should match correct clause among multiple', () => {
    const result = dvala.run(`
      do
        with handler
          @dvala.error(arg) -> resume("error handler")
          @dvala.io.print(arg) -> resume("log handler")
        end;
        perform(@dvala.io.print, "hello")
      end
    `)
    expect(result).toBe('log handler')
  })

  it('should mix effect clauses correctly', () => {
    const result = dvala.run(`
      do
        with handler
          @dvala.error(arg) -> resume("error handler")
          @dvala.io.print(arg) -> resume("log handler")
        end;
        perform(@dvala.io.print, "hello")
      end
    `)
    expect(result).toBe('log handler')
  })

  it('should support prefix matching via handler clause', () => {
    const result = dvala.run(`
      do
        with handler @com.myco.foo(arg) -> resume("matched prefix") end;
        perform(@com.myco.foo, "data")
      end
    `)
    expect(result).toBe('matched prefix')
  })

  it('should support handler matching on effect refs', () => {
    const result = dvala.run(`
      do
        with handler @dvala.io.print(arg) -> resume("matched regex") end;
        perform(@dvala.io.print, "data")
      end
    `)
    expect(result).toBe('matched regex')
  })

  it('should work with handler matching the exact effect', () => {
    const result = dvala.run(`
      do
        with handler @dvala.io.print(arg) -> resume("matched") end;
        perform(@dvala.io.print, "hello")
      end
    `)
    expect(result).toBe('matched')
  })

  it('should propagate unhandled effect when no matching handler clause', () => {
    expect(() => dvala.run(`
      do
        with handler @other.eff(arg) -> resume("never") end;
        perform(@custom.eff, "data")
      end
    `)).toThrow('Unhandled effect')
  })

  it('should support handler for dvala.error', () => {
    const result = dvala.run(`
      do
        with handler @dvala.error(arg) -> resume(arg) end;
        perform(@dvala.error, "oops")
      end
    `)
    expect(result).toBe('oops')
  })

  it('handler should be serializable across suspend/resume', async () => {
    const r1 = await dvala.runAsync(`
      do
        with handler @dvala.error(arg) -> resume("caught dvala") end;
        let result = perform(@my.wait);
        result
      end
    `, {
      effectHandlers: [
        { pattern: 'my.wait', handler: async ({ suspend }) => { suspend() } },
      ],
    })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return

    const r2 = await resumeContinuation(r1.snapshot, 42)
    expect(r2).toEqual({ type: 'completed', value: 42 })
  })

  it('handler should be serializable across suspend/resume (with multiple clauses)', async () => {
    const r1 = await dvala.runAsync(`
      do
        with handler
          @dvala.error(arg) -> resume("caught dvala")
          @other.eff(arg) -> resume("caught other")
        end;
        let result = perform(@my.wait);
        result
      end
    `, {
      effectHandlers: [
        { pattern: 'my.wait', handler: async ({ suspend }) => { suspend() } },
      ],
    })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return

    const r2 = await resumeContinuation(r1.snapshot, 99)
    expect(r2).toEqual({ type: 'completed', value: 99 })
  })
})

// =========================================================================
// Host handler wildcard patterns & middleware chaining
// =========================================================================
describe('host handler wildcard patterns', () => {
  describe('qualifiedNameMatchesPattern (via integration)', () => {
    it('exact match works', async () => {
      const result = await dvala.runAsync('perform(@my.effect, 42)', {
        effectHandlers: [
          { pattern: 'my.effect', handler: async ({ arg, resume }) => { resume(arg!) } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 42 })
    })

    it('wildcard suffix matches child effect', async () => {
      const result = await dvala.runAsync('perform(@dvala.io.print, "hello")', {
        effectHandlers: [
          { pattern: 'dvala.*', handler: async ({ arg, resume }) => { resume(arg!) } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 'hello' })
    })

    it('wildcard suffix matches the prefix itself', async () => {
      const result = await dvala.runAsync('perform(@dvala, "value")', {
        effectHandlers: [
          { pattern: 'dvala.*', handler: async ({ arg, resume }) => { resume(arg!) } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 'value' })
    })

    it('wildcard suffix matches deeply nested effects', async () => {
      const result = await dvala.runAsync('perform(@app.log.verbose, "deep")', {
        effectHandlers: [
          { pattern: 'app.*', handler: async ({ arg, resume }) => { resume(arg!) } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 'deep' })
    })

    it('wildcard suffix does NOT match without dot boundary', async () => {
      // dvala.* should NOT directly match 'dvalaXXX' as an effect pattern,
      // but when dvalaXXX is unhandled it produces dvala.error which IS matched.
      // Test with a handler that checks effectName to verify pattern boundary.
      let capturedEffectName = ''
      const result = await dvala.runAsync('perform(@dvalaXXX, "val")', {
        effectHandlers: [
          { pattern: 'dvala.*', handler: async ({ effectName, arg, resume }) => {
            capturedEffectName = effectName
            resume(arg!)
          } },
        ],
      })
      // The handler catches dvala.error (from unhandled effect), NOT dvalaXXX directly
      expect(result.type).toBe('completed')
      expect(capturedEffectName).toBe('dvala.error')
    })

    it('catch-all * matches everything', async () => {
      const result = await dvala.runAsync('perform(@anything.at.all, 99)', {
        effectHandlers: [
          { pattern: '*', handler: async ({ arg, resume }) => { resume(arg!) } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 99 })
    })

    it('exact match has priority over wildcard by registration order', async () => {
      const result = await dvala.runAsync('perform(@my.effect, "data")', {
        effectHandlers: [
          { pattern: 'my.effect', handler: async ({ resume }) => { resume('exact') } },

          { pattern: '*', handler: async ({ resume }) => { resume('catch-all') } },
        ],
      })
      // First registered handler that matches wins
      expect(result).toMatchObject({ type: 'completed', value: 'exact' })
    })
  })

  describe('effectName on context', () => {
    it('provides the full effect name to the handler', async () => {
      let capturedName = ''
      const result = await dvala.runAsync('perform(@my.custom.effect, "val")', {
        effectHandlers: [
          { pattern: '*', handler: async ({ effectName, arg, resume }) => {
            capturedName = effectName
            resume(arg!)
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 'val' })
      expect(capturedName).toBe('my.custom.effect')
    })

    it('effectName is correct for wildcard suffix handlers', async () => {
      let capturedName = ''
      await dvala.runAsync('perform(@dvala.io.print, "hello")', {
        effectHandlers: [
          { pattern: 'dvala.*', handler: async ({ effectName, resume }) => {
            capturedName = effectName
            resume(null)
          } },
        ],
      })
      expect(capturedName).toBe('dvala.io.print')
    })
  })

  describe('fail() operation', () => {
    it('fail() produces a dvala error', async () => {
      const result = await dvala.runAsync('perform(@my.effect, "data")', {
        effectHandlers: [
          { pattern: 'my.effect', handler: async ({ fail }) => { fail('something went wrong') } },
        ],
      })
      expect(result.type).toBe('error')
      if (result.type === 'error') {
        expect(result.error.shortMessage).toBe('something went wrong')
      }
    })

    it('fail() with no message uses a default message', async () => {
      const result = await dvala.runAsync('perform(@my.effect, "data")', {
        effectHandlers: [
          { pattern: 'my.effect', handler: async ({ fail }) => { fail() } },
        ],
      })
      expect(result.type).toBe('error')
      if (result.type === 'error') {
        expect(result.error.shortMessage).toContain('my.effect')
      }
    })

    it('fail() can be caught by dvala.error in-language handler', async () => {
      const result = await dvala.runAsync(`
        do
          with handler @dvala.error(arg) -> resume(arg.message) end;
          perform(@my.effect, "data")
        end
      `, {
        effectHandlers: [
          { pattern: 'my.effect', handler: async ({ fail }) => { fail('host failure') } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 'host failure' })
    })
  })

  describe('next() middleware chaining', () => {
    it('next() passes to the next matching handler', async () => {
      const log: string[] = []
      const result = await dvala.runAsync('perform(@my.effect, "data")', {
        effectHandlers: [
          { pattern: 'my.*', handler: async ({ next }) => {
            log.push('wildcard')
            next()
          } },

          { pattern: 'my.effect', handler: async ({ resume }) => {
            log.push('exact')
            resume('done')
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 'done' })
      expect(log).toEqual(['wildcard', 'exact'])
    })

    it('next() through multiple middleware handlers', async () => {
      const log: string[] = []
      const result = await dvala.runAsync('perform(@app.action, "go")', {
        effectHandlers: [
          { pattern: '*', handler: async ({ next }) => {
            log.push('catch-all')
            next()
          } },

          { pattern: 'app.*', handler: async ({ next }) => {
            log.push('app-wildcard')
            next()
          } },

          { pattern: 'app.action', handler: async ({ arg, resume }) => {
            log.push('exact')
            resume(arg!)
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 'go' })
      expect(log).toEqual(['catch-all', 'app-wildcard', 'exact'])
    })

    it('next() with no more handlers produces unhandled error', async () => {
      const result = await dvala.runAsync('perform(@my.effect, "data")', {
        effectHandlers: [
          { pattern: 'my.*', handler: async ({ next }) => { next() } },
        ],
      })
      expect(result.type).toBe('error')
      if (result.type === 'error') {
        expect(result.error.shortMessage).toContain('Unhandled effect')
      }
    })

    it('calling two operations throws immediately', async () => {
      const result = await dvala.runAsync('perform(@my.effect, "data")', {
        effectHandlers: [
          { pattern: 'my.effect', handler: async ({ resume }) => {
            resume('first')
            // Second call should throw but the handler is already settled
            // so the error is caught by the .catch() handler
            resume('second')
          } },
        ],
      })
      // First resume should succeed; the second call throws but the handler
      // is already settled so it's an exception in the handler
      expect(result).toMatchObject({ type: 'completed', value: 'first' })
    })
  })

  describe('wildcard patterns with dvala.error', () => {
    it('dvala.* catches runtime errors', async () => {
      const result = await dvala.runAsync('perform(@dvala.error, "test error")', {
        effectHandlers: [
          { pattern: 'dvala.*', handler: async ({ effectName, arg, resume }) => {
            resume(`caught ${effectName}: ${arg}`)
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 'caught dvala.error: test error' })
    })

    it('catch-all * catches runtime errors', async () => {
      const result = await dvala.runAsync('perform(@dvala.error, "boom")', {
        effectHandlers: [
          { pattern: '*', handler: async ({ effectName, resume }) => {
            resume(`caught: ${effectName}`)
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 'caught: dvala.error' })
    })

    it('exact dvala.error handler still works', async () => {
      const result = await dvala.runAsync('perform(@dvala.error, "oops")', {
        effectHandlers: [
          { pattern: 'dvala.error', handler: async ({ arg, resume }) => {
            resume(`error: ${arg}`)
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 'error: oops' })
    })

    it('next() in dvala.error handler chain', async () => {
      const log: string[] = []
      const result = await dvala.runAsync('perform(@dvala.error, "boom")', {
        effectHandlers: [
          { pattern: 'dvala.*', handler: async ({ next }) => {
            log.push('dvala-wildcard')
            next()
          } },

          { pattern: 'dvala.error', handler: async ({ arg, resume }) => {
            log.push('dvala-error-exact')
            resume(`handled: ${arg}`)
          } },
        ],
      })
      expect(result.type).toBe('completed')
      expect(log).toEqual(['dvala-wildcard', 'dvala-error-exact'])
    })
  })

  describe('registration order determines chain order', () => {
    it('handlers are called in the order they were registered', async () => {
      const log: string[] = []
      const handlers: Handlers = [
        { pattern: 'my.effect', handler: async ({ next }) => {
          log.push('first-exact')
          next()
        } },
        { pattern: 'my.*', handler: async ({ next }) => {
          log.push('second-wildcard')
          next()
        } },
        { pattern: '*', handler: async ({ resume }) => {
          log.push('third-catchall')
          resume('done')
        } },
      ]

      const result = await dvala.runAsync('perform(@my.effect, "val")', { effectHandlers: handlers })
      expect(result).toMatchObject({ type: 'completed', value: 'done' })
      expect(log).toEqual(['first-exact', 'second-wildcard', 'third-catchall'])
    })
  })

  describe('async handlers with next()', () => {
    it('handlers can be async and still chain with next()', async () => {
      const log: string[] = []
      const result = await dvala.runAsync('perform(@my.effect, 10)', {
        effectHandlers: [
          { pattern: '*', handler: async ({ next }) => {
            await new Promise(resolve => setTimeout(resolve, 10))
            log.push('async-middleware')
            next()
          } },

          { pattern: 'my.effect', handler: async ({ arg, resume }) => {
            await new Promise(resolve => setTimeout(resolve, 10))
            log.push('async-handler')
            resume((arg as number) * 2)
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 20 })
      expect(log).toEqual(['async-middleware', 'async-handler'])
    })
  })
})

// =========================================================================
// Unit tests for generateUUID
// =========================================================================
describe('generateUUID', () => {
  it('should return a UUID string', () => {
    const id = generateUUID()
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })

  it('should return unique values on each call', () => {
    const ids = new Set(Array.from({ length: 10 }, () => generateUUID()))
    expect(ids.size).toBe(10)
  })

  it('should use fallback when crypto.randomUUID is unavailable', () => {
    const originalCrypto = globalThis.crypto
    try {
      Object.defineProperty(globalThis, 'crypto', { value: undefined, writable: true, configurable: true })
      const id = generateUUID()
      expect(typeof id).toBe('string')
      expect(id).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/)
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: originalCrypto, writable: true, configurable: true })
    }
  })
})

// =========================================================================
// Unit tests for qualifiedNameMatchesPattern and findMatchingHandlers
// =========================================================================
describe('qualifiedNameMatchesPattern', () => {
  it('exact match', () => {
    expect(qualifiedNameMatchesPattern('dvala.error', 'dvala.error')).toBe(true)
    expect(qualifiedNameMatchesPattern('dvala.io.print', 'dvala.error')).toBe(false)
  })

  it('wildcard suffix matches prefix itself', () => {
    expect(qualifiedNameMatchesPattern('dvala', 'dvala.*')).toBe(true)
  })

  it('wildcard suffix matches children', () => {
    expect(qualifiedNameMatchesPattern('dvala.error', 'dvala.*')).toBe(true)
    expect(qualifiedNameMatchesPattern('dvala.io.print', 'dvala.*')).toBe(true)
  })

  it('wildcard suffix matches deeply nested', () => {
    expect(qualifiedNameMatchesPattern('dvala.log.verbose', 'dvala.*')).toBe(true)
  })

  it('wildcard suffix enforces dot boundary', () => {
    expect(qualifiedNameMatchesPattern('dvalaXXX', 'dvala.*')).toBe(false)
    expect(qualifiedNameMatchesPattern('dvala-extra', 'dvala.*')).toBe(false)
  })

  it('catch-all * matches everything', () => {
    expect(qualifiedNameMatchesPattern('anything', '*')).toBe(true)
    expect(qualifiedNameMatchesPattern('a.b.c.d', '*')).toBe(true)
    expect(qualifiedNameMatchesPattern('', '*')).toBe(true)
  })

  it('no wildcard requires exact match', () => {
    expect(qualifiedNameMatchesPattern('dvala.error', 'dvala')).toBe(false)
    expect(qualifiedNameMatchesPattern('dvala', 'dvala')).toBe(true)
  })
})

describe('findMatchingHandlers', () => {
  const dummyHandler = async () => {}

  it('returns empty for undefined handlers', () => {
    expect(findMatchingHandlers('test', undefined)).toEqual([])
  })

  it('returns empty for no match', () => {
    const handlers: Handlers = [{ pattern: 'other.effect', handler: dummyHandler }]
    expect(findMatchingHandlers('test.effect', handlers)).toEqual([])
  })

  it('returns exact match', () => {
    const handlers: Handlers = [{ pattern: 'test.effect', handler: dummyHandler }]
    const result = findMatchingHandlers('test.effect', handlers)
    expect(result).toHaveLength(1)
    expect(result[0]![0]).toBe('test.effect')
  })

  it('returns multiple matching handlers in registration order', () => {
    const handlers: Handlers = [
      { pattern: '*', handler: dummyHandler },
      { pattern: 'test.*', handler: dummyHandler },
      { pattern: 'test.effect', handler: dummyHandler },
    ]

    const result = findMatchingHandlers('test.effect', handlers)
    expect(result).toHaveLength(3)
    expect(result.map(([p]) => p)).toEqual(['*', 'test.*', 'test.effect'])
  })
})

describe('shallow handler', () => {
  it('handles a single effect and resumes correctly', () => {
    const result = dvala.run(`
      let h = shallow handler
        @test.eff() -> resume(42)
      end;
      h(-> perform(@test.eff))
    `)
    expect(result).toBe(42)
  })

  it('does NOT reinstall after resume (unlike deep handler)', () => {
    // A shallow handler handles exactly one effect then is gone.
    // The continuation runs bare — so a second perform would be unhandled.
    expect(() =>
      dvala.run(`
        let h = shallow handler
          @test.eff() -> resume(1)
        end;
        h(-> do
          perform(@test.eff);
          perform(@test.eff)
        end)
      `),
    ).toThrow('Unhandled effect')
  })

  it('implements state threading via recursive re-application', () => {
    // Each effect handling step re-applies the handler with updated state.
    // Both clauses can use the same variable name (each clause has its own scope).
    const result = dvala.run(`
      let withState = (s) ->
        shallow handler
          @state.get() -> do
            let k = resume;
            withState(s)(-> k(s))
          end
          @state.set(v) -> do
            let k = resume;
            withState(v)(-> k(null))
          end
        end;
      withState(0)(-> do
        perform(@state.set, 1);
        perform(@state.get)
      end)
    `)
    expect(result).toBe(1)
  })

  it('state: multiple sets and gets thread correctly', () => {
    const result = dvala.run(`
      let withState = (s) ->
        shallow handler
          @state.get() -> do
            let k = resume;
            withState(s)(-> k(s))
          end
          @state.set(v) -> do
            let k = resume;
            withState(v)(-> k(null))
          end
        end;
      withState(0)(-> do
        perform(@state.set, 10);
        perform(@state.set, 20);
        perform(@state.set, 30);
        perform(@state.get)
      end)
    `)
    expect(result).toBe(30)
  })

  it('transform applies when no effects are performed (normal exit)', () => {
    // When the computation exits without triggering any effects, the transform fires.
    const result = dvala.run(`
      let h = shallow handler
        @test.eff() -> resume(5)
        transform x -> x * 10
      end;
      h(-> 7)
    `)
    expect(result).toBe(70)
  })

  it('transform does NOT re-apply when effect is handled via resume (Eff semantics)', () => {
    // Shallow handler: when an effect is handled, the clause body's return value is the
    // result — the original handler's transform is not re-applied (unlike deep handlers).
    // This mirrors Eff/Koka shallow handler semantics.
    const result = dvala.run(`
      let h = shallow handler
        @test.eff() -> resume(5)
        transform x -> x * 10
      end;
      h(-> perform(@test.eff))
    `)
    // No transform: clause body returns 5 directly (resume(5) returns to clause, clause returns 5)
    expect(result).toBe(5)
  })

  it('shallow handler: bare resume is captured as first-class value', () => {
    const result = dvala.run(`
      let captured = null;
      let h = shallow handler
        @test.eff() -> do
          let k = resume;
          k(99)
        end
      end;
      h(-> perform(@test.eff))
    `)
    expect(result).toBe(99)
  })
})

describe('handler clause scope isolation', () => {
  it('two clauses can use the same variable name (each clause has own scope)', () => {
    // Each handler clause gets an independent scope — `let k` in clause A
    // must not conflict with `let k` in clause B, even on the same handler.
    // Uses deep handler (state doesn't thread — returns 0), but must not crash.
    const result = dvala.run(`
      let h = handler
        @a() -> do let k = resume; k(1) end
        @b() -> do let k = resume; k(2) end
      end;
      h(-> do perform(@a); perform(@b) end)
    `)
    expect(result).toBe(2)
  })

  it('same-name let k works in shallow handler state threading', () => {
    const result = dvala.run(`
      let withState = (s) ->
        shallow handler
          @state.get() -> do
            let k = resume;
            withState(s)(-> k(s))
          end
          @state.set(v) -> do
            let k = resume;
            withState(v)(-> k(null))
          end
        end;
      withState(0)(-> do
        perform(@state.set, 99);
        perform(@state.get)
      end)
    `)
    expect(result).toBe(99)
  })
})
