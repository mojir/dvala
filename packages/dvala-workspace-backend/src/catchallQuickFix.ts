// Pure-function support for the "insert match catchall" quick-fix
// (LS Q4 code-actions track; closes the Q5-deferred ergonomic gap).
//
// Given the source text and a Match AST node's range, computes the text
// edit that inserts a `case _ then perform(@dvala.error, ...) ` clause as
// the last case — so a non-exhaustive match can be made exhaustive in one
// keystroke. Kept free of backend / vscode imports so the boundary cases
// (no trailing newline, off-by-one indent detection, `end` on the same
// line as the first case) are unit-testable without the editor mocks.
//
// Promotes to `dvala-core-tooling/src/shared/` when the playground LS
// client lands, alongside the selection-range adapter helpers.

// Subset of AstNode + SourceMapPosition we need. Defining locally rather
// than importing the full type union to keep the helper independent of
// `@mojir/dvala-types` evolution.
export interface MatchNodeRange {
  readonly endLine: number // 1-based, the line of (or after) the closing `end`
  readonly endColumn: number // 1-based, exclusive — one past the last `d` of `end`
}

export interface CatchallEdit {
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
  newText: string
}

const CATCHALL_BODY = 'case _ then perform(@dvala.error, "unhandled match case")'

/**
 * Compute a text edit that inserts a catchall case immediately before the
 * closing `end` of a match expression. The insertion point is the start
 * of the line containing `end` (column 1, 1-based), and the inserted text
 * carries the matching indent for that line + 2 spaces.
 *
 * Returns null if the source doesn't actually contain `end` at the
 * expected position (defensive — the match node's sourceMap range and the
 * source text are usually in sync, but a stale request might trip this).
 */
export function computeCatchallEdit(source: string, matchRange: MatchNodeRange): CatchallEdit | null {
  const lines = source.split('\n')
  // `endLine` is 1-based; subtract 1 to index `lines`. `endColumn` is the
  // exclusive end (1-based) — one past the last `d` of `end`. So the `end`
  // keyword starts at column `endColumn - 3` on `endLine`.
  const endLineIndex = matchRange.endLine - 1
  if (endLineIndex < 0 || endLineIndex >= lines.length) return null
  const endLine = lines[endLineIndex]!
  const endKeywordStartColumn = matchRange.endColumn - 3
  if (endKeywordStartColumn < 1) return null
  // Sanity check: the three characters before endColumn on endLine should be `end`.
  // If they aren't, sourceMap and source are out of sync; bail.
  const startIndex = endKeywordStartColumn - 1
  if (endLine.slice(startIndex, startIndex + 3) !== 'end') return null

  // Use the `end` line's indent + 2 spaces as the case indent. Matches the
  // common formatter convention; users with non-default formatting can
  // reformat after the insertion.
  const endIndentMatch = /^\s*/.exec(endLine)
  const endIndent = endIndentMatch ? endIndentMatch[0] : ''
  const caseIndent = `${endIndent}  `

  return {
    startLine: matchRange.endLine,
    startColumn: 1,
    endLine: matchRange.endLine,
    endColumn: 1,
    newText: `${caseIndent}${CATCHALL_BODY}\n`,
  }
}

// Re-export for callers that want the constant (e.g. tests asserting on the
// rendered text without duplicating it).
export const CATCHALL_INSERT_TEXT = CATCHALL_BODY
