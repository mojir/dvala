/**
 * Comment reinsertion for the two-phase formatter.
 *
 * Handles four placement strategies:
 *
 *   inline     — insert the comment at a precise character offset inside the
 *                formatted statement (computed by format.ts via token-index
 *                matching). Falls back to trailing if offset is unavailable.
 *   trailing   — append to the last line of the statement after the `;`.
 *                Demoted to leading if the line would exceed MAX_WIDTH columns.
 *   leading    — emit comment lines before the statement.
 *   standalone — same as leading but preceded by one blank line.
 */

import { MAX_WIDTH } from './config'
import type { ExtractedComment } from './extractComments'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnchoredComment extends ExtractedComment {
  /** Index into body[] this comment is anchored to. */
  statementIndex: number
  /** Blank lines to emit before a standalone comment (capped at 1). */
  blankLinesBefore: number
  /**
   * Character offset within the formatted statement string at which to insert
   * this inline comment. Undefined means fall back to trailing behaviour.
   */
  insertionOffset?: number
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function reinsertComments(
  statementStrings: string[],
  preamble: AnchoredComment[],
  epilogue: AnchoredComment[],
  commentsByStatement: Map<number, AnchoredComment[]>,
  shebang: string | null,
  /** Blank lines to emit between statement i and i+1 (already capped at 1). */
  blankLinesBetweenStatements: number[] = [],
): string {
  const parts: string[] = []

  if (shebang !== null) {
    parts.push(`${shebang}\n`)
  }

  for (const comment of preamble) {
    parts.push(...formatCommentLines(comment, ''))
  }

  for (let i = 0; i < statementStrings.length; i++) {
    const stmtStr = statementStrings[i]!
    const stmtIndent = detectIndent(stmtStr)
    const comments = commentsByStatement.get(i) ?? []

    // ── inline insertions ──────────────────────────────────────────────────
    // Apply in reverse offset order so earlier offsets remain valid after each
    // insertion.
    const inlineWithOffset = comments
      .filter(c => c.placement === 'inline' && c.insertionOffset !== undefined)
      .sort((a, b) => (b.insertionOffset ?? 0) - (a.insertionOffset ?? 0))

    let stmtBody = stmtStr
    for (const c of inlineWithOffset) {
      const off = c.insertionOffset!
      // insertionOffset points to the start of the next token.
      // If there is already a space immediately before that position (e.g. the
      // space emitted after a comma: `[1, 2]` → `2` is at col 4, space at col 3),
      // back up one position so we don't create a double-space, and append a
      // trailing space after the comment to preserve the gap before the token.
      // Without a pre-existing space (e.g. before `,`), insert " comment" directly.
      if (stmtBody[off - 1] === ' ') {
        stmtBody = `${stmtBody.slice(0, off - 1)} ${c.text} ${stmtBody.slice(off)}`
      } else {
        stmtBody = `${stmtBody.slice(0, off)} ${c.text}${stmtBody.slice(off)}`
      }
    }

    // ── leading / standalone ───────────────────────────────────────────────
    const leadingComments = comments.filter(
      c => c.placement === 'leading' || c.placement === 'standalone',
    )
    for (const comment of leadingComments) {
      if (comment.placement === 'standalone') {
        parts.push('\n'.repeat(comment.blankLinesBefore))
      }
      parts.push(...formatCommentLines(comment, stmtIndent))
    }

    // ── statement + trailing ───────────────────────────────────────────────
    // Inline comments without an offset fall back to trailing.
    const trailingComments = comments.filter(
      c => c.placement === 'trailing' || (c.placement === 'inline' && c.insertionOffset === undefined),
    )

    const stmtLines = stmtBody.split('\n')

    if (trailingComments.length > 0) {
      const trailingText = trailingComments.map(c => c.text).join(' ')
      const lastLine = stmtLines[stmtLines.length - 1]!
      const candidate = `${lastLine}; ${trailingText}`

      if (candidate.length <= MAX_WIDTH) {
        stmtLines[stmtLines.length - 1] = candidate
        parts.push(`${stmtLines.join('\n')}\n`)
      } else {
        // Demote: put the comment on the line above as a leading comment.
        parts.push(`${stmtIndent}${trailingText}\n`)
        parts.push(`${stmtLines.join('\n')};\n`)
      }
    } else {
      parts.push(`${stmtLines.join('\n')};\n`)
    }

    // Emit blank lines between this statement and the next, as recorded from
    // the original source (already capped at 2 by format.ts).
    const blanks = blankLinesBetweenStatements[i] ?? 0
    if (blanks > 0) {
      parts.push('\n'.repeat(blanks))
    }
  }

  for (const comment of epilogue) {
    parts.push(...formatCommentLines(comment, ''))
  }

  return parts.join('')
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCommentLines(comment: AnchoredComment, indent: string): string[] {
  if (comment.kind === 'line') {
    return [`${indent}${comment.text}\n`]
  }
  // TODO: continuation lines of a multi-line block comment already have internal
  // indentation from the original source. Prepending `indent` to each line
  // double-indents them. Reflowing internal indentation requires understanding
  // the author's intent, so we leave it as-is for now.
  const lines = comment.text.split('\n')
  return [`${lines.map(l => `${indent}${l}`).join('\n')}\n`]
}

function detectIndent(stmt: string): string {
  return /^(\s*)/.exec(stmt)?.[1] ?? ''
}
