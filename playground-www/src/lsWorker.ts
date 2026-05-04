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
import { typecheck } from '../../src/internal'
import type { TypecheckResult } from '../../src/internal'
import { buildParseDiagnostics, buildSymbolDiagnostics, buildTypeDiagnostics } from '../../src/shared/diagnosticBuilder'
import type { Diagnostic, Position } from '../../src/shared/types'
import { findTypeAtPosition, formatHoverType } from '../../src/shared/typeDisplay'

import type { Ast } from '../../src/parser/types'

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

interface RequestHoverMessage {
  type: 'requestHover'
  requestId: number
  path: string
  position: Position
}

type WorkerInMessage = UpdateDocumentMessage | RequestDiagnosticsMessage | CancelRequestMessage | RequestHoverMessage

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

interface HoverResultMessage {
  type: 'hoverResult'
  requestId: number
  path: string
  contents: string | null
}

// ── Worker state ──────────────────────────────────────────────────────────────

/** Per-file mirror buffer. */
interface FileState {
  source: string
  sourceVersion: number
  /** Cached typecheck result for hover queries (cleared on edit). */
  typecheckCache: TypecheckResult | null
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

  // Only typecheck if we have at least one statement to analyse.
  if (parseResult.body.length === 0) return diagnostics

  // Build an Ast from the recoverable parse result so typecheck can consume it.
  const ast: Ast = { body: parseResult.body, sourceMap: parseResult.sourceMap }

  // ── Typecheck ──
  let typeResult: TypecheckResult
  try {
    typeResult = typecheck(ast)
  } catch {
    // Typechecker threw (e.g. internal assertion). Don't block marker
    // updates — return whatever parse diagnostics we already collected.
    return diagnostics
  }
  checkCancelled(input.requestId)

  // Cache the typecheck result on the file state so hover queries can
  // use findTypeAtPosition without re-typechecking.
  const file = files.get(input.path)
  if (file) file.typecheckCache = typeResult

  // ── Build diagnostics ──
  diagnostics.push(...buildTypeDiagnostics(typeResult))
  diagnostics.push(
    ...buildSymbolDiagnostics(
      // Unresolved references come from tokenScan, but the full symbol
      // pass requires WorkspaceIndex — not yet worker-safe (tracked in
      // Phase 2 step 29). For now, unresolved-ref diagnostics are best-
      // effort and will be populated when WorkspaceIndex lands.
      [],
    ),
  )

  return diagnostics
}

// ── Message handler ───────────────────────────────────────────────────────────

self.onmessage = (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data

  switch (msg.type) {
    case 'updateDocument': {
      // Invalidate the typecheck cache on every edit — the next diagnostics
      // pass will re-typecheck and refresh it for hover queries.
      files.set(msg.path, { source: msg.source, sourceVersion: msg.sourceVersion, typecheckCache: null })
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
      return
    }

    case 'requestHover': {
      const file = files.get(msg.path)
      const out: HoverResultMessage = {
        type: 'hoverResult',
        requestId: msg.requestId,
        path: msg.path,
        contents: null,
      }

      if (!file || !file.typecheckCache) {
        self.postMessage(out)
        return
      }

      try {
        const tc = file.typecheckCache
        const type = findTypeAtPosition(tc.typeMap, tc.sourceMap, msg.position)
        if (!type) {
          self.postMessage(out)
          return
        }
        out.contents = formatHoverType(type)
      } catch {
        // findTypeAtPosition or formatHoverType threw — nothing to show.
      }

      self.postMessage(out)
      return
    }
  }
}
