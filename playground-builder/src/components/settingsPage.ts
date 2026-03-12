import { downloadIcon, linkIcon, trashIcon, uploadIcon } from '../icons'
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

      <!-- Share -->
      <div ${styles('flex', 'justify-between', 'items-center', 'gap-4')}>
        <div ${styles('flex', 'flex-col')}>
          <span>Share</span>
          <span ${styles('text-sm', 'text-color-gray-400', 'max-width: 32rem;')}>Copy a shareable link to the clipboard with the current code and context encoded in the URL.</span>
        </div>
        <button class="button" onclick="Playground.share()" ${styles('bg-gray-700', 'text-color-gray-400', 'font-sans', 'min-width: 8rem;', 'padding: 0.5rem 0.75rem;', 'flex', 'items-center', 'justify-content: center;', 'gap: 0.4rem;')}>${linkIcon}Copy link</button>
      </div>

      <!-- Import -->
      <div ${styles('flex', 'justify-between', 'items-center', 'gap-4')}>
        <div ${styles('flex', 'flex-col')}>
          <span>Import</span>
          <span ${styles('text-sm', 'text-color-gray-400', 'max-width: 32rem;')}>Restore playground data from a previously exported JSON file. Current data will be replaced.</span>
        </div>
        <button class="button" onclick="Playground.importPlayground()" ${styles('bg-gray-700', 'text-color-gray-400', 'font-sans', 'min-width: 8rem;', 'padding: 0.5rem 0.75rem;', 'flex', 'items-center', 'justify-content: center;', 'gap: 0.4rem;')}>${uploadIcon}Import</button>
      </div>

      <!-- Export -->
      <div ${styles('flex', 'justify-between', 'items-center', 'gap-4')}>
        <div ${styles('flex', 'flex-col')}>
          <span>Export</span>
          <span ${styles('text-sm', 'text-color-gray-400', 'max-width: 32rem;')}>Download all playground data as a JSON file. Includes snapshots, code, context, and settings.</span>
        </div>
        <button class="button" onclick="Playground.exportPlayground()" ${styles('bg-gray-700', 'text-color-gray-400', 'font-sans', 'min-width: 8rem;', 'padding: 0.5rem 0.75rem;', 'flex', 'items-center', 'justify-content: center;', 'gap: 0.4rem;')}>${downloadIcon}Export</button>
      </div>

      <!-- Storage section -->
      <div ${styles('flex', 'flex-col', 'gap-3')}>
        <div ${styles('text-sm', 'text-color-gray-500', 'text-transform: uppercase;', 'letter-spacing: 0.08em;', 'padding-bottom: 0.35rem;', 'border-bottom: 1px solid rgb(82 82 82);')}>Storage</div>

        <div ${styles('flex', 'justify-between', 'items-center', 'gap-4')}>
          <div ${styles('flex', 'flex-col')}>
            <div ${styles('flex', 'items-center', 'gap-2')}>
              <span>Local Storage</span>
              <span id="settings-storage-local" ${styles('text-sm', 'text-color-gray-500')}></span>
            </div>
            <span ${styles('text-sm', 'text-color-gray-400')}>Stores code, context, settings, and layout preferences.</span>
          </div>
          <button class="button" onclick="Playground.clearLocalStorageData()" ${styles('bg-gray-700', 'text-color-gray-400', 'font-sans', 'min-width: 8rem;', 'padding: 0.5rem 0.75rem;', 'flex', 'items-center', 'justify-content: center;', 'gap: 0.4rem;')}>${trashIcon}Clear</button>
        </div>

        <div ${styles('flex', 'justify-between', 'items-center', 'gap-4')}>
          <div ${styles('flex', 'flex-col')}>
            <div ${styles('flex', 'items-center', 'gap-2')}>
              <span>IndexedDB</span>
              <span id="settings-storage-idb" ${styles('text-sm', 'text-color-gray-500')}></span>
            </div>
            <span ${styles('text-sm', 'text-color-gray-400')}>Stores snapshots (saved and terminal).</span>
          </div>
          <button class="button" onclick="Playground.clearIndexedDbData()" ${styles('bg-gray-700', 'text-color-gray-400', 'font-sans', 'min-width: 8rem;', 'padding: 0.5rem 0.75rem;', 'flex', 'items-center', 'justify-content: center;', 'gap: 0.4rem;')}>${trashIcon}Clear</button>
        </div>
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
