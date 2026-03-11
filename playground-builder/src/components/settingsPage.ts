import { styles } from '../styles'
import { pageLayout } from './pageLayout'

export function getSettingsPage(): string {
  const content = `
      <div ${styles('flex', 'flex-col', 'gap-6')}>

        <!-- Debug toggle -->
        <div ${styles('flex', 'justify-between', 'items-center', 'gap-4')}>
          <div ${styles('flex', 'flex-col')}>
            <span ${styles('text-lg')}>Debug mode</span>
            <span ${styles('text-sm', 'text-color-gray-400')}>Injects source code information into the AST, providing better error messages with source locations.</span>
          </div>
          <label class="settings-toggle">
            <input type="checkbox" id="settings-debug-toggle" onclick="Playground.toggleDebug()">
            <span class="settings-toggle-slider"></span>
          </label>
        </div>

        <!-- Pure mode toggle -->
        <div ${styles('flex', 'justify-between', 'items-center', 'gap-4')}>
          <div ${styles('flex', 'flex-col')}>
            <span ${styles('text-lg')}>Pure mode</span>
            <span ${styles('text-sm', 'text-color-gray-400')}>Restricts execution to pure expressions only. No effects are allowed.</span>
          </div>
          <label class="settings-toggle">
            <input type="checkbox" id="settings-pure-toggle" onclick="Playground.togglePure()">
            <span class="settings-toggle-slider"></span>
          </label>
        </div>

        <!-- Synchronous mode toggle -->
        <div ${styles('flex', 'justify-between', 'items-center', 'gap-4')}>
          <div ${styles('flex', 'flex-col')}>
            <span ${styles('text-lg')}>Synchronous mode</span>
            <span ${styles('text-sm', 'text-color-gray-400')}>Uses synchronous execution. Only synchronous effects are allowed.</span>
          </div>
          <label class="settings-toggle">
            <input type="checkbox" id="settings-sync-toggle" onclick="Playground.toggleSync()">
            <span class="settings-toggle-slider"></span>
          </label>
        </div>

        <!-- Auto checkpoint toggle -->
        <div ${styles('flex', 'justify-between', 'items-center', 'gap-4')}>
          <div ${styles('flex', 'flex-col')}>
            <span ${styles('text-lg')}>Disable auto checkpoint</span>
            <span ${styles('text-sm', 'text-color-gray-400')}>When enabled, the runtime automatically captures snapshots before every effect, enabling crash recovery and step-back debugging. Explicit <code>dvala.checkpoint</code> effects are always recorded regardless of this setting.</span>
          </div>
          <label class="settings-toggle">
            <input type="checkbox" id="settings-auto-checkpoint-toggle" onclick="Playground.toggleAutoCheckpoint()">
            <span class="settings-toggle-slider"></span>
          </label>
        </div>

        <!-- Disable playground handlers toggle -->
        <div ${styles('flex', 'justify-between', 'items-center', 'gap-4')}>
          <div ${styles('flex', 'flex-col')}>
            <span ${styles('text-lg')}>Disable Playground effect handlers</span>
            <span ${styles('text-sm', 'text-color-gray-400')}>Disables all built-in playground effect handlers (read-line dialogs, checkpoint interception, etc). Only context-defined handlers will run.</span>
          </div>
          <label class="settings-toggle">
            <input type="checkbox" id="settings-disable-handlers-toggle" onclick="Playground.toggleDisablePlaygroundHandlers()">
            <span class="settings-toggle-slider"></span>
          </label>
        </div>

        <!-- Error effect interception toggle -->
        <div ${styles('flex', 'justify-between', 'items-center', 'gap-4')}>
          <div ${styles('flex', 'flex-col')}>
            <span ${styles('text-lg')}>Intercept error effect</span>
            <span ${styles('text-sm', 'text-color-gray-400')}>When enabled, dvala.error effects are intercepted and shown in the effect panel. When disabled, errors propagate normally as run errors.</span>
          </div>
          <label class="settings-toggle">
            <input type="checkbox" id="settings-intercept-error-toggle" onclick="Playground.toggleInterceptError()">
            <span class="settings-toggle-slider"></span>
          </label>
        </div>

        <!-- Checkpoint interception toggle -->
        <div ${styles('flex', 'justify-between', 'items-center', 'gap-4')}>
          <div ${styles('flex', 'flex-col')}>
            <span ${styles('text-lg')}>Intercept checkpoint effect</span>
            <span ${styles('text-sm', 'text-color-gray-400')}>When enabled, checkpoint effects pause execution and open a snapshot dialog.</span>
          </div>
          <label class="settings-toggle">
            <input type="checkbox" id="settings-checkpoint-toggle" onclick="Playground.toggleInterceptCheckpoint()">
            <span class="settings-toggle-slider"></span>
          </label>
        </div>

        <!-- Clear Playground -->
        <div ${styles('flex', 'justify-between', 'items-center', 'gap-4', 'pt-4', 'border-0', 'border-t', 'border-solid', 'border-gray-600')}>
          <div ${styles('flex', 'flex-col')}>
            <span ${styles('text-lg')}>Clear playground</span>
            <span ${styles('text-sm', 'text-color-gray-400')}>Resets all playground panels to their default state. All saved data will be lost.</span>
          </div>
          <button class="button" onclick="Playground.showConfirmModal('Clear playground', 'This will reset all playground panels to their default state. Locked snapshots will be kept.', Playground.resetPlayground)" ${styles('bg-gray-700', 'text-color-gray-400', 'font-sans')}>Reset</button>
        </div>

      </div>
  `
  return pageLayout('settings-page', 'Settings', content)
}
