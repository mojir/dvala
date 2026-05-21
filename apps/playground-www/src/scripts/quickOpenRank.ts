// Pure ranking helpers for the Quick Open file picker.
//
// Lives in its own module (separate from `quickOpen.ts`) because the picker
// UI transitively imports `tabs.ts → codeEditor → monaco-editor`, which
// touches `window` at module load and won't evaluate under vitest's
// default node environment. Keeping the ranker DOM-free lets us unit-test
// it without spinning up jsdom.

import { isInPlaygroundFolder } from '../filePath'
import { fileDisplayName } from '../fileStorage'
import type { WorkspaceFile } from '../fileStorage'

export interface QuickOpenItem {
  /** Stable identifier (file id). */
  id: string
  /** Filename — primary label. */
  label: string
  /** Folder portion of the path — secondary label, right-aligned. */
  detail: string
  /** Full path used by the ranker. */
  path: string
}

/**
 * Score `path` against `query` as a fuzzy-subsequence match. Returns `null`
 * when no match. Lower score = better match. The scoring prefers:
 *  - matches that fall within the basename (after the last `/`)
 *  - tighter character runs (low `gapPenalty`)
 *  - shorter overall paths
 *
 * The empty query is a no-filter case (returns 0 for everything; caller
 * preserves insertion order).
 */
export function rankQuickOpen(query: string, path: string): number | null {
  if (query === '') return 0
  const q = query.toLowerCase()
  const p = path.toLowerCase()
  const slash = path.lastIndexOf('/')
  const basenameStart = slash === -1 ? 0 : slash + 1

  let qi = 0
  let lastIdx = -1
  let gapPenalty = 0
  let basenameMatchCount = 0

  for (let i = 0; i < p.length && qi < q.length; i++) {
    if (p[i] !== q[qi]) continue
    if (lastIdx >= 0) gapPenalty += i - lastIdx - 1
    if (i >= basenameStart) basenameMatchCount += 1
    lastIdx = i
    qi += 1
  }
  if (qi < q.length) return null

  // 100 * unmatched-basename chars dominates any gap penalty for normal
  // paths — a query that fully matches inside the basename always beats
  // one that spills into folder segments.
  const basenameMiss = q.length - basenameMatchCount
  return basenameMiss * 100 + gapPenalty + p.length / 1000
}

/**
 * Build the picker's full item list (sorted by ranker for the given query).
 * Files under `.dvala-playground/` are skipped — those buffers (scratch,
 * handlers) are reachable through their pinned virtual entries, not through
 * the file picker. Pure function — easy to unit-test independently of the DOM.
 */
export function rankWorkspaceFiles(query: string, files: WorkspaceFile[]): QuickOpenItem[] {
  const ranked: { item: QuickOpenItem; score: number }[] = []
  for (const file of files) {
    if (isInPlaygroundFolder(file.path)) continue
    const score = rankQuickOpen(query, file.path)
    if (score === null) continue
    const slash = file.path.lastIndexOf('/')
    const detail = slash === -1 ? '' : file.path.slice(0, slash)
    ranked.push({
      score,
      item: {
        id: file.id,
        label: fileDisplayName(file),
        detail,
        path: file.path,
      },
    })
  }
  ranked.sort((a, b) => a.score - b.score)
  return ranked.map(r => r.item)
}
