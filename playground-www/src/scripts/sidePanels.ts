// Side-panel rendering: tab switching, snapshot list, code-panel sync, URL state.

import type { EditorMenuItem } from '../editorMenu'
import { renderEditorMenu } from '../editorMenu'
import {
  ICONS,
  ensureActiveContextSelection,
  escapeHtml,
  getActiveSnapshotDetails,
  getContextBindingNames,
  getContextEffectHandlerNames,
  getParsedContext,
  replaceSnapshotView,
  syncContextDetailEditor,
  updateCSS,
} from '../scripts'
import { getSavedSnapshots, getTerminalSnapshots } from '../snapshotStorage'
import { getState, saveState } from '../state'
import { state } from './playgroundState'

export const SIDE_SNAPSHOTS_VISIBLE = 5
type SideTabId = 'files' | 'snapshots' | 'context'

export function normalizeSideTab(tabId: string | null | undefined): SideTabId {
  if (tabId === 'snapshots' || tabId === 'context') return tabId
  return 'files'
}

export function getActiveSnapshotUrlId(): string | null {
  if (!state.activeSnapshotKey) return null

  if (state.activeSnapshotKey.startsWith('terminal:')) {
    const index = Number(state.activeSnapshotKey.slice('terminal:'.length))
    return getTerminalSnapshots()[index]?.snapshot.id ?? null
  }

  if (state.activeSnapshotKey.startsWith('saved:')) {
    const index = Number(state.activeSnapshotKey.slice('saved:'.length))
    return getSavedSnapshots()[index]?.snapshot.id ?? null
  }

  return null
}

export function syncPlaygroundUrlState(tabId: SideTabId) {
  const url = new URL(window.location.href)
  url.searchParams.set('view', tabId)

  if (tabId === 'files' && getState('current-file-id')) url.searchParams.set('fileId', getState('current-file-id')!)
  else url.searchParams.delete('fileId')

  const snapshotId = tabId === 'snapshots' ? getActiveSnapshotUrlId() : null
  if (snapshotId) url.searchParams.set('snapshotId', snapshotId)
  else url.searchParams.delete('snapshotId')

  if (tabId === 'context' && state.activeContextBindingName)
    url.searchParams.set('bindingName', state.activeContextBindingName)
  else url.searchParams.delete('bindingName')

  if (tabId === 'context' && state.activeContextEntryKind === 'effect-handler')
    url.searchParams.set('contextEntryKind', 'effect-handler')
  else url.searchParams.delete('contextEntryKind')

  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
}

export function toggleSideSnapshotsShowAll() {
  state.sideSnapshotsShowAll = !state.sideSnapshotsShowAll
  populateSideSnapshotsList()
}

export function populateSideSnapshotsList() {
  const list = document.getElementById('side-snapshots-list')
  if (!list) return

  const terminalEntries = getTerminalSnapshots()
  const savedEntries = getSavedSnapshots()

  if (terminalEntries.length === 0 && savedEntries.length === 0) {
    list.innerHTML = '<div class="explorer-empty">No snapshots</div>'
    return
  }

  const items: string[] = []

  if (terminalEntries.length > 0) {
    items.push('<div class="explorer-group-label">Completed Files</div>')
    const ordinals = ['Last', '2nd Last', '3rd Last']
    const visibleCount = state.sideSnapshotsShowAll
      ? terminalEntries.length
      : Math.min(SIDE_SNAPSHOTS_VISIBLE, terminalEntries.length)
    for (let i = 0; i < visibleCount; i++) {
      const entry = terminalEntries[i]!
      const label = `${ordinals[i] ?? `${i + 1}th Last`} Run`
      const colorVar =
        entry.resultType === 'error'
          ? 'var(--color-error)'
          : entry.resultType === 'halted'
            ? 'var(--color-primary)'
            : 'var(--color-success)'
      const activeClass = state.activeSnapshotKey === `terminal:${i}` ? ' explorer-item--active' : ''
      const menuId = `side-terminal-menu-${i}`
      const menuItems: EditorMenuItem[] = [
        {
          action: `Playground.closeExplorerMenus();Playground.openTerminalSnapshot(${i})`,
          icon: ICONS.eye,
          label: 'Open',
        },
        {
          action: `Playground.closeExplorerMenus();Playground.saveTerminalSnapshotToSaved(${i})`,
          icon: ICONS.save,
          label: 'Save',
        },
        {
          action: `Playground.closeExplorerMenus();Playground.downloadTerminalSnapshotByIndex(${i})`,
          icon: ICONS.download,
          label: 'Download',
        },
        {
          action: `Playground.closeExplorerMenus();Playground.clearTerminalSnapshot(${i})`,
          danger: true,
          icon: ICONS.trash,
          label: 'Delete',
        },
      ]
      items.push(`
        <div class="explorer-item${activeClass}" onclick="Playground.openTerminalSnapshot(${i})" title="${escapeHtml(label)}">
          <span class="explorer-item__dot" style="background:${colorVar};"></span>
          <span class="explorer-item__name">${escapeHtml(label)}</span>
          <span class="explorer-item__actions" onclick="event.stopPropagation()">
            ${renderEditorMenu({ id: menuId, items: menuItems })}
            <button class="explorer-item__btn" onclick="Playground.toggleExplorerMenu('${menuId}', this)" title="More actions">${ICONS.menu}</button>
          </span>
        </div>`)
    }
    if (terminalEntries.length > SIDE_SNAPSHOTS_VISIBLE) {
      if (state.sideSnapshotsShowAll) {
        items.push('<div class="explorer-show-more" onclick="Playground.toggleSideSnapshotsShowAll()">Show less</div>')
      } else {
        items.push(
          `<div class="explorer-show-more" onclick="Playground.toggleSideSnapshotsShowAll()">Show all (${terminalEntries.length})</div>`,
        )
      }
    }
  }

  if (savedEntries.length > 0) {
    items.push('<div class="explorer-group-label">Saved Snapshots</div>')
    savedEntries.forEach((entry, i) => {
      const label = entry.name || `Snapshot ${i + 1}`
      const lockHtml = entry.locked ? `<span class="explorer-item__lock" title="Locked">${ICONS.lock}</span>` : ''
      const savedActiveClass = state.activeSnapshotKey === `saved:${i}` ? ' explorer-item--active' : ''
      const isSuspended = entry.snapshot.terminal !== true
      const menuId = `side-saved-menu-${i}`
      const menuItems: EditorMenuItem[] = [
        {
          action: `Playground.closeExplorerMenus();Playground.openSavedSnapshot(${i})`,
          icon: ICONS.eye,
          label: 'Open',
        },
        {
          action: `Playground.closeExplorerMenus();Playground.toggleSnapshotLock(${i})`,
          icon: entry.locked ? ICONS.unlock : ICONS.lock,
          label: entry.locked ? 'Unlock' : 'Lock',
        },
        {
          action: `Playground.closeExplorerMenus();Playground.downloadSavedSnapshotByIndex(${i})`,
          icon: ICONS.download,
          label: 'Download',
        },
        {
          action: `Playground.closeExplorerMenus();Playground.deleteSavedSnapshot(${i})`,
          danger: true,
          icon: ICONS.trash,
          label: 'Delete',
        },
      ]
      const runButton = isSuspended
        ? `<button class="explorer-item__btn" onclick="event.stopPropagation();Playground.runSavedSnapshot(${i})" title="Run snapshot">${ICONS.play}</button>`
        : ''
      items.push(`
        <div class="explorer-item${savedActiveClass}" onclick="Playground.openSavedSnapshot(${i})" title="${escapeHtml(label)}">
          <span class="explorer-item__name">${escapeHtml(label)}</span>
          ${lockHtml}
          <span class="explorer-item__actions" onclick="event.stopPropagation()">
            ${runButton}
            ${renderEditorMenu({ id: menuId, items: menuItems })}
            <button class="explorer-item__btn" onclick="Playground.toggleExplorerMenu('${menuId}', this)" title="More actions">${ICONS.menu}</button>
          </span>
        </div>`)
    })
  }

  list.innerHTML = items.join('')
}

export function showSideTab(tabId: string, options: { persist?: boolean; syncUrl?: boolean } = {}) {
  const normalizedTabId = normalizeSideTab(tabId)
  // Hide all side tabs, show the selected one
  document.querySelectorAll('.side-panel__tab').forEach(el => {
    ;(el as HTMLElement).style.display = 'none'
  })
  const tab = document.getElementById(`side-tab-${normalizedTabId}`)
  if (tab) tab.style.display = ''

  // Update icon active state
  document.querySelectorAll('.side-panel__icon').forEach(el => el.classList.remove('side-panel__icon--active'))
  const icon = document.getElementById(`side-icon-${normalizedTabId}`)
  if (icon) icon.classList.add('side-panel__icon--active')

  // Clear the "new snapshot" indicator when entering the snapshot view.
  if (normalizedTabId === 'snapshots')
    document.getElementById('side-icon-snapshots')?.classList.remove('side-panel__icon--has-new')

  // Clear the "new context" indicator when entering the context view.
  if (normalizedTabId === 'context')
    document.getElementById('side-icon-context')?.classList.remove('side-panel__icon--has-new')

  document.querySelectorAll('[id^="side-header-"]').forEach(el => {
    if (el.id === 'side-panel-header') return
    if (el.id.startsWith('side-header-actions-') || el.id.startsWith('side-header-')) {
      ;(el as HTMLElement).style.display = 'none'
    }
  })

  const header = document.getElementById(`side-header-${normalizedTabId}`)
  if (header) header.style.display = ''

  const actions = document.getElementById(`side-header-actions-${normalizedTabId}`)
  if (actions) actions.style.display = ''

  if (options.persist !== false) saveState({ 'active-side-tab': normalizedTabId }, false)

  if (options.syncUrl !== false) syncPlaygroundUrlState(normalizedTabId)

  // Sync the code panel view and header
  syncCodePanelView(normalizedTabId)
  updateCSS()
}

/** Sync the code panel: show editor, snapshot, or empty view + update header accordingly. */
function setEditorEmptyState(
  emptyView: HTMLElement,
  title: string,
  description: string,
  buttonLabel: string,
  action: string,
) {
  emptyView.innerHTML = `
    <div class="dvala-empty-view__content">
      <div class="dvala-empty-view__title">${escapeHtml(title)}</div>
      <div class="dvala-empty-view__description">${escapeHtml(description)}</div>
      <button type="button" class="button button--primary dvala-empty-view__button" onclick="${action}">${escapeHtml(buttonLabel)}</button>
    </div>
  `
}

export function syncCodePanelView(sideTab?: string) {
  const tab = sideTab ?? getCurrentSideTab()
  const editorView = document.getElementById('dvala-editor-view')
  const contextDetailView = document.getElementById('context-detail-view')
  const snapshotView = document.getElementById('dvala-snapshot-view')
  const emptyView = document.getElementById('dvala-empty-view')
  const headerEditor = document.getElementById('dvala-header-editor')
  const headerSnapshot = document.getElementById('dvala-header-snapshot')
  const undoBtn = document.getElementById('dvala-code-undo-button')
  const redoBtn = document.getElementById('dvala-code-redo-button')
  const fileCloseBtn = document.getElementById('file-close-btn')
  const closeBtn = document.getElementById('snapshot-close-btn')
  if (!editorView || !snapshotView || !emptyView) return

  // Hide all views
  editorView.style.display = 'none'
  if (contextDetailView) contextDetailView.style.display = 'none'
  snapshotView.style.display = 'none'
  emptyView.style.display = 'none'
  if (headerEditor) headerEditor.style.display = 'none'
  if (headerSnapshot) headerSnapshot.style.display = 'none'
  if (undoBtn) undoBtn.style.display = 'none'
  if (redoBtn) redoBtn.style.display = 'none'
  if (fileCloseBtn) fileCloseBtn.style.display = 'none'
  if (closeBtn) closeBtn.style.display = 'none'

  if (tab === 'files') {
    editorView.style.display = 'flex'
    if (headerEditor) headerEditor.style.display = 'flex'
    if (undoBtn) undoBtn.style.display = ''
    if (redoBtn) redoBtn.style.display = ''
    if (fileCloseBtn && getState('current-file-id')) fileCloseBtn.style.display = ''
  } else if (tab === 'snapshots') {
    if (state.activeSnapshotKey && state.snapshotViewStack.length === 0) {
      const activeSnapshot = getActiveSnapshotDetails()
      if (activeSnapshot) {
        replaceSnapshotView(activeSnapshot.snapshot, activeSnapshot.label)
        updateCSS()
        return
      }
      state.activeSnapshotKey = null
      populateSideSnapshotsList()
    }

    if (state.activeSnapshotKey && state.snapshotViewStack.length > 0) {
      snapshotView.style.display = 'flex'
      if (headerSnapshot) headerSnapshot.style.display = 'flex'
      if (closeBtn) closeBtn.style.display = ''
    } else {
      emptyView.style.display = 'flex'
      setEditorEmptyState(
        emptyView,
        'Select a snapshot to view',
        'Import a snapshot here, or run a file and save a checkpoint to create a new entry.',
        'Import snapshot',
        'Playground.openImportSnapshotModal()',
      )
    }
  } else {
    const context = getParsedContext()
    const bindingNames = getContextBindingNames(context)
    const effectHandlerNames = getContextEffectHandlerNames(context)
    ensureActiveContextSelection(context)

    if (headerEditor) headerEditor.style.display = 'flex'
    if (bindingNames.length > 0 || effectHandlerNames.length > 0) {
      if (contextDetailView) contextDetailView.style.display = 'flex'
      syncContextDetailEditor()
    } else {
      emptyView.style.display = 'flex'
      emptyView.innerHTML = `
        <div class="dvala-empty-view__content">
          <div class="dvala-empty-view__title">No effect handlers</div>
          <div class="dvala-empty-view__description">Add an effect handler to set up the execution context.</div>
          <button type="button" class="button button--primary dvala-empty-view__button" onclick="Playground.promptAddContextEffectHandler()">Add effect handler</button>
        </div>
      `
    }
  }
}

export function getCurrentSideTab(): string {
  const active = document.querySelector('.side-panel__icon--active')
  if (!active) return getState('active-side-tab')
  const id = active.id
  if (id === 'side-icon-snapshots') return 'snapshots'
  if (id === 'side-icon-context') return 'context'
  return 'files'
}
