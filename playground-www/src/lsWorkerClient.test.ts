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

type StubModel = {
  getValue: () => string
  getVersionId: () => number
  uri: { toString: () => string }
}

function makeModel(source: string, version: number, uri = `inmemory://${version}`): StubModel {
  return {
    getValue: () => source,
    getVersionId: () => version,
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
})
