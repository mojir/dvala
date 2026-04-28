// DOM element registry for the playground.
// Each property is a lazy getter so callers can reach for the element when
// needed without worrying about boot-time ordering.

export const elements = {
  get wrapper() {
    return document.getElementById('wrapper') as HTMLElement
  },
  get mainPanel() {
    return document.getElementById('main-panel') as HTMLElement
  },
  get dvalaPanel() {
    return document.getElementById('dvala-panel') as HTMLElement
  },
  get outputPanel() {
    return document.getElementById('output-panel') as HTMLElement
  },
  get moreMenu() {
    return document.getElementById('more-menu') as HTMLElement
  },
  get filesHeaderMenu() {
    return document.getElementById('files-header-menu') as HTMLElement
  },
  get addContextMenu() {
    return document.getElementById('add-context-menu') as HTMLElement
  },
  get newContextName() {
    return document.getElementById('new-context-name') as HTMLInputElement
  },
  get newContextValue() {
    return document.getElementById('new-context-value') as HTMLTextAreaElement
  },
  get newContextError() {
    return document.getElementById('new-context-error') as HTMLSpanElement
  },
  get contextTextArea() {
    return document.getElementById('context-textarea') as HTMLTextAreaElement
  },
  get contextEntryList() {
    return document.getElementById('context-entry-list') as HTMLDivElement
  },
  get contextDetailView() {
    return document.getElementById('context-detail-view') as HTMLDivElement
  },
  get contextDetailTextArea() {
    return document.getElementById('context-detail-textarea') as HTMLTextAreaElement
  },
  get outputResult() {
    return document.getElementById('output-result') as HTMLElement
  },
  get dvalaEditorHost() {
    return document.getElementById('dvala-editor-host') as HTMLDivElement
  },
  get resizeDevider1() {
    return document.getElementById('resize-divider-1') as HTMLElement
  },
  get resizeDevider2() {
    return document.getElementById('resize-divider-2') as HTMLElement
  },
  get dvalaPanelDebugInfo() {
    return document.getElementById('dvala-panel-debug-info') as HTMLDivElement
  },
  get contextUndoButton() {
    return document.getElementById('context-undo-button') as HTMLAnchorElement
  },
  get contextRedoButton() {
    return document.getElementById('context-redo-button') as HTMLAnchorElement
  },
  get dvalaCodeUndoButton() {
    return document.getElementById('dvala-code-undo-button') as HTMLAnchorElement
  },
  get dvalaCodeRedoButton() {
    return document.getElementById('dvala-code-redo-button') as HTMLAnchorElement
  },
  get editorToolbarTitle() {
    return document.getElementById('editor-toolbar-title') as HTMLSpanElement
  },
  get contextTitle() {
    return document.getElementById('context-title') as HTMLDivElement
  },
  get dvalaCodeTitle() {
    return document.getElementById('dvala-code-title') as HTMLDivElement
  },
  get dvalaCodeTitleString() {
    return document.getElementById('dvala-code-title-string') as HTMLSpanElement
  },
  get dvalaCodeTitleInput() {
    return document.getElementById('dvala-code-title-input') as HTMLInputElement
  },
  get dvalaCodePendingIndicator() {
    return document.getElementById('dvala-code-pending-indicator') as HTMLSpanElement
  },
  get dvalaCodeLockedIndicator() {
    return document.getElementById('dvala-code-locked-indicator') as HTMLSpanElement
  },
  get saveScratchButton() {
    return document.getElementById('save-scratch-btn') as HTMLAnchorElement
  },
  get snapshotModal() {
    return document.getElementById('snapshot-modal') as HTMLDivElement
  },
  get snapshotPanelContainer() {
    return document.getElementById('snapshot-panel-container') as HTMLDivElement
  },
  get importOptionsModal() {
    return document.getElementById('import-options-modal') as HTMLDivElement
  },
  get importOptCode() {
    return document.getElementById('import-opt-code') as HTMLInputElement
  },
  get importOptCodeLabel() {
    return document.getElementById('import-opt-code-label') as HTMLLabelElement
  },
  get importOptContext() {
    return document.getElementById('import-opt-context') as HTMLInputElement
  },
  get importOptContextLabel() {
    return document.getElementById('import-opt-context-label') as HTMLLabelElement
  },
  get importOptSettings() {
    return document.getElementById('import-opt-settings') as HTMLInputElement
  },
  get importOptSettingsLabel() {
    return document.getElementById('import-opt-settings-label') as HTMLLabelElement
  },
  get importOptSavedSnapshots() {
    return document.getElementById('import-opt-saved-snapshots') as HTMLInputElement
  },
  get importOptSavedSnapshotsLabel() {
    return document.getElementById('import-opt-saved-snapshots-label') as HTMLLabelElement
  },
  get importOptRecentSnapshots() {
    return document.getElementById('import-opt-recent-snapshots') as HTMLInputElement
  },
  get importOptRecentSnapshotsLabel() {
    return document.getElementById('import-opt-recent-snapshots-label') as HTMLLabelElement
  },
  get importOptLayout() {
    return document.getElementById('import-opt-layout') as HTMLInputElement
  },
  get importOptLayoutLabel() {
    return document.getElementById('import-opt-layout-label') as HTMLLabelElement
  },
  get importOptSavedFiles() {
    return document.getElementById('import-opt-saved-files') as HTMLInputElement
  },
  get importOptSavedFilesLabel() {
    return document.getElementById('import-opt-saved-files-label') as HTMLLabelElement
  },
  get importResultModal() {
    return document.getElementById('import-result-modal') as HTMLDivElement
  },
  get importResultContent() {
    return document.getElementById('import-result-content') as HTMLDivElement
  },
  get exportModal() {
    return document.getElementById('export-modal') as HTMLDivElement
  },
  get exportOptCode() {
    return document.getElementById('export-opt-code') as HTMLInputElement
  },
  get exportOptContext() {
    return document.getElementById('export-opt-context') as HTMLInputElement
  },
  get exportOptSettings() {
    return document.getElementById('export-opt-settings') as HTMLInputElement
  },
  get exportOptSavedSnapshots() {
    return document.getElementById('export-opt-saved-snapshots') as HTMLInputElement
  },
  get exportOptRecentSnapshots() {
    return document.getElementById('export-opt-recent-snapshots') as HTMLInputElement
  },
  get exportOptLayout() {
    return document.getElementById('export-opt-layout') as HTMLInputElement
  },
  get exportOptSavedFiles() {
    return document.getElementById('export-opt-saved-files') as HTMLInputElement
  },
  get toastContainer() {
    return document.getElementById('toast-container') as HTMLDivElement
  },
  get executionControlBar() {
    return document.getElementById('execution-control-bar') as HTMLDivElement
  },
  get executionStatus() {
    return document.getElementById('execution-status') as HTMLSpanElement
  },
  get execPlayBtn() {
    return document.getElementById('exec-play-btn') as HTMLButtonElement
  },
  get execPauseBtn() {
    return document.getElementById('exec-pause-btn') as HTMLButtonElement
  },
  get execStopBtn() {
    return document.getElementById('exec-stop-btn') as HTMLButtonElement
  },
}
