/**
 * Dvala Language Service Web Worker.
 *
 * Runs in a separate thread so parse and LS-typecheck work never blocks the
 * editor UI. The main thread streams edit deltas via `updateDocument`
 * messages and requests diagnostics on demand; the worker holds a stateful
 * per-file mirror and caches typecheck results for diagnostics against that
 * mirrored state.
 *
 * ## Protocol
 *
 * Every message has a `type` field and an optional `requestId` for
 * request/response correlation. The main thread assigns monotonically
 * increasing `requestId` values; the worker echoes them back.
 *
 * ### Main → Worker
 *
 * - `openDocument(path, source, sourceVersion)`: register or resync a full
 *   document mirror. Used when a Monaco model is first bound to a path and
 *   again after worker recreation so the worker owns the current set of open
 *   LS documents.
 * - `closeDocument(path)`: drop the mirrored state for a closed Monaco
 *   model. Prevents stale worker-only buffers from surviving after tabs are
 *   disposed.
 * - `updateDocument(path, source, sourceVersion, previousSourceVersion)`:
 *   ordered edit delta. The worker accepts it only when
 *   `previousSourceVersion` matches the mirrored version it already has for
 *   that path; otherwise it requests an explicit resync from the main
 *   thread instead of silently drifting.
 * - `requestDiagnostics(path, sourceVersion)`: compute parse + typecheck
 *   diagnostics for the file at `path`. The worker tokenizes, parses, and
 *   typechecks the stored mirror; if no mirror is available it requests an
 *   explicit resync instead of silently fabricating an empty result.
 * - `requestFormatting(path, source, sourceVersion)`: format the supplied
 *   source snapshot and post back `formattingResult` or `formattingError`.
 *   This does not depend on the mirrored file state, but still uses
 *   `requestId` correlation so stale replies can be dropped on the main
 *   thread.
 * - `requestNavigation(path, source, sourceVersion, position, workspaceFiles)`:
 *   resolve definition / references / rename queries from a source snapshot
 *   plus a workspace file snapshot. This lets navigation move onto the
 *   worker before the worker owns a long-lived workspace index.
 * - `cancelRequest(requestId)`: cancel an in-flight request. The worker
 *   checks a `cancelled` flag at well-known yield points (after parse,
 *   after typecheck) and drops the result if set.
 *
 * ### Worker → Main
 *
 * - `diagnosticsResult(path, sourceVersion, diagnostics)`: successful
 *   diagnostics computation. The main thread sanity-checks `sourceVersion`
 *   against the model's current version and pushes to Monaco markers.
 * - `diagnosticsError(path, sourceVersion, message)`: the worker hit an
 *   unrecoverable error during tokenize/parse/typecheck. The main thread
 *   clears markers (best-effort) and may log.
 * - `formattingResult(path, sourceVersion, formatted)`: successful format
 *   response for a source snapshot. The main thread applies it only when
 *   the path still has the same pending formatting request.
 * - `formattingError(path, sourceVersion, message)`: formatting failed.
 *   The main thread resolves the request with no edits.
 * - `navigationResult(path, sourceVersion, kind, payload)`: successful
 *   definition / references / rename response for a source snapshot.
 * - `navigationError(path, sourceVersion, kind, message)`: navigation
 *   computation failed. The main thread resolves the request with no result.
 * - `resyncDocument(path)`: the worker detected a missing mirror or a
 *   version gap while processing `updateDocument`, so the main thread
 *   should resend the canonical full document via `openDocument`.
 * ## Cooperative cancellation
 *
 * Long-running typecheck passes on real projects can overlap with fresh
 * keystrokes. When `cancelRequest(id)` arrives, the worker sets a
 * `cancelled` flag. Well-known yield points check this flag and throw
 * `CancellationError` when set, short-circuiting the remainder of the
 * pipeline. The main thread also filters by `sourceVersion` on receive,
 * so even if a cancellation races with a result-post, stale data is dropped.
 */

import { tokenizeSource } from '../../src/tooling'
import { parseTokenStreamRecoverable } from '../../src/tooling'
import { formatSource } from '../../src/tooling'
import { buildParseDiagnostics, buildTypeDiagnostics } from '../../src/shared/diagnosticBuilder'
import type { CompletionItem } from '../../src/shared/completionBuilder'
import { findTypeAtPosition, formatHoverType } from '../../src/shared/typeDisplay'
import type { Diagnostic } from '../../src/shared/types'
import { allBuiltinModules } from '../../src/allModules'
import { parseToAst } from '../../src/parser'
import { minifyTokenStream } from '../../src/tokenizer/minifyTokenStream'
import { WorkspaceIndex, type ResolveImport, typecheck } from '../../src/internal'
import type { TypecheckResult } from '../../src/internal'
import { folderFromPath, isInPlaygroundFolder } from './filePath'
import { getImportCompletionItems, getImportedExportCompletionItems, getScopedCompletionItems } from './lsCompletions'
import { resolvePlaygroundPath } from './playgroundFileResolver'

// ── Message types ─────────────────────────────────────────────────────────────

interface OpenDocumentMessage {
  type: 'openDocument'
  path: string
  source: string
  sourceVersion: number
}

interface UpdateDocumentMessage {
  type: 'updateDocument'
  path: string
  source: string
  sourceVersion: number
  previousSourceVersion: number
}

interface CloseDocumentMessage {
  type: 'closeDocument'
  path: string
}

interface RequestDiagnosticsMessage {
  type: 'requestDiagnostics'
  requestId: number
  path: string
  sourceVersion: number
}

interface RequestFormattingMessage {
  type: 'requestFormatting'
  requestId: number
  path: string
  source: string
  sourceVersion: number
}

interface RequestHoverMessage {
  type: 'requestHover'
  requestId: number
  path: string
  source: string
  sourceVersion: number
  line: number
  column: number
  startColumn?: number
  endColumn?: number
}

interface RequestCompletionMessage {
  type: 'requestCompletion'
  requestId: number
  path: string
  source: string
  sourceVersion: number
  line: number
  column: number
  prefix: string
  importPrefix: string | null
  workspaceFiles: WorkspaceSnapshotFile[]
}

type NavigationRequestKind = 'definition' | 'references' | 'rename'

interface WorkspaceSnapshotFile {
  path: string
  code: string
}

interface RequestNavigationMessage {
  type: 'requestNavigation'
  requestId: number
  path: string
  source: string
  sourceVersion: number
  kind: NavigationRequestKind
  line: number
  column: number
  newName?: string
  workspaceFiles: WorkspaceSnapshotFile[]
}

interface CancelRequestMessage {
  type: 'cancelRequest'
  requestId: number
}

type WorkerInMessage =
  | OpenDocumentMessage
  | UpdateDocumentMessage
  | CloseDocumentMessage
  | RequestDiagnosticsMessage
  | RequestFormattingMessage
  | RequestHoverMessage
  | RequestCompletionMessage
  | RequestNavigationMessage
  | CancelRequestMessage

interface DiagnosticsResultMessage {
  type: 'diagnosticsResult'
  requestId: number
  path: string
  sourceVersion: number
  diagnostics: (Diagnostic & { readonly severity: 'error' | 'warning' | 'info'; readonly source: string })[]
}

interface DiagnosticsErrorMessage {
  type: 'diagnosticsError'
  requestId: number
  path: string
  sourceVersion: number
  message: string
}

interface FormattingResultMessage {
  type: 'formattingResult'
  requestId: number
  path: string
  sourceVersion: number
  formatted: string
}

interface FormattingErrorMessage {
  type: 'formattingError'
  requestId: number
  path: string
  sourceVersion: number
  message: string
}

interface HoverResultMessage {
  type: 'hoverResult'
  requestId: number
  path: string
  sourceVersion: number
  inferredType?: string
}

interface HoverErrorMessage {
  type: 'hoverError'
  requestId: number
  path: string
  sourceVersion: number
  message: string
}

interface CompletionResultMessage {
  type: 'completionResult'
  requestId: number
  path: string
  sourceVersion: number
  items: CompletionItem[]
}

interface CompletionErrorMessage {
  type: 'completionError'
  requestId: number
  path: string
  sourceVersion: number
  message: string
}

interface NavigationLocationPayload {
  file: string
  line: number
  column: number
  endColumn: number
}

interface NavigationRenameEditPayload extends NavigationLocationPayload {
  text: string
}

interface NavigationResultMessage {
  type: 'navigationResult'
  requestId: number
  path: string
  sourceVersion: number
  kind: NavigationRequestKind
  locations?: NavigationLocationPayload[]
  edits?: NavigationRenameEditPayload[]
}

interface NavigationErrorMessage {
  type: 'navigationError'
  requestId: number
  path: string
  sourceVersion: number
  kind: NavigationRequestKind
  message: string
}

interface ResyncDocumentMessage {
  type: 'resyncDocument'
  path: string
}

// ── Worker state ──────────────────────────────────────────────────────────────

/** Per-file mirror buffer. */
interface FileState {
  source: string
  sourceVersion: number
  typecheckResult?: TypecheckResult
  typecheckVersion?: number
}

const files = new Map<string, FileState>()

/** Active request cancellation flags, keyed by requestId. */
const cancelledRequests = new Map<number, boolean>()

class CancellationError extends Error {
  constructor() {
    super('Cancelled')
    this.name = 'CancellationError'
  }
}

/** Throw if the given request has been cancelled. */
function checkCancelled(requestId: number): void {
  if (cancelledRequests.get(requestId)) throw new CancellationError()
}

function setFileState(path: string, source: string, sourceVersion: number): void {
  const current = files.get(path)
  if (current && sourceVersion < current.sourceVersion) return
  files.set(path, {
    source,
    sourceVersion,
  })
}

// ── Core pipeline ─────────────────────────────────────────────────────────────

interface DiagnosticsInput {
  path: string
  source: string
  sourceVersion: number
  requestId: number
}

function computeTypecheckResult(source: string, path: string): TypecheckResult {
  const tokens = tokenizeSource(source, true, path)
  try {
    const minified = minifyTokenStream(tokens, { removeWhiteSpace: true })
    const ast = parseToAst(minified)
    return typecheck(ast, { modules: allBuiltinModules })
  } catch {
    return { diagnostics: [], typeMap: new Map(), sourceMap: undefined }
  }
}

function getOrComputeTypecheckResult(path: string, file: FileState): TypecheckResult {
  if (file.typecheckResult && file.typecheckVersion === file.sourceVersion) return file.typecheckResult

  const result = computeTypecheckResult(file.source, path)
  file.typecheckResult = result
  file.typecheckVersion = file.sourceVersion
  return result
}

function computeDiagnostics(input: DiagnosticsInput): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  // ── Tokenize + parse ──
  const tokenStream = tokenizeSource(input.source, true, input.path)
  const parseResult = parseTokenStreamRecoverable(tokenStream)
  diagnostics.push(...buildParseDiagnostics(parseResult.errors))
  checkCancelled(input.requestId)

  const file = files.get(input.path)
  if (file) {
    const typecheckResult = getOrComputeTypecheckResult(input.path, file)
    diagnostics.push(...buildTypeDiagnostics(typecheckResult))
  }
  checkCancelled(input.requestId)

  return diagnostics
}

function computeHover(message: RequestHoverMessage): string | undefined {
  const typecheckResult = computeTypecheckResult(message.source, message.path)
  const wordRange =
    message.startColumn !== undefined && message.endColumn !== undefined
      ? {
          start: { line: message.line, column: message.startColumn },
          end: { line: message.line, column: message.endColumn },
        }
      : undefined

  const type = findTypeAtPosition(
    typecheckResult.typeMap,
    typecheckResult.sourceMap,
    { line: message.line, column: message.column },
    wordRange,
  )

  return type ? formatHoverType(type) : undefined
}

function computeCompletion(message: RequestCompletionMessage): CompletionItem[] {
  const snapshotFiles = new Map(message.workspaceFiles.map(file => [file.path, file.code]))
  snapshotFiles.set(message.path, message.source)

  const index = new WorkspaceIndex()
  indexWorkspaceSnapshot(message.path, message.source, snapshotFiles, index)

  if (message.importPrefix !== null) {
    return getImportCompletionItems(
      message.importPrefix,
      message.path,
      message.workspaceFiles.map(file => ({
        id: file.path,
        path: file.path,
        code: file.code,
        context: '',
        createdAt: 0,
        updatedAt: 0,
      })),
    )
  }

  const currentFileSymbols = index.getFileSymbols(message.path)
  return [
    ...getScopedCompletionItems(message.prefix, index.getSymbolsInScope(message.path, message.line, message.column)),
    ...getImportedExportCompletionItems(message.prefix, currentFileSymbols, filePath => index.getFileSymbols(filePath)),
  ]
}

function resolveWorkspaceImportPathForSnapshot(
  snapshotFiles: Map<string, string>,
  rawPath: string,
  fromFile: string,
): string | null {
  if (!(rawPath.startsWith('.') || rawPath.startsWith('/'))) return null
  let resolved: string
  try {
    resolved = resolvePlaygroundPath(isInPlaygroundFolder(fromFile) ? '' : folderFromPath(fromFile), rawPath)
  } catch {
    return null
  }
  if (isInPlaygroundFolder(resolved)) return null
  if (snapshotFiles.has(resolved)) return resolved
  if (snapshotFiles.has(`${resolved}.dvala`)) return `${resolved}.dvala`
  return null
}

function indexWorkspaceSnapshot(
  path: string,
  source: string,
  snapshotFiles: Map<string, string>,
  index: WorkspaceIndex,
  seen = new Set<string>(),
): void {
  if (seen.has(path)) return
  seen.add(path)

  const resolveImport: ResolveImport = (rawPath, fromFile) =>
    resolveWorkspaceImportPathForSnapshot(snapshotFiles, rawPath, fromFile)
  const fileSymbols = index.updateFile(path, source, resolveImport)
  for (const importedPath of fileSymbols.imports.values()) {
    if (seen.has(importedPath)) continue
    const importedSource = snapshotFiles.get(importedPath)
    if (importedSource === undefined) continue
    indexWorkspaceSnapshot(importedPath, importedSource, snapshotFiles, index, seen)
  }
}

function getImportPathAtSourcePosition(source: string, line: number, column: number): string | null {
  const lineText = source.split('\n')[line - 1]
  if (lineText === undefined) return null

  const beforeCursor = lineText.slice(0, Math.max(0, column - 1))
  const prefixMatch = /import\(\s*"([^"]*)$/.exec(beforeCursor)
  if (!prefixMatch) return null

  const afterCursor = lineText.slice(Math.max(0, column - 1))
  const suffixMatch = /^([^"]*)"/.exec(afterCursor)
  const rawPath = `${prefixMatch[1] ?? ''}${suffixMatch?.[1] ?? ''}`
  return rawPath.length > 0 ? rawPath : ''
}

function computeNavigation(message: RequestNavigationMessage): Pick<NavigationResultMessage, 'locations' | 'edits'> {
  const snapshotFiles = new Map(message.workspaceFiles.map(file => [file.path, file.code]))
  snapshotFiles.set(message.path, message.source)

  const index = new WorkspaceIndex()
  indexWorkspaceSnapshot(message.path, message.source, snapshotFiles, index)

  if (message.kind === 'definition') {
    const importPath = getImportPathAtSourcePosition(message.source, message.line, message.column)
    if (importPath !== null) {
      const resolved = resolveWorkspaceImportPathForSnapshot(snapshotFiles, importPath, message.path)
      if (resolved) {
        return {
          locations: [
            {
              file: resolved,
              line: 1,
              column: 1,
              endColumn: 1,
            },
          ],
        }
      }
    }

    const def = index.findDefinition(message.path, message.line, message.column)
    return {
      locations: def
        ? [
            {
              file: def.location.file,
              line: def.location.line,
              column: def.location.column,
              endColumn: def.location.column + def.name.length,
            },
          ]
        : [],
    }
  }

  const canonical = index.resolveCanonicalFile(message.path, message.line, message.column)
  if (!canonical) return message.kind === 'rename' ? { edits: [] } : { locations: [] }

  const occurrences = index.findAllOccurrences(canonical.file, canonical.name)
  if (message.kind === 'references') {
    return {
      locations: occurrences.map(loc => ({
        file: loc.file,
        line: loc.line,
        column: loc.column,
        endColumn: loc.column + loc.nameLength,
      })),
    }
  }

  return {
    edits: occurrences.map(loc => ({
      file: loc.file,
      line: loc.line,
      column: loc.column,
      endColumn: loc.column + loc.nameLength,
      text: message.newName ?? canonical.name,
    })),
  }
}

function requestDocumentResync(path: string): void {
  const out: ResyncDocumentMessage = {
    type: 'resyncDocument',
    path,
  }
  self.postMessage(out)
}

// ── Message handler ───────────────────────────────────────────────────────────

self.onmessage = (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data

  switch (msg.type) {
    case 'openDocument': {
      setFileState(msg.path, msg.source, msg.sourceVersion)
      return
    }

    case 'updateDocument': {
      const current = files.get(msg.path)
      if (!current || current.sourceVersion !== msg.previousSourceVersion) {
        requestDocumentResync(msg.path)
        return
      }

      setFileState(msg.path, msg.source, msg.sourceVersion)
      return
    }

    case 'closeDocument': {
      files.delete(msg.path)
      return
    }

    case 'requestDiagnostics': {
      const file = files.get(msg.path)
      cancelledRequests.delete(msg.requestId)

      if (!file) {
        requestDocumentResync(msg.path)
        return
      }

      try {
        const diagnostics = computeDiagnostics({
          path: msg.path,
          source: file.source,
          sourceVersion: msg.sourceVersion,
          requestId: msg.requestId,
        })

        const out: DiagnosticsResultMessage = {
          type: 'diagnosticsResult',
          requestId: msg.requestId,
          path: msg.path,
          sourceVersion: msg.sourceVersion,
          diagnostics: diagnostics as DiagnosticsResultMessage['diagnostics'],
        }
        self.postMessage(out)
      } catch (error) {
        if (error instanceof CancellationError) return

        const out: DiagnosticsErrorMessage = {
          type: 'diagnosticsError',
          requestId: msg.requestId,
          path: msg.path,
          sourceVersion: msg.sourceVersion,
          message: error instanceof Error ? error.message : String(error),
        }
        self.postMessage(out)
      }
      return
    }

    case 'requestFormatting': {
      cancelledRequests.delete(msg.requestId)

      try {
        const out: FormattingResultMessage = {
          type: 'formattingResult',
          requestId: msg.requestId,
          path: msg.path,
          sourceVersion: msg.sourceVersion,
          formatted: formatSource(msg.source),
        }
        self.postMessage(out)
      } catch (error) {
        const out: FormattingErrorMessage = {
          type: 'formattingError',
          requestId: msg.requestId,
          path: msg.path,
          sourceVersion: msg.sourceVersion,
          message: error instanceof Error ? error.message : String(error),
        }
        self.postMessage(out)
      }
      return
    }

    case 'requestHover': {
      cancelledRequests.delete(msg.requestId)

      try {
        const inferredType = computeHover(msg)
        checkCancelled(msg.requestId)
        const out: HoverResultMessage = {
          type: 'hoverResult',
          requestId: msg.requestId,
          path: msg.path,
          sourceVersion: msg.sourceVersion,
          ...(inferredType ? { inferredType } : {}),
        }
        self.postMessage(out)
      } catch (error) {
        if (error instanceof CancellationError) return
        const out: HoverErrorMessage = {
          type: 'hoverError',
          requestId: msg.requestId,
          path: msg.path,
          sourceVersion: msg.sourceVersion,
          message: error instanceof Error ? error.message : String(error),
        }
        self.postMessage(out)
      }
      return
    }

    case 'requestCompletion': {
      cancelledRequests.delete(msg.requestId)

      try {
        const items = computeCompletion(msg)
        checkCancelled(msg.requestId)
        const out: CompletionResultMessage = {
          type: 'completionResult',
          requestId: msg.requestId,
          path: msg.path,
          sourceVersion: msg.sourceVersion,
          items,
        }
        self.postMessage(out)
      } catch (error) {
        if (error instanceof CancellationError) return
        const out: CompletionErrorMessage = {
          type: 'completionError',
          requestId: msg.requestId,
          path: msg.path,
          sourceVersion: msg.sourceVersion,
          message: error instanceof Error ? error.message : String(error),
        }
        self.postMessage(out)
      }
      return
    }

    case 'requestNavigation': {
      cancelledRequests.delete(msg.requestId)

      try {
        const result = computeNavigation(msg)
        const out: NavigationResultMessage = {
          type: 'navigationResult',
          requestId: msg.requestId,
          path: msg.path,
          sourceVersion: msg.sourceVersion,
          kind: msg.kind,
          ...result,
        }
        self.postMessage(out)
      } catch (error) {
        const out: NavigationErrorMessage = {
          type: 'navigationError',
          requestId: msg.requestId,
          path: msg.path,
          sourceVersion: msg.sourceVersion,
          kind: msg.kind,
          message: error instanceof Error ? error.message : String(error),
        }
        self.postMessage(out)
      }
      return
    }

    case 'cancelRequest': {
      cancelledRequests.set(msg.requestId, true)
      // Prune stale cancelled entries periodically (every ~20 cancels).
      // Entries set to `true` that are never matched by a subsequent
      // requestDiagnostics would otherwise accumulate forever.
      if (cancelledRequests.size > 20) {
        for (const [id, cancelled] of cancelledRequests) {
          if (cancelled) cancelledRequests.delete(id)
        }
      }
      return
    }
  }
}
