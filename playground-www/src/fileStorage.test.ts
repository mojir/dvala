import { beforeEach, describe, expect, it } from 'vitest'
import { clearAllFiles, getSavedFiles, normalizeSavedFileName, setSavedFiles, stripDvalaSuffix } from './fileStorage'

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
