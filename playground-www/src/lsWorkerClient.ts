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
import type { Diagnostic } from '../../src/shared/types'
import { referenceToCompletion } from '../../src/shared/completionBuilder'
import { allReference } from '../../reference/index'
import { formatSource, tokenizeSource } from '../../src/tooling'
import { typecheck, WorkspaceIndex } from '../../src/internal'
import type { TypecheckResult } from '../../src/internal'
import { buildTypeDiagnostics } from '../../src/shared/diagnosticBuilder'
import { findTypeAtPosition, formatHoverType } from '../../src/shared/typeDisplay'
import { allBuiltinModules } from '../../src/allModules'
import { parseToAst } from '../../src/parser'
import { minifyTokenStream } from '../../src/tokenizer/minifyTokenStream'

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

/**
 * Tokenize, parse, and typecheck source on the main thread. Typecheck lives
 * here (not in the worker) because its dependency chain hits .dvala files
 * through builtin, which Vite's worker bundler can't handle.
 */
function typecheckForDiagnostics(source: string, path: string): TypecheckResult {
  const tokens = tokenizeSource(source, true, path)
  try {
    // Use parseToAst (not parseRecoverable) — parseToAst includes
    // typeAnnotations which the typechecker needs to enforce
    // annotations like `let n: Number = ""`.
    const minified = minifyTokenStream(tokens, { removeWhiteSpace: true })
    const ast = parseToAst(minified)
    workspaceIndex.updateFile(path, source, () => null)
    return typecheck(ast, { modules: allBuiltinModules })
  } catch {
    // parseToAst threw on broken code — return empty diagnostics.
    // Parse errors are already reported by the worker's recover-parse.
    return { diagnostics: [], typeMap: new Map(), sourceMap: undefined }
  }
}

// ── Worker lifetime ───────────────────────────────────────────────────────────

let worker: Worker | null = null
let nextRequestId = 1

/** Debounce timers keyed by path. */
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

/** Pending request IDs keyed by path for cancellation. */
const pendingRequests = new Map<string, number>()

/** Latest typecheck result per path, for hover queries. */
const typecheckCache = new Map<string, TypecheckResult>()

/** Workspace symbol index for go-to-def / find-references. */
const workspaceIndex = new WorkspaceIndex()

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

  w.onerror = () => {
    worker = null
  }

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

        // Run typecheck on the main thread (avoids .dvala import issues in
        // the worker bundle) and append type diagnostics.
        const allDiagnostics = [...diagnostics]
        try {
          const source = model.getValue()
          const tc = typecheckForDiagnostics(source, path)
          typecheckCache.set(path, tc)
          allDiagnostics.push(...buildTypeDiagnostics(tc))
        } catch {}

        const markers: monaco.editor.IMarkerData[] = allDiagnostics.map(d => ({
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
    }
  }

  // Register Monaco hover provider for Dvala — uses the typecheck cache
  // populated during diagnostics (typecheck runs on main thread).
  monaco.languages.registerHoverProvider('dvala', {
    provideHover: (model, position) => {
      // Find the workspace path for this model.
      let path: string | undefined
      for (const [p, m] of registeredModels) {
        if (m === model) {
          path = p
          break
        }
      }
      if (!path) return null

      const tc = typecheckCache.get(path)
      if (!tc) return null

      try {
        const word = model.getWordUntilPosition(position)
        const type = findTypeAtPosition(
          tc.typeMap,
          tc.sourceMap,
          { line: position.lineNumber, column: position.column },
          {
            start: { line: position.lineNumber, column: word.startColumn },
            end: { line: position.lineNumber, column: word.endColumn },
          },
        )
        if (!type) return null
        return {
          contents: [{ value: formatHoverType(type) }],
        }
      } catch {
        return null
      }
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

  // ── Go-to-definition provider ────────────────────────────────────────────

  monaco.languages.registerDefinitionProvider('dvala', {
    provideDefinition: (model, position) => {
      let path: string | undefined
      for (const [p, m] of registeredModels) {
        if (m === model) {
          path = p
          break
        }
      }
      if (!path) return null

      const def = workspaceIndex.findDefinition(path, position.lineNumber, position.column)
      if (!def) return null
      return [
        {
          uri: monaco.Uri.parse(`dvala:///${def.location.file}`),
          range: {
            startLineNumber: def.location.line,
            startColumn: def.location.column,
            endLineNumber: def.location.line,
            endColumn: def.location.column + def.name.length,
          },
        },
      ]
    },
  })

  // ── Find-references provider ─────────────────────────────────────────────

  monaco.languages.registerReferenceProvider('dvala', {
    provideReferences: (model, position) => {
      let path: string | undefined
      for (const [p, m] of registeredModels) {
        if (m === model) {
          path = p
          break
        }
      }
      if (!path) return null

      const canonical = workspaceIndex.resolveCanonicalFile(path, position.lineNumber, position.column)
      if (!canonical) return null
      const occurrences = workspaceIndex.findAllOccurrences(canonical.file, canonical.name)
      if (occurrences.length === 0) return null
      return occurrences.map(loc => ({
        uri: monaco.Uri.parse(`dvala:///${loc.file}`),
        range: {
          startLineNumber: loc.line,
          startColumn: loc.column,
          endLineNumber: loc.line,
          endColumn: loc.column + loc.nameLength,
        },
      }))
    },
  })

  // ── Rename provider ──────────────────────────────────────────────────────

  monaco.languages.registerRenameProvider('dvala', {
    provideRenameEdits: (model, position, newName) => {
      let path: string | undefined
      for (const [p, m] of registeredModels) {
        if (m === model) {
          path = p
          break
        }
      }
      if (!path) return null

      const canonical = workspaceIndex.resolveCanonicalFile(path, position.lineNumber, position.column)
      if (!canonical) return null
      const occurrences = workspaceIndex.findAllOccurrences(canonical.file, canonical.name)
      if (occurrences.length === 0) return null

      const edits: monaco.languages.IWorkspaceTextEdit[] = occurrences.map(loc => ({
        resource: monaco.Uri.parse(`dvala:///${loc.file}`),
        textEdit: {
          range: {
            startLineNumber: loc.line,
            startColumn: loc.column,
            endLineNumber: loc.line,
            endColumn: loc.column + loc.nameLength,
          },
          text: newName,
        },
        versionId: undefined,
      }))
      return { edits }
    },
  })

  // ── Document formatter ───────────────────────────────────────────────────

  const formatModel = (model: monaco.editor.ITextModel): monaco.languages.TextEdit[] => {
    try {
      const formatted = formatSource(model.getValue())
      return [{ range: model.getFullModelRange(), text: formatted }]
    } catch {
      return []
    }
  }

  monaco.languages.registerDocumentFormattingEditProvider('dvala', {
    provideDocumentFormattingEdits: formatModel,
  })

  monaco.languages.registerDocumentRangeFormattingEditProvider('dvala', {
    provideDocumentRangeFormattingEdits: model => formatModel(model),
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
 * Debounces diagnostics by ~150ms.
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
    }, 150),
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
