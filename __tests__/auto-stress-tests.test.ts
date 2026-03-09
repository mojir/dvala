/**
 * Auto-generated stress tests: Effect system edge cases & complex interactions.
 *
 * These tests target patterns that are likely to break due to complex
 * interactions between subsystems. They go beyond the existing hand-written
 * tests and prior smart-test files.
 *
 * Categories:
 *  1. Parallel + checkpoints/suspend interactions
 *  2. Race + checkpoints/suspend interactions
 *  3. Middleware chain (next()) + suspend/fail
 *  4. Local do/with + host handler priority across suspend
 *  5. Deeply nested closures + effects + suspend
 *  6. Effect-triggered-by-effect (cascading effects)
 *  7. Loop/recur + effects + suspend
 *  8. Multiple do/with nesting depths + suspend
 *  9. Effect-matcher predicates across complex flows
 * 10. Dedup pool stress (many checkpoints with shared AST)
 * 11. Host bindings survival across complex flows
 * 12. Signal/AbortController edge cases
 * 13. Concurrent handler interactions
 * 14. Error propagation through complex effect stacks
 */

import { describe, expect, it } from 'vitest'
import { createDvala } from '../src/createDvala'
import { resume as resumeContinuation } from '../src/resume'
import type { Handlers, Snapshot } from '../src/evaluator/effectTypes'

const dvala = createDvala()

// ---------------------------------------------------------------------------
// 1. Parallel + checkpoints/suspend interactions
// ---------------------------------------------------------------------------

describe('stress: parallel + checkpoints', () => {
  it('parallel branches run independently — checkpoints in branches do not affect outer state', async () => {
    // Branches run via independent runEffectLoop calls without shared snapshotState
    let outerSnapshots: readonly Snapshot[] = []
    const result = await dvala.runAsync(`
      perform(effect(dvala.checkpoint), "loc outer", { loc: "outer" });
      let results = parallel(
        perform(effect(my.op), "a"),
        perform(effect(my.op), "b")
      );
      perform(effect(my.check));
      results
    `, {
      effectHandlers: {
        'my.op': async ({ args, resume: r }) => { r(`done:${args[0]}`) },
        'my.check': async ({ snapshots, resume: r }) => {
          outerSnapshots = [...snapshots]
          r(null)
        },
      },
    })
    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      expect(result.value).toEqual(['done:a', 'done:b'])
    }
    // Only the outer checkpoint should be visible
    expect(outerSnapshots.length).toBe(1)
    expect((outerSnapshots[0] as Snapshot).meta).toEqual({ loc: 'outer' })
  })

  it('parallel with all branches suspended, resume one at a time', async () => {
    const handlers: Handlers = {
      'my.ask': async ({ args, suspend }) => { suspend({ q: args[0] }) },
    }

    const r1 = await dvala.runAsync(`
      parallel(
        perform(effect(my.ask), "q1"),
        perform(effect(my.ask), "q2"),
        perform(effect(my.ask), "q3")
      )
    `, { effectHandlers: handlers })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return

    const r2 = await resumeContinuation(r1.snapshot, 'a1', { handlers })
    expect(r2.type).toBe('suspended')
    if (r2.type !== 'suspended')
      return

    const r3 = await resumeContinuation(r2.snapshot, 'a2', { handlers })
    expect(r3.type).toBe('suspended')
    if (r3.type !== 'suspended')
      return

    const r4 = await resumeContinuation(r3.snapshot, 'a3')
    expect(r4).toEqual({ type: 'completed', value: ['a1', 'a2', 'a3'] })
  })

  it('parallel with mixed complete/suspend, then use result after resume', async () => {
    const handlers: Handlers = {
      'my.fast': async ({ resume: r }) => { r('fast') },
      'my.slow': async ({ suspend }) => { suspend({ waiting: true }) },
    }

    const r1 = await dvala.runAsync(`
      let results = parallel(
        perform(effect(my.fast)),
        perform(effect(my.slow))
      );
      map(results, -> upper-case($))
    `, { effectHandlers: handlers })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return

    const r2 = await resumeContinuation(r1.snapshot, 'slow')
    expect(r2.type).toBe('completed')
    if (r2.type === 'completed') {
      expect(r2.value).toEqual(['FAST', 'SLOW'])
    }
  })

  it('parallel with error in one branch reports error', async () => {
    const result = await dvala.runAsync(`
      parallel(
        1 + 2,
        perform(effect(dvala.error), "branch error"),
        3 + 4
      )
    `)
    expect(result.type).toBe('error')
  })

  it('parallel + checkpoint before and after', async () => {
    let capturedSnapshots: readonly Snapshot[] = []
    const result = await dvala.runAsync(`
      perform(effect(dvala.checkpoint), "pos before-parallel", { pos: "before-parallel" });
      let results = parallel(
        perform(effect(my.op), 1),
        perform(effect(my.op), 2)
      );
      perform(effect(dvala.checkpoint), "pos after-parallel", { pos: "after-parallel" });
      perform(effect(my.check));
      results
    `, {
      effectHandlers: {
        'my.op': async ({ args, resume: r }) => { r((args[0] as number) * 10) },
        'my.check': async ({ snapshots, resume: r }) => {
          capturedSnapshots = [...snapshots]
          r(null)
        },
      },
    })
    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      expect(result.value).toEqual([10, 20])
    }
    expect(capturedSnapshots.length).toBe(2)
    expect((capturedSnapshots[0] as Snapshot).meta).toEqual({ pos: 'before-parallel' })
    expect((capturedSnapshots[1] as Snapshot).meta).toEqual({ pos: 'after-parallel' })
  })

  it('nested parallel should work', async () => {
    const result = await dvala.runAsync(`
      parallel(
        parallel(1 + 1, 2 + 2),
        parallel(3 + 3, 4 + 4)
      )
    `)
    expect(result).toMatchObject({
      type: 'completed',
      value: [[2, 4], [6, 8]],
    })
  })
})

// ---------------------------------------------------------------------------
// 2. Race + checkpoints/suspend interactions
// ---------------------------------------------------------------------------

describe('stress: race + checkpoints/suspend', () => {
  it('race where all branches suspend returns suspended with branch metas', async () => {
    const result = await dvala.runAsync(`
      race(
        perform(effect(my.a)),
        perform(effect(my.b))
      )
    `, {
      effectHandlers: {
        'my.a': async ({ suspend }) => { suspend({ branch: 'A' }) },
        'my.b': async ({ suspend }) => { suspend({ branch: 'B' }) },
      },
    })
    expect(result.type).toBe('suspended')
    if (result.type === 'suspended') {
      expect(result.snapshot.meta).toEqual({
        type: 'race',
        branches: [{ branch: 'A' }, { branch: 'B' }],
      })
    }
  })

  it('race with one completing and one suspending picks completed', async () => {
    const result = await dvala.runAsync(`
      race(
        perform(effect(my.fast)),
        perform(effect(my.slow))
      )
    `, {
      effectHandlers: {
        'my.fast': async ({ resume: r }) => { r('winner') },
        'my.slow': async ({ suspend }) => { suspend({ waiting: true }) },
      },
    })
    expect(result).toMatchObject({ type: 'completed', value: 'winner' })
  })

  it('suspended race can be resumed', async () => {
    const handlers: Handlers = {
      'my.a': async ({ suspend }) => { suspend({ branch: 'A' }) },
      'my.b': async ({ suspend }) => { suspend({ branch: 'B' }) },
    }

    const r1 = await dvala.runAsync(`
      let winner = race(
        perform(effect(my.a)),
        perform(effect(my.b))
      );
      "winner: " ++ winner
    `, { effectHandlers: handlers })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return

    const r2 = await resumeContinuation(r1.snapshot, 'A-wins')
    expect(r2).toEqual({ type: 'completed', value: 'winner: A-wins' })
  })

  it('race with all branches erroring produces aggregate error', async () => {
    const result = await dvala.runAsync(`
      race(
        perform(effect(dvala.error), "err-1"),
        perform(effect(dvala.error), "err-2")
      )
    `)
    expect(result.type).toBe('error')
    if (result.type === 'error') {
      expect(result.error.message).toContain('race: all branches failed')
    }
  })

  it('race inside parallel — each race picks its winner', async () => {
    const result = await dvala.runAsync(`
      parallel(
        race(
          perform(effect(my.slow)),
          perform(effect(my.fast))
        ),
        race(
          perform(effect(my.fast)),
          perform(effect(my.slow))
        )
      )
    `, {
      effectHandlers: {
        'my.slow': async ({ resume: r }) => {
          await new Promise(resolve => setTimeout(resolve, 50))
          r('slow')
        },
        'my.fast': async ({ resume: r }) => { r('fast') },
      },
    })
    expect(result).toMatchObject({ type: 'completed', value: ['fast', 'fast'] })
  })
})

// ---------------------------------------------------------------------------
// 3. Middleware chain (next()) + suspend/fail
// ---------------------------------------------------------------------------

describe('stress: next() middleware + suspend/fail', () => {
  it('next() then suspend in final handler', async () => {
    const log: string[] = []
    const result = await dvala.runAsync('perform(effect(my.effect), "data")', {
      effectHandlers: {
        '*': async ({ next }) => {
          log.push('middleware')
          next()
        },
        'my.effect': async ({ suspend }) => {
          log.push('handler-suspends')
          suspend({ reason: 'approval' })
        },
      },
    })
    expect(result.type).toBe('suspended')
    expect(log).toEqual(['middleware', 'handler-suspends'])
  })

  it('suspended via next() chain, resume works', async () => {
    const log: string[] = []
    const handlers: Handlers = {
      '*': async ({ next }) => {
        log.push('middleware')
        next()
      },
      'my.wait': async ({ suspend }) => {
        log.push('wait-handler')
        suspend()
      },
    }

    const r1 = await dvala.runAsync('let x = perform(effect(my.wait)); x * 2', { effectHandlers: handlers })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return

    const r2 = await resumeContinuation(r1.snapshot, 21)
    expect(r2).toEqual({ type: 'completed', value: 42 })
    expect(log).toEqual(['middleware', 'wait-handler'])
  })

  it('next() then fail in final handler', async () => {
    const log: string[] = []
    const result = await dvala.runAsync(`
      do
        perform(effect(my.effect), "data")
      with
        case effect(dvala.error) then ([msg]) -> "caught: " ++ msg
      end
    `, {
      effectHandlers: {
        '*': async ({ next }) => {
          log.push('middleware')
          next()
        },
        'my.effect': async ({ fail }) => {
          log.push('handler-fails')
          fail('deliberate failure')
        },
      },
    })
    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      expect(result.value).toBe('caught: deliberate failure')
    }
    expect(log).toEqual(['middleware', 'handler-fails'])
  })

  it('three-level middleware chain, last suspends', async () => {
    const log: string[] = []
    const handlers: Handlers = {
      '*': async ({ next }) => {
        log.push('level-1')
        next()
      },
      'my.*': async ({ next }) => {
        log.push('level-2')
        next()
      },
      'my.wait': async ({ suspend }) => {
        log.push('level-3')
        suspend()
      },
    }

    const r1 = await dvala.runAsync('let x = perform(effect(my.wait)); x', { effectHandlers: handlers })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return

    const r2 = await resumeContinuation(r1.snapshot, 'resumed')
    expect(r2).toEqual({ type: 'completed', value: 'resumed' })
    expect(log).toEqual(['level-1', 'level-2', 'level-3'])
  })

  it('next() to unhandled effect is caught by dvala.error handler', async () => {
    const result = await dvala.runAsync(`
      do
        perform(effect(no.handler), "payload")
      with
        case effect(dvala.error) then ([msg]) -> "caught: " ++ msg
      end
    `, {
      effectHandlers: {
        '*': async ({ next }) => { next() },
      },
    })
    // next() exhausts the handler chain → unhandled effect → caught by do...with dvala.error handler
    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      expect(result.value).toContain('caught:')
      expect(result.value).toContain('Unhandled effect')
    }
  })
})

// ---------------------------------------------------------------------------
// 4. Local do/with + host handler priority across suspend
// ---------------------------------------------------------------------------

describe('stress: local + host handler priority with suspend', () => {
  it('local handler catches effect even when host handler exists', async () => {
    const result = await dvala.runAsync(`
      do
        perform(effect(my.eff), 10)
      with
        case effect(my.eff) then ([x]) -> x * 3
      end
    `, {
      effectHandlers: {
        'my.eff': async ({ args, resume: r }) => { r((args[0] as number) * 100) },
      },
    })
    // Local handler takes precedence
    expect(result).toMatchObject({ type: 'completed', value: 30 })
  })

  it('suspend in host handler, local handler catches post-resume effect', async () => {
    const handlers: Handlers = {
      'my.wait': async ({ suspend }) => { suspend() },
    }

    const r1 = await dvala.runAsync(`
      let x = perform(effect(my.wait));
      do
        perform(effect(my.local), x)
      with
        case effect(my.local) then ([v]) -> v * 2
      end
    `, { effectHandlers: handlers })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return

    const r2 = await resumeContinuation(r1.snapshot, 21)
    expect(r2).toEqual({ type: 'completed', value: 42 })
  })

  it('inner do/with delegates to outer do/with across suspend', async () => {
    const handlers: Handlers = {
      'my.wait': async ({ suspend }) => { suspend() },
    }

    const r1 = await dvala.runAsync(`
      do
        let x = perform(effect(my.wait));
        do
          perform(effect(outer.eff), x)
        with
          case effect(inner.eff) then ([v]) -> "inner: " ++ v
        end
      with
        case effect(outer.eff) then ([v]) -> "outer: " ++ v
      end
    `, { effectHandlers: handlers })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return

    const r2 = await resumeContinuation(r1.snapshot, 'hello')
    expect(r2).toEqual({ type: 'completed', value: 'outer: hello' })
  })

  it('three-level do/with nesting with suspend in middle', async () => {
    const handlers: Handlers = {
      'my.wait': async ({ suspend }) => { suspend() },
    }

    const r1 = await dvala.runAsync(`
      do
        do
          do
            let x = perform(effect(my.wait));
            perform(effect(level3), x)
          with
            case effect(level3) then ([v]) -> "L3:" ++ v
          end
        with
          case effect(level2) then ([v]) -> "L2:" ++ v
        end
      with
        case effect(level1) then ([v]) -> "L1:" ++ v
      end
    `, { effectHandlers: handlers })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return

    const r2 = await resumeContinuation(r1.snapshot, 'deep')
    expect(r2).toEqual({ type: 'completed', value: 'L3:deep' })
  })

  it('effect-matcher predicate in do/with survives suspend/resume', async () => {
    const handlers: Handlers = {
      'my.wait': async ({ suspend }) => { suspend() },
    }

    const r1 = await dvala.runAsync(`
      do
        let x = perform(effect(my.wait));
        perform(effect(custom.foo), x)
      with
        case effect-matcher("custom.*")
        then ([v]) -> "matched: " ++ v
      end
    `, { effectHandlers: handlers })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return

    const r2 = await resumeContinuation(r1.snapshot, 'bar')
    expect(r2).toEqual({ type: 'completed', value: 'matched: bar' })
  })
})

// ---------------------------------------------------------------------------
// 5. Deeply nested closures + effects + suspend
// ---------------------------------------------------------------------------

describe('stress: deep closures + effects + suspend', () => {
  it('triple-nested closure survives suspend/resume + JSON round-trip', async () => {
    const handlers: Handlers = {
      'my.wait': async ({ suspend }) => { suspend() },
    }

    const r1 = await dvala.runAsync(`
      let make-adder = (a) -> (b) -> (c) -> a + b + c;
      let add10 = make-adder(10);
      let add10and20 = add10(20);
      let x = perform(effect(my.wait));
      add10and20(x)
    `, { effectHandlers: handlers })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return

    const json = JSON.stringify(r1.snapshot)
    const restored = JSON.parse(json) as Snapshot
    const r2 = await resumeContinuation(restored, 12)
    expect(r2).toEqual({ type: 'completed', value: 42 })
  })

  it('closure capturing mutable-like state via let in loop survives suspend', async () => {
    const handlers: Handlers = {
      'my.wait': async ({ suspend }) => { suspend() },
    }

    const r1 = await dvala.runAsync(`
      let fns = map([1, 2, 3], (n) -> (x) -> n * x);
      let factor = perform(effect(my.wait));
      map(fns, (f) -> f(factor))
    `, { effectHandlers: handlers })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return

    const r2 = await resumeContinuation(r1.snapshot, 10)
    expect(r2).toEqual({ type: 'completed', value: [10, 20, 30] })
  })

  it('comp function chains survive suspend/resume', async () => {
    const handlers: Handlers = {
      'my.wait': async ({ suspend }) => { suspend() },
    }

    const r1 = await dvala.runAsync(`
      let pipeline = comp(inc, (x) -> x * 2, dec);
      let input = perform(effect(my.wait));
      pipeline(input)
    `, { effectHandlers: handlers })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return

    // comp is right-to-left: dec(5)=4, *2=8, inc(8)=9
    const r2 = await resumeContinuation(r1.snapshot, 5)
    expect(r2).toEqual({ type: 'completed', value: 9 })
  })

  it('recursive function defined before suspend works after resume', async () => {
    const handlers: Handlers = {
      'my.wait': async ({ suspend }) => { suspend() },
    }

    const r1 = await dvala.runAsync(`
      let factorial = (n) ->
        if n <= 1 then 1
        else n * factorial(n - 1)
        end;
      let x = perform(effect(my.wait));
      factorial(x)
    `, { effectHandlers: handlers })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return

    const r2 = await resumeContinuation(r1.snapshot, 5)
    expect(r2).toEqual({ type: 'completed', value: 120 })
  })

  it('higher-order function returning closure survives suspend with JSON round-trip', async () => {
    const handlers: Handlers = {
      'my.wait': async ({ suspend }) => { suspend() },
    }

    const r1 = await dvala.runAsync(`
      let make-scaler = (factor) -> (arr) -> map(arr, (x) -> x * factor);
      let scale3 = make-scaler(3);
      let data = perform(effect(my.wait));
      scale3(data)
    `, { effectHandlers: handlers })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return

    const json = JSON.stringify(r1.snapshot)
    const restored = JSON.parse(json) as Snapshot
    const r2 = await resumeContinuation(restored, [1, 2, 3])
    expect(r2).toEqual({ type: 'completed', value: [3, 6, 9] })
  })
})

// ---------------------------------------------------------------------------
// 6. Effect-triggered-by-effect (cascading effects)
// ---------------------------------------------------------------------------

describe('stress: cascading effects', () => {
  it('handler resume value triggers another perform', async () => {
    const result = await dvala.runAsync(`
      do
        let x = perform(effect(my.first));
        let y = perform(effect(my.second), x);
        y
      with
        case effect(my.first) then (args) -> 10
        case effect(my.second) then ([v]) -> v * 2
      end
    `)
    expect(result).toMatchObject({ type: 'completed', value: 20 })
  })

  it('host handler resume triggers another host effect', async () => {
    const result = await dvala.runAsync(`
      let x = perform(effect(my.step1));
      let y = perform(effect(my.step2), x);
      x + y
    `, {
      effectHandlers: {
        'my.step1': async ({ resume: r }) => { r(10) },
        'my.step2': async ({ args, resume: r }) => { r((args[0] as number) * 3) },
      },
    })
    expect(result).toMatchObject({ type: 'completed', value: 40 }) // 10 + 30
  })

  it('local handler triggers host effect', async () => {
    const result = await dvala.runAsync(`
      do
        let x = perform(effect(my.local));
        perform(effect(my.host), x)
      with
        case effect(my.local) then (args) -> 5
      end
    `, {
      effectHandlers: {
        'my.host': async ({ args, resume: r }) => { r((args[0] as number) * 8) },
      },
    })
    expect(result).toMatchObject({ type: 'completed', value: 40 })
  })

  it('error in cascading effect caught by outer handler', async () => {
    const result = await dvala.runAsync(`
      do
        let x = perform(effect(my.first));
        perform(effect(dvala.error), "cascade error: " ++ x)
      with
        case effect(my.first) then (args) -> "triggered"
        case effect(dvala.error) then ([msg]) -> msg
      end
    `)
    expect(result).toMatchObject({ type: 'completed', value: 'cascade error: triggered' })
  })
})

// ---------------------------------------------------------------------------
// 7. Loop/recur + effects + suspend
// ---------------------------------------------------------------------------

describe('stress: loop/recur + effects', () => {
  it('effect inside loop body with local handler', () => {
    const result = dvala.run(`
      do
        loop(i = 0, acc = 0) ->
          if i >= 3 then acc
          else
            let v = perform(effect(my.get), i);
            recur(i + 1, acc + v)
          end
      with
        case effect(my.get) then ([n]) -> n * 10
      end
    `)
    expect(result).toBe(30) // 0*10 + 1*10 + 2*10
  })

  it('loop with host effect handler', async () => {
    const result = await dvala.runAsync(`
      loop(i = 0, acc = "") ->
        if i >= 3 then acc
        else
          let v = perform(effect(my.get), i);
          recur(i + 1, if acc == "" then v else acc ++ ", " ++ v end)
        end
    `, {
      effectHandlers: {
        'my.get': async ({ args, resume: r }) => { r(`item-${args[0]}`) },
      },
    })
    expect(result).toMatchObject({ type: 'completed', value: 'item-0, item-1, item-2' })
  })

  it('loop with suspend on first iteration, then complete', async () => {
    const handlers: Handlers = {
      'my.init': async ({ suspend }) => { suspend({ step: 'init' }) },
    }

    const r1 = await dvala.runAsync(`
      let start = perform(effect(my.init));
      loop(i = start, acc = 0) ->
        if i >= 5 then acc
        else recur(i + 1, acc + i)
        end
    `, { effectHandlers: handlers })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return

    // Start at 0: 0+1+2+3+4 = 10
    const r2 = await resumeContinuation(r1.snapshot, 0)
    expect(r2).toEqual({ type: 'completed', value: 10 })
  })

  it('for expression with host effect', async () => {
    const collected: number[] = []
    const result = await dvala.runAsync(`
      for (i in [1, 2, 3, 4, 5]) ->
        perform(effect(my.process), i)
    `, {
      effectHandlers: {
        'my.process': async ({ args, resume: r }) => {
          collected.push(args[0] as number)
          r(null)
        },
      },
    })
    expect(result.type).toBe('completed')
    expect(collected).toEqual([1, 2, 3, 4, 5])
  })

  it('reduce with effect in reducer function', async () => {
    const result = await dvala.runAsync(`
      do
        reduce([1, 2, 3], (acc, x) -> acc + perform(effect(my.transform), x), 0)
      with
        case effect(my.transform) then ([x]) -> x * x
      end
    `)
    expect(result).toMatchObject({ type: 'completed', value: 14 }) // 1+4+9
  })
})

// ---------------------------------------------------------------------------
// 8. Multiple do/with nesting depths + suspend
// ---------------------------------------------------------------------------

describe('stress: deeply nested do/with + suspend', () => {
  it('4-level do/with nesting, effect at deepest level', () => {
    const result = dvala.run(`
      do
        do
          do
            do
              perform(effect(deep), 1)
            with
              case effect(deep) then ([x]) -> x + 10
            end
          with
            case effect(level3) then ([x]) -> x
          end
        with
          case effect(level2) then ([x]) -> x
        end
      with
        case effect(level1) then ([x]) -> x
      end
    `)
    expect(result).toBe(11)
  })

  it('4-level nesting, effect bubbles to outermost handler', () => {
    const result = dvala.run(`
      do
        do
          do
            do
              perform(effect(bubbles), "hello")
            with
              case effect(other1) then ([x]) -> "wrong1"
            end
          with
            case effect(other2) then ([x]) -> "wrong2"
          end
        with
          case effect(other3) then ([x]) -> "wrong3"
        end
      with
        case effect(bubbles) then ([x]) -> "correct: " ++ x
      end
    `)
    expect(result).toBe('correct: hello')
  })

  it('nested do/with with suspend at inner level, resume continues outer', async () => {
    const handlers: Handlers = {
      'my.wait': async ({ suspend }) => { suspend() },
    }

    const r1 = await dvala.runAsync(`
      do
        do
          let x = perform(effect(my.wait));
          perform(effect(inner), x)
        with
          case effect(inner) then ([v]) -> v ++ "!"
        end
      with
        case effect(dvala.error) then ([msg]) -> "error: " ++ msg
      end
    `, { effectHandlers: handlers })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return

    const r2 = await resumeContinuation(r1.snapshot, 'world')
    expect(r2).toEqual({ type: 'completed', value: 'world!' })
  })

  it('do/with error handler at outer level catches error after suspend/resume', async () => {
    const handlers: Handlers = {
      'my.wait': async ({ suspend }) => { suspend() },
    }

    const r1 = await dvala.runAsync(`
      do
        do
          let x = perform(effect(my.wait));
          if x == "bad" then perform(effect(dvala.error), "bad input")
          else x
          end
        with
          case effect(some.other) then ([v]) -> v
        end
      with
        case effect(dvala.error) then ([msg]) -> "caught: " ++ msg
      end
    `, { effectHandlers: handlers })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return

    // Send "bad" → error bubbles to outer do/with
    const r2 = await resumeContinuation(r1.snapshot, 'bad')
    expect(r2).toEqual({ type: 'completed', value: 'caught: bad input' })
  })
})

// ---------------------------------------------------------------------------
// 9. Effect-matcher predicates across complex flows
// ---------------------------------------------------------------------------

describe('stress: effect-matcher in complex flows', () => {
  it('effect-matcher with wildcard string in nested do/with', () => {
    const result = dvala.run(`
      do
        do
          perform(effect(custom.thing), "data")
        with
          case effect-matcher("custom.*")
          then ([v]) -> "matched: " ++ v
        end
      with
        case effect(dvala.error) then ([msg]) -> "error: " ++ msg
      end
    `)
    expect(result).toBe('matched: data')
  })

  it('effect-matcher with regex survives suspend/resume + JSON round-trip', async () => {
    const handlers: Handlers = {
      'my.wait': async ({ suspend }) => { suspend() },
    }

    const r1 = await dvala.runAsync(`
      do
        let x = perform(effect(my.wait));
        perform(effect(app.transform), x)
      with
        case effect-matcher(#"^app\\.")
        then ([v]) -> "transformed: " ++ v
      end
    `, { effectHandlers: handlers })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return

    const json = JSON.stringify(r1.snapshot)
    const restored = JSON.parse(json) as Snapshot
    const r2 = await resumeContinuation(restored, 'input')
    expect(r2).toEqual({ type: 'completed', value: 'transformed: input' })
  })

  it('multiple effect-matchers in same do/with, first match wins', () => {
    const result = dvala.run(`
      do
        perform(effect(custom.foo), "data")
      with
        case effect-matcher("custom.*")
        then ([v]) -> "wildcard: " ++ v
        case effect-matcher(#".*")
        then ([v]) -> "regex: " ++ v
      end
    `)
    expect(result).toBe('wildcard: data')
  })

  it('effect-matcher predicate stored in variable works', () => {
    const result = dvala.run(`
      let is-custom = effect-matcher("custom.*");
      do
        perform(effect(custom.bar), 42)
      with
        case is-custom
        then ([v]) -> v * 2
      end
    `)
    expect(result).toBe(84)
  })
})

// ---------------------------------------------------------------------------
// 10. Dedup pool stress (many checkpoints with shared AST)
// ---------------------------------------------------------------------------

describe('stress: dedup pool with many checkpoints', () => {
  it('many checkpoints with identical code paths produce valid blobs', async () => {
    const handlers: Handlers = {
      'my.wait': async ({ suspend }) => { suspend() },
    }

    // Take 10 checkpoints, then suspend — should share AST sub-trees
    const r1 = await dvala.runAsync(`
      perform(effect(dvala.checkpoint), "n 1", { n: 1 });
      perform(effect(dvala.checkpoint), "n 2", { n: 2 });
      perform(effect(dvala.checkpoint), "n 3", { n: 3 });
      perform(effect(dvala.checkpoint), "n 4", { n: 4 });
      perform(effect(dvala.checkpoint), "n 5", { n: 5 });
      perform(effect(dvala.checkpoint), "n 6", { n: 6 });
      perform(effect(dvala.checkpoint), "n 7", { n: 7 });
      perform(effect(dvala.checkpoint), "n 8", { n: 8 });
      perform(effect(dvala.checkpoint), "n 9", { n: 9 });
      perform(effect(dvala.checkpoint), "n 10", { n: 10 });
      let x = perform(effect(my.wait));
      x
    `, { effectHandlers: handlers })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return

    // JSON round-trip
    const json = JSON.stringify(r1.snapshot)
    const restored = JSON.parse(json) as Snapshot

    const r2 = await resumeContinuation(restored, 'dedup-works')
    expect(r2).toEqual({ type: 'completed', value: 'dedup-works' })
  })

  it('dedup pool survives double JSON round-trip with checkpoints and closures', async () => {
    const handlers: Handlers = {
      'my.wait': async ({ suspend }) => { suspend() },
    }

    const r1 = await dvala.runAsync(`
      let make-fn = (n) -> (x) -> n + x;
      let f1 = make-fn(1);
      let f2 = make-fn(2);
      perform(effect(dvala.checkpoint), "fn f1", { fn: "f1" });
      perform(effect(dvala.checkpoint), "fn f2", { fn: "f2" });
      let input = perform(effect(my.wait));
      [f1(input), f2(input)]
    `, { effectHandlers: handlers })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return

    // Double round-trip
    const json1 = JSON.stringify(r1.snapshot)
    const mid = JSON.parse(json1) as Snapshot
    const json2 = JSON.stringify(mid)
    const restored = JSON.parse(json2) as Snapshot

    const r2 = await resumeContinuation(restored, 10)
    expect(r2).toEqual({ type: 'completed', value: [11, 12] })
  })

  it('many checkpoints with maxSnapshots eviction and dedup', async () => {
    let capturedSnapshots: readonly Snapshot[] = []

    await dvala.runAsync(`
      perform(effect(dvala.checkpoint), "n 1", { n: 1 });
      perform(effect(dvala.checkpoint), "n 2", { n: 2 });
      perform(effect(dvala.checkpoint), "n 3", { n: 3 });
      perform(effect(dvala.checkpoint), "n 4", { n: 4 });
      perform(effect(dvala.checkpoint), "n 5", { n: 5 });
      perform(effect(dvala.checkpoint), "n 6", { n: 6 });
      perform(effect(dvala.checkpoint), "n 7", { n: 7 });
      perform(effect(dvala.checkpoint), "n 8", { n: 8 });
      perform(effect(my.check))
    `, {
      maxSnapshots: 3,
      effectHandlers: {
        'my.check': async ({ snapshots, resume: r }) => {
          capturedSnapshots = [...snapshots]
          r(null)
        },
      },
    })
    expect(capturedSnapshots.length).toBe(3)
    expect((capturedSnapshots[0] as Snapshot).meta).toEqual({ n: 6 })
    expect((capturedSnapshots[1] as Snapshot).meta).toEqual({ n: 7 })
    expect((capturedSnapshots[2] as Snapshot).meta).toEqual({ n: 8 })
  })
})

// ---------------------------------------------------------------------------
// 11. Host bindings survival across complex flows
// ---------------------------------------------------------------------------

describe('stress: host bindings across complex flows', () => {
  it('bindings available before and after suspend/resume', async () => {
    const handlers: Handlers = {
      'my.wait': async ({ suspend }) => { suspend() },
    }

    const r1 = await dvala.runAsync(`
      let before = prefix ++ "before";
      let x = perform(effect(my.wait));
      let after = prefix ++ x;
      [before, after]
    `, {
      bindings: { prefix: 'host-' },
      effectHandlers: handlers,
    })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return

    const r2 = await resumeContinuation(r1.snapshot, 'after', {
      bindings: { prefix: 'host-' },
    })
    expect(r2).toEqual({ type: 'completed', value: ['host-before', 'host-after'] })
  })

  it('bindings work inside closures after suspend/resume', async () => {
    const handlers: Handlers = {
      'my.wait': async ({ suspend }) => { suspend() },
    }

    const r1 = await dvala.runAsync(`
      let scale = (x) -> x * factor;
      let input = perform(effect(my.wait));
      scale(input)
    `, {
      bindings: { factor: 7 },
      effectHandlers: handlers,
    })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return

    const r2 = await resumeContinuation(r1.snapshot, 6, {
      bindings: { factor: 7 },
    })
    expect(r2).toEqual({ type: 'completed', value: 42 })
  })

  it('different bindings on resume changes behavior', async () => {
    const handlers: Handlers = {
      'my.wait': async ({ suspend }) => { suspend() },
    }

    const r1 = await dvala.runAsync(`
      let x = perform(effect(my.wait));
      x + offset
    `, {
      bindings: { offset: 100 },
      effectHandlers: handlers,
    })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return

    // Resume with different offset
    const r2 = await resumeContinuation(r1.snapshot, 10, {
      bindings: { offset: 32 },
    })
    expect(r2).toEqual({ type: 'completed', value: 42 })
  })
})

// ---------------------------------------------------------------------------
// 12. Error propagation through complex effect stacks
// ---------------------------------------------------------------------------

describe('stress: error propagation through effect stacks', () => {
  it('error in local handler body caught by outer do/with', () => {
    const result = dvala.run(`
      do
        do
          perform(effect(my.eff), 1)
        with
          case effect(my.eff) then ([x]) -> 0 / 0
        end
      with
        case effect(dvala.error) then ([msg]) -> msg
      end
    `)
    expect(result).toBe('Number is NaN')
  })

  it('host handler fail() caught by local do/with', async () => {
    const result = await dvala.runAsync(`
      do
        perform(effect(my.eff))
      with
        case effect(dvala.error) then ([msg]) -> "caught: " ++ msg
      end
    `, {
      effectHandlers: {
        'my.eff': async ({ fail }) => { fail('host failed') },
      },
    })
    expect(result).toMatchObject({ type: 'completed', value: 'caught: host failed' })
  })

  it('error after multi-step suspend/resume caught correctly', async () => {
    const handlers: Handlers = {
      'my.step': async ({ args, suspend }) => { suspend({ step: args[0] }) },
    }

    const r1 = await dvala.runAsync(`
      do
        let a = perform(effect(my.step), 1);
        let b = perform(effect(my.step), 2);
        if b == "error" then perform(effect(dvala.error), "bad: " ++ a ++ b)
        else a ++ b
        end
      with
        case effect(dvala.error) then ([msg]) -> msg
      end
    `, { effectHandlers: handlers })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return

    const r2 = await resumeContinuation(r1.snapshot, 'ok-', { handlers })
    expect(r2.type).toBe('suspended')
    if (r2.type !== 'suspended')
      return

    // Send "error" to trigger the error path
    const r3 = await resumeContinuation(r2.snapshot, 'error')
    expect(r3).toEqual({ type: 'completed', value: 'bad: ok-error' })
  })

  it('unhandled effect produces error result (not exception)', async () => {
    const result = await dvala.runAsync('perform(effect(no.handler.exists), "data")')
    expect(result.type).toBe('error')
    if (result.type === 'error') {
      expect(result.error.message).toContain('Unhandled effect')
    }
  })

  it('error in handler after resume is properly caught', async () => {
    const handlers: Handlers = {
      'my.wait': async ({ suspend }) => { suspend() },
    }

    const r1 = await dvala.runAsync(`
      do
        let x = perform(effect(my.wait));
        x / 0
      with
        case effect(dvala.error) then ([msg]) -> "div-error: " ++ msg
      end
    `, { effectHandlers: handlers })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return

    const r2 = await resumeContinuation(r1.snapshot, 0)
    // 0/0 = NaN → dvala.error
    expect(r2.type).toBe('completed')
    if (r2.type === 'completed') {
      expect(r2.value).toContain('div-error:')
    }
  })
})

// ---------------------------------------------------------------------------
// 13. Complex data structures through suspend/resume
// ---------------------------------------------------------------------------

describe('stress: complex data through suspend/resume', () => {
  it('deeply nested object survives suspend/resume', async () => {
    const handlers: Handlers = {
      'my.wait': async ({ suspend }) => { suspend() },
    }

    const r1 = await dvala.runAsync(`
      let data = {
        a: { b: { c: { d: [1, 2, 3] } } },
        e: [[4, 5], [6, 7]],
        f: "hello"
      };
      let x = perform(effect(my.wait));
      { result: data, input: x }
    `, { effectHandlers: handlers })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return

    const r2 = await resumeContinuation(r1.snapshot, 'world')
    expect(r2).toEqual({
      type: 'completed',
      value: {
        result: { a: { b: { c: { d: [1, 2, 3] } } }, e: [[4, 5], [6, 7]], f: 'hello' },
        input: 'world',
      },
    })
  })

  it('large array survives suspend/resume with JSON round-trip', async () => {
    const handlers: Handlers = {
      'my.wait': async ({ suspend }) => { suspend() },
    }

    const r1 = await dvala.runAsync(`
      let data = range(100);
      let x = perform(effect(my.wait));
      push(data, x)
    `, { effectHandlers: handlers })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return

    const json = JSON.stringify(r1.snapshot)
    const restored = JSON.parse(json) as Snapshot
    const r2 = await resumeContinuation(restored, 999)
    expect(r2.type).toBe('completed')
    if (r2.type === 'completed') {
      const arr = r2.value as number[]
      expect(arr.length).toBe(101)
      expect(arr[0]).toBe(0)
      expect(arr[99]).toBe(99)
      expect(arr[100]).toBe(999)
    }
  })

  it('string operations after suspend/resume', async () => {
    const handlers: Handlers = {
      'my.wait': async ({ suspend }) => { suspend() },
    }

    const r1 = await dvala.runAsync(`
      let greet = (name) -> "Hello, " ++ upper-case(name) ++ "!";
      let name = perform(effect(my.wait));
      greet(name)
    `, { effectHandlers: handlers })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return

    const r2 = await resumeContinuation(r1.snapshot, 'alice')
    expect(r2).toEqual({ type: 'completed', value: 'Hello, ALICE!' })
  })

  it('regex operations after suspend/resume', async () => {
    const handlers: Handlers = {
      'my.wait': async ({ suspend }) => { suspend() },
    }

    const r1 = await dvala.runAsync(`
      let pattern = #"(\\d+)";
      let input = perform(effect(my.wait));
      first(re-match(input, pattern))
    `, { effectHandlers: handlers })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return

    const r2 = await resumeContinuation(r1.snapshot, 'order-42-confirmed')
    expect(r2).toEqual({ type: 'completed', value: '42' })
  })
})

// ---------------------------------------------------------------------------
// 14. runSync edge cases
// ---------------------------------------------------------------------------

describe('stress: runSync edge cases', () => {
  it('runSync with local do/with handler works', () => {
    const result = dvala.run(`
      do
        perform(effect(my.eff), 21)
      with
        case effect(my.eff) then ([x]) -> x * 2
      end
    `)
    expect(result).toBe(42)
  })

  it('runSync with effect but caught locally does not throw', () => {
    const result = dvala.run(`
      do
        perform(effect(dvala.error), "oops")
      with
        case effect(dvala.error) then ([msg]) -> "caught: " ++ msg
      end
    `)
    expect(result).toBe('caught: oops')
  })

  it('runSync throws on unhandled effect', () => {
    expect(() => dvala.run('perform(effect(no.handler), "data")')).toThrow('Unhandled effect')
  })

  it('runSync throws on parallel', () => {
    expect(() => dvala.run('parallel(1, 2)')).toThrow()
  })

  it('runSync throws on race', () => {
    expect(() => dvala.run('race(1, 2)')).toThrow()
  })
})

// ---------------------------------------------------------------------------
// 15. Edge case: suspend inside cond/if/and/or
// ---------------------------------------------------------------------------

describe('stress: suspend inside control flow', () => {
  it('suspend inside if-then branch', async () => {
    const handlers: Handlers = {
      'my.wait': async ({ suspend }) => { suspend() },
    }

    const r1 = await dvala.runAsync(`
      if true then
        let x = perform(effect(my.wait));
        x * 2
      else
        0
      end
    `, { effectHandlers: handlers })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return

    const r2 = await resumeContinuation(r1.snapshot, 21)
    expect(r2).toEqual({ type: 'completed', value: 42 })
  })

  it('suspend inside cond expression', async () => {
    const handlers: Handlers = {
      'my.wait': async ({ suspend }) => { suspend() },
    }

    const r1 = await dvala.runAsync(`
      let flag = true;
      cond
        case flag then perform(effect(my.wait))
        case true then 0
      end
    `, { effectHandlers: handlers })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return

    const r2 = await resumeContinuation(r1.snapshot, 42)
    expect(r2).toEqual({ type: 'completed', value: 42 })
  })

  it('suspend inside && expression', async () => {
    const handlers: Handlers = {
      'my.wait': async ({ suspend }) => { suspend() },
    }

    const r1 = await dvala.runAsync(`
      true && perform(effect(my.wait))
    `, { effectHandlers: handlers })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return

    const r2 = await resumeContinuation(r1.snapshot, 'truthy')
    expect(r2).toEqual({ type: 'completed', value: 'truthy' })
  })

  it('suspend inside || expression (first is falsy)', async () => {
    const handlers: Handlers = {
      'my.wait': async ({ suspend }) => { suspend() },
    }

    const r1 = await dvala.runAsync(`
      false || perform(effect(my.wait))
    `, { effectHandlers: handlers })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return

    const r2 = await resumeContinuation(r1.snapshot, 'fallback')
    expect(r2).toEqual({ type: 'completed', value: 'fallback' })
  })

  it('|| short-circuits — no suspend when first is truthy', async () => {
    const result = await dvala.runAsync(`
      42 || perform(effect(my.wait))
    `, {
      effectHandlers: {
        'my.wait': async ({ suspend }) => { suspend() },
      },
    })
    expect(result).toMatchObject({ type: 'completed', value: 42 })
  })

  it('&& short-circuits — no suspend when first is falsy', async () => {
    const result = await dvala.runAsync(`
      false && perform(effect(my.wait))
    `, {
      effectHandlers: {
        'my.wait': async ({ suspend }) => { suspend() },
      },
    })
    expect(result).toMatchObject({ type: 'completed', value: false })
  })

  it('suspend inside let destructuring', async () => {
    const handlers: Handlers = {
      'my.wait': async ({ suspend }) => { suspend() },
    }

    const r1 = await dvala.runAsync(`
      let [a, b, c] = perform(effect(my.wait));
      a + b + c
    `, { effectHandlers: handlers })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return

    const r2 = await resumeContinuation(r1.snapshot, [10, 20, 12])
    expect(r2).toEqual({ type: 'completed', value: 42 })
  })
})

// ---------------------------------------------------------------------------
// 16. Complex end-to-end patterns
// ---------------------------------------------------------------------------

describe('stress: complex end-to-end patterns', () => {
  it('pipeline: fetch → transform → approve → finalize', async () => {
    const handlersStep1: Handlers = {
      'my.fetch': async ({ args, resume: r }) => { r(`data-${args[0]}`) },
      'my.transform': async ({ args, resume: r }) => { r(`transformed-${args[0]}`) },
      'my.approve': async ({ args, suspend }) => { suspend({ payload: args[0] }) },
    }

    const source = `
      let raw = perform(effect(my.fetch), "report");
      let processed = perform(effect(my.transform), raw);
      perform(effect(dvala.checkpoint), "stage ready-for-approval", { stage: "ready-for-approval" });
      let approval = perform(effect(my.approve), processed);
      if approval then "finalized: " ++ processed
      else "rejected"
      end
    `

    const r1 = await dvala.runAsync(source, { effectHandlers: handlersStep1 })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return
    expect(r1.snapshot.meta).toEqual({ payload: 'transformed-data-report' })

    // Approve
    const r2 = await resumeContinuation(r1.snapshot, true)
    expect(r2).toEqual({ type: 'completed', value: 'finalized: transformed-data-report' })
  })

  it('retry pattern: fail → rollback → succeed', async () => {
    let attempt = 0

    const result = await dvala.runAsync(`
      perform(effect(dvala.checkpoint), "stage start", { stage: "start" });
      let x = perform(effect(my.risky));
      x * 2
    `, {
      effectHandlers: {
        'my.risky': async ({ resume: r, snapshots, resumeFrom }) => {
          attempt++
          if (attempt < 3) {
            // Simulate failure — rollback
            resumeFrom(snapshots[0]!, 0)
          } else {
            r(21)
          }
        },
      },
    })
    expect(result).toMatchObject({ type: 'completed', value: 42 })
    expect(attempt).toBe(3)
  })

  it('accumulator pattern: multiple effects building a result', async () => {
    const result = await dvala.runAsync(`
      let a = perform(effect(my.get), 1);
      let b = perform(effect(my.get), 2);
      let c = perform(effect(my.get), 3);
      [a, b, c]
    `, {
      effectHandlers: {
        'my.get': async ({ args, resume: r }) => { r((args[0] as number) * 10) },
      },
    })
    expect(result).toMatchObject({ type: 'completed', value: [10, 20, 30] })
  })

  it('suspend inside map callback via host handler', async () => {
    // This tests whether map can work with async host effects
    const result = await dvala.runAsync(`
      map([1, 2, 3], (x) -> perform(effect(my.double), x))
    `, {
      effectHandlers: {
        'my.double': async ({ args, resume: r }) => { r((args[0] as number) * 2) },
      },
    })
    expect(result).toMatchObject({ type: 'completed', value: [2, 4, 6] })
  })

  it('filter with effect predicate', async () => {
    const result = await dvala.runAsync(`
      do
        filter([1, 2, 3, 4, 5, 6], (x) -> perform(effect(my.even?), x))
      with
        case effect(my.even?) then ([x]) -> x % 2 == 0
      end
    `)
    expect(result).toMatchObject({ type: 'completed', value: [2, 4, 6] })
  })

  it('multi-step computation with intermediate checkpoints and final collection', async () => {
    let snapshotsAtEnd: readonly Snapshot[] = []

    const result = await dvala.runAsync(`
      perform(effect(dvala.checkpoint), "phase 1", { phase: 1 });
      let a = perform(effect(my.compute), 1);
      perform(effect(dvala.checkpoint), "phase 2", { phase: 2 });
      let b = perform(effect(my.compute), 2);
      perform(effect(dvala.checkpoint), "phase 3", { phase: 3 });
      let c = perform(effect(my.compute), 3);
      perform(effect(my.report));
      [a, b, c]
    `, {
      effectHandlers: {
        'my.compute': async ({ args, resume: r }) => { r((args[0] as number) * 10) },
        'my.report': async ({ snapshots, resume: r }) => {
          snapshotsAtEnd = [...snapshots]
          r(null)
        },
      },
    })
    expect(result).toMatchObject({ type: 'completed', value: [10, 20, 30] })
    expect(snapshotsAtEnd.length).toBe(3)
    expect((snapshotsAtEnd[0] as Snapshot).meta).toEqual({ phase: 1 })
    expect((snapshotsAtEnd[1] as Snapshot).meta).toEqual({ phase: 2 })
    expect((snapshotsAtEnd[2] as Snapshot).meta).toEqual({ phase: 3 })
  })
})
