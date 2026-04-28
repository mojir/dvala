import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearAllFiles,
  getSavedFiles,
  normalizeSavedFileName,
  setSavedFiles,
  stripDvalaSuffix,
  uniqueFilePath,
  uniquePathInFolder,
} from './fileStorage'
import type { SavedFile } from './fileStorage'

const file = (id: string, path: string): SavedFile => ({
  id,
  path,
  code: '',
  context: '',
  createdAt: 0,
  updatedAt: 0,
  locked: false,
})

describe('normalizeSavedFileName', () => {
  it('should append .dvala when it is missing', () => {
    expect(normalizeSavedFileName('example')).toBe('example.dvala')
  })

  it('should canonicalize the suffix casing', () => {
    expect(normalizeSavedFileName('example.DVALA')).toBe('example.dvala')
  })
})

describe('setSavedFiles', () => {
  beforeEach(() => {
    clearAllFiles()
  })

  it('should persist saved file paths with a .dvala suffix', () => {
    setSavedFiles([
      {
        id: 'file-1',
        path: 'example',
        code: '1 + 1',
        context: '',
        createdAt: 1,
        updatedAt: 1,
        locked: false,
      },
    ])

    expect(getSavedFiles()[0]?.path).toBe('example.dvala')
  })

  it('should remove the suffix before re-appending the canonical one', () => {
    expect(stripDvalaSuffix('example.dvala')).toBe('example')
    expect(stripDvalaSuffix('example.DVALA')).toBe('example')
  })

  it('should assign a new id when two entries share the same id', () => {
    setSavedFiles([
      { id: 'dup-id', path: 'first', code: '', context: '', createdAt: 1, updatedAt: 1, locked: false },
      { id: 'dup-id', path: 'second', code: '', context: '', createdAt: 2, updatedAt: 2, locked: false },
    ])

    const files = getSavedFiles()
    expect(files).toHaveLength(2)
    expect(files[0]!.id).not.toBe(files[1]!.id)
  })

  it('should disambiguate path collisions by appending a counter to the basename', () => {
    setSavedFiles([
      { id: 'a', path: 'foo.dvala', code: '', context: '', createdAt: 1, updatedAt: 1, locked: false },
      { id: 'b', path: 'foo.dvala', code: '', context: '', createdAt: 2, updatedAt: 2, locked: false },
      { id: 'c', path: 'examples/bar.dvala', code: '', context: '', createdAt: 3, updatedAt: 3, locked: false },
      { id: 'd', path: 'examples/bar.dvala', code: '', context: '', createdAt: 4, updatedAt: 4, locked: false },
    ])

    const paths = getSavedFiles().map(f => f.path)
    expect(paths).toEqual(['foo.dvala', 'foo (2).dvala', 'examples/bar.dvala', 'examples/bar (2).dvala'])
  })

  it('should preserve folder paths verbatim when valid', () => {
    setSavedFiles([{ id: 'a', path: 'a/b/c.dvala', code: '', context: '', createdAt: 1, updatedAt: 1, locked: false }])
    expect(getSavedFiles()[0]?.path).toBe('a/b/c.dvala')
  })

  it('should drop entries with invalid paths', () => {
    setSavedFiles([
      { id: 'a', path: 'foo.dvala', code: '', context: '', createdAt: 1, updatedAt: 1, locked: false },
      { id: 'b', path: '../escape.dvala', code: '', context: '', createdAt: 2, updatedAt: 2, locked: false },
    ])
    expect(getSavedFiles().map(f => f.path)).toEqual(['foo.dvala'])
  })
})

describe('uniqueFilePath', () => {
  it('returns the input unchanged when nothing collides', () => {
    expect(uniqueFilePath('foo.dvala', new Set())).toBe('foo.dvala')
  })

  it('appends ` (n)` to the basename for the first collision', () => {
    expect(uniqueFilePath('foo.dvala', new Set(['foo.dvala']))).toBe('foo (2).dvala')
  })

  it('skips already-occupied counters until it finds a free one', () => {
    const taken = new Set(['foo.dvala', 'foo (2).dvala', 'foo (3).dvala'])
    expect(uniqueFilePath('foo.dvala', taken)).toBe('foo (4).dvala')
  })

  it('preserves the folder portion of the path', () => {
    expect(uniqueFilePath('a/b/foo.dvala', new Set(['a/b/foo.dvala']))).toBe('a/b/foo (2).dvala')
  })

  it('handles paths with no extension', () => {
    expect(uniqueFilePath('foo', new Set(['foo']))).toBe('foo (2)')
  })
})

describe('uniquePathInFolder', () => {
  it('returns the path verbatim when free at the root', () => {
    expect(uniquePathInFolder('', 'foo', [])).toBe('foo.dvala')
  })

  it('appends ` (n)` when a sibling already has the name', () => {
    expect(uniquePathInFolder('', 'foo', [file('a', 'foo.dvala')])).toBe('foo (2).dvala')
  })

  it('only considers files in the same folder when checking collisions', () => {
    // `foo.dvala` exists at the root but not in `examples/`, so the request
    // for `examples/foo` returns the unmodified path.
    expect(uniquePathInFolder('examples', 'foo', [file('a', 'foo.dvala')])).toBe('examples/foo.dvala')
  })

  it('respects collisions inside the target folder', () => {
    expect(uniquePathInFolder('examples', 'foo', [file('a', 'foo.dvala'), file('b', 'examples/foo.dvala')])).toBe(
      'examples/foo (2).dvala',
    )
  })

  it('appends the .dvala suffix when missing', () => {
    expect(uniquePathInFolder('examples', 'bar', [])).toBe('examples/bar.dvala')
  })
})
