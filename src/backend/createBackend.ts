import { allBuiltinModules } from '../allModules'
import { parseToAst } from '../parser'
import { buildParseDiagnostics, buildTypeDiagnostics } from '../shared/diagnosticBuilder'
import { minifyTokenStream } from '../tokenizer/minifyTokenStream'
import { formatSource } from '../tooling'
import { tokenizeSource, parseTokenStreamRecoverable } from '../tooling'
import { typecheck } from '../typechecker/typecheck'

import type { DvalaBackend } from './DvalaBackend'
import { createInMemoryDocumentStore, type BackendDocumentStore } from './documentStore'
import type {
  BackendCancelResult,
  BackendCompletionRequest,
  BackendCompletionResult,
  BackendDiagnosticsRequest,
  BackendDiagnosticsResult,
  BackendFormattingRequest,
  BackendFormattingResult,
  BackendHoverRequest,
  BackendHoverResult,
  BackendNavigationRequest,
  BackendNavigationResult,
  BackendRequestFailure,
  BackendSessionInspectionResult,
  BackendSessionResumeRequest,
  BackendSessionResumeResult,
  BackendSessionStartRequest,
  BackendSessionStartResult,
  BackendTextDocument,
} from './requests'

export interface CreateBackendOptions {
  documents?: BackendDocumentStore
}

function clearCancelledRequest(cancelledRequests: Map<number, boolean>, requestId: number): void {
  cancelledRequests.delete(requestId)
}

function requestFailure(
  requestId: number,
  error: BackendRequestFailure['error'],
  path?: string,
  version?: number,
): BackendRequestFailure {
  return {
    ok: false,
    requestId,
    ...(path ? { path } : {}),
    ...(version !== undefined ? { version } : {}),
    error,
  }
}

function isCancelled(cancelledRequests: Map<number, boolean>, requestId: number): boolean {
  return cancelledRequests.get(requestId) === true
}

function computeTypecheckResult(source: string, path: string) {
  const tokens = tokenizeSource(source, true, path)
  try {
    const minified = minifyTokenStream(tokens, { removeWhiteSpace: true })
    const ast = parseToAst(minified)
    return typecheck(ast, { modules: allBuiltinModules })
  } catch {
    return { diagnostics: [], typeMap: new Map(), sourceMap: undefined }
  }
}

async function unimplementedAnalysis(
  requestId: number,
  path: string,
  version: number,
  operation: string,
): Promise<BackendRequestFailure> {
  return requestFailure(
    requestId,
    {
      kind: 'invalid-request',
      message: `Backend operation not implemented yet: ${operation}`,
      path,
    },
    path,
    version,
  )
}

export function createBackend(options: CreateBackendOptions = {}): DvalaBackend {
  const documents = options.documents ?? createInMemoryDocumentStore()
  const cancelledRequests = new Map<number, boolean>()

  return {
    async openDocument(document: BackendTextDocument): Promise<void> {
      documents.open(document)
    },

    async updateDocument(document: BackendTextDocument, previousVersion: number) {
      return documents.update(document, previousVersion)
    },

    async closeDocument(path: string): Promise<void> {
      documents.close(path)
    },

    async replaceWorkspaceSnapshot(request): Promise<void> {
      documents.replaceWorkspaceSnapshot(request)
    },

    async requestDiagnostics(request: BackendDiagnosticsRequest): Promise<BackendDiagnosticsResult> {
      const openDocument = documents.getOpenDocument(request.path)
      if (!openDocument || openDocument.version !== request.version) {
        return requestFailure(
          request.requestId,
          {
            kind: 'resync-required',
            message: `Backend document mirror missing or stale for ${request.path}`,
            path: request.path,
          },
          request.path,
          request.version,
        )
      }

      try {
        const tokenStream = tokenizeSource(openDocument.source, true, openDocument.path)
        const parseResult = parseTokenStreamRecoverable(tokenStream)
        const parseDiagnostics = buildParseDiagnostics(parseResult.errors)
        if (isCancelled(cancelledRequests, request.requestId)) {
          clearCancelledRequest(cancelledRequests, request.requestId)
          return requestFailure(
            request.requestId,
            { kind: 'cancelled', message: 'Backend diagnostics request cancelled', path: request.path },
            request.path,
            request.version,
          )
        }

        const typecheckResult = computeTypecheckResult(openDocument.source, openDocument.path)
        const typeDiagnostics = buildTypeDiagnostics(typecheckResult)
        if (isCancelled(cancelledRequests, request.requestId)) {
          clearCancelledRequest(cancelledRequests, request.requestId)
          return requestFailure(
            request.requestId,
            { kind: 'cancelled', message: 'Backend diagnostics request cancelled', path: request.path },
            request.path,
            request.version,
          )
        }

        clearCancelledRequest(cancelledRequests, request.requestId)
        return {
          ok: true,
          requestId: request.requestId,
          path: request.path,
          version: request.version,
          diagnostics: [...parseDiagnostics, ...typeDiagnostics],
        }
      } catch (error) {
        clearCancelledRequest(cancelledRequests, request.requestId)
        return requestFailure(
          request.requestId,
          {
            kind: 'analysis-failed',
            message: error instanceof Error ? error.message : `${error}`,
            path: request.path,
          },
          request.path,
          request.version,
        )
      }
    },

    async requestFormatting(request: BackendFormattingRequest): Promise<BackendFormattingResult> {
      try {
        if (isCancelled(cancelledRequests, request.requestId)) {
          clearCancelledRequest(cancelledRequests, request.requestId)
          return requestFailure(
            request.requestId,
            { kind: 'cancelled', message: 'Backend formatting request cancelled', path: request.path },
            request.path,
            request.version,
          )
        }

        const formatted = formatSource(request.source)
        if (isCancelled(cancelledRequests, request.requestId)) {
          clearCancelledRequest(cancelledRequests, request.requestId)
          return requestFailure(
            request.requestId,
            { kind: 'cancelled', message: 'Backend formatting request cancelled', path: request.path },
            request.path,
            request.version,
          )
        }

        clearCancelledRequest(cancelledRequests, request.requestId)
        return {
          ok: true,
          requestId: request.requestId,
          path: request.path,
          version: request.version,
          formatted,
        }
      } catch (error) {
        clearCancelledRequest(cancelledRequests, request.requestId)
        return requestFailure(
          request.requestId,
          {
            kind: 'analysis-failed',
            message: error instanceof Error ? error.message : `${error}`,
            path: request.path,
          },
          request.path,
          request.version,
        )
      }
    },

    async requestHover(request: BackendHoverRequest): Promise<BackendHoverResult> {
      return unimplementedAnalysis(request.requestId, request.path, request.version, 'requestHover')
    },

    async requestCompletion(request: BackendCompletionRequest): Promise<BackendCompletionResult> {
      return unimplementedAnalysis(request.requestId, request.path, request.version, 'requestCompletion')
    },

    async requestNavigation(request: BackendNavigationRequest): Promise<BackendNavigationResult> {
      return unimplementedAnalysis(request.requestId, request.path, request.version, 'requestNavigation')
    },

    async startSession(request: BackendSessionStartRequest): Promise<BackendSessionStartResult> {
      return requestFailure(
        request.requestId,
        {
          kind: 'invalid-request',
          message: 'Backend operation not implemented yet: startSession',
          ...(request.path ? { path: request.path } : {}),
        },
        request.path,
      )
    },

    async resumeSnapshot(request: BackendSessionResumeRequest): Promise<BackendSessionResumeResult> {
      return requestFailure(request.requestId, {
        kind: 'invalid-request',
        message: 'Backend operation not implemented yet: resumeSnapshot',
      })
    },

    async inspectSession(sessionId: string): Promise<BackendSessionInspectionResult> {
      return {
        ok: true,
        sessionId,
        status: 'missing',
      }
    },

    async stopSession(_sessionId: string): Promise<void> {},

    async cancelRequest(requestId: number): Promise<BackendCancelResult> {
      cancelledRequests.set(requestId, true)
      return { ok: true }
    },
  }
}
