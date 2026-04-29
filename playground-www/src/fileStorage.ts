import { ensureDvalaSuffix, filenameFromPath, normalizeFilePath } from './filePath'
import { getDb, idbClear, idbGet, idbPut, SAVED_FILES_STORE } from './idb'

// Single source of truth for a workspace file. `path` is the canonical
// identifier — it carries both the folder structure (split on `/`) and the
// display name (last segment). Folders themselves aren't stored; they're
// derived from the set of file paths.
export interface WorkspaceFile {
  id: string
  path: string
  code: string
  context: string
  createdAt: number
  updatedAt: number
  locked: boolean
}

// Re-exported for callers that still talk in terms of "filename" rather than
// path; saves them an extra import. New code should reach for `filePath.ts`.
export { filenameFromPath, folderFromPath, normalizeFilePath, stripDvalaSuffix } from './filePath'

const STATE_KEY = 'state'

let fileCache: WorkspaceFile[] = []

/**
 * Backwards-compat for callers that still think in terms of "name." Returns
 * the last path segment. New code should call `filenameFromPath` directly.
 */
export function fileDisplayName(file: WorkspaceFile): string {
  return filenameFromPath(file.path)
}

/**
 * Take a user-supplied filename (no folder) and produce a normalised path
 * value suitable for storing on `WorkspaceFile.path`. Callers should pass
 * just the basename — the function preserves the `.dvala` suffix contract.
 */
export function normalizeWorkspaceFileName(name: string): string {
  return ensureDvalaSuffix(name)
}

function normalizeFiles(entries: WorkspaceFile[]): { entries: WorkspaceFile[]; changed: boolean } {
  let changed = false
  const usedIds = new Set<string>()
  const usedPaths = new Set<string>()

  const normalized: WorkspaceFile[] = []
  for (const entry of entries) {
    const existingId = typeof entry.id === 'string' ? entry.id.trim() : ''
    const needsNewId = existingId === '' || usedIds.has(existingId)
    const id = needsNewId ? crypto.randomUUID() : existingId
    const cleaned = normalizeFilePath(entry.path)
    if (cleaned === null) {
      // Invalid path — drop the entry rather than persist garbage. The
      // schema upgrade below already wipes pre-`path` data, so this branch
      // exists only to defend against hand-edited blobs sneaking in.
      changed = true
      continue
    }
    // Disambiguate path collisions by appending ` (n)` to the basename.
    let path = cleaned
    if (usedPaths.has(path)) {
      path = uniqueFilePath(cleaned, usedPaths)
      changed = true
    }
    usedIds.add(id)
    usedPaths.add(path)
    if (id !== entry.id) changed = true
    if (path !== entry.path) changed = true
    normalized.push(id === entry.id && path === entry.path ? entry : { ...entry, id, path })
  }

  return { entries: normalized, changed }
}

/** Append ` (n)` to the basename until the resulting path is free. */
export function uniqueFilePath(path: string, taken: Set<string>): string {
  if (!taken.has(path)) return path
  const slash = path.lastIndexOf('/')
  const dir = slash === -1 ? '' : path.slice(0, slash + 1)
  const base = slash === -1 ? path : path.slice(slash + 1)
  const dot = base.lastIndexOf('.')
  const stem = dot === -1 ? base : base.slice(0, dot)
  const ext = dot === -1 ? '' : base.slice(dot)
  for (let n = 2; ; n++) {
    const candidate = `${dir}${stem} (${n})${ext}`
    if (!taken.has(candidate)) return candidate
  }
}

/**
 * Pick a unique filename within `folder`. Disambiguates by appending
 * ` (n)` to the basename — folder structure is preserved. Used by file
 * creation paths (new file, duplicate, import) so the caller doesn't have
 * to assemble the full path itself.
 */
export function uniquePathInFolder(folder: string, filename: string, files: WorkspaceFile[]): string {
  const intendedPath = folder === '' ? ensureDvalaSuffix(filename) : `${folder}/${ensureDvalaSuffix(filename)}`
  const taken = new Set(files.map(f => f.path))
  return uniqueFilePath(intendedPath, taken)
}

export function initFiles(): Promise<void> {
  return idbGet<WorkspaceFile[]>(SAVED_FILES_STORE, STATE_KEY)
    .then(entries => {
      const normalized = normalizeFiles(entries ?? [])
      fileCache = normalized.entries
      if (normalized.changed && getDb()) idbPut(SAVED_FILES_STORE, STATE_KEY, normalized.entries)
    })
    .catch(() => {
      fileCache = []
    })
}

export function getWorkspaceFiles(): WorkspaceFile[] {
  return fileCache
}

export function setWorkspaceFiles(entries: WorkspaceFile[]): void {
  const normalized = normalizeFiles(entries)
  fileCache = normalized.entries
  if (getDb()) idbPut(SAVED_FILES_STORE, STATE_KEY, normalized.entries)
}

export function clearAllFiles(): void {
  fileCache = []
  if (getDb()) idbClear(SAVED_FILES_STORE)
}

// FileBackend interface — Phase 3 (CLI mode + BridgeBackend) introduces this
// seam to swap IndexedDB-backed storage for an HTTP/SSE bridge. Until then
// there's only one implementation, so an explicit interface is dead weight
// (knip rejects unused exports). This file IS the IndexedDB backend; Phase
// 3 will extract the interface, add `BridgeBackend`, and route consumers
// through a runtime-selected instance.
