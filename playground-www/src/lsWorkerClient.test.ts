import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as LsWorkerClientModule from './lsWorkerClient'

type WorkerMessage = Record<string, unknown>

const workerInstances: FakeWorker[] = []
const setModelMarkers = vi.fn()

class FakeWorker {
  public messages: WorkerMessage[] = []
  public onerror: ((event: Event) => void) | null = null
  public onmessage: ((event: MessageEvent) => void) | null = null
  public terminate = vi.fn()

  constructor() {
    workerInstances.push(this)
  }

  postMessage(message: WorkerMessage): void {
    this.messages.push(message)
  }
}

vi.mock('monaco-editor', () => {
  const monaco = {
    MarkerSeverity: { Error: 8, Warning: 4, Info: 2 },
    Uri: {
      parse: (value: string) => ({
        toString: () => value,
      }),
    },
    editor: {
      setModelMarkers,
      getModelMarkers: () => [],
    },
    languages: {
      registerHoverProvider: vi.fn(),
      registerCompletionItemProvider: vi.fn(),
      registerSignatureHelpProvider: vi.fn(),
      registerDefinitionProvider: vi.fn(),
      registerReferenceProvider: vi.fn(),
      registerRenameProvider: vi.fn(),
      registerDocumentFormattingEditProvider: vi.fn(),
      registerDocumentRangeFormattingEditProvider: vi.fn(),
      CompletionItemKind: {
        Function: 1,
        Method: 2,
        Event: 3,
        Module: 4,
        Class: 5,
        Keyword: 6,
        Operator: 7,
        Variable: 8,
      },
      CompletionItemInsertTextRule: {
        InsertAsSnippet: 4,
      },
    },
  }

  return {
    ...monaco,
    default: monaco,
  }
})

vi.mock('./lsWorker?worker', () => ({
  default: FakeWorker,
}))

vi.mock('./fileStorage', () => ({
  getWorkspaceFiles: () => [],
}))

type StubModel = {
  getValue: () => string
  getVersionId: () => number
  getFullModelRange: () => {
    startLineNumber: number
    startColumn: number
    endLineNumber: number
    endColumn: number
  }
  uri: { toString: () => string }
}

function makeModel(source: string, version: number, uri = `inmemory://${version}`): StubModel {
  return {
    getValue: () => source,
    getVersionId: () => version,
    getFullModelRange: () => ({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: Math.max(1, source.length + 1),
    }),
    uri: { toString: () => uri },
  }
}

let client: typeof LsWorkerClientModule

beforeEach(async () => {
  vi.resetModules()
  workerInstances.length = 0
  setModelMarkers.mockReset()
  client = await import('./lsWorkerClient')
})

function dispatchWorkerMessage(index: number, message: WorkerMessage): void {
  workerInstances[index]?.onmessage?.(new MessageEvent<WorkerMessage>('message', { data: message }))
}

describe('lsWorkerClient lifecycle', () => {
  it('registerModel opens the document mirror in the worker immediately', () => {
    const model = makeModel('let x = 1', 3)

    client.registerModel('main.dvala', model as never)

    expect(workerInstances).toHaveLength(1)
    expect(workerInstances[0]!.messages).toEqual([
      {
        type: 'openDocument',
        path: 'main.dvala',
        source: 'let x = 1',
        sourceVersion: 3,
      },
    ])
  })

  it('unregisterModel sends closeDocument to the active worker', () => {
    const model = makeModel('let x = 1', 1)

    client.registerModel('main.dvala', model as never)
    client.unregisterModel('main.dvala')

    expect(workerInstances).toHaveLength(1)
    expect(workerInstances[0]!.messages.at(-1)).toEqual({ type: 'closeDocument', path: 'main.dvala' })
  })

  it('reseeds registered models before diagnostics after worker restart', () => {
    const model = makeModel('let x = 1', 5)

    client.registerModel('main.dvala', model as never)
    const firstWorker = workerInstances[0]!

    client.restartWorkerForTesting()
    expect(firstWorker.terminate).toHaveBeenCalledTimes(1)

    client.requestDiagnosticsForTesting('main.dvala', 5)

    expect(workerInstances).toHaveLength(2)
    expect(workerInstances[1]!.messages).toEqual([
      {
        type: 'openDocument',
        path: 'main.dvala',
        source: 'let x = 1',
        sourceVersion: 5,
      },
      {
        type: 'requestDiagnostics',
        requestId: 1,
        path: 'main.dvala',
        sourceVersion: 5,
      },
    ])
  })

  it('sends ordered updates with the previously mirrored source version', () => {
    const model = makeModel('let x = 1', 3)

    client.registerModel('main.dvala', model as never)
    client.updateDocument('main.dvala', 'let x = 2', 4)

    expect(workerInstances[0]!.messages.at(-1)).toEqual({
      type: 'updateDocument',
      path: 'main.dvala',
      source: 'let x = 2',
      sourceVersion: 4,
      previousSourceVersion: 3,
    })
  })

  it('resends the full model when the worker requests a resync', () => {
    const model = makeModel('let x = 1', 3)

    client.registerModel('main.dvala', model as never)
    workerInstances[0]!.messages.length = 0

    dispatchWorkerMessage(0, { type: 'resyncDocument', path: 'main.dvala' })

    expect(workerInstances[0]!.messages).toEqual([
      {
        type: 'openDocument',
        path: 'main.dvala',
        source: 'let x = 1',
        sourceVersion: 3,
      },
    ])
  })

  it('retries pending diagnostics after the worker requests a resync', () => {
    const model = makeModel('let x = 1', 3)

    client.registerModel('main.dvala', model as never)
    client.requestDiagnosticsForTesting('main.dvala', 3)
    workerInstances[0]!.messages.length = 0

    dispatchWorkerMessage(0, { type: 'resyncDocument', path: 'main.dvala' })

    expect(workerInstances[0]!.messages).toEqual([
      {
        type: 'openDocument',
        path: 'main.dvala',
        source: 'let x = 1',
        sourceVersion: 3,
      },
      {
        type: 'cancelRequest',
        requestId: 1,
      },
      {
        type: 'requestDiagnostics',
        requestId: 2,
        path: 'main.dvala',
        sourceVersion: 3,
      },
    ])
  })

  it('coalesces duplicate resync requests for the same model version and pending diagnostics state', () => {
    const model = makeModel('let x = 1', 3)

    client.registerModel('main.dvala', model as never)
    client.requestDiagnosticsForTesting('main.dvala', 3)
    workerInstances[0]!.messages.length = 0

    dispatchWorkerMessage(0, { type: 'resyncDocument', path: 'main.dvala' })
    dispatchWorkerMessage(0, { type: 'resyncDocument', path: 'main.dvala' })

    expect(workerInstances[0]!.messages).toEqual([
      {
        type: 'openDocument',
        path: 'main.dvala',
        source: 'let x = 1',
        sourceVersion: 3,
      },
      {
        type: 'cancelRequest',
        requestId: 1,
      },
      {
        type: 'requestDiagnostics',
        requestId: 2,
        path: 'main.dvala',
        sourceVersion: 3,
      },
    ])
  })

  it('starts a fresh resync cycle after a local edit changes the model version mid-recovery', () => {
    let currentSource = 'let x = 1'
    let currentVersion = 3
    const model = {
      getValue: () => currentSource,
      getVersionId: () => currentVersion,
      uri: { toString: () => 'inmemory://resync-overlap' },
    }

    client.registerModel('main.dvala', model as never)
    client.requestDiagnosticsForTesting('main.dvala', 3)
    workerInstances[0]!.messages.length = 0

    dispatchWorkerMessage(0, { type: 'resyncDocument', path: 'main.dvala' })

    currentSource = 'let x = 2'
    currentVersion = 4
    client.updateDocument('main.dvala', currentSource, currentVersion)

    dispatchWorkerMessage(0, { type: 'resyncDocument', path: 'main.dvala' })

    expect(workerInstances[0]!.messages).toEqual([
      {
        type: 'openDocument',
        path: 'main.dvala',
        source: 'let x = 1',
        sourceVersion: 3,
      },
      {
        type: 'cancelRequest',
        requestId: 1,
      },
      {
        type: 'requestDiagnostics',
        requestId: 2,
        path: 'main.dvala',
        sourceVersion: 3,
      },
      {
        type: 'updateDocument',
        path: 'main.dvala',
        source: 'let x = 2',
        sourceVersion: 4,
        previousSourceVersion: 3,
      },
      {
        type: 'openDocument',
        path: 'main.dvala',
        source: 'let x = 2',
        sourceVersion: 4,
      },
      {
        type: 'cancelRequest',
        requestId: 2,
      },
      {
        type: 'requestDiagnostics',
        requestId: 3,
        path: 'main.dvala',
        sourceVersion: 4,
      },
    ])
  })

  it('drops stale diagnostics results whose requestId is no longer pending for the path', () => {
    const model = makeModel('let x = 1', 3)

    client.registerModel('main.dvala', model as never)
    client.requestDiagnosticsForTesting('main.dvala', 3)
    client.requestDiagnosticsForTesting('main.dvala', 3)

    dispatchWorkerMessage(0, {
      type: 'diagnosticsResult',
      requestId: 1,
      path: 'main.dvala',
      sourceVersion: 3,
      diagnostics: [
        {
          message: 'stale result',
          severity: 'error',
          source: 'dvala',
          range: {
            start: { line: 1, column: 1 },
            end: { line: 1, column: 2 },
          },
        },
      ],
    })

    expect(setModelMarkers).not.toHaveBeenCalled()

    dispatchWorkerMessage(0, {
      type: 'diagnosticsResult',
      requestId: 2,
      path: 'main.dvala',
      sourceVersion: 3,
      diagnostics: [
        {
          message: 'fresh result',
          severity: 'warning',
          source: 'dvala',
          range: {
            start: { line: 1, column: 1 },
            end: { line: 1, column: 2 },
          },
        },
      ],
    })

    expect(setModelMarkers).toHaveBeenCalledTimes(1)
    expect(setModelMarkers).toHaveBeenCalledWith(
      model,
      'dvala',
      expect.arrayContaining([
        expect.objectContaining({
          message: 'fresh result',
          severity: 4,
        }),
      ]),
    )
  })

  it('formats through the worker and resolves a full-document edit', async () => {
    const model = makeModel('let   x', 3)

    client.registerModel('main.dvala', model as never)
    const editsPromise = client.getFormattingEditsForTesting(model as never)

    expect(workerInstances[0]!.messages.at(-1)).toEqual({
      type: 'requestFormatting',
      requestId: 1,
      path: 'main.dvala',
      source: 'let   x',
      sourceVersion: 3,
    })

    dispatchWorkerMessage(0, {
      type: 'formattingResult',
      requestId: 1,
      path: 'main.dvala',
      sourceVersion: 3,
      formatted: 'let x',
    })

    await expect(editsPromise).resolves.toEqual([
      {
        range: model.getFullModelRange(),
        text: 'let x',
      },
    ])
  })

  it('drops stale formatting results whose requestId is no longer pending for the path', async () => {
    const model = makeModel('let   x', 3)

    client.registerModel('main.dvala', model as never)
    const firstPromise = client.getFormattingEditsForTesting(model as never)
    const secondPromise = client.getFormattingEditsForTesting(model as never)

    dispatchWorkerMessage(0, {
      type: 'formattingResult',
      requestId: 1,
      path: 'main.dvala',
      sourceVersion: 3,
      formatted: 'stale',
    })

    dispatchWorkerMessage(0, {
      type: 'formattingResult',
      requestId: 2,
      path: 'main.dvala',
      sourceVersion: 3,
      formatted: 'fresh',
    })

    await expect(firstPromise).resolves.toEqual([])
    await expect(secondPromise).resolves.toEqual([
      {
        range: model.getFullModelRange(),
        text: 'fresh',
      },
    ])
  })

  it('resolves definition requests through the worker', async () => {
    const model = makeModel('let answer = 42; answer', 3)
    const position: { lineNumber: number; column: number } = { lineNumber: 1, column: 19 }

    client.registerModel('main.dvala', model as never)
    const defsPromise = client.getDefinitionsForTesting('main.dvala', position as never)

    expect(workerInstances[0]!.messages.at(-1)).toEqual({
      type: 'requestNavigation',
      requestId: 1,
      kind: 'definition',
      path: 'main.dvala',
      source: 'let answer = 42; answer',
      sourceVersion: 3,
      line: 1,
      column: 19,
      workspaceFiles: [],
    })

    dispatchWorkerMessage(0, {
      type: 'navigationResult',
      requestId: 1,
      kind: 'definition',
      path: 'main.dvala',
      sourceVersion: 3,
      locations: [{ file: 'main.dvala', line: 1, column: 5, endColumn: 11 }],
    })

    await expect(defsPromise).resolves.toEqual([
      {
        uri: { toString: expect.any(Function) },
        range: {
          startLineNumber: 1,
          startColumn: 5,
          endLineNumber: 1,
          endColumn: 11,
        },
      },
    ])
  })

  it('drops stale rename results whose requestId is no longer pending for the path', async () => {
    const model = makeModel('let answer = 42; answer', 3)
    const position: { lineNumber: number; column: number } = { lineNumber: 1, column: 19 }

    client.registerModel('main.dvala', model as never)
    const firstPromise = client.getRenameEditsForTesting('main.dvala', position as never, 'old')
    const secondPromise = client.getRenameEditsForTesting('main.dvala', position as never, 'fresh')

    dispatchWorkerMessage(0, {
      type: 'navigationResult',
      requestId: 1,
      kind: 'rename',
      path: 'main.dvala',
      sourceVersion: 3,
      edits: [{ file: 'main.dvala', line: 1, column: 5, endColumn: 11, text: 'old' }],
    })

    dispatchWorkerMessage(0, {
      type: 'navigationResult',
      requestId: 2,
      kind: 'rename',
      path: 'main.dvala',
      sourceVersion: 3,
      edits: [{ file: 'main.dvala', line: 1, column: 5, endColumn: 11, text: 'fresh' }],
    })

    await expect(firstPromise).resolves.toBeNull()
    await expect(secondPromise).resolves.toEqual({
      edits: [
        {
          resource: { toString: expect.any(Function) },
          textEdit: {
            range: {
              startLineNumber: 1,
              startColumn: 5,
              endLineNumber: 1,
              endColumn: 11,
            },
            text: 'fresh',
          },
          versionId: undefined,
        },
      ],
    })
  })
})
