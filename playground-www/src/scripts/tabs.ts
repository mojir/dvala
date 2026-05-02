// Editor-tab manager.
//
// Each open tab owns its own Monaco `ITextModel` plus a saved `viewState`
// (cursor / scroll / folds). Switching tabs swaps both — the editor stays
// mounted, but its content + selection are restored to whatever the user
// had when they last left that tab.
//
// After Phase 1.5 step 23h, scratch and handlers are regular workspace
// files keyed by reserved IDs (`__scratch__`, `__handlers__`). The tab
// strip keeps scratch sticky (no × button) by checking the file ID, not
// by carrying a separate tab kind. The `<scratch>` / `<handlers>` virtual
// entries in the file tree are renderer concerns; this module sees them
// as ordinary file tabs.
//
// Persistence: only the *list of open tabs* and which one is active are
// persisted (localStorage via `state.ts`); models and viewState live in
// memory and are reconstructed on boot from the underlying `WorkspaceFile`.
// That keeps localStorage small and avoids serializing Monaco's internal
// viewState shape (which Monaco doesn't formally guarantee).

import type * as monacoNs from 'monaco-editor'
import { KeyCode, KeyMod } from '../codeEditor'
import { fileDisplayName, getWorkspaceFiles } from '../fileStorage'
import type { WorkspaceFile } from '../fileStorage'
import { HANDLERS_FILE_PATH } from '../handlersBuffer'
import { cameraIcon } from '../icons'
import { SCRATCH_FILE_ID } from '../scratchBuffer'
import { getState, saveState } from '../state'
import type { PersistedTab } from '../state'
import { getCodeEditor, tryGetCodeEditor } from './codeEditorInstance'

interface FileTab {
  kind: 'file'
  key: string // == fileId
  fileId: string
  model: monacoNs.editor.ITextModel
  viewState: monacoNs.editor.ICodeEditorViewState | null
  /** Content baseline for the modified-dot indicator (= file.code at last sync). */
  lastSyncedCode: string
}
/**
 * Phase 1.5 step 23j — non-text tab backing a snapshot file at
 * `.dvala-playground/snapshots/<id>.json`. The tab is read-only: there's no
 * Monaco model in the default view (the snapshot panel renders a custom
 * inspector); the Raw view lazily creates a JSON model when first selected.
 * `key` is the snapshot's id (also the workspace-file id, per 23i's
 * snapshot.id ↔ file.id bond).
 *
 * `cachedLabel` memoizes the tab strip's display label so we don't re-parse
 * the snapshot file's JSON on every render. The tab strip re-renders on
 * every keystroke (via `notifyTabsChanged` ← editor onChange), so a
 * per-render JSON parse times the number of open snapshot tabs would
 * accumulate. Cleared by `invalidateSnapshotTabLabel(id)` if a snapshot's
 * metadata is mutated under it (rename, lock toggle).
 */
interface SnapshotTab {
  kind: 'snapshot'
  key: string // == snapshotId
  snapshotId: string
  cachedLabel: string | null
}
type OpenTab = FileTab | SnapshotTab

let openTabs: OpenTab[] = []
let activeKey: string | null = null
/**
 * Empty Monaco model the editor falls back to whenever the active tab is
 * non-file (snapshot, future image preview, etc.). Monaco needs *some*
 * model attached to render at all; the editor host is hidden behind the
 * snapshot panel anyway so the model is invisible. Lazy-allocated on
 * first switch to a non-file tab; disposed in `__resetForTesting`.
 */
let idleModel: monacoNs.editor.ITextModel | null = null

function getIdleModel(): monacoNs.editor.ITextModel {
  if (idleModel === null) idleModel = getCodeEditor().createModel('')
  return idleModel
}
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

/**
 * Read the kind of the currently-active tab. Used by the editor-area
 * renderer (`syncCodePanelView`) to decide whether to show the editor
 * host, the snapshot view, or an empty state — Phase 1.5 step 23j stage 2
 * decoupled the editor-area swap from the side-tab; it now follows the
 * active editor tab's kind.
 */
export function getActiveTabKind(): 'file' | 'snapshot' | null {
  return getActiveTab()?.kind ?? null
}

/** Read the active tab's snapshot id, or null if the active tab isn't a snapshot. */
export function getActiveSnapshotTabId(): string | null {
  const active = getActiveTab()
  return active?.kind === 'snapshot' ? active.snapshotId : null
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
  // Dispose the idle model before clearing the reference. In production
  // the only realistic caller is the test harness (where stub models are
  // POJOs and disposal is a no-op-on-a-mock), but draining via
  // `tryGetCodeEditor()?.disposeModel(...)` keeps this honest in case
  // `__resetForTesting` ever runs against a real editor — e.g. if a future
  // hot-reload flow calls it after Monaco is up.
  if (idleModel !== null) {
    tryGetCodeEditor()?.disposeModel(idleModel)
    idleModel = null
  }
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
 * True iff the active tab's model differs from its baseline. Compares the
 * model's current text against `lastSyncedCode` (= file.code at open /
 * autosave time). The scratch buffer is special-cased to always read as
 * clean — its dirty signal lives elsewhere (the legacy `dvala-code-edited`
 * flag drives the save-scratch indicator on the toolbar).
 */
function isTabDirty(tab: OpenTab): boolean {
  // Snapshot tabs are read-only — there's no edit surface to diverge from.
  if (tab.kind !== 'file') return false
  if (tab.fileId === SCRATCH_FILE_ID) return false
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
 * filters out tabs whose files no longer exist, and ensures the scratch
 * tab is always present — it's the implicit "home" tab the close
 * fallback walks to. Must run AFTER `setCodeEditor(...)` so we have a
 * Monaco instance to attach models to.
 */
export function initTabs(): void {
  const editor = getCodeEditor()
  const persisted = getState('open-tabs') as PersistedTab[]
  const persistedActiveKey = getState('active-tab-key')
  const files = new Map(getWorkspaceFiles().map(f => [f.id, f]))
  const seen = new Set<string>()
  const restored: OpenTab[] = []

  for (const entry of persisted) {
    const file = files.get(entry.id)
    if (!file || seen.has(entry.id)) continue
    seen.add(entry.id)
    if (entry.kind === 'snapshot') {
      restored.push(makeSnapshotTab(entry.id))
    } else {
      restored.push(makeFileTab(editor, file))
    }
  }

  // Always keep scratch present — it's the implicit "home" tab the close
  // fallback walks to. Phase 1.5 step 23h made scratch a regular workspace
  // file; if hydration didn't already put it in the list, splice it in at
  // the front so its tab key (`SCRATCH_FILE_ID`) is always available. When
  // the scratch workspace record is missing (test setups that bypass
  // `ensureScratchFile`, or an IDB race) we synthesize a blank tab in place
  // so `getActiveTab()!` below always has something to attach — without this
  // the non-null assertion would crash on first paint.
  if (!seen.has(SCRATCH_FILE_ID)) {
    const scratchFile = files.get(SCRATCH_FILE_ID)
    const tab: FileTab = scratchFile
      ? makeFileTab(editor, scratchFile)
      : makeSyntheticScratchTab(editor)
    restored.unshift(tab)
    seen.add(SCRATCH_FILE_ID)
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
          if (openTabs.some(t => t.key === currentFileId)) return currentFileId
          return SCRATCH_FILE_ID
        })()
  activeKey = fallbackActiveKey
  // Capture the bootstrap model created implicitly by `monaco.editor.create`
  // before swapping in the active tab's model. Monaco's `setModel` only
  // detaches the previous model — it does NOT dispose it — so we have to
  // free it ourselves or leak the buffer + tokenization state on every
  // page load. Phase 1.5 step 23j: if the active tab is a snapshot (no
  // Monaco model of its own), the bootstrap model is repurposed as the
  // module-level idle model — saves a create+dispose round-trip.
  const bootstrapModel = editor.getActiveModel()
  const active = getActiveTab()!
  if (active.kind === 'file') {
    editor.setActiveModel(active.model, active.viewState)
    if (bootstrapModel !== active.model) editor.disposeModel(bootstrapModel)
  } else {
    idleModel = bootstrapModel
    editor.setActiveModel(idleModel, null)
  }
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

/**
 * Focus the scratch tab. Phase 1.5 step 23j stage 2 made scratch
 * closable, so the tab might not be in `openTabs` when this is called
 * (the user closed it and clicked the pinned `<scratch>` entry to
 * re-open). Routes through `openOrFocusFile` so the tab is created
 * lazily if needed; if scratch is already open, this is just a swap.
 */
export function focusScratch(): void {
  openOrFocusFile(SCRATCH_FILE_ID)
}

/**
 * Open a snapshot in an editor-area tab, or focus the existing tab if it's
 * already open. Phase 1.5 step 23j primary entry point — replaces the
 * modal-based snapshot inspector for side-panel clicks (the modal stays as
 * unreachable dead code until 23l). The snapshot is identified by id, which
 * is also the backing workspace file's id (snapshot.id ↔ file.id bond per
 * 23i).
 */
export function openOrFocusSnapshotTab(snapshotId: string): void {
  const editor = tryGetCodeEditor()
  if (!editor) return
  // The snapshot must already exist as a workspace file under
  // `.dvala-playground/snapshots/`. If it's missing (e.g. raced with a
  // delete), there's nothing to open — silently no-op so the caller
  // doesn't have to gate every click.
  if (!getWorkspaceFiles().some(f => f.id === snapshotId)) return
  const existing = openTabs.find(t => t.kind === 'snapshot' && t.snapshotId === snapshotId)
  if (existing) {
    setActive(existing.key)
    return
  }
  const insertAt = activeKey === null ? openTabs.length : openTabs.findIndex(t => t.key === activeKey) + 1
  const tab = makeSnapshotTab(snapshotId)
  openTabs.splice(insertAt, 0, tab)
  setActive(tab.key)
}

/**
 * Close the tab matching `key`. If it was active, focus the neighbor on
 * the left (or right if leftmost). Phase 1.5 step 23j stage 2 made the
 * scratch tab closable like any other tab; the pinned `<scratch>` entry
 * in the file tree is the affordance for re-opening it. The "always at
 * least one tab open" invariant is no longer enforced — closing the last
 * tab leaves an empty strip and the editor area shows a "No tab open"
 * empty state via `syncCodePanelView`.
 */
export function closeTab(key: string): void {
  const idx = openTabs.findIndex(t => t.key === key)
  if (idx === -1) return
  const tab = openTabs[idx]!
  // File tabs own a Monaco model that must be disposed to avoid leaking
  // the buffer + tokenization state. Snapshot tabs don't carry a Monaco
  // model (post-23j they render through the snapshot panel), so there's
  // nothing to dispose for them.
  if (tab.kind === 'file') getCodeEditor().disposeModel(tab.model)
  openTabs.splice(idx, 1)
  if (activeKey !== key) {
    persistTabsState()
    notify()
    return
  }
  // Pick the neighbor: prefer the tab now at the same index (was idx+1
  // before splice), else the one before. If `openTabs` is empty (the
  // user just closed their last tab — scratch became closable in 23j
  // stage 2), drop activeKey and let the editor area render the empty
  // state via `syncCodePanelView`'s no-active-tab branch.
  const next = openTabs[idx] ?? openTabs[idx - 1]
  if (next) {
    setActive(next.key)
    return
  }
  // No tabs left. Detach from any model so Monaco doesn't keep
  // re-painting against a stale active tab; afterSwap fires so the
  // editor area refreshes to the empty state.
  beforeSwapHook?.()
  const outgoing = getActiveTab()
  if (outgoing && outgoing.kind === 'file') outgoing.viewState = getCodeEditor().saveViewState()
  activeKey = null
  // Attach the idle model so Monaco stays in a valid state. Editor host
  // gets hidden by `syncCodePanelView` (no active tab → empty branch).
  getCodeEditor().setActiveModel(getIdleModel(), null)
  saveState({ 'current-file-id': null }, false)
  afterSwapHook?.()
  persistTabsState()
  notify()
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
  // active-tab fallback runs once at the end, not per file. Both kinds of
  // tabs (file + snapshot) reference a workspace-file id via `tab.key`;
  // a snapshot whose underlying workspace file has been removed (via
  // `setSavedSnapshots` filtering it out, or `clearAllFiles`) gets its
  // tab auto-closed the same way file tabs do.
  for (let i = openTabs.length - 1; i >= 0; i--) {
    const tab = openTabs[i]!
    if (!liveIds.has(tab.key)) {
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
  // Save the outgoing file tab's viewState so coming back restores cursor /
  // scroll. Snapshot tabs don't carry a Monaco viewState (their UI / Tree
  // views are DOM-rendered; the Raw view's viewState is owned by the
  // tab-internal raw-model lifecycle, added in stage 2 of 23j).
  const outgoing = getActiveTab()
  if (outgoing && outgoing.kind === 'file') outgoing.viewState = editor.saveViewState()

  activeKey = key
  const incoming = openTabs.find(t => t.key === key)
  if (!incoming) return
  if (incoming.kind === 'file') {
    editor.setActiveModel(incoming.model, incoming.viewState)
  } else {
    // Snapshot tabs hide the Monaco editor host behind the snapshot panel
    // (handled in `syncCodePanelView`); attach the idle model so Monaco
    // stays in a valid state without painting anything visible.
    editor.setActiveModel(getIdleModel(), null)
  }
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
 *
 * For file tabs, both `current-file-id` and `dvala-code` are synced. For
 * snapshot tabs, only `current-file-id` is updated — `dvala-code` is left
 * pointing at the last file tab's content so the run path (which reads
 * `dvala-code` to determine "what to execute") always sees Dvala source,
 * never snapshot JSON. When the user switches back to a file tab, the
 * onChange listener repopulates `dvala-code` from the fresh model.
 */
function syncCurrentFileIdState(tab: OpenTab): void {
  // `current-file-id` is the active tab's workspace-file id regardless of
  // kind — for snapshot tabs that's the snapshot's id (which is also the
  // backing workspace file's id, per 23i). `dvala-code` only mirrors the
  // editor buffer for file tabs; snapshot tabs leave it pointing at
  // whatever the previous file tab had so the run path's "what code to
  // execute" view doesn't get confused with snapshot JSON.
  if (tab.kind === 'file') {
    saveState(
      {
        'current-file-id': tab.fileId,
        'dvala-code': tab.model.getValue(),
      },
      false,
    )
  } else {
    saveState({ 'current-file-id': tab.snapshotId }, false)
  }
}

function persistTabsState(): void {
  const persisted: PersistedTab[] = openTabs.map(t =>
    t.kind === 'file' ? { kind: 'file', id: t.fileId } : { kind: 'snapshot', id: t.snapshotId },
  )
  saveState({ 'open-tabs': persisted, 'active-tab-key': activeKey ?? SCRATCH_FILE_ID }, false)
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

function makeSnapshotTab(snapshotId: string): SnapshotTab {
  return { kind: 'snapshot', key: snapshotId, snapshotId, cachedLabel: null }
}

/**
 * Drop the cached tab-strip label for the given snapshot id so the next
 * render re-parses the workspace file. Callers should use this when a
 * snapshot's metadata changes (saved-snapshot rename, lock toggle); the
 * tab strip then picks up the new label on its next paint.
 */
export function invalidateSnapshotTabLabel(snapshotId: string): void {
  for (const tab of openTabs) {
    if (tab.kind === 'snapshot' && tab.snapshotId === snapshotId) {
      tab.cachedLabel = null
    }
  }
}

/**
 * Synthesize a blank scratch tab when the scratch workspace file isn't
 * present yet. This is the defensive fallback for two scenarios:
 * 1. Test setups that skip `ensureScratchFile`.
 * 2. Production: an IndexedDB race where `ensureScratchFile` hasn't
 *    completed before `initTabs` runs (the scratch workspace record was
 *    created async but the promise hasn't settled yet).
 * The tab carries `SCRATCH_FILE_ID` so it slots into the same lookups as a
 * real scratch tab; mirrors the pre-23h `makeScratchTab` behaviour of
 * starting from an empty model. Once the real scratch file arrives, the
 * next `openOrFocusFileTab` call will replace this synthetic tab with the
 * real one because their keys match.
 */
function makeSyntheticScratchTab(editor: ReturnType<typeof getCodeEditor>): FileTab {
  return {
    kind: 'file',
    key: SCRATCH_FILE_ID,
    fileId: SCRATCH_FILE_ID,
    model: editor.createModel(''),
    viewState: null,
    lastSyncedCode: '',
  }
}

// ----------------------------------------------------------------------
// Renderer
// ----------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Display label for a tab in the strip. Accepts a pre-built file lookup
 * map (keyed by file id, built once in `renderTabStrip`) so we don't
 * O(n × m) scan `getWorkspaceFiles()` per tab on every keystroke. Scratch
 * and handlers render under their angle-bracket virtual names (`<scratch>`,
 * `<handlers>`) so the strip matches the pinned tree entries; everything
 * else uses the file's basename via `fileDisplayName`. Scratch's label is
 * decided by ID before the workspace lookup so a transient missing-file
 * race (or the synthetic fallback) still labels it `<scratch>` rather than
 * `(missing)`.
 */
function tabLabel(tab: OpenTab, filesById: ReadonlyMap<string, WorkspaceFile>): string {
  if (tab.kind === 'snapshot') {
    // Snapshot label sources, in priority order: the saved-snapshot
    // user-supplied name (if any), the snapshot's `message`, or a generic
    // "Snapshot" fallback. The metadata lives in the workspace file's
    // `code` field (JSON-encoded entry); we parse it once and cache the
    // result on the tab object — `renderTabStrip` is called on every
    // keystroke, and re-parsing every open snapshot's payload per
    // keystroke would accumulate. Invalidated via
    // `invalidateSnapshotTabLabel` when metadata changes.
    if (tab.cachedLabel !== null) return tab.cachedLabel
    const file = filesById.get(tab.snapshotId)
    if (!file) {
      tab.cachedLabel = '(missing snapshot)'
      return tab.cachedLabel
    }
    let label = 'Snapshot'
    try {
      const entry = JSON.parse(file.code) as { name?: string; snapshot?: { message?: string } }
      if (typeof entry.name === 'string' && entry.name.trim() !== '') label = entry.name
      else {
        const message = entry.snapshot?.message
        if (typeof message === 'string' && message.trim() !== '') label = message
      }
    } catch {
      // Fall through to the generic label.
    }
    tab.cachedLabel = label
    return label
  }
  if (tab.fileId === SCRATCH_FILE_ID) return '<scratch>'
  const file = filesById.get(tab.fileId)
  if (!file) return '(missing)'
  if (file.path === HANDLERS_FILE_PATH) return '<handlers>'
  return fileDisplayName(file)
}

/**
 * Tab icon for the strip. `.dvala` files show the favicon, snapshots show
 * the camera icon. Other file types have no icon.
 */
function tabIcon(tab: OpenTab): string {
  if (tab.kind === 'snapshot') return `<span class="editor-tab__icon">${cameraIcon}</span>`
  // File tabs: .dvala files get the Dvala favicon.
  const file = getWorkspaceFiles().find(f => f.id === tab.fileId)
  if (file && file.path.endsWith('.dvala')) {
    return `<span class="editor-tab__icon"><img src="/favicon.png" alt="" width="14" height="14"></span>`
  }
  return ''
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
  //
  // Build a file lookup map once so `tabLabel` doesn't O(n × m) scan
  // `getWorkspaceFiles()` for every tab on every keystroke — the strip
  // re-renders on each editor onChange.
  const filesById = new Map(getWorkspaceFiles().map(f => [f.id, f]))
  const activeKeyAtRender = activeKey
  strip.innerHTML = openTabs
    .map(tab => {
      const isActive = tab.key === activeKey
      const dirty = isTabDirty(tab)
      const label = tabLabel(tab, filesById)
      // Phase 1.5 step 23j stage 2: scratch is closable like any other
      // tab. The × button is shown for every tab kind; users re-open
      // scratch from the pinned `<scratch>` entry in the file tree,
      // handlers from the pinned `<handlers>` entry, and snapshots from
      // the Snapshots side-panel list.
      const icon = tabIcon(tab)
      const closeBtn = `<button class="editor-tab__close" data-close-key="${escapeHtml(tab.key)}" tabindex="-1" title="Close (Cmd/Ctrl-W)">×</button>`
      const dot = dirty ? '<span class="editor-tab__dot" title="Unsaved changes"></span>' : ''
      return `
        <div
          class="editor-tab${isActive ? ' editor-tab--active' : ''}${dirty ? ' editor-tab--dirty' : ''}"
          role="tab"
          aria-selected="${isActive}"
          data-tab-key="${escapeHtml(tab.key)}"
          title="${escapeHtml(label)}"
        >
          ${icon}
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
