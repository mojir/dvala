import { describe, expect, it } from 'vitest'
import type { WorkspaceFile } from './fileStorage'
import { buildFileTree } from './fileTree'

const file = (id: string, path: string): WorkspaceFile => ({
  id,
  path,
  code: '',
  context: '',
  createdAt: 0,
  updatedAt: 0,
  locked: false,
})

describe('buildFileTree', () => {
  it('returns an empty tree when there are no files', () => {
    expect(buildFileTree([])).toEqual([])
  })

  it('puts root files at the top level', () => {
    const tree = buildFileTree([file('a', 'foo.dvala'), file('b', 'bar.dvala')])
    expect(tree).toHaveLength(2)
    expect(tree[0]).toMatchObject({ kind: 'file', file: { path: 'bar.dvala' } })
    expect(tree[1]).toMatchObject({ kind: 'file', file: { path: 'foo.dvala' } })
  })

  it('groups files into folders derived from the path', () => {
    const tree = buildFileTree([file('a', 'examples/foo.dvala'), file('b', 'examples/bar.dvala')])
    expect(tree).toHaveLength(1)
    expect(tree[0]).toMatchObject({ kind: 'folder', path: 'examples', name: 'examples' })
    const folder = tree[0]!
    if (folder.kind !== 'folder') throw new Error('expected folder')
    expect(folder.children.map(c => (c.kind === 'file' ? c.file.path : c.path))).toEqual([
      'examples/bar.dvala',
      'examples/foo.dvala',
    ])
  })

  it('handles deeply nested paths', () => {
    const tree = buildFileTree([file('a', 'a/b/c/foo.dvala')])
    expect(tree).toHaveLength(1)
    const a = tree[0]!
    if (a.kind !== 'folder') throw new Error('expected folder a')
    expect(a.path).toBe('a')
    if (a.children[0]?.kind !== 'folder') throw new Error('expected folder b')
    expect(a.children[0].path).toBe('a/b')
    if (a.children[0].children[0]?.kind !== 'folder') throw new Error('expected folder c')
    expect(a.children[0].children[0].path).toBe('a/b/c')
  })

  it('puts folders before files at each level', () => {
    const tree = buildFileTree([file('a', 'zfile.dvala'), file('b', 'afolder/inside.dvala')])
    expect(tree[0]).toMatchObject({ kind: 'folder', path: 'afolder' })
    expect(tree[1]).toMatchObject({ kind: 'file', file: { path: 'zfile.dvala' } })
  })

  it('sorts siblings alphabetically by display name within each kind', () => {
    const tree = buildFileTree([
      file('a', 'z.dvala'),
      file('b', 'a.dvala'),
      file('c', 'm/z.dvala'),
      file('d', 'm/a.dvala'),
    ])
    expect(tree.map(n => (n.kind === 'file' ? n.file.path : n.path))).toEqual(['m', 'a.dvala', 'z.dvala'])
    const m = tree[0]!
    if (m.kind !== 'folder') throw new Error('expected folder m')
    expect(m.children.map(n => (n.kind === 'file' ? n.file.path : n.path))).toEqual(['m/a.dvala', 'm/z.dvala'])
  })
})
