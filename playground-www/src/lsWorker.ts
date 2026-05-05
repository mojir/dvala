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
import { buildParseDiagnostics, buildTypeDiagnostics } from '../../src/shared/diagnosticBuilder'
import type { Diagnostic } from '../../src/shared/types'
import { allBuiltinModules } from '../../src/allModules'
import { parseToAst } from '../../src/parser'
import { minifyTokenStream } from '../../src/tokenizer/minifyTokenStream'
import { typecheck } from '../../src/internal'
import type { TypecheckResult } from '../../src/internal'

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

interface CancelRequestMessage {
  type: 'cancelRequest'
  requestId: number
}

type WorkerInMessage =
  | OpenDocumentMessage
  | UpdateDocumentMessage
  | CloseDocumentMessage
  | RequestDiagnosticsMessage
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
