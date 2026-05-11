import type {
  BackendCancelResult,
  BackendCompletionRequest,
  BackendCompletionResult,
  BackendDiagnosticsRequest,
  BackendDiagnosticsResult,
  BackendDocumentSymbolsRequest,
  BackendDocumentSymbolsResult,
  BackendDocumentSyncResult,
  BackendFormattingRequest,
  BackendFormattingResult,
  BackendHoverRequest,
  BackendHoverResult,
  BackendNavigationRequest,
  BackendNavigationResult,
  BackendReplaceWorkspaceSnapshotRequest,
  BackendSignatureHelpRequest,
  BackendSignatureHelpResult,
  BackendSnapshotInspectionRequest,
  BackendSnapshotInspectionResult,
  BackendSnapshotBindingsInspectionRequest,
  BackendSnapshotBindingsInspectionResult,
  BackendSessionInspectionResult,
  BackendSessionResumeRequest,
  BackendSessionResumeResult,
  BackendSessionStartRequest,
  BackendSessionStartResult,
  BackendSnapshotValidationRequest,
  BackendSnapshotValidationResult,
  BackendTextDocument,
  BackendWorkspaceSymbolsRequest,
  BackendWorkspaceSymbolsResult,
} from './requests'

export interface DvalaBackend {
  openDocument(document: BackendTextDocument): Promise<void>
  updateDocument(document: BackendTextDocument, previousVersion: number): Promise<BackendDocumentSyncResult>
  closeDocument(path: string): Promise<void>
  replaceWorkspaceSnapshot(request: BackendReplaceWorkspaceSnapshotRequest): Promise<void>

  requestDiagnostics(request: BackendDiagnosticsRequest): Promise<BackendDiagnosticsResult>
  requestFormatting(request: BackendFormattingRequest): Promise<BackendFormattingResult>
  requestHover(request: BackendHoverRequest): Promise<BackendHoverResult>
  requestSignatureHelp(request: BackendSignatureHelpRequest): Promise<BackendSignatureHelpResult>
  requestDocumentSymbols(request: BackendDocumentSymbolsRequest): Promise<BackendDocumentSymbolsResult>
  requestWorkspaceSymbols(request: BackendWorkspaceSymbolsRequest): Promise<BackendWorkspaceSymbolsResult>
  requestCompletion(request: BackendCompletionRequest): Promise<BackendCompletionResult>
  requestNavigation(request: BackendNavigationRequest): Promise<BackendNavigationResult>

  startSession(request: BackendSessionStartRequest): Promise<BackendSessionStartResult>
  resumeSnapshot(request: BackendSessionResumeRequest): Promise<BackendSessionResumeResult>
  inspectSnapshot(request: BackendSnapshotInspectionRequest): Promise<BackendSnapshotInspectionResult>
  inspectSnapshotBindings(
    request: BackendSnapshotBindingsInspectionRequest,
  ): Promise<BackendSnapshotBindingsInspectionResult>
  validateSnapshot(request: BackendSnapshotValidationRequest): Promise<BackendSnapshotValidationResult>
  inspectSession(sessionId: string): Promise<BackendSessionInspectionResult>
  stopSession(sessionId: string): Promise<void>

  cancelRequest(requestId: number): Promise<BackendCancelResult>
}
