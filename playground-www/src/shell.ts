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
  wrapper.style.display = 'block'
}

function getShellHTML(): string {
  return `
  <main id="main-panel" class="fancy-scroll">
    <div id="dynamic-page"></div>
    ${getSettingsPage()}
    ${getSavedProgramsPage()}
    ${getSnapshotsPage()}
  </main>

  <div id="resize-sidebar" style="position:fixed;width:5px;cursor:col-resize;background-color:rgb(82 82 82);top:0;z-index:10;"></div>

  <nav id="sidebar" class="fancy-scroll-background">
    <div style="display:flex;flex-direction:column;align-items:center;margin-bottom:1rem;">
      <img src="images/dvala-logo.png" alt="Dvala" style="max-width:120px;width:100%;cursor:pointer;" onclick="Playground.showPage('index','smooth')">
    </div>
    <div style="padding:0.25rem 0.5rem;display:flex;align-items:center;justify-content:space-between;gap:0.5rem;margin-bottom:1rem;cursor:pointer;border:1px solid #444;" onclick="Playground.Search.openSearch()">
      <span>🔍 Search</span>
      <span style="font-size:0.8rem;">F3</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:0.5rem;margin-bottom:1rem;">
      <a id="home-page_link" style="cursor:pointer;" onclick="Playground.showPage('index','smooth')">🏠 Home</a>
      <a id="about-page_link" style="cursor:pointer;" onclick="Playground.showPage('about-page','smooth')">ℹ️ About</a>
      <a id="tutorials-page_link" style="cursor:pointer;" onclick="Playground.showTutorialsPage()">💡 Tutorials</a>
      <a id="example-page_link" style="cursor:pointer;" onclick="Playground.showPage('example-page','smooth')">🧪 Examples</a>
    </div>
    <div style="margin-bottom:0.5rem;">
      <a id="saved-programs-page_link" style="cursor:pointer;display:flex;align-items:center;gap:0.25rem;" onclick="Playground.showSavedProgramsPage()">
        💾 Programs
        <span id="programs-nav-indicator" style="display:none;width:7px;height:7px;border-radius:50%;background:rgb(245 245 245);margin-left:4px;flex-shrink:0;"></span>
      </a>
    </div>
    <div style="margin-bottom:0.5rem;">
      <a id="snapshots-page_link" style="cursor:pointer;display:flex;align-items:center;gap:0.25rem;" onclick="Playground.showSnapshotsPage()">
        📷 Snapshots
        <span id="snapshots-nav-indicator" style="display:none;width:7px;height:7px;border-radius:50%;background:rgb(245 245 245);margin-left:4px;flex-shrink:0;"></span>
      </a>
    </div>
    <div style="margin-bottom:0.5rem;">
      <a id="settings-page_link" style="cursor:pointer;" onclick="Playground.showPage('settings-page','smooth')">⚙️ Settings</a>
    </div>
    <div style="height:1rem;"></div>
    <div style="font-size:0.75rem;font-weight:bold;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.5rem;color:#888;">API Reference</div>
    <div id="api-content-special-expressions" class="sidebar-collapsible-content" style="display:flex;flex-direction:column;"></div>
    <div id="api-content-core-functions" class="sidebar-collapsible-content" style="display:flex;flex-direction:column;"></div>
    <div id="api-content-effects" class="sidebar-collapsible-content" style="display:flex;flex-direction:column;"></div>
    <div id="api-content-shorthands" class="sidebar-collapsible-content" style="display:flex;flex-direction:column;"></div>
    <div id="api-content-datatypes" class="sidebar-collapsible-content" style="display:flex;flex-direction:column;"></div>
    <div id="api-content-modules" class="sidebar-collapsible-content" style="display:flex;flex-direction:column;"></div>
  </nav>

  ${getPlaygroundPanel()}

  ${getModals()}

  <div id="search-dialog-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:200;">
    <div style="display:flex;justify-content:center;padding-top:80px;max-height:calc(100% - 80px);">
      <div id="search-dialog" style="background:#333;border:8px solid #444;border-radius:4px;width:800px;display:flex;flex-direction:column;max-height:100%;">
        <input id="search-input" type="text" placeholder="Search..." style="padding:0.75rem;font-size:1.1rem;background:#444;border:none;color:#d4d4d4;outline:none;">
        <div id="search-intro" style="padding:1rem;text-align:center;color:#888;">Type to search functions, modules, effects…</div>
        <div id="no-search-result" style="display:none;padding:1rem;text-align:center;color:#888;">No results</div>
        <div id="search-result" class="fancy-scroll" style="display:none;flex-direction:column;overflow-y:auto;flex:1;"></div>
      </div>
    </div>
  </div>

  <div id="toast-container" style="position:fixed;top:1rem;left:50%;transform:translateX(-50%);z-index:300;display:flex;flex-direction:column;gap:0.5rem;pointer-events:none;"></div>
  `
}

function getPlaygroundPanel(): string {
  return `
  <div id="playground" style="position:fixed;bottom:0;left:0;right:0;background:transparent;">
    <div id="resize-playground" style="height:5px;background:#555;cursor:row-resize;"></div>
    <div id="panels-container" style="height:100%;width:100%;display:flex;flex-direction:row;white-space:nowrap;">

      <div id="context-panel" style="height:100%;display:flex;flex-direction:column;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:0 0.5rem;height:1.6rem;background:#333;border-bottom:1px solid #555;user-select:none;cursor:pointer;" onclick="Playground.focusContext()">
          <div id="context-title" style="font-size:1.1rem;">Context</div>
          <div style="display:flex;gap:0.25rem;align-items:center;">
            <a onclick="Playground.openAddContextMenu()" style="font-size:1.25rem;cursor:pointer;">+
              <div id="add-context-menu" style="display:none;position:absolute;max-width:20rem;padding:0.5rem;border:1px solid #555;background:#444;z-index:50;">
                <div style="display:flex;flex-direction:column;gap:0.5rem;">
                  <div style="display:flex;flex-direction:column;">
                    <span style="font-size:0.75rem;font-weight:bold;">Name</span>
                    <input id="new-context-name" style="background:#333;color:#d4d4d4;">
                    <span style="font-size:0.75rem;font-weight:bold;margin-top:0.5rem;">Value (JSON)</span>
                    <textarea id="new-context-value" rows="5" style="border:none;color:#d4d4d4;background:#333;" class="fancy-scroll"></textarea>
                    <button class="button" onclick="Playground.addContextEntry()" style="margin-top:0.25rem;">Add</button>
                    <span id="new-context-error" style="display:none;color:#f87171;font-size:0.75rem;"></span>
                  </div>
                  <a style="cursor:pointer;" onclick="Playground.closeAddContextMenu();Playground.addSampleContext();">Add sample context</a>
                </div>
              </div>
            </a>
            <a id="context-undo-button" onclick="Playground.undoContextHistory()" style="cursor:pointer;">↩</a>
            <a id="context-redo-button" onclick="Playground.redoContextHistory()" style="cursor:pointer;">↪</a>
          </div>
        </div>
        <textarea id="context-textarea" class="fancy-scroll" spellcheck="false" style="height:calc(100% - 1.6rem);border:none;resize:none;"></textarea>
      </div>

      ><div id="resize-divider-1" style="width:5px;height:100%;cursor:col-resize;background:#555;"></div>

      ><div id="dvala-panel" style="height:100%;display:flex;flex-direction:column;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:0 0.5rem;height:1.6rem;background:#333;border-bottom:1px solid #555;user-select:none;cursor:pointer;" onclick="Playground.focusDvalaCode()">
          <div id="dvala-code-title" style="display:flex;gap:0.25rem;align-items:center;overflow:hidden;">
            <span id="dvala-panel-debug-info" style="font-size:1.25rem;">🐛</span>
            <span id="dvala-code-title-string" style="font-size:1.1rem;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" onclick="Playground.onProgramTitleClick(event)" title="Click to rename"></span>
            <span id="dvala-code-pending-indicator" style="display:none;width:7px;height:7px;border-radius:50%;background:rgb(245 245 245);margin-left:2px;flex-shrink:0;" title="Unsaved"></span>
            <input id="dvala-code-title-input" type="text" spellcheck="false" placeholder="Program name"
              style="display:none;font-size:1.1rem;background:transparent;border:none;outline:none;min-width:8rem;max-width:20rem;padding:0 2px;color:inherit;"
              onkeydown="Playground.onProgramTitleKeydown(event)"
              onblur="Playground.onProgramTitleBlur()">
          </div>
          <div style="display:flex;gap:0.25rem;align-items:center;" onclick="event.preventDefault();event.stopPropagation()">
            <a onclick="Playground.run()" title="Run (Ctrl+R)" style="cursor:pointer;">▶ Run</a>
            <a id="dvala-code-undo-button" onclick="Playground.undoDvalaCodeHistory()" style="cursor:pointer;">↩</a>
            <a id="dvala-code-redo-button" onclick="Playground.redoDvalaCodeHistory()" style="cursor:pointer;">↪</a>
            <a onclick="Playground.newFile()" title="New file" style="cursor:pointer;">📄</a>
            <div>
              <a onclick="Playground.openMoreMenu(this)" style="cursor:pointer;">☰
                <div id="more-menu" style="display:none;position:absolute;max-width:20rem;padding:0.5rem;border:1px solid #555;background:#444;z-index:50;">
                  <div style="display:flex;flex-direction:column;gap:0.5rem;">
                    <a style="cursor:pointer;" onclick="Playground.closeMoreMenu();Playground.run()">▶ Run — Ctrl+R</a>
                    <a style="cursor:pointer;" onclick="Playground.closeMoreMenu();void Playground.runSync()">▶ Run sync — Ctrl+Shift+R</a>
                    <a style="cursor:pointer;" onclick="Playground.closeMoreMenu();Playground.analyze()">Analyze — Ctrl+A</a>
                    <a style="cursor:pointer;" onclick="Playground.closeMoreMenu();Playground.tokenize()">Tokenize — Ctrl+T</a>
                    <a style="cursor:pointer;" onclick="Playground.closeMoreMenu();Playground.parse()">Parse — Ctrl+P</a>
                    <a style="cursor:pointer;" onclick="Playground.closeMoreMenu();Playground.format()">Format — Ctrl+F</a>
                    <a style="cursor:pointer;" onclick="Playground.closeMoreMenu();Playground.saveAs()">Save as…</a>
                  </div>
                </div>
              </a>
            </div>
          </div>
        </div>
        <textarea id="dvala-textarea" class="fancy-scroll" spellcheck="false" style="height:calc(100% - 1.6rem);border:none;resize:none;"></textarea>
      </div>

      ><div id="resize-divider-2" style="width:5px;height:100%;cursor:col-resize;background:#555;"></div>

      ><div id="output-panel" style="height:100%;display:flex;flex-direction:column;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:0 0.5rem;height:1.6rem;background:#333;border-bottom:1px solid #555;user-select:none;">
          <span style="font-size:1.1rem;">Output</span>
          <a onclick="Playground.resetOutput()" style="cursor:pointer;font-size:1.25rem;">🗑</a>
        </div>
        <div id="output-result" class="fancy-scroll" style="font-family:monospace;background:#1a1a1a;padding:0.5rem;font-size:0.875rem;display:flex;flex-direction:column;gap:0.5rem;height:calc(100% - 1.6rem);overflow-y:auto;"></div>
      </div>

    </div>
  </div>

  <template id="snapshot-panel-template">
    <div class="fancy-scroll" style="background:#333;padding:1rem;display:flex;flex-direction:column;gap:1rem;overflow-y:auto;max-height:85vh;">
      <div data-ref="breadcrumbs" style="color:#d4d4d4;display:flex;flex-wrap:wrap;gap:0.25rem;background:rgb(50 50 50);margin:-1rem -1rem 0 -1rem;padding:0.6rem 1rem;font-weight:bold;"></div>
      <div style="display:flex;flex-direction:row;gap:1rem;">
        <div style="display:flex;flex-direction:column;gap:1rem;flex:1;">
          <div style="display:flex;flex-direction:column;gap:0.5rem;">
            <span style="font-size:0.8rem;font-weight:bold;text-transform:uppercase;">Metadata</span>
            <div data-ref="meta-container"><div class="example-code" style="position:relative;"></div></div>
          </div>
          <div data-ref="effect-section" style="display:flex;flex-direction:column;gap:0.5rem;">
            <span style="font-size:0.8rem;font-weight:bold;text-transform:uppercase;">Effect</span>
            <div data-ref="effect-container"><div class="example-code" style="position:relative;"></div></div>
          </div>
          <div data-ref="tech-section" style="display:flex;flex-direction:column;gap:0.5rem;">
            <span style="font-size:0.8rem;font-weight:bold;text-transform:uppercase;">Technical</span>
            <div data-ref="tech-container"><div class="example-code" style="position:relative;"></div></div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:0.5rem;flex:1;">
          <div data-ref="code-section" style="display:flex;flex-direction:column;gap:0.5rem;">
            <span style="font-size:0.8rem;font-weight:bold;text-transform:uppercase;">Code</span>
            <div class="example-code" style="position:relative;">
              <pre data-ref="code-content" style="margin:0;overflow-x:auto;"></pre>
              <a data-ref="add-to-playground" style="cursor:pointer;position:absolute;top:0.5rem;right:0.5rem;font-size:0.75rem;">Use in playground</a>
            </div>
          </div>
        </div>
      </div>
      <div data-ref="buttons" style="display:flex;gap:0.5rem;margin-top:1rem;">
        <button data-ref="resume-btn" class="button" style="display:none;">Resume</button>
        <button data-ref="save-btn" class="button">Save</button>
        <button data-ref="delete-btn" class="button button--danger">Delete</button>
        <button data-ref="close-btn" class="button">Close</button>
      </div>
    </div>
  </template>

  <div id="snapshot-panel-container" style="position:fixed;inset:0;display:none;background:rgba(0,0,0,0.7);z-index:150;display:none;justify-content:center;align-items:center;"></div>
  `
}

function getModals(): string {
  const modal = (id: string, content: string) =>
    `<div id="${id}" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100;display:none;justify-content:center;align-items:center;">${content}</div>`

  const box = (content: string) =>
    `<div style="background:#333;border:1px solid #555;padding:1.5rem;max-width:500px;width:90%;max-height:80vh;overflow-y:auto;">${content}</div>`

  return `
  ${modal('checkpoint-modal', box(`
    <div id="checkpoint-modal-message" style="margin-bottom:1rem;"></div>
    <div id="checkpoint-modal-meta" style="margin-bottom:0.5rem;font-size:0.875rem;color:#888;"></div>
    <div id="checkpoint-modal-tech" style="margin-bottom:1rem;font-size:0.875rem;color:#888;"></div>
    <div style="display:flex;gap:0.5rem;">
      <button class="button" onclick="Playground.resumeSnapshot()">Resume</button>
      <button class="button" onclick="Playground.closeCheckpointModal()">Dismiss</button>
    </div>
  `))}

  ${modal('confirm-modal', box(`
    <div id="confirm-modal-title" style="font-size:1.25rem;margin-bottom:0.5rem;"></div>
    <div id="confirm-modal-message" style="margin-bottom:1rem;"></div>
    <label id="confirm-modal-checkbox-row" style="display:none;gap:0.5rem;align-items:center;margin-bottom:1rem;">
      <input type="checkbox" id="confirm-modal-checkbox">
      <span id="confirm-modal-checkbox-label"></span>
    </label>
    <div style="display:flex;gap:0.5rem;">
      <button id="confirm-modal-ok" class="button">OK</button>
      <button class="button" onclick="Playground.closeConfirmModal(false)">Cancel</button>
    </div>
  `))}

  ${modal('effect-modal', box(`
    <div id="effect-modal-nav" style="display:flex;gap:0.5rem;align-items:center;margin-bottom:0.5rem;">
      <button id="effect-modal-prev" class="button">◀</button>
      <span id="effect-modal-counter" style="font-size:0.875rem;"></span>
      <button id="effect-modal-next" class="button">▶</button>
      <div id="effect-modal-handled-badge" style="display:none;font-size:0.75rem;padding:0.1rem 0.4rem;background:#2d6a2d;color:#fff;border-radius:2px;">handled</div>
    </div>
    <div id="effect-modal-name" style="font-size:1.1rem;font-weight:bold;margin-bottom:0.5rem;"></div>
    <div id="effect-modal-args" style="margin-bottom:1rem;font-size:0.875rem;"></div>
    <div id="effect-modal-main-buttons" style="display:flex;gap:0.5rem;margin-bottom:0.5rem;"></div>
    <div id="effect-modal-input-section" style="display:none;flex-direction:column;gap:0.25rem;">
      <label id="effect-modal-input-label" style="font-size:0.875rem;"></label>
      <textarea id="effect-modal-value" rows="4" style="border:1px solid #555;background:#1a1a1a;color:#d4d4d4;padding:0.25rem;resize:vertical;"></textarea>
      <span id="effect-modal-error" style="color:#f87171;font-size:0.75rem;display:none;"></span>
    </div>
  `))}

  ${modal('export-modal', box(`
    <div style="font-size:1.25rem;margin-bottom:1rem;">Export</div>
    <div style="display:flex;flex-direction:column;gap:0.5rem;margin-bottom:1rem;">
      <label style="display:flex;gap:0.5rem;"><input type="checkbox" id="export-opt-code" checked> Code</label>
      <label style="display:flex;gap:0.5rem;"><input type="checkbox" id="export-opt-context"> Context</label>
      <label style="display:flex;gap:0.5rem;"><input type="checkbox" id="export-opt-settings"> Settings</label>
      <label style="display:flex;gap:0.5rem;"><input type="checkbox" id="export-opt-saved-snapshots"> Saved snapshots</label>
      <label style="display:flex;gap:0.5rem;"><input type="checkbox" id="export-opt-recent-snapshots"> Recent snapshots</label>
      <label style="display:flex;gap:0.5rem;"><input type="checkbox" id="export-opt-layout"> Layout</label>
      <label style="display:flex;gap:0.5rem;"><input type="checkbox" id="export-opt-saved-programs"> Saved programs</label>
    </div>
    <div style="display:flex;gap:0.5rem;">
      <button class="button" onclick="Playground.doExport()">Export</button>
      <button class="button" onclick="Playground.closeExportModal()">Cancel</button>
    </div>
  `))}

  ${modal('import-options-modal', box(`
    <div style="font-size:1.25rem;margin-bottom:1rem;">Import options</div>
    <div style="display:flex;flex-direction:column;gap:0.5rem;margin-bottom:1rem;">
      <label style="display:flex;gap:0.5rem;"><input type="checkbox" id="import-opt-code" checked><span id="import-opt-code-label">Code</span></label>
      <label style="display:flex;gap:0.5rem;"><input type="checkbox" id="import-opt-context"><span id="import-opt-context-label">Context</span></label>
      <label style="display:flex;gap:0.5rem;"><input type="checkbox" id="import-opt-settings"><span id="import-opt-settings-label">Settings</span></label>
      <label style="display:flex;gap:0.5rem;"><input type="checkbox" id="import-opt-saved-snapshots"><span id="import-opt-saved-snapshots-label">Saved snapshots</span></label>
      <label style="display:flex;gap:0.5rem;"><input type="checkbox" id="import-opt-recent-snapshots"><span id="import-opt-recent-snapshots-label">Recent snapshots</span></label>
      <label style="display:flex;gap:0.5rem;"><input type="checkbox" id="import-opt-layout"><span id="import-opt-layout-label">Layout</span></label>
      <label style="display:flex;gap:0.5rem;"><input type="checkbox" id="import-opt-saved-programs"><span id="import-opt-saved-programs-label">Saved programs</span></label>
    </div>
    <div style="display:flex;gap:0.5rem;">
      <button class="button" onclick="Playground.doImport()">Import</button>
      <button class="button" onclick="Playground.closeImportOptionsModal()">Cancel</button>
    </div>
  `))}

  ${modal('import-result-modal', box(`
    <div style="font-size:1.25rem;margin-bottom:1rem;">Import result</div>
    <div id="import-result-content" style="margin-bottom:1rem;"></div>
    <button class="button" onclick="Playground.closeImportResultModal()">OK</button>
  `))}

  ${modal('info-modal', box(`
    <div id="info-modal-title" style="font-size:1.25rem;margin-bottom:0.5rem;"></div>
    <div id="info-modal-message" style="margin-bottom:1rem;"></div>
    <button class="button" onclick="Playground.closeInfoModal()">OK</button>
  `))}

  ${modal('io-confirm-modal', box(`
    <div id="io-confirm-question" style="margin-bottom:1rem;"></div>
    <div style="display:flex;gap:0.5rem;">
      <button id="io-confirm-yes-btn" class="button">Yes</button>
      <button id="io-confirm-no-btn" class="button">No</button>
    </div>
  `))}

  ${modal('io-pick-modal', box(`
    <div id="io-pick-modal-title" style="font-size:1.1rem;margin-bottom:0.5rem;"></div>
    <div id="io-pick-list" style="display:flex;flex-direction:column;gap:0.25rem;max-height:50vh;overflow-y:auto;"></div>
  `))}

  ${modal('println-modal', box(`
    <div style="font-size:1.1rem;margin-bottom:0.5rem;">Output</div>
    <pre id="println-content" style="background:#1a1a1a;padding:0.5rem;overflow-x:auto;max-height:60vh;overflow-y:auto;white-space:pre-wrap;"></pre>
    <div style="display:flex;gap:0.5rem;margin-top:0.5rem;">
      <button id="copy-println-btn" class="button">Copy</button>
      <button class="button" onclick="Playground.dismissPrintln()">OK</button>
    </div>
  `))}

  ${modal('readline-modal', box(`
    <div id="readline-prompt" style="margin-bottom:0.5rem;"></div>
    <textarea id="readline-input" rows="3" style="width:100%;border:1px solid #555;background:#1a1a1a;color:#d4d4d4;padding:0.25rem;resize:vertical;margin-bottom:0.5rem;"></textarea>
    <div style="display:flex;gap:0.5rem;">
      <button class="button" onclick="Playground.submitReadline()">Submit</button>
      <button class="button" onclick="Playground.cancelReadline()">Cancel</button>
    </div>
  `))}

  ${modal('snapshot-modal', box('<div id="snapshot-modal-content"></div>'))}
  `
}

function getSettingsPage(): string {
  const toggle = (id: string, label: string, description: string, onclick: string) => `
    <div class="settings-toggle-row" style="display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:0.5rem 0;border-bottom:1px solid #444;">
      <div style="display:flex;flex-direction:column;">
        <span style="font-size:1rem;">${label}</span>
        <span style="font-size:0.8rem;color:#888;max-width:32rem;">${description}</span>
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
    <div style="display:flex;justify-content:center;font-size:1.75rem;margin-bottom:1.5rem;">Settings</div>
    <div style="padding:1rem;background:#2a2a2a;">
      <div class="settings-tabs" style="display:flex;gap:0.25rem;margin-bottom:1rem;">
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
        <div style="display:flex;flex-direction:column;gap:0.75rem;padding:0.5rem 0;">
          <div>
            <p style="margin:0 0 0.25rem;font-size:0.875rem;color:#aaa;">Storage type</p>
            <div style="display:flex;gap:1rem;">
              <label style="display:flex;gap:0.5rem;align-items:center;"><input type="radio" id="settings-storage-local" name="storage-type" value="local" onclick="Playground.setStorageType('local')"> Local storage</label>
              <label style="display:flex;gap:0.5rem;align-items:center;"><input type="radio" id="settings-storage-idb" name="storage-type" value="idb" onclick="Playground.setStorageType('idb')"> IndexedDB</label>
            </div>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:0.5rem;">
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
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
      <span style="font-size:1.75rem;">Saved Programs</span>
      <a id="saved-programs-clear-all" onclick="Playground.clearAllPrograms()" style="cursor:pointer;font-size:0.875rem;color:#888;">Clear all</a>
    </div>
    <div id="saved-programs-list" style="display:flex;flex-direction:column;gap:0.5rem;"></div>
    <div id="saved-programs-empty" style="color:#888;font-style:italic;">No saved programs yet.</div>
  </div>`
}

function getSnapshotsPage(): string {
  return `
  <div id="snapshots-page" class="content">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
      <span style="font-size:1.75rem;">Snapshots</span>
      <a id="snapshots-clear-all" onclick="Playground.clearAllSnapshots()" style="cursor:pointer;font-size:0.875rem;color:#888;">Clear all</a>
    </div>
    <div id="snapshots-list" style="display:flex;flex-direction:column;gap:0.5rem;"></div>
    <div id="snapshots-empty" style="color:#888;font-style:italic;">No snapshots yet.</div>
  </div>`
}
