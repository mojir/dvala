import { styles } from '../styles'

export function getSettingsPage(): string {
  return `
  <div id="settings-page" class="content">
    <div ${styles('mb-6', 'p-4', 'bg-gray-800', 'text-color-gray-300')}>
      <div ${styles('text-3xl', 'mb-6', 'text-center')}>Settings</div>
      <div ${styles('flex', 'flex-col', 'gap-6', 'max-width: 500px;', 'margin: 0 auto;')}>

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

        <!-- Auto-checkpoint toggle -->
        <div ${styles('flex', 'justify-between', 'items-center', 'gap-4')}>
          <div ${styles('flex', 'flex-col')}>
            <span ${styles('text-lg')}>Auto-checkpoint before effects</span>
            <span ${styles('text-sm', 'text-color-gray-400')}>Automatically captures a checkpoint snapshot before each effect is handled.</span>
          </div>
          <label class="settings-toggle">
            <input type="checkbox" id="settings-auto-checkpoint-toggle" onclick="Playground.toggleAutoCheckpoint()">
            <span class="settings-toggle-slider"></span>
          </label>
        </div>

        <!-- Clear Playground -->
        <div ${styles('flex', 'justify-between', 'items-center', 'gap-4', 'pt-4', 'border-0', 'border-t', 'border-solid', 'border-gray-600')}>
          <div ${styles('flex', 'flex-col')}>
            <span ${styles('text-lg')}>Clear playground</span>
            <span ${styles('text-sm', 'text-color-gray-400')}>Resets all playground panels to their default state.</span>
          </div>
          <button class="button" onclick="Playground.showConfirmModal('Clear playground', 'This will reset all playground panels to their default state. All saved data will be lost.', Playground.resetPlayground)" ${styles('bg-gray-700', 'text-color-gray-400', 'font-sans')}>Reset</button>
        </div>

      </div>
    </div>
  </div>
  `
}
