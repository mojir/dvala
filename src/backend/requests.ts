import type { RuntimeHandlers, RuntimeRunResult, RuntimeSnapshot } from '@mojir/dvala-runtime'

import type { CompletionItem } from '../shared/completionBuilder'
import type { Diagnostic } from '../shared/types'

export type BackendRequestId = number

export type BackendDocumentVersion = number

export interface BackendTextDocument {
  path: string
  source: string
  version: BackendDocumentVersion
}

export interface BackendWorkspaceSnapshotFile {
  path: string
  code: string
}

export type BackendRequestErrorKind =
  | 'cancelled'
  | 'not-found'
  | 'invalid-request'
  | 'analysis-failed'
  | 'runtime-failed'
  | 'resync-required'

export interface BackendRequestError {
  kind: BackendRequestErrorKind
  message: string
  path?: string
}

export interface BackendRequestFailure {
  ok: false
  requestId: BackendRequestId
  path?: string
  version?: BackendDocumentVersion
  error: BackendRequestError
}

export interface BackendAccepted {
  ok: true
}

export interface BackendResyncRequired {
  ok: false
  error: {
    kind: 'resync-required'
    path: string
  }
}

export type BackendDocumentSyncResult = BackendAccepted | BackendResyncRequired

export interface BackendReplaceWorkspaceSnapshotRequest {
  files: readonly BackendWorkspaceSnapshotFile[]
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
  source: string
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
  source: string
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

export interface BackendCompletionRequest {
  requestId: BackendRequestId
  path: string
  source: string
  version: BackendDocumentVersion
  line: number
  column: number
  prefix: string
  importPrefix: string | null
  workspaceFiles?: readonly BackendWorkspaceSnapshotFile[]
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
  source: string
  version: BackendDocumentVersion
  kind: BackendNavigationKind
  line: number
  column: number
  newName?: string
  workspaceFiles?: readonly BackendWorkspaceSnapshotFile[]
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
  source: string
  effectHandlers?: RuntimeHandlers
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

export interface BackendSessionInspectionResult {
  ok: true
  sessionId: string
  status: 'running' | 'suspended' | 'completed' | 'failed' | 'missing'
  lastUpdatedAt?: number
}

export interface BackendCancelResult {
  ok: true
}
