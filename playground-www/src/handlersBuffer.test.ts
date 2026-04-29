import { beforeEach, describe, expect, it } from 'vitest'
import { createDvala } from '../../src/createDvala'
import { clearAllFiles, getWorkspaceFiles, setWorkspaceFiles } from './fileStorage'
import {
  ensureHandlersFile,
  getHandlersCode,
  getHandlersFile,
  HANDLERS_FILE_PATH,
  isHandlersPath,
  setHandlersCode,
  wrapWithBoundaryHandler,
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

describe('wrapWithBoundaryHandler', () => {
  it('returns the user code unchanged when the handlers buffer is empty', () => {
    ensureHandlersFile()
    expect(wrapWithBoundaryHandler('1 + 1')).toBe('1 + 1')
  })
  it('returns the user code unchanged when the handlers buffer is whitespace-only', () => {
    setHandlersCode('   \n  \t  \n')
    expect(wrapWithBoundaryHandler('1 + 1')).toBe('1 + 1')
  })
  it('wraps the user code when the handlers buffer is non-empty', () => {
    setHandlersCode('handler @x(v) -> resume(v * 2) end')
    const wrapped = wrapWithBoundaryHandler('perform(@x, 21)')
    expect(wrapped).toContain('let __playgroundBoundary__ = do')
    expect(wrapped).toContain('handler @x(v) -> resume(v * 2) end')
    expect(wrapped).toContain('do with __playgroundBoundary__;')
    expect(wrapped).toContain('perform(@x, 21)')
  })

  // End-to-end through the engine: the wrapped programs must actually run
  // and produce the expected results. These tests are the contract — the
  // string-shape tests above are just guards against accidental drift.
  describe('end-to-end through createDvala', () => {
    const dvala = createDvala()
    const runWrapped = (userCode: string): unknown => dvala.run(wrapWithBoundaryHandler(userCode))

    it('a single-handler buffer handles effects in user code', () => {
      setHandlersCode('handler @x(v) -> resume(v * 2) end')
      expect(runWrapped('perform(@x, 21)')).toBe(42)
    })

    it('a multi-statement handlers buffer (last expression is the handler)', () => {
      setHandlersCode('let bonus = 100;\nhandler @x(v) -> resume(v + bonus) end')
      expect(runWrapped('perform(@x, 5)')).toBe(105)
    })

    it('the empty buffer leaves user code unaffected (verified end-to-end)', () => {
      ensureHandlersFile()
      expect(runWrapped('1 + 2')).toBe(3)
    })

    it('a user-side `do with` shadows the boundary within its scope', () => {
      setHandlersCode('handler @x(v) -> resume(v * 10) end')
      const result = runWrapped('let inner = handler @x(v) -> resume(v + 1) end;\ndo with inner; perform(@x, 5) end')
      // Inner handler wins → 5 + 1 = 6 (not 50 from the boundary).
      expect(result).toBe(6)
    })

    it('user code that does not use the boundary effect runs normally', () => {
      setHandlersCode('handler @x(v) -> resume(v * 2) end')
      expect(runWrapped('1 + 2 + 3')).toBe(6)
    })
  })
})
