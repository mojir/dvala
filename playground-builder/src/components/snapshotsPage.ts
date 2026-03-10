import { styles } from '../styles'

export function getSnapshotsPage(): string {
  return `
  <div id="snapshots-page" class="content">
    <div ${styles('mb-6', 'p-4', 'bg-gray-800', 'text-color-gray-300')}>
      <div ${styles('text-3xl', 'mb-6', 'text-center')}>Snapshots</div>
      <div ${styles('flex', 'flex-col', 'gap-4', 'max-width: 600px;', 'margin: 0 auto;')}>
        <div id="snapshots-clear-all" style="display: flex; justify-content: flex-end; visibility: hidden;">
          <button class="button" onclick="Playground.clearUnlockedSnapshots()" ${styles('bg-gray-700', 'text-color-gray-400', 'font-sans')}>Clear all unlocked</button>
        </div>
        <div id="snapshots-list" ${styles('flex', 'flex-col', 'gap-3')}>
          <!-- Populated dynamically -->
        </div>
        <div id="snapshots-empty" ${styles('text-center', 'text-color-gray-400', 'py-8')}>
          No saved snapshots
        </div>
      </div>
    </div>
  </div>
  `
}
