import type { CompletionItem, Diagnostic } from '../../../dvala-core-tooling/src'

export interface PlaygroundWorkspaceSnapshotFile {
  path: string
  code: string
}

export type PlaygroundNavigationRequestKind = 'definition' | 'references' | 'rename'

export interface PlaygroundOpenDocumentMessage {
  type: 'openDocument'
  path: string
  source: string
  sourceVersion: number
}

export interface PlaygroundUpdateDocumentMessage {
  type: 'updateDocument'
  path: string
  source: string
  sourceVersion: number
  previousSourceVersion: number
}

export interface PlaygroundCloseDocumentMessage {
  type: 'closeDocument'
  path: string
}

export interface PlaygroundReplaceWorkspaceSnapshotMessage {
  type: 'replaceWorkspaceSnapshot'
  files: PlaygroundWorkspaceSnapshotFile[]
}

export interface PlaygroundRequestDiagnosticsMessage {
  type: 'requestDiagnostics'
  requestId: number
  path: string
  sourceVersion: number
}

export interface PlaygroundRequestFormattingMessage {
  type: 'requestFormatting'
  requestId: number
  path: string
  sourceVersion: number
}

export interface PlaygroundRequestHoverMessage {
  type: 'requestHover'
  requestId: number
  path: string
  sourceVersion: number
  line: number
  column: number
  startColumn?: number
  endColumn?: number
}

export interface PlaygroundRequestCompletionMessage {
  type: 'requestCompletion'
  requestId: number
  path: string
  sourceVersion: number
  line: number
  column: number
  prefix: string
  importPrefix: string | null
  workspaceFiles: PlaygroundWorkspaceSnapshotFile[]
}

export interface PlaygroundRequestNavigationMessage {
  type: 'requestNavigation'
  requestId: number
  path: string
  sourceVersion: number
  kind: PlaygroundNavigationRequestKind
  line: number
  column: number
  newName?: string
}

export interface PlaygroundCancelRequestMessage {
  type: 'cancelRequest'
  requestId: number
}

export type PlaygroundWorkerInMessage =
  | PlaygroundOpenDocumentMessage
  | PlaygroundUpdateDocumentMessage
  | PlaygroundCloseDocumentMessage
  | PlaygroundReplaceWorkspaceSnapshotMessage
  | PlaygroundRequestDiagnosticsMessage
  | PlaygroundRequestFormattingMessage
  | PlaygroundRequestHoverMessage
  | PlaygroundRequestCompletionMessage
  | PlaygroundRequestNavigationMessage
  | PlaygroundCancelRequestMessage

export interface PlaygroundDiagnosticsResultMessage {
  type: 'diagnosticsResult'
  requestId: number
  path: string
  sourceVersion: number
  diagnostics: (Diagnostic & { readonly severity: 'error' | 'warning' | 'info'; readonly source: string })[]
}

export interface PlaygroundDiagnosticsErrorMessage {
  type: 'diagnosticsError'
  requestId: number
  path: string
  sourceVersion: number
  message: string
}

export interface PlaygroundFormattingResultMessage {
  type: 'formattingResult'
  requestId: number
  path: string
  sourceVersion: number
  formatted: string
}

export interface PlaygroundFormattingErrorMessage {
  type: 'formattingError'
  requestId: number
  path: string
  sourceVersion: number
  message: string
}

export interface PlaygroundHoverResultMessage {
  type: 'hoverResult'
  requestId: number
  path: string
  sourceVersion: number
  inferredType?: string
}

export interface PlaygroundHoverErrorMessage {
  type: 'hoverError'
  requestId: number
  path: string
  sourceVersion: number
  message: string
}

export interface PlaygroundCompletionResultMessage {
  type: 'completionResult'
  requestId: number
  path: string
  sourceVersion: number
  items: CompletionItem[]
}

export interface PlaygroundCompletionErrorMessage {
  type: 'completionError'
  requestId: number
  path: string
  sourceVersion: number
  message: string
}

export interface PlaygroundNavigationLocationPayload {
  file: string
  line: number
  column: number
  endColumn: number
}

export interface PlaygroundNavigationRenameEditPayload extends PlaygroundNavigationLocationPayload {
  text: string
}

export interface PlaygroundNavigationResultMessage {
  type: 'navigationResult'
  requestId: number
  path: string
  sourceVersion: number
  kind: PlaygroundNavigationRequestKind
  locations?: PlaygroundNavigationLocationPayload[]
  edits?: PlaygroundNavigationRenameEditPayload[]
}

export interface PlaygroundNavigationErrorMessage {
  type: 'navigationError'
  requestId: number
  path: string
  sourceVersion: number
  kind: PlaygroundNavigationRequestKind
  message: string
}

export interface PlaygroundResyncDocumentMessage {
  type: 'resyncDocument'
  path: string
}

export type PlaygroundWorkerOutMessage =
  | PlaygroundDiagnosticsResultMessage
  | PlaygroundDiagnosticsErrorMessage
  | PlaygroundFormattingResultMessage
  | PlaygroundFormattingErrorMessage
  | PlaygroundHoverResultMessage
  | PlaygroundHoverErrorMessage
  | PlaygroundCompletionResultMessage
  | PlaygroundCompletionErrorMessage
  | PlaygroundNavigationResultMessage
  | PlaygroundNavigationErrorMessage
  | PlaygroundResyncDocumentMessage
