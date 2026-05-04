/**
 * Main-thread client for the Dvala Language Service Web Worker.
 *
 * Owns the worker lifecycle, streams edit deltas, and debounces diagnostics
 * requests. Consumers call `initLspWorker()` once during boot, then
 * `registerModel(path, model)` whenever a Monaco model is created or
 * `unregisterModel(path)` when one is disposed. Edit deltas are pushed via
 * `updateDocument(path, source, sourceVersion)`.
 */

import * as monaco from 'monaco-editor'
// eslint-disable-next-line import/default
import LsWorker from './lsWorker?worker'
import type { Diagnostic, Position } from '../../src/shared/types'
import { referenceToCompletion } from '../../src/shared/completionBuilder'
import { allReference } from '../../reference/index'

import type { CompletionItem } from '../../src/shared/completionBuilder'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Map portable CompletionItem.kind to Monaco's CompletionItemKind enum. */
function kindToMonaco(kind: CompletionItem['kind']): monaco.languages.CompletionItemKind {
  switch (kind) {
    case 'function':
      return monaco.languages.CompletionItemKind.Function
    case 'method':
      return monaco.languages.CompletionItemKind.Method
    case 'event':
      return monaco.languages.CompletionItemKind.Event
    case 'module':
      return monaco.languages.CompletionItemKind.Module
    case 'class':
      return monaco.languages.CompletionItemKind.Class
    case 'keyword':
      return monaco.languages.CompletionItemKind.Keyword
    case 'operator':
      return monaco.languages.CompletionItemKind.Operator
    case 'variable':
      return monaco.languages.CompletionItemKind.Variable
  }
}

// ── Worker lifetime ───────────────────────────────────────────────────────────

let worker: Worker | null = null
let nextRequestId = 1

/** Debounce timers keyed by path. */
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

/** Pending request IDs keyed by path for cancellation. */
const pendingRequests = new Map<string, number>()

/** Pending hover requests keyed by requestId. */
const pendingHovers = new Map<number, (contents: string | null) => void>()

/** Registered Monaco models keyed by path. */
const registeredModels = new Map<string, monaco.editor.ITextModel>()

function getWorker(): Worker {
  if (!worker) worker = new LsWorker()
  return worker
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Initialize the LS worker. Call once during playground boot.
 */
export function initLspWorker(): void {
  const w = getWorker()

  w.onmessage = (event: MessageEvent) => {
    const msg = event.data

    switch (msg.type) {
      case 'diagnosticsResult': {
        const { path, sourceVersion, diagnostics } = msg as {
          type: 'diagnosticsResult'
          requestId: number
          path: string
          sourceVersion: number
          diagnostics: Diagnostic[]
        }

        const model = registeredModels.get(path)
        if (!model) return

        // Discard stale results — the model has moved on since the request.
        const currentVersion = model.getVersionId()
        if (sourceVersion < currentVersion) return

        const markers: monaco.editor.IMarkerData[] = diagnostics.map(d => ({
          message: d.message,
          severity:
            d.severity === 'error'
              ? monaco.MarkerSeverity.Error
              : d.severity === 'warning'
                ? monaco.MarkerSeverity.Warning
                : monaco.MarkerSeverity.Info,
          startLineNumber: d.range.start.line,
          startColumn: d.range.start.column,
          endLineNumber: d.range.end.line,
          endColumn: d.range.end.column,
          source: d.source,
        }))

        monaco.editor.setModelMarkers(model, 'dvala', markers)
        pendingRequests.delete(path)
        return
      }

      case 'diagnosticsError': {
        const { path } = msg as { type: 'diagnosticsError'; path: string }
        const model = registeredModels.get(path)
        if (model) monaco.editor.setModelMarkers(model, 'dvala', [])
        pendingRequests.delete(path)
        return
      }

      case 'hoverResult': {
        const { requestId, contents } = msg as {
          type: 'hoverResult'
          requestId: number
          path: string
          contents: string | null
        }
        const resolve = pendingHovers.get(requestId)
        if (resolve) {
          pendingHovers.delete(requestId)
          resolve(contents)
        }
        return
      }
    }
  }

  // Register Monaco hover provider for Dvala.
  monaco.languages.registerHoverProvider('dvala', {
    provideHover: (model, position) => {
      return new Promise<monaco.languages.Hover | null>(resolve => {
        // Find the workspace path for this model.
        let path: string | undefined
        for (const [p, m] of registeredModels) {
          if (m === model) {
            path = p
            break
          }
        }
        if (!path) {
          resolve(null)
          return
        }

        const requestId = nextRequestId++
        pendingHovers.set(requestId, contents => {
          if (contents === null) {
            resolve(null)
          } else {
            resolve({
              contents: [{ value: contents }],
              range: {
                startLineNumber: position.lineNumber,
                startColumn: position.column,
                endLineNumber: position.lineNumber,
                endColumn: position.column,
              },
            })
          }
        })

        getWorker().postMessage({
          type: 'requestHover',
          requestId,
          path,
          position: { line: position.lineNumber, column: position.column } satisfies Position,
        })
      })
    },
  })

  // Register Monaco completion provider for Dvala (builtins only for now;
  // user-defined symbols need WorkspaceIndex, tracked in step 29).
  const builtinCompletions: {
    label: string
    kind: monaco.languages.CompletionItemKind
    detail?: string
    insertText?: string
    insertTextRules?: monaco.languages.CompletionItemInsertTextRule
    sortText: string
  }[] = Object.entries(allReference).map(([name, ref]) => {
    const item = referenceToCompletion(name, ref)
    return {
      label: item.label,
      kind: kindToMonaco(item.kind),
      detail: item.detail,
      insertText: item.insertText,
      insertTextRules: item.insertText ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
      sortText: item.sortText ?? `0_${item.label}`,
    }
  })

  monaco.languages.registerCompletionItemProvider('dvala', {
    provideCompletionItems: (model, position) => {
      const range: monaco.IRange = {
        startLineNumber: position.lineNumber,
        startColumn: position.column,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      }
      const word = model.getWordUntilPosition(position)
      const prefix = String(word.word).toLowerCase()

      // Filter builtins by prefix; return all if no prefix (empty).
      const suggestions: monaco.languages.CompletionItem[] = []
      for (const item of builtinCompletions) {
        if (!prefix || item.label.toLowerCase().startsWith(prefix)) {
          const completion: monaco.languages.CompletionItem = {
            label: item.label,
            kind: item.kind,
            detail: item.detail,
            sortText: item.sortText,
            insertText: item.insertText ?? item.label,
            range: { ...range, startColumn: word.startColumn },
          }
          if (item.insertText && item.insertTextRules) {
            completion.insertTextRules = item.insertTextRules
          }
          suggestions.push(completion)
        }
      }

      return { suggestions }
    },
  })
}

/**
 * Register a Monaco model with the given workspace path so diagnostics
 * results can be routed to it.
 */
export function registerModel(path: string, model: monaco.editor.ITextModel): void {
  registeredModels.set(path, model)
}

/**
 * Unregister a model (called when a tab closes and the model is disposed).
 */
export function unregisterModel(path: string): void {
  // Grab the model before deleting from the registry.
  const model = registeredModels.get(path)
  registeredModels.delete(path)
  if (model) monaco.editor.setModelMarkers(model, 'dvala', [])
  // Cancel any pending diagnostics for this path.
  const pendingId = pendingRequests.get(path)
  if (pendingId !== undefined) {
    getWorker().postMessage({ type: 'cancelRequest', requestId: pendingId })
    pendingRequests.delete(path)
  }
  const timer = debounceTimers.get(path)
  if (timer) {
    clearTimeout(timer)
    debounceTimers.delete(path)
  }
}

/**
 * Push an edit delta to the worker. Called on every Monaco model change.
 * Debounces diagnostics by ~200ms.
 */
export function updateDocument(path: string, source: string, sourceVersion: number): void {
  const w = getWorker()

  w.postMessage({
    type: 'updateDocument',
    path,
    source,
    sourceVersion,
  })

  const existing = debounceTimers.get(path)
  if (existing) clearTimeout(existing)

  debounceTimers.set(
    path,
    setTimeout(() => {
      debounceTimers.delete(path)
      requestDiagnostics(path, sourceVersion)
    }, 200),
  )
}

/**
 * Request diagnostics from the worker for the given path.
 * Cancels any in-flight request for the same path.
 */
function requestDiagnostics(path: string, sourceVersion: number): void {
  const w = getWorker()

  const prevId = pendingRequests.get(path)
  if (prevId !== undefined) {
    w.postMessage({ type: 'cancelRequest', requestId: prevId })
  }

  const requestId = nextRequestId++
  pendingRequests.set(path, requestId)

  w.postMessage({
    type: 'requestDiagnostics',
    requestId,
    path,
    sourceVersion,
  })
}

/**
 * Dispose the worker (for tests / hot-reload).
 */
export function disposeLspWorker(): void {
  if (worker) {
    worker.terminate()
    worker = null
  }
  for (const timer of debounceTimers.values()) clearTimeout(timer)
  debounceTimers.clear()
  pendingRequests.clear()
  registeredModels.clear()
}
