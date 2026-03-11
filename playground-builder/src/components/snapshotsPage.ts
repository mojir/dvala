import { styles } from '../styles'
import { pageLayout } from './pageLayout'

export function getSnapshotsPage(): string {
  const content = `
      <div id="snapshots-content" ${styles('flex', 'flex-col', 'gap-4')}>
        <div id="snapshots-clear-all" style="display: flex; justify-content: flex-end; visibility: hidden;">
          <button class="button" onclick="Playground.clearUnlockedSnapshots()" ${styles('bg-gray-700', 'text-color-gray-400', 'font-sans')}>Clear all unlocked</button>
        </div>
        <div id="snapshots-list" ${styles('flex', 'flex-col', 'gap-3')}>
          <!-- Populated dynamically -->
        </div>
      </div>
      <div id="snapshots-empty" ${styles('text-center', 'text-color-gray-400', 'py-2')}>
        No saved snapshots
      </div>
  `
  return pageLayout('snapshots-page', 'Snapshots', content)
}
