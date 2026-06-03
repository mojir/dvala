import { describe, expect, it } from 'vitest'

import type { DvalaBackend } from '../packages/dvala-workspace-backend/src/index'
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
  BackendPersistFileRequest,
  BackendRemoveFileRequest,
  BackendSignatureHelpRequest,
  BackendSignatureHelpResult,
  BackendSessionInspectionResult,
  BackendSnapshotBindingsInspectionResult,
  BackendSnapshotInspectionResult,
  BackendSnapshotValidationResult,
  BackendSessionResumeRequest,
  BackendSessionResumeResult,
  BackendSessionStartRequest,
  BackendSessionStartResult,
  BackendTextDocument,
  BackendWorkspaceSymbolsRequest,
  BackendWorkspaceSymbolsResult,
} from '../packages/dvala-workspace-backend/src/index'
import { createBackend } from '../packages/dvala-workspace-backend/src/index'
import { BackendDiagnosticsClient } from '../vscode-dvala/src/backendDiagnosticsClient'

describe('BackendDiagnosticsClient', () => {
  it('mirrors a document and returns backend diagnostics for its version', async () => {
    const client = new BackendDiagnosticsClient(createBackend())

    await client.syncDocument({ path: 'main.dvala', source: 'let value: String = 1', version: 1 })
    const result = await client.requestDiagnostics('main.dvala', 1)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.diagnostics.some(diag => diag.source === 'dvala-types')).toBe(true)
    }
  })

  it('reopens the latest mirrored document when diagnostics request needs resync', async () => {
    const requests: BackendDiagnosticsRequest[] = []
    const opened: BackendTextDocument[] = []
    const backend = createResyncingBackend({
      requestDiagnostics: async request => {
        requests.push(request)
        if (requests.length === 1) {
          return {
            ok: false,
            requestId: request.requestId,
            path: request.path,
            version: request.version,
            error: {
              kind: 'resync-required',
              message: `Backend document mirror missing or stale for ${request.path}`,
              path: request.path,
            },
          }
        }

        return {
          ok: true,
          requestId: request.requestId,
          path: request.path,
          version: request.version,
          diagnostics: [],
        }
      },
      openDocument: async document => {
        opened.push(document)
      },
    })
    const client = new BackendDiagnosticsClient(backend)

    await client.syncDocument({ path: 'main.dvala', source: '1 + 2', version: 3 })
    const result = await client.requestDiagnostics('main.dvala', 3)

    expect(result.ok).toBe(true)
    expect(opened).toEqual([
      { path: 'main.dvala', source: '1 + 2', version: 3 },
      { path: 'main.dvala', source: '1 + 2', version: 3 },
    ])
    expect(requests).toHaveLength(2)
  })

  it('passes workspace snapshot files through to backend-owned import diagnostics', async () => {
    const client = new BackendDiagnosticsClient(createBackend())

    await client.syncWorkspaceSnapshot([{ path: 'lib.dvala', code: 'let exported = 1; { exported }' }])
    await client.syncDocument({
      path: 'main.dvala',
      source: 'let { exported } = import("./lib"); exported',
      version: 1,
    })

    const result = await client.requestDiagnostics('main.dvala', 1)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.diagnostics.filter(diag => diag.message.includes('Undefined symbol'))).toEqual([])
    }
  })

  it('returns imported hover information through the backend-backed client', async () => {
    const client = new BackendDiagnosticsClient(createBackend())

    await client.syncWorkspaceSnapshot([{ path: 'lib.dvala', code: 'let exported = 1; { exported }' }])
    await client.syncDocument({
      path: 'main.dvala',
      source: 'let { exported } = import("./lib"); exported',
      version: 1,
    })

    const result = await client.requestHover({
      path: 'main.dvala',
      source: 'let { exported } = import("./lib"); exported',
      version: 1,
      line: 1,
      column: 37,
      startColumn: 37,
      endColumn: 45,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.inferredType).toMatch(/Integer|1/)
    }
  })

  it('returns backend-owned import path completions through the client', async () => {
    const client = new BackendDiagnosticsClient(createBackend())

    await client.syncWorkspaceSnapshot([{ path: 'utils/math.dvala', code: 'let value = 1' }])
    const result = await client.requestCompletion({
      path: 'main.dvala',
      source: 'let lib = import("./u")',
      version: 1,
      line: 1,
      column: 22,
      prefix: '',
      importPrefix: './u',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ label: './utils/', detail: 'folder' }),
          expect.objectContaining({ label: './utils/math', detail: 'workspace file' }),
        ]),
      )
    }
  })

  it('returns backend-owned import definition navigation through the client', async () => {
    const client = new BackendDiagnosticsClient(createBackend())

    await client.syncWorkspaceSnapshot([{ path: 'lib.dvala', code: 'let exported = 1; { exported }' }])
    const source = 'let lib = import("./lib")'
    const result = await client.requestNavigation({
      path: 'main.dvala',
      source,
      version: 1,
      kind: 'definition',
      line: 1,
      column: 20,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.locations).toEqual([
        {
          file: 'lib.dvala',
          line: 1,
          column: 1,
          endColumn: 1,
        },
      ])
    }
  })

  it('returns backend-owned signature help through the client', async () => {
    const client = new BackendDiagnosticsClient(createBackend())

    await client.syncDocument({ path: 'main.dvala', source: 'let add = (a, b) -> a + b\nadd(', version: 1 })
    const result = await client.requestSignatureHelp({
      path: 'main.dvala',
      source: 'let add = (a, b) -> a + b\nadd(',
      version: 1,
      line: 2,
      column: 5,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.activeParameter).toBe(0)
      expect(result.signatures).toEqual([{ label: 'add(a, b)', parameters: ['a', 'b'] }])
    }
  })

  it('returns backend-owned document symbols through the client', async () => {
    const client = new BackendDiagnosticsClient(createBackend())

    await client.syncDocument({
      path: 'main.dvala',
      source: 'let answer = 42;\nlet add = (a, b) -> a + b;',
      version: 1,
    })
    const result = await client.requestDocumentSymbols({
      path: 'main.dvala',
      source: 'let answer = 42;\nlet add = (a, b) -> a + b;',
      version: 1,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.symbols).toEqual(
        expect.arrayContaining([
          { name: 'answer', kind: 'variable', line: 1, column: 5 },
          { name: 'add', kind: 'function', line: 2, column: 5 },
        ]),
      )
    }
  })

  it('returns backend-owned workspace symbols through the client', async () => {
    const client = new BackendDiagnosticsClient(createBackend())

    await client.syncWorkspaceSnapshot([{ path: 'lib.dvala', code: 'let exported = 1; { exported }' }])
    const result = await client.requestWorkspaceSymbols({ query: 'exp' })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.symbols).toEqual([{ file: 'lib.dvala', name: 'exported', kind: 'variable', line: 1, column: 5 }])
    }
  })
})

function createResyncingBackend(overrides: {
  requestDiagnostics: (request: BackendDiagnosticsRequest) => Promise<BackendDiagnosticsResult>
  openDocument?: (document: BackendTextDocument) => Promise<void>
}): DvalaBackend {
  return {
    async openDocument(document: BackendTextDocument): Promise<void> {
      await overrides.openDocument?.(document)
    },
    async updateDocument(): Promise<BackendDocumentSyncResult> {
      return { ok: true }
    },
    async closeDocument(): Promise<void> {},
    async persistFile(_: BackendPersistFileRequest): Promise<void> {},
    async removeFile(_: BackendRemoveFileRequest): Promise<void> {},
    async requestDiagnostics(request: BackendDiagnosticsRequest): Promise<BackendDiagnosticsResult> {
      return overrides.requestDiagnostics(request)
    },
    async requestFormatting(_: BackendFormattingRequest): Promise<BackendFormattingResult> {
      throw new Error('not implemented')
    },
    async requestHover(_: BackendHoverRequest): Promise<BackendHoverResult> {
      throw new Error('not implemented')
    },
    async requestSignatureHelp(_: BackendSignatureHelpRequest): Promise<BackendSignatureHelpResult> {
      throw new Error('not implemented')
    },
    async requestDocumentSymbols(_: BackendDocumentSymbolsRequest): Promise<BackendDocumentSymbolsResult> {
      throw new Error('not implemented')
    },
    async requestWorkspaceSymbols(_: BackendWorkspaceSymbolsRequest): Promise<BackendWorkspaceSymbolsResult> {
      throw new Error('not implemented')
    },
    async requestCompletion(_: BackendCompletionRequest): Promise<BackendCompletionResult> {
      throw new Error('not implemented')
    },
    async requestNavigation(_: BackendNavigationRequest): Promise<BackendNavigationResult> {
      throw new Error('not implemented')
    },
    async startSession(_: BackendSessionStartRequest): Promise<BackendSessionStartResult> {
      throw new Error('not implemented')
    },
    async resumeSnapshot(_: BackendSessionResumeRequest): Promise<BackendSessionResumeResult> {
      throw new Error('not implemented')
    },
    async inspectSnapshot(): Promise<BackendSnapshotInspectionResult> {
      return {
        ok: true,
        requestId: 102,
        checkpointSnapshots: [],
      }
    },
    async inspectSnapshotBindings(): Promise<BackendSnapshotBindingsInspectionResult> {
      return {
        ok: true,
        requestId: 103,
        bindings: {},
      }
    },
    async validateSnapshot(): Promise<BackendSnapshotValidationResult> {
      return {
        ok: false,
        requestId: 104,
        error: {
          kind: 'invalid-request',
          message: 'not implemented',
        },
      }
    },
    async inspectSession(): Promise<BackendSessionInspectionResult> {
      return { ok: true, sessionId: 'test', status: 'missing' }
    },
    async stopSession(): Promise<void> {},
    async cancelRequest(): Promise<BackendCancelResult> {
      return { ok: true }
    },
  }
}
