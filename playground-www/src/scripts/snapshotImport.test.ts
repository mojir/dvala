import { describe, expect, it, vi } from 'vitest'

import type { Snapshot } from '../../../src/evaluator/effectTypes'
import { importSnapshotFromJsonText } from './snapshotImport'

function makeSnapshot(): Snapshot {
  return {
    id: 'snapshot-1',
    continuation: { __suspensionBlob: true, version: 2, contextStacks: [], k: [] },
    timestamp: 0,
    index: 0,
    executionId: 'run-1',
    message: 'snapshot',
  }
}

describe('importSnapshotFromJsonText', () => {
  it('opens the imported snapshot tab after backend validation succeeds', async () => {
    const snapshot = makeSnapshot()
    const validateSnapshot = vi.fn(async () => snapshot)
    const saveAndOpenSnapshotTab = vi.fn()
    const showInfoModal = vi.fn(async () => {})

    await importSnapshotFromJsonText(JSON.stringify(snapshot), {
      validateSnapshot,
      saveAndOpenSnapshotTab,
      showInfoModal,
    })

    expect(validateSnapshot).toHaveBeenCalledWith({ value: snapshot })
    expect(saveAndOpenSnapshotTab).toHaveBeenCalledWith(snapshot, 'halted', 'Snapshot imported')
    expect(saveAndOpenSnapshotTab).toHaveBeenCalledTimes(1)
    expect(showInfoModal).not.toHaveBeenCalled()
  })

  it('shows the invalid snapshot modal when backend validation rejects the parsed JSON', async () => {
    const validateSnapshot = vi.fn(async () => {
      throw new Error('Not a valid snapshot object.')
    })
    const saveAndOpenSnapshotTab = vi.fn()
    const showInfoModal = vi.fn(async () => {})

    await importSnapshotFromJsonText(
      JSON.stringify({
        id: 'snapshot-1',
        continuation: {},
        timestamp: 0,
        index: 0,
        executionId: 'run-1',
        message: 'snapshot',
      }),
      {
        validateSnapshot,
        saveAndOpenSnapshotTab,
        showInfoModal,
      },
    )

    expect(saveAndOpenSnapshotTab).not.toHaveBeenCalled()
    expect(showInfoModal).toHaveBeenCalledWith('Import failed', 'Not a valid snapshot object.')
  })

  it('shows the invalid JSON modal when the file content cannot be parsed', async () => {
    const validateSnapshot = vi.fn()
    const saveAndOpenSnapshotTab = vi.fn()
    const showInfoModal = vi.fn(async () => {})

    await importSnapshotFromJsonText('{', {
      validateSnapshot,
      saveAndOpenSnapshotTab,
      showInfoModal,
    })

    expect(validateSnapshot).not.toHaveBeenCalled()
    expect(saveAndOpenSnapshotTab).not.toHaveBeenCalled()
    expect(showInfoModal).toHaveBeenCalledWith('Import failed', 'Invalid JSON — could not parse the file.')
  })
})