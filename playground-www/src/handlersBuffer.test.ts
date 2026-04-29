import { beforeEach, describe, expect, it } from 'vitest'
import { clearAllFiles, getWorkspaceFiles, setWorkspaceFiles } from './fileStorage'
import {
  ensureHandlersFile,
  getHandlersCode,
  getHandlersFile,
  HANDLERS_FILE_PATH,
  isHandlersPath,
  setHandlersCode,
} from './handlersBuffer'

beforeEach(() => {
  clearAllFiles()
})

describe('isHandlersPath', () => {
  it('returns true only for the canonical handlers path', () => {
    expect(isHandlersPath(HANDLERS_FILE_PATH)).toBe(true)
    expect(isHandlersPath('.dvala-playground/handlers.dvala')).toBe(true)
  })
  it('returns false for sibling buffers in the playground folder', () => {
    expect(isHandlersPath('.dvala-playground/scratch.dvala')).toBe(false)
    expect(isHandlersPath('.dvala-playground/snapshots/x.json')).toBe(false)
  })
  it('returns false for unrelated workspace files', () => {
    expect(isHandlersPath('handlers.dvala')).toBe(false)
    expect(isHandlersPath('foo.dvala')).toBe(false)
  })
})

describe('ensureHandlersFile', () => {
  it('creates an empty handlers file when none exists', () => {
    const created = ensureHandlersFile()
    expect(created).toBe(true)
    const file = getHandlersFile()
    expect(file?.path).toBe(HANDLERS_FILE_PATH)
    expect(file?.code).toBe('')
    expect(file?.context).toBe('')
  })
  it('is idempotent — returns false on subsequent calls and preserves contents', () => {
    ensureHandlersFile()
    setHandlersCode('let h = handler @my.eff(x) -> resume(x) end')
    expect(ensureHandlersFile()).toBe(false)
    expect(getHandlersCode()).toBe('let h = handler @my.eff(x) -> resume(x) end')
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
    ensureHandlersFile()
    expect(getWorkspaceFiles()).toHaveLength(2)
  })
})

describe('getHandlersCode (uninitialized)', () => {
  it('returns empty string before ensureHandlersFile runs', () => {
    expect(getHandlersCode()).toBe('')
    expect(getHandlersFile()).toBeUndefined()
  })
})

describe('setHandlersCode', () => {
  it('writes code through and updates updatedAt', async () => {
    ensureHandlersFile()
    const t0 = getHandlersFile()!.updatedAt
    await new Promise(resolve => setTimeout(resolve, 2))
    setHandlersCode('changed')
    const t1 = getHandlersFile()!.updatedAt
    expect(getHandlersCode()).toBe('changed')
    expect(t1).toBeGreaterThan(t0)
  })
  it('creates the handlers file on first write if ensureHandlersFile was skipped', () => {
    expect(getHandlersFile()).toBeUndefined()
    setHandlersCode('let h = handler @x() -> resume(0) end')
    expect(getHandlersFile()?.path).toBe(HANDLERS_FILE_PATH)
    expect(getHandlersCode()).toBe('let h = handler @x() -> resume(0) end')
  })
})
