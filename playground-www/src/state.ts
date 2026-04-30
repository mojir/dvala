import type { UnknownRecord } from '../../src/interface'
import { reactive } from './lib/reactive'
import { SCRATCH_FILE_ID } from './scratchBuffer'

// Persisted tab list shape. Models + viewState aren't serializable; only
// "which files are open" survives reloads. Hydration in
// `scripts/tabs.ts::initTabs` reconstructs models from `WorkspaceFile.code`.
// After Phase 1.5 step 23h, scratch and handlers are regular `kind:'file'`
// entries keyed by their reserved IDs (`__scratch__`, `__handlers__`); the
// previous synthetic `'scratch'` discriminator was retired.
export type PersistedTab = { kind: 'file'; id: string }

export const defaultState = {
  'sidebar-width': 350 as number,
  'playground-height': 350 as number,
  'resize-divider-1-percent': 20 as number,
  'resize-divider-2-percent': 70 as number,
  'active-side-tab': 'files' as 'files' | 'snapshots',
  // Per-file storage slot for the legacy JSON context blob. The bindings /
  // effect-handler authoring UI was retired in Phase 1.5 step 23f; this slot
  // stays as a backing store for the public `playground.context.*` effect
  // API and for in-memory example handler injection (loaded transiently per
  // session). Persistent `bindings` / `effectHandlers` keys are silently
  // wiped on boot — see the migration block below.
  context: '' as string,
  'dvala-code': '' as string,
  'dvala-code-scroll-top': 0 as number,
  'dvala-code-selection-start': 0 as number,
  'dvala-code-selection-end': 0 as number,
  output: '' as string,
  'output-scroll-top': 0 as number,
  debug: true as boolean,
  pure: false as boolean,
  'intercept-effects': false as boolean,
  'intercept-checkpoint': false as boolean,
  'intercept-error': false as boolean,
  'intercept-unhandled': true as boolean,
  'disable-standard-handlers': false as boolean,
  'disable-playground-effects': false as boolean,
  'disable-auto-checkpoint': false as boolean,
  'playground-developer': false as boolean,
  'light-mode': null as boolean | null, // null = follow OS preference
  'focused-panel': null as 'dvala-code' | null,
  // After Phase 1.5 step 23h this is always a workspace-file ID — the
  // reserved scratch ID when the scratch tab is active, a UUID for any
  // other workspace file. The old `null` sentinel for "scratch is active"
  // was retired alongside the `'<scratch>'` tab key.
  'current-file-id': SCRATCH_FILE_ID as string,
  'dvala-code-edited': false as boolean,
  // Folder paths currently expanded in the file tree. Defaults to all folders
  // collapsed; users opt in by clicking. Workspace-scoped state — survives
  // reloads but lives in the same localStorage bucket as other prefs.
  'explorer-expanded-folders': [] as string[],
  // List of tabs the user has open in the editor. Reconstructed into
  // Monaco models on boot — see `scripts/tabs.ts::initTabs`. Default is the
  // pinned scratch buffer; handlers gets pinned in the file tree but only
  // shows up here once the user opens it.
  'open-tabs': [{ kind: 'file', id: SCRATCH_FILE_ID }] as PersistedTab[],
  /** Key of the currently focused tab — always a workspace-file ID post-23h. */
  'active-tab-key': SCRATCH_FILE_ID as string,
  // Layout-shell state. Right panel hosts structural views (Tokens / AST
  // / CST / Doc Tree); bottom panel hosts linear views (Output, eventually
  // state history / snapshots). Both persist their active-tab + collapsed
  // flag + size %. `right-panel-active-tab` defaults to 'tokens' (the
  // leftmost tool tab, pipeline order); `persistRightPanel` falls back to
  // that same id if the panel ever ends up with no active tab.
  'right-panel-active-tab': 'tokens' as string,
  'right-panel-collapsed': true as boolean, // start collapsed; user opts in
  'right-panel-size-percent': 35 as number, // % of total editor-area width
  'bottom-panel-active-tab': 'output' as string,
  'bottom-panel-collapsed': false as boolean, // output is on by default
  // Note: the bottom panel's height % lives in the existing
  // `resize-divider-2-percent` slot (was the output panel's slot pre-PR
  // and continues to be the canonical home). No separate
  // `bottom-panel-size-percent` slot needed.
} as const

type State = {
  -readonly [K in keyof typeof defaultState]: (typeof defaultState)[K]
}

type Key = keyof typeof defaultState
type StorageKey = `playground-${Key}`

// Reactive-wrapped state singleton: reads inside an `effect` block automatically
// track which keys they depend on, and writes (via setState/saveState/etc.) trigger
// the dependent effects to re-run. Existing get/set call sites work unchanged.
const state: State = reactive({
  ...defaultState,
}) as State

// Phase 1.5 step 23f silent-wipe: strip retired state slots and any leftover
// `bindings` / `effectHandlers` data from the persisted context blob. Pre-1.0,
// no migration story owed — leftover keys are harmless cruft. We clear them
// actively so DevTools storage stays tidy.
;[
  'playground-current-context-entry-kind',
  'playground-current-context-binding-name',
  'playground-context-scroll-top',
  'playground-context-selection-start',
  'playground-context-selection-end',
  'playground-new-context-name',
  'playground-new-context-value',
].forEach(key => localStorage.removeItem(key))

const legacyContextValue = localStorage.getItem('playground-context')
if (typeof legacyContextValue === 'string') {
  try {
    const parsed = JSON.parse(legacyContextValue) as unknown
    if (parsed && typeof parsed === 'string') {
      const parsedContext = JSON.parse(parsed) as unknown
      if (parsedContext && typeof parsedContext === 'object' && !Array.isArray(parsedContext)) {
        const next = { ...(parsedContext as UnknownRecord) }
        delete next.bindings
        delete next.effectHandlers
        localStorage.setItem('playground-context', JSON.stringify(JSON.stringify(next)))
      }
    }
  } catch {
    // Non-JSON / malformed legacy value — leave the slot alone; the load below
    // falls back to defaultState anyway.
  }
}

// Phase 1.5 step 23h: rewrite persisted tab state from the legacy scratch-
// sentinel form to the post-23h "scratch is a regular file" form. We do
// this once on boot so the loop below sees clean values:
//   open-tabs:       [{ kind: 'scratch' }]            → [{ kind: 'file', id: SCRATCH_FILE_ID }]
//   active-tab-key:  '<scratch>'                      → SCRATCH_FILE_ID
//   current-file-id: null                             → SCRATCH_FILE_ID
// Pre-1.0, no migration story owed — but a silent rewrite keeps the user's
// open-tabs list and active selection intact across the cutover.
//
// Note: the open-tabs migration rewrites legacy `{kind:'scratch'}` entries
// in-place without deduping. A user can't have ended up with both forms in
// the array pre-23h (the synthetic `'scratch'` kind was the only shape the
// old persistTabsState produced for scratch), so the only path to a duplicate
// is hand-crafted localStorage. `initTabs`'s `seen.has(entry.id)` check
// dedupes either way.
const LEGACY_SCRATCH_KEY = '<scratch>'

const legacyOpenTabs = localStorage.getItem('playground-open-tabs')
if (typeof legacyOpenTabs === 'string') {
  try {
    const parsed = JSON.parse(legacyOpenTabs) as unknown
    if (Array.isArray(parsed)) {
      let changed = false
      const migrated = parsed.map(entry => {
        if (entry && typeof entry === 'object' && (entry as { kind?: string }).kind === 'scratch') {
          changed = true
          return { kind: 'file', id: SCRATCH_FILE_ID }
        }
        return entry
      })
      if (changed) localStorage.setItem('playground-open-tabs', JSON.stringify(migrated))
    }
  } catch {
    // Malformed value — leave alone; the load below falls back to defaultState.
  }
}

const legacyActiveKey = localStorage.getItem('playground-active-tab-key')
if (legacyActiveKey === JSON.stringify(LEGACY_SCRATCH_KEY)) {
  localStorage.setItem('playground-active-tab-key', JSON.stringify(SCRATCH_FILE_ID))
}

const legacyCurrentFileId = localStorage.getItem('playground-current-file-id')
if (legacyCurrentFileId === 'null') {
  localStorage.setItem('playground-current-file-id', JSON.stringify(SCRATCH_FILE_ID))
}

;(Object.keys(defaultState) as Key[]).forEach((key: Key) => {
  const value = localStorage.getItem(getStorageKey(key))

  ;(state as UnknownRecord)[key] = typeof value === 'string' ? JSON.parse(value) : defaultState[key]
})

export function updateState(newState: Partial<State>) {
  Object.entries(newState).forEach(entry => {
    const key = entry[0] as keyof State
    setState(key, entry[1])
  })
}

export function saveState(newState: Partial<State>, pushToHistory = true) {
  Object.entries(newState).forEach(entry => {
    const key = entry[0] as keyof State
    const value = entry[1]
    setState(key, value)
    localStorage.setItem(getStorageKey(key), JSON.stringify(value))
  })
  void pushToHistory
}

function setState<T extends keyof State>(key: T, value: State[T]) {
  state[key] = value
}

export function clearAllStates() {
  localStorage.clear()
  Object.assign(state, defaultState)
}

export function clearState(...keys: Key[]) {
  keys.forEach(key => {
    localStorage.removeItem(getStorageKey(key))
    ;(state as UnknownRecord)[key] = defaultState[key]
  })
}

export function getState<T extends keyof State>(key: T): State[T] {
  return state[key]
}

export function encodeState() {
  const sharedState: Partial<State> = {
    'dvala-code': state['dvala-code'],
    context: state.context,
    debug: state.debug,
    pure: state.pure,
    'intercept-checkpoint': state['intercept-checkpoint'],
    'intercept-error': state['intercept-error'],
    'disable-standard-handlers': state['disable-standard-handlers'],
    'disable-playground-effects': state['disable-playground-effects'],
    'disable-auto-checkpoint': state['disable-auto-checkpoint'],
  }
  return btoa(encodeURIComponent(JSON.stringify(sharedState)))
}

export function applyEncodedState(encodedState: string): boolean {
  try {
    saveState(JSON.parse(decodeURIComponent(atob(encodedState))) as Partial<State>, false)
    return true
  } catch (_error) {
    return false
  }
}

function getStorageKey(key: Key): StorageKey {
  return `playground-${key}`
}
