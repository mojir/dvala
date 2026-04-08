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

import { MAX_BLANK_LINES, MAX_WIDTH } from './config'
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

/** Check if trivia contains a blank line (for preserving authored blank lines). */
function triviaHasBlankLine(trivia: TriviaNode[]): boolean {
  for (const t of trivia) {
    if (t.kind === 'whitespace') {
      // Two or more newlines = blank line
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
 * Check if there's a blank line in the trivia between two adjacent tokens.
 * The blank line could be in the trailing trivia of the first token or
 * the leading trivia of the second token.
 */
function hasBlankLineBetween(prevToken: CstToken, nextToken: CstToken): boolean {
  return triviaHasBlankLine(prevToken.trailingTrivia) || triviaHasBlankLine(nextToken.leadingTrivia)
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
  }

  // Format statements with semicolons and blank lines between them
  const semicolonTokens = tokens(program)
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i]!
    const stmtDoc = formatNode(stmt)
    parts.push(stmtDoc)

    if (i < statements.length - 1) {
      // Emit semicolons between statements
      if (i < semicolonTokens.length) {
        // Check for trailing comment on the semicolon
        const semi = semicolonTokens[i]!
        const semiTrailing = trailingComments(semi)
        if (semiTrailing.length > 0) {
          parts.push(text(';'))
          parts.push(text(' '))
          parts.push(...semiTrailing)
        } else {
          parts.push(text(';'))
        }
      }

      // Check for blank lines between statements
      const lastTok = lastToken(stmt)
      const nextFirst = firstToken(statements[i + 1]!)
      const semiToken = i < semicolonTokens.length ? semicolonTokens[i] : undefined

      let hasBlank = false
      if (semiToken) {
        hasBlank = triviaHasBlankLine(semiToken.trailingTrivia) || triviaHasBlankLine(nextFirst.leadingTrivia)
      } else {
        hasBlank = hasBlankLineBetween(lastTok, nextFirst)
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
  return text(tok.text)
}

// ---------------------------------------------------------------------------
// Collection formatters
// ---------------------------------------------------------------------------

function formatArray(node: UntypedCstNode): Doc {
  const children = childNodes(node)
  const toks = tokens(node)

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
  // Object children: {, entries (as nodes or tokens), commas, }
  // The untyped tree has entries as child nodes interspersed with
  // comma and colon tokens. We need to reconstruct key: value pairs.
  // For now, treat all child nodes as entries.
  const children = childNodes(node)

  if (children.length === 0) {
    return text('{}')
  }

  // Each child is either an ObjectEntry node (key: value) or Spread node.
  // In the untyped tree, object entries aren't wrapped in their own node,
  // so we need to reconstruct from tokens and child nodes.
  // Fallback: format all children separated by commas.
  const items = children.map(c => formatNode(c))

  return group(concat(
    text('{'),
    nest(INDENT, concat(softLine, join(concat(text(','), line), items))),
    softLine,
    text('}'),
  ))
}

// ---------------------------------------------------------------------------
// Operator formatters
// ---------------------------------------------------------------------------

function formatBinaryOp(node: UntypedCstNode): Doc {
  const left = nthChild(node, 0)
  const right = nthChild(node, 1)
  // The operator is a token between the two child nodes
  const opTokens = tokens(node)
  const opText = opTokens.length > 0 ? opTokens[0]!.text : '?'

  return group(concat(
    formatNode(left),
    text(' '),
    text(opText),
    nest(INDENT, concat(line, formatNode(right))),
  ))
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

  if (args.length === 0) {
    return concat(formatNode(fn), text('('), text(')'))
  }

  const argDocs = args.map(a => formatNode(a))
  return concat(
    formatNode(fn),
    group(concat(
      text('('),
      nest(INDENT, concat(softLine, join(concat(text(','), line), argDocs))),
      softLine,
      text(')'),
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
  // Children: let keyword, binding tokens/nodes, = token, value node
  // In the untyped tree: tokens and nodes are interleaved.
  // The value is the last child node. Everything between let and = is the target.
  const allTokens = tokens(node)
  const allChildren = childNodes(node)

  // Simple case: let x = value (most common)
  // Reconstruct: "let" + target tokens + "=" + value
  // For now, rebuild from the raw children in order.
  return formatFromChildren(node)
}

// ---------------------------------------------------------------------------
// Control flow formatters
// ---------------------------------------------------------------------------

function formatIf(node: UntypedCstNode): Doc {
  // if ... then ... [else if ... then ...] [else ...] end
  return formatFromChildren(node)
}

function formatBlock(node: UntypedCstNode): Doc {
  // do ... end
  return formatFromChildren(node)
}

function formatLoop(node: UntypedCstNode): Doc {
  return formatFromChildren(node)
}

function formatFor(node: UntypedCstNode): Doc {
  return formatFromChildren(node)
}

function formatMatch(node: UntypedCstNode): Doc {
  return formatFromChildren(node)
}

// ---------------------------------------------------------------------------
// Function formatters
// ---------------------------------------------------------------------------

function formatFunction(node: UntypedCstNode): Doc {
  return formatFromChildren(node)
}

function formatHandler(node: UntypedCstNode): Doc {
  return formatFromChildren(node)
}

function formatResume(node: UntypedCstNode): Doc {
  return formatFromChildren(node)
}

// ---------------------------------------------------------------------------
// Macro formatters
// ---------------------------------------------------------------------------

function formatMacro(node: UntypedCstNode): Doc {
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
      parts.push(text(child.text))
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
