import { describe, expect, it, vi } from 'vitest'
import { createDvala } from '../src/createDvala'
import { resume as resumeContinuation } from '../src/resume'
import type { Handlers } from '../src/evaluator/effectTypes'
import { effectNameMatchesPattern, findMatchingHandlers, generateRunId } from '../src/evaluator/effectTypes'
import { mathUtilsModule } from '../src/builtin/modules/math'

const dvala = createDvala()

describe('phase 2 — Local Effect Handling', () => {
  describe('2a: effect(name) special expression', () => {
    it('should return an effect reference', () => {
      const result = dvala.run('effect(dvala.io.println)')
      expect(result).toHaveProperty('name', 'dvala.io.println')
    })

    it('should support dotted names', () => {
      const result = dvala.run('effect(llm.complete)')
      expect(result).toHaveProperty('name', 'llm.complete')
    })

    it('should support deeply dotted names', () => {
      const result = dvala.run('effect(com.myco.human.approve)')
      expect(result).toHaveProperty('name', 'com.myco.human.approve')
    })

    it('should support single-part names', () => {
      const result = dvala.run('effect(simple)')
      expect(result).toHaveProperty('name', 'simple')
    })

    it('should return the same reference for the same name', () => {
      const result = dvala.run('==(effect(llm.complete), effect(llm.complete))')
      expect(result).toBe(true)
    })

    it('should return different references for different names', () => {
      const result = dvala.run('==(effect(llm.complete), effect(llm.summarize))')
      expect(result).toBe(false)
    })

    it('should be a first-class value (stored in variables)', () => {
      const result = dvala.run(`
        let eff = effect(llm.complete);
        eff
      `)
      expect(result).toHaveProperty('name', 'llm.complete')
    })
  })

  describe('2b: perform(eff, ...args) special expression', () => {
    it('should perform an effect with a local handler', () => {
      const result = dvala.run(`
        do
          perform(effect(my.effect), "hello")
        with
          case effect(my.effect) then ([msg]) -> upper-case(msg)
        end
      `)
      expect(result).toBe('HELLO')
    })

    it('should perform an effect with no arguments', () => {
      const result = dvala.run(`
        do
          perform(effect(my.value))
        with
          case effect(my.value) then ([]) -> 42
        end
      `)
      expect(result).toBe(42)
    })

    it('should perform an effect with multiple arguments', () => {
      const result = dvala.run(`
        do
          perform(effect(my.add), 10, 20)
        with
          case effect(my.add) then ([a, b]) -> a + b
        end
      `)
      expect(result).toBe(30)
    })

    it('should pass arguments as an array to the handler', () => {
      const result = dvala.run(`
        do
          perform(effect(my.count), "a", "b", "c")
        with
          case effect(my.count) then (args) -> count(args)
        end
      `)
      expect(result).toBe(3)
    })

    it('should throw on unhandled effect', () => {
      expect(() => dvala.run('perform(effect(unhandled.effect), "arg")')).toThrow('Unhandled effect')
    })

    it('should use effect references from variables', () => {
      const result = dvala.run(`
        let eff = effect(my.effect);
        do
          perform(eff, "world")
        with
          case eff then ([msg]) -> "hello " ++ msg
        end
      `)
      expect(result).toBe('hello world')
    })
  })

  describe('2c: TryWithFrame handler dispatch', () => {
    it('should match handlers by effect name', () => {
      const result = dvala.run(`
        do
          perform(effect(a), 1) + perform(effect(b), 2)
        with
          case effect(a) then ([x]) -> x * 10
          case effect(b) then ([x]) -> x * 100
        end
      `)
      expect(result).toBe(210) // 10 + 200
    })

    it('should use the first matching handler', () => {
      const result = dvala.run(`
        let eff = effect(my.eff);
        do
          perform(eff, "test")
        with
          case eff then ([x]) -> "first: " ++ x
          case eff then ([x]) -> "second: " ++ x
        end
      `)
      expect(result).toBe('first: test')
    })

    it('should delegate to outer try/with when no local match', () => {
      const result = dvala.run(`
        do
          do
            perform(effect(outer.eff), "value")
          with
            case effect(inner.eff) then ([x]) -> "inner: " ++ x
          end
        with
          case effect(outer.eff) then ([x]) -> "outer: " ++ x
        end
      `)
      expect(result).toBe('outer: value')
    })

    it('should nest try/with blocks correctly', () => {
      const result = dvala.run(`
        do
          let a = do
            perform(effect(inner), "a")
          with
            case effect(inner) then ([x]) -> "inner(" ++ x ++ ")"
          end;
          a ++ " + " ++ perform(effect(outer), "b")
        with
          case effect(outer) then ([x]) -> "outer(" ++ x ++ ")"
        end
      `)
      expect(result).toBe('inner(a) + outer(b)')
    })

    it('should remove TryWithFrame after match — handlers run outside scope', () => {
      // If the handler calls perform with the same effect, it should NOT match
      // the same try/with (the frame was removed). It should either match an
      // outer handler or fail as unhandled.
      const result = dvala.run(`
        do
          do
            perform(effect(my.eff), "original")
          with
            case effect(my.eff) then ([x]) -> perform(effect(my.eff), x ++ "+delegated")
          end
        with
          case effect(my.eff) then ([x]) -> "caught: " ++ x
        end
      `)
      expect(result).toBe('caught: original+delegated')
    })

    it('should allow handler return value to be the resume value', () => {
      const result = dvala.run(`
        do
          let x = perform(effect(my.eff), 5);
          x * 2
        with
          case effect(my.eff) then ([n]) -> n + 10
        end
      `)
      expect(result).toBe(30) // (5 + 10) * 2
    })

    it('should allow effects inside handler body (delegating to outer)', () => {
      const result = dvala.run(`
        do
          do
            perform(effect(my.eff), "msg")
          with
            case effect(my.eff) then ([x]) -> perform(effect(dvala.io.println), x)
          end
        with
          case effect(dvala.io.println) then ([x]) -> "logged: " ++ x
        end
      `)
      expect(result).toBe('logged: msg')
    })

    it('should skip TryWithFrame on success (no effect performed)', () => {
      const result = dvala.run(`
        do
          42
        with
          case effect(my.eff) then ([x]) -> x * 100
        end
      `)
      expect(result).toBe(42)
    })
  })

  describe('2d: effects and dvala.error interaction', () => {
    it('errors without dvala.error handler propagate as unhandled', () => {
      // perform(effect(dvala.error), "boom") routes through dvala.error, but no handler → propagates
      expect(() => dvala.run(`
        do
          perform(effect(dvala.error), "boom")
        with
          case effect(my.eff) then ([x]) -> x
        end
      `)).toThrow('boom')
    })

    it('effects handled by matching handler; dvala.error not invoked on success', () => {
      const result = dvala.run(`
        do
          perform(effect(my.eff), "data")
        with
          case effect(my.eff) then ([x]) -> "handled: " ++ x
        end
      `)
      expect(result).toBe('handled: data')
    })

    it('errors from handlers propagate past inner scope to outer dvala.error handler', () => {
      const result = dvala.run(`
        do
          do
            perform(effect(my.eff), "data")
          with
            case effect(my.eff) then ([x]) -> perform(effect(dvala.error), "handler error: " ++ x)
          end
        with
          case effect(dvala.error) then ([msg]) -> "outer catch: " ++ msg
        end
      `)
      // The error from the handler should NOT be caught by any inner scope.
      // It should propagate to the outer dvala.error handler.
      expect(result).toBe('outer catch: handler error: data')
    })

    it('body errors caught by dvala.error handler when present', () => {
      const result = dvala.run(`
        do
          perform(effect(dvala.error), "body error")
        with
          case effect(my.eff) then ([x]) -> x
          case effect(dvala.error) then ([msg]) -> "caught: " ++ msg
        end
      `)
      expect(result).toBe('caught: body error')
    })

    it('effects handled; dvala.error handler not invoked when no error', () => {
      const result = dvala.run(`
        do
          perform(effect(my.eff), "hello")
        with
          case effect(my.eff) then ([x]) -> upper-case(x)
          case effect(dvala.error) then ([msg]) -> "caught: " ++ msg
        end
      `)
      expect(result).toBe('HELLO')
    })

    it('errors bypass non-dvala.error handlers and reach outer dvala.error handler', () => {
      const result = dvala.run(`
        do
          do
            do
              perform(effect(dvala.error), "body boom")
            end
          with
            case effect(my.eff) then ([x]) -> x
          end
        with
          case effect(dvala.error) then ([msg]) -> "caught: " ++ msg
        end
      `)
      expect(result).toBe('caught: body boom')
    })

    it('unhandled effect error caught by dvala.error handler', () => {
      const result = dvala.run(`
        do
          perform(effect(no.handler), "data")
        with
          case effect(dvala.error) then ([msg]) -> "caught: " ++ msg
        end
      `)
      expect(result).toBe('caught: Unhandled effect: \'no.handler\'')
    })
  })

  describe('2e: effects as first-class values', () => {
    it('should pass effect references as function arguments', () => {
      const result = dvala.run(`
        let handle-it = (eff, value) ->
          do
            perform(eff, value)
          with
            case eff then ([x]) -> x * 2
          end;
        handle-it(effect(my.eff), 21)
      `)
      expect(result).toBe(42)
    })

    it('should store effect references in data structures', () => {
      const result = dvala.run(`
        let effects = [effect(a), effect(b)];
        do
          perform(effects[0], 1) + perform(effects[1], 2)
        with
          case effect(a) then ([x]) -> x * 10
          case effect(b) then ([x]) -> x * 100
        end
      `)
      expect(result).toBe(210)
    })

    it('should compare effect references correctly', () => {
      const result = dvala.run(`
        let eff1 = effect(same.name);
        let eff2 = effect(same.name);
        let eff3 = effect(different.name);
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
      const result = dvalaWithMath.run('let m = import(math); m.ln(1)')
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
      const result = await dvalaWithMath.runAsync('let m = import(math); m.ln(1)')
      expect(result).toMatchObject({ type: 'completed', value: 0 })
    })

    it('should return error result for runtime errors', async () => {
      const result = await dvala.runAsync('perform(effect(dvala.error), "boom")')
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
        perform(effect(my.double), 21)
      `, {
        effectHandlers: [
          { pattern: 'my.double', handler: async ({ args, resume: doResume }) => {
            doResume((args[0] as number) * 2)
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 42 })
    })

    it('should resume with a computed value', async () => {
      const result = await dvala.runAsync(`
        let msg = perform(effect(my.greet), "world");
        msg
      `, {
        effectHandlers: [
          { pattern: 'my.greet', handler: async ({ args, resume: doResume }) => {
            doResume(`Hello, ${args[0]}!`)
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 'Hello, world!' })
    })

    it('should handle multiple host effects sequentially', async () => {
      const result = await dvala.runAsync(`
        let a = perform(effect(my.add), 10, 20);
        let b = perform(effect(my.add), a, 12);
        b
      `, {
        effectHandlers: [
          { pattern: 'my.add', handler: async ({ args, resume: doResume }) => {
            doResume((args[0] as number) + (args[1] as number))
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 42 })
    })

    it('should resume with no-arg effect', async () => {
      const result = await dvala.runAsync(`
        perform(effect(my.now))
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
        perform(effect(my.fetch), "data")
      `, {
        effectHandlers: [
          { pattern: 'my.fetch', handler: async ({ args, resume: doResume }) => {
            const value = await Promise.resolve(`fetched: ${args[0]}`)
            doResume(value)
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 'fetched: data' })
    })

    it('should resume with a promise value directly', async () => {
      const result = await dvala.runAsync(`
        perform(effect(my.delayed), 42)
      `, {
        effectHandlers: [
          { pattern: 'my.delayed', handler: async ({ args, resume: doResume }) => {
            doResume(Promise.resolve(args[0]!))
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 42 })
    })

    it('should handle async errors from promise resume', async () => {
      const result = await dvala.runAsync(`
        do
          perform(effect(my.fail), "oops")
        with
          case effect(dvala.error) then ([msg]) -> "caught: " ++ msg
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
      const result = await dvala.runAsync('perform(effect(no.handler), "data")')
      expect(result.type).toBe('error')
      if (result.type === 'error') {
        expect(result.error.message).toContain('Unhandled effect: \'no.handler\'')
      }
    })

    it('should return error for unhandled effect with non-matching handlers', async () => {
      const result = await dvala.runAsync('perform(effect(missing.handler), "x")', {
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
          perform(effect(my.fail))
        with
          case effect(dvala.error) then ([msg]) -> "caught: " ++ msg
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
        perform(effect(my.fail))
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
    it('should use local try/with handler instead of host handler', async () => {
      const result = await dvala.runAsync(`
        do
          perform(effect(my.eff), "test")
        with
          case effect(my.eff) then ([x]) -> "local: " ++ x
        end
      `, {
        effectHandlers: [
          { pattern: 'my.eff', handler: async ({ args, resume: doResume }) => {
            doResume(`host: ${args[0]}`)
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 'local: test' })
    })

    it('should delegate to host handler when local handler does not match', async () => {
      const result = await dvala.runAsync(`
        do
          perform(effect(other.eff), "test")
        with
          case effect(my.eff) then ([x]) -> "local: " ++ x
        end
      `, {
        effectHandlers: [
          { pattern: 'other.eff', handler: async ({ args, resume: doResume }) => {
            doResume(`host: ${args[0]}`)
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 'host: test' })
    })

    it('should delegate from local handler to host handler via perform', async () => {
      const result = await dvala.runAsync(`
        do
          perform(effect(my.eff), "msg")
        with
          case effect(my.eff) then ([x]) -> perform(effect(my.eff), x ++ "+enriched")
        end
      `, {
        effectHandlers: [
          { pattern: 'my.eff', handler: async ({ args, resume: doResume }) => {
            doResume(`host(${args[0]})`)
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 'host(msg+enriched)' })
    })
  })

  describe('3b: host handler — suspend', () => {
    it('should return suspended result when handler calls suspend', async () => {
      const result = await dvala.runAsync(`
        let x = perform(effect(my.wait), "please approve");
        "approved: " ++ x
      `, {
        effectHandlers: [
          { pattern: 'my.wait', handler: async ({ args, suspend }) => {
            suspend({ payload: args[0] })
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
        perform(effect(my.pause))
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

  describe('3c: AbortSignal', () => {
    it('should provide an abort signal to the handler', async () => {
      let receivedSignal: AbortSignal | undefined
      const result = await dvala.runAsync(`
        perform(effect(my.check))
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
        let llm = effect(llm.complete);
        let summary = perform(llm, "Summarize this doc");
        let critique = perform(llm, "Critique: " ++ summary);
        { summary: summary, critique: critique }
      `, {
        effectHandlers: [
          { pattern: 'llm.complete', handler: async ({ args, resume: doResume }) => {
            log.push(args[0] as string)
            doResume(`[result for: ${args[0]}]`)
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
        let llm = effect(llm.complete);
        let log-eff = effect(my.log);

        do
          let msg = perform(llm, "prompt");
          perform(log-eff, msg)
        with
          case log-eff then ([msg]) -> "logged: " ++ msg
        end
      `, {
        effectHandlers: [
          { pattern: 'llm.complete', handler: async ({ args, resume: doResume }) => {
            doResume(`LLM says: ${args[0]}`)
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 'logged: LLM says: prompt' })
    })

    it('should handle dvala.error handler around host effect', async () => {
      const result = await dvala.runAsync(`
        do
          perform(effect(my.risky))
        with
          case effect(dvala.error) then ([msg]) -> "recovered: " ++ msg
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
        let result = perform(effect(my.compute), x, y);
        result
      `, {
        bindings: { x: 10, y: 32 },
        effectHandlers: [
          { pattern: 'my.compute', handler: async ({ args, resume: doResume }) => {
            doResume((args[0] as number) + (args[1] as number))
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 42 })
    })

    it('should handle the LLM example from the API contract', async () => {
      const result = await dvala.runAsync(`
        let llm     = effect(llm.complete);
        let approve = effect(com.myco.human.approve);

        let report   = perform(llm, "Generate Q4 report");
        let decision = perform(approve, report);

        if decision.approved then
          perform(llm, "Finalize: " ++ report)
        else
          "Rejected: " ++ decision.reason
        end
      `, {
        effectHandlers: [
          { pattern: 'llm.complete', handler: async ({ args, resume: doResume }) => {
            doResume(`[LLM: ${args[0]}]`)
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
        let llm     = effect(llm.complete);
        let approve = effect(com.myco.human.approve);

        let report   = perform(llm, "Generate Q4 report");
        let decision = perform(approve, report);

        if decision.approved then
          perform(llm, "Finalize: " ++ report)
        else
          "Rejected: " ++ decision.reason
        end
      `, {
        effectHandlers: [
          { pattern: 'llm.complete', handler: async ({ args, resume: doResume }) => {
            doResume(`[LLM: ${args[0]}]`)
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
        perform(effect(my.wait), "data")
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
        perform(effect(my.wait), "data")
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
        expect(typeof snapshot.runId).toBe('string')
        expect(snapshot.runId.length).toBeGreaterThan(0)
        expect(snapshot.meta).toEqual({ info: 'test' })
      }
    })

    it('should include meta in the result', async () => {
      const result = await dvala.runAsync(`
        perform(effect(my.wait))
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
        perform(effect(my.wait))
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
        perform(effect(my.wait))
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
        let x = perform(effect(my.wait));
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
        perform(effect(my.wait))
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
        perform(effect(my.check))
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
        perform(effect(my.check))
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
        perform(effect(my.check))
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
        let x = perform(effect(my.save));
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
      const snap = capturedSnapshot as { timestamp: number; index: number; runId: string; meta: unknown; continuation: unknown }
      expect(snap.index).toBe(0)
      expect(typeof snap.runId).toBe('string')
      expect(typeof snap.timestamp).toBe('number')
      expect(snap.meta).toEqual({ label: 'test' })
      expect(snap.continuation).toBeDefined()
    })

    it('should accumulate snapshots in order', async () => {
      let capturedSnapshots: readonly unknown[] = []
      const result = await dvala.runAsync(`
        perform(effect(my.first));
        perform(effect(my.second))
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
        perform(effect(my.a));
        perform(effect(my.b));
        perform(effect(my.c))
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
        perform(effect(dvala.checkpoint), "cp");
        perform(effect(my.mutate));
        perform(effect(my.check))
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
        let x = perform(effect(dvala.checkpoint), "cp");
        x
      `)
      expect(result).toMatchObject({ type: 'completed', value: null })
    })

    it('should always capture a snapshot even when no handler intercepts', async () => {
      let capturedSnapshots: readonly unknown[] = []
      await dvala.runAsync(`
        perform(effect(dvala.checkpoint), "cp");
        perform(effect(my.check))
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
        perform(effect(dvala.checkpoint), "cp");
        perform(effect(my.check))
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
        perform(effect(dvala.checkpoint), "cp")
      `, {
        effectHandlers: [
          { pattern: 'dvala.checkpoint', handler: async ({ resume: r }) => { r(42) } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 42 })
    })

    it('should always capture a snapshot even when a local do...with handler intercepts', async () => {
      let capturedSnapshots: readonly unknown[] = []
      const result = await dvala.runAsync(`
        let x = do
          perform(effect(dvala.checkpoint), "cp")
        with
          case effect(dvala.checkpoint) then ([msg]) -> "from-local"
        end;
        perform(effect(my.check));
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
        perform(effect(dvala.checkpoint), "cp");
        perform(effect(my.check))
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

    it('should include metadata in snapshot from perform args', async () => {
      let capturedSnapshots: readonly unknown[] = []
      await dvala.runAsync(`
        perform(effect(dvala.checkpoint), "analysis", { step: "analysis-done" });
        perform(effect(my.check))
      `, {
        effectHandlers: [
          { pattern: 'my.check', handler: async ({ snapshots, resume: r }) => {
            capturedSnapshots = snapshots
            r(null)
          } },
        ],
      })
      expect(capturedSnapshots).toHaveLength(1)
      expect((capturedSnapshots[0] as { meta: unknown }).meta).toEqual({ step: 'analysis-done' })
    })

    it('should have no meta when called with only message', async () => {
      let capturedSnapshots: readonly unknown[] = []
      await dvala.runAsync(`
        perform(effect(dvala.checkpoint), "cp");
        perform(effect(my.check))
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
        perform(effect(dvala.checkpoint), "step 1", { step: 1 });
        perform(effect(dvala.checkpoint), "step 2", { step: 2 });
        perform(effect(dvala.checkpoint), "step 3", { step: 3 });
        perform(effect(my.check))
      `, {
        effectHandlers: [
          { pattern: 'my.check', handler: async ({ snapshots, resume: r }) => {
            capturedSnapshots = snapshots
            r(null)
          } },
        ],
      })
      expect(capturedSnapshots).toHaveLength(3)
      expect((capturedSnapshots[0] as { index: number; meta: unknown }).index).toBe(0)
      expect((capturedSnapshots[0] as { meta: unknown }).meta).toEqual({ step: 1 })
      expect((capturedSnapshots[1] as { index: number }).index).toBe(1)
      expect((capturedSnapshots[1] as { meta: unknown }).meta).toEqual({ step: 2 })
      expect((capturedSnapshots[2] as { index: number }).index).toBe(2)
      expect((capturedSnapshots[2] as { meta: unknown }).meta).toEqual({ step: 3 })
    })

    it('should work alongside ctx.checkpoint in host handler', async () => {
      let capturedSnapshots: readonly unknown[] = []
      await dvala.runAsync(`
        perform(effect(dvala.checkpoint), "from program", { from: "program" });
        perform(effect(my.save));
        perform(effect(my.check))
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
      expect((capturedSnapshots[0] as { meta: unknown }).meta).toEqual({ from: 'program' })
      expect((capturedSnapshots[1] as { meta: unknown }).meta).toEqual({ from: 'host' })
    })
  })

  describe('5: resumeFrom on EffectContext', () => {
    it('should resume execution from a previous checkpoint', async () => {
      let callCount = 0
      const result = await dvala.runAsync(`
        let x = 10;
        perform(effect(dvala.checkpoint), "cp");
        let y = perform(effect(my.action));
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
        perform(effect(dvala.checkpoint), "cp");
        let y = perform(effect(my.get_value));
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
        perform(effect(dvala.checkpoint), "step 1", { step: 1 });
        perform(effect(dvala.checkpoint), "step 2", { step: 2 });
        perform(effect(dvala.checkpoint), "step 3", { step: 3 });
        perform(effect(my.action))
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
        perform(effect(dvala.checkpoint), "step 1", { step: 1 });
        perform(effect(dvala.checkpoint), "step 2", { step: 2 });
        let x = perform(effect(my.get_value));
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
        perform(effect(my.action))
      `, {
        effectHandlers: [
          { pattern: 'my.action', handler: async ({ resumeFrom }) => {
            const fakeSnapshot = {
              continuation: {},
              timestamp: Date.now(),
              index: 999,
              runId: 'fake-run-id',
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
        perform(effect(dvala.checkpoint), "cp");
        perform(effect(my.action))
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
        perform(effect(dvala.checkpoint), "cp");
        perform(effect(my.action))
      `, {
        effectHandlers: [
          { pattern: 'my.action', handler: async ({ resume: r, resumeFrom }) => {
            r(42)
            try {
              const fakeSnapshot = { continuation: {}, timestamp: 0, index: 999, runId: 'bogus', message: 'fake' }
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
        perform(effect(dvala.checkpoint), "step 1", { step: 1 });
        perform(effect(dvala.checkpoint), "step 2", { step: 2 });
        perform(effect(my.action))
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
        perform(effect(dvala.checkpoint), "cp");
        let y = perform(effect(my.action));
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
        let m = import(math);
        perform(effect(dvala.checkpoint), "cp");
        let y = perform(effect(my.action));
        m.ln(y)
      `, {
        effectHandlers: [
          { pattern: 'my.action', handler: async ({ resume: r, snapshots, resumeFrom }) => {
            callCount++
            if (callCount === 1) {
              resumeFrom(snapshots[0]!, 0)
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
        let llm = effect(llm.complete);
        let a = perform(llm, "step1");
        let b = perform(llm, "step2");
        a ++ " " ++ b
      `, {
        effectHandlers: [
          { pattern: 'llm.complete', handler: async ({ args, resume: r, checkpoint }) => {
            const snap = checkpoint('prompt', { prompt: args[0] })
            checkpoints.push(snap)
            r(`result-of-${args[0]}`)
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
        perform(effect(dvala.checkpoint), "step 1", { step: 1 });
        let x = perform(effect(my.step));
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
        perform(effect(dvala.checkpoint), "step 1", { step: 1 });
        perform(effect(dvala.checkpoint), "step 2", { step: 2 });
        let x = perform(effect(my.step));
        perform(effect(my.check));
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
      expect((capturedSnapshots[0] as { meta: unknown }).meta).toEqual({ step: 1 })
      expect((capturedSnapshots[1] as { meta: unknown }).meta).toEqual({ step: 2 })
    })

    it('should append new snapshots after resume with correct indices', async () => {
      let capturedSnapshots: readonly unknown[] = []
      const handlers: Handlers = [
        { pattern: 'my.step', handler: async ({ suspend }) => { suspend() } },
      ]

      // Take one checkpoint (index 0), then suspend
      const r1 = await dvala.runAsync(`
        perform(effect(dvala.checkpoint), "step 1", { step: 1 });
        let x = perform(effect(my.step));
        perform(effect(dvala.checkpoint), "after resume", { step: "after-resume" });
        perform(effect(my.check));
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
      expect((capturedSnapshots[0] as { index: number; meta: unknown }).meta).toEqual({ step: 1 })
      const newSnap = capturedSnapshots[1] as { index: number; meta: unknown }
      expect(newSnap.meta).toEqual({ step: 'after-resume' })
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
        perform(effect(dvala.checkpoint), "step 1", { step: 1 });
        let x = perform(effect(my.step));
        let y = perform(effect(my.action));
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
        perform(effect(dvala.checkpoint), "step 1", { step: 1 });
        let x = perform(effect(my.step));
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
        perform(effect(dvala.checkpoint), "step 1", { step: 1 });
        perform(effect(dvala.checkpoint), "step 2", { step: 2 });
        perform(effect(dvala.checkpoint), "step 3", { step: 3 });
        perform(effect(dvala.checkpoint), "step 4", { step: 4 });
        perform(effect(dvala.checkpoint), "step 5", { step: 5 });
        perform(effect(my.check))
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
        perform(effect(dvala.checkpoint), "step 1", { step: 1 });
        perform(effect(dvala.checkpoint), "step 2", { step: 2 });
        perform(effect(dvala.checkpoint), "step 3", { step: 3 });
        perform(effect(dvala.checkpoint), "step 4", { step: 4 });
        perform(effect(my.check))
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
      expect((capturedSnapshots[0] as { meta: unknown }).meta).toEqual({ step: 2 })
      expect((capturedSnapshots[1] as { meta: unknown }).meta).toEqual({ step: 3 })
      expect((capturedSnapshots[2] as { meta: unknown }).meta).toEqual({ step: 4 })
    })

    it('should evict from host checkpoint when maxSnapshots is exceeded', async () => {
      let capturedSnapshots: readonly unknown[] = []
      await dvala.runAsync(`
        perform(effect(dvala.checkpoint), "step 1", { step: 1 });
        perform(effect(dvala.checkpoint), "step 2", { step: 2 });
        perform(effect(my.save));
        perform(effect(my.check))
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
      expect((capturedSnapshots[0] as { meta: unknown }).meta).toEqual({ step: 2 })
      expect((capturedSnapshots[1] as { meta: unknown }).meta).toEqual({ step: 'host' })
    })

    it('should fail gracefully when resumeFrom targets an evicted snapshot', async () => {
      let callCount = 0
      const result = await dvala.runAsync(`
        perform(effect(dvala.checkpoint), "step 1", { step: 1 });
        perform(effect(dvala.checkpoint), "step 2", { step: 2 });
        perform(effect(dvala.checkpoint), "step 3", { step: 3 });
        perform(effect(my.action))
      `, {
        maxSnapshots: 2,
        effectHandlers: [
          { pattern: 'my.action', handler: async ({ resume: r, resumeFrom }) => {
            callCount++
            if (callCount === 1) {
              // Try to resumeFrom a snapshot that was evicted (step 1, index 0)
              const evictedSnapshot = {
                continuation: {},
                timestamp: Date.now(),
                index: 0,
                runId: 'will-not-match',
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
        perform(effect(dvala.checkpoint), "step 1", { step: 1 });
        perform(effect(dvala.checkpoint), "step 2", { step: 2 });
        perform(effect(dvala.checkpoint), "step 3", { step: 3 });
        perform(effect(my.check))
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
      expect((capturedSnapshots[0] as { meta: unknown }).meta).toEqual({ step: 3 })
    })
  })

  describe('9: autoCheckpoint option', () => {
    it('should capture a snapshot before each non-checkpoint effect', async () => {
      let capturedSnapshots: readonly unknown[] = []
      await dvala.runAsync(`
        perform(effect(my.a));
        perform(effect(my.b));
        perform(effect(my.check))
      `, {
        autoCheckpoint: true,
        effectHandlers: [
          { pattern: 'my.a', handler: async ({ resume: r }) => { r(null) } },
          { pattern: 'my.b', handler: async ({ resume: r }) => { r(null) } },
          { pattern: 'my.check', handler: async ({ snapshots, resume: r }) => {
            capturedSnapshots = [...snapshots]
            r(null)
          } },
        ],
      })
      // 3 auto-checkpoints: before my.a, before my.b, before my.check
      expect(capturedSnapshots).toHaveLength(3)
      expect((capturedSnapshots[0] as { message: string }).message).toBe('my.a')
      expect((capturedSnapshots[1] as { message: string }).message).toBe('my.b')
      expect((capturedSnapshots[2] as { message: string }).message).toBe('my.check')
    })

    it('should not capture auto-checkpoints when disabled', async () => {
      let capturedSnapshots: readonly unknown[] = []
      await dvala.runAsync(`
        perform(effect(my.a));
        perform(effect(my.check))
      `, {
        autoCheckpoint: false,
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

    it('should dispatch dvala.checkpoint effect to host handlers', async () => {
      const checkpointMessages: string[] = []
      await dvala.runAsync(`
        perform(effect(my.action));
        42
      `, {
        autoCheckpoint: true,
        effectHandlers: [
          { pattern: 'dvala.checkpoint', handler: async ({ args, resume: r }) => {
            checkpointMessages.push(args[0] as string)
            r(null)
          } },
          { pattern: 'my.action', handler: async ({ resume: r }) => { r(null) } },
        ],
      })
      expect(checkpointMessages).toEqual(['my.action'])
    })

    it('should not auto-checkpoint for explicit dvala.checkpoint effects', async () => {
      const checkpointMessages: string[] = []
      await dvala.runAsync(`
        perform(effect(dvala.checkpoint), "manual");
        perform(effect(my.action))
      `, {
        autoCheckpoint: true,
        effectHandlers: [
          { pattern: 'dvala.checkpoint', handler: async ({ args, resume: r }) => {
            checkpointMessages.push(args[0] as string)
            r(null)
          } },
          { pattern: 'my.action', handler: async ({ resume: r }) => { r(null) } },
        ],
      })
      // "manual" from explicit checkpoint, "my.action" from auto-checkpoint before my.action
      expect(checkpointMessages).toEqual(['manual', 'my.action'])
    })

    it('should work with maxSnapshots', async () => {
      let capturedSnapshots: readonly unknown[] = []
      await dvala.runAsync(`
        perform(effect(my.a));
        perform(effect(my.b));
        perform(effect(my.c));
        perform(effect(my.check))
      `, {
        autoCheckpoint: true,
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
      // 4 auto-checkpoints total, limit 2 — only last 2 retained
      expect(capturedSnapshots).toHaveLength(2)
      expect((capturedSnapshots[0] as { message: string }).message).toBe('my.c')
      expect((capturedSnapshots[1] as { message: string }).message).toBe('my.check')
    })

    it('should allow host handler to suspend on auto-checkpoint', async () => {
      const result = await dvala.runAsync(`
        perform(effect(my.action));
        42
      `, {
        autoCheckpoint: true,
        effectHandlers: [
          { pattern: 'dvala.checkpoint', handler: async ({ suspend }) => {
            suspend({ reason: 'auto-checkpoint intercepted' })
          } },
          { pattern: 'my.action', handler: async ({ resume: r }) => { r(null) } },
        ],
      })
      expect(result.type).toBe('suspended')
      if (result.type === 'suspended') {
        expect(result.snapshot.meta).toEqual({ reason: 'auto-checkpoint intercepted' })
      }
    })

    it('should resume correctly after auto-checkpoint suspend', async () => {
      const r1 = await dvala.runAsync(`
        let x = perform(effect(my.action));
        x * 2
      `, {
        autoCheckpoint: true,
        effectHandlers: [
          { pattern: 'dvala.checkpoint', handler: async ({ resume: r }) => { r(null) } },
          { pattern: 'my.action', handler: async ({ suspend }) => { suspend() } },
        ],
      })
      expect(r1.type).toBe('suspended')
      if (r1.type !== 'suspended') return

      const r2 = await resumeContinuation(r1.snapshot, 21)
      expect(r2).toMatchObject({ type: 'completed', value: 42 })
    })
  })

  describe('4b: resume() API', () => {
    it('should resume a simple suspended program', async () => {
      const r1 = await dvala.runAsync(`
        let k = 2;
        let x = perform(effect(my.wait));
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
        let name = perform(effect(my.ask), "What is your name?");
        "Hello, " ++ name ++ "!"
      `, {
        effectHandlers: [
          { pattern: 'my.ask', handler: async ({ suspend, args }) => { suspend({ prompt: args[0] }) } },
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
        let decision = perform(effect(my.approve), "report");
        if decision.approved then
          "Approved!"
        else
          "Rejected: " ++ decision.reason
        end
      `, {
        effectHandlers: [
          { pattern: 'my.approve', handler: async ({ suspend, args }) => { suspend({ doc: args[0] }) } },
        ],
      })
      expect(r1.type).toBe('suspended')
      if (r1.type !== 'suspended')
        return

      const r2 = await resumeContinuation(r1.snapshot, { approved: false, reason: 'Budget exceeded' })
      expect(r2).toEqual({ type: 'completed', value: 'Rejected: Budget exceeded' })
    })

    it('should resume with null value', async () => {
      const r1 = await dvala.runAsync(`
        let x = perform(effect(my.wait));
        null?(x)
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
        let c = perform(effect(my.wait));
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
        let value = perform(effect(my.wait));
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
        let value = perform(effect(my.wait));
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
        { pattern: 'my.step', handler: async ({ args, suspend }) => {
          suspend({ step: args[0] })
        } },
      ]
      const r1 = await dvala.runAsync(`
        let a = perform(effect(my.step), 1);
        let b = perform(effect(my.step), 2);
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
        let x = perform(effect(my.wait));
        perform(effect(my.compute), x)
      `, {
        effectHandlers: [
          { pattern: 'my.wait', handler: async ({ suspend }) => { suspend() } },

          { pattern: 'my.compute', handler: async ({ args, resume: r }) => { r((args[0] as number) * 2) } },
        ],
      })
      expect(r1.type).toBe('suspended')
      if (r1.type !== 'suspended')
        return

      // Resume with handlers so my.compute works
      const r2 = await resumeContinuation(r1.snapshot, 21, {
        handlers: [
          { pattern: 'my.compute', handler: async ({ args, resume: r }) => { r((args[0] as number) * 2) } },
        ],
      })
      expect(r2).toEqual({ type: 'completed', value: 42 })
    })

    it('should support bindings on resume', async () => {
      const r1 = await dvala.runAsync(`
        let x = perform(effect(my.wait));
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
      const result = await resumeContinuation({ continuation: { version: 1, k: 'bad', contextStacks: [] }, timestamp: 0, index: 0, runId: 'test', message: 'test' }, 42)
      expect(result.type).toBe('error')
    })

    it('should return error for wrong version', async () => {
      const result = await resumeContinuation({ continuation: { version: 999, k: [], contextStacks: [] }, timestamp: 0, index: 0, runId: 'test', message: 'test' }, 42)
      expect(result.type).toBe('error')
      if (result.type === 'error') {
        expect(result.error.message).toContain('Unsupported suspension blob version')
      }
    })

    it('should return error for unknown context stack ref in continuation', async () => {
      // A continuation with a __csRef pointing to a non-existent context stack
      const result = await resumeContinuation({
        continuation: {
          version: 2,
          k: [{ env: { __csRef: 999 } }],
          contextStacks: [],
        },
        timestamp: 0,
        index: 0,
        runId: 'test',
        message: 'test',
      }, 42)
      expect(result.type).toBe('error')
      if (result.type === 'error') {
        expect(result.error.message).toContain('unknown context stack ref')
      }
    })

    it('should handle errors after resume', async () => {
      const r1 = await dvala.runAsync(`
        let x = perform(effect(my.wait));
        perform(effect(dvala.error), "error: " ++ x)
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
          let x = perform(effect(my.wait));
          if x == "bad" then perform(effect(dvala.error), "bad input") else x end
        with
          case effect(dvala.error) then ([msg]) -> "caught: " ++ msg
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
        let x = perform(effect(my.wait));
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
        let report = perform(effect(llm.complete), "Generate Q4 report");
        let decision = perform(effect(com.myco.approve), report);
        if decision.approved then
          perform(effect(llm.complete), "Finalize: " ++ report)
        else
          "Rejected: " ++ decision.reason
        end
      `
      const handlers: Handlers = [
        { pattern: 'llm.complete', handler: async ({ args, resume: doResume }) => {
          doResume(`[LLM: ${args[0]}]`)
        } },

        { pattern: 'com.myco.approve', handler: async ({ args, suspend }) => {
          suspend({ payload: args[0], assignedTo: 'finance-team' })
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
      const r2 = await resumeContinuation(storedSnapshot, { approved: true, reason: null }, { handlers })
      expect(r2.type).toBe('completed')
      if (r2.type === 'completed') {
        expect(r2.value).toBe('[LLM: Finalize: [LLM: Generate Q4 report]]')
      }
    })

    it('should handle rejection in suspend-resume cycle', async () => {
      const source = `
        let x = perform(effect(my.wait));
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

      const r2 = await resumeContinuation(r1.snapshot, { approved: false, reason: 'denied' })
      expect(r2).toEqual({ type: 'completed', value: 'No: denied' })
    })

    it('should handle multi-step workflow with several suspensions', async () => {
      const source = `
        let step1 = perform(effect(my.step), "step1");
        let step2 = perform(effect(my.step), "step2");
        let step3 = perform(effect(my.step), "step3");
        [step1, step2, step3]
      `
      const handlers: Handlers = [
        { pattern: 'my.step', handler: async ({ args, suspend }) => {
          suspend({ step: args[0] })
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

    it('should work with local try/with handlers after resume', async () => {
      const r1 = await dvala.runAsync(`
        let x = perform(effect(my.wait));
        do
          perform(effect(my.local), x)
        with
          case effect(my.local) then ([v]) -> upper-case(v)
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
        let make-adder = (n) -> (x) -> n + x;
        let add5 = make-adder(5);
        let input = perform(effect(my.wait));
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
        let factor = perform(effect(my.wait));
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
        let extra = perform(effect(my.wait));
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
  describe('5a: dvala.io.println', () => {
    it('should write to stdout and return value (via Dvala.run)', () => {
      const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
      try {
        const result = dvala.run('perform(effect(dvala.io.println), "test")')
        expect(result).toBe('test')
        expect(stdoutSpy).toHaveBeenCalledWith('test\n')
      } finally {
        stdoutSpy.mockRestore()
      }
    })

    it('should log with no arguments', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      try {
        const result = await dvala.runAsync('perform(effect(dvala.io.println))')

        expect(result.type).toBe('error')
        expect(consoleSpy).not.toHaveBeenCalled()
      } finally {
        consoleSpy.mockRestore()
      }
    })

    it('should be overridable by host handler', async () => {
      const logs: unknown[][] = []
      const result = await dvala.runAsync('perform(effect(dvala.io.println), "custom")', {
        effectHandlers: [
          { pattern: 'dvala.io.println', handler: async ({ args, resume: r }) => {
            logs.push(args)
            r(null)
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: null })
      expect(logs).toEqual([['custom']])
    })

    it('should be overridable by local try/with', () => {
      const result = dvala.run(`
        do
          perform(effect(dvala.io.println), "intercepted")
        with
          case effect(dvala.io.println) then ([msg]) -> "logged: " ++ msg
        end
      `)
      expect(result).toBe('logged: intercepted')
    })
  })

  describe('5b: dvala.time.now', () => {
    it('should return a timestamp (via run)', async () => {
      const before = Date.now()
      const result = await dvala.runAsync('perform(effect(dvala.time.now))')
      const after = Date.now()
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toBeGreaterThanOrEqual(before)
        expect(result.value).toBeLessThanOrEqual(after)
      }
    })

    it('should return a timestamp (via Dvala.run sync)', () => {
      const before = Date.now()
      const result = dvala.run('perform(effect(dvala.time.now))') as number
      const after = Date.now()
      expect(result).toBeGreaterThanOrEqual(before)
      expect(result).toBeLessThanOrEqual(after)
    })

    it('should be overridable by host handler for determinism', async () => {
      const fixedTime = 1700000000000
      const result = await dvala.runAsync('perform(effect(dvala.time.now))', {
        effectHandlers: [
          { pattern: 'dvala.time.now', handler: async ({ resume: r }) => r(fixedTime) },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: fixedTime })
    })

    it('should be overridable by local try/with', () => {
      const result = dvala.run(`
        do
          perform(effect(dvala.time.now))
        with
          case effect(dvala.time.now) then ([]) -> 1234567890
        end
      `)
      expect(result).toBe(1234567890)
    })
  })

  describe('5c: dvala.random', () => {
    it('should return a number in [0, 1) (via run)', async () => {
      const result = await dvala.runAsync('perform(effect(dvala.random))')
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toBeGreaterThanOrEqual(0)
        expect(result.value).toBeLessThan(1)
      }
    })

    it('should return a number in [0, 1) (via Dvala.run sync)', () => {
      const result = dvala.run('perform(effect(dvala.random))') as number
      expect(result).toBeGreaterThanOrEqual(0)
      expect(result).toBeLessThan(1)
    })

    it('should be overridable by host handler for determinism', async () => {
      const result = await dvala.runAsync('perform(effect(dvala.random))', {
        effectHandlers: [
          { pattern: 'dvala.random', handler: async ({ resume: r }) => r(0.42) },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 0.42 })
    })

    it('should be overridable by local try/with', () => {
      const result = dvala.run(`
        do
          perform(effect(dvala.random))
        with
          case effect(dvala.random) then ([]) -> 0.5
        end
      `)
      expect(result).toBe(0.5)
    })
  })

  describe('5d: dvala.sleep', () => {
    it('should sleep and return null (via run)', async () => {
      const result = await dvala.runAsync('perform(effect(dvala.sleep), 10)')
      expect(result).toMatchObject({ type: 'completed', value: null })
    })

    it('should throw in sync context', () => {
      expect(() => dvala.run('perform(effect(dvala.sleep), 10)'))
        .toThrow()
    })

    it('should reject negative ms', async () => {
      const result = await dvala.runAsync('perform(effect(dvala.sleep), -1)')
      expect(result.type).toBe('error')
    })

    it('should reject non-number argument', async () => {
      const result = await dvala.runAsync('perform(effect(dvala.sleep), "fast")')
      expect(result.type).toBe('error')
    })

    it('should be overridable by host handler', async () => {
      let sleepMs: number | undefined
      const result = await dvala.runAsync('perform(effect(dvala.sleep), 100)', {
        effectHandlers: [
          { pattern: 'dvala.sleep', handler: async ({ args, resume: r }) => {
            sleepMs = args[0] as number
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
            perform(effect(dvala.io.println), "Starting");
            let t = perform(effect(dvala.time.now));
            let r = perform(effect(dvala.random));
            perform(effect(dvala.io.println), "Done");
            { time: number?(t), random: number?(r) }
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
            perform(effect(dvala.io.println), "Before suspend");
            let input = perform(effect(my.wait));
            perform(effect(dvala.io.println), "After resume: " ++ input);
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
        expect(stdoutSpy).toHaveBeenCalledWith('Before suspend\n')
        stdoutSpy.mockClear()

        const r2 = await resumeContinuation(r1.snapshot, 'hello')
        expect(r2).toEqual({ type: 'completed', value: 'hello' })
        expect(stdoutSpy).toHaveBeenCalledTimes(1)
        expect(stdoutSpy).toHaveBeenCalledWith('After resume: hello\n')
      } finally {
        stdoutSpy.mockRestore()
      }
    })

    it('should allow overriding all standard effects for testing', async () => {
      const fixedTime = 1700000000000
      const result = await dvala.runAsync(`
        { now: perform(effect(dvala.time.now)), rnd: perform(effect(dvala.random)) }
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
            perform(effect(dvala.io.println), "sync log");
            let t = perform(effect(dvala.time.now));
            let r = perform(effect(dvala.random));
            number?(t) && number?(r)
          end
        `)
        expect(result).toBe(true)
        expect(stdoutSpy).toHaveBeenCalledWith('sync log\n')
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
          perform(effect(slow.op), "first"),
          perform(effect(fast.op), "second")
        )
      `, {
        effectHandlers: [
          { pattern: 'slow.op', handler: async ({ args, resume: res }) => {
            await new Promise(resolve => setTimeout(resolve, 50))
            res(`slow:${args[0]}`)
          } },

          { pattern: 'fast.op', handler: async ({ args, resume: res }) => {
            await new Promise(resolve => setTimeout(resolve, 10))
            res(`fast:${args[0]}`)
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
        let llm = effect(llm.complete);
        parallel(
          perform(llm, "Summarize"),
          perform(llm, "Critique"),
          perform(llm, "Keywords")
        )
      `, {
        effectHandlers: [
          { pattern: 'llm.complete', handler: async ({ args, resume: res }) => {
            res(`result:${args[0]}`)
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
          perform(effect(dvala.error), "branch error"),
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
          perform(effect(dvala.random)),
          perform(effect(dvala.random))
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
          perform(effect(llm), "task1"),
          perform(effect(llm), "task2"),
          perform(effect(llm), "task3")
        );
        { a: a, b: b, c: c }
      `, {
        effectHandlers: [
          { pattern: 'llm', handler: async ({ args, resume: res }) => {
            res(`done:${args[0]}`)
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
            perform(effect(fast.op)),
            perform(effect(needs.approval))
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
            perform(effect(fast.op)),
            perform(effect(needs.approval))
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
            perform(effect(approval.a)),
            perform(effect(approval.b)),
            perform(effect(approval.c))
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
            perform(effect(slow.approve)),
            perform(effect(fast)),
            perform(effect(slow.approve))
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
          { pattern: 'ask.human', handler: async ({ args, suspend }) => {
            suspend({ question: args[0] })
          } },
        ]

        let result = await dvala.runAsync(`
          parallel(
            perform(effect(ask.human), "Q1"),
            perform(effect(ask.human), "Q2"),
            perform(effect(ask.human), "Q3")
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
          perform(effect(slow.op), "tortoise"),
          perform(effect(fast.op), "hare")
        )
      `, {
        effectHandlers: [
          { pattern: 'slow.op', handler: async ({ args, resume: res }) => {
            await new Promise(resolve => setTimeout(resolve, 50))
            res(`slow:${args[0]}`)
          } },

          { pattern: 'fast.op', handler: async ({ args, resume: res }) => {
            res(`fast:${args[0]}`)
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 'fast:hare' })
    })

    it('should return the first completed even if others error', async () => {
      const result = await dvala.runAsync(`
        race(
          perform(effect(fail.op)),
          perform(effect(ok.op))
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
          perform(effect(dvala.error), "error-1"),
          perform(effect(dvala.error), "error-2")
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
        race(perform(effect(op), "only"))
      `, {
        effectHandlers: [
          { pattern: 'op', handler: async ({ args, resume: res }) => {
            res(`result:${args[0]}`)
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 'result:only' })
    })

    it('should suspend if all branches suspend (none complete)', async () => {
      const result = await dvala.runAsync(`
        race(
          perform(effect(slow.a)),
          perform(effect(slow.b))
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
          perform(effect(slow.a)),
          perform(effect(slow.b))
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
          perform(effect(suspend.op)),
          perform(effect(complete.op))
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
          perform(effect(fast.op)),
          perform(effect(slow.op))
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
          perform(effect(op.a)),
          perform(effect(op.b))
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
          perform(effect(op), "a"),
          perform(effect(op), "b")
        );
        map(results, -> "got:" ++ $)
      `, {
        effectHandlers: [
          { pattern: 'op', handler: async ({ args, resume: res }) => { res(args[0]!) } },
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
            perform(effect(slow), "a"),
            perform(effect(fast), "b")
          ),
          race(
            perform(effect(fast), "c"),
            perform(effect(slow), "d")
          )
        )
      `, {
        effectHandlers: [
          { pattern: 'slow', handler: async ({ args, resume: res }) => {
            await new Promise(resolve => setTimeout(resolve, 50))
            res(`slow:${args[0]}`)
          } },

          { pattern: 'fast', handler: async ({ args, resume: res }) => {
            res(`fast:${args[0]}`)
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
          perform(effect(ok.op)),
          perform(effect(err.op))
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

describe('step 1 — do...with...end', () => {
  describe('basic do...with handler', () => {
    it('should handle an effect — return value resumes the perform call', () => {
      const result = dvala.run(`
        do
          perform(effect(my.log), "hello")
        with
          case effect(my.log) then ([msg]) -> "logged: " ++ msg
        end
      `)
      expect(result).toBe('logged: hello')
    })

    it('should pass args as an array to the handler', () => {
      const result = dvala.run(`
        do
          perform(effect(my.add), 10, 20)
        with
          case effect(my.add) then ([a, b]) -> a + b
        end
      `)
      expect(result).toBe(30)
    })

    it('should work with no-arg perform', () => {
      const result = dvala.run(`
        do
          perform(effect(my.value))
        with
          case effect(my.value) then (args) -> 42
        end
      `)
      expect(result).toBe(42)
    })

    it('should resume and continue the body computation', () => {
      const result = dvala.run(`
        do
          let x = perform(effect(my.get));
          x * 2
        with
          case effect(my.get) then (args) -> 21
        end
      `)
      expect(result).toBe(42)
    })

    it('should skip do...with frame on success (no effect performed)', () => {
      const result = dvala.run(`
        do
          1 + 2
        with
          case effect(my.eff) then (args) -> 999
        end
      `)
      expect(result).toBe(3)
    })

    it('should handle multiple cases', () => {
      const result = dvala.run(`
        do
          perform(effect(a), 1) + perform(effect(b), 2)
        with
          case effect(a) then ([x]) -> x * 10
          case effect(b) then ([x]) -> x * 100
        end
      `)
      expect(result).toBe(210)
    })

    it('should delegate to outer do...with when no local match', () => {
      const result = dvala.run(`
        do
          do
            perform(effect(outer.eff), "value")
          with
            case effect(inner.eff) then ([x]) -> "inner: " ++ x
          end
        with
          case effect(outer.eff) then ([x]) -> "outer: " ++ x
        end
      `)
      expect(result).toBe('outer: value')
    })

    it('should work with effect references from variables', () => {
      const result = dvala.run(`
        let eff = effect(my.eff);
        do
          perform(eff, "world")
        with
          case eff then ([msg]) -> "hello " ++ msg
        end
      `)
      expect(result).toBe('hello world')
    })

    it('should propagate errors via perform(effect(dvala.error))', () => {
      expect(() => dvala.run(`
        do
          perform(effect(my.eff), "data")
        with
          case effect(my.eff) then (args) -> perform(effect(dvala.error), "something went wrong")
        end
      `)).toThrow('something went wrong')
    })
  })

  describe('do...with and do body scoping', () => {
    it('should see outer bindings from the body', () => {
      const result = dvala.run(`
        let prefix = "pre-";
        do
          perform(effect(my.eff), "value")
        with
          case effect(my.eff) then ([x]) -> prefix ++ x
        end
      `)
      expect(result).toBe('pre-value')
    })
  })
})

describe('step 2 — dvala.error standard effect', () => {
  it('do...with catches runtime error (NaN)', () => {
    expect(dvala.run(`
      do
        0 / 0
      with
        case effect(dvala.error) then (args) -> 42
      end
    `)).toBe(42)
  })

  it('handler receives error message as first arg', () => {
    const result = dvala.run(`
      do
        0 / 0
      with
        case effect(dvala.error) then ([msg]) -> msg
      end
    `)
    expect(result).toBe('Number is NaN')
  })

  it('handler return value resumes at the error site', () => {
    // Handler returns 0, which becomes the resume value of (0/0).
    // Execution continues: let x = 0; x + 1 => 1
    expect(dvala.run(`
      do
        let x = 0 / 0;
        x + 1
      with
        case effect(dvala.error) then (args) -> 0
      end
    `)).toBe(1)
  })

  it('unhandled runtime error still propagates when no dvala.error case', () => {
    expect(() => dvala.run(`
      do
        0 / 0
      with
        case effect(dvala.io.println) then (args) -> 42
      end
    `)).toThrow()
  })

  it('unhandled runtime error propagates when no with clause', () => {
    expect(() => dvala.run('0 / 0')).toThrow()
  })

  it('dvala.error handler does not intercept unrelated effects', () => {
    expect(dvala.run(`
      do
        perform(effect(my.eff), 99)
      with
        case effect(dvala.error) then (args) -> -1
        case effect(my.eff) then ([x]) -> x * 2
      end
    `)).toBe(198)
  })

  it('dvala.error handler can be nested inside outer do...with', () => {
    expect(dvala.run(`
      do
        do
          0 / 0
        with
          case effect(dvala.io.println) then (args) -> 0
        end
      with
        case effect(dvala.error) then (args) -> 77
      end
    `)).toBe(77)
  })

  it('error in handler propagates outward', () => {
    expect(dvala.run(`
      do
        do
          0 / 0
        with
          case effect(dvala.error) then (args) -> 0 / 0
        end
      with
        case effect(dvala.error) then (args) -> 55
      end
    `)).toBe(55)
  })

  it('dvala.error with takes priority over dvala.error handler order', () => {
    expect(dvala.run(`
      do
        0 / 0
      with
        case effect(dvala.error) then (args) -> 42
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
    // When a host handler for dvala.io.println throws, it produces an ErrorStep.
    // tick() processes the ErrorStep and routes it through tryDispatchDvalaError,
    // which finds the in-language do...with case effect(dvala.error) handler.
    const result = await dvala.runAsync(
      `do
        perform(effect(dvala.io.println), "hello")
      with
        case effect(dvala.error) then ([msg]) -> msg
      end`,
      {
        effectHandlers: [
          { pattern: 'dvala.io.println', handler: async () => { throw new Error('async host error') } },
        ],
      },
    )
    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      expect(result.value).toBe('async host error')
    }
  })
})

describe('step 9 — effect-name accessor', () => {
  it('should return the name of an effect', () => {
    expect(dvala.run('effect-name(effect(dvala.error))')).toBe('dvala.error')
  })

  it('should work with dotted names', () => {
    expect(dvala.run('effect-name(effect(llm.complete))')).toBe('llm.complete')
  })

  it('should work with deeply dotted names', () => {
    expect(dvala.run('effect-name(effect(com.myco.foo.bar))')).toBe('com.myco.foo.bar')
  })

  it('should work with effect stored in variable', () => {
    expect(dvala.run('let e = effect(dvala.io.println); effect-name(e)')).toBe('dvala.io.println')
  })

  it('should throw on non-effect argument', () => {
    expect(() => dvala.run('effect-name("not an effect")')).toThrow()
  })
})

describe('step 10 — predicate-based case matching', () => {
  it('should match with a predicate function', () => {
    const result = dvala.run(`
      do
        perform(effect(dvala.io.println), "hello")
      with
        case (e) -> effect-name(e) == "dvala.io.println"
        then (args) -> ++ ("logged: ", first(args))
      end
    `)
    expect(result).toBe('logged: hello')
  })

  it('should skip non-matching predicate and match next', () => {
    const result = dvala.run(`
      do
        perform(effect(dvala.io.println), "hello")
      with
        case (e) -> effect-name(e) == "dvala.error"
        then (args) -> "error handler"

        case (e) -> effect-name(e) == "dvala.io.println"
        then (args) -> "log handler"
      end
    `)
    expect(result).toBe('log handler')
  })

  it('should mix predicate and exact-match cases', () => {
    const result = dvala.run(`
      do
        perform(effect(dvala.io.println), "hello")
      with
        case effect(dvala.error)
        then (args) -> "error handler"

        case (e) -> effect-name(e) == "dvala.io.println"
        then (args) -> "log handler"
      end
    `)
    expect(result).toBe('log handler')
  })

  it('should support prefix matching via slice and comparison', () => {
    const result = dvala.run(`
      do
        perform(effect(com.myco.foo), "data")
      with
        case (e) -> slice(effect-name(e), 0, 8) == "com.myco"
        then (args) -> "matched prefix"
      end
    `)
    expect(result).toBe('matched prefix')
  })

  it('should support regex matching via re-match', () => {
    const result = dvala.run(`
      do
        perform(effect(dvala.io.println), "data")
      with
        case (e) -> not(null?(re-match(effect-name(e), #"^dvala\\.")))
        then (args) -> "matched regex"
      end
    `)
    expect(result).toBe('matched regex')
  })

  it('should work with predicate stored in variable', () => {
    const result = dvala.run(`
      let is-log? = (e) -> effect-name(e) == "dvala.io.println";
      do
        perform(effect(dvala.io.println), "hello")
      with
        case is-log?
        then (args) -> "matched"
      end
    `)
    expect(result).toBe('matched')
  })

  it('should propagate unhandled effect when predicate returns false', () => {
    expect(() => dvala.run(`
      do
        perform(effect(custom.eff), "data")
      with
        case (e) -> false
        then (args) -> "never"
      end
    `)).toThrow('Unhandled effect')
  })

  it('should support predicate matching for dvala.error', () => {
    const result = dvala.run(`
      do
        perform(effect(dvala.error), "oops")
      with
        case (e) -> effect-name(e) == "dvala.error"
        then ([msg]) -> msg
      end
    `)
    expect(result).toBe('oops')
  })

  it('should support effect-matcher with wildcard suffix', () => {
    const result = dvala.run(`
      do
        perform(effect(dvala.io.println), "hello")
      with
        case effect-matcher("dvala.*")
        then (args) -> "matched dvala wildcard"
      end
    `)
    expect(result).toBe('matched dvala wildcard')
  })

  it('effect-matcher exact string should match exact name only', () => {
    const result = dvala.run(`
      do
        perform(effect(dvala), "hello")
      with
        case effect-matcher("dvala")
        then (args) -> "matched"
      end
    `)
    expect(result).toBe('matched')
  })

  it('effect-matcher exact string should NOT match children', () => {
    // "dvala" (no wildcard) is exact match only — does NOT match dvala.error
    expect(dvala.run('let pred = effect-matcher("dvala"); pred(effect(dvala.error))')).toBe(false)
    expect(dvala.run('let pred = effect-matcher("dvala"); pred(effect(dvala))')).toBe(true)
  })

  it('effect-matcher wildcard should enforce dot boundary', () => {
    expect(dvala.run('let pred = effect-matcher("custom.*"); pred(effect(dvala.error))')).toBe(false)
    expect(dvala.run('let pred = effect-matcher("custom.*"); pred(effect(custom.foo))')).toBe(true)
    expect(dvala.run('let pred = effect-matcher("custom.*"); pred(effect(customXXX))')).toBe(false)
    expect(dvala.run('let pred = effect-matcher("custom.*"); pred(effect(custom))')).toBe(true)
  })

  it('effect-matcher catch-all * should match everything', () => {
    expect(dvala.run('let pred = effect-matcher("*"); pred(effect(anything))')).toBe(true)
    expect(dvala.run('let pred = effect-matcher("*"); pred(effect(a.b.c))')).toBe(true)
  })

  it('should support effect-matcher with regexp', () => {
    const result = dvala.run(`
      do
        perform(effect(dvala.io.println), "hello")
      with
        case effect-matcher(#"^dvala\\.")
        then (args) -> "matched regex"
      end
    `)
    expect(result).toBe('matched regex')
  })

  it('effect-matcher regexp should work as wildcard catch-all', () => {
    const result = dvala.run(`
      do
        perform(effect(anything.goes), "data")
      with
        case effect-matcher(#".*")
        then (args) -> "catch-all"
      end
    `)
    expect(result).toBe('catch-all')
  })

  it('effect-matcher predicate should be serializable across suspend/resume', async () => {
    const r1 = await dvala.runAsync(`
      do
        let result = perform(effect(my.wait));
        result
      with
        case effect-matcher("dvala.*")
        then (args) -> "caught dvala"
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

  it('effect-matcher regexp predicate should be serializable across suspend/resume', async () => {
    const r1 = await dvala.runAsync(`
      do
        let result = perform(effect(my.wait));
        result
      with
        case effect-matcher(#"^dvala\\.")
        then (args) -> "caught dvala"
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
  describe('effectNameMatchesPattern (via integration)', () => {
    it('exact match works', async () => {
      const result = await dvala.runAsync('perform(effect(my.effect), 42)', {
        effectHandlers: [
          { pattern: 'my.effect', handler: async ({ args, resume }) => { resume(args[0]!) } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 42 })
    })

    it('wildcard suffix matches child effect', async () => {
      const result = await dvala.runAsync('perform(effect(dvala.io.println), "hello")', {
        effectHandlers: [
          { pattern: 'dvala.*', handler: async ({ args, resume }) => { resume(args[0]!) } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 'hello' })
    })

    it('wildcard suffix matches the prefix itself', async () => {
      const result = await dvala.runAsync('perform(effect(dvala), "value")', {
        effectHandlers: [
          { pattern: 'dvala.*', handler: async ({ args, resume }) => { resume(args[0]!) } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 'value' })
    })

    it('wildcard suffix matches deeply nested effects', async () => {
      const result = await dvala.runAsync('perform(effect(dvala.log.verbose), "deep")', {
        effectHandlers: [
          { pattern: 'dvala.*', handler: async ({ args, resume }) => { resume(args[0]!) } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 'deep' })
    })

    it('wildcard suffix does NOT match without dot boundary', async () => {
      // dvala.* should NOT directly match 'dvalaXXX' as an effect pattern,
      // but when dvalaXXX is unhandled it produces dvala.error which IS matched.
      // Test with a handler that checks effectName to verify pattern boundary.
      let capturedEffectName = ''
      const result = await dvala.runAsync('perform(effect(dvalaXXX), "val")', {
        effectHandlers: [
          { pattern: 'dvala.*', handler: async ({ effectName, args, resume }) => {
            capturedEffectName = effectName
            resume(args[0]!)
          } },
        ],
      })
      // The handler catches dvala.error (from unhandled effect), NOT dvalaXXX directly
      expect(result.type).toBe('completed')
      expect(capturedEffectName).toBe('dvala.error')
    })

    it('catch-all * matches everything', async () => {
      const result = await dvala.runAsync('perform(effect(anything.at.all), 99)', {
        effectHandlers: [
          { pattern: '*', handler: async ({ args, resume }) => { resume(args[0]!) } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 99 })
    })

    it('exact match has priority over wildcard by registration order', async () => {
      const result = await dvala.runAsync('perform(effect(my.effect), "data")', {
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
      const result = await dvala.runAsync('perform(effect(my.custom.effect), "val")', {
        effectHandlers: [
          { pattern: '*', handler: async ({ effectName, args, resume }) => {
            capturedName = effectName
            resume(args[0]!)
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 'val' })
      expect(capturedName).toBe('my.custom.effect')
    })

    it('effectName is correct for wildcard suffix handlers', async () => {
      let capturedName = ''
      await dvala.runAsync('perform(effect(dvala.io.println), "hello")', {
        effectHandlers: [
          { pattern: 'dvala.*', handler: async ({ effectName, resume }) => {
            capturedName = effectName
            resume(null)
          } },
        ],
      })
      expect(capturedName).toBe('dvala.io.println')
    })
  })

  describe('fail() operation', () => {
    it('fail() produces a dvala error', async () => {
      const result = await dvala.runAsync('perform(effect(my.effect), "data")', {
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
      const result = await dvala.runAsync('perform(effect(my.effect), "data")', {
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
          perform(effect(my.effect), "data")
        with
          case effect(dvala.error) then ([msg]) -> msg
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
      const result = await dvala.runAsync('perform(effect(my.effect), "data")', {
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
      const result = await dvala.runAsync('perform(effect(app.action), "go")', {
        effectHandlers: [
          { pattern: '*', handler: async ({ next }) => {
            log.push('catch-all')
            next()
          } },

          { pattern: 'app.*', handler: async ({ next }) => {
            log.push('app-wildcard')
            next()
          } },

          { pattern: 'app.action', handler: async ({ args, resume }) => {
            log.push('exact')
            resume(args[0]!)
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 'go' })
      expect(log).toEqual(['catch-all', 'app-wildcard', 'exact'])
    })

    it('next() with no more handlers produces unhandled error', async () => {
      const result = await dvala.runAsync('perform(effect(my.effect), "data")', {
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
      const result = await dvala.runAsync('perform(effect(my.effect), "data")', {
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
      const result = await dvala.runAsync('perform(effect(dvala.error), "test error")', {
        effectHandlers: [
          { pattern: 'dvala.*', handler: async ({ effectName, args, resume }) => {
            resume(`caught ${effectName}: ${args[0]}`)
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 'caught dvala.error: test error' })
    })

    it('catch-all * catches runtime errors', async () => {
      const result = await dvala.runAsync('perform(effect(dvala.error), "boom")', {
        effectHandlers: [
          { pattern: '*', handler: async ({ effectName, resume }) => {
            resume(`caught: ${effectName}`)
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 'caught: dvala.error' })
    })

    it('exact dvala.error handler still works', async () => {
      const result = await dvala.runAsync('perform(effect(dvala.error), "oops")', {
        effectHandlers: [
          { pattern: 'dvala.error', handler: async ({ args, resume }) => {
            resume(`error: ${args[0]}`)
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 'error: oops' })
    })

    it('next() in dvala.error handler chain', async () => {
      const log: string[] = []
      const result = await dvala.runAsync('perform(effect(dvala.error), "boom")', {
        effectHandlers: [
          { pattern: 'dvala.*', handler: async ({ next }) => {
            log.push('dvala-wildcard')
            next()
          } },

          { pattern: 'dvala.error', handler: async ({ args, resume }) => {
            log.push('dvala-error-exact')
            resume(`handled: ${args[0]}`)
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

      const result = await dvala.runAsync('perform(effect(my.effect), "val")', { effectHandlers: handlers })
      expect(result).toMatchObject({ type: 'completed', value: 'done' })
      expect(log).toEqual(['first-exact', 'second-wildcard', 'third-catchall'])
    })
  })

  describe('async handlers with next()', () => {
    it('handlers can be async and still chain with next()', async () => {
      const log: string[] = []
      const result = await dvala.runAsync('perform(effect(my.effect), 10)', {
        effectHandlers: [
          { pattern: '*', handler: async ({ next }) => {
            await new Promise(resolve => setTimeout(resolve, 10))
            log.push('async-middleware')
            next()
          } },

          { pattern: 'my.effect', handler: async ({ args, resume }) => {
            await new Promise(resolve => setTimeout(resolve, 10))
            log.push('async-handler')
            resume((args[0] as number) * 2)
          } },
        ],
      })
      expect(result).toMatchObject({ type: 'completed', value: 20 })
      expect(log).toEqual(['async-middleware', 'async-handler'])
    })
  })
})

// =========================================================================
// Unit tests for generateRunId
// =========================================================================
describe('generateRunId', () => {
  it('should return a UUID string', () => {
    const id = generateRunId()
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })

  it('should return unique values on each call', () => {
    const ids = new Set(Array.from({ length: 10 }, () => generateRunId()))
    expect(ids.size).toBe(10)
  })

  it('should use fallback when crypto.randomUUID is unavailable', () => {
    const originalCrypto = globalThis.crypto
    try {
      Object.defineProperty(globalThis, 'crypto', { value: undefined, writable: true, configurable: true })
      const id = generateRunId()
      expect(typeof id).toBe('string')
      expect(id).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/)
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: originalCrypto, writable: true, configurable: true })
    }
  })
})

// =========================================================================
// Unit tests for effectNameMatchesPattern and findMatchingHandlers
// =========================================================================
describe('effectNameMatchesPattern', () => {
  it('exact match', () => {
    expect(effectNameMatchesPattern('dvala.error', 'dvala.error')).toBe(true)
    expect(effectNameMatchesPattern('dvala.io.println', 'dvala.error')).toBe(false)
  })

  it('wildcard suffix matches prefix itself', () => {
    expect(effectNameMatchesPattern('dvala', 'dvala.*')).toBe(true)
  })

  it('wildcard suffix matches children', () => {
    expect(effectNameMatchesPattern('dvala.error', 'dvala.*')).toBe(true)
    expect(effectNameMatchesPattern('dvala.io.println', 'dvala.*')).toBe(true)
  })

  it('wildcard suffix matches deeply nested', () => {
    expect(effectNameMatchesPattern('dvala.log.verbose', 'dvala.*')).toBe(true)
  })

  it('wildcard suffix enforces dot boundary', () => {
    expect(effectNameMatchesPattern('dvalaXXX', 'dvala.*')).toBe(false)
    expect(effectNameMatchesPattern('dvala-extra', 'dvala.*')).toBe(false)
  })

  it('catch-all * matches everything', () => {
    expect(effectNameMatchesPattern('anything', '*')).toBe(true)
    expect(effectNameMatchesPattern('a.b.c.d', '*')).toBe(true)
    expect(effectNameMatchesPattern('', '*')).toBe(true)
  })

  it('no wildcard requires exact match', () => {
    expect(effectNameMatchesPattern('dvala.error', 'dvala')).toBe(false)
    expect(effectNameMatchesPattern('dvala', 'dvala')).toBe(true)
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
