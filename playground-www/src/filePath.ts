// File-path helpers for the playground's tree-shaped file model.
//
// A path is a forward-slash-separated string that ends in a `.dvala`
// filename. Folders are derived (no separate folder records) — they exist
// iff at least one file's path is prefixed by them. Empty folders are not
// representable.
//
// Examples:
//   "foo.dvala"                — root
//   "examples/foo.dvala"       — one folder deep
//   "a/b/c/foo.dvala"          — three folders deep
//
// Forbidden: leading slash, trailing slash, double slashes, empty segments,
// `..` segments. Filenames must end in `.dvala`.

export const DVALA_FILE_SUFFIX = '.dvala'

/** Last `/`-separated segment of a path (the file's display name). */
export function filenameFromPath(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx === -1 ? path : path.slice(idx + 1)
}

/** Folder portion of a path, without the trailing slash. Empty for root files. */
export function folderFromPath(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx === -1 ? '' : path.slice(0, idx)
}

/** Split a path into segments. `"a/b/c.dvala"` → `["a", "b", "c.dvala"]`. */
export function splitPath(path: string): string[] {
  return path.split('/')
}

/** Strip the `.dvala` suffix from a filename (case-insensitive). */
export function stripDvalaSuffix(name: string): string {
  return name.trim().replace(/\.dvala$/i, '')
}

/** Add the `.dvala` suffix to a filename if it isn't already there. */
export function ensureDvalaSuffix(name: string): string {
  return `${stripDvalaSuffix(name)}${DVALA_FILE_SUFFIX}`
}

/**
 * Normalise a path string. Trims surrounding whitespace, collapses repeated
 * slashes, drops a leading slash, ensures the basename ends in `.dvala`,
 * and rejects `..` segments. Returns `null` for paths that can't be
 * cleaned up into a valid file path (empty, segment-only `..`, etc.).
 */
export function normalizeFilePath(rawPath: string): string | null {
  const trimmed = rawPath.trim()
  if (trimmed === '') return null
  // Collapse repeated slashes; drop leading slash.
  const segments = trimmed.split('/').filter(seg => seg !== '')
  if (segments.length === 0) return null
  if (segments.some(seg => seg === '..')) return null
  // Apply the suffix to the basename only.
  const lastIdx = segments.length - 1
  segments[lastIdx] = ensureDvalaSuffix(segments[lastIdx]!)
  return segments.join('/')
}
