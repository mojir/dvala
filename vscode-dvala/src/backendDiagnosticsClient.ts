import { createBackend } from '@mojir/dvala-workspace-backend'
import type { DvalaBackend } from '@mojir/dvala-workspace-backend'
import { createDvala } from '@mojir/dvala-core-tooling'
import type {
  BackendCompletionRequest,
  BackendCompletionResult,
  BackendDiagnosticsResult,
  BackendDocumentSymbolsRequest,
  BackendDocumentSymbolsResult,
  BackendFormattingRequest,
  BackendFormattingResult,
  BackendHoverRequest,
  BackendHoverResult,
  BackendNavigationRequest,
  BackendNavigationResult,
  BackendSessionStartRequest,
  BackendSessionStartResult,
  BackendCallHierarchyIncomingCallsRequest,
  BackendCallHierarchyIncomingCallsResult,
  BackendCallHierarchyOutgoingCallsRequest,
  BackendCallHierarchyOutgoingCallsResult,
  BackendCallHierarchyPrepareRequest,
  BackendCallHierarchyPrepareResult,
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
  BackendTextDocument,
  BackendWorkspaceSnapshotFile,
  BackendWorkspaceSymbolsRequest,
  BackendWorkspaceSymbolsResult,
} from '../../packages/dvala-workspace-backend/src/index'

export class BackendDiagnosticsClient {
  private readonly backend: DvalaBackend
  private nextRequestId = 1
  private readonly mirroredDocuments = new Map<string, BackendTextDocument>()
  // Mirrors what the backend currently has, so syncWorkspaceSnapshot sends
  // only the diff (persistFile / removeFile) rather than re-uploading the
  // whole workspace on every refresh.
  private lastSyncedSnapshot = new Map<string, string>()

  constructor(backend: DvalaBackend = createBackend({ createDvala })) {
    this.backend = backend
  }

  async syncDocument(document: BackendTextDocument): Promise<void> {
    const current = this.mirroredDocuments.get(document.path)
    if (current && current.version === document.version && current.source === document.source) return

    if (!current) {
      await this.backend.openDocument(document)
      this.mirroredDocuments.set(document.path, document)
      return
    }

    const result = await this.backend.updateDocument(document, current.version)
    if (!result.ok) {
      await this.backend.openDocument(document)
    }

    this.mirroredDocuments.set(document.path, document)
  }

  async closeDocument(path: string): Promise<void> {
    this.mirroredDocuments.delete(path)
    await this.backend.closeDocument(path)
  }

  async syncWorkspaceSnapshot(files: readonly BackendWorkspaceSnapshotFile[]): Promise<void> {
    const next = new Map(files.map(file => [file.path, file.code]))

    for (const path of this.lastSyncedSnapshot.keys()) {
      if (!next.has(path)) {
        await this.backend.removeFile({ path })
      }
    }

    for (const [path, code] of next) {
      if (this.lastSyncedSnapshot.get(path) !== code) {
        await this.backend.persistFile({ file: { path, code } })
      }
    }

    this.lastSyncedSnapshot = next
  }

  async requestDiagnostics(path: string, version: number): Promise<BackendDiagnosticsResult> {
    let result = await this.backend.requestDiagnostics({
      requestId: this.createRequestId(),
      path,
      version,
    })

    if (result.ok || result.error.kind !== 'resync-required') return result

    const mirrored = this.mirroredDocuments.get(path)
    if (!mirrored || mirrored.version !== version) return result

    await this.backend.openDocument(mirrored)
    result = await this.backend.requestDiagnostics({
      requestId: this.createRequestId(),
      path,
      version,
    })

    return result
  }

  async requestHover(request: Omit<BackendHoverRequest, 'requestId'>): Promise<BackendHoverResult> {
    return this.backend.requestHover({
      requestId: this.createRequestId(),
      ...request,
    })
  }

  async requestCompletion(request: Omit<BackendCompletionRequest, 'requestId'>): Promise<BackendCompletionResult> {
    return this.backend.requestCompletion({
      requestId: this.createRequestId(),
      ...request,
    })
  }

  async requestNavigation(request: Omit<BackendNavigationRequest, 'requestId'>): Promise<BackendNavigationResult> {
    return this.backend.requestNavigation({
      requestId: this.createRequestId(),
      ...request,
    })
  }

  async requestSignatureHelp(
    request: Omit<BackendSignatureHelpRequest, 'requestId'>,
  ): Promise<BackendSignatureHelpResult> {
    return this.backend.requestSignatureHelp({
      requestId: this.createRequestId(),
      ...request,
    })
  }

  async requestDocumentSymbols(
    request: Omit<BackendDocumentSymbolsRequest, 'requestId'>,
  ): Promise<BackendDocumentSymbolsResult> {
    return this.backend.requestDocumentSymbols({
      requestId: this.createRequestId(),
      ...request,
    })
  }

  async requestSemanticTokens(
    request: Omit<BackendSemanticTokensRequest, 'requestId'>,
  ): Promise<BackendSemanticTokensResult> {
    return this.backend.requestSemanticTokens({
      requestId: this.createRequestId(),
      ...request,
    })
  }

  async requestInlayHints(request: Omit<BackendInlayHintsRequest, 'requestId'>): Promise<BackendInlayHintsResult> {
    return this.backend.requestInlayHints({
      requestId: this.createRequestId(),
      ...request,
    })
  }

  async requestSelectionRange(
    request: Omit<BackendSelectionRangeRequest, 'requestId'>,
  ): Promise<BackendSelectionRangeResult> {
    return this.backend.requestSelectionRange({
      requestId: this.createRequestId(),
      ...request,
    })
  }

  async requestCodeActions(request: Omit<BackendCodeActionsRequest, 'requestId'>): Promise<BackendCodeActionsResult> {
    return this.backend.requestCodeActions({
      requestId: this.createRequestId(),
      ...request,
    })
  }

  async requestCallHierarchyPrepare(
    request: Omit<BackendCallHierarchyPrepareRequest, 'requestId'>,
  ): Promise<BackendCallHierarchyPrepareResult> {
    return this.backend.requestCallHierarchyPrepare({
      requestId: this.createRequestId(),
      ...request,
    })
  }

  async requestCallHierarchyIncomingCalls(
    request: Omit<BackendCallHierarchyIncomingCallsRequest, 'requestId'>,
  ): Promise<BackendCallHierarchyIncomingCallsResult> {
    return this.backend.requestCallHierarchyIncomingCalls({
      requestId: this.createRequestId(),
      ...request,
    })
  }

  async requestCallHierarchyOutgoingCalls(
    request: Omit<BackendCallHierarchyOutgoingCallsRequest, 'requestId'>,
  ): Promise<BackendCallHierarchyOutgoingCallsResult> {
    return this.backend.requestCallHierarchyOutgoingCalls({
      requestId: this.createRequestId(),
      ...request,
    })
  }

  async requestSymbolAtPosition(
    request: Omit<BackendSymbolAtPositionRequest, 'requestId'>,
  ): Promise<BackendSymbolAtPositionResult> {
    return this.backend.requestSymbolAtPosition({
      requestId: this.createRequestId(),
      ...request,
    })
  }

  async requestWorkspaceSymbols(
    request: Omit<BackendWorkspaceSymbolsRequest, 'requestId'>,
  ): Promise<BackendWorkspaceSymbolsResult> {
    return this.backend.requestWorkspaceSymbols({
      requestId: this.createRequestId(),
      ...request,
    })
  }

  async requestFormatting(request: Omit<BackendFormattingRequest, 'requestId'>): Promise<BackendFormattingResult> {
    return this.backend.requestFormatting({
      requestId: this.createRequestId(),
      ...request,
    })
  }

  async startSession(request: Omit<BackendSessionStartRequest, 'requestId'>): Promise<BackendSessionStartResult> {
    return this.backend.startSession({
      requestId: this.createRequestId(),
      ...request,
    })
  }

  private createRequestId(): number {
    const requestId = this.nextRequestId
    this.nextRequestId += 1
    return requestId
  }
}
