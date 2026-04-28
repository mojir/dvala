import { describe, expect, it } from 'vitest'
import {
  ensureDvalaSuffix,
  filenameFromPath,
  folderFromPath,
  normalizeFilePath,
  splitPath,
  stripDvalaSuffix,
} from './filePath'

describe('filenameFromPath', () => {
  it('returns the path itself when there is no slash', () => {
    expect(filenameFromPath('foo.dvala')).toBe('foo.dvala')
  })
  it('returns the last segment when nested', () => {
    expect(filenameFromPath('a/b/c.dvala')).toBe('c.dvala')
  })
  it('handles the empty string', () => {
    expect(filenameFromPath('')).toBe('')
  })
})

describe('folderFromPath', () => {
  it('returns the empty string for root files', () => {
    expect(folderFromPath('foo.dvala')).toBe('')
  })
  it('returns the parent folder for nested files', () => {
    expect(folderFromPath('a/b/c.dvala')).toBe('a/b')
  })
})

describe('splitPath', () => {
  it('splits on slashes', () => {
    expect(splitPath('a/b/c.dvala')).toEqual(['a', 'b', 'c.dvala'])
  })
  it('returns a single segment for root files', () => {
    expect(splitPath('foo.dvala')).toEqual(['foo.dvala'])
  })
})

describe('stripDvalaSuffix / ensureDvalaSuffix', () => {
  it('strips a .dvala suffix case-insensitively', () => {
    expect(stripDvalaSuffix('foo.dvala')).toBe('foo')
    expect(stripDvalaSuffix('foo.DVALA')).toBe('foo')
    expect(stripDvalaSuffix('foo')).toBe('foo')
  })
  it('adds the suffix when missing and is idempotent when present', () => {
    expect(ensureDvalaSuffix('foo')).toBe('foo.dvala')
    expect(ensureDvalaSuffix('foo.dvala')).toBe('foo.dvala')
    expect(ensureDvalaSuffix('  foo  ')).toBe('foo.dvala')
  })
})

describe('normalizeFilePath', () => {
  it('returns null for empty / whitespace-only input', () => {
    expect(normalizeFilePath('')).toBeNull()
    expect(normalizeFilePath('   ')).toBeNull()
    expect(normalizeFilePath('/')).toBeNull()
  })
  it('drops a leading slash', () => {
    expect(normalizeFilePath('/foo.dvala')).toBe('foo.dvala')
  })
  it('collapses repeated slashes', () => {
    expect(normalizeFilePath('a//b///c.dvala')).toBe('a/b/c.dvala')
  })
  it('rejects `..` segments', () => {
    expect(normalizeFilePath('a/../b.dvala')).toBeNull()
    expect(normalizeFilePath('../foo.dvala')).toBeNull()
  })
  it('appends the .dvala suffix to the basename only', () => {
    expect(normalizeFilePath('a/b/c')).toBe('a/b/c.dvala')
    expect(normalizeFilePath('foo')).toBe('foo.dvala')
  })
  it('preserves an existing .dvala suffix', () => {
    expect(normalizeFilePath('a/foo.dvala')).toBe('a/foo.dvala')
  })
  it('strips trailing whitespace', () => {
    expect(normalizeFilePath('  foo  ')).toBe('foo.dvala')
  })
  it("treats a trailing slash as if it weren't there (no empty folders)", () => {
    // `"foo/"` collapses to `["foo"]` after the empty-segment filter, then the
    // basename gets the .dvala suffix. The result is a root-level file, not a
    // folder named `foo` — folders are only meaningful when something lives
    // inside them.
    expect(normalizeFilePath('foo/')).toBe('foo.dvala')
    expect(normalizeFilePath('examples/')).toBe('examples.dvala')
  })
})
