import { describe, expect, it } from 'vitest'
import { createDvala } from '../src/createDvala'
import type { Snapshot } from '../src/evaluator/effectTypes'
import { retrigger } from '../src/retrigger'
import { resume } from '../src/resume'

const dvala = createDvala()

// ---------------------------------------------------------------------------
// effectName / effectArgs captured in snapshot
// ---------------------------------------------------------------------------

describe('snapshot captures effectName and effectArgs', () => {
  it('captures effectName when handler suspends', async () => {
    const result = await dvala.runAsync(`
      perform(effect(my.task), 42)
    `, {
      effectHandlers: {
        'my.task': async ({ suspend }) => { suspend() },
      },
    })
    expect(result.type).toBe('suspended')
    if (result.type !== 'suspended')
      return
    expect(result.snapshot.effectName).toBe('my.task')
  })

  it('captures effectArgs when handler suspends', async () => {
    const result = await dvala.runAsync(`
      perform(effect(my.task), 1, "hello", true)
    `, {
      effectHandlers: {
        'my.task': async ({ suspend }) => { suspend() },
      },
    })
    expect(result.type).toBe('suspended')
    if (result.type !== 'suspended')
      return
    expect(result.snapshot.effectArgs).toEqual([1, 'hello', true])
  })

  it('captures effectName from a suspending parallel branch', async () => {
    // my.a resumes, my.b suspends — outer snapshot should carry my.b's effectName
    const result = await dvala.runAsync(`
      parallel(
        perform(effect(my.a)),
        perform(effect(my.b))
      )
    `, {
      effectHandlers: {
        'my.a': async ({ resume: r }) => { r(1) },
        'my.b': async ({ suspend }) => { suspend() },
      },
    })
    expect(result.type).toBe('suspended')
    if (result.type !== 'suspended')
      return
    expect(result.snapshot.effectName).toBe('my.b')
  })

  it('captures effectName and args across JSON round-trip', async () => {
    const result = await dvala.runAsync(`
      perform(effect(my.save), { id: 99 })
    `, {
      effectHandlers: {
        'my.save': async ({ suspend }) => { suspend() },
      },
    })
    expect(result.type).toBe('suspended')
    if (result.type !== 'suspended')
      return

    const roundTripped = JSON.parse(JSON.stringify(result.snapshot)) as Snapshot
    expect(roundTripped.effectName).toBe('my.save')
    expect(roundTripped.effectArgs).toEqual([{ id: 99 }])
  })
})

// ---------------------------------------------------------------------------
// retrigger() basics
// ---------------------------------------------------------------------------

describe('retrigger()', () => {
  it('re-fires the effect and completes when handler resumes', async () => {
    const r1 = await dvala.runAsync(`
      let x = perform(effect(my.ask));
      x + 1
    `, {
      effectHandlers: {
        'my.ask': async ({ suspend }) => { suspend() },
      },
    })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return

    const r2 = await retrigger(r1.snapshot, {
      handlers: {
        'my.ask': async ({ resume: r }) => { r(10) },
      },
    })
    expect(r2.type).toBe('completed')
    if (r2.type !== 'completed')
      return
    expect(r2.value).toBe(11)
  })

  it('passes original effectArgs to the retriggered handler', async () => {
    let capturedArgs: unknown[] = []
    const r1 = await dvala.runAsync(`
      perform(effect(my.task), "foo", 42)
    `, {
      effectHandlers: {
        'my.task': async ({ suspend }) => { suspend() },
      },
    })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return

    await retrigger(r1.snapshot, {
      handlers: {
        'my.task': async ({ args, resume: r }) => {
          capturedArgs = args
          r(null)
        },
      },
    })
    expect(capturedArgs).toEqual(['foo', 42])
  })

  it('returns error when snapshot has no effectName', async () => {
    // Construct a minimal snapshot without effectName
    const r1 = await dvala.runAsync(`
      perform(effect(my.thing))
    `, {
      effectHandlers: {
        'my.thing': async ({ suspend }) => { suspend() },
      },
    })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return

    // Strip effectName to simulate a non-effect suspension
    const strippedSnapshot = { ...r1.snapshot, effectName: undefined, effectArgs: undefined }
    const r2 = await retrigger(strippedSnapshot, {
      handlers: { 'my.thing': async ({ resume: r }) => { r(null) } },
    })
    expect(r2.type).toBe('error')
  })

  it('re-suspends if the retriggered handler suspends again', async () => {
    const r1 = await dvala.runAsync(`
      perform(effect(my.step))
    `, {
      effectHandlers: {
        'my.step': async ({ suspend }) => { suspend() },
      },
    })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return

    // Retrigger but the handler suspends again
    const r2 = await retrigger(r1.snapshot, {
      handlers: {
        'my.step': async ({ suspend }) => { suspend() },
      },
    })
    expect(r2.type).toBe('suspended')
  })

  it('works after JSON round-trip of the snapshot', async () => {
    const r1 = await dvala.runAsync(`
      let x = perform(effect(my.get));
      x * 2
    `, {
      effectHandlers: {
        'my.get': async ({ suspend }) => { suspend() },
      },
    })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return

    const roundTripped = JSON.parse(JSON.stringify(r1.snapshot)) as Snapshot
    const r2 = await retrigger(roundTripped, {
      handlers: {
        'my.get': async ({ resume: r }) => { r(7) },
      },
    })
    expect(r2.type).toBe('completed')
    if (r2.type !== 'completed')
      return
    expect(r2.value).toBe(14)
  })

  it('can retrigger then resume to chain two suspensions', async () => {
    const r1 = await dvala.runAsync(`
      let a = perform(effect(my.first));
      let b = perform(effect(my.second));
      a + b
    `, {
      effectHandlers: {
        'my.first': async ({ suspend }) => { suspend() },
        'my.second': async ({ suspend }) => { suspend() },
      },
    })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return
    expect(r1.snapshot.effectName).toBe('my.first')

    // Retrigger first effect, handler resumes with 3
    const r2 = await retrigger(r1.snapshot, {
      handlers: {
        'my.first': async ({ resume: r }) => { r(3) },
        'my.second': async ({ suspend }) => { suspend() },
      },
    })
    expect(r2.type).toBe('suspended')
    if (r2.type !== 'suspended')
      return
    expect(r2.snapshot.effectName).toBe('my.second')

    // Resume second effect with 4
    const r3 = await resume(r2.snapshot, 4)
    expect(r3.type).toBe('completed')
    if (r3.type !== 'completed')
      return
    expect(r3.value).toBe(7)
  })

  it('preserves effectName/effectArgs when a parallel branch suspends', async () => {
    // Resume branch A, suspend branch B — snapshot should capture B's effect
    const r1 = await dvala.runAsync(`
      parallel(
        perform(effect(foo.bar), "A"),
        perform(effect(foo.bar), "B")
      )
    `, {
      effectHandlers: {
        'foo.bar': async ({ args, resume: r, suspend }) => {
          if (args[0] === 'A')
            r('resumed-A')
          else
            suspend()
        },
      },
    })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return
    expect(r1.snapshot.effectName).toBe('foo.bar')
    expect(r1.snapshot.effectArgs).toEqual(['B'])
  })

  it('can retrigger a snapshot from a parallel branch suspension', async () => {
    // Resume branch A, suspend branch B — then retrigger B
    const r1 = await dvala.runAsync(`
      parallel(
        perform(effect(foo.bar), "A"),
        perform(effect(foo.bar), "B")
      )
    `, {
      effectHandlers: {
        'foo.bar': async ({ args, resume: r, suspend }) => {
          if (args[0] === 'A')
            r('got-A')
          else
            suspend()
        },
      },
    })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return

    const r2 = await retrigger(r1.snapshot, {
      handlers: {
        'foo.bar': async ({ resume: r }) => { r('got-B') },
      },
    })
    expect(r2.type).toBe('completed')
    if (r2.type !== 'completed')
      return
    expect(r2.value).toEqual(['got-A', 'got-B'])
  })

  it('abort signal suspends remaining branches when one branch suspends in parallel', async () => {
    // A resumes, B suspends → B's suspension aborts the group → C auto-suspends.
    // When retriggered, B and C are dispatched concurrently (not sequentially).
    const r1 = await dvala.runAsync(`
      parallel(
        perform(effect(foo.bar), "A"),
        perform(effect(foo.bar), "B"),
        perform(effect(foo.bar), "C")
      )
    `, {
      effectHandlers: {
        'foo.bar': async ({ args, resume: r, suspend, signal }) => {
          if (args[0] === 'A') {
            r('got-A')
          }
          else if (args[0] === 'B') {
            suspend()
          }
          else {
            // C: auto-suspend when the parallel group aborts
            await new Promise<void>((resolve) => {
              signal.addEventListener('abort', () => {
                suspend()
                resolve()
              }, { once: true })
            })
          }
        },
      },
    })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return
    expect(r1.snapshot.effectName).toBe('foo.bar')
    expect(r1.snapshot.effectArgs).toEqual(['B'])

    // Retrigger: B and C are dispatched concurrently — single retrigger completes all
    const r2 = await retrigger(r1.snapshot, {
      handlers: {
        'foo.bar': async ({ args, resume: r }) => {
          r(args[0] === 'B' ? 'got-B' : 'got-C')
        },
      },
    })
    expect(r2.type).toBe('completed')
    if (r2.type !== 'completed')
      return
    expect(r2.value).toEqual(['got-A', 'got-B', 'got-C'])
  })

  it('re-suspends when the re-triggered branch suspends again and other branches abort', async () => {
    // A suspends → B and C auto-suspend via abort. Retrigger → A suspends again.
    // Expected: program suspended (B and C should auto-abort via parallelAbort,
    // NOT shown in the effect modal).
    const suspendHandler = async ({ args, suspend, signal }: { args: any[], suspend: () => void, signal: AbortSignal }) => {
      if (args[0] === 'A') {
        suspend()
      }
      else {
        // B and C: auto-suspend when A suspends (abort signal fires)
        await new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => {
            suspend()
            resolve()
          }, { once: true })
        })
      }
    }

    const r1 = await dvala.runAsync(`
      parallel(
        perform(effect(foo.bar), "A"),
        perform(effect(foo.bar), "B"),
        perform(effect(foo.bar), "C")
      )
    `, { effectHandlers: { 'foo.bar': suspendHandler } })

    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return
    expect(r1.snapshot.effectName).toBe('foo.bar')
    expect(r1.snapshot.effectArgs).toEqual(['A'])

    // Retrigger — A suspends again; B and C must also re-suspend via abort
    const r2 = await retrigger(r1.snapshot, {
      handlers: { 'foo.bar': suspendHandler },
    })
    expect(r2.type).toBe('suspended')
  })

  it('accepts modules option and passes them through deserialization', async () => {
    const r1 = await dvala.runAsync(`
      perform(effect(my.ask))
    `, {
      effectHandlers: {
        'my.ask': async ({ suspend }) => { suspend() },
      },
    })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return

    const dummyModule = { name: 'test-mod', functions: {} }
    const r2 = await retrigger(r1.snapshot, {
      modules: [dummyModule],
      handlers: {
        'my.ask': async ({ resume: r }) => { r(99) },
      },
    })
    expect(r2.type).toBe('completed')
    if (r2.type !== 'completed')
      return
    expect(r2.value).toBe(99)
  })

  it('returns error result when deserialization throws a DvalaError', async () => {
    // eslint-disable-next-line ts/no-unsafe-assignment
    const badSnapshot = {
      continuation: 'not-a-valid-continuation',
      effectName: 'my.effect',
      effectArgs: [],
    } as any
    // eslint-disable-next-line ts/no-unsafe-argument
    const result1 = await retrigger(badSnapshot, {
      handlers: { 'my.effect': async ({ resume: res }) => { res(1) } },
    })
    expect(result1.type).toBe('error')
  })

  it('wraps non-DvalaError exceptions in a DvalaError', async () => {
    // Pass a continuation that will cause a generic JS error (not DvalaError)
    // eslint-disable-next-line ts/no-unsafe-assignment
    const badSnapshot = {
      continuation: null,
      effectName: 'my.effect',
      effectArgs: [],
    } as any
    // eslint-disable-next-line ts/no-unsafe-argument
    const result2 = await retrigger(badSnapshot, {
      handlers: { 'my.effect': async ({ resume: res }) => { res(1) } },
    })
    expect(result2.type).toBe('error')
  })
})
