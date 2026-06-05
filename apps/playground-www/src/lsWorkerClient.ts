/**
 * Main-thread client for the Dvala Language Service Web Worker.
 *
 * Owns the worker lifecycle, streams edit deltas, and debounces diagnostics
 * requests. Consumers call `initLspWorker()` once during boot, then
 * `registerModel(path, model)` whenever a Monaco model is created or
 * `unregisterModel(path)` when one is disposed. Registration maps to an
 * explicit worker `openDocument` / `closeDocument` lifecycle so worker
 * mirrors can be reseeded after restart without relying on fresh edits.
 */

import * as monaco from 'monaco-editor'
// eslint-disable-next-line import/default
import LsWorker from './lsWorker?worker'
import { allReference, isCustomReference, isFunctionReference } from '@mojir/dvala-core-tooling/reference'
import type { Reference } from '@mojir/dvala-core-tooling/reference'
import { WorkspaceIndex } from '@mojir/dvala-core-tooling'
import type {
  PlaygroundCompletionErrorMessage,
  PlaygroundCompletionResultMessage,
  PlaygroundDiagnosticsErrorMessage,
  PlaygroundDiagnosticsResultMessage,
  PlaygroundFormattingErrorMessage,
  PlaygroundFormattingResultMessage,
  PlaygroundHoverErrorMessage,
  PlaygroundHoverResultMessage,
  PlaygroundNavigationErrorMessage,
  PlaygroundNavigationRequestKind as NavigationRequestKind,
  PlaygroundNavigationResultMessage,
  PlaygroundRequestDiagnosticsMessage,
  PlaygroundResyncDocumentMessage,
  PlaygroundWorkerOutMessage,
} from '@mojir/dvala-workspace-backend/adapters/playground-worker-protocol'
import { findCallContext } from '@mojir/dvala-core-tooling'
import { getWorkspaceFiles, onWorkspaceFilesChanged } from './fileStorage'
import { folderFromPath, isInPlaygroundFolder } from './filePath'
import { HANDLERS_FILE_PATH } from './handlersBuffer'
import { resolvePlaygroundPath } from './playgroundFileResolver'
import { SCRATCH_FILE_PATH } from './scratchBuffer'
import { getImportCompletionPrefix, getScopedCompletionItems } from './lsCompletions'

import type { CompletionItem } from '@mojir/dvala-core-tooling'

const referenceByTitle = new Map(Object.values(allReference).map(ref => [ref.title, ref]))

function buildHoverMarkdown(name: string, ref: Reference): string {
  const parts: string[] = [`**${name}**`, '', ref.description]

  if (isFunctionReference(ref)) {
    parts.push('')
    for (const variant of ref.variants) {
      parts.push(`\`${name}(${variant.argumentNames.join(', ')})\``)
    }
    const argEntries = Object.entries(ref.args)
    if (argEntries.length > 0) {
      parts.push('')
      for (const [argName, arg] of argEntries) {
        const typeStr = Array.isArray(arg.type) ? arg.type.join(' | ') : arg.type
        parts.push(`- \`${argName}\`: *${typeStr}*${arg.description ? ` - ${arg.description}` : ''}`)
      }
    }
  } else if (isCustomReference(ref)) {
    parts.push('')
    for (const variant of ref.customVariants) {
      parts.push(`\`${variant}\``)
    }
  }

  if (ref.examples.length > 0) {
    const ex0 = ref.examples[0]
    if (!ex0) return parts.join('\n')
    parts.push('', '**Example:**', typeof ex0 === 'string' ? `\`${ex0}\`` : `\`${ex0.code}\``)
  }

  return parts.join('\n')
}

function formatHoverFileLabel(path: string): string {
  if (path === SCRATCH_FILE_PATH) return '<scratch>'
  if (path === HANDLERS_FILE_PATH) return '<handlers>'
  return path
}

function buildSourceLocationMarkdown(file: string, line: number, column: number): string {
  return `Defined at \`${formatHoverFileLabel(file)}:${line}:${column}\``
}

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
let workspaceFilesListenerRegistered = false

type PendingRequestMap = Map<string, number>

/** Debounce timers keyed by path. */
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

/** Pending request IDs keyed by path for cancellation. */
const pendingRequests = new Map<string, number>()

/** Pending formatting request IDs keyed by path. */
const pendingFormattingRequests = new Map<string, number>()

/** Pending formatting resolvers keyed by path. */
const pendingFormattingResolvers = new Map<string, (edits: monaco.languages.TextEdit[]) => void>()

/** Pending formatting retry closures keyed by path. */
const pendingFormattingRetries = new Map<string, () => void>()

/** Pending completion request IDs keyed by path. */
const pendingCompletionRequests = new Map<string, number>()

/** Pending completion resolvers keyed by path. */
const pendingCompletionResolvers = new Map<string, (items: CompletionItem[] | null) => void>()

/** Pending completion retry closures keyed by path. */
const pendingCompletionRetries = new Map<string, () => void>()

/** Pending hover request IDs keyed by path. */
const pendingHoverRequests = new Map<string, number>()

/** Pending hover request fingerprints keyed by path. */
const pendingHoverRequestKeys = new Map<string, string>()

/** Pending hover resolvers keyed by path. */
const pendingHoverResolvers = new Map<string, (inferredType: string | undefined) => void>()

/** Pending hover retry closures keyed by path. */
const pendingHoverRetries = new Map<string, () => void>()

/** Pending navigation request IDs keyed by request kind + path. */
const pendingNavigationRequests = new Map<string, number>()

/** Pending navigation resolvers keyed by request kind + path. */
const pendingNavigationResolvers = new Map<string, (result: unknown) => void>()

/** Pending navigation retry closures keyed by request kind + path. */
const pendingNavigationRetries = new Map<string, () => void>()

/** Last source version mirrored to the worker for each open path. */
const lastSentSourceVersions = new Map<string, number>()

/** Last handled resync fingerprint keyed by path to suppress duplicates. */
const lastResyncFingerprints = new Map<string, string>()

/** Workspace symbol index for go-to-def / find-references. */
const workspaceIndex = new WorkspaceIndex()

/** Registered Monaco models keyed by path. */
const registeredModels = new Map<string, monaco.editor.ITextModel>()

function resolveWorkspaceImportPath(rawPath: string, fromFile: string): string | null {
  if (!(rawPath.startsWith('.') || rawPath.startsWith('/'))) return null
  let resolved: string
  try {
    resolved = resolvePlaygroundPath(isInPlaygroundFolder(fromFile) ? '' : folderFromPath(fromFile), rawPath)
  } catch {
    return null
  }
  if (isInPlaygroundFolder(resolved)) return null
  const files = getWorkspaceFiles()
  if (files.some(file => file.path === resolved)) return resolved
  if (files.some(file => file.path === `${resolved}.dvala`)) return `${resolved}.dvala`
  return null
}

function indexWorkspaceFile(path: string, source: string, seen = new Set<string>()): void {
  if (seen.has(path)) return
  seen.add(path)

  const fileSymbols = workspaceIndex.updateFile(path, source, resolveWorkspaceImportPath)
  const files = getWorkspaceFiles()
  for (const importedPath of fileSymbols.imports.values()) {
    if (seen.has(importedPath)) continue
    const importedFile = files.find(file => file.path === importedPath)
    if (!importedFile) continue
    indexWorkspaceFile(importedFile.path, importedFile.code, seen)
  }
}

function getWorker(): Worker {
  if (!worker) worker = createWorker()
  return worker
}

function getPendingRequestId(requests: PendingRequestMap, path: string): number | undefined {
  return requests.get(path)
}

function matchesPendingRequest(requests: PendingRequestMap, path: string, requestId: number): boolean {
  return getPendingRequestId(requests, path) === requestId
}

function clearPendingRequest(requests: PendingRequestMap, path: string): void {
  requests.delete(path)
}

function cancelPendingRequest(requests: PendingRequestMap, path: string, w = getWorker()): void {
  const requestId = getPendingRequestId(requests, path)
  if (requestId === undefined) return
  w.postMessage({ type: 'cancelRequest', requestId })
  requests.delete(path)
}

function startTrackedRequest(
  requests: PendingRequestMap,
  path: string,
  w: Worker,
  buildMessage: (requestId: number) => object,
): number {
  cancelPendingRequest(requests, path, w)

  const requestId = nextRequestId++
  requests.set(path, requestId)
  w.postMessage(buildMessage(requestId))
  return requestId
}

function clearDiagnosticsPendingRequest(path: string): void {
  clearPendingRequest(pendingRequests, path)
  lastResyncFingerprints.delete(path)
}

function cancelPendingDiagnosticsRequest(path: string, w = getWorker()): void {
  cancelPendingRequest(pendingRequests, path, w)
}

function clearPendingFormattingRequest(path: string, edits: monaco.languages.TextEdit[]): void {
  pendingFormattingResolvers.get(path)?.(edits)
  pendingFormattingResolvers.delete(path)
  pendingFormattingRetries.delete(path)
  clearPendingRequest(pendingFormattingRequests, path)
}

function cancelPendingFormattingRequest(path: string, w = getWorker()): void {
  pendingFormattingResolvers.get(path)?.([])
  pendingFormattingResolvers.delete(path)
  pendingFormattingRetries.delete(path)
  cancelPendingRequest(pendingFormattingRequests, path, w)
}

function clearPendingCompletionRequest(path: string, items: CompletionItem[] | null): void {
  pendingCompletionResolvers.get(path)?.(items)
  pendingCompletionResolvers.delete(path)
  pendingCompletionRetries.delete(path)
  clearPendingRequest(pendingCompletionRequests, path)
}

function cancelPendingCompletionRequest(path: string, w = getWorker()): void {
  pendingCompletionResolvers.get(path)?.(null)
  pendingCompletionResolvers.delete(path)
  pendingCompletionRetries.delete(path)
  cancelPendingRequest(pendingCompletionRequests, path, w)
}

function clearPendingHoverRequest(path: string, inferredType: string | undefined): void {
  pendingHoverResolvers.get(path)?.(inferredType)
  pendingHoverResolvers.delete(path)
  pendingHoverRetries.delete(path)
  pendingHoverRequestKeys.delete(path)
  clearPendingRequest(pendingHoverRequests, path)
}

function cancelPendingHoverRequest(path: string, w = getWorker()): void {
  pendingHoverResolvers.get(path)?.(undefined)
  pendingHoverResolvers.delete(path)
  pendingHoverRetries.delete(path)
  pendingHoverRequestKeys.delete(path)
  cancelPendingRequest(pendingHoverRequests, path, w)
}

function getHoverRequestKey(
  path: string,
  sourceVersion: number,
  position: monaco.Position,
  wordRange?: monaco.IRange,
): string {
  return [
    path,
    sourceVersion,
    position.lineNumber,
    position.column,
    wordRange?.startColumn ?? '',
    wordRange?.endColumn ?? '',
  ].join(':')
}

function getNavigationRequestKey(kind: NavigationRequestKind, path: string): string {
  return `${kind}:${path}`
}

function clearPendingNavigationRequest<T>(kind: NavigationRequestKind, path: string, result: T): void {
  const key = getNavigationRequestKey(kind, path)
  const resolve = pendingNavigationResolvers.get(key) as ((value: T) => void) | undefined
  resolve?.(result)
  pendingNavigationResolvers.delete(key)
  pendingNavigationRetries.delete(key)
  clearPendingRequest(pendingNavigationRequests, key)
}

function cancelPendingNavigationRequest<T>(
  kind: NavigationRequestKind,
  path: string,
  result: T,
  w = getWorker(),
): void {
  const key = getNavigationRequestKey(kind, path)
  const resolve = pendingNavigationResolvers.get(key) as ((value: T) => void) | undefined
  resolve?.(result)
  pendingNavigationResolvers.delete(key)
  pendingNavigationRetries.delete(key)
  cancelPendingRequest(pendingNavigationRequests, key, w)
}

function getResyncFingerprint(path: string, sourceVersion: number): string {
  return [
    sourceVersion,
    getPendingRequestId(pendingRequests, path) ?? 'none',
    getPendingRequestId(pendingFormattingRequests, path) ?? 'none',
    getPendingRequestId(pendingCompletionRequests, path) ?? 'none',
    getPendingRequestId(pendingHoverRequests, path) ?? 'none',
    getPendingRequestId(pendingNavigationRequests, getNavigationRequestKey('definition', path)) ?? 'none',
    getPendingRequestId(pendingNavigationRequests, getNavigationRequestKey('references', path)) ?? 'none',
    getPendingRequestId(pendingNavigationRequests, getNavigationRequestKey('rename', path)) ?? 'none',
  ].join(':')
}

function syncModelToWorker(w: Worker, path: string, model: monaco.editor.ITextModel): void {
  const sourceVersion = model.getVersionId()
  w.postMessage({
    type: 'openDocument',
    path,
    source: model.getValue(),
    sourceVersion,
  })
  lastSentSourceVersions.set(path, sourceVersion)
}

function syncRegisteredModelsToWorker(w: Worker): void {
  for (const [path, model] of registeredModels) {
    syncModelToWorker(w, path, model)
  }
}

// Mirrors what the active worker currently has, so we only post deltas
// (persistFile / removeFile) rather than re-uploading the whole workspace
// on every change. Reset to empty whenever the worker is swapped — the new
// worker starts with no persisted-file state, so every current file is sent
// as a fresh persistFile on its first sync.
let lastSyncedToWorker = new Map<string, string>()

function resetWorkerSyncState(): void {
  lastSyncedToWorker = new Map()
}

function syncWorkspaceSnapshotToWorker(w: Worker): void {
  const next = new Map(getWorkspaceFiles().map(file => [file.path, file.code]))

  for (const path of lastSyncedToWorker.keys()) {
    if (!next.has(path)) {
      w.postMessage({ type: 'removeFile', path })
    }
  }

  for (const [path, code] of next) {
    if (lastSyncedToWorker.get(path) !== code) {
      w.postMessage({ type: 'persistFile', file: { path, code } })
    }
  }

  lastSyncedToWorker = next
}

function handleWorkerError(): void {
  for (const resolve of pendingFormattingResolvers.values()) {
    resolve([])
  }
  for (const resolve of pendingCompletionResolvers.values()) {
    resolve(null)
  }
  for (const resolve of pendingHoverResolvers.values()) {
    resolve(undefined)
  }
  for (const resolve of pendingNavigationResolvers.values()) {
    resolve(null)
  }
  pendingFormattingResolvers.clear()
  pendingFormattingRequests.clear()
  pendingFormattingRetries.clear()
  pendingCompletionResolvers.clear()
  pendingCompletionRequests.clear()
  pendingCompletionRetries.clear()
  pendingHoverResolvers.clear()
  pendingHoverRequests.clear()
  pendingHoverRetries.clear()
  pendingHoverRequestKeys.clear()
  pendingNavigationResolvers.clear()
  pendingNavigationRequests.clear()
  pendingNavigationRetries.clear()
  lastResyncFingerprints.clear()
  worker = null
}

function buildFormattingEdits(model: monaco.editor.ITextModel, formatted: string): monaco.languages.TextEdit[] {
  return [{ range: model.getFullModelRange(), text: formatted }]
}

function buildNavigationLocations(
  locations: { file: string; line: number; column: number; endColumn: number }[],
): monaco.languages.Location[] {
  return locations.map(location => ({
    uri: monaco.Uri.parse(`dvala:///${location.file}`),
    range: {
      startLineNumber: location.line,
      startColumn: location.column,
      endLineNumber: location.line,
      endColumn: location.endColumn,
    },
  }))
}

function buildNavigationRenameEdit(
  edits: { file: string; line: number; column: number; endColumn: number; text: string }[],
): monaco.languages.WorkspaceEdit {
  return {
    edits: edits.map(edit => ({
      resource: monaco.Uri.parse(`dvala:///${edit.file}`),
      textEdit: {
        range: {
          startLineNumber: edit.line,
          startColumn: edit.column,
          endLineNumber: edit.line,
          endColumn: edit.endColumn,
        },
        text: edit.text,
      },
      versionId: undefined,
    })),
  }
}

function handleWorkerMessage(event: MessageEvent<PlaygroundWorkerOutMessage>): void {
  const msg = event.data

  switch (msg.type) {
    case 'diagnosticsResult': {
      const { path, sourceVersion, diagnostics } = msg as PlaygroundDiagnosticsResultMessage

      const model = registeredModels.get(path)
      if (!model) return

      if (!matchesPendingRequest(pendingRequests, path, msg.requestId)) return

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
      clearDiagnosticsPendingRequest(path)
      return
    }

    case 'diagnosticsError': {
      const { path, requestId } = msg as PlaygroundDiagnosticsErrorMessage
      if (!matchesPendingRequest(pendingRequests, path, requestId)) return
      const model = registeredModels.get(path)
      if (model) monaco.editor.setModelMarkers(model, 'dvala', [])
      clearDiagnosticsPendingRequest(path)
      return
    }

    case 'formattingResult': {
      const { path, requestId, sourceVersion, formatted } = msg as PlaygroundFormattingResultMessage
      if (!matchesPendingRequest(pendingFormattingRequests, path, requestId)) return

      const model = registeredModels.get(path)
      if (!model || sourceVersion < model.getVersionId()) {
        clearPendingFormattingRequest(path, [])
        return
      }

      clearPendingFormattingRequest(path, buildFormattingEdits(model, formatted))
      return
    }

    case 'formattingError': {
      const { path, requestId } = msg as PlaygroundFormattingErrorMessage
      if (!matchesPendingRequest(pendingFormattingRequests, path, requestId)) return
      clearPendingFormattingRequest(path, [])
      return
    }

    case 'completionResult': {
      const { path, requestId, sourceVersion, items } = msg as PlaygroundCompletionResultMessage
      if (!matchesPendingRequest(pendingCompletionRequests, path, requestId)) return

      const model = registeredModels.get(path)
      if (!model || sourceVersion < model.getVersionId()) {
        clearPendingCompletionRequest(path, null)
        return
      }

      clearPendingCompletionRequest(path, items)
      return
    }

    case 'completionError': {
      const { path, requestId } = msg as PlaygroundCompletionErrorMessage
      if (!matchesPendingRequest(pendingCompletionRequests, path, requestId)) return
      clearPendingCompletionRequest(path, null)
      return
    }

    case 'hoverResult': {
      const { path, requestId, sourceVersion, inferredType } = msg as PlaygroundHoverResultMessage
      if (!matchesPendingRequest(pendingHoverRequests, path, requestId)) return

      const model = registeredModels.get(path)
      if (!model || sourceVersion < model.getVersionId()) {
        clearPendingHoverRequest(path, undefined)
        return
      }

      clearPendingHoverRequest(path, inferredType)
      return
    }

    case 'hoverError': {
      const { path, requestId } = msg as PlaygroundHoverErrorMessage
      if (!matchesPendingRequest(pendingHoverRequests, path, requestId)) return
      clearPendingHoverRequest(path, undefined)
      return
    }

    case 'navigationResult': {
      const { path, requestId, sourceVersion, kind, locations, edits } = msg as PlaygroundNavigationResultMessage
      const key = getNavigationRequestKey(kind, path)
      if (!matchesPendingRequest(pendingNavigationRequests, key, requestId)) return

      const model = registeredModels.get(path)
      if (!model || sourceVersion < model.getVersionId()) {
        clearPendingNavigationRequest(kind, path, kind === 'rename' ? null : null)
        return
      }

      if (kind === 'rename') {
        clearPendingNavigationRequest(kind, path, edits?.length ? buildNavigationRenameEdit(edits) : null)
        return
      }

      clearPendingNavigationRequest(kind, path, locations?.length ? buildNavigationLocations(locations) : null)
      return
    }

    case 'navigationError': {
      const { path, requestId, kind } = msg as PlaygroundNavigationErrorMessage
      const key = getNavigationRequestKey(kind, path)
      if (!matchesPendingRequest(pendingNavigationRequests, key, requestId)) return
      clearPendingNavigationRequest(kind, path, null)
      return
    }

    case 'resyncDocument': {
      const { path } = msg as PlaygroundResyncDocumentMessage
      const model = registeredModels.get(path)
      if (!model || !worker) return
      const fingerprint = getResyncFingerprint(path, model.getVersionId())
      if (lastResyncFingerprints.get(path) === fingerprint) return
      syncModelToWorker(worker, path, model)
      if (getPendingRequestId(pendingRequests, path) !== undefined) {
        requestDiagnostics(path, model.getVersionId())
      }
      pendingFormattingRetries.get(path)?.()
      pendingCompletionRetries.get(path)?.()
      pendingHoverRetries.get(path)?.()
      pendingNavigationRetries.get(getNavigationRequestKey('definition', path))?.()
      pendingNavigationRetries.get(getNavigationRequestKey('references', path))?.()
      pendingNavigationRetries.get(getNavigationRequestKey('rename', path))?.()
      lastResyncFingerprints.set(path, getResyncFingerprint(path, model.getVersionId()))
      return
    }
  }
}

function createWorker(): Worker {
  const nextWorker = new LsWorker()
  nextWorker.onerror = () => handleWorkerError()
  nextWorker.onmessage = event => handleWorkerMessage(event)
  resetWorkerSyncState()
  syncWorkspaceSnapshotToWorker(nextWorker)
  syncRegisteredModelsToWorker(nextWorker)
  return nextWorker
}

function getPathForModel(model: monaco.editor.ITextModel): string | undefined {
  for (const [path, registeredModel] of registeredModels) {
    if (registeredModel === model) return path
  }
  return undefined
}

function dedupeCompletionItems(items: CompletionItem[]): CompletionItem[] {
  const seen = new Set<string>()
  const deduped: CompletionItem[] = []
  for (const item of items) {
    if (seen.has(item.label)) continue
    seen.add(item.label)
    deduped.push(item)
  }
  return deduped
}

function getImportPathAtPosition(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
): { rawPath: string; range: monaco.IRange } | null {
  const lineText = model.getLineContent(position.lineNumber)
  const beforeCursor = lineText.slice(0, Math.max(0, position.column))
  const prefixMatch = /import\(\s*"([^"]*)$/.exec(beforeCursor)
  if (!prefixMatch) return null

  const afterCursor = lineText.slice(Math.max(0, position.column))
  const suffixMatch = /^([^"]*)"/.exec(afterCursor)
  const quoteOffset = beforeCursor.lastIndexOf('"')
  if (quoteOffset === -1) return null

  const rawPath = `${prefixMatch[1] ?? ''}${suffixMatch?.[1] ?? ''}`
  return {
    rawPath,
    range: {
      startLineNumber: position.lineNumber,
      startColumn: quoteOffset + 2,
      endLineNumber: position.lineNumber,
      endColumn: quoteOffset + 2 + rawPath.length,
    },
  }
}

function getDefinitionsAtPosition(
  model: monaco.editor.ITextModel,
  path: string,
  position: monaco.Position,
): Promise<monaco.languages.Location[] | null> {
  return requestNavigation(model, path, position, 'definition')
}

function getDefinitionsAtPositionLocal(
  model: monaco.editor.ITextModel,
  path: string,
  position: monaco.Position,
): monaco.languages.Location[] | null {
  const importPath = getImportPathAtPosition(model, position)
  if (importPath) {
    const resolved = resolveWorkspaceImportPath(importPath.rawPath, path)
    if (resolved) {
      return [
        {
          uri: monaco.Uri.parse(`dvala:///${resolved}`),
          range: {
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: 1,
            endColumn: 1,
          },
        },
      ]
    }
  }

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
}

function getReferencesAtPosition(
  model: monaco.editor.ITextModel,
  path: string,
  position: monaco.Position,
): Promise<monaco.languages.Location[] | null> {
  return requestNavigation(model, path, position, 'references')
}

function getReferencesAtPositionLocal(path: string, position: monaco.Position): monaco.languages.Location[] | null {
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
}

function getRenameEditsAtPosition(
  model: monaco.editor.ITextModel,
  path: string,
  position: monaco.Position,
  newName: string,
): Promise<monaco.languages.WorkspaceEdit | null> {
  return requestNavigation(model, path, position, 'rename', newName)
}

function getRenameEditsAtPositionLocal(
  path: string,
  position: monaco.Position,
  newName: string,
): monaco.languages.WorkspaceEdit | null {
  const canonical = workspaceIndex.resolveCanonicalFile(path, position.lineNumber, position.column)
  if (!canonical) return null
  const occurrences = workspaceIndex.findAllOccurrences(canonical.file, canonical.name)
  if (occurrences.length === 0) return null

  return {
    edits: occurrences.map(loc => ({
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
    })),
  }
}

function requestNavigation<T>(
  model: monaco.editor.ITextModel,
  path: string,
  position: monaco.Position,
  kind: 'definition' | 'references',
): Promise<T | null>
function requestNavigation<T>(
  model: monaco.editor.ITextModel,
  path: string,
  position: monaco.Position,
  kind: 'rename',
  newName: string,
): Promise<T | null>
function requestNavigation<T>(
  model: monaco.editor.ITextModel,
  path: string,
  position: monaco.Position,
  kind: NavigationRequestKind,
  newName?: string,
): Promise<T | null> {
  const w = getWorker()
  const key = getNavigationRequestKey(kind, path)
  cancelPendingNavigationRequest(kind, path, null, w)

  return new Promise(resolve => {
    pendingNavigationResolvers.set(key, resolve as (result: unknown) => void)
    const retry = () => {
      startTrackedRequest(pendingNavigationRequests, key, w, requestId => ({
        type: 'requestNavigation',
        requestId,
        kind,
        path,
        sourceVersion: model.getVersionId(),
        line: position.lineNumber,
        column: position.column,
        ...(newName ? { newName } : {}),
      }))
    }
    pendingNavigationRetries.set(key, retry)
    retry()
  })
}

function requestFormattingEdits(model: monaco.editor.ITextModel): Promise<monaco.languages.TextEdit[]> {
  const path = getPathForModel(model)
  if (!path) return Promise.resolve([])

  const w = getWorker()
  cancelPendingFormattingRequest(path, w)

  return new Promise(resolve => {
    pendingFormattingResolvers.set(path, resolve)
    const retry = () => {
      startTrackedRequest(pendingFormattingRequests, path, w, requestId => ({
        type: 'requestFormatting',
        requestId,
        path,
        sourceVersion: model.getVersionId(),
      }))
    }
    pendingFormattingRetries.set(path, retry)
    retry()
  })
}

function requestCompletionItems(
  model: monaco.editor.ITextModel,
  path: string,
  position: monaco.Position,
  prefix: string,
  importPrefix: string | null,
): Promise<CompletionItem[] | null> {
  const w = getWorker()
  cancelPendingCompletionRequest(path, w)

  return new Promise(resolve => {
    pendingCompletionResolvers.set(path, resolve)
    const retry = () => {
      startTrackedRequest(pendingCompletionRequests, path, w, requestId => ({
        type: 'requestCompletion',
        requestId,
        path,
        sourceVersion: model.getVersionId(),
        line: position.lineNumber,
        column: position.column,
        prefix,
        importPrefix,
      }))
    }
    pendingCompletionRetries.set(path, retry)
    retry()
  })
}

function toMonacoCompletionList(
  completionItems: CompletionItem[] | null,
  range: monaco.IRange,
  wordStartColumn: number,
): monaco.languages.CompletionList {
  const suggestions: monaco.languages.CompletionItem[] = []
  for (const item of completionItems ?? []) {
    const completion: monaco.languages.CompletionItem = {
      label: item.label,
      kind: kindToMonaco(item.kind),
      detail: item.detail,
      sortText: item.sortText,
      insertText: item.insertText ?? item.label,
      range: { ...range, startColumn: wordStartColumn },
    }
    if (item.insertText) {
      completion.insertTextRules = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
    }
    suggestions.push(completion)
  }

  return { suggestions }
}

function requestHoverType(
  model: monaco.editor.ITextModel,
  path: string,
  position: monaco.Position,
  wordRange?: monaco.IRange,
): Promise<string | undefined> {
  const w = getWorker()
  const requestKey = getHoverRequestKey(path, model.getVersionId(), position, wordRange)

  if (pendingHoverRequestKeys.get(path) === requestKey) {
    const existingResolve = pendingHoverResolvers.get(path)
    if (existingResolve) {
      return new Promise(resolve => {
        pendingHoverResolvers.set(path, inferredType => {
          existingResolve(inferredType)
          resolve(inferredType)
        })
      })
    }
  }

  cancelPendingHoverRequest(path, w)

  return new Promise(resolve => {
    pendingHoverRequestKeys.set(path, requestKey)
    pendingHoverResolvers.set(path, resolve)
    const retry = () => {
      startTrackedRequest(pendingHoverRequests, path, w, requestId => ({
        type: 'requestHover',
        requestId,
        path,
        sourceVersion: model.getVersionId(),
        line: position.lineNumber,
        column: position.column,
        ...(wordRange
          ? {
              startColumn: wordRange.startColumn,
              endColumn: wordRange.endColumn,
            }
          : {}),
      }))
    }
    pendingHoverRetries.set(path, retry)
    retry()
  })
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Initialize the LS worker. Call once during playground boot.
 */
export function initLspWorker(): void {
  if (!workspaceFilesListenerRegistered) {
    onWorkspaceFilesChanged(() => {
      if (!worker) return
      syncWorkspaceSnapshotToWorker(worker)
    })
    workspaceFilesListenerRegistered = true
  }

  void getWorker()

  // Register Monaco hover provider for Dvala. Built-in docs and source
  // locations stay local; inferred type computation round-trips through the
  // worker from the current source snapshot.
  monaco.languages.registerHoverProvider('dvala', {
    provideHover: async (model, position) => {
      const path = getPathForModel(model)
      if (!path) return null

      const word = model.getWordAtPosition(position)
      const wordRange =
        word && word.word.length > 0
          ? {
              startLineNumber: position.lineNumber,
              startColumn: word.startColumn,
              endLineNumber: position.lineNumber,
              endColumn: word.endColumn,
            }
          : undefined
      const wordText = wordRange ? model.getValueInRange(wordRange) : undefined
      const symbol = workspaceIndex.getSymbolAtPosition(path, position.lineNumber, position.column)
      const ref = wordText && !symbol ? (allReference[wordText] ?? referenceByTitle.get(wordText)) : undefined

      try {
        const inferredType = await requestHoverType(model, path, position, wordRange)

        const sourceLocation = symbol?.def
          ? buildSourceLocationMarkdown(symbol.def.location.file, symbol.def.location.line, symbol.def.location.column)
          : undefined

        if (!inferredType && !ref && !sourceLocation) return null

        const contents: monaco.IMarkdownString[] = []
        if (inferredType) {
          contents.push({ value: `\`\`\`dvala\n${inferredType}\n\`\`\`` })
        }
        if (sourceLocation) {
          if (contents.length > 0) contents.push({ value: '---' })
          contents.push({ value: sourceLocation })
        }
        if (ref) {
          if (contents.length > 0) contents.push({ value: '---' })
          contents.push({ value: buildHoverMarkdown(wordText!, ref) })
        }

        return {
          contents,
          ...(wordRange ? { range: wordRange } : {}),
        }
      } catch {
        return null
      }
    },
  })

  monaco.languages.registerCompletionItemProvider('dvala', {
    triggerCharacters: ['"', '.', '/'],
    provideCompletionItems: (model, position) => {
      const path = getPathForModel(model)

      const range: monaco.IRange = {
        startLineNumber: position.lineNumber,
        startColumn: position.column,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      }
      const word = model.getWordUntilPosition(position)
      const prefix = String(word.word).toLowerCase()
      const importPrefix = getImportCompletionPrefix(model.getLineContent(position.lineNumber), position.column)
      if (!path) {
        return toMonacoCompletionList(
          dedupeCompletionItems([...getScopedCompletionItems(prefix, [])]),
          range,
          word.startColumn,
        )
      }

      return requestCompletionItems(model, path, position, prefix, importPrefix).then(completionItems =>
        toMonacoCompletionList(completionItems, range, word.startColumn),
      )
    },
  })

  monaco.languages.registerSignatureHelpProvider('dvala', {
    signatureHelpTriggerCharacters: ['(', ','],
    signatureHelpRetriggerCharacters: [','],
    provideSignatureHelp: (model, position) => {
      const path = getPathForModel(model)

      const callCtx = findCallContext(model.getValue(), { line: position.lineNumber, column: position.column })
      if (!path || !callCtx) return null

      const signatures: monaco.languages.SignatureInformation[] = []
      const definitions = workspaceIndex.getDefinitions(path)
      const ref = allReference[callCtx.functionName] ?? referenceByTitle.get(callCtx.functionName)
      if (ref && isFunctionReference(ref)) {
        for (const variant of ref.variants) {
          const paramLabels = variant.argumentNames.map(name => {
            const argInfo = ref.args[name]
            const typeStr = argInfo ? (Array.isArray(argInfo.type) ? argInfo.type.join(' | ') : argInfo.type) : ''
            return typeStr ? `${name}: ${typeStr}` : name
          })
          signatures.push({
            label: `${callCtx.functionName}(${paramLabels.join(', ')})`,
            parameters: paramLabels.map(label => ({ label })),
          })
        }
      } else {
        const funcDef = definitions.find(def => def.name === callCtx.functionName && def.params)
        if (funcDef?.params) {
          signatures.push({
            label: `${callCtx.functionName}(${funcDef.params.join(', ')})`,
            parameters: funcDef.params.map(label => ({ label })),
          })
        }
      }

      if (signatures.length === 0) return null

      return {
        value: {
          signatures,
          activeSignature: 0,
          activeParameter: callCtx.activeParam,
        },
        dispose: () => {},
      }
    },
  })

  // ── Go-to-definition provider ────────────────────────────────────────────

  monaco.languages.registerDefinitionProvider('dvala', {
    provideDefinition: (model, position) => {
      const path = getPathForModel(model)
      if (!path) return null

      return getDefinitionsAtPosition(model, path, position)
    },
  })

  // ── Find-references provider ─────────────────────────────────────────────

  monaco.languages.registerReferenceProvider('dvala', {
    provideReferences: (model, position) => {
      const path = getPathForModel(model)
      if (!path) return null

      return getReferencesAtPosition(model, path, position)
    },
  })

  // ── Rename provider ──────────────────────────────────────────────────────

  monaco.languages.registerRenameProvider('dvala', {
    provideRenameEdits: (model, position, newName) => {
      const path = getPathForModel(model)
      if (!path) return null

      return getRenameEditsAtPosition(model, path, position, newName)
    },
  })

  // ── Document formatter ───────────────────────────────────────────────────

  monaco.languages.registerDocumentFormattingEditProvider('dvala', {
    provideDocumentFormattingEdits: model => requestFormattingEdits(model),
  })

  monaco.languages.registerDocumentRangeFormattingEditProvider('dvala', {
    provideDocumentRangeFormattingEdits: model => requestFormattingEdits(model),
  })
}

/**
 * Register a Monaco model with the given workspace path so diagnostics
 * results can be routed to it.
 */
export function registerModel(path: string, model: monaco.editor.ITextModel): void {
  registeredModels.set(path, model)
  lastResyncFingerprints.delete(path)
  if (worker) syncModelToWorker(worker, path, model)
  else void getWorker()
}

/**
 * Unregister a model (called when a tab closes and the model is disposed).
 */
export function unregisterModel(path: string): void {
  // Grab the model before deleting from the registry.
  const model = registeredModels.get(path)
  registeredModels.delete(path)
  lastResyncFingerprints.delete(path)
  lastSentSourceVersions.delete(path)
  if (model) monaco.editor.setModelMarkers(model, 'dvala', [])
  if (worker) worker.postMessage({ type: 'closeDocument', path })
  // Cancel any pending diagnostics for this path.
  cancelPendingDiagnosticsRequest(path)
  cancelPendingFormattingRequest(path)
  cancelPendingCompletionRequest(path)
  cancelPendingHoverRequest(path)
  cancelPendingNavigationRequest('definition', path, null)
  cancelPendingNavigationRequest('references', path, null)
  cancelPendingNavigationRequest('rename', path, null)
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
  const previousSourceVersion = lastSentSourceVersions.get(path)
  lastResyncFingerprints.delete(path)

  indexWorkspaceFile(path, source)

  w.postMessage({
    type: 'updateDocument',
    path,
    source,
    sourceVersion,
    previousSourceVersion: previousSourceVersion ?? sourceVersion - 1,
  })
  lastSentSourceVersions.set(path, sourceVersion)

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

export function restartWorkerForTesting(clearMarkers = false): void {
  worker?.terminate()
  worker = null
  if (!clearMarkers) return
  for (const model of registeredModels.values()) {
    monaco.editor.setModelMarkers(model, 'dvala', [])
  }
}

export function requestDiagnosticsForTesting(path: string, sourceVersion: number): void {
  requestDiagnostics(path, sourceVersion)
}

export function getDefinitionsForTesting(
  path: string,
  position: monaco.Position,
): Promise<monaco.languages.Location[] | null> {
  const model = registeredModels.get(path)
  if (!model) return Promise.resolve(null)
  return getDefinitionsAtPosition(model, path, position)
}

export function getDefinitionsLocallyForTesting(
  path: string,
  position: monaco.Position,
): monaco.languages.Location[] | null {
  const model = registeredModels.get(path)
  if (!model) return null
  return getDefinitionsAtPositionLocal(model, path, position)
}

export function getReferencesForTesting(
  path: string,
  position: monaco.Position,
): Promise<monaco.languages.Location[] | null> {
  const model = registeredModels.get(path)
  if (!model) return Promise.resolve(null)
  return getReferencesAtPosition(model, path, position)
}

export function getReferencesLocallyForTesting(
  path: string,
  position: monaco.Position,
): monaco.languages.Location[] | null {
  return getReferencesAtPositionLocal(path, position)
}

export function getRenameEditsForTesting(
  path: string,
  position: monaco.Position,
  newName: string,
): Promise<monaco.languages.WorkspaceEdit | null> {
  const model = registeredModels.get(path)
  if (!model) return Promise.resolve(null)
  return getRenameEditsAtPosition(model, path, position, newName)
}

export function getRenameEditsLocallyForTesting(
  path: string,
  position: monaco.Position,
  newName: string,
): monaco.languages.WorkspaceEdit | null {
  return getRenameEditsAtPositionLocal(path, position, newName)
}

export function getFormattingEditsForTesting(model: monaco.editor.ITextModel): Promise<monaco.languages.TextEdit[]> {
  return requestFormattingEdits(model)
}

/**
 * Request diagnostics from the worker for the given path.
 * Cancels any in-flight request for the same path.
 */
function requestDiagnostics(path: string, sourceVersion: number): void {
  const w = getWorker()
  startTrackedRequest(
    pendingRequests,
    path,
    w,
    (requestId): PlaygroundRequestDiagnosticsMessage => ({
      type: 'requestDiagnostics',
      requestId,
      path,
      sourceVersion,
    }),
  )
}
