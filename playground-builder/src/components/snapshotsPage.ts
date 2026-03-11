import { styles } from '../styles'
import { addIcon, trashIcon } from '../icons'
import { pageLayout } from './pageLayout'

export function getSnapshotsPage(): string {
  const content = `
      <div style="display: flex; justify-content: flex-end; align-items: center; gap: 8px;">
        <div id="snapshots-clear-all" style="visibility: hidden;">
          <button class="toolbar-btn" onclick="Playground.clearUnlockedSnapshots()"><span style="font-size: 1.2em; display: flex; align-items: center;">${trashIcon}</span>Clear all unlocked</button>
        </div>
        <button class="toolbar-btn" onclick="Playground.openImportSnapshotModal()" title="Import snapshot"><span style="font-size: 1.2em; display: flex; align-items: center;">${addIcon}</span>Import</button>
      </div>
      <div id="snapshots-list" ${styles('flex', 'flex-col', 'gap-3')}>
        <!-- Populated dynamically -->
      </div>
      <div id="snapshots-empty" ${styles('text-center', 'text-color-gray-400', 'py-2')}>
        No saved snapshots
      </div>
  `
  return pageLayout('snapshots-page', 'Snapshots', content)
}
