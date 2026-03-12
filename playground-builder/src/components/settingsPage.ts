import { styles } from '../styles'
import { pageLayout } from './pageLayout'

export function getSettingsPage(): string {
  const settingRow = (label: string, description: string, id: string, onclick: string) => `
        <div ${styles('flex', 'justify-between', 'items-center', 'gap-4')}>
          <div ${styles('flex', 'flex-col')}>
            <span ${styles('text-lg')}>${label}</span>
            <span ${styles('text-sm', 'text-color-gray-400', 'max-width: 32rem;')}>${description}</span>
          </div>
          <label class="settings-toggle">
            <input type="checkbox" id="${id}" onclick="${onclick}">
            <span class="settings-toggle-slider"></span>
          </label>
        </div>`

  const tabBtn = (id: string, label: string) =>
    `<button id="settings-tab-btn-${id}" class="settings-tab-btn" onclick="Playground.showSettingsTab('${id}')">${label}</button>`

  const dvalaTab = `
    <div id="settings-tab-dvala" class="settings-tab-content">
      <p ${styles('text-sm', 'text-color-gray-500', 'm-0')}>Configure the Dvala language runtime behavior.</p>
      ${settingRow(
        'Debug mode',
        'Injects source code information into the AST, providing better error messages with source locations.',
        'settings-debug-toggle',
        'Playground.toggleDebug()',
      )}
      ${settingRow(
        'Pure mode',
        'Restricts execution to pure expressions only. No effects are allowed.',
        'settings-pure-toggle',
        'Playground.togglePure()',
      )}
      ${settingRow(
        'Disable auto checkpoint',
        'When enabled, the runtime automatically captures snapshots before every effect, enabling crash recovery and step-back debugging. Explicit <code>dvala.checkpoint</code> effects are always recorded regardless of this setting.',
        'settings-auto-checkpoint-toggle',
        'Playground.toggleAutoCheckpoint()',
      )}
    </div>`

  const playgroundTab = `
    <div id="settings-tab-playground" class="settings-tab-content">
      <p ${styles('text-sm', 'text-color-gray-500', 'm-0')}>Configure how the playground handles effects and interacts with running programs.</p>
      ${settingRow(
        'Disable Playground effect handlers',
        'Disables all built-in playground effect handlers (read-line dialogs, checkpoint interception, etc). Only context-defined handlers will run.',
        'settings-disable-handlers-toggle',
        'Playground.toggleDisablePlaygroundHandlers()',
      )}
      ${settingRow(
        'Intercept error effect',
        'When enabled, dvala.error effects are intercepted and shown in the effect panel. When disabled, errors propagate normally as run errors.',
        'settings-intercept-error-toggle',
        'Playground.toggleInterceptError()',
      )}
      ${settingRow(
        'Intercept checkpoint effect',
        'When enabled, checkpoint effects pause execution and open a snapshot dialog.',
        'settings-checkpoint-toggle',
        'Playground.toggleInterceptCheckpoint()',
      )}
    </div>`

  const actionsTab = `
    <div id="settings-tab-actions" class="settings-tab-content">
      <p ${styles('text-sm', 'text-color-gray-500', 'm-0')}>Manage playground data and storage. Reset or clear data, export and import, or share a link.</p>

      <!-- Storage usage -->
      <div ${styles('flex', 'flex-col', 'gap-2')}>
        <div ${styles('flex', 'justify-between', 'items-center', 'gap-4')}>
          <div ${styles('flex', 'flex-col')}>
            <span ${styles('text-lg')}>Storage usage</span>
            <span ${styles('text-sm', 'text-color-gray-400')}>Amount of browser localStorage used by the playground.</span>
          </div>
          <span id="settings-storage-usage" ${styles('text-sm', 'text-color-gray-400')}></span>
        </div>
        <div ${styles('width: 100%;', 'height: 6px;', 'border-radius: 3px;', 'overflow: hidden;', 'background-color: #374151;')}>
          <div id="settings-storage-bar" ${styles('height: 100%;', 'background-color: #6b7280;', 'width: 0%;', 'border-radius: 3px;', 'transition: width 0.3s ease;')}></div>
        </div>
      </div>

      <!-- Reset Playground -->
      <div ${styles('flex', 'justify-between', 'items-center', 'gap-4')}>
        <div ${styles('flex', 'flex-col')}>
          <span ${styles('text-lg')}>Reset playground</span>
          <span ${styles('text-sm', 'text-color-gray-400')}>Resets code, context, output panels and layout to their default state. Snapshots are kept.</span>
        </div>
        <button class="button" onclick="Playground.showConfirmModal('Reset playground', 'This will reset the code, context, and output panels, and restore the default layout. Snapshots will not be affected.', Playground.resetPlayground)" ${styles('bg-gray-700', 'text-color-gray-400', 'font-sans')}>Reset</button>
      </div>

      <!-- Clear Data -->
      <div ${styles('flex', 'justify-between', 'items-center', 'gap-4')}>
        <div ${styles('flex', 'flex-col')}>
          <span ${styles('text-lg')}>Clear all data</span>
          <span ${styles('text-sm', 'text-color-gray-400')}>Wipes all playground data from localStorage, including unlocked snapshots.</span>
        </div>
        <button class="button" onclick="Playground.showClearDataModal()" ${styles('bg-gray-700', 'text-color-gray-400', 'font-sans')}>Clear</button>
      </div>

      <!-- Export -->
      <div ${styles('flex', 'justify-between', 'items-center', 'gap-4')}>
        <div ${styles('flex', 'flex-col')}>
          <span ${styles('text-lg')}>Export</span>
          <span ${styles('text-sm', 'text-color-gray-400', 'max-width: 32rem;')}>Download all playground data as a JSON file. Includes snapshots, code, context, and settings.</span>
        </div>
        <button class="button" onclick="Playground.exportPlayground()" ${styles('bg-gray-700', 'text-color-gray-400', 'font-sans')}>Export</button>
      </div>

      <!-- Import -->
      <div ${styles('flex', 'justify-between', 'items-center', 'gap-4')}>
        <div ${styles('flex', 'flex-col')}>
          <span ${styles('text-lg')}>Import</span>
          <span ${styles('text-sm', 'text-color-gray-400', 'max-width: 32rem;')}>Restore playground data from a previously exported JSON file. Current data will be replaced.</span>
        </div>
        <button class="button" onclick="Playground.importPlayground()" ${styles('bg-gray-700', 'text-color-gray-400', 'font-sans')}>Import</button>
      </div>

      <!-- Share -->
      <div ${styles('flex', 'justify-between', 'items-center', 'gap-4')}>
        <div ${styles('flex', 'flex-col')}>
          <span ${styles('text-lg')}>Share</span>
          <span ${styles('text-sm', 'text-color-gray-400', 'max-width: 32rem;')}>Copy a shareable link to the clipboard with the current code and context encoded in the URL.</span>
        </div>
        <button class="button" onclick="Playground.share()" ${styles('bg-gray-700', 'text-color-gray-400', 'font-sans')}>Copy link</button>
      </div>

    </div>`

  const content = `
    <div class="settings-tabs">
      <div class="settings-tab-bar">
        ${tabBtn('dvala', 'Dvala')}
        ${tabBtn('playground', 'Playground')}
        ${tabBtn('actions', 'Actions')}
      </div>
      ${dvalaTab}
      ${playgroundTab}
      ${actionsTab}
    </div>
  `
  return pageLayout('settings-page', 'Settings', content)
}
