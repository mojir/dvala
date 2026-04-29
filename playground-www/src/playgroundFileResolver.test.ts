import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fileStorage from './fileStorage'
import type { WorkspaceFile } from './fileStorage'
import { playgroundFileResolver, resolvePlaygroundPath } from './playgroundFileResolver'

const file = (path: string, code = ''): WorkspaceFile => ({
  id: path,
  path,
  code,
  context: '',
  createdAt: 0,
  updatedAt: 0,
  locked: false,
})

describe('resolvePlaygroundPath', () => {
  it('resolves a sibling import at the root', () => {
    expect(resolvePlaygroundPath('', './foo')).toBe('foo')
  })

  it('resolves a sibling import inside a folder', () => {
    expect(resolvePlaygroundPath('examples', './foo')).toBe('examples/foo')
  })

  it('walks up via `..` segments', () => {
    expect(resolvePlaygroundPath('a/b/c', '../foo')).toBe('a/b/foo')
    expect(resolvePlaygroundPath('a/b', '../../foo')).toBe('foo')
  })

  it('throws when `..` walks past the workspace root', () => {
    expect(() => resolvePlaygroundPath('a', '../../foo')).toThrow(/escapes workspace root/)
    expect(() => resolvePlaygroundPath('', '../foo')).toThrow(/escapes workspace root/)
  })

  it('treats a leading `/` as absolute (relative to workspace root)', () => {
    expect(resolvePlaygroundPath('a/b', '/foo')).toBe('foo')
    expect(resolvePlaygroundPath('a/b', '/x/y')).toBe('x/y')
  })

  it('collapses `.` and empty segments', () => {
    expect(resolvePlaygroundPath('a', './b/./c')).toBe('a/b/c')
    expect(resolvePlaygroundPath('', 'a//b')).toBe('a/b')
  })
})

describe('playgroundFileResolver', () => {
  let restoreFiles: (() => void) | null = null

  function withFiles(files: WorkspaceFile[]): void {
    const spy = vi.spyOn(fileStorage, 'getWorkspaceFiles').mockReturnValue(files)
    restoreFiles = () => spy.mockRestore()
  }

  beforeEach(() => {
    restoreFiles = null
  })

  afterEach(() => {
    restoreFiles?.()
  })

  it('returns the file content when an exact match exists', () => {
    withFiles([file('util.dvala', 'EXACT')])
    expect(playgroundFileResolver('./util.dvala', '')).toBe('EXACT')
  })

  it('falls back to the .dvala suffix when the import omits it', () => {
    withFiles([file('util.dvala', 'WITH-EXT')])
    expect(playgroundFileResolver('./util', '')).toBe('WITH-EXT')
  })

  it("resolves imports relative to the importing file's folder", () => {
    withFiles([file('examples/util.dvala', 'NESTED')])
    expect(playgroundFileResolver('./util', 'examples')).toBe('NESTED')
  })

  it('resolves cross-folder imports through `..`', () => {
    withFiles([file('lib/math.dvala', 'MATH')])
    expect(playgroundFileResolver('../lib/math', 'tests')).toBe('MATH')
  })

  it('throws a useful error when no file matches', () => {
    withFiles([file('foo.dvala', 'A')])
    expect(() => playgroundFileResolver('./bar', '')).toThrow(/File not found/)
    expect(() => playgroundFileResolver('./bar', '')).toThrow(/looked for 'bar' and 'bar.dvala'/)
  })
})
