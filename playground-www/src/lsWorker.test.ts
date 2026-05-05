import { beforeEach, describe, expect, it, vi } from 'vitest'

type WorkerMessage = Record<string, unknown>

type FakeWorkerGlobal = {
  onmessage: ((event: MessageEvent<WorkerMessage>) => void) | null
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

function dispatch(worker: FakeWorkerGlobal, message: WorkerMessage): void {
  worker.onmessage?.(new MessageEvent<WorkerMessage>('message', { data: message }))
}

describe('lsWorker document sync', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('requests resync when an update arrives before a document mirror exists', async () => {
    const worker = await loadWorker()

    dispatch(worker, {
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

    dispatch(worker, {
      type: 'openDocument',
      path: 'main.dvala',
      source: 'let x = 1',
      sourceVersion: 3,
    })
    worker.postMessage.mockClear()

    dispatch(worker, {
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

    dispatch(worker, {
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

    dispatch(worker, {
      type: 'openDocument',
      path: 'main.dvala',
      source: 'let x = 1',
      sourceVersion: 3,
    })

    dispatch(worker, {
      type: 'updateDocument',
      path: 'main.dvala',
      source: 'let x = 2',
      sourceVersion: 4,
      previousSourceVersion: 3,
    })

    worker.postMessage.mockClear()

    dispatch(worker, {
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
})
