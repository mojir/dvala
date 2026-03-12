import {
  addIcon,
  copyIcon,
  debugIcon,
  hamburgerIcon,
  labIcon,
  leftAlignIcon,
  objectIcon,
  playIcon,
  redoIcon,
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
              <a onclick="Playground.run()" title="Run asynchronously (Ctrl+R)" ${styles('text-lg', 'flex', 'items-center', 'gap-1')}>${playIcon} Run</a>
              <a id="dvala-code-undo-button" onclick="Playground.undoDvalaCodeHistory()" ${styles('text-xl', 'flex', 'items-center')}>${undoIcon}</a>
              <a id="dvala-code-redo-button" onclick="Playground.redoDvalaCodeHistory()" ${styles('text-xl', 'flex', 'items-center')}>${redoIcon}</a>
              <a onclick="Playground.resetDvalaCode()" ${styles('text-xl', 'flex', 'items-center')}>${trashIcon}</a>
              <div>
                <a onclick="Playground.openMoreMenu(this)" ${styles('text-xl', 'flex', 'items-center')}>${hamburgerIcon}</a>
                <div id="more-menu" ${styles('hidden', 'max-width: 20rem;', 'absolute', 'p-2', 'border-0', 'border-solid', 'border-gray-300', 'bg-gray-700')}>
                  <div ${styles('flex', 'flex-col', 'gap-2', 'text-base')}>
                    <a ${styles('flex', 'justify-between', 'w-full', 'items-center')} onclick="Playground.closeMoreMenu(); Playground.run()">
                      <div ${styles('flex', 'gap-2', 'w-full', 'items-center')}>
                        <span ${styles('text-color-SkyLavender', 'items-center', 'flex')}>${playIcon}</span>
                        <span ${styles('mr-8')}>Run</span>
                      </div>
                      Ctrl+R
                    </a>
                    <a ${styles('flex', 'justify-between', 'w-full', 'items-center')} onclick="Playground.closeMoreMenu(); void Playground.runSync()">
                      <div ${styles('flex', 'gap-2', 'w-full', 'items-center')}>
                        <span ${styles('text-color-SkyLavender', 'items-center', 'flex')}>${playIcon}</span>
                        <span ${styles('mr-8')}>Run sync</span>
                      </div>
                      Ctrl+Shift+R
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

  <template id="snapshot-panel-template">
    <div class="fancy-scroll" ${styles('bg-gray-800', 'p-4', 'flex', 'flex-col', 'gap-4', 'overflow-y: auto;', 'max-height: 85vh;')}>
      <div data-ref="breadcrumbs" ${styles('text-color-gray-200', 'font-sans', 'flex', 'flex-row', 'items-center', 'gap-1', 'flex-wrap: wrap;', 'background-color: rgb(50 50 50);', 'margin: -1rem -1rem 0 -1rem;', 'padding: 0.6rem 1rem;')} style="font-size:0.95rem; font-weight:bold;"></div>

      <!-- Two-column layout -->
      <div ${styles('flex', 'flex-row', 'gap-4', 'align-items: stretch;')}>
        <!-- Left column: Meta, Effect, Technical -->
        <div ${styles('flex', 'flex-col', 'gap-4', 'flex: 1 1 0;', 'min-width: 0;')}>
          <!-- Meta section -->
          <div ${styles('flex', 'flex-col', 'gap-2')}>
            <span ${styles('text-xs', 'font-sans', 'text-color-gray-300', 'font-weight: bold;', 'text-transform: uppercase;', 'letter-spacing: 0.05em;', 'font-size: 0.8rem;')}>Metadata</span>
            <div data-ref="meta-container">
              <div class="example-code" ${styles('position: relative;')}>
                <pre data-ref="meta-json" class="fancy-scroll" ${styles('bg-gray-850', 'text-color-gray-300', 'p-2', 'text-sm', 'font-mono', 'overflow: auto;', 'max-height: 8rem;', 'white-space: pre;', 'border: none;', 'margin: 0;')}></pre>
                <div class="example-action-bar" ${styles('absolute', 'top-0', 'right-0', 'flex-row', 'margin-top: 2px;')}>
                  <div class="example-action-btn" ${styles('p-2', 'text-lg', 'cursor-pointer')} data-ref="copy-meta-btn">${copyIcon}</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Suspended effect section (bordered) -->
          <div data-ref="suspended-effect-section" ${styles('flex', 'flex-col', 'gap-2')}>
            <span ${styles('text-xs', 'font-sans', 'text-color-gray-300', 'font-weight: bold;', 'text-transform: uppercase;', 'letter-spacing: 0.05em;', 'font-size: 0.8rem;')}>Suspended effect</span>
            <div ${styles('flex', 'flex-col', 'gap-2', 'border: 1px solid rgb(82 82 82);', 'padding: 0.75rem;')}>
              <div ${styles('flex', 'flex-col', 'gap-1', 'margin-bottom: 0.25rem;')}>
                <span ${styles('text-xs', 'font-sans', 'text-color-gray-400', 'font-weight: bold;')}>Effect name</span>
                <code data-ref="effect-name" ${styles('text-color-SkyLavender', 'text-sm', 'font-size: 1rem;')}></code>
              </div>
              <div ${styles('flex', 'flex-col', 'gap-1')}>
                <span ${styles('text-xs', 'font-sans', 'text-color-gray-400', 'font-weight: bold;')}>Arguments</span>
                <div data-ref="effect-args" class="fancy-scroll" ${styles('flex', 'flex-col', 'gap-0.5', 'overflow-y: auto;', 'max-height: 12rem;')}></div>
              </div>
            </div>
          </div>

          <!-- Technical info (collapsible) -->
          <details>
            <summary ${styles('text-xs', 'font-sans', 'text-color-gray-300', 'cursor: pointer;', 'font-weight: bold;', 'text-transform: uppercase;', 'letter-spacing: 0.05em;', 'font-size: 0.8rem;')}>Technical Info</summary>
            <div data-ref="tech" ${styles('flex', 'flex-col', 'gap-2', 'margin-top: 0.5rem;')}></div>
          </details>
        </div>

        <!-- Right column: Checkpoints -->
        <div ${styles('flex', 'flex-col', 'gap-2', 'flex: 1 1 0;', 'min-width: 0;')}>
          <span ${styles('text-xs', 'font-sans', 'text-color-gray-300', 'font-weight: bold;', 'text-transform: uppercase;', 'letter-spacing: 0.05em;', 'font-size: 0.8rem;')}>Checkpoints (<span data-ref="cp-count">0</span>)</span>
          <div data-ref="checkpoints" class="fancy-scroll" ${styles('flex', 'flex-col', 'gap-2', 'overflow-y: auto;')}></div>
        </div>
      </div>

      <!-- Raw snapshot JSON (collapsible) -->
      <details>
        <summary ${styles('text-xs', 'font-sans', 'text-color-gray-300', 'cursor: pointer;', 'font-weight: bold;', 'text-transform: uppercase;', 'letter-spacing: 0.05em;', 'font-size: 0.8rem;')}>Raw Snapshot</summary>
        <div class="example-code" ${styles('position: relative;', 'margin-top: 0.5rem;')}>
          <pre data-ref="raw-json" class="fancy-scroll" ${styles('bg-gray-850', 'text-color-gray-300', 'p-2', 'text-sm', 'font-mono', 'overflow: auto;', 'max-height: 16rem;', 'white-space: pre;', 'border: none;', 'margin: 0;')}></pre>
          <div class="example-action-bar" ${styles('absolute', 'top-0', 'right-0', 'flex-row', 'margin-top: 2px;')}>
            <div class="example-action-btn" ${styles('p-2', 'text-lg', 'cursor-pointer')} data-ref="copy-raw-btn">${copyIcon}</div>
          </div>
        </div>
      </details>

      <!-- Buttons -->
      <div ${styles('flex', 'flex-row', 'gap-2', 'justify-between', 'margin-top: 0.5rem;')}>
        <button data-ref="close-btn" class="button" onclick="Playground.closeSnapshotModal()" ${styles('bg-gray-700', 'text-color-gray-400', 'font-sans', 'flex', 'gap-2', 'items-center')}>
          <span>Close</span><span ${styles('text-color-gray-500')} style="font-size:0.7rem;">Esc</span>
        </button>
        <button data-ref="back-btn" class="button" onclick="Playground.slideBackSnapshotModal()" ${styles('bg-gray-700', 'text-color-gray-400', 'font-sans', 'gap-2', 'items-center', 'display: none;')}>
          <span>&#8592; Back</span>
        </button>
        <div ${styles('flex', 'flex-row', 'gap-2')}>
          <button data-ref="share-btn" class="button" onclick="Playground.shareSnapshot()" ${styles('bg-gray-700', 'text-color-gray-400', 'font-sans')}>Share</button>
          <button class="button" onclick="Playground.downloadSnapshot()" ${styles('bg-gray-700', 'text-color-gray-400', 'font-sans')}>Download</button>
          <button class="button" onclick="Playground.saveSnapshot()" ${styles('bg-gray-700', 'text-color-gray-400', 'font-sans')}>Save</button>
          <button class="button" onclick="Playground.resumeSnapshot()" ${styles('bg-gray-700', 'text-color-Mint', 'font-sans', 'flex', 'gap-2', 'items-center')}>
            <span>Run</span><span ${styles('text-color-gray-500')} style="font-size:0.7rem;">↵</span>
          </button>
        </div>
      </div>
    </div>
  </template>

  <div id="snapshot-modal" style="display:none; position:fixed; inset:0; z-index:200; background:rgba(0,0,0,0.6); align-items:center; justify-content:center;">
    <div id="snapshot-panel-container" ${styles('bg-gray-800', 'border-0', 'border-solid', 'border-gray-600', 'width: 42rem;', 'max-width: calc(100vw - 2rem);', 'max-height: 85vh;', 'border-width: 1px;', 'position: relative;', 'clip-path: inset(0);', 'border-top: 2px solid #e6c07b;')}>
    </div>
  </div>

  <div id="checkpoint-modal" style="display:none; position:fixed; inset:0; z-index:200; background:rgba(0,0,0,0.6); align-items:center; justify-content:center;">
    <div class="fancy-scroll" ${styles('bg-gray-800', 'p-4', 'border-0', 'border-solid', 'border-gray-600', 'flex', 'flex-col', 'gap-4', 'min-width: 24rem;', 'max-width: 36rem;', 'max-height: 85vh;', 'overflow-y: auto;', 'border-width: 1px;', 'border-top: 2px solid #e6c07b;')}>
      <div ${styles('text-color-gray-200', 'font-sans', 'font-size: 1.1rem;', 'font-weight: bold;', 'background-color: rgb(50 50 50);', 'margin: -1rem -1rem 0 -1rem;', 'padding: 0.6rem 1rem;')}>Checkpoint</div>

      <!-- Message -->
      <div ${styles('flex', 'flex-col', 'gap-1')}>
        <span ${styles('text-xs', 'font-sans', 'text-color-gray-300', 'font-weight: bold;', 'text-transform: uppercase;', 'letter-spacing: 0.05em;', 'font-size: 0.8rem;')}>Message</span>
        <code id="checkpoint-modal-message" ${styles('text-color-SkyLavender', 'text-sm')}></code>
      </div>

      <!-- Meta -->
      <div ${styles('flex', 'flex-col', 'gap-1')}>
        <span ${styles('text-xs', 'font-sans', 'text-color-gray-300', 'font-weight: bold;', 'text-transform: uppercase;', 'letter-spacing: 0.05em;', 'font-size: 0.8rem;')}>Metadata</span>
        <div id="checkpoint-modal-meta">
          <span style="font-size:0.75rem; color: rgb(115 115 115); font-style: italic;">(no metadata)</span>
        </div>
      </div>

      <!-- Technical info -->
      <details>
        <summary ${styles('text-xs', 'font-sans', 'text-color-gray-300', 'cursor: pointer;', 'font-weight: bold;', 'text-transform: uppercase;', 'letter-spacing: 0.05em;', 'font-size: 0.8rem;')}>Technical Info</summary>
        <div id="checkpoint-modal-tech" ${styles('flex', 'flex-col', 'gap-2', 'margin-top: 0.5rem;')}></div>
      </details>

      <!-- Buttons -->
      <div ${styles('flex', 'flex-row', 'gap-2', 'justify-between', 'margin-top: 0.5rem;')}>
        <div ${styles('flex', 'flex-row', 'gap-2')}>
          <button class="button" onclick="Playground.shareCheckpoint()" ${styles('bg-gray-700', 'text-color-gray-400', 'font-sans')} title="Copy shareable link to clipboard">Share</button>
          <button class="button" onclick="Playground.downloadCheckpoint()" ${styles('bg-gray-700', 'text-color-gray-400', 'font-sans')} title="Download snapshot as JSON file">Download</button>
          <button class="button" onclick="Playground.saveCheckpoint()" ${styles('bg-gray-700', 'text-color-gray-400', 'font-sans')} title="Save snapshot to local storage">Save</button>
        </div>
        <button class="button" onclick="Playground.closeCheckpointModal()" ${styles('bg-gray-700', 'text-color-Mint', 'font-sans', 'flex', 'gap-2', 'items-center')}>
          <span>Close</span><span ${styles('text-color-gray-500')} style="font-size:0.7rem;">↵</span>
        </button>
      </div>
    </div>
  </div>

  <div id="effect-modal" style="display:none; position:fixed; inset:0; z-index:200; background:rgba(0,0,0,0.6); align-items:center; justify-content:center;">
    <div ${styles('bg-gray-800', 'p-4', 'border-0', 'border-solid', 'border-gray-600', 'flex', 'flex-col', 'gap-3', 'min-width: 24rem;', 'max-width: 48rem;', 'border-width: 1px;', 'border-top: 2px solid #e6c07b;')}>
      <div ${styles('flex', 'flex-row', 'items-center', 'justify-between', 'background-color: rgb(50 50 50);', 'margin: -1rem -1rem 0 -1rem;', 'padding: 0.6rem 1rem;')}>
        <div ${styles('text-color-gray-200', 'font-sans', 'font-size: 1.1rem;', 'font-weight: bold;')}>Unhandled Effect Triggered</div>
        <div id="effect-modal-nav" ${styles('flex', 'flex-row', 'items-center', 'gap-2', 'display: none;')}>
          <button id="effect-modal-prev" onclick="Playground.navigateEffect(-1)" ${styles('bg-gray-700', 'text-color-gray-400', 'font-sans')} style="padding:0.1rem 0.5rem; min-width:1.6rem;">‹</button>
          <span id="effect-modal-counter" ${styles('text-xs', 'font-sans', 'text-color-gray-400')} style="font-weight:bold;"></span>
          <button id="effect-modal-next" onclick="Playground.navigateEffect(1)" ${styles('bg-gray-700', 'text-color-gray-400', 'font-sans')} style="padding:0.1rem 0.5rem; min-width:1.6rem;">›</button>
        </div>
      </div>
      <div id="effect-modal-handled-badge" ${styles('text-xs', 'font-sans', 'display: none;')} style="font-weight:bold; align-items:baseline; flex-wrap:wrap; gap:0.2rem;"></div>
      <div ${styles('flex', 'flex-col', 'gap-2', 'border: 1px solid rgb(82 82 82);', 'padding: 0.75rem;')}>
        <div ${styles('flex', 'flex-col', 'gap-1', 'margin-bottom: 0.25rem;')}>
          <span ${styles('text-xs', 'font-sans', 'text-color-gray-400', 'font-weight: bold;')}>Effect name</span>
          <code id="effect-modal-name" ${styles('text-color-SkyLavender', 'text-sm', 'font-size: 1rem;')}></code>
        </div>
        <div ${styles('flex', 'flex-col', 'gap-1')}>
          <span ${styles('text-xs', 'font-sans', 'text-color-gray-400', 'font-weight: bold;')}>Arguments</span>
          <div id="effect-modal-args" class="fancy-scroll" ${styles('flex', 'flex-col', 'gap-0.5', 'overflow-y: auto;', 'max-height: 12rem;')}></div>
        </div>
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

  <div id="import-snapshot-modal" style="display:none; position:fixed; inset:0; z-index:200; background:rgba(0,0,0,0.6); align-items:center; justify-content:center;">
    <div ${styles('bg-gray-800', 'p-4', 'border-0', 'border-solid', 'border-gray-600', 'flex', 'flex-col', 'gap-3', 'min-width: 36rem;', 'max-width: 64rem;', 'border-width: 1px;')}>
      <div ${styles('text-color-gray-200', 'font-sans', 'font-size: 1.1rem;', 'font-weight: bold;', 'background-color: rgb(50 50 50);', 'margin: -1rem -1rem 0 -1rem;', 'padding: 0.6rem 1rem;')}>Import Snapshot</div>
      <div ${styles('flex', 'flex-col', 'gap-1')}>
        <span ${styles('text-xs', 'font-sans', 'text-color-gray-400')} style="font-weight:bold; text-transform:uppercase; letter-spacing:0.05em;">Paste snapshot JSON</span>
        <textarea id="import-snapshot-textarea" rows="12" class="fancy-scroll" ${styles('bg-gray-850', 'text-color-gray-300', 'border-0', 'p-2', 'text-sm', 'font-mono')} spellcheck="false"></textarea>
        <span id="import-snapshot-error" ${styles('text-color-Rose', 'text-xs', 'hidden')}></span>
      </div>
      <div ${styles('flex', 'flex-row', 'gap-2', 'justify-between', 'margin-top: 0.5rem;')}>
        <button class="button" onclick="Playground.closeImportSnapshotModal()" ${styles('bg-gray-700', 'text-color-gray-400', 'font-sans', 'flex', 'gap-2', 'items-center')}>
          <span>Close</span><span ${styles('text-color-gray-500')} style="font-size:0.7rem;">Esc</span>
        </button>
        <button class="button" onclick="Playground.importSnapshot()" ${styles('bg-gray-700', 'text-color-Mint', 'font-sans')}>Import</button>
      </div>
    </div>
  </div>

  <div id="readline-modal" style="display:none; position:fixed; inset:0; z-index:200; background:rgba(0,0,0,0.6); align-items:center; justify-content:center;">
    <div ${styles('bg-gray-800', 'p-4', 'border-0', 'border-solid', 'border-gray-600', 'flex', 'flex-col', 'gap-3', 'min-width: 24rem;', 'max-width: 48rem;', 'border-width: 1px;', 'border-top: 2px solid #e6c07b;')}>
      <div ${styles('text-color-gray-200', 'font-sans', 'font-size: 1.1rem;', 'font-weight: bold;', 'background-color: rgb(50 50 50);', 'margin: -1rem -1rem 0 -1rem;', 'padding: 0.6rem 1rem;')}>Input</div>
      <div id="readline-prompt" ${styles('text-sm', 'font-sans', 'text-color-gray-400')}></div>
      <textarea id="readline-input" rows="3" ${styles('bg-gray-850', 'text-color-gray-300', 'border-0', 'p-2', 'text-sm', 'font-mono', 'resize: vertical;')} spellcheck="false" autocomplete="off"></textarea>
      <div ${styles('flex', 'flex-row', 'gap-2', 'justify-end', 'margin-top: 0.5rem;')}>
        <button class="button" onclick="Playground.cancelReadline()" ${styles('bg-gray-700', 'text-color-gray-400', 'font-sans', 'flex', 'gap-2', 'items-center')}>
          <span>Cancel</span><span ${styles('text-color-gray-500')} style="font-size:0.7rem;">Esc</span>
        </button>
        <button class="button" onclick="Playground.submitReadline()" ${styles('bg-gray-700', 'text-color-Mint', 'font-sans', 'flex', 'gap-2', 'items-center')}>
          <span>OK</span>
        </button>
      </div>
    </div>
  </div>

  <div id="info-modal" style="display:none; position:fixed; inset:0; z-index:200; background:rgba(0,0,0,0.6); align-items:center; justify-content:center;">
    <div ${styles('bg-gray-800', 'p-4', 'border-0', 'border-solid', 'border-gray-600', 'flex', 'flex-col', 'gap-3', 'min-width: 24rem;', 'max-width: 48rem;', 'border-width: 1px;', 'border-top: 2px solid #e6c07b;')}>
      <div id="info-modal-title" ${styles('text-color-gray-200', 'font-sans', 'font-size: 1.1rem;', 'font-weight: bold;', 'background-color: rgb(50 50 50);', 'margin: -1rem -1rem 0 -1rem;', 'padding: 0.6rem 1rem;')}></div>
      <div id="info-modal-message" ${styles('text-sm', 'font-sans', 'text-color-gray-400')}></div>
      <div ${styles('flex', 'flex-row', 'gap-2', 'justify-end', 'margin-top: 0.5rem;')}>
        <button class="button" onclick="Playground.closeInfoModal()" ${styles('bg-gray-700', 'text-color-Mint', 'font-sans', 'flex', 'gap-2', 'items-center')}>
          <span>OK</span><span ${styles('text-color-gray-500')} style="font-size:0.7rem;">↵</span>
        </button>
      </div>
    </div>
  </div>

  <div id="confirm-modal" style="display:none; position:fixed; inset:0; z-index:200; background:rgba(0,0,0,0.6); align-items:center; justify-content:center;">
    <div ${styles('bg-gray-800', 'p-4', 'border-0', 'border-solid', 'border-gray-600', 'flex', 'flex-col', 'gap-3', 'min-width: 24rem;', 'max-width: 30rem;', 'border-width: 1px;', 'border-top: 2px solid #e6c07b;')}>
      <div id="confirm-modal-title" ${styles('text-color-gray-200', 'font-sans', 'font-size: 1.1rem;', 'font-weight: bold;', 'background-color: rgb(50 50 50);', 'margin: -1rem -1rem 0 -1rem;', 'padding: 0.6rem 1rem;')}></div>
      <div id="confirm-modal-message" ${styles('text-sm', 'font-sans', 'text-color-gray-400')}></div>
      <label id="confirm-modal-checkbox-row" style="display:none;" ${styles('flex', 'items-center', 'gap-2', 'text-sm', 'font-sans', 'text-color-gray-400', 'cursor-pointer')}>
        <input type="checkbox" id="confirm-modal-checkbox">
        <span id="confirm-modal-checkbox-label"></span>
      </label>
      <div ${styles('flex', 'flex-row', 'gap-2', 'justify-end', 'margin-top: 0.5rem;')}>
        <button class="button" onclick="Playground.closeConfirmModal()" ${styles('bg-gray-700', 'text-color-gray-400', 'font-sans', 'flex', 'gap-2', 'items-center')}>
          <span>Cancel</span><span ${styles('text-color-gray-500')} style="font-size:0.7rem;">Esc</span>
        </button>
        <button class="button" id="confirm-modal-ok" ${styles('bg-gray-700', 'text-color-Mint', 'font-sans', 'flex', 'gap-2', 'items-center')}>
          <span>Confirm</span><span ${styles('text-color-gray-500')} style="font-size:0.7rem;">↵</span>
        </button>
      </div>
    </div>
  </div>

  <div id="println-modal" style="display:none; position:fixed; inset:0; z-index:200; background:rgba(0,0,0,0.6); align-items:center; justify-content:center;">
    <div ${styles('bg-gray-800', 'p-4', 'border-0', 'border-solid', 'border-gray-600', 'flex', 'flex-col', 'gap-3', 'min-width: 24rem;', 'max-width: 48rem;', 'border-width: 1px;', 'border-top: 2px solid #e6c07b;')}>
      <div ${styles('text-color-gray-200', 'font-sans', 'font-size: 1.1rem;', 'font-weight: bold;', 'background-color: rgb(50 50 50);', 'margin: -1rem -1rem 0 -1rem;', 'padding: 0.6rem 1rem;')}>Output</div>
      <div class="example-code" ${styles('position: relative;')}>
        <pre id="println-content" class="fancy-scroll" ${styles('bg-gray-850', 'text-color-gray-300', 'p-3', 'text-sm', 'font-mono', 'overflow: auto;', 'max-height: 20rem;', 'max-width: 48rem;', 'white-space: pre;', 'margin: 0;')}></pre>
        <div class="example-action-bar" ${styles('absolute', 'top-0', 'right-0', 'flex-row', 'margin-top: 2px;')}>
          <div class="example-action-btn" ${styles('p-2', 'text-lg', 'cursor-pointer')} id="copy-println-btn">${copyIcon}</div>
        </div>
      </div>
      <div ${styles('flex', 'flex-row', 'gap-2', 'justify-end', 'margin-top: 0.5rem;')}>
        <button class="button" onclick="Playground.dismissPrintln()" ${styles('bg-gray-700', 'text-color-Mint', 'font-sans', 'flex', 'gap-2', 'items-center')}>
          <span>OK</span><span ${styles('text-color-gray-500')} style="font-size:0.7rem;">↵</span>
        </button>
      </div>
    </div>
  </div>

  `
}
