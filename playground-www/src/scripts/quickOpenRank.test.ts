import { describe, expect, it } from 'vitest'
import type { SavedFile } from '../fileStorage'
import { rankQuickOpen, rankSavedFiles } from './quickOpenRank'

const file = (id: string, path: string): SavedFile => ({
  id,
  path,
  code: '',
  context: '',
  createdAt: 0,
  updatedAt: 0,
  locked: false,
})

describe('rankQuickOpen', () => {
  it('returns 0 for an empty query (no filtering)', () => {
    expect(rankQuickOpen('', 'foo.dvala')).toBe(0)
  })

  it('returns null when characters are missing', () => {
    expect(rankQuickOpen('xyz', 'foo.dvala')).toBeNull()
  })

  it('matches a subsequence of characters in order', () => {
    expect(rankQuickOpen('foo', 'foo.dvala')).not.toBeNull()
    expect(rankQuickOpen('fda', 'foo.dvala')).not.toBeNull() // f-(oo.)d-(v)a-(la)
  })

  it('is case-insensitive', () => {
    expect(rankQuickOpen('FOO', 'foo.dvala')).not.toBeNull()
    expect(rankQuickOpen('foo', 'FOO.DVALA')).not.toBeNull()
  })

  it('rejects out-of-order characters', () => {
    // `oof` cannot be matched in order against `foo.dvala` (no second `f`).
    expect(rankQuickOpen('oof', 'foo.dvala')).toBeNull()
  })

  it('scores tighter character runs lower (better) than scattered matches', () => {
    const tight = rankQuickOpen('foo', 'foo.dvala')!
    const scattered = rankQuickOpen('foo', 'far_oo_only')!
    expect(tight).toBeLessThan(scattered)
  })

  it('prefers basename matches over folder matches', () => {
    // 'utils' inside the basename should outrank 'utils' inside the folder.
    const inBasename = rankQuickOpen('utils', 'src/utils.dvala')!
    const inFolder = rankQuickOpen('utils', 'utils/main.dvala')!
    expect(inBasename).toBeLessThan(inFolder)
  })

  it('breaks ties with shorter paths winning slightly', () => {
    const shorter = rankQuickOpen('foo', 'foo.dvala')!
    const longer = rankQuickOpen('foo', 'foo.dvala-extra-tail')!
    expect(shorter).toBeLessThan(longer)
  })
})

describe('rankSavedFiles', () => {
  const files: SavedFile[] = [
    file('a', 'main.dvala'),
    file('b', 'lib/util.dvala'),
    file('c', 'examples/foo.dvala'),
    file('d', 'utils/helper.dvala'),
  ]

  it('returns every file in insertion order when query is empty', () => {
    const ranked = rankSavedFiles('', files)
    expect(ranked.map(r => r.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('drops non-matching files and ranks matches', () => {
    const ranked = rankSavedFiles('util', files)
    // Both 'lib/util.dvala' (basename match) and 'utils/helper.dvala'
    // (folder match) match. The basename match should rank first.
    expect(ranked.map(r => r.id)).toEqual(['b', 'd'])
  })

  it('produces label + detail split on the last `/`', () => {
    const ranked = rankSavedFiles('util', files)
    const util = ranked.find(r => r.id === 'b')!
    expect(util.label).toBe('util.dvala')
    expect(util.detail).toBe('lib')
  })

  it('keeps detail empty for root-level files', () => {
    const ranked = rankSavedFiles('main', files)
    expect(ranked[0]?.detail).toBe('')
  })

  it('returns an empty list for queries with no matches', () => {
    expect(rankSavedFiles('zzz', files)).toEqual([])
  })
})
