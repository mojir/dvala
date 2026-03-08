import {
  addIcon,
  debugIcon,
  hamburgerIcon,
  labIcon,
  leftAlignIcon,
  linkIcon,
  objectIcon,
  playIcon,
  redoIcon,
  resetIcon,
  tokenIcon,
  trashIcon,
  treeIcon,
  undoIcon,
} from '../icons'
import { createStyles, css } from '../styles'

const styles = createStyles({
  PanelHeader: css`
    @apply px-2;
    @apply w-full;
    @apply text-color-gray-400;
    @apply bg-gray-800;
    @apply justify-between;
    @apply flex;
    @apply flex-row;
    @apply items-center;
    @apply border-0;
    @apply border-b;
    @apply border-solid;
    @apply border-gray-600;
    height: 1.6rem;
    user-select: none;
  `,
})
export function getPlayground() {
  return `
  <div id="playground" ${styles(
    'fixed',
    'bottom-0',
    'left-0',
    'right-0',
    'bg-gray-800',
    'bg-transparent',
  )}>
    <div id="resize-playground" ${styles('height: 5px;', 'bg-gray-600', 'cursor-row-resize')}></div>
    <div id="panels-container" ${styles('h-full', 'w-full', 'flex', 'flex-row', 'whitespace-nowrap')}>
      <div id="context-panel" ${styles('h-full')}>
        <div ${styles('PanelHeader')} onclick="Playground.focusContext()">
          <div id="context-title" ${styles('text-lg', 'font-sans', 'cursor-pointer')}>Context</div>
          <div id="context-links" ${styles('h-full', 'text-color-gray-400', 'bg-gray-800')}>
            <div ${styles('flex', 'flex-row', 'gap-1', 'text-sm', 'text-color-gray-400', 'h-full', 'items-center')}>
              <div>
                <a onclick="Playground.openAddContextMenu()" ${styles('text-xl', 'flex', 'items-center')}>${addIcon}</a>
                <div id="add-context-menu" ${styles('hidden', 'max-width: 20rem;', 'absolute', 'p-2', 'border-0', 'border-solid', 'border-gray-300', 'bg-gray-700')}>
                  <div ${styles('flex', 'flex-col', 'gap-4', 'text-base')}>
                    <div ${styles('flex', 'w-full', 'flex-col')}>
                      <span ${styles('text-xs', 'font-bold')}>Name</span>
                      <input id="new-context-name" ${styles('bg-gray-850', 'text-color-gray-300')}></input>
                      <span ${styles('text-xs', 'font-bold', 'mt-2')}>Value (JSON stringified)</span>
                      <textarea class="fancy-scroll" id="new-context-value" rows="5" ${styles('border-0', 'text-color-gray-300')}></textarea>
                      <button class="button" onclick="Playground.addContextEntry()" ${styles('bg-gray-700', 'text-color-gray-400', 'mt-1', 'font-sans')}>Add context entry</button>
                      <span id="new-context-error" ${styles('text-color-Rose', 'text-sm', 'mt-1', 'hidden')}>Add context entry</span>
                    </div>
                    <a ${styles('flex', 'gap-2', 'w-full', 'items-center')} onclick="Playground.closeAddContextMenu(); Playground.addSampleContext();">
                      <span ${styles('items-center', 'flex')}>${objectIcon}</span>
                      <span ${styles('mr-8')}>Add sample context</span>
                    </a>
                  </div>
                </div>
              </div>
              <a id="context-undo-button" onclick="Playground.undoContextHistory()" ${styles('text-xl', 'flex', 'items-center')}>${undoIcon}</a>
              <a id="context-redo-button" onclick="Playground.redoContextHistory()" ${styles('text-xl', 'flex', 'items-center')}>${redoIcon}</a>
              <a onclick="Playground.resetContext()" ${styles('text-xl', 'flex', 'items-center')}>${trashIcon}</a>
            </div>
          </div>
        </div>
        <textarea ${styles('height: calc(100% - 32px);', 'border-0', 'pb-1')} id="context-textarea" class="fancy-scroll" spellcheck="false"></textarea>
      </div
  
      ><div id="resize-divider-1" ${styles('width: 5px;', 'h-full', 'cursor-col-resize', 'bg-gray-600')}></div
  
      ><div id="dvala-panel" ${styles('h-full')}>
        <div ${styles('PanelHeader')} onclick="Playground.focusDvalaCode()">
          <div id="dvala-code-title" ${styles('flex', 'gap-1', 'w-full', 'items-center')}>
            <span id="dvala-panel-debug-info" ${styles('flex', 'items-center', 'text-xl')}>${debugIcon}</span>
            <div id="dvala-code-title-string" ${styles('text-lg', 'font-sans', 'cursor-pointer')}>Code</div>
          </div>
          <div
            id="dvala-links"
            onclick="event.preventDefault(); event.stopPropagation()"
            ${styles('text-color-gray-400', 'bg-gray-800', 'h-full')}
          >
            <div ${styles('h-full', 'flex', 'flex-row', 'gap-1', 'text-sm', 'text-color-gray-400', 'items-center')}>
              <a onclick="Playground.run()" ${styles('text-xl', 'flex', 'items-center')}>${playIcon}</a>
              <a id="dvala-code-undo-button" onclick="Playground.undoDvalaCodeHistory()" ${styles('text-xl', 'flex', 'items-center')}>${undoIcon}</a>
              <a id="dvala-code-redo-button" onclick="Playground.redoDvalaCodeHistory()" ${styles('text-xl', 'flex', 'items-center')}>${redoIcon}</a>
              <a onclick="Playground.resetDvalaCode()" ${styles('text-xl', 'flex', 'items-center')}>${trashIcon}</a>
              <div>
                <a onclick="Playground.openMoreMenu()" ${styles('text-xl', 'flex', 'items-center')}>${hamburgerIcon}</a>
                <div id="more-menu" ${styles('hidden', 'max-width: 20rem;', 'absolute', 'p-2', 'border-0', 'border-solid', 'border-gray-300', 'bg-gray-700')}>
                  <div ${styles('flex', 'flex-col', 'gap-2', 'text-base')}>
                    <a ${styles('flex', 'justify-between', 'w-full', 'items-center')} onclick="Playground.closeMoreMenu(); Playground.run()">
                      <div ${styles('flex', 'gap-2', 'w-full', 'items-center')}>
                        <span ${styles('text-color-SkyLavender', 'items-center', 'flex')}>${playIcon}</span>
                        <span ${styles('mr-8')}>Run</span>
                      </div>
                      Ctrl+R
                    </a>
                    <a ${styles('flex', 'justify-between', 'w-full', 'items-center')} onclick="Playground.closeMoreMenu(); Playground.analyze()">
                      <div ${styles('flex', 'gap-2', 'w-full', 'items-center')}>
                        <span ${styles('text-color-Blue', 'items-center', 'flex')}>${labIcon}</span>
                        <span ${styles('mr-8')}>Analyze</span>
                      </div>
                      Ctrl+A
                    </a>
                    <a ${styles('flex', 'justify-between', 'w-full', 'items-center')} onclick="Playground.closeMoreMenu(); Playground.tokenize()">
                      <div ${styles('flex', 'gap-2', 'w-full', 'items-center')}>
                        <span ${styles('text-color-Mint', 'items-center', 'flex')}>${tokenIcon}</span>
                        <span ${styles('mr-8')}>Tokenize</span>
                      </div>
                      Ctrl+T
                    </a>
                    <a ${styles('flex', 'justify-between', 'w-full', 'items-center')} onclick="Playground.closeMoreMenu(); Playground.parse()">
                      <div ${styles('flex', 'gap-2', 'w-full', 'items-center')}>
                        <span ${styles('text-color-Viola', 'items-center', 'flex')}>${treeIcon}</span>
                        <span ${styles('mr-8')}>Parse</span>
                      </div>
                      Ctrl+P
                    </a>
                    <a ${styles('flex', 'justify-between', 'w-full', 'items-center')} onclick="Playground.closeMoreMenu(); Playground.format()">
                      <div ${styles('flex', 'gap-2', 'w-full', 'items-center')}>
                        <span ${styles('text-color-Orange', 'items-center', 'flex')}>${leftAlignIcon}</span>
                        <span ${styles('mr-8')}>Format</span>
                      </div>
                      Ctrl+F
                    </a>
                    <a ${styles('flex', 'justify-between', 'w-full', 'items-center')} onclick="Playground.closeMoreMenu(); Playground.toggleDebug()">
                      <div ${styles('flex', 'gap-2', 'w-full', 'items-center')}>
                        <span ${styles('text-color-Rose', 'items-center', 'flex')}>${debugIcon}</span>
                        <span id="toggle-debug-menu-label" ${styles('mr-8')}>Debug</span>
                      </div>
                      Ctrl+D
                    </a>
                    <a ${styles('flex', 'gap-2', 'w-full', 'items-center', 'pt-2', 'border-0', 'border-t', 'border-solid', 'border-gray-500')} onclick="Playground.closeMoreMenu(); Playground.share();">
                      <span ${styles('text-color-Pink', 'items-center', 'flex')}>${linkIcon}</span>
                      <span>Share</span>
                    </a>
                    <a ${styles('flex', 'gap-2', 'w-full', 'items-center', 'pt-2', 'border-0', 'border-t', 'border-solid', 'border-gray-500')} onclick="Playground.closeMoreMenu(); Playground.resetPlayground();">
                      <span ${styles('text-color-Crimson', 'items-center', 'flex')}>${resetIcon}</span>
                      <span>Reset Playground</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <textarea ${styles('height: calc(100% - 32px);', 'border-0')} id="dvala-textarea" class="fancy-scroll" spellcheck="false"></textarea>
      </div
  
      ><div id="resize-divider-2" ${styles('width: 5px;', 'h-full', 'cursor-col-resize', 'bg-gray-600', 'h-full')}></div
  
      ><div id="output-panel" ${styles('h-full')}>
        <div ${styles('PanelHeader')}>
          <div ${styles('text-lg', 'font-sans')}>Output</div>
          <div
            id="output-links"
            onclick="event => event.preventDefault()"
          >
            <div ${styles('flex', 'flex-row', 'gap-2', 'text-sm', 'text-color-gray-400')}>
              <a onclick="Playground.resetOutput()" ${styles('text-xl', 'flex', 'items-center')}>${trashIcon}</a>
            </div>
          </div>
        </div>
        <div class="fancy-scroll" ${styles('font-mono', 'bg-gray-850', 'p-2', 'text-sm', 'flex', 'flex-col', 'gap-2', 'height: calc(100% - 32px);', 'overflow-y: auto;')} id="output-result"></div>
      </div>
    </div>
  </div>

  <div id="snapshot-modal" style="display:none; position:fixed; inset:0; z-index:200; background:rgba(0,0,0,0.6); align-items:center; justify-content:center;">
    <div class="fancy-scroll" ${styles('bg-gray-800', 'p-4', 'border-0', 'border-solid', 'border-gray-600', 'flex', 'flex-col', 'gap-4', 'min-width: 36rem;', 'max-width: 64rem;', 'max-height: 85vh;', 'overflow-y: auto;', 'border-width: 1px;')}>
      <div ${styles('text-color-gray-200', 'font-sans')} style="font-size:1.1rem; font-weight:bold;">Snapshot</div>

      <!-- Effect section -->
      <div ${styles('flex', 'flex-col', 'gap-2')}>
        <span ${styles('text-xs', 'font-sans', 'text-color-gray-400')} style="font-weight:bold; text-transform:uppercase; letter-spacing:0.05em;">Suspended effect</span>
        <code id="snapshot-modal-effect-name" ${styles('text-color-SkyLavender', 'text-sm')} style="font-size:1rem;"></code>
        <div id="snapshot-modal-effect-args" class="fancy-scroll" ${styles('flex', 'flex-col', 'gap-2', 'overflow-y: auto;', 'max-height: 12rem;')}></div>
      </div>

      <!-- Meta section -->
      <div ${styles('flex', 'flex-col', 'gap-2')}>
        <span ${styles('text-xs', 'font-sans', 'text-color-gray-400')} style="font-weight:bold; text-transform:uppercase; letter-spacing:0.05em;">Metadata</span>
        <div id="snapshot-modal-meta" class="fancy-scroll" ${styles('overflow-y: auto;', 'max-height: 10rem;')}></div>
      </div>

      <!-- Technical info (collapsible) -->
      <details>
        <summary ${styles('text-xs', 'font-sans', 'text-color-gray-400')} style="cursor:pointer; font-weight:bold; text-transform:uppercase; letter-spacing:0.05em;">Technical Info</summary>
        <div id="snapshot-modal-tech" ${styles('flex', 'flex-col', 'gap-2', 'margin-top: 0.5rem;')}></div>
      </details>

      <!-- Checkpoints (collapsible) -->
      <details>
        <summary ${styles('text-xs', 'font-sans', 'text-color-gray-400')} style="cursor:pointer; font-weight:bold; text-transform:uppercase; letter-spacing:0.05em;">Checkpoints (<span id="snapshot-modal-cp-count">0</span>)</summary>
        <div id="snapshot-modal-checkpoints" class="fancy-scroll" ${styles('flex', 'flex-col', 'gap-2', 'overflow-y: auto;', 'max-height: 12rem;', 'margin-top: 0.5rem;')}></div>
      </details>

      <!-- Buttons -->
      <div ${styles('flex', 'flex-row', 'gap-2', 'justify-between', 'margin-top: 0.5rem;')}>
        <button class="button" onclick="Playground.closeSnapshotModal()" ${styles('bg-gray-700', 'text-color-gray-400', 'font-sans', 'flex', 'gap-2', 'items-center')}>
          <span>Close</span><span ${styles('text-color-gray-500')} style="font-size:0.7rem;">Esc</span>
        </button>
        <div ${styles('flex', 'flex-row', 'gap-2')}>
          <button class="button" onclick="Playground.downloadSnapshot()" ${styles('bg-gray-700', 'text-color-gray-400', 'font-sans')}>Download</button>
          <button class="button" onclick="Playground.resumeSnapshot()" ${styles('bg-gray-700', 'text-color-Mint', 'font-sans', 'flex', 'gap-2', 'items-center')}>
            <span>Run</span><span ${styles('text-color-gray-500')} style="font-size:0.7rem;">↵</span>
          </button>
        </div>
      </div>
    </div>
  </div>

  <div id="effect-modal" style="display:none; position:fixed; inset:0; z-index:200; background:rgba(0,0,0,0.6); align-items:center; justify-content:center;">
    <div ${styles('bg-gray-800', 'p-4', 'border-0', 'border-solid', 'border-gray-600', 'flex', 'flex-col', 'gap-3', 'min-width: 24rem;', 'max-width: 48rem;', 'border-width: 1px;')}>
      <div ${styles('flex', 'flex-row', 'items-center', 'justify-between')}>
        <div ${styles('text-color-gray-200', 'font-sans')} style="font-size:1.1rem; font-weight:bold;">Effect Triggered</div>
        <div id="effect-modal-nav" ${styles('flex', 'flex-row', 'items-center', 'gap-2', 'display: none;')}>
          <button id="effect-modal-prev" onclick="Playground.navigateEffect(-1)" ${styles('bg-gray-700', 'text-color-gray-400', 'font-sans')} style="padding:0.1rem 0.5rem; min-width:1.6rem;">‹</button>
          <span id="effect-modal-counter" ${styles('text-xs', 'font-sans', 'text-color-gray-400')} style="font-weight:bold;"></span>
          <button id="effect-modal-next" onclick="Playground.navigateEffect(1)" ${styles('bg-gray-700', 'text-color-gray-400', 'font-sans')} style="padding:0.1rem 0.5rem; min-width:1.6rem;">›</button>
        </div>
      </div>
      <div id="effect-modal-handled-badge" ${styles('text-xs', 'font-sans', 'display: none;')} style="font-weight:bold; align-items:baseline; flex-wrap:wrap; gap:0.2rem;"></div>
      <div ${styles('flex', 'flex-col', 'gap-1')}>
        <span ${styles('text-xs', 'font-sans', 'text-color-gray-400')} style="font-weight:bold;">Effect</span>
        <code id="effect-modal-name" ${styles('text-color-SkyLavender', 'text-sm')}></code>
      </div>
      <div ${styles('flex', 'flex-col', 'gap-1')}>
        <span ${styles('text-xs', 'font-sans', 'text-color-gray-400')} style="font-weight:bold;">Arguments</span>
        <div id="effect-modal-args" class="fancy-scroll" ${styles('flex', 'flex-col', 'gap-2', 'overflow-y: auto;', 'max-height: 10rem;')}></div>
      </div>
      <div id="effect-modal-main-buttons" ${styles('flex', 'flex-row', 'gap-2', 'justify-between', 'margin-top: 1rem;')}>
        <button id="effect-modal-btn-ignore" class="button" onclick="Playground.selectEffectAction('ignore')" ${styles('bg-gray-700', 'text-color-gray-400', 'font-sans', 'flex', 'gap-2', 'items-center')}>
          <span>Ignore</span><span ${styles('text-color-gray-500')} style="font-size:0.7rem;">Esc</span>
        </button>
        <div ${styles('flex', 'flex-row', 'gap-2')}>
          <button id="effect-modal-btn-suspend" class="button" onclick="Playground.selectEffectAction('suspend')" ${styles('bg-gray-700', 'text-color-gray-400', 'font-sans')}>Suspend</button>
          <button id="effect-modal-btn-fail" class="button" onclick="Playground.selectEffectAction('fail')" ${styles('bg-gray-700', 'text-color-Rose', 'font-sans')}>Fail</button>
          <button id="effect-modal-btn-resume" class="button" onclick="Playground.selectEffectAction('resume')" ${styles('bg-gray-700', 'text-color-Mint', 'font-sans', 'flex', 'gap-2', 'items-center')}>
            <span>Resume</span><span ${styles('text-color-gray-500')} style="font-size:0.7rem;">↵</span>
          </button>
        </div>
      </div>
      <div id="effect-modal-input-section" ${styles('flex-col', 'gap-2', 'display: none;')}>
        <div ${styles('flex', 'flex-col', 'gap-1')}>
          <span id="effect-modal-input-label" ${styles('text-xs', 'font-sans', 'text-color-gray-400')} style="font-weight:bold;"></span>
          <textarea id="effect-modal-value" rows="3" class="fancy-scroll" ${styles('bg-gray-850', 'text-color-gray-300', 'border-0', 'p-1', 'text-sm')} spellcheck="false"></textarea>
          <span id="effect-modal-error" ${styles('text-color-Rose', 'text-xs', 'hidden')}></span>
        </div>
        <div ${styles('flex', 'flex-row', 'gap-2', 'justify-end')}>
          <button class="button" onclick="Playground.cancelEffectAction()" ${styles('bg-gray-700', 'text-color-gray-400', 'font-sans')}>Cancel</button>
          <button class="button" onclick="Playground.confirmEffectAction()" ${styles('bg-gray-700', 'text-color-gray-200', 'font-sans')}>OK</button>
        </div>
      </div>
    </div>
  </div>
  `
}
