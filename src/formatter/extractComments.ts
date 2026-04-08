/**
 * Comment extraction for the two-phase formatter.
 *
 * Tokenizes source with debug info, then classifies each comment:
 *
 *   inline     — block comment between two code tokens on the same line,
 *                e.g. `foo(a /* note *‌/, b)`. Reinserted at exact token-index position.
 *   trailing   — comment at end of a line after code.
 *   leading    — comment on its own line immediately before the next statement,
 *                no blank lines between them.
 *   standalone — comment separated from surrounding code by at least one blank line.
 *
 * Also records `prevMinifiedIndex`: the 0-based index of the preceding token in
 * the minified (whitespace- and comment-free) token stream. Used by format.ts for
 * exact token-position inline reinsertion without any searching or value matching.
 */

import { tokenize } from '../tokenizer/tokenize'
import type { Token } from '../tokenizer/token'

export type CommentKind = 'line' | 'block'
export type CommentPlacement = 'inline' | 'trailing' | 'leading' | 'standalone'

export interface ExtractedComment {
  /** Full comment text including delimiters (e.g. "// foo" or a block comment). */
  text: string
  kind: CommentKind
  placement: CommentPlacement
  /** 0-based line number in the original source. */
  sourceLine: number
  /** 0-based column in the original source. */
  sourceColumn: number
  /**
   * Source line of the code this comment is anchored to.
   *
   * - inline/trailing → line of the preceding code token
   * - leading/standalone → line of the following code token
   */
  anchorSourceLine: number
  /** 0-based column of the code this comment should attach to on anchorSourceLine. */
  anchorSourceColumn: number
  /**
   * 0-based index of the preceding token in the minified token stream
   * (whitespace and comments removed, sequential numbering starting at 0).
   * -1 means the comment precedes all tokens in the file.
   *
   * Used by format.ts for token-level inline insertion.
   */
  prevMinifiedIndex: number
}

export interface ExtractCommentsResult {
  comments: ExtractedComment[]
  /** Shebang line text if present (e.g. "#!/usr/bin/env dvala"), else null. */
  shebang: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tokenLine(token: Token): number {
  return token[2]?.[0] ?? 0
}

function tokenColumn(token: Token): number {
  return token[2]?.[1] ?? 0
}

function tokenText(token: Token | undefined): string | null {
  if (!token) return null
  return typeof token[1] === 'string' ? token[1] : null
}

function isCodeToken(token: Token): boolean {
  const t = token[0]
  return t !== 'Whitespace' && t !== 'SingleLineComment' && t !== 'MultiLineComment' && t !== 'Shebang'
}

function countNewlines(s: string): number {
  let n = 0
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\n') n++
  }
  return n
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract all comments from source code and classify each one.
 *
 * The tokenizer is run with debug=true so every token has a [line, column]
 * debug info attached. Comments are then classified by inspecting the
 * surrounding tokens and computing blank-line counts from line numbers.
 */
export function extractComments(source: string): ExtractCommentsResult {
  const { tokens } = tokenize(source, true, undefined)

  const shebang = tokens[0]?.[0] === 'Shebang' ? (tokens[0][1]) : null

  const comments: ExtractedComment[] = []

  // Running count of non-whitespace, non-comment tokens seen so far.
  // The comment encountered when this is N was preceded by minified index N-1.
  let minifiedCount = 0

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!
    const type = token[0]

    if (type !== 'SingleLineComment' && type !== 'MultiLineComment') {
      if (isCodeToken(token)) minifiedCount++
      continue
    }

    const commentLine = tokenLine(token)
    const commentColumn = tokenColumn(token)
    const kind: CommentKind = type === 'SingleLineComment' ? 'line' : 'block'
    const prevMinifiedIndex = minifiedCount - 1

    // Nearest code token before this comment.
    let prevCodeToken: Token | undefined
    for (let j = i - 1; j >= 0; j--) {
      if (isCodeToken(tokens[j]!)) {
        prevCodeToken = tokens[j]
        break
      }
    }

    // Nearest code token after this comment.
    let nextCodeToken: Token | undefined
    for (let j = i + 1; j < tokens.length; j++) {
      if (isCodeToken(tokens[j]!)) {
        nextCodeToken = tokens[j]
        break
      }
    }

    const prevLine = prevCodeToken ? tokenLine(prevCodeToken) : -1
    const nextLine = nextCodeToken ? tokenLine(nextCodeToken) : -1

    const commentEndLine = kind === 'line' ? commentLine : commentLine + countNewlines(token[1])

    const blanksBefore = prevLine >= 0 ? commentLine - prevLine - 1 : 0
    const blanksAfter = nextLine >= 0 ? nextLine - commentEndLine - 1 : 1

    let placement: CommentPlacement
    let anchorSourceLine: number
    let anchorSourceColumn: number

    const prevTokenText = tokenText(prevCodeToken)
    const nextTokenText = tokenText(nextCodeToken)
    const isCollectionLeadingBlockComment =
      kind === 'block'
      && prevLine === commentLine
      && nextLine === commentLine
      && (prevTokenText === '(' || prevTokenText === ',')
      && (nextTokenText === '[' || nextTokenText === '{')

    if (isCollectionLeadingBlockComment) {
      placement = 'leading'
      anchorSourceLine = nextLine >= 0 ? nextLine : commentLine
      anchorSourceColumn = nextCodeToken ? tokenColumn(nextCodeToken) : commentColumn
    } else if (prevLine === commentLine && nextLine === commentLine) {
      // Block comment sandwiched between code tokens on the same line.
      // Line comments can never reach here (// consumes to end-of-line).
      placement = 'inline'
      anchorSourceLine = prevLine
      anchorSourceColumn = commentColumn
    } else if (prevLine === commentLine) {
      // Code before the comment on the same line → trailing.
      placement = 'trailing'
      anchorSourceLine = prevLine
      anchorSourceColumn = commentColumn
    } else if (blanksBefore === 0 && blanksAfter === 0) {
      // No blank lines on either side → leading comment for next statement.
      placement = 'leading'
      anchorSourceLine = nextLine >= 0 ? nextLine : commentLine
      anchorSourceColumn = nextCodeToken ? tokenColumn(nextCodeToken) : commentColumn
    } else {
      // At least one blank line on one side → standalone.
      placement = 'standalone'
      anchorSourceLine = nextLine >= 0 ? nextLine : (prevLine >= 0 ? prevLine : commentLine)
      anchorSourceColumn = nextCodeToken
        ? tokenColumn(nextCodeToken)
        : (prevCodeToken ? tokenColumn(prevCodeToken) : commentColumn)
    }

    comments.push({
      text: token[1],
      kind,
      placement,
      sourceLine: commentLine,
      sourceColumn: commentColumn,
      anchorSourceColumn,
      anchorSourceLine,
      prevMinifiedIndex,
    })
  }

  return { comments, shebang }
}
