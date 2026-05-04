import { describe, expect, it } from 'vitest'
import type { RunResult, Snapshot } from '../evaluator/effectTypes'
import { applyReplBinding, executeReplLine } from './replCore'

describe('applyReplBinding', () => {
  it('writes a host-controlled REPL record', () => {
    const bindings: Record<string, unknown> = { existing: 1, REPL: 'stale' }
    applyReplBinding(bindings, {
      result: 2,
      error: null,
      history: [{ type: 'result', value: 2 }],
    })
    expect(bindings).toEqual({
      existing: 1,
      REPL: {
        result: 2,
        error: null,
        history: [{ type: 'result', value: 2 }],
      },
    })
  })
})

describe('executeReplLine', () => {
  it('merges completed scope updates and refreshes the REPL record', async () => {
    const result = await executeReplLine({
      expression: 'x + 1',
      scope: { x: 1, REPL: 'stale' },
      repl: {
        result: 'older-result',
        error: 'old error',
        history: [{ type: 'result', value: 'older' }],
      },
      run: async (): Promise<RunResult> => ({
        type: 'completed',
        value: 2,
        scope: { y: 2, REPL: 'user-mutation' },
      }),
    })

    expect(result).toEqual({
      ok: true,
      runResult: { type: 'completed', value: 2, scope: { y: 2, REPL: 'user-mutation' } },
      value: 2,
      scope: {
        x: 1,
        y: 2,
        REPL: {
          result: 2,
          error: null,
          history: [
            { type: 'result', value: 2 },
            { type: 'result', value: 'older' },
          ],
        },
      },
      repl: {
        result: 2,
        error: null,
        history: [
          { type: 'result', value: 2 },
          { type: 'result', value: 'older' },
        ],
      },
    })
  })

  it('keeps scope unchanged for suspended runs and records a null REPL result', async () => {
    const suspendedSnapshot: Snapshot = {
      id: 'snap-1',
      continuation: null,
      timestamp: 0,
      index: 1,
      executionId: 'exec-1',
      message: 'suspended',
    }
    const suspendedRunResult: RunResult = {
      type: 'suspended',
      snapshot: suspendedSnapshot,
    }
    const result = await executeReplLine({
      expression: 'perform(@x)',
      scope: { x: 1 },
      repl: { result: 'older', error: 'old error', history: [] },
      run: async () => suspendedRunResult,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.runResult).toBe(suspendedRunResult)
      expect(result.value).toBeNull()
      expect(result.repl).toEqual({
        result: null,
        error: null,
        history: [{ type: 'result', value: null }],
      })
      expect(result.scope).toEqual({
        x: 1,
        REPL: {
          result: null,
          error: null,
          history: [{ type: 'result', value: null }],
        },
      })
    }
  })

  it('records the error in the REPL record without losing the last result', async () => {
    const error = new Error('boom')
    const result = await executeReplLine({
      expression: 'bad()',
      scope: { x: 1 },
      repl: {
        result: 41,
        error: null,
        history: [{ type: 'result', value: 'older' }],
      },
      formatError: err => (err instanceof Error ? err.message : String(err)),
      run: async (): Promise<RunResult> => ({
        type: 'error',
        error: error as never,
      }),
    })

    expect(result).toEqual({
      ok: false,
      error,
      scope: {
        x: 1,
        REPL: {
          result: 41,
          error: 'boom',
          history: [
            { type: 'error', error: 'boom' },
            { type: 'result', value: 'older' },
          ],
        },
      },
      repl: {
        result: 41,
        error: 'boom',
        history: [
          { type: 'error', error: 'boom' },
          { type: 'result', value: 'older' },
        ],
      },
    })
  })
})
