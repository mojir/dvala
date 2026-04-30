// File resolver that backs Dvala's `import("./foo")` against the playground's
// IndexedDB-stored files. Wires into `createDvala`'s `fileResolver` option
// so multi-file workspaces in the playground execute the same way they would
// via `dvala run` — the divergence flagged in the Phase 0 spike of
// `design/active/2026-04-26_playground-monaco-tree-ls-cli.md`.

import { PLAYGROUND_FOLDER, isInPlaygroundFolder } from './filePath'
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
 *
 * **Phase 1.5 step 23g — `.dvala-playground/` is not part of the import
 * graph.** Imports that resolve to a path inside the playground-state
 * folder are rejected regardless of where they come from. The folder holds
 * scratch, handlers, and snapshot JSON — playground-only state that
 * `dvala run` ignores entirely. Allowing workspace files to import the
 * folder would silently break the moment the project leaves the
 * playground; allowing scratch / handlers to import each other would
 * couple two pinned virtual buffers that have no `import` use case
 * (handlers is auto-wrapped, not imported; scratch is single-instance).
 * Imports from inside the folder out to workspace files (e.g. scratch
 * importing `../utils.dvala`) are still allowed — that's the one direction
 * the playground actually exercises. Centralising the rule here keeps
 * consumers (tabs, tree, history, run path) from needing their own checks.
 */
export function playgroundFileResolver(importPath: string, fromDir: string): string {
  // `resolvePlaygroundPath` has already thrown if the path climbed past the
  // workspace root via `..`, so anything reaching the playground-folder gate
  // below is a syntactically valid resolved path. Order: escape-root error
  // (path-shape problem) takes precedence over the playground-folder error
  // (semantic / boundary problem) which takes precedence over file-not-found.
  const resolved = resolvePlaygroundPath(fromDir, importPath)
  if (isInPlaygroundFolder(resolved)) {
    throw new Error(
      `Cannot import '${importPath}' from '${fromDir || '<root>'}': ${PLAYGROUND_FOLDER}/ is playground state, not part of the deployable project — move the file outside ${PLAYGROUND_FOLDER}/ to make it importable`,
    )
  }
  const files = getWorkspaceFiles()
  const exact = files.find(f => f.path === resolved)
  if (exact) return exact.code
  const withExt = files.find(f => f.path === `${resolved}.dvala`)
  if (withExt) return withExt.code
  throw new Error(`File not found: '${importPath}' (looked for '${resolved}' and '${resolved}.dvala')`)
}
