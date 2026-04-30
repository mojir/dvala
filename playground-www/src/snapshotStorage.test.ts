// Coverage for the post-23i snapshot storage layer. Snapshots are now real
// `WorkspaceFile` entries under `.dvala-playground/snapshots/`; this file
// exercises the split-by-kind reads, the per-batch path disambiguator, the
// snapshot.id-stable workspace-file id (matters for 23j when these become
// tabs), and the legacy-IDB wipe in `init()`.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const SCRATCH_FILE_ID = '__scratch__'

// In-memory fakes for IDB + the workspace-file backend. The mocks have to
// be hoisted (vitest hoists `vi.mock` calls), so the in-memory stores live
// at module scope and the mock impls poke at them.
type Stub = {
  id: string
  path: string
  code: string
  context: string
  createdAt: number
  updatedAt: number
  locked: boolean
}
let workspaceFiles: Stub[] = []
const idbCleared: string[] = []

vi.mock('./idb', () => ({
  SAVED_SNAPSHOTS_STORE: 'saved-snapshots',
  TERMINAL_SNAPSHOTS_STORE: 'terminal-snapshots',
  openDb: vi.fn(async () => {}),
  getDb: vi.fn(() => ({}) as unknown),
  idbClear: vi.fn((store: string) => {
    idbCleared.push(store)
  }),
}))

vi.mock('./fileStorage', () => ({
  getWorkspaceFiles: () => workspaceFiles,
  setWorkspaceFiles: (entries: Stub[]) => {
    workspaceFiles = entries
  },
}))

vi.mock('./scratchBuffer', () => ({
  SCRATCH_FILE_ID,
}))

import {
  clearAll,
  getSavedSnapshots,
  getTerminalSnapshots,
  init,
  setSavedSnapshots,
  setTerminalSnapshots,
} from './snapshotStorage'
import type { SavedSnapshot, TerminalSnapshotEntry } from './snapshotStorage'

// `Snapshot` carries a pile of evaluator-internal fields these tests don't
// care about — the storage layer only ever inspects `.id`. Casting through
// `unknown` keeps the partial-shape spirit while satisfying the
// no-direct-object-cast lint rule.
type StubSnapshot = SavedSnapshot['snapshot']
function snap(id: string): StubSnapshot {
  return { id } as unknown as StubSnapshot
}

function makeSavedEntry(id: string, savedAt: number, opts: { name?: string; locked?: boolean } = {}): SavedSnapshot {
  return {
    kind: 'saved',
    snapshot: snap(id),
    savedAt,
    locked: opts.locked ?? false,
    name: opts.name,
  }
}

function makeTerminalEntry(
  id: string,
  savedAt: number,
  resultType: 'completed' | 'error' | 'halted' = 'completed',
): TerminalSnapshotEntry {
  return {
    kind: 'terminal',
    snapshot: snap(id),
    savedAt,
    resultType,
    result: undefined,
  }
}

beforeEach(() => {
  workspaceFiles = []
  idbCleared.length = 0
})

afterEach(() => {
  workspaceFiles = []
  idbCleared.length = 0
})

describe('init', () => {
  it('wipes the legacy SAVED_SNAPSHOTS_STORE and TERMINAL_SNAPSHOTS_STORE on every boot', async () => {
    await init()
    expect(idbCleared).toContain('saved-snapshots')
    expect(idbCleared).toContain('terminal-snapshots')
  })
})

describe('setSavedSnapshots + getSavedSnapshots', () => {
  it('writes one workspace file per snapshot under .dvala-playground/snapshots/', () => {
    setSavedSnapshots([makeSavedEntry('a', 1000), makeSavedEntry('b', 2000, { name: 'My Save' })])

    expect(workspaceFiles).toHaveLength(2)
    expect(workspaceFiles.every(f => f.path.startsWith('.dvala-playground/snapshots/'))).toBe(true)
    expect(workspaceFiles.find(f => f.path === '.dvala-playground/snapshots/1000.json')).toBeTruthy()
    expect(workspaceFiles.find(f => f.path === '.dvala-playground/snapshots/2000.json')).toBeTruthy()
  })

  it('encodes the entry JSON in the workspace file `code` field', () => {
    setSavedSnapshots([makeSavedEntry('a', 1000, { name: 'Hello' })])

    const file = workspaceFiles[0]!
    expect(JSON.parse(file.code)).toMatchObject({
      kind: 'saved',
      savedAt: 1000,
      locked: false,
      name: 'Hello',
      snapshot: { id: 'a' },
    })
  })

  it('keeps the workspace-file `id` bonded to `snapshot.id` (stable across path shifts in 23j)', () => {
    setSavedSnapshots([makeSavedEntry('alpha', 1000)])
    expect(workspaceFiles[0]!.id).toBe('alpha')

    // Add a sibling at the same savedAt — path becomes `1000-2.json` for the
    // new one, but the original file's id stays bonded to its snapshot.id.
    setSavedSnapshots([makeSavedEntry('alpha', 1000), makeSavedEntry('beta', 1000)])
    const alpha = workspaceFiles.find(f => JSON.parse(f.code).snapshot.id === 'alpha')!
    const beta = workspaceFiles.find(f => JSON.parse(f.code).snapshot.id === 'beta')!
    expect(alpha.id).toBe('alpha')
    expect(beta.id).toBe('beta')
  })

  it('disambiguates same-savedAt entries with -<n> suffix', () => {
    setSavedSnapshots([makeSavedEntry('a', 1000), makeSavedEntry('b', 1000), makeSavedEntry('c', 1000)])

    const paths = workspaceFiles.map(f => f.path).sort()
    expect(paths).toEqual([
      '.dvala-playground/snapshots/1000-2.json',
      '.dvala-playground/snapshots/1000-3.json',
      '.dvala-playground/snapshots/1000.json',
    ])
  })

  it('returns saved snapshots in newest-first order', () => {
    setSavedSnapshots([makeSavedEntry('old', 1000), makeSavedEntry('new', 3000), makeSavedEntry('mid', 2000)])

    const got = getSavedSnapshots().map(e => e.snapshot.id)
    expect(got).toEqual(['new', 'mid', 'old'])
  })

  it('replaces the existing saved set without touching terminal snapshots', () => {
    setTerminalSnapshots([makeTerminalEntry('t1', 500)])
    setSavedSnapshots([makeSavedEntry('s1', 1000)])

    // Replace saved with a single different entry; terminal must survive.
    setSavedSnapshots([makeSavedEntry('s2', 2000)])

    expect(getSavedSnapshots().map(e => e.snapshot.id)).toEqual(['s2'])
    expect(getTerminalSnapshots().map(e => e.snapshot.id)).toEqual(['t1'])
  })

  it('preserves `createdAt` across re-writes (matters for 23j tab metadata)', () => {
    setSavedSnapshots([makeSavedEntry('a', 1000)])
    const original = workspaceFiles[0]!.createdAt

    // Re-write the same snapshot (e.g. lock toggle).
    setSavedSnapshots([makeSavedEntry('a', 1000, { locked: true })])
    expect(workspaceFiles[0]!.createdAt).toBe(original)
  })
})

describe('setTerminalSnapshots + getTerminalSnapshots', () => {
  it('writes one workspace file per terminal entry', () => {
    setTerminalSnapshots([makeTerminalEntry('t1', 500), makeTerminalEntry('t2', 600)])

    expect(workspaceFiles).toHaveLength(2)
    const codes = workspaceFiles.map(f => JSON.parse(f.code))
    expect(codes.every(c => c.kind === 'terminal')).toBe(true)
  })

  it('replaces the existing terminal set without touching saved snapshots', () => {
    setSavedSnapshots([makeSavedEntry('s1', 1000)])
    setTerminalSnapshots([makeTerminalEntry('t1', 500)])

    setTerminalSnapshots([])

    expect(getSavedSnapshots().map(e => e.snapshot.id)).toEqual(['s1'])
    expect(getTerminalSnapshots()).toHaveLength(0)
  })

  it('returns terminal snapshots in newest-first order', () => {
    setTerminalSnapshots([makeTerminalEntry('old', 100), makeTerminalEntry('new', 300), makeTerminalEntry('mid', 200)])

    expect(getTerminalSnapshots().map(e => e.snapshot.id)).toEqual(['new', 'mid', 'old'])
  })
})

describe('clearAll', () => {
  it('removes only files inside the snapshots folder, leaving other workspace files alone', () => {
    workspaceFiles = [
      // A user file that should survive
      {
        id: 'user-file',
        path: 'utils.dvala',
        code: 'foo',
        context: '',
        createdAt: 0,
        updatedAt: 0,
        locked: false,
      },
      // The scratch buffer (also under .dvala-playground/, but NOT under snapshots/)
      {
        id: SCRATCH_FILE_ID,
        path: '.dvala-playground/scratch.dvala',
        code: '',
        context: '',
        createdAt: 0,
        updatedAt: 0,
        locked: false,
      },
    ]
    setSavedSnapshots([makeSavedEntry('s1', 1000)])
    setTerminalSnapshots([makeTerminalEntry('t1', 500)])

    clearAll()

    expect(workspaceFiles.find(f => f.path === 'utils.dvala')).toBeTruthy()
    expect(workspaceFiles.find(f => f.id === SCRATCH_FILE_ID)).toBeTruthy()
    expect(workspaceFiles.find(f => f.path.startsWith('.dvala-playground/snapshots/'))).toBeUndefined()
  })
})

describe('malformed payload handling', () => {
  it('skips snapshot files whose `code` is not valid JSON', () => {
    workspaceFiles = [
      {
        id: 'bad',
        path: '.dvala-playground/snapshots/1000.json',
        code: 'not-json',
        context: '',
        createdAt: 0,
        updatedAt: 0,
        locked: false,
      },
    ]

    expect(getSavedSnapshots()).toEqual([])
    expect(getTerminalSnapshots()).toEqual([])
  })

  it('skips snapshot files with the wrong `kind` discriminator', () => {
    workspaceFiles = [
      {
        id: 'unknown-kind',
        path: '.dvala-playground/snapshots/1000.json',
        code: JSON.stringify({ kind: 'something-else', snapshot: { id: 'x' }, savedAt: 1000 }),
        context: '',
        createdAt: 0,
        updatedAt: 0,
        locked: false,
      },
    ]

    expect(getSavedSnapshots()).toEqual([])
    expect(getTerminalSnapshots()).toEqual([])
  })
})
