/**
 * Renders the static app shell (sidebar + playground panel + modals) into #wrapper.
 * Called once at app startup before scripts.ts accesses DOM elements.
 *
 * The #main-panel content area is left empty — the router renders page content there.
 * Settings, saved-programs, and snapshots pages are included here because scripts.ts
 * populates and shows/hides them directly.
 */

import {
  addIcon,
  analyzeIcon,
  cameraIcon,
  codeIcon,
  copyIcon,
  debugIcon,
  downloadIcon,
  formatIcon,
  gearIcon,
  githubIcon,
  hamburgerIcon,
  homeIcon,
  infoIcon,
  labIcon,
  lampIcon,
  newFileIcon,
  pauseIcon,
  playIcon,
  redoIcon,
  saveIcon,
  searchIcon,
  shareIcon,
  stopIcon,
  syncIcon,
  trashIcon,
  treeIcon,
  undoIcon,
} from './icons'
import { getPageHeader } from './utils'

export function renderShell(): void {
  const wrapper = document.getElementById('wrapper')
  if (!wrapper) return
  wrapper.innerHTML = getShellHTML()
}

function getShellHTML(): string {
  return `
  <main id="main-panel" class="fancy-scroll">
    <div id="dynamic-page"></div>
    ${getSettingsPage()}
    ${getSavedProgramsPage()}
    ${getSnapshotsPage()}
  </main>

  <div id="resize-sidebar"></div>

  <nav id="sidebar" class="fancy-scroll-background">
    <div class="sidebar-logo-wrap">
      <img src="images/dvala-logo.webp" alt="Dvala" width="800" height="232" onclick="Playground.navigate('/')">
    </div>
    <div class="sidebar-search-row" onclick="Playground.openSearch()">
      <span class="sidebar-search-icon">${searchIcon}</span>
      <span>Search</span>
      <span class="sidebar-search-kbd">F3</span>
    </div>
    <div class="sidebar-nav-list">
      <a href="#" role="button" id="home-page_link" onclick="Playground.navigate('/')">${homeIcon} Home</a>
      <a href="#" role="button" id="about-page_link" onclick="Playground.navigate('/about')">${infoIcon} About</a>
      <a href="#" role="button" id="tutorials-page_link" onclick="Playground.navigate('/tutorials')">${lampIcon} Tutorials</a>
      <a href="#" role="button" id="example-page_link" onclick="Playground.navigate('/examples')">${labIcon} Examples</a>
    </div>
    <div class="sidebar-nav-item-row">
      <a href="#" role="button" id="saved-programs-page_link" onclick="Playground.showSavedProgramsPage()">
        ${saveIcon} Programs
      </a>
      <span id="programs-nav-indicator" class="nav-indicator"></span>
    </div>
    <div class="sidebar-nav-item-row">
      <a href="#" role="button" id="snapshots-page_link" onclick="Playground.showSnapshotsPage()">
        ${cameraIcon} Snapshots
      </a>
      <span id="snapshots-nav-indicator" class="nav-indicator"></span>
    </div>
    <div class="sidebar-nav-item-row">
      <a href="#" role="button" id="settings-page_link" onclick="Playground.showPage('settings-page','smooth')">${gearIcon} Settings</a>
    </div>
    <div class="sidebar-spacer"></div>
    <div id="api-ref-sections"></div>
    <a class="sidebar-github" href="https://github.com/mojir/dvala" target="_blank" rel="noopener">${githubIcon} GitHub</a>
    <div id="sidebar-version" class="sidebar-version"></div>
  </nav>

  ${getPlaygroundPanel()}

  ${getModals()}

  <div id="search-dialog-overlay">
    <div class="search-dialog-overlay__inner">
      <div id="search-dialog" class="search-dialog">
        <input id="search-input" type="text" placeholder="Search..." class="search-dialog__input" aria-label="Search functions, modules, effects">
        <div id="search-intro">Type to search functions, modules, effects…</div>
        <div id="no-search-result" style="display:none;">No results</div>
        <div id="search-result" class="search-dialog__results fancy-scroll" style="display:none;"></div>
      </div>
    </div>
  </div>

  ${getMobileOverlay()}

  <div id="toast-container"></div>
  `
}

function getPlaygroundPanel(): string {
  return `
  <div id="playground">
    <div id="resize-playground"></div>
    <div id="panels-container">

      <div id="context-panel">
        <div class="panel-header" onclick="Playground.focusContext()">
          <div id="context-title" class="panel-header__title">Context</div>
          <div class="panel-header__actions">
            <a href="#" role="button" onclick="Playground.openAddContextMenu()" class="panel-header__icon-btn" aria-label="Add context">${addIcon}
              <div id="add-context-menu" class="dropdown-menu" style="display:none;">
                <div class="dropdown-menu__body">
                  <div class="dropdown-menu__field-group">
                    <label for="new-context-name" class="dropdown-menu__label">Name</label>
                    <input id="new-context-name" class="dropdown-menu__input">
                    <label for="new-context-value" class="dropdown-menu__label">Value (JSON)</label>
                    <textarea id="new-context-value" rows="5" class="dropdown-menu__textarea fancy-scroll"></textarea>
                    <button class="button dropdown-menu__add-btn" onclick="Playground.addContextEntry()">Add</button>
                    <span id="new-context-error" class="dropdown-menu__error" style="display:none;"></span>
                  </div>
                  <a href="#" role="button" onclick="Playground.closeAddContextMenu();Playground.addSampleContext();">Add sample context</a>
                </div>
              </div>
            </a>
            <a href="#" role="button" id="context-undo-button" onclick="Playground.undoContextHistory()" aria-label="Undo context">${undoIcon}</a>
            <a href="#" role="button" id="context-redo-button" onclick="Playground.redoContextHistory()" aria-label="Redo context">${redoIcon}</a>
          </div>
        </div>
        <textarea id="context-textarea" class="panel-textarea fancy-scroll" spellcheck="false" aria-label="Context JSON"></textarea>
      </div>

      <div id="resize-divider-1"></div>

      <div id="dvala-panel">
        <div class="panel-header" onclick="Playground.focusDvalaCode()">
          <div id="dvala-code-title" class="panel-header__code-title">
            <span id="dvala-panel-debug-info" class="panel-header__debug-icon">${debugIcon}</span>
            <span id="dvala-code-title-string" class="panel-header__title-string" onclick="Playground.onProgramTitleClick(event)" title="Click to rename"></span>
            <span id="dvala-code-pending-indicator" class="pending-indicator" style="display:none;" title="Unsaved"></span>
            <input id="dvala-code-title-input" type="text" spellcheck="false" placeholder="Program name"
              class="panel-header__title-input"
              style="display:none;"
              aria-label="Program name"
              onkeydown="Playground.onProgramTitleKeydown(event)"
              onblur="Playground.onProgramTitleBlur()">
          </div>
          <div class="panel-header__actions" onclick="event.stopPropagation()">
            <a href="#" role="button" onclick="Playground.run()" title="Run (Ctrl+R)">${playIcon} Run</a>
            <a href="#" role="button" id="dvala-code-undo-button" onclick="Playground.undoDvalaCodeHistory()" aria-label="Undo code">${undoIcon}</a>
            <a href="#" role="button" id="dvala-code-redo-button" onclick="Playground.redoDvalaCodeHistory()" aria-label="Redo code">${redoIcon}</a>
            <a href="#" role="button" onclick="Playground.newFile()" title="New file" aria-label="New file">${newFileIcon}</a>
            <div>
              <a href="#" role="button" onclick="Playground.openMoreMenu(this)" aria-label="More actions">${hamburgerIcon}
                <div id="more-menu" class="dropdown-menu" style="display:none;">
                  <div class="dropdown-menu__body">
                    <a href="#" role="button" onclick="Playground.closeMoreMenu();Playground.run()" class="menu-item">${playIcon}<span>Run</span><span class="menu-shortcut">Ctrl+R</span></a>
                    <a href="#" role="button" onclick="Playground.closeMoreMenu();void Playground.runSync()" class="menu-item">${syncIcon}<span>Run sync</span><span class="menu-shortcut">⇧Ctrl+R</span></a>
                    <a href="#" role="button" onclick="Playground.closeMoreMenu();Playground.analyze()" class="menu-item">${analyzeIcon}<span>Analyze</span><span class="menu-shortcut">Ctrl+A</span></a>
                    <a href="#" role="button" onclick="Playground.closeMoreMenu();Playground.tokenize()" class="menu-item">${codeIcon}<span>Tokenize</span><span class="menu-shortcut">Ctrl+T</span></a>
                    <a href="#" role="button" onclick="Playground.closeMoreMenu();Playground.parse()" class="menu-item">${treeIcon}<span>Parse</span><span class="menu-shortcut">Ctrl+P</span></a>
                    <a href="#" role="button" onclick="Playground.closeMoreMenu();Playground.format()" class="menu-item">${formatIcon}<span>Format</span><span class="menu-shortcut">Ctrl+F</span></a>
                    <a href="#" role="button" onclick="Playground.closeMoreMenu();Playground.saveAs()" class="menu-item">${saveIcon}<span>Save as…</span></a>
                  </div>
                </div>
              </a>
            </div>
          </div>
        </div>
        <textarea id="dvala-textarea" class="panel-textarea fancy-scroll" spellcheck="false" aria-label="Dvala code editor"></textarea>
      </div>

      <div id="resize-divider-2"></div>

      <div id="output-panel">
        <div class="panel-header">
          <span class="panel-header__title">Output</span>
          <a href="#" role="button" onclick="Playground.resetOutput()" class="panel-header__icon-btn" aria-label="Clear output">${trashIcon}</a>
        </div>
        <div id="output-result" class="fancy-scroll"></div>
      </div>

    </div>
  </div>

  <template id="snapshot-panel-template">
    <div class="snapshot-panel fancy-scroll">
      <div class="modal-header">
        <div data-ref="breadcrumbs" class="snapshot-panel__breadcrumbs"></div>
        <a href="#" role="button" class="modal-header__close-btn" onclick="Playground.popModal()">✕</a>
      </div>
      <div class="snapshot-panel__body">
      <div class="snapshot-panel__columns">
        <div class="snapshot-panel__col">
          <div class="snapshot-panel__section">
            <span class="snapshot-panel__section-label">Metadata</span>
            <div data-ref="meta-container">
              <div class="example-code snapshot-panel__code-block">
                <pre data-ref="meta-json" class="fancy-scroll snapshot-panel__code-pre"></pre>
                <div class="example-action-bar" style="position:absolute;top:0;right:0;">
                  <div class="example-action-btn" data-ref="copy-meta-btn"></div>
                </div>
              </div>
            </div>
          </div>
          <div data-ref="suspended-effect-section" class="snapshot-panel__section">
            <span class="snapshot-panel__section-label">Effect</span>
            <div class="snapshot-panel__field">
              <span class="snapshot-panel__field-label">Name</span>
              <code data-ref="effect-name" class="snapshot-panel__effect-name"></code>
            </div>
            <div data-ref="effect-args" class="snapshot-panel__effect-args fancy-scroll"></div>
          </div>
          <div class="snapshot-panel__section">
            <span class="snapshot-panel__section-label">Technical</span>
            <div data-ref="tech" class="snapshot-panel__tech"></div>
          </div>
        </div>
        <div class="snapshot-panel__col">
          <div data-ref="code-section" class="snapshot-panel__section" style="display:none;">
            <div class="example-code snapshot-panel__code-block">
              <pre data-ref="code-content" class="snapshot-panel__code-pre"></pre>
              <a href="#" role="button" data-ref="add-to-playground" class="snapshot-panel__use-btn">Use in playground</a>
            </div>
          </div>
          <div class="snapshot-panel__section">
            <span class="snapshot-panel__section-label">Checkpoints (<span data-ref="cp-count">0</span>)</span>
            <div data-ref="checkpoints" class="snapshot-panel__checkpoints fancy-scroll"></div>
          </div>
        </div>
      </div>
      </div>
      <div data-ref="buttons" class="snapshot-panel__buttons">
        <div class="snapshot-panel__buttons-left">
          <button data-ref="save-btn" class="button">${saveIcon} Save</button>
          <button data-ref="share-btn" class="button">${shareIcon} Share</button>
          <button data-ref="download-btn" class="button">${downloadIcon} Download</button>
          <button data-ref="copy-json-btn" class="button">${copyIcon} Copy JSON</button>
        </div>
        <button data-ref="resume-btn" class="button button--primary">Run</button>
      </div>
    </div>
  </template>

  `
}

function getModals(): string {
  const modal = (id: string, content: string) =>
    `<div id="${id}" class="modal-overlay" style="display:none;">${content}</div>`

  const box = (content: string) =>
    `<div class="modal-box">${content}</div>`

  return `
  ${modal('export-modal', box(`
    <div class="modal-header"><span class="modal-header__title">Export</span></div>
    <div class="modal-checklist">
      <label class="modal-checklist__item"><input type="checkbox" id="export-opt-code" checked> Code</label>
      <label class="modal-checklist__item"><input type="checkbox" id="export-opt-context"> Context</label>
      <label class="modal-checklist__item"><input type="checkbox" id="export-opt-settings"> Settings</label>
      <label class="modal-checklist__item"><input type="checkbox" id="export-opt-saved-snapshots"> Saved snapshots</label>
      <label class="modal-checklist__item"><input type="checkbox" id="export-opt-recent-snapshots"> Recent snapshots</label>
      <label class="modal-checklist__item"><input type="checkbox" id="export-opt-layout"> Layout</label>
      <label class="modal-checklist__item"><input type="checkbox" id="export-opt-saved-programs"> Saved programs</label>
    </div>
    <div class="modal-btn-row">
      <button class="button" onclick="Playground.doExport()">Export</button>
      <button class="button" onclick="Playground.closeExportModal()">Cancel</button>
    </div>
  `))}

  ${modal('import-options-modal', box(`
    <div class="modal-header"><span class="modal-header__title">Import options</span></div>
    <div class="modal-checklist">
      <label class="modal-checklist__item"><input type="checkbox" id="import-opt-code" checked><span id="import-opt-code-label">Code</span></label>
      <label class="modal-checklist__item"><input type="checkbox" id="import-opt-context"><span id="import-opt-context-label">Context</span></label>
      <label class="modal-checklist__item"><input type="checkbox" id="import-opt-settings"><span id="import-opt-settings-label">Settings</span></label>
      <label class="modal-checklist__item"><input type="checkbox" id="import-opt-saved-snapshots"><span id="import-opt-saved-snapshots-label">Saved snapshots</span></label>
      <label class="modal-checklist__item"><input type="checkbox" id="import-opt-recent-snapshots"><span id="import-opt-recent-snapshots-label">Recent snapshots</span></label>
      <label class="modal-checklist__item"><input type="checkbox" id="import-opt-layout"><span id="import-opt-layout-label">Layout</span></label>
      <label class="modal-checklist__item"><input type="checkbox" id="import-opt-saved-programs"><span id="import-opt-saved-programs-label">Saved programs</span></label>
    </div>
    <div class="modal-btn-row">
      <button class="button" onclick="Playground.doImport()">Import</button>
      <button class="button" onclick="Playground.closeImportOptionsModal()">Cancel</button>
    </div>
  `))}

  ${modal('import-result-modal', box(`
    <div class="modal-header"><span class="modal-header__title">Import result</span></div>
    <div id="import-result-content" class="modal-body-row"></div>
    <button class="button" onclick="Playground.closeImportResultModal()">OK</button>
  `))}

  <div id="snapshot-modal" class="modal-overlay" style="display:none;">
    <div id="snapshot-panel-container" class="modal-box snapshot-panel-container"></div>
  </div>

  <div id="execution-control-bar" class="execution-control-bar" style="display:none;">
    <span id="execution-status" class="execution-status">Running</span>
    <div class="execution-controls">
      <button id="exec-play-btn" class="exec-btn" title="Resume">${playIcon}</button>
      <button id="exec-pause-btn" class="exec-btn" title="Pause (Suspend)">${pauseIcon}</button>
      <button id="exec-stop-btn" class="exec-btn" title="Stop (Halt)">${stopIcon}</button>
    </div>
  </div>
  `
}

function getSettingsPage(): string {
  const toggle = (id: string, label: string, description: string, onclick: string) => `
    <div class="settings-toggle-row">
      <div class="settings-toggle-row__labels">
        <span class="settings-toggle-row__label">${label}</span>
        <span class="settings-toggle-row__desc">${description}</span>
      </div>
      <label class="settings-toggle">
        <input type="checkbox" id="${id}" onclick="${onclick}">
        <span class="settings-toggle-slider"></span>
      </label>
    </div>`

  const tabBtn = (id: string, label: string) =>
    `<button id="settings-tab-btn-${id}" class="settings-tab-btn" onclick="Playground.showSettingsTab('${id}')">${label}</button>`

  return `
  <div id="settings-page" class="content content-page">
    ${getPageHeader()}
    <h1 class="content-page__title">Settings</h1>
    <div class="settings-page__body">
      <div class="settings-tabs">
        ${tabBtn('dvala', 'Dvala')}
        ${tabBtn('playground', 'Playground')}
        ${tabBtn('actions', 'Actions')}
      </div>

      <div id="settings-tab-dvala" class="settings-tab-content">
        <p class="settings-tab-content__desc">Configure the Dvala language runtime behavior.</p>
        ${toggle('settings-debug-toggle', 'Debug mode', 'Injects source code info into the AST for better error messages.', 'Playground.toggleDebug()')}
        ${toggle('settings-pure-toggle', 'Pure mode', 'Restricts execution to pure expressions only.', 'Playground.togglePure()')}
        ${toggle('settings-auto-checkpoint-toggle', 'Disable auto checkpoint', 'When enabled, runtime captures snapshots before every effect.', 'Playground.toggleAutoCheckpoint()')}
      </div>

      <div id="settings-tab-playground" class="settings-tab-content">
        <p class="settings-tab-content__desc">Configure how the playground handles effects and interacts with running programs.</p>
        ${toggle('settings-disable-handlers-toggle', 'Disable Playground effect handlers', 'Disables built-in playground handlers.', 'Playground.toggleDisablePlaygroundHandlers()')}
        ${toggle('settings-intercept-effects-toggle', 'Intercept effects', 'Show a modal when certain effects are triggered.', 'Playground.toggleInterceptEffects()')}
        <div id="settings-intercept-sub-toggles" class="settings-sub-toggles" style="display:none;">
          ${toggle('settings-intercept-error-toggle', 'Intercept errors', 'Intercepts dvala.error effects.', 'Playground.toggleInterceptError()')}
          ${toggle('settings-checkpoint-toggle', 'Intercept checkpoints', 'Intercepts dvala.checkpoint effects.', 'Playground.toggleInterceptCheckpoint()')}
          ${toggle('settings-intercept-unhandled-toggle', 'Intercept unhandled', 'Shows modal for effects without a handler.', 'Playground.toggleInterceptUnhandled()')}
        </div>
      </div>

      <div id="settings-tab-actions" class="settings-tab-content">
        <p class="settings-tab-content__desc">Manage playground data and storage. Reset or clear data, export and import, or share a link.</p>

        <div class="settings-action-row">
          <div class="settings-action-row__info">
            <span class="settings-action-row__label">Share</span>
            <span class="settings-action-row__desc">Copy a shareable link with the current code and context encoded in the URL.</span>
          </div>
          <button class="button" onclick="Playground.share()">
            <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81c1.66 0 3-1.34 3-3s-1.34-3-3-3s-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65c0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>
            Copy link
          </button>
        </div>

        <div class="settings-action-row">
          <div class="settings-action-row__info">
            <span class="settings-action-row__label">Import</span>
            <span class="settings-action-row__desc">Restore playground data from a previously exported JSON file. Current data will be replaced.</span>
          </div>
          <button class="button" onclick="Playground.importPlayground()">
            <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="M9 16h6v-6h4l-7-7l-7 7h4zm-4 2h14v2H5z"/></svg>
            Import
          </button>
        </div>

        <div class="settings-action-row">
          <div class="settings-action-row__info">
            <span class="settings-action-row__label">Export</span>
            <span class="settings-action-row__desc">Download all playground data as a JSON file. Includes snapshots, code, context, and settings.</span>
          </div>
          <button class="button" onclick="Playground.exportPlayground()">
            <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7zM5 18v2h14v-2z"/></svg>
            Export
          </button>
        </div>

        <div class="settings-action-section-header">Storage</div>

        <div class="settings-action-row">
          <div class="settings-action-row__info">
            <span class="settings-action-row__label">Local Storage <span id="settings-storage-local" class="settings-action-row__size"></span></span>
            <span class="settings-action-row__desc">Stores code, context, settings, and layout preferences.</span>
          </div>
          <button class="button" onclick="Playground.clearLocalStorageData()">
            <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z"/></svg>
            Clear
          </button>
        </div>

        <div class="settings-action-row">
          <div class="settings-action-row__info">
            <span class="settings-action-row__label">IndexedDB <span id="settings-storage-idb" class="settings-action-row__size"></span></span>
            <span class="settings-action-row__desc">Stores snapshots (saved and terminal).</span>
          </div>
          <button class="button" onclick="Playground.clearIndexedDbData()">
            <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z"/></svg>
            Clear
          </button>
        </div>
      </div>
    </div>
  </div>`
}

function getSavedProgramsPage(): string {
  return `
  <div id="saved-programs-page" class="content content-page">
    ${getPageHeader()}
    <div class="list-page__header">
      <span class="list-page__heading">Programs</span>
      <div class="list-page__actions">
        <button id="saved-programs-clear-all" onclick="Playground.clearUnlockedPrograms()" class="list-page__action-btn">${trashIcon} Remove unlocked</button>
        <button onclick="Playground.openImportProgramModal()" class="list-page__action-btn">${addIcon} Import</button>
      </div>
    </div>
    <div id="saved-programs-list" class="list-page__list"></div>
    <div id="saved-programs-empty" class="list-page__empty">No saved programs yet.</div>
  </div>`
}

function getSnapshotsPage(): string {
  return `
  <div id="snapshots-page" class="content content-page">
    ${getPageHeader()}
    <div class="list-page__header">
      <span class="list-page__heading">Snapshots</span>
      <div class="list-page__actions">
        <button id="snapshots-clear-all" onclick="Playground.clearUnlockedSnapshots()" class="list-page__action-btn">${trashIcon} Remove unlocked</button>
        <button onclick="Playground.openImportSnapshotModal()" class="list-page__action-btn">${addIcon} Import</button>
      </div>
    </div>
    <div id="snapshots-list" class="list-page__list"></div>
    <div id="snapshots-empty" class="list-page__empty">No snapshots yet.</div>
  </div>`
}

function getMobileOverlay(): string {
  return `
  <div id="mobile-overlay">
    <div class="mobile-overlay__header">
      <img src="images/dvala-logo.webp" alt="Dvala" class="mobile-overlay__logo" width="800" height="232">
      <p class="mobile-overlay__tagline">Run anywhere - Resume everywhere</p>
      <p class="mobile-overlay__subtitle">A suspendable, time-traveling functional language for JavaScript</p>
    </div>

    <div class="mobile-overlay__note">
      <div class="mobile-overlay__note-title">Desktop Required</div>
      <p class="mobile-overlay__note-text">
        The Dvala Playground is an interactive code editor that requires a larger screen.
        Please visit on a desktop or laptop to explore Dvala.
      </p>
    </div>

    <a class="mobile-overlay__github" href="https://github.com/mojir/dvala" target="_blank" rel="noopener">
      ${githubIcon} View on GitHub
    </a>
  </div>`
}
