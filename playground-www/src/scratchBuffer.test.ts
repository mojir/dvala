import { beforeEach, describe, expect, it } from 'vitest'
import { clearAllFiles, getWorkspaceFiles, setWorkspaceFiles } from './fileStorage'
import {
  ensureScratchFile,
  getScratchCode,
  getScratchContext,
  getScratchFile,
  isScratchPath,
  SCRATCH_FILE_PATH,
  setScratchCode,
  setScratchCodeAndContext,
  setScratchContext,
} from './scratchBuffer'

beforeEach(() => {
  clearAllFiles()
})

describe('isScratchPath', () => {
  it('returns true only for the canonical scratch path', () => {
    expect(isScratchPath(SCRATCH_FILE_PATH)).toBe(true)
    expect(isScratchPath('.dvala-playground/scratch.dvala')).toBe(true)
  })
  it('returns false for other paths under the playground folder', () => {
    expect(isScratchPath('.dvala-playground/handlers.dvala')).toBe(false)
    expect(isScratchPath('.dvala-playground/snapshots/x.json')).toBe(false)
  })
  it('returns false for unrelated workspace files', () => {
    expect(isScratchPath('foo.dvala')).toBe(false)
    expect(isScratchPath('scratch.dvala')).toBe(false)
  })
})

describe('ensureScratchFile', () => {
  it('creates an empty scratch file when none exists', () => {
    const created = ensureScratchFile()
    expect(created).toBe(true)
    const file = getScratchFile()
    expect(file?.path).toBe(SCRATCH_FILE_PATH)
    expect(file?.code).toBe('')
    expect(file?.context).toBe('')
  })
  it('is idempotent — returns false on subsequent calls', () => {
    ensureScratchFile()
    expect(ensureScratchFile()).toBe(false)
    // Existing scratch contents must not be clobbered.
    setScratchCode('preserved')
    ensureScratchFile()
    expect(getScratchCode()).toBe('preserved')
  })
  it('does not interfere with unrelated workspace files', () => {
    setWorkspaceFiles([
      {
        id: 'foo',
        path: 'foo.dvala',
        code: 'A',
        context: '',
        createdAt: 1,
        updatedAt: 1,
        locked: false,
      },
    ])
    ensureScratchFile()
    expect(getWorkspaceFiles()).toHaveLength(2)
  })
})

describe('getScratchCode / getScratchContext (uninitialized)', () => {
  it('returns empty strings before ensureScratchFile runs', () => {
    expect(getScratchCode()).toBe('')
    expect(getScratchContext()).toBe('')
    expect(getScratchFile()).toBeUndefined()
  })
})

describe('setScratchCode / setScratchContext / setScratchCodeAndContext', () => {
  it('writes code through, leaving context untouched', () => {
    ensureScratchFile()
    setScratchContext('ctx')
    setScratchCode('code-A')
    expect(getScratchCode()).toBe('code-A')
    expect(getScratchContext()).toBe('ctx')
  })
  it('writes context through, leaving code untouched', () => {
    ensureScratchFile()
    setScratchCode('code-A')
    setScratchContext('ctx-A')
    expect(getScratchCode()).toBe('code-A')
    expect(getScratchContext()).toBe('ctx-A')
  })
  it('setScratchCodeAndContext writes both atomically', () => {
    ensureScratchFile()
    setScratchCodeAndContext('code-B', 'ctx-B')
    expect(getScratchCode()).toBe('code-B')
    expect(getScratchContext()).toBe('ctx-B')
  })
  it('creates the scratch file on first write if ensureScratchFile was skipped', () => {
    // Defensive — production calls ensureScratchFile at boot, but if a test
    // (or recovery path) writes without that, the file should still come
    // into existence.
    expect(getScratchFile()).toBeUndefined()
    setScratchCode('first')
    expect(getScratchFile()?.path).toBe(SCRATCH_FILE_PATH)
    expect(getScratchCode()).toBe('first')
  })
  it('updates updatedAt on every write', async () => {
    ensureScratchFile()
    const t0 = getScratchFile()!.updatedAt
    // Force a clock tick so the new updatedAt strictly exceeds the old one
    // even on platforms with ms-resolution timestamps.
    await new Promise(resolve => setTimeout(resolve, 2))
    setScratchCode('changed')
    const t1 = getScratchFile()!.updatedAt
    expect(t1).toBeGreaterThan(t0)
  })
})
