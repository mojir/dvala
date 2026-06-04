import type {
  BackendCancelResult,
  BackendCompletionRequest,
  BackendCompletionResult,
  BackendDocumentVersion,
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
  BackendPersistFileRequest,
  BackendRemoveFileRequest,
  BackendCodeActionsRequest,
  BackendCodeActionsResult,
  BackendInlayHintsRequest,
  BackendInlayHintsResult,
  BackendSelectionRangeRequest,
  BackendSelectionRangeResult,
  BackendSemanticTokensRequest,
  BackendSemanticTokensResult,
  BackendSignatureHelpRequest,
  BackendSignatureHelpResult,
  BackendSymbolAtPositionRequest,
  BackendSymbolAtPositionResult,
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
  BackendRequestId,
  BackendTextDocument,
  BackendWorkspaceSymbolsRequest,
  BackendWorkspaceSymbolsResult,
} from './requests'

export interface DvalaBackend {
  openDocument(document: BackendTextDocument): Promise<void>
  updateDocument(
    document: BackendTextDocument,
    previousVersion: BackendDocumentVersion,
  ): Promise<BackendDocumentSyncResult>
  closeDocument(path: string): Promise<void>
  persistFile(request: BackendPersistFileRequest): Promise<void>
  removeFile(request: BackendRemoveFileRequest): Promise<void>

  requestDiagnostics(request: BackendDiagnosticsRequest): Promise<BackendDiagnosticsResult>
  requestFormatting(request: BackendFormattingRequest): Promise<BackendFormattingResult>
  requestHover(request: BackendHoverRequest): Promise<BackendHoverResult>
  requestSignatureHelp(request: BackendSignatureHelpRequest): Promise<BackendSignatureHelpResult>
  requestDocumentSymbols(request: BackendDocumentSymbolsRequest): Promise<BackendDocumentSymbolsResult>
  requestCodeActions(request: BackendCodeActionsRequest): Promise<BackendCodeActionsResult>
  requestInlayHints(request: BackendInlayHintsRequest): Promise<BackendInlayHintsResult>
  requestSelectionRange(request: BackendSelectionRangeRequest): Promise<BackendSelectionRangeResult>
  requestSemanticTokens(request: BackendSemanticTokensRequest): Promise<BackendSemanticTokensResult>
  requestSymbolAtPosition(request: BackendSymbolAtPositionRequest): Promise<BackendSymbolAtPositionResult>
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

  cancelRequest(requestId: BackendRequestId): Promise<BackendCancelResult>
}
