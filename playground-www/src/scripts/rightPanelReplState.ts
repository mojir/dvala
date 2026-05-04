import { toJS } from '../../../src/utils/interop'
import { isAtom, isEffect, isRegularExpression } from '../../../src/typeGuards/dvala'
import { isDvalaFunction } from '../../../src/typeGuards/dvalaFunction'

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
  historyResults: unknown[]
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
    const jsValue = toJS(value as never)
    if (!isJsonSafeValue(jsValue)) return null
    out[key] = jsValue
  }
  return out
}

function toPersistableArray(values: readonly unknown[]): unknown[] | null {
  const out: unknown[] = []
  for (const value of values) {
    const jsValue = toJS(value as never)
    if (!isJsonSafeValue(jsValue)) return null
    out.push(jsValue)
  }
  return out
}

export function toPersistedReplSession(session: {
  scope: Record<string, unknown>
  baseScope: Record<string, unknown>
  historyResults: readonly unknown[]
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
  const historyResults = toPersistableArray(session.historyResults)
  if (scope === null || baseScope === null || historyResults === null) return null
  return {
    scope,
    baseScope,
    historyResults,
    inputHistory: [...session.inputHistory],
    outputs: [...session.outputs],
    loadedFileSource: session.loadedFileSource,
    loadedHandlersSource: session.loadedHandlersSource,
    status: session.status,
    error: session.error,
  }
}