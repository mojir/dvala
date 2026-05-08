/**
 * Tooling-only introspection entry point. NOT part of the stable public API
 * — breaking changes are allowed without notice.
 *
 * What lives here: engine internals that tooling consumers (the playground,
 * the LS Web Worker, future LSP servers) need to read but end users of the
 * `dvala` package should never depend on. AST node types, walkers, type-
 * system internals, snapshot/replay machinery, evaluator hooks, the
 * typechecker — all fair game.
 *
 * **Worker safety rule:** nothing exported from this module may transitively
 * import DOM APIs, `window`, `document`, or any browser-only module. The LS
 * worker imports from here; a DOM dependency breaks the worker bundle.
 *
 * See `design/active/2026-04-26_playground-monaco-tree-ls-cli.md` for the
 * two-surface API discipline.
 */

// ── Typechecker ──────────────────────────────────────────────────────────
// Needed by the LS worker (diagnostics, hover) and the playground
// (typecheck-and-report).
export { typecheck, typecheckExpr } from './typechecker/typecheck'
export type { TypeDiagnostic, TypecheckResult } from './typechecker/typecheck'

// ── Language service ─────────────────────────────────────────────────────
// WorkspaceIndex is pure data manipulation (zero filesystem/path access)
// and is safe to import from a Web Worker.
export { WorkspaceIndex } from './languageService/WorkspaceIndex'
export type { ResolveImport } from './languageService/WorkspaceIndex'

// ── Backend boundary ─────────────────────────────────────────────────────
// Root-internal backend API surface for worker/server adapters. Not part of
// the stable public package API.
export type { DvalaBackend } from './backend/DvalaBackend'
export { createBackend } from './backend/createBackend'
export type { CreateBackendOptions } from './backend/createBackend'
export type {
  PlaygroundCancelRequestMessage,
  PlaygroundCloseDocumentMessage,
  PlaygroundCompletionErrorMessage,
  PlaygroundCompletionResultMessage,
  PlaygroundDiagnosticsErrorMessage,
  PlaygroundDiagnosticsResultMessage,
  PlaygroundFormattingErrorMessage,
  PlaygroundFormattingResultMessage,
  PlaygroundHoverErrorMessage,
  PlaygroundHoverResultMessage,
  PlaygroundNavigationErrorMessage,
  PlaygroundNavigationLocationPayload,
  PlaygroundNavigationRenameEditPayload,
  PlaygroundNavigationRequestKind,
  PlaygroundNavigationResultMessage,
  PlaygroundOpenDocumentMessage,
  PlaygroundRequestCompletionMessage,
  PlaygroundRequestDiagnosticsMessage,
  PlaygroundRequestFormattingMessage,
  PlaygroundRequestHoverMessage,
  PlaygroundRequestNavigationMessage,
  PlaygroundResyncDocumentMessage,
  PlaygroundUpdateDocumentMessage,
  PlaygroundWorkerInMessage,
  PlaygroundWorkerOutMessage,
  PlaygroundWorkspaceSnapshotFile,
} from './backend/adapters/playgroundWorkerProtocol'
export { createInMemoryDocumentStore } from './backend/documentStore'
export type { BackendDocumentStore, BackendOpenDocument } from './backend/documentStore'
export type {
  BackendAccepted,
  BackendCancelResult,
  BackendCompletionRequest,
  BackendCompletionResult,
  BackendDiagnosticsRequest,
  BackendDiagnosticsResult,
  BackendDocumentSyncResult,
  BackendDocumentVersion,
  BackendFormattingRequest,
  BackendFormattingResult,
  BackendHoverRequest,
  BackendHoverResult,
  BackendNavigationEdit,
  BackendNavigationEditRange,
  BackendNavigationKind,
  BackendNavigationLocation,
  BackendNavigationRequest,
  BackendNavigationResult,
  BackendPortableDiagnostic,
  BackendReplaceWorkspaceSnapshotRequest,
  BackendRequestError,
  BackendRequestErrorKind,
  BackendRequestFailure,
  BackendRequestId,
  BackendResyncRequired,
  BackendSessionInspectionResult,
  BackendSessionResumeRequest,
  BackendSessionResumeResult,
  BackendSessionStartRequest,
  BackendSessionStartResult,
  BackendTextDocument,
  BackendWorkspaceSnapshotFile,
} from './backend/requests'
