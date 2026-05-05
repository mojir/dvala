/**
 * Dvala Language Service Web Worker.
 *
 * Runs in a separate thread so typechecking + parse work never blocks the
 * editor UI. The main thread streams edit deltas via `updateDocument`
 * messages and requests diagnostics on a debounced schedule; the worker
 * holds a stateful per-file mirror and responds with portable `Diagnostic[]`
 * arrays that the main thread pushes into Monaco's marker API.
 *
 * ## Protocol
 *
 * Every message has a `type` field and an optional `requestId` for
 * request/response correlation. The main thread assigns monotonically
 * increasing `requestId` values; the worker echoes them back.
 *
 * ### Main → Worker
 *
 * - `updateDocument(path, source, sourceVersion)`: edit delta. The worker
 *   stores the latest source for the given path. `sourceVersion` is a
 *   monotonically increasing counter from the main thread that the worker
 *   stamps onto diagnostics responses so the main thread can discard stale
 *   replies.
 * - `requestDiagnostics(path, sourceVersion)`: compute parse + typecheck
 *   diagnostics for the file at `path`. The worker tokenizes, parses, and
 *   typechecks the stored mirror; posts back `diagnosticsResult` or
 *   `diagnosticsError`.
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
 *
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
import { buildParseDiagnostics } from '../../src/shared/diagnosticBuilder'
import type { Diagnostic } from '../../src/shared/types'

// ── Message types ─────────────────────────────────────────────────────────────

interface UpdateDocumentMessage {
  type: 'updateDocument'
  path: string
  source: string
  sourceVersion: number
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

type WorkerInMessage = UpdateDocumentMessage | RequestDiagnosticsMessage | CancelRequestMessage

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

// ── Worker state ──────────────────────────────────────────────────────────────

/** Per-file mirror buffer. */
interface FileState {
  source: string
  sourceVersion: number
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

// ── Core pipeline ─────────────────────────────────────────────────────────────

interface DiagnosticsInput {
  path: string
  source: string
  sourceVersion: number
  requestId: number
}

function computeDiagnostics(input: DiagnosticsInput): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  // ── Tokenize + parse ──
  const tokenStream = tokenizeSource(input.source, true, input.path)
  const parseResult = parseTokenStreamRecoverable(tokenStream)
  diagnostics.push(...buildParseDiagnostics(parseResult.errors))
  checkCancelled(input.requestId)

  // Worker handles tokenize + parse only. Typecheck runs on the main
  // thread to avoid pulling builtin (.dvala files) into the worker bundle.
  return diagnostics
}

// ── Message handler ───────────────────────────────────────────────────────────

self.onmessage = (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data

  switch (msg.type) {
    case 'updateDocument': {
      files.set(msg.path, { source: msg.source, sourceVersion: msg.sourceVersion })
      return
    }

    case 'requestDiagnostics': {
      const file = files.get(msg.path)
      cancelledRequests.delete(msg.requestId)

      if (!file) {
        // No mirror yet — reply with empty diagnostics.
        const out: DiagnosticsResultMessage = {
          type: 'diagnosticsResult',
          requestId: msg.requestId,
          path: msg.path,
          sourceVersion: msg.sourceVersion,
          diagnostics: [],
        }
        self.postMessage(out)
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
