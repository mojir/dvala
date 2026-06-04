// =============================================================================
// Backend request / result contract — transport-stable surface.
//
// Every type exported from this file is part of the contract that flows across
// the backend boundary: worker-protocol adapters, LSP, custom RPC, and direct
// in-process consumers (CLI, VS Code extension, playground). Adding,
// renaming, or reshaping anything here is a transport-visible change.
//
// Anything backend-internal (handler-specific state, intermediate caches,
// runtime adapter shapes) stays in `createBackend.ts` / `runtime/` and is
// translated to one of these shapes before crossing the boundary.
//
// Outcome envelope (canonical):
//   - Correlated operations (have a `requestId`): return
//     `{ ok: true, requestId, ...payload } | BackendRequestFailure`.
//   - Uncorrelated operations (document sync, session inspection): return
//     `{ ok: true, ...payload } | BackendFailure`. BackendFailure carries
//     `error` but no `requestId` because the operation isn't request-numbered.
//   - `BackendAccepted` is the uncorrelated success counterpart (just
//     `{ ok: true }`), used by `BackendDocumentSyncResult`.
//
// Error kinds are a finite, locked set — see `BACKEND_REQUEST_ERROR_KINDS`.
// Producing a new kind requires extending that array; clients that switch on
// `error.kind` rely on it being exhaustive.
// =============================================================================

import type { RuntimeHandlers, RuntimeRunResult, RuntimeSnapshot } from '@mojir/dvala-runtime'

import type { CompletionItem, Diagnostic, DvalaBundle } from '@mojir/dvala-core-tooling'

export type BackendRequestId = number

export type BackendDocumentVersion = number

// Request IDs are caller-generated correlation tokens that must be unique among in-flight requests.
// Backends use them for cancellation and stale-result suppression.

export interface BackendTextDocument {
  path: string
  source: string
  version: BackendDocumentVersion
}

export interface BackendWorkspaceSnapshotFile {
  path: string
  code: string
}

export const BACKEND_REQUEST_ERROR_KINDS = [
  'cancelled',
  'invalid-request',
  'analysis-failed',
  'runtime-failed',
  'resync-required',
  'session-not-found',
] as const

export type BackendRequestErrorKind = (typeof BACKEND_REQUEST_ERROR_KINDS)[number]

export interface BackendRequestError {
  kind: BackendRequestErrorKind
  message: string
  path?: string
}

export interface BackendFailure {
  ok: false
  error: BackendRequestError
}

export interface BackendRequestFailure extends BackendFailure {
  requestId: BackendRequestId
}

export interface BackendAccepted {
  ok: true
}

export type BackendDocumentSyncResult = BackendAccepted | BackendFailure

// Document update invariants:
// - openDocument seeds the canonical source/version mirror.
// - updateDocument requires previousVersion to match the backend mirror.
// - mismatch returns resync-required; callers must re-open with a fresh snapshot.

export interface BackendPersistFileRequest {
  file: BackendWorkspaceSnapshotFile
}

export interface BackendRemoveFileRequest {
  path: string
}

export interface BackendDiagnosticsRequest {
  requestId: BackendRequestId
  path: string
  version: BackendDocumentVersion
}

export type BackendPortableDiagnostic = Diagnostic & {
  readonly severity: 'error' | 'warning' | 'info'
  readonly source: string
}

export type BackendDiagnosticsResult =
  | {
      ok: true
      requestId: BackendRequestId
      path: string
      version: BackendDocumentVersion
      diagnostics: BackendPortableDiagnostic[]
    }
  | BackendRequestFailure

export interface BackendFormattingRequest {
  requestId: BackendRequestId
  path: string
  source?: string
  version: BackendDocumentVersion
}

export type BackendFormattingResult =
  | {
      ok: true
      requestId: BackendRequestId
      path: string
      version: BackendDocumentVersion
      formatted: string
    }
  | BackendRequestFailure

export interface BackendHoverRequest {
  requestId: BackendRequestId
  path: string
  source?: string
  version: BackendDocumentVersion
  line: number
  column: number
  startColumn?: number
  endColumn?: number
}

export type BackendHoverResult =
  | {
      ok: true
      requestId: BackendRequestId
      path: string
      version: BackendDocumentVersion
      inferredType?: string
    }
  | BackendRequestFailure

export interface BackendSignatureHelpRequest {
  requestId: BackendRequestId
  path: string
  source: string
  version: BackendDocumentVersion
  line: number
  column: number
}

export interface BackendSignatureHelpSignature {
  label: string
  parameters: readonly string[]
}

export type BackendSignatureHelpResult =
  | {
      ok: true
      requestId: BackendRequestId
      path: string
      version: BackendDocumentVersion
      activeParameter: number
      signatures: readonly BackendSignatureHelpSignature[]
    }
  | BackendRequestFailure

export type BackendSymbolKind = 'variable' | 'function' | 'macro' | 'handler' | 'parameter' | 'import'

export interface BackendDocumentSymbol {
  name: string
  kind: BackendSymbolKind
  line: number
  column: number
}

export interface BackendWorkspaceSymbol extends BackendDocumentSymbol {
  file: string
}

export interface BackendDocumentSymbolsRequest {
  requestId: BackendRequestId
  path: string
  source: string
  version: BackendDocumentVersion
}

export type BackendDocumentSymbolsResult =
  | {
      ok: true
      requestId: BackendRequestId
      path: string
      version: BackendDocumentVersion
      symbols: readonly BackendDocumentSymbol[]
    }
  | BackendRequestFailure

export interface BackendSymbolAtPositionRequest {
  requestId: BackendRequestId
  path: string
  source?: string
  version: BackendDocumentVersion
  line: number
  column: number
}

export interface BackendSymbolAtPosition {
  name: string
  onKey?: boolean
}

export type BackendSymbolAtPositionResult =
  | {
      ok: true
      requestId: BackendRequestId
      path: string
      version: BackendDocumentVersion
      symbol?: BackendSymbolAtPosition
    }
  | BackendRequestFailure

// Portable semantic-token shape — one entry per identifier occurrence in the
// document. The VS Code adapter encodes these into LSP's delta-line / delta-
// char integer stream before handing to `DocumentSemanticTokensProvider`.
// The `tokenType` set is the union of LSP standard types we actually emit;
// new types extend it. Modifiers stay simple (just `declaration` for now —
// the `def site` vs `reference site` distinction is what the editor uses to
// theme declarations differently).
export type BackendSemanticTokenType = 'variable' | 'function' | 'macro' | 'parameter' | 'namespace'

export type BackendSemanticTokenModifier = 'declaration'

export interface BackendSemanticToken {
  line: number // 1-based — the VS Code adapter converts to 0-based + delta-encodes
  startColumn: number // 1-based
  length: number
  tokenType: BackendSemanticTokenType
  modifiers: readonly BackendSemanticTokenModifier[]
}

export interface BackendSemanticTokensRequest {
  requestId: BackendRequestId
  path: string
  source?: string
  version: BackendDocumentVersion
}

export type BackendSemanticTokensResult =
  | {
      ok: true
      requestId: BackendRequestId
      path: string
      version: BackendDocumentVersion
      tokens: readonly BackendSemanticToken[]
    }
  | BackendRequestFailure

// Inlay hint — a non-editable label rendered inline at a source position.
// v1 emits parameter-name hints at call sites: `add(/*a:*/ 1, /*b:*/ 2)`.
// Type-decorated labels (`/*a: Number:*/ 1`) reuse this shape and are a
// follow-up once we want the extra column real estate.
export interface BackendInlayHint {
  line: number // 1-based
  column: number // 1-based, the hint renders before this position
  label: string
}

export interface BackendInlayHintsRequest {
  requestId: BackendRequestId
  path: string
  source?: string
  version: BackendDocumentVersion
}

export type BackendInlayHintsResult =
  | {
      ok: true
      requestId: BackendRequestId
      path: string
      version: BackendDocumentVersion
      hints: readonly BackendInlayHint[]
    }
  | BackendRequestFailure

export interface BackendWorkspaceSymbolsRequest {
  requestId: BackendRequestId
  query: string
}

export type BackendWorkspaceSymbolsResult =
  | {
      ok: true
      requestId: BackendRequestId
      symbols: readonly BackendWorkspaceSymbol[]
    }
  | BackendRequestFailure

export interface BackendSnapshotInspectionRequest {
  requestId: BackendRequestId
  snapshot: RuntimeSnapshot
}

export type BackendSnapshotInspectionResult =
  | {
      ok: true
      requestId: BackendRequestId
      checkpointSnapshots: readonly RuntimeSnapshot[]
    }
  | BackendRequestFailure

export interface BackendSnapshotBindingsInspectionRequest {
  requestId: BackendRequestId
  snapshot: RuntimeSnapshot
}

export type BackendSnapshotBindingsInspectionResult =
  | {
      ok: true
      requestId: BackendRequestId
      bindings: Readonly<Record<string, unknown>>
    }
  | BackendRequestFailure

export interface BackendSnapshotValidationRequest {
  requestId: BackendRequestId
  value: unknown
}

export type BackendSnapshotValidationResult =
  | {
      ok: true
      requestId: BackendRequestId
      snapshot: RuntimeSnapshot
    }
  | BackendRequestFailure

export interface BackendCompletionRequest {
  requestId: BackendRequestId
  path: string
  source?: string
  version: BackendDocumentVersion
  line: number
  column: number
  prefix: string
  importPrefix: string | null
}

export type BackendCompletionResult =
  | {
      ok: true
      requestId: BackendRequestId
      path: string
      version: BackendDocumentVersion
      items: CompletionItem[]
    }
  | BackendRequestFailure

export type BackendNavigationKind = 'definition' | 'references' | 'rename'

export interface BackendNavigationLocation {
  file: string
  line: number
  column: number
  endColumn: number
}

export interface BackendNavigationEditRange {
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
}

export interface BackendNavigationEdit {
  file: string
  text: string
  range: BackendNavigationEditRange
}

export interface BackendNavigationRequest {
  requestId: BackendRequestId
  path: string
  source?: string
  version: BackendDocumentVersion
  kind: BackendNavigationKind
  line: number
  column: number
  newName?: string
}

export type BackendNavigationResult =
  | {
      ok: true
      requestId: BackendRequestId
      path: string
      version: BackendDocumentVersion
      kind: BackendNavigationKind
      locations?: readonly BackendNavigationLocation[]
      edits?: readonly BackendNavigationEdit[]
    }
  | BackendRequestFailure

export interface BackendSessionStartRequest {
  requestId: BackendRequestId
  path?: string
  source: string | DvalaBundle
  /** Initial JS-level bindings to seed the session with. */
  scope?: Record<string, unknown>
  effectHandlers?: RuntimeHandlers
  debug?: boolean
  pure?: boolean
  disableAutoCheckpoint?: boolean
  terminalSnapshot?: boolean
}

export type BackendSessionStartResult =
  | {
      ok: true
      requestId: BackendRequestId
      sessionId: string
      runResult: RuntimeRunResult
    }
  | BackendRequestFailure

export interface BackendSessionResumeRequest {
  requestId: BackendRequestId
  snapshot: RuntimeSnapshot
  value?: unknown
  effectHandlers?: RuntimeHandlers
  disableAutoCheckpoint?: boolean
  terminalSnapshot?: boolean
}

export type BackendSessionResumeResult =
  | {
      ok: true
      requestId: BackendRequestId
      sessionId: string
      runResult: RuntimeRunResult
    }
  | BackendRequestFailure

export type BackendSessionStatus = 'running' | 'suspended' | 'completed' | 'failed'

export type BackendSessionInspectionResult =
  | {
      ok: true
      sessionId: string
      status: BackendSessionStatus
      lastUpdatedAt?: number
    }
  | BackendFailure

export interface BackendCancelResult {
  ok: true
  requestId: BackendRequestId
}
