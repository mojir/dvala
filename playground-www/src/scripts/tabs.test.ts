// Unit tests for the tab manager. The module holds state in module-level
// `let` bindings; we mock its three external dependencies (codeEditor,
// fileStorage, state) and call `__resetForTesting` between tests.

import { beforeEach, describe, expect, it, vi } from 'vitest'

// ----- Stub Monaco model: tabs.ts only consumes `getValue()`. -----
type StubModel = {
  __id: string
  __code: string
  __disposed: boolean
  getValue: () => string
}

let modelCounter = 0
function makeStubModel(code: string): StubModel {
  modelCounter += 1
  return {
    __id: `model-${modelCounter}`,
    __code: code,
    __disposed: false,
    getValue() {
      return this.__code
    },
  }
}

// ----- Stub editor: created models, disposed models, current model. -----
type StubEditor = {
  active: StubModel
  created: StubModel[]
  disposed: StubModel[]
  viewStateSaves: number
  viewStateRestores: unknown[]
  createModel: (code: string) => StubModel
  disposeModel: (m: StubModel) => void
  getActiveModel: () => StubModel
  setActiveModel: (m: StubModel, vs: unknown) => void
  saveViewState: () => unknown
}

let editor: StubEditor
function makeStubEditor(): StubEditor {
  const bootstrap = makeStubModel('')
  const inst: StubEditor = {
    active: bootstrap,
    created: [],
    disposed: [],
    viewStateSaves: 0,
    viewStateRestores: [],
    createModel(code) {
      const m = makeStubModel(code)
      inst.created.push(m)
      return m
    },
    disposeModel(m) {
      m.__disposed = true
      inst.disposed.push(m)
    },
    getActiveModel() {
      return inst.active
    },
    setActiveModel(m, vs) {
      inst.active = m
      inst.viewStateRestores.push(vs ?? null)
    },
    saveViewState() {
      inst.viewStateSaves += 1
      return { vs: inst.viewStateSaves }
    },
  }
  return inst
}

// ----- Stub state store: object-backed getState/saveState. -----
const stateStore: Record<string, unknown> = {}

// ----- Stub workspace files: getWorkspaceFiles consults this list. -----
let workspaceFiles: { id: string; path: string; code: string }[] = []

vi.mock('./codeEditorInstance', () => ({
  getCodeEditor: () => editor,
  tryGetCodeEditor: () => editor,
}))

vi.mock('../fileStorage', () => ({
  getWorkspaceFiles: () => workspaceFiles,
  fileDisplayName: (f: { path: string }) => f.path.split('/').pop() ?? f.path,
}))

// After Phase 1.5 step 23h, the tab manager hydrates scratch as a regular
// workspace file via the reserved `SCRATCH_FILE_ID`; the previous synthetic
// `kind:'scratch'` shape is gone. The mock therefore exposes the constants
// the production module imports — the seed flows through `getScratchCode`
// for tests that want a non-empty scratch buffer.
let scratchSeed = ''
vi.mock('../scratchBuffer', () => ({
  SCRATCH_FILE_ID: '__scratch__',
  SCRATCH_FILE_PATH: '.dvala-playground/scratch.dvala',
  getScratchCode: () => scratchSeed,
}))

vi.mock('../handlersBuffer', () => ({
  HANDLERS_FILE_PATH: '.dvala-playground/handlers.dvala',
}))

vi.mock('../state', () => ({
  getState: (k: string) => stateStore[k],
  saveState: (next: Record<string, unknown>) => {
    Object.assign(stateStore, next)
  },
}))

// `tabs.ts` imports KeyCode/KeyMod for shortcut binding — they're not
// exercised by these tests but the import has to resolve.
vi.mock('../codeEditor', () => ({
  KeyCode: new Proxy({}, { get: () => 0 }),
  KeyMod: new Proxy({}, { get: () => 0 }),
}))

// Pull in the module under test. `vi.mock` calls are hoisted by vitest so
// they execute before this import resolves — equivalent to top-level await
// without the unsupported syntax.
import * as tabs from './tabs'

function makeFile(id: string, path: string, code = `code-${id}`) {
  return { id, path, code }
}

const SCRATCH_FILE_ID = '__scratch__'
const SCRATCH_FILE_PATH = '.dvala-playground/scratch.dvala'

/** Seed the scratch workspace file so `initTabs` can hydrate it as a regular tab. */
function withScratchInWorkspace(rest: { id: string; path: string; code: string }[] = []) {
  return [makeFile(SCRATCH_FILE_ID, SCRATCH_FILE_PATH, ''), ...rest]
}

beforeEach(() => {
  // Fully reset shared state between tests.
  for (const k of Object.keys(stateStore)) delete stateStore[k]
  workspaceFiles = withScratchInWorkspace()
  modelCounter = 0
  editor = makeStubEditor()
  tabs.__resetForTesting()
  // Defaults the production state.ts ships post-Phase-1.5 step 23h.
  stateStore['open-tabs'] = [{ kind: 'file', id: SCRATCH_FILE_ID }]
  stateStore['active-tab-key'] = SCRATCH_FILE_ID
  stateStore['current-file-id'] = SCRATCH_FILE_ID
  scratchSeed = ''
})

// ----------------------------------------------------------------------
// initTabs hydration
// ----------------------------------------------------------------------

describe('initTabs', () => {
  it('hydrates the scratch tab on a fresh boot', () => {
    tabs.initTabs()
    // One scratch tab → exactly one createModel call.
    expect(editor.created).toHaveLength(1)
    expect(editor.active).toBe(editor.created[0])
    expect(stateStore['active-tab-key']).toBe(SCRATCH_FILE_ID)
    expect(stateStore['current-file-id']).toBe(SCRATCH_FILE_ID)
  })

  it('disposes the bootstrap model created by `monaco.editor.create`', () => {
    const bootstrap = editor.active
    tabs.initTabs()
    expect(bootstrap.__disposed).toBe(true)
    expect(editor.disposed).toContain(bootstrap)
  })

  it('restores persisted file tabs that still have backing files', () => {
    workspaceFiles = withScratchInWorkspace([makeFile('a', 'a.dvala'), makeFile('b', 'b.dvala')])
    stateStore['open-tabs'] = [
      { kind: 'file', id: SCRATCH_FILE_ID },
      { kind: 'file', id: 'a' },
      { kind: 'file', id: 'b' },
    ]
    stateStore['active-tab-key'] = 'b'
    tabs.initTabs()
    expect(stateStore['active-tab-key']).toBe('b')
    expect(stateStore['current-file-id']).toBe('b')
  })

  it('drops persisted tabs whose files are gone, falling back to scratch', () => {
    stateStore['open-tabs'] = [{ kind: 'file', id: SCRATCH_FILE_ID }, { kind: 'file', id: 'gone' }]
    stateStore['active-tab-key'] = 'gone'
    tabs.initTabs()
    expect(stateStore['active-tab-key']).toBe(SCRATCH_FILE_ID)
    expect(stateStore['current-file-id']).toBe(SCRATCH_FILE_ID)
  })

  it('always inserts a scratch tab even if the persisted list omitted it', () => {
    workspaceFiles = withScratchInWorkspace([makeFile('a', 'a.dvala')])
    stateStore['open-tabs'] = [{ kind: 'file', id: 'a' }]
    stateStore['active-tab-key'] = 'a'
    tabs.initTabs()
    // Open-tabs should now lead with scratch + the file.
    const persisted = stateStore['open-tabs'] as { kind: string; id: string }[]
    expect(persisted[0]).toEqual({ kind: 'file', id: SCRATCH_FILE_ID })
    expect(persisted).toHaveLength(2)
  })

  it('falls back to current-file-id when active-tab-key is missing', () => {
    workspaceFiles = withScratchInWorkspace([makeFile('a', 'a.dvala')])
    stateStore['open-tabs'] = [{ kind: 'file', id: SCRATCH_FILE_ID }, { kind: 'file', id: 'a' }]
    stateStore['active-tab-key'] = 'unknown'
    stateStore['current-file-id'] = 'a'
    tabs.initTabs()
    expect(stateStore['active-tab-key']).toBe('a')
  })
})

// ----------------------------------------------------------------------
// openOrFocusFile / focusScratch
// ----------------------------------------------------------------------

describe('openOrFocusFile', () => {
  beforeEach(() => {
    tabs.initTabs()
    workspaceFiles = withScratchInWorkspace([makeFile('a', 'a.dvala', 'A'), makeFile('b', 'b.dvala', 'B')])
  })

  it('creates a new tab + activates it for an unopened file', () => {
    tabs.openOrFocusFile('a')
    expect(stateStore['active-tab-key']).toBe('a')
    expect(stateStore['current-file-id']).toBe('a')
    expect(stateStore['dvala-code']).toBe('A')
  })

  it('focuses the existing tab on second open without creating a duplicate model', () => {
    tabs.openOrFocusFile('a')
    const modelsAfterFirst = editor.created.length
    tabs.openOrFocusFile('a')
    expect(editor.created.length).toBe(modelsAfterFirst)
  })

  it('does nothing when the file id is unknown', () => {
    const before = JSON.parse(JSON.stringify(stateStore))
    tabs.openOrFocusFile('does-not-exist')
    expect(stateStore['active-tab-key']).toBe(before['active-tab-key'])
  })

  it('inserts new tabs after the active one (matches VS Code behavior)', () => {
    tabs.openOrFocusFile('a')
    tabs.openOrFocusFile('b')
    const persisted = stateStore['open-tabs'] as { kind: string; id: string }[]
    // [scratch, a, b] — 'a' is the previously-active tab when 'b' opened.
    expect(persisted.map(t => t.id)).toEqual([SCRATCH_FILE_ID, 'a', 'b'])
  })
})

describe('focusScratch', () => {
  it('switches back to scratch from a file tab', () => {
    tabs.initTabs()
    workspaceFiles = withScratchInWorkspace([makeFile('a', 'a.dvala')])
    tabs.openOrFocusFile('a')
    tabs.focusScratch()
    expect(stateStore['active-tab-key']).toBe(SCRATCH_FILE_ID)
    expect(stateStore['current-file-id']).toBe(SCRATCH_FILE_ID)
  })
})

// ----------------------------------------------------------------------
// closeTab + closeActiveTab + closeTabsForMissingFiles
// ----------------------------------------------------------------------

describe('closeTab', () => {
  beforeEach(() => {
    tabs.initTabs()
    workspaceFiles = withScratchInWorkspace([makeFile('a', 'a.dvala'), makeFile('b', 'b.dvala')])
  })

  it('refuses to close the scratch tab (it is sticky)', () => {
    tabs.closeTab(SCRATCH_FILE_ID)
    const persisted = stateStore['open-tabs'] as unknown[]
    expect(persisted).toHaveLength(1)
  })

  it('removes a file tab and disposes its model', () => {
    tabs.openOrFocusFile('a')
    const aModel = editor.active
    tabs.closeTab('a')
    expect(aModel.__disposed).toBe(true)
    expect(editor.disposed).toContain(aModel)
  })

  it('falls back to the left neighbor when closing the active tab', () => {
    tabs.openOrFocusFile('a')
    tabs.openOrFocusFile('b')
    // Tabs: [scratch, a, b], active = b.
    tabs.closeTab('b')
    // Neighbor on the left is 'a'.
    expect(stateStore['active-tab-key']).toBe('a')
  })

  it('falls back to the right tab if closing the leftmost file tab', () => {
    tabs.openOrFocusFile('a')
    tabs.openOrFocusFile('b')
    // Now active = b. Switch back to a, then close — right neighbor is now b.
    tabs.openOrFocusFile('a')
    tabs.closeTab('a')
    expect(stateStore['active-tab-key']).toBe('b')
  })

  it('falls back to scratch when closing the only file tab', () => {
    tabs.openOrFocusFile('a')
    tabs.closeTab('a')
    expect(stateStore['active-tab-key']).toBe(SCRATCH_FILE_ID)
  })

  it('does not change active when closing a non-active tab', () => {
    tabs.openOrFocusFile('a')
    tabs.openOrFocusFile('b')
    expect(stateStore['active-tab-key']).toBe('b')
    tabs.closeTab('a')
    expect(stateStore['active-tab-key']).toBe('b')
  })

  it('is a no-op when the key does not match any open tab', () => {
    const before = stateStore['active-tab-key']
    tabs.closeTab('never-opened')
    expect(stateStore['active-tab-key']).toBe(before)
  })
})

describe('closeActiveTab', () => {
  it('closes the currently-active file tab', () => {
    tabs.initTabs()
    workspaceFiles = withScratchInWorkspace([makeFile('a', 'a.dvala')])
    tabs.openOrFocusFile('a')
    tabs.closeActiveTab()
    expect(stateStore['active-tab-key']).toBe(SCRATCH_FILE_ID)
  })

  it('is a no-op when scratch is the active tab', () => {
    tabs.initTabs()
    tabs.closeActiveTab()
    expect(stateStore['active-tab-key']).toBe(SCRATCH_FILE_ID)
  })
})

describe('closeTabsForMissingFiles', () => {
  it('drops tabs whose backing file is no longer in workspaceFiles', () => {
    tabs.initTabs()
    workspaceFiles = withScratchInWorkspace([makeFile('a', 'a.dvala'), makeFile('b', 'b.dvala')])
    tabs.openOrFocusFile('a')
    tabs.openOrFocusFile('b')
    // Simulate deletion of 'a' from workspace files (scratch stays in the
    // workspace map — it's the pinned reserved file).
    workspaceFiles = workspaceFiles.filter(f => f.id !== 'a')
    tabs.closeTabsForMissingFiles()
    const persisted = stateStore['open-tabs'] as { kind: string; id: string }[]
    expect(persisted.map(t => t.id)).toEqual([SCRATCH_FILE_ID, 'b'])
    // 'b' was active and still exists, so it stays active.
    expect(stateStore['active-tab-key']).toBe('b')
  })

  it('falls back to scratch when the active tab is missing', () => {
    tabs.initTabs()
    workspaceFiles = withScratchInWorkspace([makeFile('a', 'a.dvala')])
    tabs.openOrFocusFile('a')
    // Drop 'a' but keep scratch in the workspace map (it's the reserved
    // pinned file; only user files are subject to deletion).
    workspaceFiles = withScratchInWorkspace()
    tabs.closeTabsForMissingFiles()
    expect(stateStore['active-tab-key']).toBe(SCRATCH_FILE_ID)
  })
})

// ----------------------------------------------------------------------
// openOrFocusSnapshotTab — Phase 1.5 step 23j
// ----------------------------------------------------------------------

describe('openOrFocusSnapshotTab', () => {
  // Mimics how snapshotStorage stores entries — workspace file at the
  // canonical snapshots path, JSON payload in `code`.
  function makeSnapshotFile(id: string, name?: string) {
    return {
      id,
      path: `.dvala-playground/snapshots/${id}.json`,
      code: JSON.stringify({
        kind: 'saved',
        snapshot: { id, message: 'a checkpoint' },
        savedAt: 1000,
        locked: false,
        ...(name !== undefined ? { name } : {}),
      }),
    }
  }

  beforeEach(() => {
    tabs.initTabs()
  })

  it('opens a snapshot tab when one is requested for an unopened snapshot', () => {
    workspaceFiles = withScratchInWorkspace([makeSnapshotFile('snap-a')])
    tabs.openOrFocusSnapshotTab('snap-a')

    expect(stateStore['active-tab-key']).toBe('snap-a')
    const persisted = stateStore['open-tabs'] as { kind: string; id: string }[]
    expect(persisted).toContainEqual({ kind: 'snapshot', id: 'snap-a' })
  })

  it('focuses the existing snapshot tab on second open without duplicating', () => {
    workspaceFiles = withScratchInWorkspace([makeSnapshotFile('snap-a'), makeSnapshotFile('snap-b')])
    tabs.openOrFocusSnapshotTab('snap-a')
    tabs.openOrFocusSnapshotTab('snap-b')
    const beforeRefocusCount = (stateStore['open-tabs'] as unknown[]).length

    tabs.openOrFocusSnapshotTab('snap-a')

    expect(stateStore['active-tab-key']).toBe('snap-a')
    expect((stateStore['open-tabs'] as unknown[]).length).toBe(beforeRefocusCount)
  })

  it('is a no-op when the snapshot id has no backing workspace file', () => {
    workspaceFiles = withScratchInWorkspace()
    const before = JSON.parse(JSON.stringify(stateStore))
    tabs.openOrFocusSnapshotTab('nonexistent')
    // No new tab should have been added; active key unchanged.
    expect(stateStore['active-tab-key']).toBe(before['active-tab-key'])
    expect((stateStore['open-tabs'] as unknown[]).length).toBe((before['open-tabs'] as unknown[]).length)
  })

  it('closes via closeTab like any other tab (snapshot has no Monaco model to dispose)', () => {
    workspaceFiles = withScratchInWorkspace([makeSnapshotFile('snap-a')])
    tabs.openOrFocusSnapshotTab('snap-a')
    const modelsCreatedBeforeClose = editor.created.length
    const modelsDisposedBeforeClose = editor.disposed.length

    tabs.closeTab('snap-a')

    // Closing a snapshot tab must not dispose any Monaco model — snapshot
    // tabs don't carry one. The bootstrap model dispose accounting from
    // initTabs already happened; this close should add nothing on top.
    expect(editor.created.length).toBe(modelsCreatedBeforeClose)
    expect(editor.disposed.length).toBe(modelsDisposedBeforeClose)
    // Active tab fell back to scratch (the only remaining tab).
    expect(stateStore['active-tab-key']).toBe(SCRATCH_FILE_ID)
  })

  it('persists snapshot tabs and rehydrates them on next initTabs', () => {
    // First boot: open a snapshot tab, then re-init from the same persisted
    // state to simulate a reload.
    workspaceFiles = withScratchInWorkspace([makeSnapshotFile('snap-a')])
    tabs.openOrFocusSnapshotTab('snap-a')

    // Reset the tab manager but keep stateStore + workspaceFiles intact.
    tabs.__resetForTesting()
    editor = makeStubEditor()
    tabs.initTabs()

    expect(stateStore['active-tab-key']).toBe('snap-a')
    const persisted = stateStore['open-tabs'] as { kind: string; id: string }[]
    expect(persisted).toContainEqual({ kind: 'snapshot', id: 'snap-a' })
  })

  it('auto-closes the snapshot tab when its backing workspace file is removed', () => {
    workspaceFiles = withScratchInWorkspace([makeSnapshotFile('snap-a'), makeSnapshotFile('snap-b')])
    tabs.openOrFocusSnapshotTab('snap-a')
    tabs.openOrFocusSnapshotTab('snap-b')
    // Snapshot 'snap-a' is removed (e.g. user deleted via Snapshots side panel).
    workspaceFiles = workspaceFiles.filter(f => f.id !== 'snap-a')

    tabs.closeTabsForMissingFiles()

    const persisted = stateStore['open-tabs'] as { kind: string; id: string }[]
    expect(persisted.find(t => t.id === 'snap-a')).toBeUndefined()
    expect(persisted.find(t => t.id === 'snap-b')).toBeDefined()
  })
})

// ----------------------------------------------------------------------
// setActiveByIndex / cycleActive
// ----------------------------------------------------------------------

describe('keyboard navigation', () => {
  beforeEach(() => {
    tabs.initTabs()
    workspaceFiles = withScratchInWorkspace([
      makeFile('a', 'a.dvala'),
      makeFile('b', 'b.dvala'),
      makeFile('c', 'c.dvala'),
    ])
    tabs.openOrFocusFile('a')
    tabs.openOrFocusFile('b')
    tabs.openOrFocusFile('c')
  })

  it('setActiveByIndex(1) selects the leftmost (1-based)', () => {
    tabs.setActiveByIndex(1)
    expect(stateStore['active-tab-key']).toBe(SCRATCH_FILE_ID)
  })

  it('setActiveByIndex selects file tabs by 1-based position', () => {
    tabs.setActiveByIndex(2)
    expect(stateStore['active-tab-key']).toBe('a')
    tabs.setActiveByIndex(4)
    expect(stateStore['active-tab-key']).toBe('c')
  })

  it('setActiveByIndex is a no-op when out of range', () => {
    tabs.setActiveByIndex(2) // → 'a'
    tabs.setActiveByIndex(99)
    expect(stateStore['active-tab-key']).toBe('a')
    tabs.setActiveByIndex(0)
    expect(stateStore['active-tab-key']).toBe('a')
  })

  it('cycleActive(+1) wraps from last to first', () => {
    expect(stateStore['active-tab-key']).toBe('c')
    tabs.cycleActive(+1)
    expect(stateStore['active-tab-key']).toBe(SCRATCH_FILE_ID)
  })

  it('cycleActive(-1) wraps from first to last', () => {
    tabs.setActiveByIndex(1) // → scratch
    tabs.cycleActive(-1)
    expect(stateStore['active-tab-key']).toBe('c')
  })
})

// ----------------------------------------------------------------------
// Lifecycle hooks (regressions for review blockers #1 + #3)
// ----------------------------------------------------------------------

describe('setTabLifecycleHooks', () => {
  it('beforeSwap fires while the OLD tab id is still current', () => {
    tabs.initTabs()
    workspaceFiles = withScratchInWorkspace([makeFile('a', 'a.dvala'), makeFile('b', 'b.dvala')])
    tabs.openOrFocusFile('a')
    let observedDuringHook: unknown = 'unset'
    tabs.setTabLifecycleHooks({
      beforeSwap: () => {
        observedDuringHook = stateStore['current-file-id']
      },
    })
    tabs.openOrFocusFile('b')
    expect(observedDuringHook).toBe('a')
  })

  it('afterSwap fires once current-file-id reflects the NEW tab', () => {
    tabs.initTabs()
    workspaceFiles = withScratchInWorkspace([makeFile('a', 'a.dvala'), makeFile('b', 'b.dvala')])
    tabs.openOrFocusFile('a')
    let observedDuringHook: unknown = 'unset'
    tabs.setTabLifecycleHooks({
      afterSwap: () => {
        observedDuringHook = stateStore['current-file-id']
      },
    })
    tabs.openOrFocusFile('b')
    expect(observedDuringHook).toBe('b')
  })

  it('beforeSwap fires before afterSwap on the same swap', () => {
    tabs.initTabs()
    workspaceFiles = withScratchInWorkspace([makeFile('a', 'a.dvala'), makeFile('b', 'b.dvala')])
    tabs.openOrFocusFile('a')
    const order: string[] = []
    tabs.setTabLifecycleHooks({
      beforeSwap: () => order.push('before'),
      afterSwap: () => order.push('after'),
    })
    tabs.openOrFocusFile('b')
    expect(order).toEqual(['before', 'after'])
  })

  it('does not fire hooks when the swap is a no-op (same tab)', () => {
    tabs.initTabs()
    workspaceFiles = withScratchInWorkspace([makeFile('a', 'a.dvala')])
    tabs.openOrFocusFile('a')
    let count = 0
    tabs.setTabLifecycleHooks({ beforeSwap: () => (count += 1) })
    tabs.openOrFocusFile('a')
    expect(count).toBe(0)
  })
})

// ----------------------------------------------------------------------
// notifyTabsChanged + onTabsChange semantics
// ----------------------------------------------------------------------

describe('notifyTabsChanged', () => {
  it('triggers re-render hooks subscribed via the renderer', () => {
    // The internal renderer is wired at module load via onTabsChange, so we
    // can't subscribe again — but notifyTabsChanged itself should be a
    // pure trigger that doesn't mutate tab state.
    tabs.initTabs()
    const beforeKey = stateStore['active-tab-key']
    tabs.notifyTabsChanged()
    expect(stateStore['active-tab-key']).toBe(beforeKey)
  })
})
