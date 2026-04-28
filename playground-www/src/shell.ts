/**
 * Renders the static app shell (tab bar + tab content areas + modals) into #wrapper.
 * Called once at app startup before scripts.ts accesses DOM elements.
 *
 * Layout: horizontal tab bar at top, tab content fills remaining viewport.
 * The Playground tab contains the three-panel editor (context | code | output).
 * Other tabs render dynamic page content via the router.
 */

import {
  addIcon,
  analyzeIcon,
  boltIcon,
  cameraIcon,
  codeIcon,
  copyIcon,
  debugIcon,
  formatIcon,
  gearIcon,
  githubIcon,
  hamburgerIcon,
  infoIcon,
  pauseIcon,
  playIcon,
  redoIcon,
  saveIcon,
  searchIcon,
  stopIcon,
  syncIcon,
  trashIcon,
  treeIcon,
  undoIcon,
} from './icons'
import { renderEditorMenu } from './editorMenu'

export function renderShell(): void {
  const wrapper = document.getElementById('wrapper')
  if (!wrapper) return
  wrapper.innerHTML = getShellHTML()
}

function getSettingsDropdown(): string {
  const row = (id: string, label: string, title: string, onclick: string) => `
    <div class="settings-dropdown__row" title="${title}">
      <span class="settings-dropdown__label">${label}</span>
      <label class="settings-toggle">
        <input type="checkbox" id="${id}" onclick="${onclick}">
        <span class="settings-toggle-slider"></span>
      </label>
    </div>`

  return `
  <div id="settings-dropdown" class="editor-menu settings-dropdown" style="display:none;">
    <div class="settings-dropdown__section">Appearance</div>
    <div class="settings-dropdown__row" title="Switch between light and dark theme. System follows your OS preference.">
      <span class="settings-dropdown__label">Theme</span>
      <div class="theme-segment" id="theme-segment">
        <button class="theme-segment__btn" id="theme-btn-system" onclick="Playground.setTheme(null)">System</button>
        <button class="theme-segment__btn" id="theme-btn-light" onclick="Playground.setTheme(true)">Light</button>
        <button class="theme-segment__btn" id="theme-btn-dark" onclick="Playground.setTheme(false)">Dark</button>
      </div>
    </div>

    <div class="settings-dropdown__section settings-dropdown__section--gap">Runtime</div>
    ${row('settings-debug-toggle', 'Debug mode', 'Injects source code info into the AST for better error messages.', 'Playground.toggleDebug()')}
    ${row('settings-pure-toggle', 'Pure mode', 'Restricts execution to pure expressions only.', 'Playground.togglePure()')}
    ${row('settings-auto-checkpoint-toggle', 'Disable auto checkpoint', 'When enabled, runtime captures snapshots at file start and after each effect.', 'Playground.toggleAutoCheckpoint()')}

    <div class="settings-dropdown__section settings-dropdown__section--gap">Effects</div>
    ${row('settings-disable-handlers-toggle', 'Disable standard handlers', 'Disables handlers for dvala.* effects (io, sleep, time, random, etc.).', 'Playground.toggleDisableStandardHandlers()')}
    ${row('settings-disable-playground-effects-toggle', 'Disable playground effects', 'Disables handlers for playground.* effects (editor, storage, ui, exec).', 'Playground.toggleDisablePlaygroundEffects()')}
    ${row('settings-intercept-effects-toggle', 'Intercept effects', 'Show a modal when certain effects are triggered.', 'Playground.toggleInterceptEffects()')}
    <div id="settings-intercept-sub-toggles" class="settings-sub-toggles" style="display:none;">
      ${row('settings-intercept-error-toggle', 'Intercept errors', 'Intercepts dvala.error effects.', 'Playground.toggleInterceptError()')}
      ${row('settings-checkpoint-toggle', 'Intercept checkpoints', 'Intercepts dvala.checkpoint effects.', 'Playground.toggleInterceptCheckpoint()')}
      ${row('settings-intercept-unhandled-toggle', 'Intercept unhandled', 'Shows modal for effects without a handler.', 'Playground.toggleInterceptUnhandled()')}
    </div>
    ${row('settings-playground-developer-toggle', 'Playground developer', 'Enables the Developer tab in the settings page.', 'Playground.togglePlaygroundDeveloper()')}

    <div class="settings-dropdown__footer">
      <button class="settings-dropdown__more-btn" onclick="Playground.closeSettingsDropdown();Playground.navigateToTab('settings')">Actions &amp; Storage →</button>
    </div>
  </div>`
}

function getShellHTML(): string {
  return `
  <nav id="tab-bar">
    <button class="tab-bar__nav-hamburger" id="tab-btn-nav-menu" onclick="Playground.toggleNavMenu(event)" title="Navigation">${hamburgerIcon}</button>
    <img class="tab-bar__logo" src="images/dvala-logo.webp" alt="Dvala" width="800" height="232" onclick="Playground.navigate('/')">
    <div class="tab-bar__tabs">
      <a class="tab-bar__tab" id="tab-btn-editor" href="#" onclick="event.preventDefault();Playground.navigateToTab('editor')">Editor</a>
      <a class="tab-bar__tab" id="tab-btn-ref" href="#" onclick="event.preventDefault();Playground.navigateToTab('ref')">Reference</a>
      <a class="tab-bar__tab" id="tab-btn-examples" href="#" onclick="event.preventDefault();Playground.navigateToTab('examples')">Examples</a>
      <a class="tab-bar__tab" id="tab-btn-book" href="#" onclick="event.preventDefault();Playground.navigateToTab('book')">The Book</a>
    </div>
    <div class="tab-bar__icons">
      <button class="tab-bar__tab tab-bar__tab--icon" id="tab-btn-search" onclick="Playground.toggleHeaderSearch(event)" title="Search">${searchIcon}</button>
      <button class="tab-bar__tab tab-bar__tab--icon" id="tab-btn-settings" onclick="Playground.toggleSettingsDropdown(this)" title="Settings">${gearIcon}</button>
    </div>
  </nav>
  ${getSettingsDropdown()}

  <div id="tab-content">
    <div id="tab-home" class="tab-pane">
      <main id="main-panel" class="fancy-scroll">
        <div id="dynamic-page"></div>
        ${getSettingsPage()}
      </main>
    </div>

    <div id="tab-editor" class="tab-pane" style="display:none;">
      ${getPlaygroundPanel()}
    </div>
  </div>

  ${getModals()}


  ${getMobileOverlay()}

  <div id="toast-container"></div>
  `
}

function getPlaygroundPanel(): string {
  const moreMenu = renderEditorMenu({
    id: 'more-menu',
    items: [
      { action: 'Playground.closeMoreMenu();Playground.run()', icon: playIcon, label: 'Run', shortcut: 'Ctrl+R' },
      {
        action: 'Playground.closeMoreMenu();void Playground.runSync()',
        icon: syncIcon,
        label: 'Run sync',
        shortcut: '⇧Ctrl+R',
      },
      {
        action: 'Playground.closeMoreMenu();Playground.format()',
        icon: formatIcon,
        label: 'Format',
        shortcut: 'Ctrl+F',
      },
      {
        action: 'Playground.closeMoreMenu();Playground.analyze()',
        icon: analyzeIcon,
        label: 'Analyze',
        shortcut: 'Ctrl+A',
      },
      {
        action: 'Playground.closeMoreMenu();Playground.typecheck()',
        icon: infoIcon,
        label: 'Typecheck',
        shortcut: '⇧Ctrl+T',
      },
      {
        action: 'Playground.closeMoreMenu();Playground.tokenize()',
        icon: codeIcon,
        label: 'Tokenize',
        shortcut: 'Ctrl+T',
      },
      {
        action: 'Playground.closeMoreMenu();Playground.parse()',
        icon: treeIcon,
        label: 'Parse AST',
        shortcut: 'Ctrl+P',
      },
      { action: 'Playground.closeMoreMenu();Playground.parseCst()', icon: treeIcon, label: 'Parse CST' },
      { action: 'Playground.closeMoreMenu();Playground.docTree()', icon: formatIcon, label: 'Doc tree' },
      { action: 'Playground.closeMoreMenu();Playground.saveAs()', icon: saveIcon, label: 'Save as…' },
      { action: 'Playground.closeMoreMenu();Playground.toggleDebug()', icon: debugIcon, label: 'Toggle debug' },
    ],
  })

  const filesHeaderMenu = renderEditorMenu({
    id: 'files-header-menu',
    items: [
      { action: 'Playground.closeFilesHeaderMenu();Playground.openImportFileModal()', icon: addIcon, label: 'Import' },
      {
        action: 'Playground.closeFilesHeaderMenu();Playground.clearUnlockedFiles()',
        danger: true,
        icon: trashIcon,
        label: 'Remove unlocked',
      },
    ],
  })

  const snapshotsHeaderMenu = renderEditorMenu({
    id: 'snapshots-header-menu',
    items: [
      {
        action: 'Playground.closeSnapshotsHeaderMenu();Playground.openImportSnapshotModal()',
        icon: addIcon,
        label: 'Import',
      },
      {
        action: 'Playground.closeSnapshotsHeaderMenu();Playground.clearUnlockedSnapshots()',
        danger: true,
        icon: trashIcon,
        label: 'Remove unlocked',
      },
    ],
  })

  return `
    <div id="editor-toolbar">
      <div class="editor-toolbar__left">
        <span id="editor-toolbar-title" class="editor-toolbar__title"></span>
      </div>
      <div class="editor-toolbar__right">
        <a href="#" role="button" id="run-btn" onclick="Playground.run()" title="Run (Ctrl+R)"><span class="run-btn__idle">${playIcon} Run</span><span class="run-btn__busy"><span class="spinner"></span> Running…</span></a>
        <span id="execution-status-inline" class="execution-status-inline" style="display:none;">Running</span>
        <button id="exec-play-btn-inline" class="exec-btn-inline" title="Resume" style="display:none;">${playIcon}</button>
        <button id="exec-pause-btn-inline" class="exec-btn-inline" title="Pause" style="display:none;">${pauseIcon}</button>
        <button id="exec-stop-btn-inline" class="exec-btn-inline" title="Stop" style="display:none;">${stopIcon}</button>
        <div>
          <a href="#" role="button" id="more-btn" onclick="Playground.openMoreMenu(this)" aria-label="More actions">${hamburgerIcon}
            ${moreMenu}
          </a>
        </div>
      </div>
    </div>

    <div id="editor-top" class="editor-top">
      <div id="side-panel-icons" class="side-panel__icons">
        <button class="side-panel__icon side-panel__icon--active" id="side-icon-files" onclick="Playground.showSideTab('files')" title="Files">${copyIcon}</button>
        <button class="side-panel__icon" id="side-icon-context" onclick="Playground.showSideTab('context')" title="Effect Handlers">${boltIcon}</button>
        <button class="side-panel__icon" id="side-icon-snapshots" onclick="Playground.showSideTab('snapshots')" title="Snapshots">${cameraIcon}</button>
      </div>

      <div id="side-panel-header" class="panel-header">
        <div id="side-header-files">
          <a href="#" role="button" onclick="event.preventDefault();Playground.showSideTab('files')" class="panel-header__title panel-header__title-link">Files</a>
        </div>
        <div id="side-header-snapshots" style="display:none;">
          <a href="#" role="button" onclick="event.preventDefault();Playground.showSideTab('snapshots')" class="panel-header__title panel-header__title-link">Snapshots</a>
        </div>
        <div id="side-header-context" style="display:none;">
          <span class="panel-header__title">Context</span>
        </div>
        <div class="panel-header__actions" id="side-header-actions-files">
          <a href="#" role="button" onclick="Playground.newFile()" class="panel-header__icon-btn" aria-label="New file" title="New file">${addIcon}</a>
          <a href="#" role="button" id="files-header-menu-button" onclick="event.preventDefault();Playground.openFilesHeaderMenu(this)" class="panel-header__icon-btn" aria-label="Files actions" title="Files actions">
            ${hamburgerIcon}
            ${filesHeaderMenu}
          </a>
        </div>
        <div class="panel-header__actions" id="side-header-actions-snapshots" style="display:none;">
          <a href="#" role="button" id="snapshots-header-menu-button" onclick="event.preventDefault();Playground.openSnapshotsHeaderMenu(this)" class="panel-header__icon-btn" aria-label="Snapshot actions" title="Snapshot actions">
            ${hamburgerIcon}
            ${snapshotsHeaderMenu}
          </a>
        </div>
        <div class="panel-header__actions" id="side-header-actions-context" style="display:none;">
          <a href="#" role="button" onclick="event.preventDefault();Playground.openContextJsonModal()" class="panel-header__icon-btn" aria-label="Show full context JSON" title="Show full context JSON">${codeIcon}</a>
        </div>
      </div>

      <div id="dvala-panel-header" class="panel-header">
        <div id="dvala-panel-header-content">
          <div id="dvala-header-editor" class="panel-header__code-title">
            <span id="dvala-code-title-string" class="panel-header__title-string"></span>
            <span id="dvala-code-pending-indicator" class="pending-indicator" style="display:none;" title="Unsaved"></span>
            <span id="dvala-code-locked-indicator" class="locked-indicator" style="display:none;" title="Read-only"><svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zm3-2V7a4 4 0 1 1 8 0v4m-4 4v2"/></svg> Read-only</span>
            <input id="dvala-code-title-input" type="text" style="display:none;">
          </div>
          <div id="dvala-header-snapshot" class="snapshot-breadcrumbs" style="display:none;"></div>
        </div>
        <div class="panel-header__actions" id="dvala-panel-header-actions">
            <a href="#" role="button" id="save-scratch-btn" onclick="event.preventDefault();Playground.saveScratch()" class="panel-header__icon-btn" title="Save scratch" style="display:none;">${saveIcon}<span>Save scratch</span></a>
          <a href="#" role="button" id="dvala-code-undo-button" onclick="Playground.undoDvalaCodeHistory()" aria-label="Undo code" style="display:none;">${undoIcon}</a>
          <a href="#" role="button" id="dvala-code-redo-button" onclick="Playground.redoDvalaCodeHistory()" aria-label="Redo code" style="display:none;">${redoIcon}</a>
          <a href="#" role="button" id="file-close-btn" onmousedown="event.preventDefault();event.stopPropagation();Playground.closeActiveFile()" title="Close file" style="display:none;">✕</a>
          <a href="#" role="button" id="snapshot-close-btn" onmousedown="event.preventDefault();event.stopPropagation();Playground.closeSnapshotView()" title="Back to editor" style="display:none;">✕</a>
        </div>
      </div>

      <div id="side-panel-content" class="side-panel__content">
        <div id="side-tab-files" class="side-panel__tab">
          <div id="explorer-file-list" class="explorer-list fancy-scroll"></div>
           <div id="explorer-file-stats" class="file-stats-panel"></div>
        </div>
          <div id="side-tab-snapshots" class="side-panel__tab" style="display:none;">
            <div id="side-snapshots-list" class="explorer-list fancy-scroll"></div>
          </div>
          <div id="side-tab-context" class="side-panel__tab" style="display:none;">
            <textarea id="context-textarea" class="panel-textarea fancy-scroll" spellcheck="false" aria-label="Context JSON" style="display:none;"></textarea>
            <div id="context-entry-list" class="explorer-list fancy-scroll"></div>
            <a id="context-undo-button" style="display:none;"></a>
            <a id="context-redo-button" style="display:none;"></a>
            <div id="add-context-menu" style="display:none;">
              <input id="new-context-name">
              <textarea id="new-context-value"></textarea>
              <span id="new-context-error" style="display:none;"></span>
            </div>
          </div>
      </div>

      <div id="resize-divider-1"></div>

      <div id="dvala-panel">
        <div id="dvala-editor-view">
          <div id="editor-tab-strip" class="editor-tab-strip" role="tablist" aria-label="Open files"></div>
          <div id="dvala-editor-host" class="dvala-editor-host" aria-label="Dvala code editor"></div>
        </div>
        <div id="context-detail-view" style="display:none;">
          <textarea id="context-detail-textarea" class="panel-textarea fancy-scroll" spellcheck="false" aria-label="Context binding JSON"></textarea>
        </div>
        <div id="dvala-empty-view" class="dvala-empty-view" style="display:none;"></div>
        <div id="dvala-snapshot-view" style="display:none;">
          <div id="snapshot-content" class="snapshot-content fancy-scroll"></div>
          <div id="snapshot-footer"></div>
        </div>
      </div>
      <div id="resize-divider-3"></div>
      <div id="right-panel" class="layout-panel"></div>
    </div>

    <div id="resize-divider-2"></div>

    <div id="bottom-panel" class="layout-panel"></div>
    <!-- Output content is mounted into the bottom panel by createPanel; the
         old standalone #output-panel + #output-result divs now live inside
         a tab body that the Panel component manages. The static markup
         below seeds #output-result so existing code paths can reach it
         before boot finishes; createPanel re-parents it once the panel is
         constructed. -->
    <!-- Output tab body. The Clear button is moved into the panel tab
         strip at boot time via the trailingActions option so the panel
         has a single visual bar instead of a strip plus toolbar pair. -->
    <template id="bottom-panel-output-template">
      <div id="output-result" class="fancy-scroll"></div>
    </template>
    <template id="bottom-panel-output-trailing-template">
      <a href="#" role="button" onclick="Playground.resetOutput()" class="panel-header__icon-btn output-clear-btn" aria-label="Clear output">${trashIcon} Clear</a>
    </template>

  `
}

function getModals(): string {
  const modal = (id: string, content: string) =>
    `<div id="${id}" class="modal-overlay" style="display:none;">${content}</div>`

  const box = (content: string) => `<div class="modal-box">${content}</div>`

  return `
  ${modal(
    'export-modal',
    box(`
    <div class="modal-header"><span class="modal-header__title">Export</span></div>
    <div class="modal-checklist">
      <label class="modal-checklist__item"><input type="checkbox" id="export-opt-code" checked> Code</label>
      <label class="modal-checklist__item"><input type="checkbox" id="export-opt-context"> Context</label>
      <label class="modal-checklist__item"><input type="checkbox" id="export-opt-settings"> Settings</label>
      <label class="modal-checklist__item"><input type="checkbox" id="export-opt-saved-snapshots"> Saved snapshots</label>
      <label class="modal-checklist__item"><input type="checkbox" id="export-opt-recent-snapshots"> Recent snapshots</label>
      <label class="modal-checklist__item"><input type="checkbox" id="export-opt-layout"> Layout</label>
      <label class="modal-checklist__item"><input type="checkbox" id="export-opt-saved-files"> Saved files</label>
    </div>
    <div class="modal-btn-row">
      <button class="button" onclick="Playground.doExport()">Export</button>
      <button class="button" onclick="Playground.closeExportModal()">Cancel</button>
    </div>
  `),
  )}

  ${modal(
    'import-options-modal',
    box(`
    <div class="modal-header"><span class="modal-header__title">Import options</span></div>
    <div class="modal-checklist">
      <label class="modal-checklist__item"><input type="checkbox" id="import-opt-code" checked><span id="import-opt-code-label">Code</span></label>
      <label class="modal-checklist__item"><input type="checkbox" id="import-opt-context"><span id="import-opt-context-label">Context</span></label>
      <label class="modal-checklist__item"><input type="checkbox" id="import-opt-settings"><span id="import-opt-settings-label">Settings</span></label>
      <label class="modal-checklist__item"><input type="checkbox" id="import-opt-saved-snapshots"><span id="import-opt-saved-snapshots-label">Saved snapshots</span></label>
      <label class="modal-checklist__item"><input type="checkbox" id="import-opt-recent-snapshots"><span id="import-opt-recent-snapshots-label">Recent snapshots</span></label>
      <label class="modal-checklist__item"><input type="checkbox" id="import-opt-layout"><span id="import-opt-layout-label">Layout</span></label>
      <label class="modal-checklist__item"><input type="checkbox" id="import-opt-saved-files"><span id="import-opt-saved-files-label">Saved files</span></label>
    </div>
    <div class="modal-btn-row">
      <button class="button" onclick="Playground.doImport()">Import</button>
      <button class="button" onclick="Playground.closeImportOptionsModal()">Cancel</button>
    </div>
  `),
  )}

  ${modal(
    'import-result-modal',
    box(`
    <div class="modal-header"><span class="modal-header__title">Import result</span></div>
    <div id="import-result-content" class="modal-body-row"></div>
    <button class="button" onclick="Playground.closeImportResultModal()">OK</button>
  `),
  )}

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
  return `
  <div id="settings-page" class="content content-page">
    <h1 class="content-page__title">Actions &amp; Storage</h1>
    <div class="settings-page__body">
      <div class="settings-tabs">
        <button id="settings-tab-btn-actions" class="settings-tab-btn" onclick="Playground.showSettingsTab('actions')">Actions</button>
        <button id="settings-tab-btn-developer" class="settings-tab-btn" style="display:none" onclick="Playground.showSettingsTab('developer')">Developer</button>
        <button id="settings-tab-btn-benchmarks" class="settings-tab-btn" style="display:none" onclick="Playground.showSettingsTab('benchmarks')">Benchmarks</button>
      </div>

      <div id="settings-tab-developer" class="settings-tab-content">
        <p class="settings-tab-content__desc">Design tokens and color palette for the playground theme.</p>
        <div id="settings-color-palette"></div>
      </div>

      <div id="settings-tab-benchmarks" class="settings-tab-content">
        <p class="settings-tab-content__desc">Pipeline performance history — every commit on the bench-history JSON, charted by scenario. See <code>benchmarks/pipeline-performance.md</code> for the source-of-truth tables.</p>
        <div id="settings-benchmarks-charts"></div>
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

function getMobileOverlay(): string {
  return `
  <div id="mobile-overlay">
    <div class="mobile-overlay__header">
      <img src="images/dvala-logo.webp" alt="Dvala" class="mobile-overlay__logo" width="800" height="232">
      <p class="mobile-overlay__tagline">Run anywhere - Resume everywhere</p>
      <p class="mobile-overlay__subtitle">A suspendable runtime with algebraic effects</p>
    </div>

    <div class="mobile-overlay__note">
      <div class="mobile-overlay__note-title">Editor requires a larger screen</div>
      <p class="mobile-overlay__note-text">
        The code editor needs more space than a phone can offer.
        Visit on a desktop or laptop to write and run Dvala code.
      </p>
    </div>

    <a class="mobile-overlay__github" href="https://github.com/mojir/dvala" target="_blank" rel="noopener">
      ${githubIcon} View on GitHub
    </a>
  </div>`
}
