import { describe, expect, it } from 'vitest'
import type { WorkspaceFile } from '../fileStorage'
import { rankQuickOpen, rankWorkspaceFiles } from './quickOpenRank'

const file = (id: string, path: string): WorkspaceFile => ({
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

describe('rankWorkspaceFiles', () => {
  const files: WorkspaceFile[] = [
    file('a', 'main.dvala'),
    file('b', 'lib/util.dvala'),
    file('c', 'examples/foo.dvala'),
    file('d', 'utils/helper.dvala'),
  ]

  it('returns every file in insertion order when query is empty', () => {
    const ranked = rankWorkspaceFiles('', files)
    expect(ranked.map(r => r.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('drops non-matching files and ranks matches', () => {
    const ranked = rankWorkspaceFiles('util', files)
    // Both 'lib/util.dvala' (basename match) and 'utils/helper.dvala'
    // (folder match) match. The basename match should rank first.
    expect(ranked.map(r => r.id)).toEqual(['b', 'd'])
  })

  it('produces label + detail split on the last `/`', () => {
    const ranked = rankWorkspaceFiles('util', files)
    const util = ranked.find(r => r.id === 'b')!
    expect(util.label).toBe('util.dvala')
    expect(util.detail).toBe('lib')
  })

  it('keeps detail empty for root-level files', () => {
    const ranked = rankWorkspaceFiles('main', files)
    expect(ranked[0]?.detail).toBe('')
  })

  it('returns an empty list for queries with no matches', () => {
    expect(rankWorkspaceFiles('zzz', files)).toEqual([])
  })

  it('skips files under the reserved .dvala-playground/ folder', () => {
    // Phase 1.5 step 23b: scratch / handlers / snapshots aren't pickable
    // through Quick Open — they're reachable through their pinned virtual
    // tree entries and the Snapshots side tab.
    const all: WorkspaceFile[] = [
      file('a', 'main.dvala'),
      file('b', '.dvala-playground/scratch.dvala'),
      file('c', '.dvala-playground/handlers.dvala'),
    ]
    expect(rankWorkspaceFiles('', all).map(r => r.id)).toEqual(['a'])
    expect(rankWorkspaceFiles('scratch', all)).toEqual([])
    expect(rankWorkspaceFiles('handlers', all)).toEqual([])
  })
})
