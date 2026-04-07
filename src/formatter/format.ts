/**
 * Two-phase Dvala source formatter.
 *
 * Phase 1 — structural formatting: parse the source into an AST, then
 *   pretty-print each top-level statement with `prettyPrint`. This produces
 *   correctly indented, wrapped, and idiomatic code but discards comments.
 *   AST hints (isShorthand, isInfix, isPipe) preserve authored syntactic forms.
 *
 * Phase 2 — comment reinsertion: extract all comments from the original
 *   token stream, anchor each to the nearest statement boundary, and splice
 *   them back into the formatted output.
 *
 * Inline block comments (sandwiched between two code tokens on the same line)
 * are reinserted at their exact token-level position using minified-token-index
 * matching: the comment was between minified token N and N+1 in the original,
 * so it goes between formatted token N and N+1.
 *
 * On parse failure the original source is returned unchanged so format-on-save
 * never destroys partially-written code.
 */

import { prettyPrint } from '../prettyPrint'
import { tokenize } from '../tokenizer/tokenize'
import { minifyTokenStream } from '../tokenizer/minifyTokenStream'
import { isOperatorToken } from '../tokenizer/token'
import type { Token } from '../tokenizer/token'
import { parseToAst } from '../parser'
import type { AstNode, SourceMap } from '../parser/types'
import { extractComments } from './extractComments'
import type { ExtractedComment } from './extractComments'
import { reinsertComments } from './reinsertComments'
import type { AnchoredComment } from './reinsertComments'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function format(source: string): string {
  if (source.trim() === '') return ''

  const fullTokenStream = tokenize(source, true, undefined)
  const minified = minifyTokenStream(fullTokenStream, { removeWhiteSpace: true })

  let ast: ReturnType<typeof parseToAst>
  try {
    ast = parseToAst(minified)
  } catch {
    return source
  }

  const { body, sourceMap } = ast

  if (body.length === 0) {
    const { shebang } = extractComments(source)
    return shebang ? `${shebang}\n` : ''
  }

  const { comments, shebang } = extractComments(source)

  // Source line (0-based) of each top-level statement's first token.
  const statementStartLines: number[] = body.map((node: AstNode) => {
    return sourceMap?.positions.get(node[2])?.start[0] ?? 0
  })

  const statementStrings: string[] = body.map((node: AstNode) => prettyPrint(node))

  // Index in the minified token array where each statement's expression begins.
  const stmtMinifiedStarts = findStmtMinifiedStarts(body, minified.tokens, sourceMap)

  // ── anchor comments to statements ────────────────────────────────────────

  const preamble: AnchoredComment[] = []
  const epilogue: AnchoredComment[] = []
  const commentsByStatement = new Map<number, AnchoredComment[]>()

  for (const comment of comments) {
    const anchored = anchorComment(comment, statementStartLines, source)

    if (anchored.statementIndex < 0) {
      preamble.push(anchored)
    } else if (anchored.statementIndex >= body.length) {
      epilogue.push(anchored)
    } else {
      const list = commentsByStatement.get(anchored.statementIndex)
      if (list) list.push(anchored)
      else commentsByStatement.set(anchored.statementIndex, [anchored])
    }
  }

  // ── compute insertion offsets for inline comments ─────────────────────────
  // For each statement with inline comments, re-tokenize the formatted string
  // and verify the minified token count matches the original expression.
  // If it does, the minified-token position index is stable and we can compute
  // an exact character offset for insertion.

  for (let i = 0; i < statementStrings.length; i++) {
    const stmtComments = commentsByStatement.get(i)
    if (!stmtComments) continue

    const inlineComments = stmtComments.filter(c => c.placement === 'inline')
    if (inlineComments.length === 0) continue

    const formattedStr = statementStrings[i]!
    const formattedFull = tokenize(formattedStr, true, undefined)
    const formattedMin = minifyTokenStream(formattedFull, { removeWhiteSpace: true })

    const stmtMinStart = stmtMinifiedStarts[i]!
    const stmtMinEnd = stmtMinifiedStarts[i + 1] ?? minified.tokens.length

    // The statement's `;` separator is consumed by the parser after the
    // expression — it appears as the last token of the range if present.
    const lastToken = minified.tokens[stmtMinEnd - 1]
    const hasSemicolon = lastToken !== undefined && isOperatorToken(lastToken, ';')
    const originalExprTokenCount = stmtMinEnd - stmtMinStart - (hasSemicolon ? 1 : 0)

    // If the counts don't match, prettyPrint rewrote the construct (e.g.
    // `get(obj, "k")` → `obj.k`). Fall back to trailing for all inline comments.
    if (formattedMin.tokens.length !== originalExprTokenCount) continue

    for (const comment of inlineComments) {
      const prevRelativeIndex = comment.prevMinifiedIndex - stmtMinStart

      // Comment after the last expression token → trailing fallback.
      if (prevRelativeIndex + 1 >= formattedMin.tokens.length) continue

      const nextTok = formattedMin.tokens[prevRelativeIndex + 1]
      if (!nextTok) continue

      const di = nextTok[2]
      if (!di) continue

      comment.insertionOffset = lineColToCharOffset(formattedStr, di[0], di[1])
    }
  }

  // ── blank lines between statements ───────────────────────────────────────
  // Preserve original blank line counts (capped at 2) between consecutive
  // statements. When comments exist between two statements the standalone-
  // comment mechanism already controls the spacing — set to 0 in that case.

  const sourceLines = source.split('\n')
  const blankLinesBetweenStatements: number[] = []

  for (let i = 0; i < body.length - 1; i++) {
    const endLine = sourceMap?.positions.get(body[i]![2])?.end[0] ?? statementStartLines[i]!
    const nextStartLine = statementStartLines[i + 1]!

    const hasCommentsBetween = comments.some(
      c => c.sourceLine > endLine && c.sourceLine < nextStartLine,
    )

    if (hasCommentsBetween) {
      blankLinesBetweenStatements.push(0)
    } else {
      let blanks = 0
      for (let l = endLine + 1; l < nextStartLine; l++) {
        if ((sourceLines[l] ?? '').trim() === '') blanks++
      }
      blankLinesBetweenStatements.push(Math.min(blanks, 1))
    }
  }

  const raw = reinsertComments(statementStrings, preamble, epilogue, commentsByStatement, shebang, blankLinesBetweenStatements)
  return postProcess(raw)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * For each top-level statement, find the index of its first token in the
 * minified token array by matching the source-map start position.
 */
function findStmtMinifiedStarts(
  body: AstNode[],
  minifiedTokens: Token[],
  sourceMap: SourceMap | undefined,
): number[] {
  return body.map((node: AstNode) => {
    const pos = sourceMap?.positions.get(node[2])
    if (!pos) return 0
    const [line, col] = pos.start
    const idx = minifiedTokens.findIndex(t => {
      const di = t[2]
      return di !== undefined && di[0] === line && di[1] === col
    })
    return idx >= 0 ? idx : 0
  })
}

/** Convert a [line, col] debug position to a character offset within a string. */
function lineColToCharOffset(str: string, line: number, col: number): number {
  const lines = str.split('\n')
  let offset = 0
  for (let i = 0; i < line; i++) {
    offset += (lines[i]?.length ?? 0) + 1 // +1 for the \n
  }
  return offset + col
}

/**
 * Map a comment to the statement it belongs to and wrap it as an
 * AnchoredComment. insertionOffset for inline comments is computed
 * separately after this function runs.
 */
function anchorComment(
  comment: ExtractedComment,
  statementStartLines: number[],
  source: string,
): AnchoredComment {
  const { placement, anchorSourceLine } = comment

  let statementIndex: number
  let blankLinesBefore = 0

  if (placement === 'trailing' || placement === 'inline') {
    // Anchored to the statement whose line the comment sits on.
    statementIndex = findStatementForLine(anchorSourceLine, statementStartLines)
  } else {
    // leading or standalone: anchored to the following statement.
    // Use comment.sourceLine (not anchorSourceLine) to detect preamble/epilogue:
    // anchorSourceLine points to the next code token's line, which could equal
    // statementStartLines[0] for a file-leading comment — that would incorrectly
    // map to statement 0 instead of preamble.
    if (placement === 'standalone') {
      blankLinesBefore = computeBlankLinesBefore(comment.sourceLine, source)
    }

    const firstStmtLine = statementStartLines[0] ?? Infinity
    const lastStmtLine = statementStartLines[statementStartLines.length - 1] ?? -1

    if (comment.sourceLine < firstStmtLine) {
      statementIndex = -1 // preamble
    } else if (comment.sourceLine > lastStmtLine) {
      statementIndex = statementStartLines.length // epilogue (= body.length)
    } else {
      statementIndex = findStatementForLine(anchorSourceLine, statementStartLines)
    }
  }

  return { ...comment, statementIndex, blankLinesBefore }
}

function findStatementForLine(line: number, statementStartLines: number[]): number {
  if (statementStartLines.length === 0) return 0
  if (line < statementStartLines[0]!) return -1

  let result = 0
  for (let i = 0; i < statementStartLines.length; i++) {
    if (statementStartLines[i]! <= line) result = i
    else break
  }
  return result
}

function computeBlankLinesBefore(lineIndex: number, source: string): number {
  const lines = source.split('\n')
  let blanks = 0
  for (let i = lineIndex - 1; i >= 0; i--) {
    if ((lines[i] ?? '').trim() === '') blanks++
    else break
  }
  return Math.min(blanks, 1)
}

/**
 * Final cleanup pass applied to the formatter output:
 *   - strip trailing whitespace from every line
 *   - remove leading blank lines at the top of the file
 *   - ensure the file ends with exactly one newline
 */
function postProcess(output: string): string {
  return output
    .replace(/[ \t]+$/gm, '') // strip trailing whitespace on each line
    .replace(/^\n+/, '') // strip leading blank lines
    .replace(/\n*$/, '\n') // ensure exactly one trailing newline
}
