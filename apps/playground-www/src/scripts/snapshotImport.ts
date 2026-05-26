import type { Snapshot } from '../../../../src'

import type { TerminalSnapshotEntry } from '../snapshotStorage'

interface SnapshotImportDeps {
  validateSnapshot(args: { value: unknown }): Promise<Snapshot>
  saveAndOpenSnapshotTab(snapshot: Snapshot, resultType: TerminalSnapshotEntry['resultType'], toast?: string): void
  showInfoModal(title: string, message: string): Promise<void>
}

export async function importSnapshotFromJsonText(jsonText: string, deps: SnapshotImportDeps): Promise<void> {
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    await deps.showInfoModal('Import failed', 'Invalid JSON — could not parse the file.')
    return
  }

  try {
    const snapshot = await deps.validateSnapshot({ value: parsed })
    deps.saveAndOpenSnapshotTab(snapshot, 'halted', 'Snapshot imported')
  } catch {
    await deps.showInfoModal('Import failed', 'Not a valid snapshot object.')
  }
}