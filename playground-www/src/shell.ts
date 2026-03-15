/**
 * Renders the static app shell (sidebar + playground panel + modals) into #wrapper.
 * Called once at app startup before scripts.ts accesses DOM elements.
 *
 * The #main-panel content area is left empty — the router renders page content there.
 * Settings, saved-programs, and snapshots pages are included here because scripts.ts
 * populates and shows/hides them directly.
 */

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
      <img src="images/dvala-logo.png" alt="Dvala" onclick="Playground.showPage('index','smooth')">
    </div>
    <div class="sidebar-search-row" onclick="Playground.openSearch()">
      <span>🔍 Search</span>
      <span class="sidebar-search-kbd">F3</span>
    </div>
    <div class="sidebar-nav-list">
      <a id="home-page_link" onclick="Playground.showPage('index','smooth')">🏠 Home</a>
      <a id="about-page_link" onclick="Playground.showPage('about-page','smooth')">ℹ️ About</a>
      <a id="tutorials-page_link" onclick="Playground.showTutorialsPage()">💡 Tutorials</a>
      <a id="example-page_link" onclick="Playground.navigate('/examples')">🧪 Examples</a>
    </div>
    <div class="sidebar-nav-item-row">
      <a id="saved-programs-page_link" onclick="Playground.showSavedProgramsPage()">
        💾 Programs
      </a>
      <span id="programs-nav-indicator" class="nav-indicator"></span>
    </div>
    <div class="sidebar-nav-item-row">
      <a id="snapshots-page_link" onclick="Playground.showSnapshotsPage()">
        📷 Snapshots
      </a>
      <span id="snapshots-nav-indicator" class="nav-indicator"></span>
    </div>
    <div class="sidebar-nav-item-row">
      <a id="settings-page_link" onclick="Playground.showPage('settings-page','smooth')">⚙️ Settings</a>
    </div>
    <div class="sidebar-spacer"></div>
    <div class="sidebar-section-label">API Reference</div>
    <div id="api-content-special-expressions" class="sidebar-collapsible-content"></div>
    <div id="api-content-core-functions" class="sidebar-collapsible-content"></div>
    <div id="api-content-effects" class="sidebar-collapsible-content"></div>
    <div id="api-content-shorthands" class="sidebar-collapsible-content"></div>
    <div id="api-content-datatypes" class="sidebar-collapsible-content"></div>
    <div id="api-content-modules" class="sidebar-collapsible-content"></div>
  </nav>

  ${getPlaygroundPanel()}

  ${getModals()}

  <div id="search-dialog-overlay">
    <div class="search-dialog-overlay__inner">
      <div id="search-dialog" class="search-dialog">
        <input id="search-input" type="text" placeholder="Search..." class="search-dialog__input">
        <div id="search-intro">Type to search functions, modules, effects…</div>
        <div id="no-search-result" style="display:none;">No results</div>
        <div id="search-result" class="search-dialog__results fancy-scroll" style="display:none;"></div>
      </div>
    </div>
  </div>

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
            <a onclick="Playground.openAddContextMenu()" class="panel-header__icon-btn">+
              <div id="add-context-menu" class="dropdown-menu" style="display:none;">
                <div class="dropdown-menu__body">
                  <div class="dropdown-menu__field-group">
                    <span class="dropdown-menu__label">Name</span>
                    <input id="new-context-name" class="dropdown-menu__input">
                    <span class="dropdown-menu__label">Value (JSON)</span>
                    <textarea id="new-context-value" rows="5" class="dropdown-menu__textarea fancy-scroll"></textarea>
                    <button class="button dropdown-menu__add-btn" onclick="Playground.addContextEntry()">Add</button>
                    <span id="new-context-error" class="dropdown-menu__error" style="display:none;"></span>
                  </div>
                  <a onclick="Playground.closeAddContextMenu();Playground.addSampleContext();">Add sample context</a>
                </div>
              </div>
            </a>
            <a id="context-undo-button" onclick="Playground.undoContextHistory()">↩</a>
            <a id="context-redo-button" onclick="Playground.redoContextHistory()">↪</a>
          </div>
        </div>
        <textarea id="context-textarea" class="panel-textarea fancy-scroll" spellcheck="false"></textarea>
      </div>

      ><div id="resize-divider-1"></div>

      ><div id="dvala-panel">
        <div class="panel-header" onclick="Playground.focusDvalaCode()">
          <div id="dvala-code-title" class="panel-header__code-title">
            <span id="dvala-panel-debug-info" class="panel-header__debug-icon">🐛</span>
            <span id="dvala-code-title-string" class="panel-header__title-string" onclick="Playground.onProgramTitleClick(event)" title="Click to rename"></span>
            <span id="dvala-code-pending-indicator" class="pending-indicator" style="display:none;" title="Unsaved"></span>
            <input id="dvala-code-title-input" type="text" spellcheck="false" placeholder="Program name"
              class="panel-header__title-input"
              style="display:none;"
              onkeydown="Playground.onProgramTitleKeydown(event)"
              onblur="Playground.onProgramTitleBlur()">
          </div>
          <div class="panel-header__actions" onclick="event.preventDefault();event.stopPropagation()">
            <a onclick="Playground.run()" title="Run (Ctrl+R)">▶ Run</a>
            <a id="dvala-code-undo-button" onclick="Playground.undoDvalaCodeHistory()">↩</a>
            <a id="dvala-code-redo-button" onclick="Playground.redoDvalaCodeHistory()">↪</a>
            <a onclick="Playground.newFile()" title="New file">📄</a>
            <div>
              <a onclick="Playground.openMoreMenu(this)">☰
                <div id="more-menu" class="dropdown-menu" style="display:none;">
                  <div class="dropdown-menu__body">
                    <a onclick="Playground.closeMoreMenu();Playground.run()">▶ Run — Ctrl+R</a>
                    <a onclick="Playground.closeMoreMenu();void Playground.runSync()">▶ Run sync — Ctrl+Shift+R</a>
                    <a onclick="Playground.closeMoreMenu();Playground.analyze()">Analyze — Ctrl+A</a>
                    <a onclick="Playground.closeMoreMenu();Playground.tokenize()">Tokenize — Ctrl+T</a>
                    <a onclick="Playground.closeMoreMenu();Playground.parse()">Parse — Ctrl+P</a>
                    <a onclick="Playground.closeMoreMenu();Playground.format()">Format — Ctrl+F</a>
                    <a onclick="Playground.closeMoreMenu();Playground.saveAs()">Save as…</a>
                  </div>
                </div>
              </a>
            </div>
          </div>
        </div>
        <textarea id="dvala-textarea" class="panel-textarea fancy-scroll" spellcheck="false"></textarea>
      </div>

      ><div id="resize-divider-2"></div>

      ><div id="output-panel">
        <div class="panel-header">
          <span class="panel-header__title">Output</span>
          <a onclick="Playground.resetOutput()" class="panel-header__icon-btn">🗑</a>
        </div>
        <div id="output-result" class="fancy-scroll"></div>
      </div>

    </div>
  </div>

  <template id="snapshot-panel-template">
    <div class="snapshot-panel fancy-scroll">
      <div data-ref="breadcrumbs" class="snapshot-panel__breadcrumbs"></div>
      <div class="snapshot-panel__columns">
        <div class="snapshot-panel__col">
          <div class="snapshot-panel__section">
            <span class="snapshot-panel__section-label">Metadata</span>
            <div data-ref="meta-container"><div class="example-code snapshot-panel__code-block"></div></div>
          </div>
          <div data-ref="effect-section" class="snapshot-panel__section">
            <span class="snapshot-panel__section-label">Effect</span>
            <div data-ref="effect-container"><div class="example-code snapshot-panel__code-block"></div></div>
          </div>
          <div data-ref="tech-section" class="snapshot-panel__section">
            <span class="snapshot-panel__section-label">Technical</span>
            <div data-ref="tech-container"><div class="example-code snapshot-panel__code-block"></div></div>
          </div>
        </div>
        <div class="snapshot-panel__col">
          <div data-ref="code-section" class="snapshot-panel__section">
            <span class="snapshot-panel__section-label">Code</span>
            <div class="example-code snapshot-panel__code-block">
              <pre data-ref="code-content" class="snapshot-panel__code-pre"></pre>
              <a data-ref="add-to-playground" class="snapshot-panel__use-btn">Use in playground</a>
            </div>
          </div>
        </div>
      </div>
      <div data-ref="buttons" class="snapshot-panel__buttons">
        <button data-ref="resume-btn" class="button" style="display:none;">Resume</button>
        <button data-ref="save-btn" class="button">Save</button>
        <button data-ref="delete-btn" class="button button--danger">Delete</button>
        <button data-ref="close-btn" class="button">Close</button>
      </div>
    </div>
  </template>

  <div id="snapshot-panel-container" class="modal-overlay" style="display:none;"></div>
  `
}

function getModals(): string {
  const modal = (id: string, content: string) =>
    `<div id="${id}" class="modal-overlay" style="display:none;">${content}</div>`

  const box = (content: string) =>
    `<div class="modal-box">${content}</div>`

  return `
  ${modal('checkpoint-modal', box(`
    <div id="checkpoint-modal-message" class="modal-body-row"></div>
    <div id="checkpoint-modal-meta" class="modal-meta-row"></div>
    <div id="checkpoint-modal-tech" class="modal-meta-row modal-body-row--last"></div>
    <div class="modal-btn-row">
      <button class="button" onclick="Playground.resumeSnapshot()">Resume</button>
      <button class="button" onclick="Playground.closeCheckpointModal()">Dismiss</button>
    </div>
  `))}

  ${modal('confirm-modal', box(`
    <div id="confirm-modal-title" class="modal-title"></div>
    <div id="confirm-modal-message" class="modal-body-row"></div>
    <label id="confirm-modal-checkbox-row" class="modal-checkbox-row" style="display:none;">
      <input type="checkbox" id="confirm-modal-checkbox">
      <span id="confirm-modal-checkbox-label"></span>
    </label>
    <div class="modal-btn-row">
      <button id="confirm-modal-ok" class="button">OK</button>
      <button class="button" onclick="Playground.closeConfirmModal(false)">Cancel</button>
    </div>
  `))}

  ${modal('effect-modal', box(`
    <div id="effect-modal-nav" class="effect-modal__nav">
      <button id="effect-modal-prev" class="button">◀</button>
      <span id="effect-modal-counter" class="effect-modal__counter"></span>
      <button id="effect-modal-next" class="button">▶</button>
      <div id="effect-modal-handled-badge" class="effect-modal__handled-badge" style="display:none;">handled</div>
    </div>
    <div id="effect-modal-name" class="effect-modal__name"></div>
    <div id="effect-modal-args" class="modal-body-row"></div>
    <div id="effect-modal-main-buttons" class="modal-btn-row modal-body-row--last"></div>
    <div id="effect-modal-input-section" class="effect-modal__input-section" style="display:none;">
      <label id="effect-modal-input-label" class="effect-modal__input-label"></label>
      <textarea id="effect-modal-value" rows="4" class="effect-modal__textarea"></textarea>
      <span id="effect-modal-error" class="form-error" style="display:none;"></span>
    </div>
  `))}

  ${modal('export-modal', box(`
    <div class="modal-title">Export</div>
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
    <div class="modal-title">Import options</div>
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
    <div class="modal-title">Import result</div>
    <div id="import-result-content" class="modal-body-row"></div>
    <button class="button" onclick="Playground.closeImportResultModal()">OK</button>
  `))}

  ${modal('info-modal', box(`
    <div id="info-modal-title" class="modal-title"></div>
    <div id="info-modal-message" class="modal-body-row"></div>
    <button class="button" onclick="Playground.closeInfoModal()">OK</button>
  `))}

  ${modal('io-confirm-modal', box(`
    <div id="io-confirm-question" class="modal-body-row"></div>
    <div class="modal-btn-row">
      <button id="io-confirm-yes-btn" class="button">Yes</button>
      <button id="io-confirm-no-btn" class="button">No</button>
    </div>
  `))}

  ${modal('io-pick-modal', box(`
    <div id="io-pick-modal-title" class="modal-subtitle"></div>
    <div id="io-pick-list" class="io-pick-list"></div>
  `))}

  ${modal('println-modal', box(`
    <div class="modal-subtitle">Output</div>
    <pre id="println-content" class="println-content"></pre>
    <div class="modal-btn-row modal-btn-row--top-gap">
      <button id="copy-println-btn" class="button">Copy</button>
      <button class="button" onclick="Playground.dismissPrintln()">OK</button>
    </div>
  `))}

  ${modal('readline-modal', box(`
    <div id="readline-prompt" class="modal-body-row"></div>
    <textarea id="readline-input" rows="3" class="readline-input"></textarea>
    <div class="modal-btn-row">
      <button class="button" onclick="Playground.submitReadline()">Submit</button>
      <button class="button" onclick="Playground.cancelReadline()">Cancel</button>
    </div>
  `))}

  ${modal('snapshot-modal', box('<div id="snapshot-modal-content"></div>'))}
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
  <div id="settings-page" class="content">
    <div class="settings-page__heading">Settings</div>
    <div class="settings-page__body">
      <div class="settings-tabs">
        ${tabBtn('dvala', 'Dvala')}
        ${tabBtn('playground', 'Playground')}
        ${tabBtn('actions', 'Actions')}
      </div>

      <div id="settings-tab-dvala" class="settings-tab-content">
        ${toggle('settings-debug-toggle', 'Debug mode', 'Injects source code info into the AST for better error messages.', 'Playground.toggleDebug()')}
        ${toggle('settings-pure-toggle', 'Pure mode', 'Restricts execution to pure expressions only.', 'Playground.togglePure()')}
        ${toggle('settings-auto-checkpoint-toggle', 'Disable auto checkpoint', 'When enabled, runtime captures snapshots before every effect.', 'Playground.toggleAutoCheckpoint()')}
      </div>

      <div id="settings-tab-playground" class="settings-tab-content" style="display:none;">
        ${toggle('settings-disable-handlers-toggle', 'Disable Playground effect handlers', 'Disables built-in playground handlers.', 'Playground.toggleDisablePlaygroundHandlers()')}
        ${toggle('settings-intercept-error-toggle', 'Intercept error effect', 'Intercepts dvala.error effects in the effect panel.', 'Playground.toggleInterceptError()')}
        ${toggle('settings-checkpoint-toggle', 'Intercept checkpoint effect', 'Intercepts dvala.checkpoint effects.', 'Playground.toggleInterceptCheckpoint()')}
      </div>

      <div id="settings-tab-actions" class="settings-tab-content" style="display:none;">
        <div class="settings-actions">
          <div class="settings-actions__storage">
            <p class="settings-actions__storage-label">Storage type</p>
            <div class="settings-actions__storage-options">
              <label class="settings-actions__radio-label"><input type="radio" id="settings-storage-local" name="storage-type" value="local" onclick="Playground.setStorageType('local')"> Local storage</label>
              <label class="settings-actions__radio-label"><input type="radio" id="settings-storage-idb" name="storage-type" value="idb" onclick="Playground.setStorageType('idb')"> IndexedDB</label>
            </div>
          </div>
          <div class="settings-actions__buttons">
            <button class="button" onclick="Playground.openExportModal()">Export</button>
            <button class="button" onclick="Playground.openImportModal()">Import</button>
            <button class="button" onclick="Playground.copyStateLink()">Copy state link</button>
            <button class="button button--danger" onclick="Playground.clearAllData()">Clear all data</button>
          </div>
        </div>
      </div>
    </div>
  </div>`
}

function getSavedProgramsPage(): string {
  return `
  <div id="saved-programs-page" class="content">
    <div class="list-page__header">
      <span class="list-page__heading">Saved Programs</span>
      <a id="saved-programs-clear-all" onclick="Playground.clearAllPrograms()" class="list-page__clear-btn">Clear all</a>
    </div>
    <div id="saved-programs-list" class="list-page__list"></div>
    <div id="saved-programs-empty" class="list-page__empty">No saved programs yet.</div>
  </div>`
}

function getSnapshotsPage(): string {
  return `
  <div id="snapshots-page" class="content">
    <div class="list-page__header">
      <span class="list-page__heading">Snapshots</span>
      <a id="snapshots-clear-all" onclick="Playground.clearAllSnapshots()" class="list-page__clear-btn">Clear all</a>
    </div>
    <div id="snapshots-list" class="list-page__list"></div>
    <div id="snapshots-empty" class="list-page__empty">No snapshots yet.</div>
  </div>`
}
