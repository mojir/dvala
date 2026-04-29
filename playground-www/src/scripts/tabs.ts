// Editor-tab manager.
//
// Each open tab owns its own Monaco `ITextModel` plus a saved `viewState`
// (cursor / scroll / folds). Switching tabs swaps both — the editor stays
// mounted, but its content + selection are restored to whatever the user
// had when they last left that tab.
//
// One synthetic "scratch" tab represents the unsaved buffer. Its content
// lives in the tab's model just like any other tab; the persisted slot
// `scratch-code` is a snapshot kept in sync with the scratch model so the
// existing scratch-* state machinery (history keying on `<scratch>`,
// autosave guards, snapshot links) keeps working unchanged.
//
// Persistence: only the *list of open tabs* and which one is active are
// persisted (localStorage via `state.ts`); models and viewState live in
// memory and are reconstructed on boot from the underlying WorkspaceFile / scratch
// state. That keeps localStorage small and avoids serializing Monaco's
// internal viewState shape (which Monaco doesn't formally guarantee).

import type * as monacoNs from 'monaco-editor'
import { KeyCode, KeyMod } from '../codeEditor'
import { fileDisplayName, getWorkspaceFiles } from '../fileStorage'
import type { WorkspaceFile } from '../fileStorage'
import { getState, saveState } from '../state'
import type { PersistedTab } from '../state'
import { getCodeEditor, tryGetCodeEditor } from './codeEditorInstance'

/** Sentinel key for the scratch tab — distinct from any UUID Monaco-side. */
const SCRATCH_KEY = '<scratch>'

interface FileTab {
  kind: 'file'
  key: string // == fileId
  fileId: string
  model: monacoNs.editor.ITextModel
  viewState: monacoNs.editor.ICodeEditorViewState | null
  /** Content baseline for the modified-dot indicator (= file.code at last sync). */
  lastSyncedCode: string
}
interface ScratchTab {
  kind: 'scratch'
  key: typeof SCRATCH_KEY
  model: monacoNs.editor.ITextModel
  viewState: monacoNs.editor.ICodeEditorViewState | null
  /** Always treated as clean — scratch has no "saved" state to compare against. */
  lastSyncedCode: string
}
type OpenTab = FileTab | ScratchTab

let openTabs: OpenTab[] = []
let activeKey: string | null = null
// Listeners notified after every tab-list / active-tab change. The tab strip
// renderer subscribes here; the rest of the playground reaches for state via
// the existing `current-file-id` slot, which we keep in sync below.
const changeListeners = new Set<() => void>()

function notify(): void {
  for (const cb of changeListeners) cb()
}

function onTabsChange(cb: () => void): () => void {
  changeListeners.add(cb)
  return () => changeListeners.delete(cb)
}

/**
 * Request a re-render of the tab strip without changing tab state. Used by
 * the editor's onChange listener to keep the modified-dot indicator in
 * sync as the user types — the dirty signal is computed from the model on
 * every render, so re-rendering is enough.
 */
export function notifyTabsChanged(): void {
  notify()
}

// Lifecycle hooks fired around every active-tab swap. `beforeSwap` runs
// while the OLD tab is still current (so callers can flush autosave with
// the old id + content). `afterSwap` runs after `current-file-id` and
// `dvala-code` reflect the NEW tab (so callers can load that tab's
// undo/redo history). Registered once during boot from `scripts.ts` to
// avoid a circular import.
let beforeSwapHook: (() => void) | null = null
let afterSwapHook: (() => void) | null = null

export function setTabLifecycleHooks(opts: { beforeSwap?: () => void; afterSwap?: () => void }): void {
  if (opts.beforeSwap) beforeSwapHook = opts.beforeSwap
  if (opts.afterSwap) afterSwapHook = opts.afterSwap
}

/**
 * Reset module-level state. Test-only — every other caller should use the
 * lifecycle (initTabs at boot, never re-run). Without this, vitest tests
 * leak open-tab + active-tab state between cases since the module is
 * loaded once per worker.
 */
export function __resetForTesting(): void {
  openTabs = []
  activeKey = null
  changeListeners.clear()
  beforeSwapHook = null
  afterSwapHook = null
  stripListenersWired = false
  keyboardShortcutsWired = false
}

function getActiveTab(): OpenTab | null {
  if (activeKey === null) return null
  return openTabs.find(t => t.key === activeKey) ?? null
}

/**
 * True iff the active tab's model differs from its baseline. File tabs
 * compare against `lastSyncedCode` (= file.code at open / autosave time);
 * scratch is always reported as clean (its dirty signal lives elsewhere —
 * the existing `dvala-code-edited` flag drives the legacy save indicator).
 */
function isTabDirty(tab: OpenTab): boolean {
  if (tab.kind === 'scratch') return false
  return tab.model.getValue() !== tab.lastSyncedCode
}

/**
 * Refresh the active tab's saved-baseline. Called after autosave persists
 * the buffer back to IDB; resets the modified-dot.
 */
export function markActiveTabSynced(): void {
  const active = getActiveTab()
  if (!active || active.kind !== 'file') return
  active.lastSyncedCode = active.model.getValue()
  notify()
}

/**
 * Boot-time hydration. Restores the open-tab list from localStorage,
 * filters out tabs whose files no longer exist, and ensures at least one
 * tab is active (falling back to scratch if needed). Must run AFTER
 * `setCodeEditor(...)` so we have a Monaco instance to attach models to.
 */
export function initTabs(): void {
  const editor = getCodeEditor()
  const persisted = getState('open-tabs') as PersistedTab[]
  const persistedActiveKey = getState('active-tab-key')
  const files = new Map(getWorkspaceFiles().map(f => [f.id, f]))
  const seen = new Set<string>()
  const restored: OpenTab[] = []

  for (const entry of persisted) {
    if (entry.kind === 'scratch') {
      if (seen.has(SCRATCH_KEY)) continue
      seen.add(SCRATCH_KEY)
      restored.push(makeScratchTab(editor))
      continue
    }
    const file = files.get(entry.id)
    if (!file || seen.has(entry.id)) continue
    seen.add(entry.id)
    restored.push(makeFileTab(editor, file))
  }

  // Always keep scratch present — it's the implicit "home" tab the close
  // shortcut falls back to. Add it if hydration didn't already.
  if (!seen.has(SCRATCH_KEY)) {
    restored.unshift(makeScratchTab(editor))
  }

  openTabs = restored

  // Active key: prefer the persisted one if it survives the filter; else
  // fall back to whichever file id is in `current-file-id` (covers the
  // first-boot upgrade where there was no `active-tab-key` slot yet); else
  // scratch.
  const fallbackActiveKey =
    typeof persistedActiveKey === 'string' && openTabs.some(t => t.key === persistedActiveKey)
      ? persistedActiveKey
      : (() => {
          const currentFileId = getState('current-file-id')
          if (currentFileId !== null && openTabs.some(t => t.key === currentFileId)) return currentFileId
          return SCRATCH_KEY
        })()
  activeKey = fallbackActiveKey
  // Capture the bootstrap model created implicitly by `monaco.editor.create`
  // before swapping in the active tab's model. Monaco's `setModel` only
  // detaches the previous model — it does NOT dispose it — so we have to
  // free it ourselves or leak the buffer + tokenization state on every
  // page load.
  const bootstrapModel = editor.getActiveModel()
  const active = getActiveTab()!
  editor.setActiveModel(active.model, active.viewState)
  if (bootstrapModel !== active.model) editor.disposeModel(bootstrapModel)
  syncCurrentFileIdState(active)
  persistTabsState()
  notify()
}

/** Open the file in a tab, or focus the existing one if already open. */
export function openOrFocusFile(fileId: string): void {
  const editor = tryGetCodeEditor()
  if (!editor) return
  const file = getWorkspaceFiles().find(f => f.id === fileId)
  if (!file) return
  const existing = openTabs.find(t => t.kind === 'file' && t.fileId === fileId)
  if (existing) {
    setActive(existing.key)
    return
  }
  // Insert after the currently active tab so newly opened files appear next
  // to where the user is — matches how editors like VS Code behave.
  const insertAt = activeKey === null ? openTabs.length : openTabs.findIndex(t => t.key === activeKey) + 1
  const tab = makeFileTab(editor, file)
  openTabs.splice(insertAt, 0, tab)
  setActive(tab.key)
}

/** Focus the scratch tab (always present). */
export function focusScratch(): void {
  setActive(SCRATCH_KEY)
}

/**
 * Close the tab matching `key`. If it was active, focus the neighbor on
 * the left (or right if leftmost), or scratch as a last resort. Scratch
 * itself can't be closed — the close button is hidden in the UI for it.
 */
export function closeTab(key: string): void {
  if (key === SCRATCH_KEY) return // scratch is sticky
  const idx = openTabs.findIndex(t => t.key === key)
  if (idx === -1) return
  const tab = openTabs[idx]!
  // Drop view-state + dispose model so Monaco doesn't leak the buffer.
  getCodeEditor().disposeModel(tab.model)
  openTabs.splice(idx, 1)
  if (activeKey !== key) {
    persistTabsState()
    notify()
    return
  }
  // Pick the neighbor: prefer the tab now at the same index (was idx+1
  // before splice), else the one before, else scratch.
  const next = openTabs[idx] ?? openTabs[idx - 1] ?? openTabs[0]!
  setActive(next.key)
}

export function closeActiveTab(): void {
  if (activeKey === null) return
  closeTab(activeKey)
}

/**
 * Close any tabs whose backing file is gone — called by `deleteWorkspaceFile`
 * / `clearAllWorkspaceFiles` so stale tabs don't outlive their data.
 */
export function closeTabsForMissingFiles(): void {
  const liveIds = new Set(getWorkspaceFiles().map(f => f.id))
  // Iterate from the end so splice indexes stay valid. Reuse closeTab so
  // active-tab fallback runs once at the end, not per file.
  for (let i = openTabs.length - 1; i >= 0; i--) {
    const tab = openTabs[i]!
    if (tab.kind === 'file' && !liveIds.has(tab.fileId)) {
      closeTab(tab.key)
    }
  }
}

/**
 * Select tab by 1-based index (matches Cmd-1..9 conventions). No-op if the
 * index is out of range.
 */
export function setActiveByIndex(oneBasedIndex: number): void {
  const tab = openTabs[oneBasedIndex - 1]
  if (tab) setActive(tab.key)
}

/** Cycle to the next (delta=+1) or previous (delta=-1) tab, wrapping. */
export function cycleActive(delta: number): void {
  if (openTabs.length === 0 || activeKey === null) return
  const idx = openTabs.findIndex(t => t.key === activeKey)
  if (idx === -1) return
  const len = openTabs.length
  const next = openTabs[(idx + delta + len) % len]!
  setActive(next.key)
}

// ----------------------------------------------------------------------
// Private helpers
// ----------------------------------------------------------------------

function setActive(key: string): void {
  if (activeKey === key) return
  const editor = getCodeEditor()
  // beforeSwap runs while `current-file-id` still points at the OLD tab.
  // The `flushPendingAutoSave` hook lives here so any debounced save fires
  // against the right file; without this, switching tabs mid-debounce
  // would persist the new tab's content into the old tab's record (and
  // worse, clear the wrong tab's modified-dot via markActiveTabSynced).
  beforeSwapHook?.()
  // Save the outgoing tab's viewState so coming back restores cursor / scroll.
  const outgoing = getActiveTab()
  if (outgoing) outgoing.viewState = editor.saveViewState()

  activeKey = key
  const incoming = openTabs.find(t => t.key === key)
  if (!incoming) return
  editor.setActiveModel(incoming.model, incoming.viewState)
  syncCurrentFileIdState(incoming)
  // afterSwap runs once the legacy state slots reflect the NEW tab. The
  // `activateCurrentFileHistory` hook reads `current-file-id` to load the
  // right per-file undo/redo stack — without this, Cmd-Z after a tab-strip
  // click operates on the previous tab's history.
  afterSwapHook?.()
  persistTabsState()
  notify()
}

/**
 * Mirror the active tab onto the legacy `current-file-id` + `dvala-code`
 * slots so the rest of the playground (history, lock detection, run path,
 * snapshot serialization) still finds them via `getState`. Phase 1 doesn't
 * eliminate those slots — too many call sites — they stay as projections of
 * the active tab's model. The onChange listener keeps `dvala-code` fresh as
 * the user types; this function handles the discrete tab-swap moment.
 */
function syncCurrentFileIdState(tab: OpenTab): void {
  saveState(
    {
      'current-file-id': tab.kind === 'file' ? tab.fileId : null,
      'dvala-code': tab.model.getValue(),
    },
    false,
  )
}

function persistTabsState(): void {
  const persisted: PersistedTab[] = openTabs.map(t =>
    t.kind === 'scratch' ? { kind: 'scratch' } : { kind: 'file', id: t.fileId },
  )
  saveState({ 'open-tabs': persisted, 'active-tab-key': activeKey ?? SCRATCH_KEY }, false)
}

function makeFileTab(editor: ReturnType<typeof getCodeEditor>, file: WorkspaceFile): FileTab {
  return {
    kind: 'file',
    key: file.id,
    fileId: file.id,
    model: editor.createModel(file.code),
    viewState: null,
    lastSyncedCode: file.code,
  }
}

function makeScratchTab(editor: ReturnType<typeof getCodeEditor>): ScratchTab {
  // Seed scratch's model from the persisted scratch-code so reloads survive.
  const seed = getState('scratch-code')
  return {
    kind: 'scratch',
    key: SCRATCH_KEY,
    model: editor.createModel(seed),
    viewState: null,
    lastSyncedCode: seed,
  }
}

// ----------------------------------------------------------------------
// Renderer
// ----------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Display label for a tab in the strip — filename for files, sentinel for scratch. */
function tabLabel(tab: OpenTab): string {
  if (tab.kind === 'scratch') return '<scratch>'
  const file = getWorkspaceFiles().find(f => f.id === tab.fileId)
  return file ? fileDisplayName(file) : '(missing)'
}

function renderTabStrip(): void {
  const strip = document.getElementById('editor-tab-strip')
  if (!strip) return
  if (openTabs.length === 0) {
    strip.innerHTML = ''
    return
  }
  // No virtualization — at the playground's scale, painting the full strip
  // on every change is fine. Click target shape: each tab is a div with
  // `data-tab-key`; the close button has `data-close-key` so a delegated
  // listener can dispatch without per-tab handlers.
  const activeKeyAtRender = activeKey
  strip.innerHTML = openTabs
    .map(tab => {
      const isActive = tab.key === activeKey
      const dirty = isTabDirty(tab)
      const label = tabLabel(tab)
      const closeBtn =
        tab.kind === 'scratch'
          ? '' // scratch is sticky — no close button
          : `<button class="editor-tab__close" data-close-key="${escapeHtml(tab.key)}" tabindex="-1" title="Close (Cmd/Ctrl-W)">×</button>`
      const dot = dirty ? '<span class="editor-tab__dot" title="Unsaved changes"></span>' : ''
      return `
        <div
          class="editor-tab${isActive ? ' editor-tab--active' : ''}${dirty ? ' editor-tab--dirty' : ''}"
          role="tab"
          aria-selected="${isActive}"
          data-tab-key="${escapeHtml(tab.key)}"
          title="${escapeHtml(label)}"
        >
          <span class="editor-tab__name">${escapeHtml(label)}</span>
          ${dot}
          ${closeBtn}
        </div>`
    })
    .join('')
  // Keep the active tab visible. Without this, keyboard cycling
  // (Cmd-PageUp/Down, Cmd-1..9) on a strip with many tabs can leave the
  // active tab outside the visible scroll window. `inline: 'nearest'`
  // avoids unnecessary horizontal jumps when the active tab is already
  // within view.
  if (activeKeyAtRender !== null) {
    const activeEl = strip.querySelector<HTMLElement>(
      `.editor-tab[data-tab-key="${CSS.escape(activeKeyAtRender)}"]`,
    )
    activeEl?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }
}

let stripListenersWired = false
export function wireTabStripListeners(): void {
  if (stripListenersWired) return
  const strip = document.getElementById('editor-tab-strip')
  if (!strip) return
  stripListenersWired = true
  // Left-click on a tab activates it; left-click on the close × removes it.
  strip.addEventListener('click', evt => {
    const target = evt.target as HTMLElement
    const closeBtn = target.closest<HTMLElement>('[data-close-key]')
    if (closeBtn) {
      evt.stopPropagation()
      closeTab(closeBtn.dataset['closeKey']!)
      return
    }
    const tabEl = target.closest<HTMLElement>('[data-tab-key]')
    if (tabEl) setActive(tabEl.dataset['tabKey']!)
  })
  // Middle-click on a tab closes it (matches editor convention from VS Code,
  // Sublime Text, etc.). `auxclick` fires for any non-primary button; we
  // gate on `button === 1` so right-click context menus aren't hijacked.
  strip.addEventListener('auxclick', evt => {
    if (evt.button !== 1) return
    const tabEl = (evt.target as HTMLElement).closest<HTMLElement>('[data-tab-key]')
    if (!tabEl) return
    evt.preventDefault()
    closeTab(tabEl.dataset['tabKey']!)
  })
}

// Re-render the strip on any tab-state change.
onTabsChange(() => renderTabStrip())

// ----------------------------------------------------------------------
// Keyboard shortcuts (registered as Monaco editor commands so they only
// fire while focus is in the editor — global window-level shortcuts
// already exist for Run/Format/etc. and we don't want to override
// browser shortcuts elsewhere).
// ----------------------------------------------------------------------

let keyboardShortcutsWired = false
export function wireTabKeyboardShortcuts(): void {
  if (keyboardShortcutsWired) return
  const editor = tryGetCodeEditor()
  if (!editor) return
  keyboardShortcutsWired = true
  // Cmd/Ctrl-W: close the active tab. Browser default (close tab) is
  // already swallowed by Monaco having focus; addCommand cleanly captures it.
  editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyW, () => closeActiveTab())
  // Cmd/Ctrl-PageDown / -PageUp: cycle forward / backward.
  editor.addCommand(KeyMod.CtrlCmd | KeyCode.PageDown, () => cycleActive(+1))
  editor.addCommand(KeyMod.CtrlCmd | KeyCode.PageUp, () => cycleActive(-1))
  // Cmd/Ctrl-1 .. Cmd/Ctrl-9: jump to the Nth open tab. Monaco's KeyCode
  // values for `Digit1`..`Digit9` are Digit1, Digit2, ..., so we add the
  // offset rather than enumerating.
  for (let i = 1; i <= 9; i++) {
    const key = KeyCode.Digit0 + i
    editor.addCommand(KeyMod.CtrlCmd | key, () => setActiveByIndex(i))
  }
}
