// Tree shape derived from the playground's flat list of `WorkspaceFile.path`
// values. Folders are pure derivation — they exist iff at least one file's
// path is prefixed by them — so empty folders are not representable today.
//
// The renderer in `scripts/files.ts` consumes this shape; keeping it pure
// makes the rendering logic easier to test.

import { filenameFromPath, splitPath } from './filePath'
import type { WorkspaceFile } from './fileStorage'

export type TreeNode =
  | {
      kind: 'folder'
      /** Absolute path of the folder, e.g. `"a/b"`. */
      path: string
      /** Display label — last segment of the folder path. */
      name: string
      /** Children sorted folders-before-files, then alphabetical by display name. */
      children: TreeNode[]
    }
  | {
      kind: 'file'
      file: WorkspaceFile
    }

/** Build the tree. The order is folders-before-files at each level, alphabetical within each group. */
export function buildFileTree(files: WorkspaceFile[]): TreeNode[] {
  const root: TreeNode[] = []
  for (const file of files) {
    insertFile(root, file, splitPath(file.path), '')
  }
  sortNodes(root)
  return root
}

function insertFile(siblings: TreeNode[], file: WorkspaceFile, segments: string[], parentPath: string): void {
  if (segments.length === 1) {
    siblings.push({ kind: 'file', file })
    return
  }
  const folderName = segments[0]!
  const folderPath = parentPath === '' ? folderName : `${parentPath}/${folderName}`
  let folder = siblings.find(n => n.kind === 'folder' && n.path === folderPath) as
    | (TreeNode & { kind: 'folder' })
    | undefined
  if (!folder) {
    folder = { kind: 'folder', path: folderPath, name: folderName, children: [] }
    siblings.push(folder)
  }
  insertFile(folder.children, file, segments.slice(1), folderPath)
}

function sortNodes(nodes: TreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
    const aName = a.kind === 'folder' ? a.name : filenameFromPath(a.file.path)
    const bName = b.kind === 'folder' ? b.name : filenameFromPath(b.file.path)
    return aName.localeCompare(bName)
  })
  for (const node of nodes) {
    if (node.kind === 'folder') sortNodes(node.children)
  }
}
