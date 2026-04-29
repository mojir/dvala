// File explorer, scratch buffer, and auto-save.

import { tokenizeSource } from '../../../src/tooling'
import type { EditorMenuItem } from '../editorMenu'
import { renderEditorMenu } from '../editorMenu'
import {
  clearAllFileHistories,
  deleteFileHistory,
} from '../fileHistoryStorage'
import {
  clearAllFiles,
  fileDisplayName,
  filenameFromPath,
  folderFromPath,
  getWorkspaceFiles,
  normalizeWorkspaceFileName,
  setWorkspaceFiles,
  uniquePathInFolder,
} from '../fileStorage'
import type { WorkspaceFile } from '../fileStorage'
import { buildFileTree } from '../fileTree'
import {
  ensureScratchFile,
  getScratchCode as readScratchCode,
  getScratchContext as readScratchContext,
  isScratchPath,
  setScratchCodeAndContext,
} from '../scratchBuffer'
import type { TreeNode } from '../fileTree'
import * as router from '../router'
import {
  ICONS,
  MAX_URL_LENGTH,
  activateCurrentFileHistory,
  closeAllEditorMenus,
  escapeHtml,
  focusDvalaCode,
  formatTime,
  hideExecutionControlBar,
  saveFile,
  toggleEditorMenu,
  updateContextState,
  updateCSS,
} from '../scripts'
import { getState, saveState } from '../state'
import { getCodeEditor } from './codeEditorInstance'
import {
  createModalPanel,
  popModal,
  pushPanel,
  showInfoModal,
  showToast,
} from './modals'
import { state } from './playgroundState'
import {
  closeTab,
  closeTabsForMissingFiles,
  focusScratch,
  markActiveTabSynced,
  notifyTabsChanged,
  openOrFocusFile,
} from './tabs'
import { syncCodePanelView, syncPlaygroundUrlState } from './sidePanels'

// ─── Workspace Files ──────────────────────────────────────────────────────────

function animateFileCardRemoval(id: string): Promise<void> {
  const card = document.querySelector(`.snapshot-card[data-file-id="${id}"]`)
  if (!card) return Promise.resolve()
  return new Promise(resolve => {
    card.classList.add('removing')
    card.addEventListener('animationend', () => resolve(), { once: true })
    setTimeout(resolve, 300)
  })
}

export function populateWorkspaceFilesList(options: { animateNewId?: string } = {}) {
  void options
  populateExplorerFileList()
}

export function loadWorkspaceFile(id: string) {
  const file = getWorkspaceFiles().find(entry => entry.id === id)
  if (!file) return
  if (isScratchActive()) persistScratchFromCurrentState()
  closeSnapshotViewIfNeeded()
  if (getState('current-file-id') === id) return
  cancelScratchEditedClear()
  flushPendingAutoSave()
  saveState({ context: file.context, 'dvala-code-edited': false }, false)
  // openOrFocusFile syncs `current-file-id` + `dvala-code` to the tab's
  // model and swaps Monaco's active model, preserving cursor / scroll for
  // any tab the user reopens.
  openOrFocusFile(file.id)
  activateCurrentFileHistory(false)
  updateContextState(file.context, false)
  syncCodePanelView('files')
  syncPlaygroundUrlState('files')
  updateCSS()
  populateExplorerFileList()
  populateWorkspaceFilesList()
}

// ─── Explorer panel (compact file list in editor tab) ────────────────────────

export const SCRATCH_TITLE = '<scratch>'

export function isScratchActive(): boolean {
  return getState('current-file-id') === null
}

function getScratchCode(): string {
  // When scratch is the active tab, the live editor content (`dvala-code`)
  // is ahead of what's persisted; otherwise read the scratch workspace file.
  return isScratchActive() ? getState('dvala-code') : readScratchCode()
}

function getScratchContext(): string {
  return isScratchActive() ? getState('context') : readScratchContext()
}

export function hasScratchContent(): boolean {
  return getScratchCode().trim().length > 0 || getScratchContext().trim().length > 0
}

export function persistScratchFromCurrentState() {
  if (!isScratchActive()) return
  setScratchCodeAndContext(getState('dvala-code'), getState('context'))
}

function closeSnapshotViewIfNeeded() {
  if (state.snapshotViewStack.length === 0) return
  state.snapshotViewStack.splice(0)
  state.activeSnapshotKey = null
  state.currentSnapshot = null
  hideExecutionControlBar()
}

export function openScratchInEditor(
  options: {
    code?: string
    context?: string
    toast?: string
    focusCode?: boolean
    navigateToPlayground?: boolean
    force?: boolean
  } = {},
) {
  // Guard: if loading new code into scratch and it already has content, confirm first.
  // The `force` flag skips this — used when the caller has already confirmed (e.g. clearScratch).
  if (!options.force && options.code !== undefined && hasScratchContent() && getState('dvala-code-edited')) {
    void showInfoModal('Overwrite scratch?', 'The scratch buffer has content. Discard it?', () => {
      openScratchInEditor({ ...options, force: true })
    })
    return
  }

  const code = options.code ?? readScratchCode()
  const context = options.context ?? readScratchContext()

  flushPendingAutoSave()

  setScratchCodeAndContext(code, context)
  closeSnapshotViewIfNeeded()

  saveState(
    {
      'active-side-tab': 'files',
      context,
      'context-scroll-top': 0,
      'context-selection-start': 0,
      'context-selection-end': 0,
      'dvala-code-edited': false,
      'focused-panel': 'dvala-code',
    },
    false,
  )

  // Switch to the scratch tab and rewrite its model if the caller passed an
  // explicit `code`. focusScratch() handles the model swap + state mirror;
  // the explicit setEditorValue happens AFTER focus so the write lands in
  // the scratch tab's model rather than whatever was previously active.
  focusScratch()
  if (options.code !== undefined) getCodeEditor().setValue(code)

  activateCurrentFileHistory(true)

  if (options.navigateToPlayground) router.navigate('/editor')

  syncPlaygroundUrlState('files')
  // updateCSS reads `current-file-id` to refresh the title pill + lock state
  // for the now-active scratch tab; without it the pill keeps showing the
  // previously-focused file's name.
  updateCSS()
  populateExplorerFileList()

  if (options.focusCode) focusDvalaCode()

  if (options.toast) showToast(options.toast)
}

// uniquePathInFolder + uniqueFilePath live in fileStorage.ts (testable + reusable).

/**
 * Create a new untitled file at the root folder and return its ID.
 * Generates a unique name: "Untitled File.dvala", "Untitled File (2).dvala", etc.
 */
export function createUntitledFile(code = '', context = ''): string {
  const files = getWorkspaceFiles()
  const path = uniquePathInFolder('', 'Untitled File', files)
  const now = Date.now()
  const createdFile: WorkspaceFile = {
    id: crypto.randomUUID(),
    path,
    code,
    context,
    createdAt: now,
    updatedAt: now,
    locked: false,
  }
  setWorkspaceFiles([createdFile, ...files])
  return createdFile.id
}

function populateExplorerFileList() {
  const list = document.getElementById('explorer-file-list')
  const stats = document.getElementById('explorer-file-stats')
  if (!list) return

  const files = getWorkspaceFiles()
  const currentId = getState('current-file-id')
  const scratchCode = getScratchCode()

  const renderScratchExplorerItem = () => {
    const activeClass = currentId === null ? ' explorer-item--active' : ''

    return `
      <div class="explorer-item${activeClass}" onclick="Playground.openScratch()" title="Scratch">
        <span class="explorer-item__name" style="font-family:var(--font-mono);">${escapeHtml(SCRATCH_TITLE)}</span>
      </div>`
  }

  const renderFileStats = () => {
    if (!stats) return
    // No stats panel when scratch is active
    if (currentId === null) {
      stats.style.display = 'none'
      return
    }
    const currentFile = currentId ? files.find(entry => entry.id === currentId) : null
    const currentTitle = currentFile ? fileDisplayName(currentFile) : SCRATCH_TITLE
    const currentCode = currentFile ? currentFile.code : scratchCode
    const lockIcon = currentFile?.locked
      ? `<span class="file-stats-panel__lock" title="Locked">${ICONS.lock}</span>`
      : ''
    const timeMarkup = currentFile
      ? `<div class="file-stats-panel__time">${formatTime(new Date(currentFile.updatedAt))}</div>`
      : '<div class="file-stats-panel__time">Local scratch</div>'

    const tokenStream = tokenizeSource(currentCode)
    const meaningfulTokens = tokenStream.tokens
    let firstMeaningful = 0
    while (firstMeaningful < meaningfulTokens.length) {
      const type = meaningfulTokens[firstMeaningful]![0]
      if (type !== 'Whitespace' && type !== 'SingleLineComment' && type !== 'MultiLineComment') break
      firstMeaningful++
    }
    const lineCount = currentCode === '' ? 0 : currentCode.split('\n').length
    const charCount = currentCode.length

    stats.style.display = 'block'
    stats.innerHTML = `
      <div class="file-stats-panel__header">
        <div class="file-stats-panel__title-row">
          <span class="file-stats-panel__title" style="font-family:var(--font-mono);">${escapeHtml(currentTitle)}</span>
          ${lockIcon}
        </div>
        ${timeMarkup}
      </div>
      <div class="file-stats-panel__meta">
        <span>${lineCount} ${lineCount === 1 ? 'line' : 'lines'}</span>
        <span>${charCount} chars</span>
      </div>`
  }

  if (files.length === 0) {
    list.innerHTML = `${renderScratchExplorerItem()}<div class="explorer-empty">No workspace files</div>`
    renderFileStats()
    return
  }

  // Tree-shape rendering. Folders are derived from each `path` value; the
  // expand/collapse set lives in state so it survives reloads. Folders that
  // no longer have a backing file are pruned out of the expand set on every
  // render so localStorage doesn't accumulate stale paths.
  const tree = buildFileTree(files)
  const expanded = new Set<string>(getState('explorer-expanded-folders'))

  list.innerHTML = renderScratchExplorerItem() + tree.map(node => renderTreeNode(node, 0, expanded, currentId)).join('')

  // Walk the full tree (regardless of expansion state) to collect every
  // folder path that still has a file under it. The pruned set must only
  // drop folders that genuinely no longer exist — earlier we walked just
  // the rendered subtree, which had the side effect of forgetting any
  // folder nested inside a *collapsed* parent the next time the user
  // expanded it.
  const liveFolders = collectFolderPaths(tree)
  const stillExpanded = [...expanded].filter(p => liveFolders.has(p))
  if (stillExpanded.length !== expanded.size) {
    saveState({ 'explorer-expanded-folders': stillExpanded }, false)
  }

  renderFileStats()
}

/** Recursively gather every folder path in the tree. */
function collectFolderPaths(nodes: TreeNode[], into: Set<string> = new Set()): Set<string> {
  for (const node of nodes) {
    if (node.kind === 'folder') {
      into.add(node.path)
      collectFolderPaths(node.children, into)
    }
  }
  return into
}

/**
 * Render one tree node (file or folder) as an HTML string. Folders nest
 * their children inline when expanded — there's no virtualization, so the
 * whole subtree paints whenever any node changes. Fine for the scale of
 * playground workspaces; revisit if anyone hits perf issues at 1000+ files.
 *
 * Click targets use `data-*` attributes + a delegated handler installed
 * once on the parent list (see `wireExplorerListeners`). Inline `onclick`
 * with interpolated user data would let a path containing a single quote
 * inject arbitrary JS into the handler.
 */
function renderTreeNode(node: TreeNode, depth: number, expanded: Set<string>, currentId: string | null): string {
  // 12px per depth level; the chevron sits in the indent gutter.
  const indent = `padding-left:${depth * 12}px;`
  if (node.kind === 'folder') {
    const isExpanded = expanded.has(node.path)
    const chevron = isExpanded ? '▾' : '▸'
    const childrenHtml = isExpanded
      ? node.children.map(c => renderTreeNode(c, depth + 1, expanded, currentId)).join('')
      : ''
    return `
      <div class="explorer-folder" style="${indent}" data-folder-path="${escapeHtml(node.path)}" title="${escapeHtml(node.path)}">
        <span class="explorer-folder__chevron">${chevron}</span>
        <span class="explorer-folder__name" style="font-family:var(--font-mono);">${escapeHtml(node.name)}</span>
      </div>${childrenHtml}`
  }
  const entry = node.file
  const isActive = entry.id === currentId
  const activeClass = isActive ? ' explorer-item--active' : ''
  const lockHtml = entry.locked ? `<span class="explorer-item__lock" title="Locked">${ICONS.lock}</span>` : ''
  const menuId = `explorer-menu-${entry.id}`
  // Menu actions interpolate the file id, which is a UUID generated by
  // crypto.randomUUID — safe in a JS string literal. The folder path above
  // is user-supplied and goes through data-attribute + delegated handler.
  const menuItems: EditorMenuItem[] = [
    {
      action: `Playground.closeExplorerMenus();Playground.renameFile('${entry.id}')`,
      icon: ICONS.edit,
      label: 'Rename',
    },
    {
      action: `Playground.closeExplorerMenus();Playground.duplicateFile('${entry.id}')`,
      icon: ICONS.duplicate,
      label: 'Duplicate',
    },
    {
      action: `Playground.closeExplorerMenus();Playground.toggleFileLock('${entry.id}')`,
      icon: entry.locked ? ICONS.unlock : ICONS.lock,
      label: entry.locked ? 'Unlock' : 'Lock',
    },
    {
      action: `Playground.closeExplorerMenus();Playground.downloadFile('${entry.id}')`,
      icon: ICONS.download,
      label: 'Export',
    },
    {
      action: `Playground.closeExplorerMenus();Playground.shareFile('${entry.id}')`,
      icon: ICONS.share,
      label: 'Share',
    },
    {
      action: `Playground.closeExplorerMenus();Playground.deleteWorkspaceFile('${entry.id}')`,
      danger: true,
      icon: ICONS.trash,
      label: 'Delete',
    },
  ]
  return `
      <div class="explorer-item${activeClass}" style="${indent}" data-file-id="${entry.id}" title="${escapeHtml(entry.path)}">
        <span class="explorer-item__name" style="font-family:var(--font-mono);">${escapeHtml(filenameFromPath(entry.path))}</span>
        ${lockHtml}
        <span class="explorer-item__actions" onclick="event.stopPropagation()">
          <button class="explorer-item__btn" onclick="Playground.toggleExplorerMenu('${menuId}', this)" title="More actions">${ICONS.menu}</button>
          ${renderEditorMenu({ id: menuId, items: menuItems })}
        </span>
      </div>`
}

/**
 * Wire a single delegated click handler on the explorer list. Each row
 * carries a `data-folder-path` or `data-file-id` attribute; the handler
 * dispatches based on the nearest matching ancestor of the click target.
 *
 * Called once during boot — guarded by `explorerListenersWired` so repeat
 * boot calls (e.g. test harness reset) don't double-bind.
 */
let explorerListenersWired = false
export function wireExplorerListeners(): void {
  if (explorerListenersWired) return
  const list = document.getElementById('explorer-file-list')
  if (!list) return
  explorerListenersWired = true
  list.addEventListener('click', evt => {
    const target = evt.target as HTMLElement
    // Click inside the per-file actions menu (the "⋯" button + dropdown)
    // shouldn't toggle the row; let those handlers run on their own.
    if (target.closest('.explorer-item__actions')) return
    const folder = target.closest<HTMLElement>('[data-folder-path]')
    if (folder) {
      toggleExplorerFolder(folder.dataset['folderPath']!)
      return
    }
    const file = target.closest<HTMLElement>('[data-file-id]')
    if (file) {
      void loadWorkspaceFile(file.dataset['fileId']!)
    }
  })
}

/**
 * Toggle the expanded state of a folder in the tree. Public so the e2e
 * suite can drive expand/collapse without clicking; everyday clicks come
 * through the delegated listener in wireExplorerListeners.
 */
export function toggleExplorerFolder(path: string): void {
  const expanded = new Set<string>(getState('explorer-expanded-folders'))
  if (expanded.has(path)) expanded.delete(path)
  else expanded.add(path)
  saveState({ 'explorer-expanded-folders': [...expanded] }, false)
  populateExplorerFileList()
}

export function renameFile(id: string) {
  const file = getWorkspaceFiles().find(entry => entry.id === id)
  if (!file) return
  // Rename keeps the file anchored in its current folder — the user-typed
  // string is treated as a basename, not an absolute path. Cross-folder
  // moves are a deferred follow-up (tree drag-and-drop, Phase 1 later).
  //
  // Subtle: if the user types `sub/bar`, `normalizeWorkspaceFileName` produces
  // `sub/bar.dvala` and the resulting `newPath` becomes
  // `${currentFolder}/sub/bar.dvala` — i.e. a file deeper in the tree, not
  // a peer rename. This is intentional today (keeps the rename invariant
  // simple) and the deferred drag-to-move work is the right place to add
  // an explicit "move out of current folder" affordance.
  const folder = folderFromPath(file.path)
  const currentFilename = filenameFromPath(file.path)
  showNameInputModal('Rename file', currentFilename, name => {
    const files = getWorkspaceFiles()
    const normalizedFilename = normalizeWorkspaceFileName(name)
    const newPath = folder === '' ? normalizedFilename : `${folder}/${normalizedFilename}`
    const duplicate = files.find(entry => entry.path === newPath && entry.id !== id)
    const doRename = () => {
      const updated = files
        .map(entry => (entry.id === id ? { ...entry, path: newPath, updatedAt: Date.now() } : entry))
        .filter(entry => !duplicate || entry.id !== duplicate.id)
      setWorkspaceFiles(updated)
      updateCSS()
      populateWorkspaceFilesList()
      // The tab's display name comes from the file's path; re-render the
      // strip so the rename shows up immediately. Also: if a duplicate
      // file was overwritten, its tab (if any) needs to close.
      if (duplicate) closeTabsForMissingFiles()
      notifyTabsChanged()
      showToast(`Renamed to "${normalizedFilename}"`)
    }
    if (duplicate) {
      void showInfoModal('Replace existing file?', `"${normalizedFilename}" already exists. Replace it?`, doRename)
    } else {
      doRename()
    }
  })
}

export function shareFile(id: string) {
  const file = getWorkspaceFiles().find(entry => entry.id === id)
  if (!file) return

  const dismiss = () => popModal()

  const { panel, body } = createModalPanel({
    size: 'small',
    footerActions: [
      { label: 'Cancel', action: dismiss },
      {
        label: 'Copy link',
        primary: true,
        action: () => {
          const includeContext =
            (document.getElementById('share-include-context') as HTMLInputElement)?.checked ?? false
          const sharedState: Record<string, unknown> = { 'dvala-code': file.code }
          if (includeContext && file.context.trim()) {
            sharedState['context'] = file.context
          }
          const base = document.querySelector('base')?.href ?? `${location.origin}/`
          const encoded = btoa(encodeURIComponent(JSON.stringify(sharedState)))
          const params = new URLSearchParams({
            state: encoded,
            view: getState('active-side-tab'),
          })
          params.set('fileId', file.id)
          const href = `${base}editor?${params.toString()}`
          if (href.length > MAX_URL_LENGTH) {
            popModal()
            showToast('File is too large to share as a URL. Try reducing the code or context size.', {
              severity: 'error',
            })
            return
          }
          void navigator.clipboard.writeText(href).then(() => {
            showToast('Link copied to clipboard')
          })
          popModal()
        },
      },
    ],
  })

  const content = document.createElement('div')
  content.className = 'modal-body-row'
  content.innerHTML = `
    <p style="margin:0 0 var(--space-3);">Share <strong>${escapeHtml(fileDisplayName(file))}</strong> as a link.</p>
    <label style="display:flex; align-items:center; gap:var(--space-2); cursor:pointer;">
      <input type="checkbox" id="share-include-context" ${file.context.trim() ? '' : 'disabled'}>
      Include context${file.context.trim() ? '' : ' (empty)'}
    </label>
  `
  body.appendChild(content)

  pushPanel(panel, 'Share file')
}

export function toggleExplorerMenu(menuId: string, btn: HTMLElement) {
  toggleEditorMenu(menuId, btn, 2)
}

export function closeExplorerMenus() {
  closeAllEditorMenus()
}

export function closeActiveFile() {
  // Close the active tab; the tab manager falls back to a neighbor (or
  // scratch if it was the last file tab open).
  const currentId = getState('current-file-id')
  if (currentId === null) return // already on scratch — nothing to close
  closeTab(currentId)
  populateExplorerFileList()
  updateCSS()
}

export function openScratch() {
  openScratchInEditor({ focusCode: true })
}

export function saveScratch() {
  if (!hasScratchContent()) return
  saveAs()
}

export function clearScratch() {
  const clear = () => {
    setScratchCodeAndContext('', '')

    if (isScratchActive())
      openScratchInEditor({ code: '', context: '', focusCode: true, toast: 'Scratch cleared', force: true })
    else {
      populateExplorerFileList()
      updateCSS()
      showToast('Scratch cleared')
    }
  }

  if (!hasScratchContent()) {
    clear()
    return
  }

  void showInfoModal('Clear scratch', 'This will clear the scratch buffer.', clear)
}

export function deleteWorkspaceFile(id: string) {
  const file = getWorkspaceFiles().find(entry => entry.id === id)
  if (!file) return
  // The scratch buffer's backing file is undeletable — clearing scratch goes
  // through `clearScratch` (sets code/context to ''), not deletion. The UI
  // doesn't expose a delete affordance for it (it lives under the hidden
  // .dvala-playground/ folder), so this guard is defense-in-depth against
  // programmatic callers (Playground.* API, tests).
  if (isScratchPath(file.path)) return
  const doDelete = async () => {
    await animateFileCardRemoval(id)
    deleteFileHistory(id)
    const updated = getWorkspaceFiles().filter(p => p.id !== id)
    setWorkspaceFiles(updated)
    // Close any open tab pointing at the deleted file (tab manager falls
    // back to a neighbor or scratch). Replaces the previous
    // clearActiveFileSelection-via-openScratch dance.
    closeTabsForMissingFiles()
    populateWorkspaceFilesList()
  }
  if (file.locked) {
    void showInfoModal('Delete file', 'This file is locked. Are you sure you want to permanently delete it?', doDelete)
  } else {
    void doDelete()
  }
}

export function downloadFile(id: string) {
  const file = getWorkspaceFiles().find(entry => entry.id === id)
  if (!file) return
  // Slashes in the path become underscores in the download filename so the
  // browser's "save as" dialog doesn't try to create folders.
  const filename = `${file.path.replace(/[^a-z0-9_-]/gi, '_')}.json`
  const { id: _id, ...exportData } = file
  void saveFile(JSON.stringify(exportData, null, 2), filename)
}

export function toggleFileLock(id: string) {
  const files = getWorkspaceFiles()
  const updated = files.map(entry => (entry.id === id ? { ...entry, locked: !entry.locked } : entry))
  setWorkspaceFiles(updated)
  populateWorkspaceFilesList()
  if (id === getState('current-file-id')) updateCSS()
}

export function clearAllWorkspaceFiles() {
  clearAllFiles()
  // Re-create the scratch buffer's backing file (Phase 1.5 step 23c —
  // scratch is undeletable; "clear everything" wipes its content but the
  // file itself comes right back, empty).
  ensureScratchFile()
  clearAllFileHistories()
  closeTabsForMissingFiles()
  populateWorkspaceFilesList()
}

export function clearUnlockedFiles() {
  void showInfoModal(
    'Remove unlocked files',
    'This will delete all unlocked files. Locked files will be kept.',
    async () => {
      const unlocked = getWorkspaceFiles().filter(p => !p.locked)
      await Promise.all(unlocked.map(entry => animateFileCardRemoval(entry.id)))
      unlocked.forEach(entry => deleteFileHistory(entry.id))
      const kept = getWorkspaceFiles().filter(p => p.locked)
      setWorkspaceFiles(kept)
      closeTabsForMissingFiles()
      populateWorkspaceFilesList()
      showToast('Unlocked files cleared')
    },
  )
}

export function openImportFileModal() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = () => {
    const file = input.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      let parsed: unknown
      try {
        parsed = JSON.parse(reader.result as string)
      } catch {
        void showInfoModal('Import failed', 'Invalid JSON — could not parse the file.')
        return
      }
      if (typeof parsed !== 'object' || parsed === null || !('code' in parsed)) {
        void showInfoModal('Import failed', 'Not a valid file object (requires at least "code").')
        return
      }
      const raw = parsed as Record<string, unknown>
      const now = Date.now()
      const existing = getWorkspaceFiles()
      // Accept either `path` (new schema) or legacy `name` exports — anything
      // missing both falls back to "Imported File" at the root.
      const rawPath = typeof raw['path'] === 'string' ? raw['path'] : typeof raw['name'] === 'string' ? raw['name'] : 'Imported File'
      const path = uniquePathInFolder(folderFromPath(rawPath), filenameFromPath(rawPath), existing)
      const imported: WorkspaceFile = {
        id: crypto.randomUUID(),
        path,
        code: typeof raw['code'] === 'string' ? raw['code'] : '',
        context: typeof raw['context'] === 'string' ? raw['context'] : '',
        createdAt: typeof raw['createdAt'] === 'number' ? raw['createdAt'] : now,
        updatedAt: typeof raw['updatedAt'] === 'number' ? raw['updatedAt'] : now,
        locked: typeof raw['locked'] === 'boolean' ? raw['locked'] : false,
      }
      setWorkspaceFiles([imported, ...existing])

      populateWorkspaceFilesList({ animateNewId: imported.id })
      showToast(`Imported "${fileDisplayName(imported)}"`)
    }
    reader.readAsText(file)
  }
  input.click()
}

export function duplicateFile(id: string) {
  const file = getWorkspaceFiles().find(entry => entry.id === id)
  if (!file) return
  const now = Date.now()
  // Duplicate stays in the same folder as the source file; only the basename
  // gets the "Copy of " prefix and the disambiguation tail.
  const folder = folderFromPath(file.path)
  const path = uniquePathInFolder(folder, `Copy of ${filenameFromPath(file.path)}`, getWorkspaceFiles())
  const copy: WorkspaceFile = {
    id: crypto.randomUUID(),
    path,
    code: file.code,
    context: file.context,
    createdAt: now,
    updatedAt: now,
    locked: false,
  }
  setWorkspaceFiles([copy, ...getWorkspaceFiles()])
  saveState({ context: copy.context }, false)
  // Open the duplicate in a fresh tab. openOrFocusFile creates the model
  // from copy.code and syncs current-file-id + dvala-code state.
  openOrFocusFile(copy.id)
  activateCurrentFileHistory(true)
  updateContextState(copy.context, false)
  updateCSS()
  populateWorkspaceFilesList({ animateNewId: copy.id })
  showToast(`Created "${fileDisplayName(copy)}"`)
}

export function saveAs() {
  const currentId = getState('current-file-id')
  const currentFile = currentId ? getWorkspaceFiles().find(entry => entry.id === currentId) : null
  // saveAs creates the copy in the source's folder (or the root for scratch).
  const sourceFolder = currentFile ? folderFromPath(currentFile.path) : ''
  const defaultName = currentFile ? `Copy of ${filenameFromPath(currentFile.path)}` : ''
  showNameInputModal('Save as', defaultName, name => {
    const files = getWorkspaceFiles()
    const normalizedFilename = normalizeWorkspaceFileName(name)
    const newPath = sourceFolder === '' ? normalizedFilename : `${sourceFolder}/${normalizedFilename}`
    const duplicate = files.find(entry => entry.path === newPath)
    const doSave = () => {
      const filtered = duplicate ? files.filter(entry => entry.id !== duplicate.id) : files
      const now = Date.now()
      if (!currentId) persistScratchFromCurrentState()
      const createdFile: WorkspaceFile = {
        id: crypto.randomUUID(),
        path: newPath,
        code: getState('dvala-code'),
        context: getState('context'),
        createdAt: now,
        updatedAt: now,
        locked: false,
      }
      setWorkspaceFiles([createdFile, ...filtered])
      // Open the new file as a tab so close / switch flows find it. Without
      // this, saveAs leaves the current tab pointed at scratch (or whatever
      // was active) while `current-file-id` claims the new file exists.
      openOrFocusFile(createdFile.id)
      // openOrFocusFile syncs `current-file-id` already.
      activateCurrentFileHistory(true)

      updateCSS()
      populateWorkspaceFilesList({ animateNewId: createdFile.id })
      showToast(`Saved as "${normalizedFilename}"`)
    }
    if (duplicate) {
      void showInfoModal('Replace existing file?', `"${normalizedFilename}" already exists. Replace it?`, doSave)
    } else {
      doSave()
    }
  })
}

export function showNameInputModal(
  title: string,
  defaultValue: string,
  onConfirm: (name: string) => void,
  onCancel?: () => void,
  options?: { prefix?: string },
) {
  const dismiss = () => {
    popModal()
    onCancel?.()
  }

  const input = document.createElement('input')
  input.type = 'text'
  input.value = defaultValue
  input.spellcheck = false
  input.style.cssText = `background:var(--color-surface-dim); border:1px solid var(--color-scrollbar-track); border-radius:4px; padding:0.4rem 0.6rem; color:var(--color-text); font-size:0.9rem; outline:none; width:100%; box-sizing:border-box;${options?.prefix ? ' border-top-left-radius:0; border-bottom-left-radius:0; border-left:none;' : ''}`

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const name = input.value.trim()
      if (!name) return
      popModal()
      onConfirm(name)
    } else if (e.key === 'Escape') {
      dismiss()
    }
  })

  const { panel, body } = createModalPanel({
    size: 'small',
    onClose: onCancel,
    footerActions: [
      { label: 'Cancel', action: dismiss },
      {
        label: 'Save',
        primary: true,
        action: () => {
          const name = input.value.trim()
          if (!name) return
          popModal()
          onConfirm(name)
        },
      },
    ],
  })

  const row = document.createElement('div')
  row.className = 'modal-body-row'
  if (options?.prefix) {
    row.style.display = 'flex'
    row.style.alignItems = 'stretch'

    const prefix = document.createElement('span')
    prefix.textContent = options.prefix
    prefix.setAttribute('aria-hidden', 'true')
    prefix.style.cssText =
      'display:inline-flex; align-items:center; justify-content:center; padding:0 0.65rem; border:1px solid var(--color-scrollbar-track); border-right:none; border-radius:4px 0 0 4px; background:var(--color-surface); color:var(--color-text-dim); font-family:var(--font-mono); font-size:0.9rem; flex-shrink:0; user-select:none;'

    row.appendChild(prefix)
  }

  row.appendChild(input)
  body.appendChild(row)

  pushPanel(panel, title)
  setTimeout(() => {
    input.focus()
    input.select()
  }, 0)
}

// ─── Auto-save ────────────────────────────────────────────────────────────────

// Timer to clear the scratch "edited" indicator after a short delay (mirrors auto-save UX)
const PENDING_INDICATOR_DELAY = 1000

export function scheduleScratchEditedClear() {
  // dvala-code-edited persists as the durable "user touched scratch" flag.
  // The timer only drives the transient pending indicator via state.scratchEditedTimer !== null.
  saveState({ 'dvala-code-edited': true }, false)
  if (state.scratchEditedTimer) clearTimeout(state.scratchEditedTimer)
  state.scratchEditedTimer = setTimeout(() => {
    state.scratchEditedTimer = null
    updateCSS()
  }, PENDING_INDICATOR_DELAY)
}

function cancelScratchEditedClear() {
  if (!state.scratchEditedTimer) return
  clearTimeout(state.scratchEditedTimer)
  state.scratchEditedTimer = null
}

export function flushPendingAutoSave() {
  if (!state.autoSaveTimer) return
  clearTimeout(state.autoSaveTimer)
  state.autoSaveTimer = null
  const id = getState('current-file-id')
  if (id) {
    const updated = getWorkspaceFiles().map(p =>
      p.id === id ? { ...p, code: getState('dvala-code'), context: getState('context'), updatedAt: Date.now() } : p,
    )
    setWorkspaceFiles(updated)
  }
}

/**
 * Guards a code-replacing action that switches the editor to scratch mode.
 * Flushes any pending auto-save for the current file, then proceeds.
 * Scratch content is guarded separately in openScratchInEditor.
 */
export function guardCodeReplacement(proceed: () => void) {
  flushPendingAutoSave()
  proceed()
}

export function scheduleAutoSave() {
  const currentId = getState('current-file-id')
  if (!currentId) return
  if (getWorkspaceFiles().find(p => p.id === currentId)?.locked) return
  if (state.autoSaveTimer) clearTimeout(state.autoSaveTimer)
  state.autoSaveTimer = setTimeout(() => {
    state.autoSaveTimer = null
    const id = getState('current-file-id')
    if (!id) return
    const updated = getWorkspaceFiles().map(p =>
      p.id === id ? { ...p, code: getState('dvala-code'), context: getState('context'), updatedAt: Date.now() } : p,
    )
    setWorkspaceFiles(updated)
    // Resets the modified dot on the active file tab — the buffer now
    // matches the file's stored code.
    markActiveTabSynced()
    populateWorkspaceFilesList()
    updateCSS()
  }, PENDING_INDICATOR_DELAY)
  updateCSS()
}

