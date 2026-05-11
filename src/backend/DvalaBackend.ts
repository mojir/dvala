import type {
  BackendCancelResult,
  BackendCompletionRequest,
  BackendCompletionResult,
  BackendDiagnosticsRequest,
  BackendDiagnosticsResult,
  BackendDocumentSyncResult,
  BackendFormattingRequest,
  BackendFormattingResult,
  BackendHoverRequest,
  BackendHoverResult,
  BackendNavigationRequest,
  BackendNavigationResult,
  BackendReplaceWorkspaceSnapshotRequest,
  BackendSessionInspectionResult,
  BackendSessionResumeRequest,
  BackendSessionResumeResult,
  BackendSessionStartRequest,
  BackendSessionStartResult,
  BackendTextDocument,
} from './requests'

export interface DvalaBackend {
  openDocument(document: BackendTextDocument): Promise<void>
  updateDocument(document: BackendTextDocument, previousVersion: number): Promise<BackendDocumentSyncResult>
  closeDocument(path: string): Promise<void>
  replaceWorkspaceSnapshot(request: BackendReplaceWorkspaceSnapshotRequest): Promise<void>

  requestDiagnostics(request: BackendDiagnosticsRequest): Promise<BackendDiagnosticsResult>
  requestFormatting(request: BackendFormattingRequest): Promise<BackendFormattingResult>
  requestHover(request: BackendHoverRequest): Promise<BackendHoverResult>
  requestCompletion(request: BackendCompletionRequest): Promise<BackendCompletionResult>
  requestNavigation(request: BackendNavigationRequest): Promise<BackendNavigationResult>

  startSession(request: BackendSessionStartRequest): Promise<BackendSessionStartResult>
  resumeSnapshot(request: BackendSessionResumeRequest): Promise<BackendSessionResumeResult>
  inspectSession(sessionId: string): Promise<BackendSessionInspectionResult>
  stopSession(sessionId: string): Promise<void>

  cancelRequest(requestId: number): Promise<BackendCancelResult>
}
