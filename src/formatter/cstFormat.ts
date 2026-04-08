/**
 * CST-based formatter — walks the untyped CST tree and produces a Doc tree.
 *
 * The Doc tree is then rendered to a string by the Wadler-Lindig renderer
 * in doc.ts. The formatter normalizes all structural whitespace to canonical
 * form. Comments are the only authored content that survives formatting,
 * preserved at their logical attachment positions.
 *
 * Key design choices:
 * - Whitespace trivia is ignored (replaced by Doc-generated whitespace)
 * - Block comments (/* ... * /) become Text nodes in the Doc
 * - Line comments (// ...) become LineComment nodes (force hard break)
 * - Blank lines between top-level statements are preserved (up to MAX_BLANK_LINES)
 */

import { MAX_WIDTH } from './config'
import type { UntypedCstNode } from '../cst/builder'
import type { CstToken, TriviaNode } from '../cst/types'
import {
  type Doc,
  concat,
  group,
  hardLine,
  ifBreak,
  join,
  line,
  lineComment,
  nest,
  render,
  softLine,
  text,
} from './doc'

const INDENT = 2

// ---------------------------------------------------------------------------
// Token/node identification helpers
// ---------------------------------------------------------------------------

function isToken(child: CstToken | UntypedCstNode): child is CstToken {
  return 'text' in child && !('kind' in child)
}

function isNode(child: CstToken | UntypedCstNode): child is UntypedCstNode {
  return 'kind' in child
}

/** Get the Nth token from a node's children. */
function nthToken(node: UntypedCstNode, n: number): CstToken {
  let count = 0
  for (const child of node.children) {
    if (isToken(child)) {
      if (count === n) return child
      count++
    }
  }
  throw new Error(`No token at index ${n} in ${node.kind}`)
}

/** Get the Nth child node from a node's children. */
function nthChild(node: UntypedCstNode, n: number): UntypedCstNode {
  let count = 0
  for (const child of node.children) {
    if (isNode(child)) {
      if (count === n) return child
      count++
    }
  }
  throw new Error(`No child node at index ${n} in ${node.kind}`)
}

/** Get all child nodes. */
function childNodes(node: UntypedCstNode): UntypedCstNode[] {
  return node.children.filter(isNode)
}

/** Get all tokens. */
function tokens(node: UntypedCstNode): CstToken[] {
  return node.children.filter(isToken)
}

// ---------------------------------------------------------------------------
// Trivia → Doc conversion
// ---------------------------------------------------------------------------

/** Extract comment Docs from trivia, ignoring whitespace. */
function triviaComments(trivia: TriviaNode[]): Doc[] {
  const docs: Doc[] = []
  for (const t of trivia) {
    if (t.kind === 'lineComment') {
      docs.push(lineComment(t.text))
    } else if (t.kind === 'blockComment') {
      docs.push(text(t.text))
    }
    // whitespace and shebang are ignored — formatting handles spacing
  }
  return docs
}

/** Emit leading comment trivia of a token as Docs. */
function leadingComments(token: CstToken): Doc[] {
  return triviaComments(token.leadingTrivia)
}

/** Emit trailing comment trivia of a token as Docs. */
function trailingComments(token: CstToken): Doc[] {
  return triviaComments(token.trailingTrivia)
}

/**
 * Format a token with its comment trivia preserved.
 * Leading block comments → `/* ... * / token_text`
 * Trailing block comments → `token_text /* ... * /`
 * Trailing line comments are NOT emitted here — they force line breaks
 * that conflict with the enclosing layout (semicolons, statement separators).
 * Containers (program, block body) handle trailing line comments.
 */
function formatTokenWithTrivia(token: CstToken): Doc {
  const tokenDoc = text(token.text)

  // Only emit TRAILING block comments (inline, e.g. `foo(/* arg */ bar)`).
  // Leading comments (both line and block) are handled by containers
  // (program, body, array, etc.) to avoid duplicate emission.
  const trailingBlocks: Doc[] = []
  for (const t of token.trailingTrivia) {
    if (t.kind === 'blockComment') trailingBlocks.push(text(t.text))
  }

  if (trailingBlocks.length === 0) return tokenDoc

  const parts: Doc[] = [tokenDoc]
  for (const c of trailingBlocks) {
    parts.push(text(' '), c)
  }
  return concat(...parts)
}

/**
 * Get the trailing line comment from the last token of a subtree, if any.
 * Used by containers to emit trailing line comments after semicolons.
 */
function getTrailingLineComment(node: UntypedCstNode): string | undefined {
  const tok = lastToken(node)
  for (const t of tok.trailingTrivia) {
    if (t.kind === 'lineComment') return t.text
  }
  return undefined
}

/**
 * Check if a trivia array contains a blank line — a whitespace node with
 * two or more newlines. This detects actual blank lines (empty lines with
 * no content) rather than newlines separated by comments.
 */
function triviaHasBlankLine(trivia: TriviaNode[]): boolean {
  for (const t of trivia) {
    if (t.kind === 'whitespace') {
      let newlines = 0
      for (const ch of t.text) {
        if (ch === '\n') newlines++
        if (newlines >= 2) return true
      }
    }
  }
  return false
}

/**
 * Check if there's a blank line in the gap between two tokens.
 * A blank line occurs when:
 * 1. A single whitespace trivia node has 2+ newlines, OR
 * 2. The trailing trivia ends with a newline AND the leading trivia starts
 *    with a newline (the split convention put one newline on each side)
 */
function hasBlankLineBetweenTokens(prevTrailing: TriviaNode[], nextLeading: TriviaNode[]): boolean {
  if (triviaHasBlankLine(prevTrailing) || triviaHasBlankLine(nextLeading)) return true

  // Check for newline at the boundary: trailing ends with \n and leading starts with \n
  const lastTrailing = prevTrailing[prevTrailing.length - 1]
  const firstLeading = nextLeading[0]
  if (lastTrailing?.kind === 'whitespace' && lastTrailing.text.endsWith('\n')
    && firstLeading?.kind === 'whitespace' && firstLeading.text.startsWith('\n')) {
    return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Get first/last token of a subtree (for trivia access)
// ---------------------------------------------------------------------------

function firstToken(node: UntypedCstNode): CstToken {
  for (const child of node.children) {
    if (isToken(child)) return child
    if (isNode(child)) return firstToken(child)
  }
  throw new Error(`No tokens in ${node.kind}`)
}

function lastToken(node: UntypedCstNode): CstToken {
  for (let i = node.children.length - 1; i >= 0; i--) {
    const child = node.children[i]!
    if (isToken(child)) return child
    if (isNode(child)) return lastToken(child)
  }
  throw new Error(`No tokens in ${node.kind}`)
}

// ---------------------------------------------------------------------------
// ChildIterator — walk untyped tree children by pattern matching
// ---------------------------------------------------------------------------

/**
 * Iterator over an UntypedCstNode's children. Provides helpers to consume
 * tokens by text and collect child nodes, making it easy to destructure
 * untyped tree children positionally.
 */
class ChildIterator {
  private pos = 0
  constructor(private readonly children: (CstToken | UntypedCstNode)[]) {}

  /** True if all children have been consumed. */
  done(): boolean {
    return this.pos >= this.children.length
  }

  /** Peek at the current child without consuming it. */
  peek(): CstToken | UntypedCstNode | undefined {
    return this.children[this.pos]
  }

  /** Consume and return the next child (token or node). */
  next(): CstToken | UntypedCstNode {
    return this.children[this.pos++]!
  }

  /** Consume the next child, expecting it to be a token with the given text. */
  expectToken(tokenText: string): CstToken {
    const child = this.next()
    if (!isToken(child) || child.text !== tokenText) {
      throw new Error(`Expected token '${tokenText}', got ${isToken(child) ? `'${child.text}'` : `node '${(child).kind}'`}`)
    }
    return child
  }

  /** Consume the next child, expecting it to be a token. Returns the token. */
  nextToken(): CstToken {
    const child = this.next()
    if (!isToken(child)) throw new Error(`Expected token, got node '${(child).kind}'`)
    return child
  }

  /** Consume the next child, expecting it to be a node. Returns the node. */
  nextNode(): UntypedCstNode {
    const child = this.next()
    if (!isNode(child)) throw new Error(`Expected node, got token '${(child).text}'`)
    return child
  }

  /** Check if the current child is a token with the given text. */
  isToken(tokenText: string): boolean {
    const child = this.peek()
    return child !== undefined && isToken(child) && child.text === tokenText
  }

  /** Save the current position for later restore. */
  save(): number {
    return this.pos
  }

  /** Restore to a previously saved position. */
  restore(savedPos: number): void {
    this.pos = savedPos
  }

  /** Check if the current child is a node. */
  isNode(): boolean {
    const child = this.peek()
    return child !== undefined && isNode(child)
  }

  /**
   * Collect expression nodes and semicolons from a body until a stop token.
   * Returns the formatted body as a Doc[] (one per statement).
   * Does NOT consume the stop token.
   */
  collectBody(...stopTokens: string[]): Doc[] {
    const stmts: Doc[] = []
    while (!this.done()) {
      const child = this.peek()!
      if (isToken(child) && stopTokens.includes(child.text)) break
      if (isToken(child) && child.text === ';') {
        this.next() // consume semicolon
        continue
      }
      if (isNode(child)) {
        stmts.push(formatNode(this.nextNode()))
      } else {
        this.next() // skip unexpected token
      }
    }
    return stmts
  }
}

/** Format a body (list of statements) with semicolon separators. */
function formatBody(stmts: Doc[]): Doc {
  if (stmts.length === 0) return text('')
  if (stmts.length === 1) return stmts[0]!
  const parts: Doc[] = [stmts[0]!]
  for (let i = 1; i < stmts.length; i++) {
    parts.push(text(';'), hardLine, stmts[i]!)
  }
  return concat(...parts)
}

/**
 * Format a body of statements from an iterator, handling:
 * - Semicolons between statements (always added)
 * - Trailing line comments after statements
 * - Standalone/leading comments between statements
 * - Blank lines between statements (preserved from source)
 *
 * This is the shared logic used by do blocks, if branches, etc.
 * Returns the body as a single Doc.
 */
interface BodyResult {
  doc: Doc
  /** Trailing line comment text from the last statement, if any.
   *  NOT included in `doc` — the container should emit it after `doc`. */
  lastTrailingComment?: string
}

function formatBodyFromIter(iter: ChildIterator, ...stopTokens: string[]): BodyResult {
  return formatBodyFromIterInternal(iter, true, stopTokens)
}

function formatBodyFromIterNoTrailingSemi(iter: ChildIterator, ...stopTokens: string[]): BodyResult {
  return formatBodyFromIterInternal(iter, false, stopTokens)
}

function formatBodyFromIterInternal(iter: ChildIterator, trailingSemi: boolean, stopTokens: string[]): BodyResult {
  const stmts: UntypedCstNode[] = []
  const semiTokens: CstToken[] = []

  // Collect statements and semicolons until stop token
  while (!iter.done()) {
    const child = iter.peek()!
    if (isToken(child) && stopTokens.includes(child.text)) break
    if (isToken(child) && child.text === ';') {
      semiTokens.push(child)
      iter.next()
      continue
    }
    if (isToken(child) && child.text === 'with') {
      // `with handler...end` as a body statement — collect `with` token
      // and attach it as a prefix to the next statement node.
      iter.next()
      if (iter.isNode()) {
        const node = iter.nextNode()
        // Create a synthetic node that wraps with + handler
        const withStmt: UntypedCstNode = { kind: 'WithStatement', children: [child, node] }
        stmts.push(withStmt)
      }
    } else if (isNode(child)) {
      stmts.push(iter.nextNode())
    } else {
      iter.next() // skip unexpected token
    }
  }

  if (stmts.length === 0) return { doc: text('') }

  const parts: Doc[] = []

  // Emit leading comments on the FIRST statement
  if (stmts.length > 0) {
    const firstTrivia = firstToken(stmts[0]!).leadingTrivia
    emitTriviaWithBlankLines(firstTrivia, parts)
  }

  for (let i = 0; i < stmts.length; i++) {
    const stmt = stmts[i]!
    parts.push(formatNode(stmt))

    // Add semicolon: always between statements, optionally after last
    if (i < stmts.length - 1 || trailingSemi) {
      parts.push(text(';'))
    }

    // Trailing line comment on this statement
    const stmtTrailingComment = getTrailingLineComment(stmt)
    const semiTrailingComment = i < semiTokens.length
      ? semiTokens[i]!.trailingTrivia.find(t => t.kind === 'lineComment')?.text
      : undefined
    const trailingLc = stmtTrailingComment ?? semiTrailingComment

    // For the LAST statement, don't emit the trailing comment in the doc —
    // return it separately so the container can place it correctly
    // (avoiding double newlines from lineComment + container's hardLine).
    if (trailingLc && i < stmts.length - 1) {
      parts.push(text(' '), lineComment(trailingLc))
    }

    if (i < stmts.length - 1) {
      // Check for blank lines between statements
      const nextFirst = firstToken(stmts[i + 1]!)
      const semi = i < semiTokens.length ? semiTokens[i] : undefined
      const prevTok = semi ?? lastToken(stmt)

      const hasBlank = hasBlankLineBetweenTokens(prevTok.trailingTrivia, nextFirst.leadingTrivia)

      if (trailingLc) {
        if (hasBlank) parts.push(hardLine)
      } else if (hasBlank) {
        parts.push(hardLine, hardLine)
      } else {
        parts.push(hardLine)
      }

      // Leading comments before next statement
      const nextTrivia = nextFirst.leadingTrivia
      for (let t = 0; t < nextTrivia.length; t++) {
        const tv = nextTrivia[t]!
        if (tv.kind === 'lineComment') {
          parts.push(lineComment(tv.text))
          const nextWs = nextTrivia[t + 1]
          if (nextWs?.kind === 'whitespace' && triviaHasBlankLine([nextWs])) {
            parts.push(hardLine)
          }
        } else if (tv.kind === 'blockComment') {
          parts.push(text(tv.text), hardLine)
        } else if (tv.kind === 'whitespace' && triviaHasBlankLine([tv])) {
          const nextTv = nextTrivia[t + 1]
          if (nextTv && (nextTv.kind === 'lineComment' || nextTv.kind === 'blockComment')) {
            parts.push(hardLine)
          }
        }
      }
    }
  }

  // Extract last statement's trailing comment (not included in parts)
  const lastStmt = stmts[stmts.length - 1]!
  const lastSemi = semiTokens[stmts.length - 1]
  const lastTrailingLc = getTrailingLineComment(lastStmt)
    ?? lastSemi?.trailingTrivia.find(t => t.kind === 'lineComment')?.text
  return { doc: concat(...parts), lastTrailingComment: lastTrailingLc }
}

// ---------------------------------------------------------------------------
// Main formatting dispatch
// ---------------------------------------------------------------------------

export function formatCst(tree: UntypedCstNode, trailingTrivia: TriviaNode[]): string {
  const doc = formatProgram(tree, trailingTrivia)
  let result = render(doc, MAX_WIDTH)
  // Post-processing
  result = result
    .replace(/[ \t]+$/gm, '') // strip trailing whitespace on each line
    .replace(/^\n+/, '') // strip leading blank lines
  // Ensure trailing newline
  if (result.length > 0 && !result.endsWith('\n')) result += '\n'
  return result
}

function formatProgram(program: UntypedCstNode, trailingTrivia: TriviaNode[]): Doc {
  const statements = childNodes(program)
  if (statements.length === 0) {
    // File with only comments/shebang or empty
    const parts: Doc[] = []
    for (let i = 0; i < trailingTrivia.length; i++) {
      const t = trailingTrivia[i]!
      if (t.kind === 'shebang') {
        parts.push(text(t.text), hardLine)
      } else if (t.kind === 'lineComment') {
        parts.push(lineComment(t.text))
      } else if (t.kind === 'blockComment') {
        parts.push(text(t.text), hardLine)
      } else if (t.kind === 'whitespace' && triviaHasBlankLine([t])) {
        // Preserve blank lines between comments
        const nextT = trailingTrivia[i + 1]
        if (nextT && (nextT.kind === 'lineComment' || nextT.kind === 'blockComment')) {
          parts.push(hardLine)
        }
      }
    }
    if (parts.length === 0) return text('')
    return concat(...parts)
  }

  // Check for shebang in leading trivia of the first token
  const first = firstToken(program)
  const shebangDocs: Doc[] = []
  for (const t of first.leadingTrivia) {
    if (t.kind === 'shebang') {
      shebangDocs.push(text(t.text), hardLine)
    }
  }

  const parts: Doc[] = [...shebangDocs]

  // Emit file-level leading comments (before first statement) with blank lines
  const firstTrivia = firstToken(statements[0]!).leadingTrivia
  emitTriviaWithBlankLines(firstTrivia, parts)

  // Format statements: always add `;` after each statement (including last).
  // Trailing line comments go after the `;` on the same line.
  // Preserve blank lines between statements from the original source.
  const semicolonTokens = tokens(program)
  let lastTrailingComment: string | undefined
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i]!
    parts.push(formatNode(stmt))
    parts.push(text(';'))

    // Trailing comments on the statement's last token or on the semicolon
    const stmtTrailingComment = getTrailingLineComment(stmt)
    const semiToken = i < semicolonTokens.length ? semicolonTokens[i] : undefined
    const semiTrailingLine = semiToken?.trailingTrivia.find(t => t.kind === 'lineComment')?.text
    const semiTrailingBlocks = semiToken?.trailingTrivia.filter(t => t.kind === 'blockComment') ?? []
    const trailingComment = stmtTrailingComment ?? semiTrailingLine
    lastTrailingComment = trailingComment

    // Emit trailing block comments from semicolon (e.g., `1; /* note */`)
    for (const bc of semiTrailingBlocks) {
      parts.push(text(' '), text(bc.text))
    }
    // Emit trailing line comment
    if (trailingComment) {
      parts.push(text(' '), lineComment(trailingComment))
    }

    if (i < statements.length - 1) {
      // Check for blank lines between statements
      const lastTok = lastToken(stmt)
      const nextFirst = firstToken(statements[i + 1]!)
      const prevTok = semiToken ?? lastTok

      const hasBlank = hasBlankLineBetweenTokens(prevTok.trailingTrivia, nextFirst.leadingTrivia)

      // If a trailing line comment was emitted, it already forced a newline.
      // Only emit an additional hardLine for blank lines.
      if (trailingComment) {
        if (hasBlank) parts.push(hardLine) // one extra = blank line
      } else if (hasBlank) {
        parts.push(hardLine, hardLine)
      } else {
        parts.push(hardLine)
      }

      // Leading comments before next statement, with blank lines preserved
      const nextTrivia = nextFirst.leadingTrivia
      for (let t = 0; t < nextTrivia.length; t++) {
        const trivia = nextTrivia[t]!
        if (trivia.kind === 'lineComment') {
          parts.push(lineComment(trivia.text))
          // Check if there's a blank line after this comment (before the next content)
          const nextWs = nextTrivia[t + 1]
          if (nextWs && nextWs.kind === 'whitespace' && triviaHasBlankLine([nextWs])) {
            parts.push(hardLine)
          }
        } else if (trivia.kind === 'blockComment') {
          parts.push(text(trivia.text), hardLine)
        }
        // Whitespace trivia with blank lines before comments
        if (trivia.kind === 'whitespace' && triviaHasBlankLine([trivia])) {
          const nextTriv = nextTrivia[t + 1]
          if (nextTriv && (nextTriv.kind === 'lineComment' || nextTriv.kind === 'blockComment')) {
            parts.push(hardLine) // blank line before the comment
          }
        }
      }
    }
  }

  // File-level trailing comments (after last statement) with blank lines
  const hasEpilogueComments = trailingTrivia.some(t => t.kind === 'lineComment' || t.kind === 'blockComment')
  if (hasEpilogueComments) {
    if (!lastTrailingComment) {
      parts.push(hardLine)
    }
    emitTriviaWithBlankLines(trailingTrivia, parts)
  }

  return concat(...parts)
}

function formatNode(node: UntypedCstNode): Doc {
  switch (node.kind) {
    // -- Leaf nodes --
    case 'NumberLiteral':
    case 'StringLiteral':
    case 'TemplateString':
    case 'RegexpShorthand':
    case 'Symbol':
    case 'EffectName':
    case 'ReservedSymbol':
      return formatLeaf(node)

    // -- Collections --
    case 'Array':
      return formatArray(node)
    case 'Object':
      return formatObject(node)

    // -- Operators --
    case 'BinaryOp':
      return formatBinaryOp(node)
    case 'PrefixOp':
      return formatPrefixOp(node)

    // -- Access and call --
    case 'PropertyAccess':
      return formatPropertyAccess(node)
    case 'IndexAccess':
      return formatIndexAccess(node)
    case 'Call':
      return formatCall(node)

    // -- Grouping --
    case 'Parenthesized':
      return formatParenthesized(node)

    // -- Spread --
    case 'Spread':
      return formatSpread(node)

    // -- Let --
    case 'Let':
      return formatLet(node)

    // -- Control flow --
    case 'If':
      return formatIf(node)
    case 'Block':
      return formatBlock(node)
    case 'Loop':
      return formatLoop(node)
    case 'For':
      return formatFor(node)
    case 'Match':
      return formatMatch(node)

    // -- Functions --
    case 'Function':
      return formatFunction(node)

    // -- Effects --
    case 'Handler':
      return formatHandler(node)
    case 'Resume':
      return formatResume(node)

    // -- Macros --
    case 'Macro':
      return formatMacro(node)
    case 'MacroCall':
      return formatMacroCall(node)

    // -- Quote / Splice --
    case 'Quote':
      return formatQuote(node)

    default:
      // Fallback: concatenate all token texts
      return formatFallback(node)
  }
}

// ---------------------------------------------------------------------------
// Leaf formatters
// ---------------------------------------------------------------------------

function formatLeaf(node: UntypedCstNode): Doc {
  const tok = nthToken(node, 0)
  return formatTokenWithTrivia(tok)
}

// ---------------------------------------------------------------------------
// Collection formatters
// ---------------------------------------------------------------------------

function formatArray(node: UntypedCstNode): Doc {
  const children = childNodes(node)

  if (children.length === 0) {
    return text('[]')
  }

  // Build items with trivia from delimiter tokens preserved
  const items: Doc[] = []
  const toks = tokens(node)
  // Tokens: [, commas..., ]
  // First token is [, last is ], middle are commas
  const commaTokens = toks.filter(t => t.text === ',')

  for (let i = 0; i < children.length; i++) {
    const itemDoc = formatNode(children[i]!)
    // Check for comment trivia on the comma before this element
    if (i > 0 && i - 1 < commaTokens.length) {
      const comma = commaTokens[i - 1]!
      const trailingCmts = trailingComments(comma)
      if (trailingCmts.length > 0) {
        items.push(concat(...trailingCmts, text(' '), itemDoc))
        continue
      }
    }
    // Check for comment trivia on the element's first token
    const firstTok = firstToken(children[i]!)
    const leadingCmts = leadingComments(firstTok)
    if (leadingCmts.length > 0) {
      items.push(concat(...leadingCmts, text(' '), itemDoc))
      continue
    }
    items.push(itemDoc)
  }

  // Build separator docs — preserve blank lines between entries
  const separators: Doc[] = []
  for (let i = 0; i < children.length - 1; i++) {
    const comma = i < commaTokens.length ? commaTokens[i] : undefined
    const prevLast = lastToken(children[i]!)
    const nextFirst = firstToken(children[i + 1]!)
    const hasBlank = comma
      ? hasBlankLineBetweenTokens(comma.trailingTrivia, nextFirst.leadingTrivia)
      : hasBlankLineBetweenTokens(prevLast.trailingTrivia, nextFirst.leadingTrivia)
    separators.push(hasBlank ? concat(text(','), hardLine, hardLine) : concat(text(','), line))
  }

  // Join items with their separators
  const innerParts: Doc[] = [items[0]!]
  for (let i = 1; i < items.length; i++) {
    innerParts.push(separators[i - 1]!, items[i]!)
  }

  // Trailing comma when array breaks to multiline
  const trailingComma = ifBreak(text(','), text(''))

  return group(concat(
    text('['),
    nest(INDENT, concat(softLine, concat(...innerParts), trailingComma)),
    softLine,
    text(']'),
  ))
}

function formatObject(node: UntypedCstNode): Doc {
  // Object children: {, [key_tok, :, value_node | Spread_node], [,], ..., }
  // Walk children to reconstruct entries.
  const iter = new ChildIterator(node.children)
  iter.expectToken('{')

  const entries: Doc[] = []
  let pendingCommentDocs: Doc[] = []
  while (!iter.done() && !iter.isToken('}')) {
    if (iter.isToken(',')) {
      const comma = iter.nextToken()
      // Check for block comments on comma (e.g., `x: 1, /*y*/ y: 2`)
      for (const t of comma.trailingTrivia) {
        if (t.kind === 'blockComment') {
          pendingCommentDocs.push(text(t.text), text(' '))
        }
      }
      continue
    }
    // Spread entry
    if (iter.isNode() && (iter.peek() as UntypedCstNode).kind === 'Spread') {
      entries.push(formatNode(iter.nextNode()))
      continue
    }
    // Key-value entry: key [: value] or key [as alias]
    // Key can be a token (symbol) or a node (string, template, computed)
    const entryParts: Doc[] = []
    // Collect key
    if (iter.isNode()) {
      entryParts.push(formatNode(iter.nextNode()))
    } else {
      entryParts.push(text(iter.nextToken().text))
    }
    // Check for computed key brackets
    if (iter.isToken('[')) {
      // Computed key was already handled — skip
    }
    // Check for colon
    if (iter.isToken(':')) {
      iter.next() // consume :
      entryParts.push(text(': '))
      // Value is the next node
      if (iter.isNode()) {
        entryParts.push(formatNode(iter.nextNode()))
      }
    }
    if (pendingCommentDocs.length > 0) {
      entries.push(concat(...pendingCommentDocs, ...entryParts))
      pendingCommentDocs = []
    } else {
      entries.push(concat(...entryParts))
    }
  }

  iter.expectToken('}')

  if (entries.length === 0) {
    return text('{}')
  }

  // Objects use spaces inside braces: { a: 1, b: 2 }
  // Trailing comma in multiline mode
  const trailingComma = ifBreak(text(','), text(''))
  return group(concat(
    text('{'),
    nest(INDENT, concat(line, join(concat(text(','), line), entries), trailingComma)),
    line,
    text('}'),
  ))
}

// ---------------------------------------------------------------------------
// Operator formatters
// ---------------------------------------------------------------------------

function formatBinaryOp(node: UntypedCstNode): Doc {
  const children = childNodes(node)
  const toks = tokens(node)

  if (toks.length > 0) {
    // Regular binary operator: [left_node, op_token, right_node]
    const left = children[0]!
    const right = children[1]!
    const opText = toks[0]!.text

    return group(concat(
      formatNode(left),
      text(' '),
      text(opText),
      nest(INDENT, concat(line, formatNode(right))),
    ))
  }

  // Infix function call: [left_node, Symbol_node, right_node]
  if (children.length >= 3) {
    const left = children[0]!
    const op = children[1]!
    const right = children[2]!
    return group(concat(
      formatNode(left),
      text(' '),
      formatNode(op),
      nest(INDENT, concat(line, formatNode(right))),
    ))
  }

  // Fallback
  return formatFromChildren(node)
}

function formatPrefixOp(node: UntypedCstNode): Doc {
  const operand = nthChild(node, 0)
  const opToken = nthToken(node, 0)
  return concat(text(opToken.text), formatNode(operand))
}

// ---------------------------------------------------------------------------
// Access and call formatters
// ---------------------------------------------------------------------------

function formatPropertyAccess(node: UntypedCstNode): Doc {
  const object = nthChild(node, 0)
  const toks = tokens(node)
  // tokens: dot, property name
  const propToken = toks.length >= 2 ? toks[1]! : toks[0]!
  return concat(formatNode(object), text('.'), text(propToken.text))
}

function formatIndexAccess(node: UntypedCstNode): Doc {
  const object = nthChild(node, 0)
  const index = nthChild(node, 1)
  return concat(formatNode(object), text('['), formatNode(index), text(']'))
}

function formatCall(node: UntypedCstNode): Doc {
  const children = childNodes(node)
  const fn = children[0]!
  const args = children.slice(1)
  // Get ( and ) tokens for trivia
  const toks = tokens(node)
  const openParen = toks.find(t => t.text === '(')
  const closeParen = toks.find(t => t.text === ')')

  if (args.length === 0) {
    return concat(
      formatNode(fn),
      openParen ? formatTokenWithTrivia(openParen) : text('('),
      closeParen ? formatTokenWithTrivia(closeParen) : text(')'),
    )
  }

  // Build argument docs with comment trivia from comma/delimiter tokens
  const commaTokens = toks.filter(t => t.text === ',')
  const argDocs: Doc[] = []
  for (let i = 0; i < args.length; i++) {
    const argDoc = formatNode(args[i]!)
    // Check for comment trivia on the comma before this arg
    if (i > 0 && i - 1 < commaTokens.length) {
      const comma = commaTokens[i - 1]!
      const trailingBlocks = comma.trailingTrivia.filter(t => t.kind === 'blockComment')
      if (trailingBlocks.length > 0) {
        argDocs.push(concat(...trailingBlocks.map(t => concat(text(t.text), text(' '))), argDoc))
        continue
      }
    }
    argDocs.push(argDoc)
  }

  const openDoc = openParen ? formatTokenWithTrivia(openParen) : text('(')

  // Trailing lambda pattern: when the last arg is a lambda (Function node)
  // and there are 2+ args, keep leading args on the opening line.
  // Format: `fn(arg1, arg2, -> do\n  body\nend)`
  const lastArg = args[args.length - 1]!
  const isTrailingLambda = args.length >= 2
    && (lastArg.kind === 'Function')
    // Check if the lambda body contains a Block (do...end)
    && childNodes(lastArg).some(c => c.kind === 'Block')

  if (isTrailingLambda) {
    const leadingArgDocs = argDocs.slice(0, -1)
    const trailingArgDoc = argDocs[argDocs.length - 1]!
    return group(concat(
      formatNode(fn),
      openDoc,
      join(concat(text(','), text(' ')), leadingArgDocs),
      text(', '),
      trailingArgDoc,
      closeParen ? formatTokenWithTrivia(closeParen) : text(')'),
    ))
  }

  return concat(
    formatNode(fn),
    group(concat(
      openDoc,
      nest(INDENT, concat(softLine, join(concat(text(','), line), argDocs))),
      softLine,
      closeParen ? formatTokenWithTrivia(closeParen) : text(')'),
    )),
  )
}

// ---------------------------------------------------------------------------
// Grouping formatters
// ---------------------------------------------------------------------------

function formatParenthesized(node: UntypedCstNode): Doc {
  const inner = nthChild(node, 0)
  return concat(text('('), formatNode(inner), text(')'))
}

function formatSpread(node: UntypedCstNode): Doc {
  const expr = nthChild(node, 0)
  return concat(text('...'), formatNode(expr))
}

// ---------------------------------------------------------------------------
// Let formatter
// ---------------------------------------------------------------------------

function formatLet(node: UntypedCstNode): Doc {
  // Children: `let` token, binding target (tokens/nodes), `=` token, value node
  // The binding target is everything between `let` and `=`.
  // The value expression is the last child node.
  const iter = new ChildIterator(node.children)
  iter.expectToken('let')

  // Collect binding target parts (everything until the top-level `=`).
  // Default values inside binding patterns (e.g. `{ role = "guest" }`)
  // also use `=`, so we track bracket depth to find the right one.
  const targetParts: Doc[] = []
  let lastTargetText = ''
  let bracketDepth = 0
  while (!iter.done() && !(iter.isToken('=') && bracketDepth === 0)) {
    const peeked = iter.peek()!
    if (isToken(peeked) && (peeked.text === '[' || peeked.text === '{')) bracketDepth++
    if (isToken(peeked) && (peeked.text === ']' || peeked.text === '}')) bracketDepth--
    const child = iter.next()
    if (isToken(child)) {
      const t = child.text
      // Add space unless current is punctuation or previous was open bracket
      // Special case: `{` and `}` in object destructuring get spaces inside
      if (t === '{') {
        if (targetParts.length > 0) targetParts.push(text(' '))
        targetParts.push(text('{ '))
        lastTargetText = '{ '
        continue
      }
      if (t === '}') {
        targetParts.push(text(' }'))
        lastTargetText = '}'
        continue
      }
      if (t === ',') {
        targetParts.push(text(', '))
        lastTargetText = ', '
        continue
      }
      if (targetParts.length > 0 && !isPunctuation(t) && !isOpenBracket(lastTargetText)
        && !lastTargetText.endsWith(' ')) {
        targetParts.push(text(' '))
      }
      targetParts.push(text(t))
      lastTargetText = t
    } else {
      // Add space before node unless previous was open bracket or already ends with space
      if (targetParts.length > 0 && !isOpenBracket(lastTargetText) && !lastTargetText.endsWith(' ')) {
        targetParts.push(text(' '))
      }
      targetParts.push(formatNode(child))
      lastTargetText = ''
    }
  }

  iter.expectToken('=')

  // Value is the remaining node
  const value = iter.nextNode()

  const header = concat(text('let'), text(' '), concat(...targetParts), text(' = '))
  const valueDoc = formatNode(value)

  // For Function/Block values (lambda with do-block), don't break at `=`.
  // The value's internal formatting handles its own indentation.
  if (value.kind === 'Function' || value.kind === 'Block') {
    return concat(header, valueDoc)
  }

  // For Array/Object values, keep `= [` or `= {` on the opening line.
  if (value.kind === 'Array' || value.kind === 'Object') {
    return concat(header, valueDoc)
  }

  // For other values: try flat, break at `=` if too long
  return group(concat(
    text('let'),
    text(' '),
    concat(...targetParts),
    text(' ='),
    nest(INDENT, concat(line, valueDoc)),
  ))
}

// ---------------------------------------------------------------------------
// Control flow formatters
// ---------------------------------------------------------------------------

function formatIf(node: UntypedCstNode): Doc {
  // Children: if, condition, then, body..., [else, [if, condition, then, body...]]..., end
  const iter = new ChildIterator(node.children)

  // Collect branches
  interface Branch {
    isElseIf: boolean
    condition: Doc
    bodyDoc: Doc
    bodyCount: number
    lastTrailingComment?: string
  }
  const branches: Branch[] = []
  let elseBranchDoc: Doc | undefined
  let elseBranchCount = 0
  let elseLastComment: string | undefined

  while (!iter.done()) {
    const child = iter.peek()!
    if (isToken(child) && child.text === 'end') break

    if (isToken(child) && child.text === 'else') {
      iter.next() // consume 'else'
      if (iter.isToken('if')) {
        // else-if: continue to parse the next if branch
      } else {
        // Final else branch — use formatBodyFromIter for comment handling
        elseBranchCount = countNodesUntil(iter, 'end')
        const elseResult = formatBodyFromIterNoTrailingSemi(iter, 'end')
        elseBranchDoc = elseResult.doc
        elseLastComment = elseResult.lastTrailingComment
        break
      }
    }

    if (isToken(iter.peek()!) && (iter.peek() as CstToken).text === 'if') {
      iter.next() // consume 'if'
      const condition = iter.nextNode()
      iter.expectToken('then')
      const bodyCount = countNodesUntil(iter, 'else', 'end')
      const bodyResult = formatBodyFromIterNoTrailingSemi(iter, 'else', 'end')
      branches.push({ isElseIf: branches.length > 0, condition: formatNode(condition), bodyDoc: bodyResult.doc, bodyCount, lastTrailingComment: bodyResult.lastTrailingComment })
    }
  }

  iter.expectToken('end')

  // Simple if/then/[else]/end with single-expression bodies: try flat
  // Collect all trailing comments for emission after `end`
  const allTrailingComments = [
    branches[0]?.lastTrailingComment,
    elseLastComment,
  ].filter(Boolean) as string[]
  const trailingCmtDoc = allTrailingComments.length > 0
    ? concat(text(' '), text(allTrailingComments.join(' ')))
    : text('')

  if (branches.length === 1 && branches[0]!.bodyCount === 1
    && (elseBranchDoc === undefined || elseBranchCount === 1)) {
    const b = branches[0]!
    const flatParts = [text('if '), b.condition, text(' then '), b.bodyDoc]
    if (elseBranchDoc) {
      flatParts.push(text(' else '), elseBranchDoc)
    }
    flatParts.push(text(' end'), trailingCmtDoc)

    const expandedParts: Doc[] = [text('if '), b.condition, text(' then')]
    expandedParts.push(nest(INDENT, concat(hardLine, b.bodyDoc)))
    if (b.lastTrailingComment) {
      expandedParts.push(text(' '), text(b.lastTrailingComment))
    }
    if (elseBranchDoc) {
      expandedParts.push(hardLine, text('else'))
      expandedParts.push(nest(INDENT, concat(hardLine, elseBranchDoc)))
      if (elseLastComment) expandedParts.push(text(' '), text(elseLastComment))
    }
    expandedParts.push(hardLine, text('end'))

    return group(concat(
      ifBreak(concat(...expandedParts), concat(...flatParts)),
    ))
  }

  // Complex if: always expand
  const parts: Doc[] = []
  for (const b of branches) {
    if (b.isElseIf) {
      parts.push(hardLine, text('else if '), b.condition, text(' then'))
    } else {
      parts.push(text('if '), b.condition, text(' then'))
    }
    parts.push(nest(INDENT, concat(hardLine, b.bodyDoc)))
    // Trailing comment from this branch's body
    if (b.lastTrailingComment) {
      parts.push(text(' '), text(b.lastTrailingComment))
    }
  }
  if (elseBranchDoc) {
    parts.push(hardLine, text('else'))
    parts.push(nest(INDENT, concat(hardLine, elseBranchDoc)))
    if (elseLastComment) parts.push(text(' '), text(elseLastComment))
  }
  parts.push(hardLine, text('end'))
  return concat(...parts)
}

function formatBlock(node: UntypedCstNode): Doc {
  // Children: do, [with, handler, ;], body..., end
  const iter = new ChildIterator(node.children)
  iter.expectToken('do')

  // Check for `with handler;` clause
  let withClause: Doc | undefined
  if (iter.isToken('with')) {
    iter.next() // consume 'with'
    const handler = iter.nextNode()
    iter.expectToken(';')
    withClause = concat(text('with '), formatNode(handler), text(';'))
  }

  const bodyStmtCount = countNodesUntil(iter, 'end')
  // Always use trailing ; for expanded blocks
  const bodyResult = formatBodyFromIter(iter, 'end')
  const bodyDoc = bodyResult.doc
  iter.expectToken('end')

  if (bodyDoc.type === 'text' && bodyDoc.text === '') {
    if (withClause) {
      return concat(text('do'), nest(INDENT, concat(hardLine, withClause)), hardLine, text('end'))
    }
    return text('do end')
  }

  // Single expression without with clause: try flat `do expr end`
  // But force expansion if body has leading comments (they'd be lost in flat mode).
  if (bodyStmtCount === 1 && !withClause) {
    // Check if body has leading comments (on the first token of the body statement)
    const bodyNodes = node.children.filter(isNode).filter(c => (c).kind !== 'Block')
    const bodyFirstTok = bodyNodes.length > 0 ? firstToken(bodyNodes[bodyNodes.length - 1]!) : undefined
    const hasLeadingComments = bodyFirstTok?.leadingTrivia.some(t => t.kind === 'lineComment' || t.kind === 'blockComment')

    if (!hasLeadingComments) {
      // Flat: `do expr end`. Expanded: `do\n  expr;\nend`
      const flatBodyDoc = bodyNodes.length > 0 ? formatNode(bodyNodes[bodyNodes.length - 1]!) : bodyDoc
      return group(concat(
        text('do'),
        nest(INDENT, concat(line, ifBreak(bodyDoc, flatBodyDoc))),
        bodyResult.lastTrailingComment
          ? concat(text(' '), text(bodyResult.lastTrailingComment), hardLine)
          : line,
        text('end'),
      ))
    }
  }

  const inner = withClause
    ? concat(hardLine, withClause, hardLine, bodyDoc)
    : concat(hardLine, bodyDoc)

  const trailingCmt = bodyResult.lastTrailingComment
    ? concat(text(' '), text(bodyResult.lastTrailingComment))
    : text('')
  return concat(text('do'), nest(INDENT, inner), trailingCmt, hardLine, text('end'))
}

function formatLoop(node: UntypedCstNode): Doc {
  // Children: loop, (, bindings..., ), ->, body
  return formatFromChildren(node)
}

function formatFor(node: UntypedCstNode): Doc {
  // Children: for, (, bindings..., ), ->, body
  return formatFromChildren(node)
}

function formatMatch(node: UntypedCstNode): Doc {
  // Children: match, expression, case, pattern, [when, guard], then, body..., ..., end
  const iter = new ChildIterator(node.children)
  iter.expectToken('match')
  const expr = iter.nextNode()
  const parts: Doc[] = [text('match '), formatNode(expr)]

  // Parse cases
  while (!iter.done() && !iter.isToken('end')) {
    if (iter.isToken('case')) {
      iter.next() // consume 'case'

      // Collect pattern (tokens and nodes until 'when' or 'then')
      const patternParts: Doc[] = []
      while (!iter.done() && !iter.isToken('then') && !iter.isToken('when')) {
        const child = iter.next()
        if (isToken(child)) {
          if (patternParts.length > 0 && !isPunctuation(child.text)) patternParts.push(text(' '))
          patternParts.push(text(child.text))
        } else {
          if (patternParts.length > 0) patternParts.push(text(' '))
          patternParts.push(formatNode(child))
        }
      }

      // Optional when guard
      let guardDoc: Doc | undefined
      if (iter.isToken('when')) {
        iter.next() // consume 'when'
        const guard = iter.nextNode()
        guardDoc = concat(text(' when '), formatNode(guard))
      }

      iter.expectToken('then')
      const body = iter.collectBody('case', 'end')

      parts.push(nest(INDENT, concat(
        hardLine,
        text('case '),
        concat(...patternParts),
        guardDoc ?? text(''),
        text(' then'),
        body.length === 1
          ? concat(text(' '), body[0]!)
          : nest(INDENT, concat(hardLine, formatBody(body))),
      )))
    } else {
      iter.next() // skip unexpected
    }
  }

  iter.expectToken('end')
  parts.push(hardLine, text('end'))
  return concat(...parts)
}

// ---------------------------------------------------------------------------
// Function formatters
// ---------------------------------------------------------------------------

function formatFunction(node: UntypedCstNode): Doc {
  // Children: [(], params..., [)], ->, body
  // Shorthand: ->, body (no params)
  // Single param: symbol, ->, body (no parens)
  const iter = new ChildIterator(node.children)

  // Collect parameter section (everything before `->`)
  const paramParts: Doc[] = []
  while (!iter.done() && !iter.isToken('->')) {
    const child = iter.next()
    if (isToken(child)) {
      if (child.text === '(' || child.text === ')') {
        paramParts.push(text(child.text))
      } else if (child.text === ',') {
        paramParts.push(text(','))
        paramParts.push(text(' '))
      } else if (child.text === '...') {
        paramParts.push(text('...'))
      } else if (child.text === '=') {
        paramParts.push(text(' = '))
      } else {
        if (paramParts.length > 0 && !isPunctuation(child.text)) paramParts.push(text(' '))
        paramParts.push(text(child.text))
      }
    } else {
      paramParts.push(formatNode(child))
    }
  }

  iter.expectToken('->')
  const body = iter.nextNode()

  return group(concat(
    ...paramParts,
    paramParts.length > 0 ? text(' ') : text(''),
    text('->'),
    text(' '),
    formatNode(body),
  ))
}

function formatHandler(node: UntypedCstNode): Doc {
  // Children: [shallow], handler, @effect(params) -> body, ..., [transform param -> body], end
  const iter = new ChildIterator(node.children)
  const parts: Doc[] = []

  // Optional shallow keyword
  if (iter.isToken('shallow')) {
    iter.next()
    parts.push(text('shallow '))
  }

  iter.expectToken('handler')
  parts.push(text('handler'))

  // Parse clauses and transform until `end`
  const clauseParts: Doc[] = []
  while (!iter.done() && !iter.isToken('end')) {
    if (iter.isToken('transform')) {
      iter.next() // consume 'transform'
      // Collect transform param and body
      const transformParts: Doc[] = [text('transform')]
      while (!iter.done() && !iter.isToken('end')) {
        const child = iter.next()
        if (isToken(child)) {
          if (child.text === '->') {
            transformParts.push(text(' -> '))
          } else {
            transformParts.push(text(' '), text(child.text))
          }
        } else {
          transformParts.push(text(' '), formatNode(child))
        }
      }
      clauseParts.push(concat(...transformParts))
    } else {
      // Parse effect clause: @effect(params) -> body
      const clauseTokens: Doc[] = []
      while (!iter.done() && !iter.isToken('end') && !iter.isToken('transform')) {
        const child = iter.peek()!
        // Check if this is the start of a new clause (@effect)
        if (isToken(child) && child.text.startsWith('@') && clauseTokens.length > 0) break
        iter.next()
        if (isToken(child)) {
          if (child.text === '->') {
            clauseTokens.push(text(' -> '))
          } else if (child.text === ',' || child.text === '(' || child.text === ')') {
            clauseTokens.push(text(child.text))
          } else {
            if (clauseTokens.length > 0) clauseTokens.push(text(' '))
            clauseTokens.push(text(child.text))
          }
        } else {
          clauseTokens.push(formatNode(child))
        }
      }
      if (clauseTokens.length > 0) {
        clauseParts.push(concat(...clauseTokens))
      }
    }
  }

  iter.expectToken('end')

  if (clauseParts.length === 0) {
    return concat(...parts, text(' end'))
  }

  // Multi-clause: indent each clause
  return concat(
    ...parts,
    nest(INDENT, concat(...clauseParts.map(c => concat(hardLine, c)))),
    hardLine,
    text('end'),
  )
}

function formatResume(node: UntypedCstNode): Doc {
  // Children: resume, [(, expr, )] or just resume (bare)
  const iter = new ChildIterator(node.children)
  iter.expectToken('resume')
  if (iter.isToken('(')) {
    iter.next() // consume (
    if (iter.isNode()) {
      const arg = iter.nextNode()
      iter.expectToken(')')
      return concat(text('resume('), formatNode(arg), text(')'))
    }
    iter.expectToken(')')
    return text('resume()')
  }
  return text('resume')
}

// ---------------------------------------------------------------------------
// Macro formatters
// ---------------------------------------------------------------------------

function formatMacro(node: UntypedCstNode): Doc {
  // Children: macro (or macro@name), [(], params..., [)], ->, body
  // Same structure as Function but with macro keyword
  return formatFromChildren(node)
}

function formatMacroCall(node: UntypedCstNode): Doc {
  const children = childNodes(node)
  const prefixToken = nthToken(node, 0)
  if (children.length > 0) {
    return concat(text(prefixToken.text), text(' '), formatNode(children[0]!))
  }
  return text(prefixToken.text)
}

// ---------------------------------------------------------------------------
// Quote formatter
// ---------------------------------------------------------------------------

function formatQuote(node: UntypedCstNode): Doc {
  // Children: quote, body tokens/nodes..., end
  // Quote collects all internal tokens including nested blocks.
  // Use the generic fallback for now — quote bodies are complex.
  return formatFromChildren(node)
}

// ---------------------------------------------------------------------------
// Fallback: reconstruct from children (preserves original tokens)
// ---------------------------------------------------------------------------

/**
 * Generic formatter that reconstructs output from children in order.
 * Tokens are emitted with proper spacing, child nodes are recursively formatted.
 * This is used for complex constructs where specialized formatting hasn't been
 * implemented yet — it produces correct (lossless-ish) but unformatted output.
 */
function formatFromChildren(node: UntypedCstNode): Doc {
  const parts: Doc[] = []
  let hasPrev = false

  for (const child of node.children) {
    if (isToken(child)) {
      // Add space before tokens (except punctuation that doesn't need it)
      if (hasPrev && parts.length > 0 && !isPunctuation(child.text)) {
        parts.push(text(' '))
      }
      parts.push(formatTokenWithTrivia(child))
    } else {
      if (hasPrev && parts.length > 0) {
        parts.push(text(' '))
      }
      parts.push(formatNode(child))
    }
    hasPrev = true
  }

  return concat(...parts)
}

function formatFallback(node: UntypedCstNode): Doc {
  return formatFromChildren(node)
}

/**
 * Emit trivia (comments with blank lines preserved) into a Doc parts array.
 * Used for preamble, epilogue, and inter-statement trivia.
 */
function emitTriviaWithBlankLines(trivia: TriviaNode[], parts: Doc[]): void {
  for (let i = 0; i < trivia.length; i++) {
    const t = trivia[i]!
    if (t.kind === 'lineComment') {
      parts.push(lineComment(t.text))
    } else if (t.kind === 'blockComment') {
      parts.push(text(t.text), hardLine)
    } else if (t.kind === 'whitespace' && triviaHasBlankLine([t])) {
      // Blank line — emit if followed by a comment OR at end of trivia
      // (at end = blank line between comments and the next statement)
      const nextT = trivia[i + 1]
      if (!nextT || nextT.kind === 'lineComment' || nextT.kind === 'blockComment') {
        parts.push(hardLine)
      }
    }
  }
}

/** Count child nodes in an iterator until a stop token (without consuming). */
function countNodesUntil(iter: ChildIterator, ...stopTokens: string[]): number {
  let count = 0
  const saved = iter.save()
  while (!iter.done()) {
    const child = iter.peek()!
    if (isToken(child) && stopTokens.includes(child.text)) break
    if (isToken(child) && child.text === ';') { iter.next(); continue }
    if (isNode(child)) { count++; iter.next(); continue }
    iter.next()
  }
  iter.restore(saved)
  return count
}

// countStatementsInNode removed — use countNodesUntil(iter, ...) instead

/** Check if a token text is punctuation that shouldn't have a space before it. */
function isPunctuation(s: string): boolean {
  return s === ',' || s === ';' || s === ')' || s === ']' || s === '}' || s === '.' || s === ':'
}

/** Check if a token text is an opening bracket that shouldn't have a space after it. */
function isOpenBracket(s: string): boolean {
  return s === '(' || s === '[' || s === '{'
}
