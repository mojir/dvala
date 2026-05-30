import { createBackend } from '@mojir/dvala-workspace-backend'
import type { DvalaBackend } from '@mojir/dvala-workspace-backend'
import { createDvala } from '@mojir/dvala-core-tooling'
import type {
  BackendCompletionRequest,
  BackendCompletionResult,
  BackendDiagnosticsResult,
  BackendDocumentSymbolsRequest,
  BackendDocumentSymbolsResult,
  BackendHoverRequest,
  BackendHoverResult,
  BackendNavigationRequest,
  BackendNavigationResult,
  BackendSignatureHelpRequest,
  BackendSignatureHelpResult,
  BackendTextDocument,
  BackendWorkspaceSnapshotFile,
  BackendWorkspaceSymbolsRequest,
  BackendWorkspaceSymbolsResult,
} from '../../packages/dvala-workspace-backend/src/index'

export class BackendDiagnosticsClient {
  private readonly backend: DvalaBackend
  private nextRequestId = 1
  private readonly mirroredDocuments = new Map<string, BackendTextDocument>()

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

  async replaceWorkspaceSnapshot(files: readonly BackendWorkspaceSnapshotFile[]): Promise<void> {
    await this.backend.replaceWorkspaceSnapshot({ files })
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

  async requestWorkspaceSymbols(
    request: Omit<BackendWorkspaceSymbolsRequest, 'requestId'>,
  ): Promise<BackendWorkspaceSymbolsResult> {
    return this.backend.requestWorkspaceSymbols({
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
