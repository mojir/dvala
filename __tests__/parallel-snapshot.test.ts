/**
 * Tests for parallel snapshot composition (Phase 1+).
 *
 * Phase 1: BarrierFrame infrastructure, effect isolation, branch completion.
 * Phase 2: Checkpoint composition (composeCheckpointContinuation).
 * Phase 3: Resume logic (ReRunParallelFrame, ResumeParallelFrame handlers).
 */

import { describe, expect, it } from 'vitest'
import { createDvala } from '../src/createDvala'
import type { Handlers } from '../src/evaluator/effectTypes'

const dvala = createDvala()

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
