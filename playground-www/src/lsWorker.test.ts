import { beforeEach, describe, expect, it, vi } from 'vitest'

type WorkerMessage = Record<string, unknown>

type FakeWorkerGlobal = {
  onmessage: ((event: MessageEvent<WorkerMessage>) => void | Promise<void>) | null
  postMessage: ReturnType<typeof vi.fn>
}

function makeWorkerGlobal(): FakeWorkerGlobal {
  return {
    onmessage: null,
    postMessage: vi.fn(),
  }
}

async function loadWorker(): Promise<FakeWorkerGlobal> {
  vi.resetModules()
  const fakeSelf = makeWorkerGlobal()
  vi.stubGlobal('self', fakeSelf)
  await import('./lsWorker')
  return fakeSelf
}

async function dispatch(worker: FakeWorkerGlobal, message: WorkerMessage): Promise<void> {
  await worker.onmessage?.(new MessageEvent<WorkerMessage>('message', { data: message }))
}

describe('lsWorker document sync', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('requests resync when an update arrives before a document mirror exists', async () => {
    const worker = await loadWorker()

    await dispatch(worker, {
      type: 'updateDocument',
      path: 'main.dvala',
      source: 'let x = 1',
      sourceVersion: 2,
      previousSourceVersion: 1,
    })

    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'resyncDocument', path: 'main.dvala' })
  })

  it('requests resync when an update version does not match the mirrored version', async () => {
    const worker = await loadWorker()

    await dispatch(worker, {
      type: 'openDocument',
      path: 'main.dvala',
      source: 'let x = 1',
      sourceVersion: 3,
    })
    worker.postMessage.mockClear()

    await dispatch(worker, {
      type: 'updateDocument',
      path: 'main.dvala',
      source: 'let x = 2',
      sourceVersion: 5,
      previousSourceVersion: 4,
    })

    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'resyncDocument', path: 'main.dvala' })
  })

  it('requests resync instead of empty diagnostics when no mirror exists', async () => {
    const worker = await loadWorker()

    await dispatch(worker, {
      type: 'requestDiagnostics',
      requestId: 1,
      path: 'main.dvala',
      sourceVersion: 1,
    })

    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'resyncDocument', path: 'main.dvala' })
    expect(worker.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'diagnosticsResult',
        path: 'main.dvala',
      }),
    )
  })

  it('accepts an ordered update and serves diagnostics from the latest mirror', async () => {
    const worker = await loadWorker()

    await dispatch(worker, {
      type: 'openDocument',
      path: 'main.dvala',
      source: 'let x = 1',
      sourceVersion: 3,
    })

    await dispatch(worker, {
      type: 'updateDocument',
      path: 'main.dvala',
      source: 'let x = 2',
      sourceVersion: 4,
      previousSourceVersion: 3,
    })

    worker.postMessage.mockClear()

    await dispatch(worker, {
      type: 'requestDiagnostics',
      requestId: 1,
      path: 'main.dvala',
      sourceVersion: 4,
    })

    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'diagnosticsResult',
        path: 'main.dvala',
        sourceVersion: 4,
      }),
    )
    expect(worker.postMessage).not.toHaveBeenCalledWith({ type: 'resyncDocument', path: 'main.dvala' })
  })

  it('formats a source snapshot and returns a formatting result', async () => {
    const worker = await loadWorker()

    await dispatch(worker, {
      type: 'requestFormatting',
      requestId: 1,
      path: 'main.dvala',
      source: '1',
      sourceVersion: 3,
    })

    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'formattingResult',
        requestId: 1,
        path: 'main.dvala',
        sourceVersion: 3,
        formatted: expect.any(String),
      }),
    )
  })

  it('computes hover through the backend and returns a hover result', async () => {
    const worker = await loadWorker()

    await dispatch(worker, {
      type: 'requestHover',
      requestId: 6,
      path: 'main.dvala',
      source: 'let answer = 42',
      sourceVersion: 4,
      line: 1,
      column: 5,
    })

    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'hoverResult',
        requestId: 6,
        path: 'main.dvala',
        sourceVersion: 4,
        inferredType: expect.stringMatching(/Integer|42/),
      }),
    )
  })

  it('resolves definition and rename navigation from a workspace snapshot', async () => {
    const worker = await loadWorker()

    await dispatch(worker, {
      type: 'requestNavigation',
      requestId: 2,
      kind: 'definition',
      path: 'main.dvala',
      source: 'let answer = 42; answer',
      sourceVersion: 3,
      line: 1,
      column: 19,
      workspaceFiles: [],
    })

    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'navigationResult',
        requestId: 2,
        kind: 'definition',
        locations: [
          expect.objectContaining({
            file: 'main.dvala',
            line: 1,
            column: 5,
          }),
        ],
      }),
    )

    worker.postMessage.mockClear()

    await dispatch(worker, {
      type: 'requestNavigation',
      requestId: 3,
      kind: 'rename',
      path: 'main.dvala',
      source: 'let answer = 42; answer',
      sourceVersion: 3,
      line: 1,
      column: 19,
      newName: 'result',
      workspaceFiles: [],
    })

    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'navigationResult',
        requestId: 3,
        kind: 'rename',
        edits: expect.arrayContaining([expect.objectContaining({ file: 'main.dvala', text: 'result' })]),
      }),
    )
  })

  it('deduplicates completion labels across local scope and imported exports', async () => {
    const worker = await loadWorker()

    await dispatch(worker, {
      type: 'requestCompletion',
      requestId: 4,
      path: 'main.dvala',
      source: 'let value = 1\nlet lib = import("./lib")\nval',
      sourceVersion: 2,
      line: 3,
      column: 4,
      prefix: 'val',
      importPrefix: null,
      workspaceFiles: [{ path: 'lib.dvala', code: 'let value = 2\n{ value }' }],
    })

    const completionMessage = worker.postMessage.mock.calls.find(call => call[0]?.type === 'completionResult')?.[0] as {
      items: { label: string }[]
    }
    expect(completionMessage).toEqual(
      expect.objectContaining({
        type: 'completionResult',
        requestId: 4,
      }),
    )
    expect(completionMessage.items.filter(item => item.label === 'value')).toHaveLength(1)
  })

  it('resolves cross-file rename from the imported file content in the request snapshot', async () => {
    const worker = await loadWorker()

    await dispatch(worker, {
      type: 'requestNavigation',
      requestId: 5,
      kind: 'rename',
      path: 'main.dvala',
      source: 'let { fresh } = import("./lib"); fresh',
      sourceVersion: 3,
      line: 1,
      column: 7,
      newName: 'renamed',
      workspaceFiles: [{ path: 'lib.dvala', code: 'let fresh = 1\n{ fresh }' }],
    })

    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'navigationResult',
        requestId: 5,
        kind: 'rename',
        edits: expect.arrayContaining([
          expect.objectContaining({ file: 'lib.dvala', text: 'renamed' }),
          expect.objectContaining({ file: 'main.dvala', text: 'renamed' }),
        ]),
      }),
    )
  })
})
