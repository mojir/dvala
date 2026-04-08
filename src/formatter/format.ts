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

import { MAX_BLANK_LINES } from './config'
import { extractComments } from './extractComments'
import type { ExtractedComment } from './extractComments'
import { reinsertComments } from './reinsertComments'
import type { AstNode, SourceMap } from '../parser/types'
import { parseToAst } from '../parser'
import {
  prettyPrint,
  type PrettyPrintCommentHint,
  withPrettyPrintBlankLineHints,
  withPrettyPrintCommentHints,
} from '../prettyPrint'
import { isOperatorToken } from '../tokenizer/token'
import type { Token } from '../tokenizer/token'
import { minifyTokenStream } from '../tokenizer/minifyTokenStream'
import { tokenize } from '../tokenizer/tokenize'
import { parseToCst as parseToCstFn } from '../parser'
import { formatCst } from './cstFormat'
import type { AnchoredComment } from './reinsertComments'

interface SequentialNodeInfo {
  depth: number
  endLine: number
  nodeId: number
  startColumn: number
  startLine: number
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Format using the new CST-based formatter.
 * This is the Phase 4 replacement — once validated, it replaces format().
 */
export function formatWithCst(source: string): string {
  if (source.trim() === '') return ''
  const fullTokenStream = tokenize(source, true, undefined)
  try {
    const { tree, trailingTrivia } = parseToCstFn(fullTokenStream)
    return formatCst(tree, trailingTrivia)
  } catch {
    return source
  }
}

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
    const { comments, shebang } = extractComments(source)
    if (comments.length === 0) {
      return shebang ? `${shebang}\n` : ''
    }
    // File has only comments (no statements). Anchor all as preamble and
    // reinsert so they are not silently discarded.
    const preamble = comments.map(c => anchorComment(c, [], source))
    const raw = reinsertComments([], preamble, [], new Map(), shebang)
    return postProcess(raw)
  }

  const { comments, shebang } = extractComments(source)
  const sourceLines = source.split('\n')
  const { prettyPrintCommentHints, unhandledComments } = createPrettyPrintCommentHints(
    comments,
    body,
    sourceMap,
    sourceLines,
  )

  // Source line (0-based) of each top-level statement's first token.
  const statementStartLines: number[] = body.map((node: AstNode) => {
    return sourceMap?.positions.get(node[2])?.start[0] ?? 0
  })

  const statementStrings: string[] = withPrettyPrintCommentHints(
    prettyPrintCommentHints,
    () => withPrettyPrintBlankLineHints(
      createPrettyPrintBlankLineHints(body, sourceMap, sourceLines),
      () => body.map((node: AstNode) => prettyPrint(node)),
    ),
  )

  // Index in the minified token array where each statement's expression begins.
  const stmtMinifiedStarts = findStmtMinifiedStarts(body, minified.tokens, sourceMap)

  // ── anchor comments to statements ────────────────────────────────────────

  const preamble: AnchoredComment[] = []
  const epilogue: AnchoredComment[] = []
  const commentsByStatement = new Map<number, AnchoredComment[]>()

  for (const comment of unhandledComments) {
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
  // Preserve original blank line counts (capped at 1) between consecutive
  // statements. When comments exist between two statements the standalone-
  // comment mechanism already controls the spacing — set to 0 in that case.

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
      blankLinesBetweenStatements.push(Math.min(blanks, MAX_BLANK_LINES))
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
    // TODO: idx === -1 means prettyPrint rewrote the leading token (e.g. a
    // structural rewrite changed the first token's position). Falling back to 0
    // makes stmtMinStart wrong for this statement, so inline comments will fall
    // back to trailing via the token-count mismatch guard. Safe but silent.
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
  const sourceLines = source.split('\n')

  let statementIndex: number
  let blankLinesBefore = 0
  let blankLinesAfter = 0

  if (placement === 'trailing' || placement === 'inline') {
    // Anchored to the statement whose line the comment sits on.
    statementIndex = findStatementForLine(anchorSourceLine, statementStartLines)
  } else {
    blankLinesBefore = computeBlankLinesBefore(comment.sourceLine, sourceLines)
    blankLinesAfter = computeBlankLinesAfter(comment, sourceLines, anchorSourceLine)

    // leading or standalone: anchored to the following statement.
    // Use comment.sourceLine (not anchorSourceLine) to detect preamble/epilogue:
    // anchorSourceLine points to the next code token's line, which could equal
    // statementStartLines[0] for a file-leading comment — that would incorrectly
    // map to statement 0 instead of preamble.
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

  return { ...comment, statementIndex, blankLinesBefore, blankLinesAfter }
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

function computeBlankLinesBefore(lineIndex: number, lines: string[]): number {
  let blanks = 0
  for (let i = lineIndex - 1; i >= 0; i--) {
    if ((lines[i] ?? '').trim() === '') blanks++
    else break
  }
  return Math.min(blanks, MAX_BLANK_LINES)
}

function computeBlankLinesAfter(comment: ExtractedComment, lines: string[], anchorSourceLine: number): number {
  const commentEndLine = comment.kind === 'line'
    ? comment.sourceLine
    : comment.sourceLine + countNewlines(comment.text)

  let blanks = 0
  let nextNonEmptyLine = -1

  for (let i = commentEndLine + 1; i < lines.length; i++) {
    if ((lines[i] ?? '').trim() === '') {
      blanks++
    } else {
      nextNonEmptyLine = i
      break
    }
  }

  if (nextNonEmptyLine !== anchorSourceLine) return 0
  return Math.min(blanks, MAX_BLANK_LINES)
}

function countNewlines(s: string): number {
  let count = 0
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\n') count++
  }
  return count
}

function createPrettyPrintCommentHints(
  comments: ExtractedComment[],
  body: AstNode[],
  sourceMap: SourceMap | undefined,
  sourceLines: string[],
): {
  prettyPrintCommentHints: {
    leadingCommentsByNodeId: Map<number, PrettyPrintCommentHint[]>
    trailingCommentsByNodeId: Map<number, PrettyPrintCommentHint[]>
  }
  unhandledComments: ExtractedComment[]
} {
  const leadingCommentsByNodeId = new Map<number, PrettyPrintCommentHint[]>()
  const trailingCommentsByNodeId = new Map<number, PrettyPrintCommentHint[]>()
  const unhandledComments: ExtractedComment[] = []
  const sequentialNodes = collectSequentialNodeInfos(body, sourceMap)
  const topLevelRanges = body
    .map(node => {
      const position = sourceMap?.positions.get(node[2])
      if (!position) return null

      return {
        endLine: position.end[0],
        startLine: position.start[0],
      }
    })
    .filter(range => range !== null)

  for (const comment of comments) {
    if (comment.placement === 'inline') {
      unhandledComments.push(comment)
      continue
    }

    const isInsideTopLevelStatement = topLevelRanges.some(
      range => comment.sourceLine >= range.startLine && comment.sourceLine <= range.endLine,
    )
    if (!isInsideTopLevelStatement) {
      unhandledComments.push(comment)
      continue
    }

    const target = comment.placement === 'trailing'
      ? findNestedTrailingCommentTarget(comment, sequentialNodes)
      : findNestedLeadingCommentTarget(comment, sequentialNodes)

    if (!target) {
      unhandledComments.push(comment)
      continue
    }

    const hint: PrettyPrintCommentHint = {
      blankLinesAfter: comment.placement === 'trailing'
        ? 0
        : computeBlankLinesAfter(comment, sourceLines, comment.anchorSourceLine),
      blankLinesBefore: comment.placement === 'trailing'
        ? 0
        : computeBlankLinesBefore(comment.sourceLine, sourceLines),
      kind: comment.kind,
      text: comment.text,
    }

    if (comment.placement === 'trailing') {
      const existing = trailingCommentsByNodeId.get(target.nodeId)
      if (existing) existing.push(hint)
      else trailingCommentsByNodeId.set(target.nodeId, [hint])
      continue
    }

    const existing = leadingCommentsByNodeId.get(target.nodeId)
    if (existing) existing.push(hint)
    else leadingCommentsByNodeId.set(target.nodeId, [hint])
  }

  return {
    prettyPrintCommentHints: {
      leadingCommentsByNodeId,
      trailingCommentsByNodeId,
    },
    unhandledComments,
  }
}

function createPrettyPrintBlankLineHints(
  body: AstNode[],
  sourceMap: SourceMap | undefined,
  sourceLines: string[],
): Map<number, number> {
  const hints = new Map<number, number>()
  if (!sourceMap) return hints

  const visit = (value: unknown): void => {
    if (!Array.isArray(value)) return

    if (isAstNode(value)) annotateNodeSpacing(value, sourceMap, sourceLines, hints)

    value.forEach(visit)
  }

  body.forEach(visit)
  return hints
}

function annotateNodeSpacing(node: AstNode, sourceMap: SourceMap, sourceLines: string[], hints: Map<number, number>): void {
  const [type, payload] = node

  if (type === 'Array') {
    annotateSequentialNodeSpacing(payload as AstNode[], sourceMap, sourceLines, hints)
  } else if (type === 'Object') {
    annotateObjectEntrySpacing(payload as unknown[][], sourceMap, sourceLines, hints)
  } else if (type === 'Block') {
    annotateSequentialNodeSpacing(payload as AstNode[], sourceMap, sourceLines, hints)
  } else if (type === 'Function' || type === 'Macro') {
    annotateSequentialNodeSpacing((payload as [unknown[], AstNode[]])[1], sourceMap, sourceLines, hints)
  } else if (type === 'Handler') {
    annotateHandlerBodySpacing(payload as [unknown[], unknown], sourceMap, sourceLines, hints)
  } else if (type === 'CodeTmpl') {
    annotateSequentialNodeSpacing((payload as [AstNode[], unknown[]])[0], sourceMap, sourceLines, hints)
  }
}

function annotateHandlerBodySpacing(
  payload: [unknown[], unknown],
  sourceMap: SourceMap,
  sourceLines: string[],
  hints: Map<number, number>,
): void {
  const [clauses, transform] = payload

  for (const clause of clauses as { body: AstNode[] }[]) {
    annotateSequentialNodeSpacing(clause.body, sourceMap, sourceLines, hints)
  }

  if (transform) {
    annotateSequentialNodeSpacing((transform as [unknown, AstNode[]])[1], sourceMap, sourceLines, hints)
  }
}

function annotateSequentialNodeSpacing(
  nodes: AstNode[],
  sourceMap: SourceMap,
  sourceLines: string[],
  hints: Map<number, number>,
): void {
  for (let i = 1; i < nodes.length; i++) {
    const previousPos = sourceMap.positions.get(nodes[i - 1]![2])
    const currentPos = sourceMap.positions.get(nodes[i]![2])
    if (!previousPos || !currentPos) continue

    const blankLines = countBlankLinesBetween(previousPos.end[0], currentPos.start[0], sourceLines)
    if (blankLines > 0)
      hints.set(nodes[i]![2], blankLines)
  }
}

function annotateObjectEntrySpacing(
  entries: unknown[][],
  sourceMap: SourceMap,
  sourceLines: string[],
  hints: Map<number, number>,
): void {
  for (let i = 1; i < entries.length; i++) {
    const previousRange = getObjectEntryRange(entries[i - 1]!, sourceMap)
    const currentRange = getObjectEntryRange(entries[i]!, sourceMap)
    if (!previousRange || !currentRange) continue

    const blankLines = countBlankLinesBetween(previousRange.end[0], currentRange.start[0], sourceLines)
    if (blankLines > 0)
      hints.set(currentRange.nodeId, blankLines)
  }
}

function collectSequentialNodeInfos(body: AstNode[], sourceMap: SourceMap | undefined): SequentialNodeInfo[] {
  if (!sourceMap) return []

  const infos: SequentialNodeInfo[] = []

  const addSequentialNodes = (nodes: AstNode[], depth: number): void => {
    for (const node of nodes) {
      const position = sourceMap.positions.get(node[2])
      if (position) {
        infos.push({
          depth,
          endLine: position.end[0],
          nodeId: node[2],
          startColumn: position.start[1],
          startLine: position.start[0],
        })
      }
      visit(node, depth)
    }
  }

  const visit = (value: unknown, depth: number): void => {
    if (!Array.isArray(value)) return

    if (isAstNode(value)) {
      const [type, payload] = value
      const position = sourceMap.positions.get(value[2])

      if ((type === 'Array' || type === 'Object') && position) {
        infos.push({
          depth: depth + 1,
          endLine: position.end[0],
          nodeId: value[2],
          startColumn: position.start[1],
          startLine: position.start[0],
        })
      }

      if (type === 'Block') {
        addSequentialNodes(payload as AstNode[], depth + 1)
      } else if (type === 'If') {
        const [, thenNode, elseNode] = payload as [AstNode, AstNode, AstNode | null]
        addSequentialNodes([thenNode], depth + 1)
        if (elseNode) addSequentialNodes([elseNode], depth + 1)
      } else if (type === 'Function' || type === 'Macro') {
        addSequentialNodes((payload as [unknown[], AstNode[]])[1], depth + 1)
      } else if (type === 'Handler') {
        const [clauses, transform] = payload as [{ body: AstNode[] }[], [unknown, AstNode[]] | null]
        for (const clause of clauses) addSequentialNodes(clause.body, depth + 1)
        if (transform) addSequentialNodes(transform[1], depth + 1)
      } else if (type === 'CodeTmpl') {
        addSequentialNodes((payload as [AstNode[], unknown[]])[0], depth + 1)
      }
    }

    for (const child of value) {
      if (Array.isArray(child)) visit(child, depth)
    }
  }

  addSequentialNodes(body, 0)
  return infos
}

function findNestedLeadingCommentTarget(
  comment: ExtractedComment,
  sequentialNodes: SequentialNodeInfo[],
): SequentialNodeInfo | undefined {
  return sequentialNodes
    .filter(node => {
      return node.depth > 0
        && node.startLine === comment.anchorSourceLine
        && node.startColumn >= comment.anchorSourceColumn
    })
    .sort(compareEnclosingSequentialNodes)
    .at(0)
}

function findNestedTrailingCommentTarget(
  comment: ExtractedComment,
  sequentialNodes: SequentialNodeInfo[],
): SequentialNodeInfo | undefined {
  return sequentialNodes
    .filter(node => node.depth > 0 && node.startLine <= comment.anchorSourceLine && node.endLine >= comment.sourceLine)
    .sort(compareEnclosingSequentialNodes)
    .at(0)
}

function compareEnclosingSequentialNodes(a: SequentialNodeInfo, b: SequentialNodeInfo): number {
  if (a.depth !== b.depth) return a.depth - b.depth

  const aSpan = a.endLine - a.startLine
  const bSpan = b.endLine - b.startLine
  if (aSpan !== bSpan) return bSpan - aSpan

  return a.startLine - b.startLine
}

function countBlankLinesBetween(previousEndLine: number, currentStartLine: number, sourceLines: string[]): number {
  let blanks = 0
  for (let line = previousEndLine + 1; line < currentStartLine; line++) {
    if ((sourceLines[line] ?? '').trim() === '') blanks++
  }

  return Math.min(blanks, MAX_BLANK_LINES)
}

function getObjectEntryRange(entry: unknown[], sourceMap: SourceMap): { nodeId: number; start: [number, number]; end: [number, number] } | null {
  if (isAstNode(entry) && entry[0] === 'Spread') {
    const position = sourceMap.positions.get(entry[2])
    return position ? { nodeId: entry[2], start: position.start, end: position.end } : null
  }

  const keyNode = entry[0]
  const valueNode = entry[1]
  if (!isAstNode(keyNode) || !isAstNode(valueNode)) return null

  const keyPosition = sourceMap.positions.get(keyNode[2])
  const valuePosition = sourceMap.positions.get(valueNode[2])
  if (!keyPosition || !valuePosition) return null

  return {
    nodeId: keyNode[2],
    start: keyPosition.start,
    end: valuePosition.end,
  }
}

function isAstNode(value: unknown): value is AstNode {
  return Array.isArray(value) && typeof value[0] === 'string' && typeof value[2] === 'number'
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
