import { describe, expect, it } from 'vitest'
import type { RunResult, Snapshot } from '../evaluator/effectTypes'
import {
  applyReplHistoryVariables,
  executeReplLine,
  loadReplSourceIntoScope,
  mergeReplResultIntoScope,
} from './replCore'

describe('mergeReplResultIntoScope', () => {
  it('merges returned dict entries into the target scope', () => {
    const scope = { existing: 1 }
    mergeReplResultIntoScope(scope, { added: 2 })
    expect(scope).toEqual({ existing: 1, added: 2 })
  })

  it('ignores non-dict results', () => {
    const scope = { existing: 1 }
    mergeReplResultIntoScope(scope, ['x'])
    mergeReplResultIntoScope(scope, 42)
    mergeReplResultIntoScope(scope, null)
    expect(scope).toEqual({ existing: 1 })
  })
})

describe('loadReplSourceIntoScope', () => {
  it('runs the source and merges its returned dict into scope', () => {
    const scope = { seed: true }
    const out = loadReplSourceIntoScope({
      scope,
      source: 'let x = 1',
      filePath: 'main.dvala',
      run: (_source, filePath) => ({ filePath, value: 1 }),
    })
    expect(out).toBe(scope)
    expect(scope).toEqual({ seed: true, filePath: 'main.dvala', value: 1 })
  })
})

describe('applyReplHistoryVariables', () => {
  it('replaces stale history slots before writing new ones', () => {
    const bindings: Record<string, unknown> = {
      keep: true,
      '*1*': 'old-1',
      '*2*': 'old-2',
      '*9*': 'old-9',
    }
    applyReplHistoryVariables(bindings, ['new-1', 'new-2'])
    expect(bindings).toEqual({
      keep: true,
      '*1*': 'new-1',
      '*2*': 'new-2',
    })
  })
})

describe('executeReplLine', () => {
  it('merges completed scope updates and injects history variables', async () => {
    const result = await executeReplLine({
      expression: 'x + 1',
      scope: { x: 1, '*1*': 'stale' },
      historyResults: ['older'],
      run: async (): Promise<RunResult> => ({
        type: 'completed',
        value: 2,
        scope: { y: 2 },
      }),
    })

    expect(result).toEqual({
      ok: true,
      runResult: { type: 'completed', value: 2, scope: { y: 2 } },
      value: 2,
      historyResults: [2, 'older'],
      scope: {
        x: 1,
        y: 2,
        '*1*': 2,
        '*2*': 'older',
      },
    })
  })

  it('keeps scope unchanged for suspended runs and records a null history value', async () => {
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
      historyResults: [],
      run: async () => suspendedRunResult,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.runResult).toBe(suspendedRunResult)
      expect(result.value).toBeNull()
      expect(result.historyResults).toEqual([null])
      expect(result.scope).toEqual({ x: 1, '*1*': null })
    }
  })

  it('returns the error without mutating scope or history', async () => {
    const error = new Error('boom')
    const result = await executeReplLine({
      expression: 'bad()',
      scope: { x: 1 },
      historyResults: ['older'],
      run: async (): Promise<RunResult> => ({
        type: 'error',
        error: error as never,
      }),
    })

    expect(result).toEqual({
      ok: false,
      error,
      scope: { x: 1 },
      historyResults: ['older'],
    })
  })
})
