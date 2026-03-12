import { styles } from '../styles'
import { addIcon, trashIcon } from '../icons'
import { pageLayout } from './pageLayout'

export function getSavedProgramsPage(): string {
  const content = `
      <div style="display: flex; justify-content: flex-end; align-items: center; gap: 8px;">
        <div id="saved-programs-clear-all" style="visibility: hidden;">
          <button class="toolbar-btn" onclick="Playground.clearUnlockedPrograms()"><span style="font-size: 1.2em; display: flex; align-items: center;">${trashIcon}</span>Clear all unlocked</button>
        </div>
        <button class="toolbar-btn" onclick="Playground.openImportProgramModal()" title="Import program"><span style="font-size: 1.2em; display: flex; align-items: center;">${addIcon}</span>Import</button>
      </div>
      <div id="saved-programs-list" ${styles('flex', 'flex-col', 'gap-3')}>
        <!-- Populated dynamically -->
      </div>
      <div id="saved-programs-empty" ${styles('text-center', 'text-color-gray-400', 'py-2')}>
        No saved programs
      </div>
  `
  return pageLayout('saved-programs-page', 'Programs', content)
}
