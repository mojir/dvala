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
  return node.children.filter(isNode) as UntypedCstNode[]
}

/** Get all tokens. */
function tokens(node: UntypedCstNode): CstToken[] {
  return node.children.filter(isToken) as CstToken[]
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
 * Trailing line comments → `token_text // ...` (with forced break)
 * Trailing block comments → `token_text /* ... * /`
 */
function formatTokenWithTrivia(token: CstToken): Doc {
  const leading = leadingComments(token)
  const trailing = trailingComments(token)
  const tokenDoc = text(token.text)

  if (leading.length === 0 && trailing.length === 0) return tokenDoc

  const parts: Doc[] = []
  for (const c of leading) {
    parts.push(c, text(' '))
  }
  parts.push(tokenDoc)
  for (const c of trailing) {
    parts.push(text(' '), c)
  }
  return concat(...parts)
}

/** Count newlines in a trivia array. */
function countNewlinesInTrivia(trivia: TriviaNode[]): number {
  let count = 0
  for (const t of trivia) {
    if (t.kind === 'whitespace') {
      for (const ch of t.text) {
        if (ch === '\n') count++
      }
    }
  }
  return count
}

/**
 * Check if there's a blank line between two tokens by counting total
 * newlines across both the trailing trivia of the previous token and
 * the leading trivia of the next token. Two or more newlines = blank line.
 */
function hasBlankLineBetweenTokens(prevTrailing: TriviaNode[], nextLeading: TriviaNode[]): boolean {
  return countNewlinesInTrivia(prevTrailing) + countNewlinesInTrivia(nextLeading) >= 2
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
      throw new Error(`Expected token '${tokenText}', got ${isToken(child) ? `'${child.text}'` : `node '${(child as UntypedCstNode).kind}'`}`)
    }
    return child
  }

  /** Consume the next child, expecting it to be a token. Returns the token. */
  nextToken(): CstToken {
    const child = this.next()
    if (!isToken(child)) throw new Error(`Expected token, got node '${(child as UntypedCstNode).kind}'`)
    return child
  }

  /** Consume the next child, expecting it to be a node. Returns the node. */
  nextNode(): UntypedCstNode {
    const child = this.next()
    if (!isNode(child)) throw new Error(`Expected node, got token '${(child as CstToken).text}'`)
    return child
  }

  /** Check if the current child is a token with the given text. */
  isToken(tokenText: string): boolean {
    const child = this.peek()
    return child !== undefined && isToken(child) && child.text === tokenText
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
  return join(concat(text(';'), hardLine), stmts)
}

// ---------------------------------------------------------------------------
// Main formatting dispatch
// ---------------------------------------------------------------------------

export function formatCst(tree: UntypedCstNode, trailingTrivia: TriviaNode[]): string {
  const doc = formatProgram(tree, trailingTrivia)
  let result = render(doc, MAX_WIDTH)
  // Ensure trailing newline
  if (!result.endsWith('\n')) result += '\n'
  return result
}

function formatProgram(program: UntypedCstNode, trailingTrivia: TriviaNode[]): Doc {
  const statements = childNodes(program)
  if (statements.length === 0) {
    // File with only comments or empty
    const commentDocs = triviaComments(trailingTrivia)
    if (commentDocs.length === 0) return text('')
    return concat(...commentDocs)
  }

  // Check for shebang in leading trivia of the first token
  const first = firstToken(program)
  const shebangDocs: Doc[] = []
  for (const t of first.leadingTrivia) {
    if (t.kind === 'shebang') {
      shebangDocs.push(text(t.text), hardLine)
    }
  }

  // Emit file-level leading comments (before first statement)
  const fileLeadingComments = leadingComments(firstToken(statements[0]!))

  const parts: Doc[] = [...shebangDocs]

  // Leading comments before first statement
  for (const c of fileLeadingComments) {
    parts.push(c)
    // Block comments that are leading get their own line
    if (c.type === 'text') {
      parts.push(hardLine)
    }
  }

  // Format statements: always add `;` after each statement (including last).
  // Preserve blank lines between statements from the original source.
  const semicolonTokens = tokens(program)
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i]!
    parts.push(formatNode(stmt))
    parts.push(text(';'))

    // Check for trailing comment on the semicolon token (if present)
    if (i < semicolonTokens.length) {
      const semi = semicolonTokens[i]!
      const semiTrailing = trailingComments(semi)
      if (semiTrailing.length > 0) {
        parts.push(text(' '))
        parts.push(...semiTrailing)
      }
    }

    if (i < statements.length - 1) {
      // Check for blank lines between statements
      const lastTok = lastToken(stmt)
      const nextFirst = firstToken(statements[i + 1]!)
      const semiToken = i < semicolonTokens.length ? semicolonTokens[i] : undefined

      let hasBlank = false
      if (semiToken) {
        hasBlank = hasBlankLineBetweenTokens(semiToken.trailingTrivia, nextFirst.leadingTrivia)
      } else {
        hasBlank = hasBlankLineBetweenTokens(lastTok.trailingTrivia, nextFirst.leadingTrivia)
      }

      if (hasBlank) {
        parts.push(hardLine, hardLine)
      } else {
        parts.push(hardLine)
      }

      // Leading comments before next statement
      const nextLeading = leadingComments(nextFirst)
      for (const c of nextLeading) {
        parts.push(c)
      }
    }
  }

  // File-level trailing comments
  const fileTrailingComments = triviaComments(trailingTrivia)
  for (const c of fileTrailingComments) {
    parts.push(c)
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
    // Empty array: []
    return text('[]')
  }

  const items = children.map(c => formatNode(c))

  return group(concat(
    text('['),
    nest(INDENT, concat(softLine, join(concat(text(','), line), items))),
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
  while (!iter.done() && !iter.isToken('}')) {
    if (iter.isToken(',')) {
      iter.next() // skip comma
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
    entries.push(concat(...entryParts))
  }

  iter.expectToken('}')

  if (entries.length === 0) {
    return text('{}')
  }

  // Objects use spaces inside braces: { a: 1, b: 2 }
  return group(concat(
    text('{'),
    text(' '),
    nest(INDENT, join(concat(text(','), line), entries)),
    text(' '),
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

  const argDocs = args.map(a => formatNode(a))

  // Check for comments on the open paren (e.g. `foo(/* arg */ 42)`)
  const openDoc = openParen ? formatTokenWithTrivia(openParen) : text('(')

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

  // Collect binding target parts (everything until `=`)
  const targetParts: Doc[] = []
  let lastTargetText = ''
  while (!iter.done() && !iter.isToken('=')) {
    const child = iter.next()
    if (isToken(child)) {
      // Add space unless current is punctuation or previous was open bracket
      if (targetParts.length > 0 && !isPunctuation(child.text) && !isOpenBracket(lastTargetText)) {
        targetParts.push(text(' '))
      }
      targetParts.push(text(child.text))
      lastTargetText = child.text
    } else {
      // Add space before node unless previous was open bracket
      if (targetParts.length > 0 && !isOpenBracket(lastTargetText)) {
        targetParts.push(text(' '))
      }
      targetParts.push(formatNode(child))
      lastTargetText = ''
    }
  }

  iter.expectToken('=')

  // Value is the remaining node
  const value = iter.nextNode()

  return group(concat(
    text('let'),
    text(' '),
    concat(...targetParts),
    text(' ='),
    nest(INDENT, concat(line, formatNode(value))),
  ))
}

// ---------------------------------------------------------------------------
// Control flow formatters
// ---------------------------------------------------------------------------

function formatIf(node: UntypedCstNode): Doc {
  // Children: if, condition, then, body..., [else, [if, condition, then, body...]]..., end
  const iter = new ChildIterator(node.children)

  // Collect all branches for analysis
  interface Branch {
    isElseIf: boolean
    condition?: Doc
    body: Doc[]
  }
  const branches: Branch[] = []
  let elseBranch: Doc[] | undefined

  while (!iter.done()) {
    const child = iter.peek()!
    if (isToken(child) && child.text === 'end') break

    if (isToken(child) && child.text === 'else') {
      iter.next() // consume 'else'
      if (iter.isToken('if')) {
        // else-if: continue to parse
      } else {
        // Final else branch
        elseBranch = iter.collectBody('end')
        break
      }
    }

    if (isToken(iter.peek()!) && (iter.peek() as CstToken).text === 'if') {
      iter.next() // consume 'if'
      const condition = iter.nextNode()
      iter.expectToken('then')
      const body = iter.collectBody('else', 'end')
      branches.push({ isElseIf: branches.length > 0, condition: formatNode(condition), body })
    }
  }

  iter.expectToken('end')

  // Simple if/then/else/end with single-expression bodies: try flat
  if (branches.length === 1 && branches[0]!.body.length === 1
    && (!elseBranch || elseBranch.length === 1)) {
    const b = branches[0]!
    const flatParts = [text('if '), b.condition!, text(' then '), b.body[0]!]
    if (elseBranch) {
      flatParts.push(text(' else '), elseBranch[0]!)
    }
    flatParts.push(text(' end'))

    const expandedParts: Doc[] = [text('if '), b.condition!, text(' then')]
    expandedParts.push(nest(INDENT, concat(hardLine, b.body[0]!)))
    if (elseBranch) {
      expandedParts.push(hardLine, text('else'))
      expandedParts.push(nest(INDENT, concat(hardLine, elseBranch[0]!)))
    }
    expandedParts.push(hardLine, text('end'))

    return group(concat(
      ifBreak(concat(...expandedParts), concat(...flatParts)),
    ))
  }

  // Complex if: always expand
  const parts: Doc[] = []
  for (let i = 0; i < branches.length; i++) {
    const b = branches[i]!
    if (b.isElseIf) {
      parts.push(hardLine, text('else if '), b.condition!, text(' then'))
    } else {
      parts.push(text('if '), b.condition!, text(' then'))
    }
    if (b.body.length === 1) {
      parts.push(nest(INDENT, concat(hardLine, b.body[0]!)))
    } else {
      parts.push(nest(INDENT, concat(hardLine, formatBody(b.body))))
    }
  }
  if (elseBranch) {
    parts.push(hardLine, text('else'))
    if (elseBranch.length === 1) {
      parts.push(nest(INDENT, concat(hardLine, elseBranch[0]!)))
    } else {
      parts.push(nest(INDENT, concat(hardLine, formatBody(elseBranch))))
    }
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

  const body = iter.collectBody('end')
  iter.expectToken('end')

  if (body.length === 0) {
    if (withClause) {
      return concat(text('do'), nest(INDENT, concat(hardLine, withClause)), hardLine, text('end'))
    }
    return text('do end')
  }

  // Single-statement bodies try flat: `do expr end`
  // Multi-statement bodies always expand.
  if (body.length === 1 && !withClause) {
    return group(concat(
      text('do'),
      nest(INDENT, concat(line, body[0]!)),
      line,
      text('end'),
    ))
  }

  const bodyDoc = formatBody(body)
  const inner = withClause
    ? concat(hardLine, withClause, hardLine, bodyDoc)
    : concat(hardLine, bodyDoc)

  return concat(text('do'), nest(INDENT, inner), hardLine, text('end'))
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

/** Check if a token text is punctuation that shouldn't have a space before it. */
function isPunctuation(s: string): boolean {
  return s === ',' || s === ';' || s === ')' || s === ']' || s === '}' || s === '.' || s === ':'
}

/** Check if a token text is an opening bracket that shouldn't have a space after it. */
function isOpenBracket(s: string): boolean {
  return s === '(' || s === '[' || s === '{'
}
