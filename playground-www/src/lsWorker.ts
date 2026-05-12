/**
 * Dvala Language Service Web Worker.
 *
 * Runs in a separate thread so parse and LS-typecheck work never blocks the
 * editor UI. The main thread streams edit deltas via `updateDocument`
 * messages and requests diagnostics on demand; the worker adapts that
 * protocol onto a backend-owned document mirror and diagnostics pipeline.
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
 *   diagnostics for the file at `path`. The worker forwards the request to
 *   the backend-owned mirror; if no mirror is available it requests an
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

import { createBackend } from '../../src/internal'
import type {
  PlaygroundCompletionErrorMessage as CompletionErrorMessage,
  PlaygroundCompletionResultMessage as CompletionResultMessage,
  PlaygroundDiagnosticsErrorMessage as DiagnosticsErrorMessage,
  PlaygroundDiagnosticsResultMessage as DiagnosticsResultMessage,
  PlaygroundFormattingErrorMessage as FormattingErrorMessage,
  PlaygroundFormattingResultMessage as FormattingResultMessage,
  PlaygroundHoverErrorMessage as HoverErrorMessage,
  PlaygroundHoverResultMessage as HoverResultMessage,
  PlaygroundNavigationErrorMessage as NavigationErrorMessage,
  PlaygroundNavigationResultMessage as NavigationResultMessage,
  PlaygroundResyncDocumentMessage as ResyncDocumentMessage,
  PlaygroundWorkerInMessage as WorkerInMessage,
} from '../../src/internal'

// ── Worker state ──────────────────────────────────────────────────────────────

const backend = createBackend()

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

function requestDocumentResync(path: string): void {
  const out: ResyncDocumentMessage = {
    type: 'resyncDocument',
    path,
  }
  self.postMessage(out)
}

// ── Message handler ───────────────────────────────────────────────────────────

self.onmessage = async (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data

  switch (msg.type) {
    case 'openDocument': {
      await backend.openDocument({
        path: msg.path,
        source: msg.source,
        version: msg.sourceVersion,
      })
      return
    }

    case 'updateDocument': {
      const result = await backend.updateDocument(
        {
          path: msg.path,
          source: msg.source,
          version: msg.sourceVersion,
        },
        msg.previousSourceVersion,
      )
      if (!result.ok && result.error.kind === 'resync-required') {
        requestDocumentResync(msg.path)
        return
      }
      return
    }

    case 'closeDocument': {
      await backend.closeDocument(msg.path)
      return
    }

    case 'replaceWorkspaceSnapshot': {
      await backend.replaceWorkspaceSnapshot({ files: msg.files })
      return
    }

    case 'requestDiagnostics': {
      cancelledRequests.delete(msg.requestId)

      const result = await backend.requestDiagnostics({
        requestId: msg.requestId,
        path: msg.path,
        version: msg.sourceVersion,
      })

      if (!result.ok && result.error.kind === 'resync-required') {
        requestDocumentResync(msg.path)
        return
      }

      if (!result.ok && result.error.kind === 'cancelled') return

      if (!result.ok) {
        const out: DiagnosticsErrorMessage = {
          type: 'diagnosticsError',
          requestId: msg.requestId,
          path: msg.path,
          sourceVersion: msg.sourceVersion,
          message: result.error.message,
        }
        self.postMessage(out)
        return
      }

      try {
        const out: DiagnosticsResultMessage = {
          type: 'diagnosticsResult',
          requestId: msg.requestId,
          path: msg.path,
          sourceVersion: msg.sourceVersion,
          diagnostics: result.diagnostics as DiagnosticsResultMessage['diagnostics'],
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

      const result = await backend.requestFormatting({
        requestId: msg.requestId,
        path: msg.path,
        version: msg.sourceVersion,
      })

      if (!result.ok && result.error.kind === 'resync-required') {
        requestDocumentResync(msg.path)
        return
      }

      if (!result.ok && result.error.kind === 'cancelled') return

      if (!result.ok) {
        const out: FormattingErrorMessage = {
          type: 'formattingError',
          requestId: msg.requestId,
          path: msg.path,
          sourceVersion: msg.sourceVersion,
          message: result.error.message,
        }
        self.postMessage(out)
        return
      }

      try {
        const out: FormattingResultMessage = {
          type: 'formattingResult',
          requestId: msg.requestId,
          path: msg.path,
          sourceVersion: msg.sourceVersion,
          formatted: result.formatted,
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

      const result = await backend.requestHover({
        requestId: msg.requestId,
        path: msg.path,
        version: msg.sourceVersion,
        line: msg.line,
        column: msg.column,
        ...(msg.startColumn !== undefined ? { startColumn: msg.startColumn } : {}),
        ...(msg.endColumn !== undefined ? { endColumn: msg.endColumn } : {}),
      })

      if (!result.ok && result.error.kind === 'resync-required') {
        requestDocumentResync(msg.path)
        return
      }

      if (!result.ok) {
        if (result.error.kind === 'cancelled') return
        const out: HoverErrorMessage = {
          type: 'hoverError',
          requestId: msg.requestId,
          path: msg.path,
          sourceVersion: msg.sourceVersion,
          message: result.error.message,
        }
        self.postMessage(out)
        return
      }

      try {
        checkCancelled(msg.requestId)
        const out: HoverResultMessage = {
          type: 'hoverResult',
          requestId: msg.requestId,
          path: msg.path,
          sourceVersion: msg.sourceVersion,
          ...(result.inferredType ? { inferredType: result.inferredType } : {}),
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

      const result = await backend.requestCompletion({
        requestId: msg.requestId,
        path: msg.path,
        version: msg.sourceVersion,
        line: msg.line,
        column: msg.column,
        prefix: msg.prefix,
        importPrefix: msg.importPrefix,
        workspaceFiles: msg.workspaceFiles,
      })

      if (!result.ok && result.error.kind === 'resync-required') {
        requestDocumentResync(msg.path)
        return
      }

      if (!result.ok) {
        if (result.error.kind === 'cancelled') return
        const out: CompletionErrorMessage = {
          type: 'completionError',
          requestId: msg.requestId,
          path: msg.path,
          sourceVersion: msg.sourceVersion,
          message: result.error.message,
        }
        self.postMessage(out)
        return
      }

      try {
        checkCancelled(msg.requestId)
        const out: CompletionResultMessage = {
          type: 'completionResult',
          requestId: msg.requestId,
          path: msg.path,
          sourceVersion: msg.sourceVersion,
          items: result.items,
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

      const result = await backend.requestNavigation({
        requestId: msg.requestId,
        kind: msg.kind,
        path: msg.path,
        version: msg.sourceVersion,
        line: msg.line,
        column: msg.column,
        ...(msg.newName !== undefined ? { newName: msg.newName } : {}),
      })

      if (!result.ok && result.error.kind === 'resync-required') {
        requestDocumentResync(msg.path)
        return
      }

      if (!result.ok) {
        if (result.error.kind === 'cancelled') return
        const out: NavigationErrorMessage = {
          type: 'navigationError',
          requestId: msg.requestId,
          path: msg.path,
          sourceVersion: msg.sourceVersion,
          kind: msg.kind,
          message: result.error.message,
        }
        self.postMessage(out)
        return
      }

      try {
        const out: NavigationResultMessage = {
          type: 'navigationResult',
          requestId: msg.requestId,
          path: msg.path,
          sourceVersion: msg.sourceVersion,
          kind: msg.kind,
          ...(result.locations
            ? {
                locations: result.locations.map(location => ({
                  file: location.file,
                  line: location.line,
                  column: location.column,
                  endColumn: location.endColumn,
                })),
              }
            : {}),
          ...(result.edits
            ? {
                edits: result.edits.map(edit => ({
                  file: edit.file,
                  line: edit.range.startLine,
                  column: edit.range.startColumn,
                  endColumn: edit.range.endColumn,
                  text: edit.text,
                })),
              }
            : {}),
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
      await backend.cancelRequest(msg.requestId)
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
