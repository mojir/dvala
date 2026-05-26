import { toJS, isAtom, isEffect, isRegularExpression, isDvalaFunction } from '../../../../src'
import type { ReplBinding } from '@mojir/dvala-core-tooling'

interface ReplSessionFingerprint {
  loadedFileSource: string
  loadedHandlersSource: string
}

interface ReplHistoryCursor {
  historyIndex: number
  draftInput: string
}

interface ReplHistoryMoveResult extends ReplHistoryCursor {
  value: string
}

interface PersistedReplOutputEntry {
  kind: 'input' | 'result' | 'comment' | 'error'
  text: string
  snapshotId?: string
}

export interface PersistedReplSession {
  scope: Record<string, unknown>
  baseScope: Record<string, unknown>
  repl: ReplBinding
  inputHistory: string[]
  outputs: PersistedReplOutputEntry[]
  loadedFileSource: string
  loadedHandlersSource: string
  status: 'ready' | 'error'
  error: string | null
}

export function isReplSessionStale(
  session: ReplSessionFingerprint,
  fileSource: string,
  handlersSource: string,
): boolean {
  return session.loadedFileSource !== fileSource || session.loadedHandlersSource !== handlersSource
}

export function shouldShowReloadButton(status: 'idle' | 'loading' | 'ready' | 'error', stale: boolean): boolean {
  if (status === 'loading') return false
  return status === 'idle' || status === 'ready' || status === 'error' || stale
}

export function shouldShowReplContextBinding(name: string): boolean {
  return name !== 'REPL'
}

export function moveReplHistoryCursor(params: {
  direction: 'up' | 'down'
  inputHistory: readonly string[]
  historyIndex: number
  draftInput: string
  currentInput: string
}): ReplHistoryMoveResult {
  const { direction, inputHistory, historyIndex, draftInput, currentInput } = params
  if (inputHistory.length === 0) {
    return { historyIndex: -1, draftInput: currentInput, value: currentInput }
  }

  if (direction === 'up') {
    if (historyIndex === -1) {
      return {
        historyIndex: 0,
        draftInput: currentInput,
        value: inputHistory[0]!,
      }
    }
    const nextIndex = Math.min(historyIndex + 1, inputHistory.length - 1)
    return {
      historyIndex: nextIndex,
      draftInput,
      value: inputHistory[nextIndex]!,
    }
  }

  if (historyIndex <= 0) {
    return {
      historyIndex: -1,
      draftInput,
      value: draftInput,
    }
  }

  const nextIndex = historyIndex - 1
  return {
    historyIndex: nextIndex,
    draftInput,
    value: inputHistory[nextIndex]!,
  }
}

function isJsonSafeValue(value: unknown, seen = new Set<unknown>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'function' || typeof value === 'undefined' || typeof value === 'symbol' || typeof value === 'bigint')
    return false
  if (isAtom(value) || isEffect(value) || isRegularExpression(value) || isDvalaFunction(value)) return false
  if (value === null || typeof value !== 'object') return false
  if (seen.has(value)) return false
  seen.add(value)
  if (Array.isArray(value)) {
    const ok = value.every(item => isJsonSafeValue(item, seen))
    seen.delete(value)
    return ok
  }
  const proto = Object.getPrototypeOf(value)
  if (proto !== null && proto !== Object.prototype) {
    seen.delete(value)
    return false
  }
  const ok = Object.values(value as Record<string, unknown>).every(item => isJsonSafeValue(item, seen))
  seen.delete(value)
  return ok
}

function toPersistableRecord(scope: Record<string, unknown>): Record<string, unknown> | null {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(scope)) {
    const jsValue = toPersistableValue(value)
    if (jsValue === null) return null
    out[key] = jsValue
  }
  return out
}

function toPersistableValue(value: unknown): unknown | null {
  const jsValue = toJS(value as never)
  if (!isJsonSafeValue(jsValue)) return null
  return jsValue
}

function toPersistableReplBinding(repl: ReplBinding): ReplBinding | null {
  const result = toPersistableValue(repl.result)
  if (result === null) return null
  const history = repl.history.map(entry => {
    if (entry.type === 'error') return entry
    const value = toPersistableValue(entry.value)
    if (value === null) return null
    return { type: 'result', value } as const
  })
  if (history.some(entry => entry === null)) return null
  return {
    result,
    error: repl.error,
    history: history as ReplBinding['history'],
  }
}

export function toPersistedReplSession(session: {
  scope: Record<string, unknown>
  baseScope: Record<string, unknown>
  repl: ReplBinding
  inputHistory: readonly string[]
  outputs: readonly PersistedReplOutputEntry[]
  loadedFileSource: string
  loadedHandlersSource: string
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
}): PersistedReplSession | null {
  if (session.status !== 'ready' && session.status !== 'error') return null
  const scope = toPersistableRecord(session.scope)
  const baseScope = toPersistableRecord(session.baseScope)
  const repl = toPersistableReplBinding(session.repl)
  if (scope === null || baseScope === null || repl === null) return null
  return {
    scope,
    baseScope,
    repl,
    inputHistory: [...session.inputHistory],
    outputs: [...session.outputs],
    loadedFileSource: session.loadedFileSource,
    loadedHandlersSource: session.loadedHandlersSource,
    status: session.status,
    error: session.error,
  }
}