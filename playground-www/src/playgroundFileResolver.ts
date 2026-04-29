// File resolver that backs Dvala's `import("./foo")` against the playground's
// IndexedDB-stored files. Wires into `createDvala`'s `fileResolver` option
// so multi-file workspaces in the playground execute the same way they would
// via `dvala run` — the divergence flagged in the Phase 0 spike of
// `design/active/2026-04-26_playground-monaco-tree-ls-cli.md`.

import { getWorkspaceFiles } from './fileStorage'

/**
 * Pure path arithmetic, matching the resolution the runtime applies in
 * `src/evaluator/trampoline-evaluator.ts`. Forward slash only — Dvala
 * paths are POSIX-style. The playground's tree model forbids `..`
 * climbing past the workspace root, so we throw rather than silently
 * normalise to an empty path.
 */
export function resolvePlaygroundPath(fromDir: string, importPath: string): string {
  const isAbsolute = importPath.startsWith('/')
  const segments = isAbsolute || fromDir === '' ? [] : fromDir.split('/').filter(seg => seg !== '')
  const importSegments = importPath.split('/')
  for (const seg of importSegments) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (segments.length === 0) {
        throw new Error(`Import path escapes workspace root: '${importPath}' from '${fromDir}'`)
      }
      segments.pop()
      continue
    }
    segments.push(seg)
  }
  return segments.join('/')
}

/**
 * Look up `importPath` in the playground's workspace-files cache. Tries the
 * resolved path verbatim first, then with the `.dvala` suffix appended —
 * matches both Monaco-stored canonical paths (always `.dvala`-suffixed)
 * and source code that imports without the extension.
 */
export function playgroundFileResolver(importPath: string, fromDir: string): string {
  const resolved = resolvePlaygroundPath(fromDir, importPath)
  const files = getWorkspaceFiles()
  const exact = files.find(f => f.path === resolved)
  if (exact) return exact.code
  const withExt = files.find(f => f.path === `${resolved}.dvala`)
  if (withExt) return withExt.code
  throw new Error(`File not found: '${importPath}' (looked for '${resolved}' and '${resolved}.dvala')`)
}
