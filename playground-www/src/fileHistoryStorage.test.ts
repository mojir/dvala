// Coverage for the legacy `<scratch>` history-bucket rename added in Phase
// 1.5 step 23h. The rename runs inside `initFileHistories`, so we mock the
// IDB layer to feed it controlled inputs and assert the resulting cache.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const SCRATCH_FILE_ID = '__scratch__'

// In-memory fake for the IDB store the rename touches.
let idbStore: Record<string, unknown> = {}

// Mocks have to be hoisted (vitest hoists `vi.mock` to the top of the file
// before imports run), so we declare the in-memory store at module scope and
// have the mock impls poke at it. `getDb()` returning a truthy value is what
// makes the rename actually persist; we keep it true to exercise the write.
vi.mock('./idb', () => ({
  FILE_HISTORIES_STORE: 'file-histories-store',
  openDb: vi.fn(async () => {}),
  getDb: vi.fn(() => ({}) as unknown),
  idbGet: vi.fn(async (_store: string, _key: string) => idbStore[_key]),
  idbPut: vi.fn(async (_store: string, key: string, value: unknown) => {
    idbStore[key] = value
  }),
  idbClear: vi.fn(async () => {
    idbStore = {}
  }),
}))

vi.mock('./scratchBuffer', () => ({
  // `vi.mock` factories are hoisted to the top of the file, so module-scope
  // constants aren't visible here — inline the literal. Kept consistent
  // with the canonical value in `scratchBuffer.ts`.
  SCRATCH_FILE_ID: '__scratch__',
}))

// Pull in the module under test once per case (vitest module cache will
// re-evaluate after `vi.resetModules` in the beforeEach below).
import { initFileHistories, getFileHistory } from './fileHistoryStorage'

const STATE_KEY = 'state'

function seedHistories(value: Record<string, unknown>): void {
  idbStore[STATE_KEY] = value
}

function readHistories(): Record<string, unknown> {
  return (idbStore[STATE_KEY] ?? {}) as Record<string, unknown>
}

beforeEach(() => {
  idbStore = {}
})

afterEach(() => {
  idbStore = {}
})

describe('initFileHistories — Phase 1.5 step 23h scratch history rename', () => {
  it("renames a legacy '<scratch>' bucket onto SCRATCH_FILE_ID", async () => {
    const legacyHistory = { history: [{ text: 'old', selectionStart: 0, selectionEnd: 0 }], index: 0 }
    seedHistories({ '<scratch>': legacyHistory, 'file-uuid': { history: [], index: 0 } })

    await initFileHistories()

    const after = readHistories()
    expect(after['<scratch>']).toBeUndefined()
    expect(after[SCRATCH_FILE_ID]).toEqual(legacyHistory)
    expect(after['file-uuid']).toEqual({ history: [], index: 0 })
  })

  it('exposes the renamed history through getFileHistory under the new key', async () => {
    const legacyHistory = { history: [{ text: 'x', selectionStart: 0, selectionEnd: 0 }], index: 0 }
    seedHistories({ '<scratch>': legacyHistory })

    await initFileHistories()

    expect(getFileHistory(SCRATCH_FILE_ID)).toEqual(legacyHistory)
    expect(getFileHistory('<scratch>')).toBeUndefined()
  })

  it('drops the legacy bucket when both keys coexist (defensive guard)', async () => {
    // Pathological case: somehow both the new and legacy keys are present.
    // The post-23h key wins so users don't lose their newer scratch history;
    // the legacy bucket is dropped on the side.
    const legacyHistory = { history: [{ text: 'legacy', selectionStart: 0, selectionEnd: 0 }], index: 0 }
    const newHistory = { history: [{ text: 'new', selectionStart: 0, selectionEnd: 0 }], index: 0 }
    seedHistories({ '<scratch>': legacyHistory, [SCRATCH_FILE_ID]: newHistory })

    await initFileHistories()

    const after = readHistories()
    expect(after['<scratch>']).toBeUndefined()
    expect(after[SCRATCH_FILE_ID]).toEqual(newHistory)
  })

  it('is a no-op when no legacy bucket is present', async () => {
    const newHistory = { history: [{ text: 'fresh', selectionStart: 0, selectionEnd: 0 }], index: 0 }
    seedHistories({ [SCRATCH_FILE_ID]: newHistory, 'file-uuid': { history: [], index: 0 } })

    await initFileHistories()

    const after = readHistories()
    expect(after[SCRATCH_FILE_ID]).toEqual(newHistory)
    expect(after['file-uuid']).toEqual({ history: [], index: 0 })
    expect(after['<scratch>']).toBeUndefined()
  })

  it('handles an empty store without crashing', async () => {
    // No seeding — store is empty.
    await initFileHistories()

    expect(getFileHistory(SCRATCH_FILE_ID)).toBeUndefined()
  })
})
