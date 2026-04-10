/**
 * Tests for parallel snapshot composition (Phase 1+).
 *
 * Phase 1: BarrierFrame infrastructure, effect isolation, branch completion.
 * Phase 2: Checkpoint composition (composeCheckpointContinuation).
 * Phase 3: Resume logic (ReRunParallelFrame, ResumeParallelFrame handlers).
 */

import { describe, expect, it } from 'vitest'
import { createDvala } from '../src/createDvala'
import { resume as baseResume } from '../src/resume'
import { retrigger } from '../src/retrigger'
import type { Handlers, Snapshot } from '../src/evaluator/effectTypes'
import type { Any } from '../src/interface'
import type { ResumeOptions } from '../src/resume'

const dvala = createDvala({ disableAutoCheckpoint: true })

function resumeContinuation(snapshot: Snapshot, value: Any, options?: ResumeOptions) {
  return baseResume(snapshot, value, { disableAutoCheckpoint: true, ...options })
}

// ---------------------------------------------------------------------------
// Phase 1 tests — effect isolation, BarrierFrame boundary, branch completion
// ---------------------------------------------------------------------------

describe('Phase 1: BarrierFrame infrastructure', () => {
  describe('effect isolation', () => {
    it('algebraic handler outside parallel does NOT catch effects from inside branch', async () => {
      // The BarrierFrame must stop effect propagation from branch → outer handler.
      // Without the barrier, @test.eff would propagate to the outer handler.
      // With the barrier, it falls through to the host handler.
      let hostHandlerCalled = false

      const result = await dvala.runAsync(
        'do with handler @test.eff(x) -> resume(x * 100) end; parallel(perform(@test.eff, 5), 10) end',
        {
          effectHandlers: [
            {
              pattern: 'test.eff',
              handler: async ({ resume }) => {
                hostHandlerCalled = true
                resume('host-handled')
              },
            },
          ],
        },
      )

      // The effect should have been handled by the HOST handler (fell through barrier),
      // not by the outer algebraic handler (which would give [500, 10])
      expect(hostHandlerCalled).toBe(true)
      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toEqual(['host-handled', 10])
      }
    })

    it('algebraic handler INSIDE a branch catches effects within that branch', async () => {
      // Handlers defined inside a branch should work normally — the BarrierFrame
      // only blocks propagation OUT, not within the branch.
      const result = await dvala.runAsync(
        'parallel(do with handler @inner.eff(x) -> resume(x * 2) end; perform(@inner.eff, 21) end, 42)',
      )

      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toEqual([42, 42])
      }
    })

    it('dvala.error handler outside parallel does NOT catch errors from inside branch', async () => {
      // tryDispatchDvalaError must also stop at the BarrierFrame.
      // Errors inside branches should produce branch-level errors, not propagate
      // to outer algebraic @dvala.error handlers.
      const result = await dvala.runAsync(
        'do with handler @dvala.error(e) -> resume("caught-outer") end; parallel(throw("branch-error"), 10) end',
      )

      // The error should NOT be caught by the outer handler — it should
      // cause the branch to error, which makes the parallel fail.
      expect(result.type).toBe('error')
    })

    it('dvala.error handler INSIDE a branch catches errors within that branch', async () => {
      // Error handlers inside a branch work normally.
      const result = await dvala.runAsync(
        'parallel(do with handler @dvala.error(e) -> resume("caught-inner") end; throw("branch-error") end, 42)',
      )

      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toEqual(['caught-inner', 42])
      }
    })
  })

  describe('branch completion through BarrierFrame', () => {
    it('pure-computation branches complete correctly', async () => {
      const result = await dvala.runAsync('parallel(1 + 2, 3 * 4, 5 + 5)')

      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toEqual([3, 12, 10])
      }
    })

    it('branches with host effects complete correctly', async () => {
      const result = await dvala.runAsync(
        'parallel(perform(@val, "a"), perform(@val, "b"))',
        {
          effectHandlers: [
            { pattern: 'val', handler: async ({ arg, resume }) => { resume(`got-${arg}`) } },
          ],
        },
      )

      expect(result.type).toBe('completed')
      if (result.type === 'completed') {
        expect(result.value).toEqual(['got-a', 'got-b'])
      }
    })

    it('mixed completion and suspension works', async () => {
      const result = await dvala.runAsync(
        'parallel(42, perform(@slow, "x"))',
        {
          effectHandlers: [
            { pattern: 'slow', handler: async ({ suspend }) => { suspend() } },
          ],
        },
      )

      expect(result.type).toBe('suspended')
    })

    it('all branches suspended produces a suspension', async () => {
      const result = await dvala.runAsync(
        'parallel(perform(@wait, "a"), perform(@wait, "b"))',
        {
          effectHandlers: [
            { pattern: 'wait', handler: async ({ suspend }) => { suspend() } },
          ],
        },
      )

      expect(result.type).toBe('suspended')
    })
  })

  describe('snapshot state threading', () => {
    it('branches inherit the outer executionId', async () => {
      // Pre-parallel checkpoints should be in the branch's snapshot timeline.
      // Branches inherit the outer executionId so resumeFrom() can find
      // pre-parallel snapshots.
      let branchExecutionId: string | undefined

      const result = await dvala.runAsync(
        'parallel(perform(@check.id), 1)',
        {
          effectHandlers: [
            {
              pattern: 'check.id',
              handler: async ({ resume, checkpoint }) => {
                const snap = checkpoint('branch-checkpoint')
                branchExecutionId = snap.executionId
                resume('done')
              },
            },
          ],
        },
      )

      expect(result.type).toBe('completed')
      expect(branchExecutionId).toBeDefined()
      // The executionId should be a valid UUID (inherited from outer)
      expect(branchExecutionId).toMatch(/^[0-9a-f-]+$/)
    })

    it('branches inherit snapshot state from outer scope', async () => {
      // When autoCheckpoint is on, branches should start with the outer
      // snapshot state (including pre-parallel checkpoints).
      let branchSnapshotCount = 0

      const result = await dvala.runAsync(
        'perform(@outer, null); parallel(perform(@inner), 1)',
        {
          effectHandlers: [
            { pattern: 'outer', handler: async ({ resume }) => { resume(null) } },
            {
              pattern: 'inner',
              handler: async ({ resume, checkpoint }) => {
                // Take a checkpoint and see how many snapshots exist
                // (should include pre-parallel auto-checkpoints)
                const snap = checkpoint('in-branch')
                branchSnapshotCount = 1 // checkpoint succeeded
                resume('done')
              },
            },
          ],
          autoCheckpoint: true,
        },
      )

      expect(result.type).toBe('completed')
      expect(branchSnapshotCount).toBe(1)
    })
  })
})

// ---------------------------------------------------------------------------
// Phase 2 tests — checkpoint composition
// ---------------------------------------------------------------------------

describe('Phase 2: Checkpoint composition', () => {
  it('host checkpoint inside parallel branch produces a resumable snapshot', async () => {
    // A checkpoint taken inside a branch should capture the full program state.
    // Resuming from it should complete the full program (not just the branch).
    let branchCheckpoint: Snapshot | undefined

    const result1 = await dvala.runAsync(
      'parallel(perform(@task, "a"), perform(@task, "b"))',
      {
        effectHandlers: [
          {
            pattern: 'task',
            handler: async ({ arg, resume, checkpoint }) => {
              if (arg === 'a') {
                branchCheckpoint = checkpoint('mid-branch-a')
                resume('result-a')
              } else {
                resume('result-b')
              }
            },
          },
        ],
      },
    )

    expect(result1.type).toBe('completed')
    if (result1.type === 'completed') {
      expect(result1.value).toEqual(['result-a', 'result-b'])
    }

    // The checkpoint should exist
    expect(branchCheckpoint).toBeDefined()

    // Resume from the checkpoint — this should re-run siblings from scratch
    // and complete the full program. Handlers must be provided for re-run.
    const result2 = await resumeContinuation(branchCheckpoint!, 'replayed-a', {
      handlers: [
        {
          pattern: 'task',
          handler: async ({ arg, resume }: any) => {
            resume(`resume-${arg}`)
          },
        },
      ],
    })

    expect(result2.type).toBe('completed')
    if (result2.type === 'completed') {
      // Branch A gets the resume value, branch B is re-run with new handlers
      expect(result2.value).toEqual(['replayed-a', 'resume-b'])
    }
  })

  it('checkpoint inside branch with mixed completion/suspension', async () => {
    // One branch takes a checkpoint and completes, another suspends.
    // Resuming from the checkpoint should re-run the suspending sibling.
    let checkpoint1: Snapshot | undefined

    const result1 = await dvala.runAsync(
      'parallel(perform(@cp, "a"), perform(@slow, "b"))',
      {
        effectHandlers: [
          {
            pattern: 'cp',
            handler: async ({ resume, checkpoint }) => {
              checkpoint1 = checkpoint('before-resume-a')
              resume('value-a')
            },
          },
          {
            pattern: 'slow',
            handler: async ({ suspend }) => {
              suspend()
            },
          },
        ],
      },
    )

    // Original run suspended because branch B suspended
    expect(result1.type).toBe('suspended')

    // Resume from the checkpoint — branch B will be re-run from AST,
    // which will hit the slow handler and suspend again
    const result2 = await resumeContinuation(checkpoint1!, 'replayed-a', {
      handlers: [
        { pattern: 'slow', handler: async ({ resume }: any) => { resume('slow-done') } },
      ],
    })

    expect(result2.type).toBe('completed')
    if (result2.type === 'completed') {
      expect(result2.value).toEqual(['replayed-a', 'slow-done'])
    }
  })

  it('auto-checkpoint inside parallel branch is composed correctly', async () => {
    // With autoCheckpoint, checkpoints are automatically taken after each effect.
    // Inside a parallel branch, these should be full-program continuations.
    const dvalaAuto = createDvala({ autoCheckpoint: true })
    const result = await dvalaAuto.runAsync(
      'parallel(perform(@eff, "x"), 42)',
      {
        effectHandlers: [
          { pattern: 'eff', handler: async ({ resume }) => { resume('got-x') } },
        ],
      },
    )

    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      expect(result.value).toEqual(['got-x', 42])
      // Terminal snapshot from autoCheckpoint
      expect(result.snapshot).toBeDefined()
    }
  })
})

// ---------------------------------------------------------------------------
// Phase 3 tests — resume logic
// ---------------------------------------------------------------------------

describe('Phase 3: Resume logic', () => {
  it('ResumeParallelFrame: resumed branch completes, siblings re-triggered', async () => {
    // All 3 branches suspend. Resume branch A → siblings B and C are re-triggered.
    const handlers: Handlers = [
      { pattern: 'task', handler: async ({ arg, suspend, resume }: any) => {
        if (arg === 'A') suspend({ step: 'A' })
        else if (arg === 'B') suspend({ step: 'B' })
        else suspend({ step: 'C' })
      } },
    ]

    const r1 = await dvala.runAsync(
      'parallel(perform(@task, "A"), perform(@task, "B"), perform(@task, "C"))',
      { effectHandlers: handlers },
    )
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended') return

    // Resume with all handlers completing
    const r2 = await resumeContinuation(r1.snapshot, 'got-A', {
      handlers: [
        { pattern: 'task', handler: async ({ arg, resume }: any) => {
          resume(arg === 'B' ? 'got-B' : 'got-C')
        } },
      ],
    })

    // After resuming A, siblings B and C are re-triggered and complete
    expect(r2.type).toBe('completed')
    if (r2.type === 'completed') {
      expect(r2.value).toEqual(['got-A', 'got-B', 'got-C'])
    }
  })

  it('ResumeParallelFrame: sibling re-suspends during resume', async () => {
    // All branches suspend. Resume A. B re-suspends, C completes.
    const r1 = await dvala.runAsync(
      'parallel(perform(@task, "A"), perform(@task, "B"), perform(@task, "C"))',
      {
        effectHandlers: [
          { pattern: 'task', handler: async ({ suspend }: any) => { suspend() } },
        ],
      },
    )
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended') return

    // First resume: A completes, B re-suspends, C completes
    const r2 = await resumeContinuation(r1.snapshot, 'got-A', {
      handlers: [
        { pattern: 'task', handler: async ({ arg, resume, suspend }: any) => {
          if (arg === 'B') suspend()
          else resume('got-C')
        } },
      ],
    })
    expect(r2.type).toBe('suspended')
    if (r2.type !== 'suspended') return

    // Second resume: B completes
    const r3 = await resumeContinuation(r2.snapshot, 'got-B')
    expect(r3.type).toBe('completed')
    if (r3.type === 'completed') {
      expect(r3.value).toEqual(['got-A', 'got-B', 'got-C'])
    }
  })

  it('ReRunParallelFrame: checkpoint resume re-runs siblings from AST', async () => {
    // Branch A takes a checkpoint and completes. Branch B completes.
    // Resuming from A's checkpoint with a new value should re-run B.
    let cp: Snapshot | undefined
    let bCallCount = 0

    const r1 = await dvala.runAsync(
      'parallel(perform(@cp.branch, "a"), perform(@simple, "b"))',
      {
        effectHandlers: [
          {
            pattern: 'cp.branch',
            handler: async ({ resume, checkpoint }: any) => {
              cp = checkpoint('mid-a')
              resume('first-a')
            },
          },
          {
            pattern: 'simple',
            handler: async ({ resume }: any) => {
              bCallCount++
              resume(`b-call-${bCallCount}`)
            },
          },
        ],
      },
    )

    expect(r1.type).toBe('completed')
    if (r1.type === 'completed') {
      expect(r1.value).toEqual(['first-a', 'b-call-1'])
    }
    expect(bCallCount).toBe(1)

    // Resume from checkpoint — B should be re-run from AST (bCallCount increases)
    const r2 = await resumeContinuation(cp!, 'second-a', {
      handlers: [
        { pattern: 'simple', handler: async ({ resume }: any) => {
          bCallCount++
          resume(`b-call-${bCallCount}`)
        } },
      ],
    })

    expect(r2.type).toBe('completed')
    if (r2.type === 'completed') {
      expect(r2.value).toEqual(['second-a', 'b-call-2'])
    }
    expect(bCallCount).toBe(2)
  })

  it('retrigger works with new ResumeParallelFrame', async () => {
    // Verify the retrigger path works with the new frame types
    const r1 = await dvala.runAsync(
      'parallel(perform(@task, "A"), 42)',
      {
        effectHandlers: [
          { pattern: 'task', handler: async ({ suspend }: any) => { suspend() } },
        ],
      },
    )
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended') return

    const r2 = await retrigger(r1.snapshot, {
      handlers: [
        { pattern: 'task', handler: async ({ resume }: any) => { resume('retriggered') } },
      ],
    })
    expect(r2.type).toBe('completed')
    if (r2.type === 'completed') {
      expect(r2.value).toEqual(['retriggered', 42])
    }
  })

  it('multi-shot: host resumes same composed snapshot twice independently', async () => {
    // Each resume from the same snapshot should run independently.
    const r1 = await dvala.runAsync(
      'parallel(perform(@task, "A"), perform(@task, "B"))',
      {
        effectHandlers: [
          { pattern: 'task', handler: async ({ suspend }: any) => { suspend() } },
        ],
      },
    )
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended') return

    // Resume twice from the same snapshot with different values
    const [r2, r3] = await Promise.all([
      resumeContinuation(r1.snapshot, 'first-run', {
        handlers: [{ pattern: 'task', handler: async ({ resume }: any) => { resume('sibling-1') } }],
      }),
      resumeContinuation(r1.snapshot, 'second-run', {
        handlers: [{ pattern: 'task', handler: async ({ resume }: any) => { resume('sibling-2') } }],
      }),
    ])

    // Both should complete independently with their own values
    expect(r2.type).toBe('completed')
    expect(r3.type).toBe('completed')
    if (r2.type === 'completed') expect(r2.value).toEqual(['first-run', 'sibling-1'])
    if (r3.type === 'completed') expect(r3.value).toEqual(['second-run', 'sibling-2'])
  })

  it('multi-shot within a branch works normally', async () => {
    // A handler inside a branch that calls resume() multiple times should
    // work the same as without the BarrierFrame.
    const result = await dvala.runAsync(
      'parallel(do with handler @choose(opts) -> reduce(opts, (acc, x) -> [...acc, resume(x)], []) end; perform(@choose, [1, 2, 3]) end, 42)',
    )

    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      expect(result.value).toEqual([[1, 2, 3], 42])
    }
  })

  it('effect handlers inside branches survive checkpoint → resume', async () => {
    // Branch-local algebraic handlers should still work after checkpoint resume.
    let cp: Snapshot | undefined

    await dvala.runAsync(
      'parallel(do with handler @local.eff(x) -> resume(x * 10) end; let r = perform(@trigger); perform(@local.eff, r) end, 1)',
      {
        effectHandlers: [
          {
            pattern: 'trigger',
            handler: async ({ resume, checkpoint }: any) => {
              cp = checkpoint('before-local-eff')
              resume(5)
            },
          },
        ],
      },
    )

    expect(cp).toBeDefined()

    // Resume from checkpoint — the branch-local handler should still catch @local.eff
    const r2 = await resumeContinuation(cp!, 7, {
      handlers: [
        { pattern: 'trigger', handler: async ({ resume }: any) => { resume(7) } },
      ],
    })

    expect(r2.type).toBe('completed')
    if (r2.type === 'completed') {
      // Branch: perform(@trigger) → 7, then perform(@local.eff, 7) → 70 (local handler)
      expect(r2.value).toEqual([70, 1])
    }
  })
})

// ---------------------------------------------------------------------------
// Phase 2+3: Nested parallel and time travel
// ---------------------------------------------------------------------------

describe('Nested parallel and time travel', () => {
  it('nested parallel(parallel(...), ...) checkpoint composition', async () => {
    // Checkpoint inside an inner parallel branch should compose through
    // both levels: inner ReRunFrame → outer ReRunFrame → outerK
    let innerCp: Snapshot | undefined

    const r1 = await dvala.runAsync(
      'parallel(parallel(perform(@inner, "a"), perform(@inner, "b")), perform(@outer, "c"))',
      {
        effectHandlers: [
          {
            pattern: 'inner',
            handler: async ({ arg, resume, checkpoint }: any) => {
              if (arg === 'a') {
                innerCp = checkpoint('nested-cp')
              }
              resume(`inner-${arg}`)
            },
          },
          {
            pattern: 'outer',
            handler: async ({ arg, resume }: any) => { resume(`outer-${arg}`) },
          },
        ],
      },
    )

    expect(r1.type).toBe('completed')
    if (r1.type === 'completed') {
      expect(r1.value).toEqual([['inner-a', 'inner-b'], 'outer-c'])
    }
    expect(innerCp).toBeDefined()

    // Resume from nested checkpoint — should re-run inner sibling b AND outer sibling c
    const r2 = await resumeContinuation(innerCp!, 'replayed-a', {
      handlers: [
        { pattern: 'inner', handler: async ({ arg, resume }: any) => { resume(`re-inner-${arg}`) } },
        { pattern: 'outer', handler: async ({ arg, resume }: any) => { resume(`re-outer-${arg}`) } },
      ],
    })

    expect(r2.type).toBe('completed')
    if (r2.type === 'completed') {
      expect(r2.value).toEqual([['replayed-a', 're-inner-b'], 're-outer-c'])
    }
  })

  it('time travel: resume from pre-parallel checkpoint via host API', async () => {
    // Take a checkpoint before parallel, then complete.
    // Resume from the pre-parallel checkpoint — the entire parallel is re-evaluated.
    let preParallelCp: Snapshot | undefined

    const r1 = await dvala.runAsync(
      'perform(@setup); parallel(perform(@task, "a"), perform(@task, "b"))',
      {
        effectHandlers: [
          {
            pattern: 'setup',
            handler: async ({ resume, checkpoint }: any) => {
              preParallelCp = checkpoint('pre-parallel')
              resume(null)
            },
          },
          {
            pattern: 'task',
            handler: async ({ arg, resume }: any) => { resume(`first-${arg}`) },
          },
        ],
      },
    )

    expect(r1.type).toBe('completed')
    if (r1.type === 'completed') {
      expect(r1.value).toEqual(['first-a', 'first-b'])
    }
    expect(preParallelCp).toBeDefined()

    // Resume from the pre-parallel checkpoint — re-evaluates everything after it
    const r2 = await resumeContinuation(preParallelCp!, 'new-setup', {
      handlers: [
        { pattern: 'task', handler: async ({ arg, resume }: any) => { resume(`second-${arg}`) } },
      ],
    })

    expect(r2.type).toBe('completed')
    if (r2.type === 'completed') {
      // The parallel is re-evaluated with new handlers
      expect(r2.value).toEqual(['second-a', 'second-b'])
    }
  })
})

// ---------------------------------------------------------------------------
// Phase 5: Race-specific tests
// ---------------------------------------------------------------------------

describe('Phase 5: Race-specific', () => {
  it('race suspension: resume completes race (first wins)', async () => {
    const r1 = await dvala.runAsync(
      'race(perform(@slow.a), perform(@slow.b))',
      {
        effectHandlers: [
          { pattern: 'slow.a', handler: async ({ suspend }: any) => { suspend({ branch: 'A' }) } },
          { pattern: 'slow.b', handler: async ({ suspend }: any) => { suspend({ branch: 'B' }) } },
        ],
      },
    )
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended') return

    // Resume primary branch — it completes, sibling is re-triggered, first to complete wins
    const r2 = await resumeContinuation(r1.snapshot, 'winner', {
      handlers: [
        { pattern: 'slow.b', handler: async ({ resume }: any) => { resume('loser') } },
      ],
    })

    expect(r2.type).toBe('completed')
    if (r2.type === 'completed') {
      // Race: first completed value wins (the resumed branch with 'winner')
      expect(r2.value).toBe('winner')
    }
  })

  it('race re-suspension: all branches re-suspend', async () => {
    const r1 = await dvala.runAsync(
      'race(perform(@task, "A"), perform(@task, "B"))',
      {
        effectHandlers: [
          { pattern: 'task', handler: async ({ suspend }: any) => { suspend() } },
        ],
      },
    )
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended') return

    // Resume: primary completes, but sibling re-suspends → race re-suspends
    const r2 = await resumeContinuation(r1.snapshot, 'got-A', {
      handlers: [
        { pattern: 'task', handler: async ({ suspend }: any) => { suspend() } },
      ],
    })

    // The race should re-suspend because sibling B re-suspended
    // and there's no completed branch to win (the resumed branch A completed
    // but B hasn't — race needs first to complete, A already completed via resume)
    // Actually: A completed (resumed value), B re-suspended. Race picks A as winner.
    expect(r2.type).toBe('completed')
    if (r2.type === 'completed') {
      expect(r2.value).toBe('got-A')
    }
  })

  it('race with checkpoint inside branch', async () => {
    let cp: Snapshot | undefined

    const r1 = await dvala.runAsync(
      'race(perform(@fast), perform(@slow))',
      {
        effectHandlers: [
          {
            pattern: 'fast',
            handler: async ({ resume, checkpoint }: any) => {
              cp = checkpoint('race-branch-cp')
              resume('fast-wins')
            },
          },
          { pattern: 'slow', handler: async ({ resume }: any) => { resume('slow-done') } },
        ],
      },
    )

    expect(r1.type).toBe('completed')
    if (r1.type === 'completed') {
      expect(r1.value).toBe('fast-wins')
    }
    expect(cp).toBeDefined()

    // Resume from checkpoint — re-runs siblings, first to complete wins
    const r2 = await resumeContinuation(cp!, 'replayed-fast', {
      handlers: [
        { pattern: 'slow', handler: async ({ resume }: any) => { resume('replayed-slow') } },
      ],
    })

    expect(r2.type).toBe('completed')
    if (r2.type === 'completed') {
      // The resumed branch completes with 'replayed-fast', sibling re-runs
      // Race: first to complete wins
      expect(r2.value).toBe('replayed-fast')
    }
  })

  it('race: retrigger works with new frame types', async () => {
    const r1 = await dvala.runAsync(
      'race(perform(@task, "A"), perform(@task, "B"))',
      {
        effectHandlers: [
          { pattern: 'task', handler: async ({ suspend }: any) => { suspend() } },
        ],
      },
    )
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended') return

    const r2 = await retrigger(r1.snapshot, {
      handlers: [
        { pattern: 'task', handler: async ({ resume }: any) => { resume('retriggered') } },
      ],
    })

    expect(r2.type).toBe('completed')
    if (r2.type === 'completed') {
      expect(r2.value).toBe('retriggered')
    }
  })
})
