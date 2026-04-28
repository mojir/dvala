// File explorer, scratch buffer, and auto-save.

import { tokenizeSource } from '../../../src/tooling'
import type { EditorMenuItem } from '../editorMenu'
import { renderEditorMenu } from '../editorMenu'
import {
  clearAllFileHistories,
  deleteFileHistory,
} from '../fileHistoryStorage'
import {
  DVALA_FILE_SUFFIX,
  clearAllFiles,
  fileDisplayName,
  filenameFromPath,
  folderFromPath,
  getSavedFiles,
  normalizeSavedFileName,
  setSavedFiles,
  stripDvalaSuffix,
} from '../fileStorage'
import type { SavedFile } from '../fileStorage'
import { buildFileTree } from '../fileTree'
import type { TreeNode } from '../fileTree'
import * as router from '../router'
import {
  ICONS,
  MAX_URL_LENGTH,
  activateCurrentFileHistory,
  applyState,
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
import { syncCodePanelView, syncPlaygroundUrlState } from './sidePanels'

// ─── Saved Files ──────────────────────────────────────────────────────────────

function animateFileCardRemoval(id: string): Promise<void> {
  const card = document.querySelector(`.snapshot-card[data-file-id="${id}"]`)
  if (!card) return Promise.resolve()
  return new Promise(resolve => {
    card.classList.add('removing')
    card.addEventListener('animationend', () => resolve(), { once: true })
    setTimeout(resolve, 300)
  })
}

export function populateSavedFilesList(options: { animateNewId?: string } = {}) {
  void options
  populateExplorerFileList()
}

export function loadSavedFile(id: string) {
  const file = getSavedFiles().find(entry => entry.id === id)
  if (!file) return
  if (isScratchActive()) persistScratchFromCurrentState()
  closeSnapshotViewIfNeeded()
  if (getState('current-file-id') === id) return
  cancelScratchEditedClear()
  flushPendingAutoSave()
  saveState(
    {
      'dvala-code': file.code,
      context: file.context,
      'current-file-id': file.id,
      'dvala-code-edited': false,
      'dvala-code-selection-start': 0,
      'dvala-code-selection-end': 0,
      'dvala-code-scroll-top': 0,
    },
    false,
  )
  activateCurrentFileHistory(false)
  const editor = getCodeEditor()
  editor.setValue(file.code)
  updateContextState(file.context, false)
  editor.scrollToTop()
  syncCodePanelView('files')
  syncPlaygroundUrlState('files')
  updateCSS()
  populateExplorerFileList()
  populateSavedFilesList()
}

// ─── Explorer panel (compact file list in editor tab) ────────────────────────

export const SCRATCH_TITLE = '<scratch>'

export function isScratchActive(): boolean {
  return getState('current-file-id') === null
}

function getScratchCode(): string {
  return isScratchActive() ? getState('dvala-code') : getState('scratch-code')
}

function getScratchContext(): string {
  return isScratchActive() ? getState('context') : getState('scratch-context')
}

export function hasScratchContent(): boolean {
  return getScratchCode().trim().length > 0 || getScratchContext().trim().length > 0
}

export function persistScratchFromCurrentState() {
  if (!isScratchActive()) return
  saveState(
    {
      'scratch-code': getState('dvala-code'),
      'scratch-context': getState('context'),
    },
    false,
  )
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

  const code = options.code ?? getState('scratch-code')
  const context = options.context ?? getState('scratch-context')

  flushPendingAutoSave()

  saveState(
    {
      'scratch-code': code,
      'scratch-context': context,
    },
    false,
  )

  closeSnapshotViewIfNeeded()

  saveState(
    {
      'active-side-tab': 'files',
      context,
      'context-scroll-top': 0,
      'context-selection-start': 0,
      'context-selection-end': 0,
      'current-file-id': null,
      'dvala-code': code,
      'dvala-code-edited': false,
      'dvala-code-scroll-top': 0,
      'dvala-code-selection-start': 0,
      'dvala-code-selection-end': 0,
      'focused-panel': 'dvala-code',
    },
    false,
  )

  activateCurrentFileHistory(true)

  if (options.navigateToPlayground) router.navigate('/editor')

  syncPlaygroundUrlState('files')
  applyState()
  populateExplorerFileList()

  if (options.focusCode) focusDvalaCode()

  if (options.toast) showToast(options.toast)
}

function getUniqueSavedFileName(name: string, existingNames: Iterable<string>): string {
  const normalizedName = normalizeSavedFileName(name)
  const usedNames = new Set(existingNames)
  if (!usedNames.has(normalizedName)) return normalizedName

  const baseName = stripDvalaSuffix(normalizedName)
  let n = 2
  let candidate = `${baseName} (${n})${DVALA_FILE_SUFFIX}`
  while (usedNames.has(candidate)) {
    n++
    candidate = `${baseName} (${n})${DVALA_FILE_SUFFIX}`
  }
  return candidate
}

/**
 * Pick a unique filename within the same folder. The disambiguation tail
 * (` (2)`, ` (3)`, …) is applied to the basename only — folder structure
 * is preserved.
 */
function uniquePathInFolder(folder: string, filename: string, files: SavedFile[]): string {
  const siblings = files.filter(f => folderFromPath(f.path) === folder).map(f => filenameFromPath(f.path))
  const unique = getUniqueSavedFileName(filename, siblings)
  return folder === '' ? unique : `${folder}/${unique}`
}

/**
 * Create a new untitled file at the root folder and return its ID.
 * Generates a unique name: "Untitled File.dvala", "Untitled File (2).dvala", etc.
 */
export function createUntitledFile(code = '', context = ''): string {
  const files = getSavedFiles()
  const path = uniquePathInFolder('', 'Untitled File', files)
  const now = Date.now()
  const createdFile: SavedFile = {
    id: crypto.randomUUID(),
    path,
    code,
    context,
    createdAt: now,
    updatedAt: now,
    locked: false,
  }
  setSavedFiles([createdFile, ...files])
  return createdFile.id
}

function populateExplorerFileList() {
  const list = document.getElementById('explorer-file-list')
  const stats = document.getElementById('explorer-file-stats')
  if (!list) return

  const files = getSavedFiles()
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
    list.innerHTML = `${renderScratchExplorerItem()}<div class="explorer-empty">No saved files</div>`
    renderFileStats()
    return
  }

  // Tree-shape rendering. Folders are derived from each `path` value; the
  // expand/collapse set lives in state so it survives reloads. Folders that
  // no longer have a backing file are silently dropped from the expand set
  // when we render — that keeps localStorage from accumulating stale paths.
  const tree = buildFileTree(files)
  const expanded = new Set<string>(getState('explorer-expanded-folders'))
  const remaining = new Set<string>()

  list.innerHTML = renderScratchExplorerItem() + tree.map(node => renderTreeNode(node, 0, expanded, remaining, currentId)).join('')

  // Prune the expanded set to only paths that still resolve to folders. Avoids
  // a slow drift where deleted folders linger in localStorage forever.
  if (remaining.size !== expanded.size || [...expanded].some(p => !remaining.has(p))) {
    saveState({ 'explorer-expanded-folders': [...remaining].filter(p => expanded.has(p)) }, false)
  }

  renderFileStats()
}

/**
 * Render one tree node (file or folder) as an HTML string. Folders nest
 * their children inline when expanded — there's no virtualization, so the
 * whole subtree paints whenever any node changes. Fine for the scale of
 * playground workspaces; revisit if anyone hits perf issues at 1000+ files.
 */
function renderTreeNode(
  node: TreeNode,
  depth: number,
  expanded: Set<string>,
  remaining: Set<string>,
  currentId: string | null,
): string {
  // 12px per depth level; the chevron sits in the indent gutter.
  const indent = `padding-left:${depth * 12}px;`
  if (node.kind === 'folder') {
    remaining.add(node.path)
    const isExpanded = expanded.has(node.path)
    const chevron = isExpanded ? '▾' : '▸'
    const childrenHtml = isExpanded
      ? node.children.map(c => renderTreeNode(c, depth + 1, expanded, remaining, currentId)).join('')
      : ''
    return `
      <div class="explorer-folder" style="${indent}" onclick="Playground.toggleExplorerFolder('${node.path}')" title="${escapeHtml(node.path)}">
        <span class="explorer-folder__chevron">${chevron}</span>
        <span class="explorer-folder__name" style="font-family:var(--font-mono);">${escapeHtml(node.name)}</span>
      </div>${childrenHtml}`
  }
  const entry = node.file
  const isActive = entry.id === currentId
  const activeClass = isActive ? ' explorer-item--active' : ''
  const lockHtml = entry.locked ? `<span class="explorer-item__lock" title="Locked">${ICONS.lock}</span>` : ''
  const menuId = `explorer-menu-${entry.id}`
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
      action: `Playground.closeExplorerMenus();Playground.deleteSavedFile('${entry.id}')`,
      danger: true,
      icon: ICONS.trash,
      label: 'Delete',
    },
  ]
  return `
      <div class="explorer-item${activeClass}" style="${indent}" onclick="Playground.loadSavedFile('${entry.id}')" title="${escapeHtml(entry.path)}">
        <span class="explorer-item__name" style="font-family:var(--font-mono);">${escapeHtml(filenameFromPath(entry.path))}</span>
        ${lockHtml}
        <span class="explorer-item__actions" onclick="event.stopPropagation()">
          <button class="explorer-item__btn" onclick="Playground.toggleExplorerMenu('${menuId}', this)" title="More actions">${ICONS.menu}</button>
          ${renderEditorMenu({ id: menuId, items: menuItems })}
        </span>
      </div>`
}

/**
 * Toggle the expanded state of a folder in the tree. Wired from the rendered
 * HTML; the state write triggers a re-render via `populateExplorerFileList`.
 */
export function toggleExplorerFolder(path: string): void {
  const expanded = new Set<string>(getState('explorer-expanded-folders'))
  if (expanded.has(path)) expanded.delete(path)
  else expanded.add(path)
  saveState({ 'explorer-expanded-folders': [...expanded] }, false)
  populateExplorerFileList()
}

export function renameFile(id: string) {
  const file = getSavedFiles().find(entry => entry.id === id)
  if (!file) return
  // Rename only changes the basename — the file stays in its current folder.
  // Moving across folders is a follow-up (tree drag-and-drop, Phase 1 later).
  const folder = folderFromPath(file.path)
  const currentFilename = filenameFromPath(file.path)
  showNameInputModal('Rename file', currentFilename, name => {
    const files = getSavedFiles()
    const normalizedFilename = normalizeSavedFileName(name)
    const newPath = folder === '' ? normalizedFilename : `${folder}/${normalizedFilename}`
    const duplicate = files.find(entry => entry.path === newPath && entry.id !== id)
    const doRename = () => {
      const updated = files
        .map(entry => (entry.id === id ? { ...entry, path: newPath, updatedAt: Date.now() } : entry))
        .filter(entry => !duplicate || entry.id !== duplicate.id)
      setSavedFiles(updated)
      updateCSS()
      populateSavedFilesList()
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
  const file = getSavedFiles().find(entry => entry.id === id)
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

function clearActiveFileSelection() {
  openScratchInEditor()
}

export function closeActiveFile() {
  clearActiveFileSelection()
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
    saveState(
      {
        'scratch-code': '',
        'scratch-context': '',
      },
      false,
    )

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

export function deleteSavedFile(id: string) {
  const file = getSavedFiles().find(entry => entry.id === id)
  if (!file) return
  const doDelete = async () => {
    await animateFileCardRemoval(id)
    deleteFileHistory(id)
    const updated = getSavedFiles().filter(p => p.id !== id)
    setSavedFiles(updated)
    if (getState('current-file-id') === id) {
      clearActiveFileSelection()
    }
    populateSavedFilesList()
  }
  if (file.locked) {
    void showInfoModal('Delete file', 'This file is locked. Are you sure you want to permanently delete it?', doDelete)
  } else {
    void doDelete()
  }
}

export function downloadFile(id: string) {
  const file = getSavedFiles().find(entry => entry.id === id)
  if (!file) return
  // Slashes in the path become underscores in the download filename so the
  // browser's "save as" dialog doesn't try to create folders.
  const filename = `${file.path.replace(/[^a-z0-9_-]/gi, '_')}.json`
  const { id: _id, ...exportData } = file
  void saveFile(JSON.stringify(exportData, null, 2), filename)
}

export function toggleFileLock(id: string) {
  const files = getSavedFiles()
  const updated = files.map(entry => (entry.id === id ? { ...entry, locked: !entry.locked } : entry))
  setSavedFiles(updated)
  populateSavedFilesList()
  if (id === getState('current-file-id')) updateCSS()
}

export function clearAllSavedFiles() {
  clearAllFiles()
  clearAllFileHistories()
  clearActiveFileSelection()
  populateSavedFilesList()
}

export function clearUnlockedFiles() {
  void showInfoModal(
    'Remove unlocked files',
    'This will delete all unlocked files. Locked files will be kept.',
    async () => {
      const unlocked = getSavedFiles().filter(p => !p.locked)
      await Promise.all(unlocked.map(entry => animateFileCardRemoval(entry.id)))
      unlocked.forEach(entry => deleteFileHistory(entry.id))
      const kept = getSavedFiles().filter(p => p.locked)
      setSavedFiles(kept)
      if (!kept.find(p => p.id === getState('current-file-id'))) {
        clearActiveFileSelection()
      }
      populateSavedFilesList()
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
      const existing = getSavedFiles()
      // Accept either `path` (new schema) or legacy `name` exports — anything
      // missing both falls back to "Imported File" at the root.
      const rawPath = typeof raw['path'] === 'string' ? raw['path'] : typeof raw['name'] === 'string' ? raw['name'] : 'Imported File'
      const path = uniquePathInFolder(folderFromPath(rawPath), filenameFromPath(rawPath), existing)
      const imported: SavedFile = {
        id: crypto.randomUUID(),
        path,
        code: typeof raw['code'] === 'string' ? raw['code'] : '',
        context: typeof raw['context'] === 'string' ? raw['context'] : '',
        createdAt: typeof raw['createdAt'] === 'number' ? raw['createdAt'] : now,
        updatedAt: typeof raw['updatedAt'] === 'number' ? raw['updatedAt'] : now,
        locked: typeof raw['locked'] === 'boolean' ? raw['locked'] : false,
      }
      setSavedFiles([imported, ...existing])

      populateSavedFilesList({ animateNewId: imported.id })
      showToast(`Imported "${fileDisplayName(imported)}"`)
    }
    reader.readAsText(file)
  }
  input.click()
}

export function duplicateFile(id: string) {
  const file = getSavedFiles().find(entry => entry.id === id)
  if (!file) return
  const now = Date.now()
  // Duplicate stays in the same folder as the source file; only the basename
  // gets the "Copy of " prefix and the disambiguation tail.
  const folder = folderFromPath(file.path)
  const path = uniquePathInFolder(folder, `Copy of ${filenameFromPath(file.path)}`, getSavedFiles())
  const copy: SavedFile = {
    id: crypto.randomUUID(),
    path,
    code: file.code,
    context: file.context,
    createdAt: now,
    updatedAt: now,
    locked: false,
  }
  setSavedFiles([copy, ...getSavedFiles()])
  saveState(
    {
      'dvala-code': copy.code,
      context: copy.context,
      'current-file-id': copy.id,
      'dvala-code-selection-start': 0,
      'dvala-code-selection-end': 0,
      'dvala-code-scroll-top': 0,
    },
    false,
  )
  activateCurrentFileHistory(true)
  getCodeEditor().setValue(copy.code)
  updateContextState(copy.context, false)
  updateCSS()
  populateSavedFilesList({ animateNewId: copy.id })
  showToast(`Created "${fileDisplayName(copy)}"`)
}

export function saveAs() {
  const currentId = getState('current-file-id')
  const currentFile = currentId ? getSavedFiles().find(entry => entry.id === currentId) : null
  // saveAs creates the copy in the source's folder (or the root for scratch).
  const sourceFolder = currentFile ? folderFromPath(currentFile.path) : ''
  const defaultName = currentFile ? `Copy of ${filenameFromPath(currentFile.path)}` : ''
  showNameInputModal('Save as', defaultName, name => {
    const files = getSavedFiles()
    const normalizedFilename = normalizeSavedFileName(name)
    const newPath = sourceFolder === '' ? normalizedFilename : `${sourceFolder}/${normalizedFilename}`
    const duplicate = files.find(entry => entry.path === newPath)
    const doSave = () => {
      const filtered = duplicate ? files.filter(entry => entry.id !== duplicate.id) : files
      const now = Date.now()
      if (!currentId) persistScratchFromCurrentState()
      const createdFile: SavedFile = {
        id: crypto.randomUUID(),
        path: newPath,
        code: getState('dvala-code'),
        context: getState('context'),
        createdAt: now,
        updatedAt: now,
        locked: false,
      }
      setSavedFiles([createdFile, ...filtered])
      saveState({ 'current-file-id': createdFile.id }, false)
      activateCurrentFileHistory(true)

      updateCSS()
      populateSavedFilesList({ animateNewId: createdFile.id })
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
    const updated = getSavedFiles().map(p =>
      p.id === id ? { ...p, code: getState('dvala-code'), context: getState('context'), updatedAt: Date.now() } : p,
    )
    setSavedFiles(updated)
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
  if (getSavedFiles().find(p => p.id === currentId)?.locked) return
  if (state.autoSaveTimer) clearTimeout(state.autoSaveTimer)
  state.autoSaveTimer = setTimeout(() => {
    state.autoSaveTimer = null
    const id = getState('current-file-id')
    if (!id) return
    const updated = getSavedFiles().map(p =>
      p.id === id ? { ...p, code: getState('dvala-code'), context: getState('context'), updatedAt: Date.now() } : p,
    )
    setSavedFiles(updated)
    populateSavedFilesList()
    updateCSS()
  }, PENDING_INDICATOR_DELAY)
  updateCSS()
}

