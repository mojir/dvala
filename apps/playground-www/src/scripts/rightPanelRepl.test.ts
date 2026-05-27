// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'
import { createContextStack } from '../../../../src/evaluator/ContextStack'
import { createSnapshot } from '../../../../src/evaluator/effectTypes'
import { serializeTerminalSnapshot, serializeToObject } from '../../../../src/evaluator/suspension'
import { cons } from '@mojir/dvala-types'
import { extractSnapshotBindings } from './rightPanelReplBaseline'
import { getReplPromptText, getReplPromptWidth } from './rightPanelReplPrompt'
import {
  isReplSessionStale,
  moveReplHistoryCursor,
  shouldShowReplContextBinding,
  shouldShowReloadButton,
  toPersistedReplSession,
} from './rightPanelReplState'

function makeSnapshot(continuation: unknown) {
  return createSnapshot({
    continuation,
    timestamp: 1,
    index: 0,
    executionId: 'run-1',
    message: 'snapshot',
  })
}

describe('extractSnapshotBindings', () => {
  it('flattens the visible snapshot scope with inner bindings shadowing outer ones', async () => {
    const env = createContextStack({ globalContext: { outer: { value: 1 }, self: { value: 'skip' } } })
      .create({ answer: { value: 41 } })
      .create({ answer: { value: 42 }, local: { value: 'ok' } })

    const continuation = serializeToObject(cons({ type: 'Sequence', nodes: [], index: 0, env }, null))

    await expect(extractSnapshotBindings(makeSnapshot(continuation))).resolves.toEqual({
      answer: 42,
      local: 'ok',
      outer: 1,
    })
  })

  it('returns an empty scope for terminal snapshots without an active environment', async () => {
    await expect(extractSnapshotBindings(makeSnapshot(serializeTerminalSnapshot([], 0)))).resolves.toEqual({})
  })
})

describe('getReplPromptText', () => {
  it('uses the current filename for the REPL prompt', () => {
    expect(getReplPromptText('x.dvala')).toBe('x.dvala >')
    expect(getReplPromptText('examples/email-workflow.dvala')).toBe('email-workflow.dvala >')
  })

  it('falls back to the bare prompt when no file path is available', () => {
    expect(getReplPromptText('')).toBe('>')
  })
})

describe('getReplPromptWidth', () => {
  it('allocates a stable width from the full prompt text', () => {
    expect(getReplPromptWidth('x.dvala >')).toBe('9ch')
    expect(getReplPromptWidth('email-workflow.dvala >')).toBe('22ch')
  })

  it('keeps a minimum width for empty or fallback prompts', () => {
    expect(getReplPromptWidth('>')).toBe('1ch')
  })
})

describe('shouldShowReplContextBinding', () => {
  it('filters the REPL metadata record from the Context dropdown', () => {
    expect(shouldShowReplContextBinding('answer')).toBe(true)
    expect(shouldShowReplContextBinding('REPL')).toBe(false)
  })
})

describe('isReplSessionStale', () => {
  it('returns false when both file and handlers content match the loaded baseline', () => {
    expect(
      isReplSessionStale(
        { loadedFileSource: 'let x = 1', loadedHandlersSource: 'handler @x -> 1 end' },
        'let x = 1',
        'handler @x -> 1 end',
      ),
    ).toBe(false)
  })

  it('returns true when either file content or handlers content changed', () => {
    expect(
      isReplSessionStale(
        { loadedFileSource: 'let x = 1', loadedHandlersSource: '' },
        'let x = 2',
        '',
      ),
    ).toBe(true)
    expect(
      isReplSessionStale(
        { loadedFileSource: 'let x = 1', loadedHandlersSource: '' },
        'let x = 1',
        'handler @x -> 1 end',
      ),
    ).toBe(true)
  })
})

describe('shouldShowReloadButton', () => {
  it('shows reload whenever the session is not loading', () => {
    expect(shouldShowReloadButton('idle', false)).toBe(true)
    expect(shouldShowReloadButton('error', false)).toBe(true)
    expect(shouldShowReloadButton('ready', true)).toBe(true)
    expect(shouldShowReloadButton('ready', false)).toBe(true)
    expect(shouldShowReloadButton('loading', true)).toBe(false)
  })
})

describe('moveReplHistoryCursor', () => {
  it('captures the current draft and moves back through history on ArrowUp', () => {
    expect(
      moveReplHistoryCursor({
        direction: 'up',
        inputHistory: ['three', 'two', 'one'],
        historyIndex: -1,
        draftInput: '',
        currentInput: 'dra',
      }),
    ).toEqual({ historyIndex: 0, draftInput: 'dra', value: 'three' })

    expect(
      moveReplHistoryCursor({
        direction: 'up',
        inputHistory: ['three', 'two', 'one'],
        historyIndex: 0,
        draftInput: 'dra',
        currentInput: 'three',
      }),
    ).toEqual({ historyIndex: 1, draftInput: 'dra', value: 'two' })
  })

  it('restores the draft when moving back down past the newest history item', () => {
    expect(
      moveReplHistoryCursor({
        direction: 'down',
        inputHistory: ['three', 'two', 'one'],
        historyIndex: 1,
        draftInput: 'dra',
        currentInput: 'two',
      }),
    ).toEqual({ historyIndex: 0, draftInput: 'dra', value: 'three' })

    expect(
      moveReplHistoryCursor({
        direction: 'down',
        inputHistory: ['three', 'two', 'one'],
        historyIndex: 0,
        draftInput: 'dra',
        currentInput: 'three',
      }),
    ).toEqual({ historyIndex: -1, draftInput: 'dra', value: 'dra' })
  })
})

describe('toPersistedReplSession', () => {
  it('serializes JSON-safe REPL state', () => {
    expect(
      toPersistedReplSession({
        scope: { answer: 42, items: [1, 2] },
        baseScope: { answer: 41 },
        repl: {
          result: 42,
          error: null,
          history: [
            { type: 'result', value: 42 },
            { type: 'error', error: 'boom' },
          ],
        },
        inputHistory: ['answer', 'items'],
        outputs: [{ kind: 'result', text: '42' }],
        loadedFileSource: 'let answer = 42',
        loadedHandlersSource: '',
        status: 'ready',
        error: null,
      }),
    ).toEqual({
      scope: { answer: 42, items: [1, 2] },
      baseScope: { answer: 41 },
      repl: {
        result: 42,
        error: null,
        history: [
          { type: 'result', value: 42 },
          { type: 'error', error: 'boom' },
        ],
      },
      inputHistory: ['answer', 'items'],
      outputs: [{ kind: 'result', text: '42' }],
      loadedFileSource: 'let answer = 42',
      loadedHandlersSource: '',
      status: 'ready',
      error: null,
    })
  })

  it('drops sessions with non-JSON-safe bindings', () => {
    expect(
      toPersistedReplSession({
        scope: { fn: () => null },
        baseScope: {},
        repl: {
          result: null,
          error: null,
          history: [],
        },
        inputHistory: [],
        outputs: [],
        loadedFileSource: '',
        loadedHandlersSource: '',
        status: 'ready',
        error: null,
      }),
    ).toBeNull()
  })
})