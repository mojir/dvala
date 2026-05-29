/**
 * Node-only wrapper around `WorkspaceIndex` that handles filesystem I/O.
 *
 * `WorkspaceIndex` itself is pure (no `fs` imports) so it can run in a Web
 * Worker. CLI and VS Code consumers pay the small price of going through
 * this wrapper to recover the convenience of "give me a file path, the
 * index does the rest." Browser-side callers build their own thin wrapper
 * around `WorkspaceIndex` using their preferred storage abstraction
 * (`FileBackend`, in-memory map, etc.).
 *
 * **Not exported via `dvala/internal`.** This module imports `node:fs`,
 * which would break the playground worker bundle. CLI surfaces import it
 * directly.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import type { FileSymbols } from './types'
import type { ResolveImport, WorkspaceIndex } from './WorkspaceIndex'

/**
 * Default filesystem-based import resolver. Tries the exact path, then
 * appends `.dvala` if the bare path doesn't exist. Mirrors the behavior
 * the old `WorkspaceIndex.resolveImportPath` had inlined.
 *
 * Computes its own base directory from `fromFile` so `WorkspaceIndex` can
 * stay free of any `path` import.
 */
export const nodeResolveImport: ResolveImport = (rawPath, fromFile) => {
  const resolved = path.resolve(path.dirname(fromFile), rawPath)
  if (fs.existsSync(resolved)) return resolved
  const withExt = `${resolved}.dvala`
  if (fs.existsSync(withExt)) return withExt
  return null
}

/**
 * Read a `.dvala` file from disk and feed it into the workspace index.
 * Returns the file's symbols, or `null` when the file can't be read
 * (missing, permission denied, etc.) — in which case the cache entry is
 * cleared so a stale prior entry doesn't keep haunting lookups.
 */
export function loadFile(workspace: WorkspaceIndex, filePath: string): FileSymbols | null {
  const absolutePath = path.resolve(filePath)
  let source: string
  try {
    source = fs.readFileSync(absolutePath, 'utf-8')
  } catch {
    workspace.invalidateFile(absolutePath)
    return null
  }
  return workspace.updateFile(absolutePath, source, nodeResolveImport)
}

/**
 * Eagerly index every `.dvala` file under `rootPath` (recursively).
 *
 * Required by transitive-rename correctness: without this, a rename
 * initiated from a file whose re-export chain includes files never opened
 * in the editor would silently drop the un-indexed subtree.
 *
 * Skips `node_modules`, `.git`, and dotfile directories. Does not honour
 * `.gitignore` today; if that becomes important we can plug in a matcher.
 *
 * Re-walks every call — callers wanting one-shot semantics should track
 * scanned roots themselves.
 */
export function indexWorkspace(workspace: WorkspaceIndex, rootPath: string): void {
  const absoluteRoot = path.resolve(rootPath)
  walkDvalaFiles(absoluteRoot, filePath => {
    loadFile(workspace, filePath)
  })
}

/**
 * Recursively visit every `.dvala` file under `dir`, invoking `visit(filePath)`
 * for each. Skips `node_modules`, `.git`, and dotfile directories.
 */
function walkDvalaFiles(dir: string, visit: (filePath: string) => void): void {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    if (entry.name === 'node_modules') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkDvalaFiles(full, visit)
    } else if (entry.isFile() && entry.name.endsWith('.dvala')) {
      visit(full)
    }
  }
}
