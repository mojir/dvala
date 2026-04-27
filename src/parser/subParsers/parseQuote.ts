import { CstBuilder, type UntypedCstNode } from '../../cst/builder'
import type { CstToken } from '../../cst/types'
import { isTrivia } from '../../cst/attachTrivia'
import { NodeTypes } from '../../constants/constants'
import { ParseError } from '../../errors'
import {
  isLBraceToken,
  isOperatorToken,
  isRBraceToken,
  isReservedSymbolToken,
  isSymbolToken,
} from '../../tokenizer/token'
import type { Token } from '../../tokenizer/token'
import type { TokenStream } from '../../tokenizer/tokenize'
import { withSourceCodeInfo } from '../helpers'
import type { ParserContext } from '../ParserContext'
import type { AstNode } from '../types'
import { createCstParserContext, createParserContext, parseExpression } from './parseExpression'

type CodeTemplateNode = AstNode<typeof NodeTypes.CodeTmpl, [AstNode[], AstNode[]]>

/**
 * Parse a quote...end block.
 *
 * quote <body> end
 *
 * Body is Dvala code captured as AST data. $^{expr} splices escape one level
 * back to runtime evaluation. $^^{expr} escapes two levels, etc.
 *
 * Returns the same CodeTmpl AST node as the old triple-backtick syntax.
 */
let quoteTemplateCounter = 0

export function parseQuote(ctx: ParserContext): CodeTemplateNode {
  ctx.builder?.startNode('Quote')
  const token = ctx.peek()
  const debugInfo = token[2]
  ctx.advance() // consume 'quote'

  // Positions bracketing the body for the optional CST sub-parse pass. We
  // keep the raw-token index (non-CST mode) and the builder checkpoint (CST
  // mode) so the sub-parse can read the same token range ctx is walking and
  // the main Quote node can later swap its flat body children for the
  // structured sub-CST.
  const bodyStartRawPos = ctx.getPosition()
  const bodyStartCstCheckpoint = ctx.builder?.checkpoint()

  // Pass 1: Collect all tokens between 'quote' and matching 'end'.
  // Track block depth to find the correct matching 'end'.
  const bodyTokens: Token[] = []
  let depth = 1
  // Position of the matching outer `end` token in ctx.tokens. Used by the
  // CST sub-parse to slice the trivia-including body range.
  let bodyEndRawPos = -1

  while (!ctx.isAtEnd() && depth > 0) {
    const t = ctx.peek()

    // Skip symbols after '.' — property access, not a keyword
    if (bodyTokens.length > 0 && isOperatorToken(bodyTokens[bodyTokens.length - 1], '.') && isSymbolToken(t)) {
      bodyTokens.push(t)
      ctx.advance()
      continue
    }

    // Splice expression (brace-matched) — wrap in a CST Splice node so the
    // formatter can treat marker + expression + closeBrace as a structured unit.
    if (t[0] === 'QuoteSplice') {
      ctx.builder?.startNode('Splice')
      bodyTokens.push(t)
      ctx.advance() // emit $^{ marker token
      let braceDepth = 1
      while (!ctx.isAtEnd() && braceDepth > 0) {
        const inner = ctx.peek()
        if (isLBraceToken(inner)) braceDepth++
        else if (isRBraceToken(inner)) braceDepth--
        bodyTokens.push(inner)
        ctx.advance()
      }
      ctx.builder?.endNode()
      continue
    }

    if (isBlockOpener(t)) {
      depth++
      bodyTokens.push(t)
      ctx.advance()
    } else if (isReservedSymbolToken(t, 'end')) {
      depth--
      if (depth > 0) {
        bodyTokens.push(t)
      } else {
        // Matching outer `end` — capture its position before advancing past it.
        bodyEndRawPos = ctx.getPosition()
      }
      ctx.advance()
    } else {
      bodyTokens.push(t)
      ctx.advance()
    }
  }

  if (depth > 0) {
    throw new ParseError('Unterminated quote block — expected `end`', ctx.resolveTokenDebugInfo(debugInfo))
  }

  const resolvedSci = ctx.resolveTokenDebugInfo(debugInfo)

  // Pass 2: Process QuoteSplice tokens based on effective level.
  // Use a stack to track block types so we know exactly how many
  // quote levels deep each splice is.
  const templateId = quoteTemplateCounter++
  const spliceExprs: AstNode[] = []
  const processedTokens: Token[] = []
  const blockStack: ('quote' | 'other')[] = []
  let i = 0

  while (i < bodyTokens.length) {
    const bt = bodyTokens[i]!

    // Skip symbols after '.' — property access, not a keyword
    if (
      processedTokens.length > 0 &&
      isOperatorToken(processedTokens[processedTokens.length - 1], '.') &&
      isSymbolToken(bt)
    ) {
      processedTokens.push(bt)
      i++
      continue
    }

    // Track block openers
    if (isBlockOpener(bt)) {
      blockStack.push(isReservedSymbolToken(bt, 'quote') ? 'quote' : 'other')
      processedTokens.push(bt)
      i++
      continue
    }

    // Track block closers
    if (isReservedSymbolToken(bt, 'end')) {
      blockStack.pop()
      processedTokens.push(bt)
      i++
      continue
    }

    // Handle QuoteSplice tokens
    if (bt[0] === 'QuoteSplice') {
      const level = countCarets(bt[1])
      const innerQuoteDepth = blockStack.filter(b => b === 'quote').length
      const effectiveLevel = level - innerQuoteDepth

      if (effectiveLevel === 1) {
        // This splice belongs to the current (outer) quote — extract it
        i = extractSplice(bodyTokens, i, spliceExprs, processedTokens, templateId, resolvedSci, ctx.allocateId)
        continue
      } else if (effectiveLevel > 1) {
        throw new ParseError(`Splice level ${level} but only ${innerQuoteDepth + 1} quote level(s) deep`, resolvedSci)
      }
      // effectiveLevel <= 0: belongs to an inner quote, pass through as-is
      processedTokens.push(bt)
      i++
      // Also pass through the splice expression tokens and closing brace
      let braceDepth = 1
      while (i < bodyTokens.length && braceDepth > 0) {
        const inner = bodyTokens[i]!
        if (isLBraceToken(inner)) braceDepth++
        else if (isRBraceToken(inner)) braceDepth--
        processedTokens.push(inner)
        i++
      }
      continue
    }

    processedTokens.push(bt)
    i++
  }

  // Pass 3: Parse the processed tokens as Dvala code
  const bodyStream: TokenStream = { tokens: processedTokens }
  const bodyCtx = createParserContext(bodyStream, ctx.allocateId)
  const bodyAst: AstNode[] = []
  while (!bodyCtx.isAtEnd()) {
    bodyAst.push(parseExpression(bodyCtx, 0))
    if (isOperatorToken(bodyCtx.tryPeek(), ';')) {
      bodyCtx.advance()
    }
  }

  // Pass 4: Walk AST and replace placeholder symbols with Splice nodes
  const processedBody = bodyAst.map(node => replacePlaceholders(node, spliceExprs, 0, templateId))

  // Pass 5 (CST mode only): replace the raw body tokens emitted to the main
  // Quote node during pass 1 with a CST-structured body produced by a
  // sub-parse. Without this, the formatter sees quote bodies as flat tokens
  // and cannot recursively break long constructs (functions, do-blocks, etc.)
  // inside the quote.
  if (ctx.builder && bodyEndRawPos >= 0 && bodyStartCstCheckpoint !== undefined) {
    rebuildQuoteBodyCst(ctx, bodyStartRawPos, bodyEndRawPos, bodyStartCstCheckpoint, templateId)
  }

  const resultNode = withSourceCodeInfo(
    [NodeTypes.CodeTmpl, [processedBody, spliceExprs], 0],
    debugInfo,
    ctx,
  ) as CodeTemplateNode
  ctx.setNodeEnd(resultNode[2])
  ctx.builder?.endNode()
  return resultNode
}

/**
 * Rebuild the main Quote CST node's body children as a properly structured
 * sub-tree (Function/Block/If/etc. sub-nodes) instead of the flat tokens
 * emitted by pass 1.
 *
 * Approach:
 *  1. Walk ctx.tokens over the body range, producing a trivia-preserving
 *     token stream with this-level splices replaced by placeholder Symbol
 *     tokens. Record, for each placeholder, which Splice CST sub-node from
 *     the main Quote's body it should be swapped back to.
 *  2. Sub-parse the stream with a fresh CstBuilder. The sub-CST has full
 *     structure (Function, Block, ...) built by the normal parseExpression
 *     path — same machinery that formats any non-quoted expression.
 *  3. Walk the sub-CST, replacing placeholder Symbol sub-nodes with the
 *     originals captured in step 1. This preserves their leading/trailing
 *     trivia (comments around splices survive formatting).
 *  4. Truncate the main Quote's children back to where the body started and
 *     append the rebuilt children. The Quote node now contains structured
 *     body nodes the formatter can recursively wrap.
 *
 * Splice placeholders use the template-id from pass 2 so this post-processing
 * only touches this parseQuote call's splices; nested Quote CST nodes that
 * pass through have their own templateId and get rebuilt on their own call.
 */
function rebuildQuoteBodyCst(
  ctx: ParserContext,
  bodyStartPos: number,
  bodyEndPos: number,
  bodyStartCheckpoint: number,
  templateId: number,
): void {
  const builder = ctx.builder!
  // Retrieve the raw body children just emitted by pass 1. The Splice entries
  // we'll reuse; the rest (raw tokens + the closing `end`) will be truncated
  // below. We pull `end` out separately and re-append it after the rebuilt body.
  const mainQuoteNode = builder.peekCurrent()
  const rawBodyChildren = mainQuoteNode.children.slice(bodyStartCheckpoint)
  const mainSpliceSubNodes: UntypedCstNode[] = rawBodyChildren.filter(isSpliceCstNode)
  // Invariant: pass 1 always advances past the outer `end` before reaching here,
  // so the last raw-body child must be that `end` token. Fail loudly if a
  // future refactor of pass 1 violates this — without a real `end` token to
  // re-append, the Quote node would be malformed.
  const endToken = rawBodyChildren[rawBodyChildren.length - 1]
  if (!isCstToken(endToken) || endToken.text !== 'end') {
    throw new Error('parseQuote.rebuildQuoteBodyCst: expected last body child to be the outer `end` token')
  }

  // Build the sub-parse input. Keeps trivia so sub-CST CstTokens carry the
  // same leading/trailing trivia (comments) the authored source had.
  const { subTokens, placeholderToSplice } = buildSubParseStream(
    ctx,
    bodyStartPos,
    bodyEndPos,
    templateId,
    mainSpliceSubNodes,
  )

  // Sub-parse with a fresh builder — yields a CST sub-tree whose root is a
  // synthetic QuoteBody wrapper. We only care about its children.
  const subBuilder = new CstBuilder()
  subBuilder.startNode('QuoteBody')
  const subCtx = createCstParserContext({ tokens: subTokens }, ctx.allocateId, subBuilder)
  while (!subCtx.isAtEnd()) {
    parseExpression(subCtx, 0)
    if (isOperatorToken(subCtx.tryPeek(), ';')) {
      subCtx.advance()
    }
  }
  subBuilder.endNode()
  const subTree = subBuilder.finish()

  // Swap placeholder Symbol sub-nodes with the original Splice sub-nodes.
  replacePlaceholderSymbolsInCst(subTree, templateId, placeholderToSplice)

  // Patch the first body leaf's leading trivia with the pass-1 value. The sub
  // stream starts at the first non-trivia body token, so any whitespace/newline
  // that sat between `quote` and the first body token was captured in pass 1's
  // first body CstToken but is missing from the sub-CST. Copy it over.
  // Losslessness check: without this, `quote\n    do end end` prints back as
  // `quote\ndo end end` because the indent before `do` is orphaned.
  const pass1FirstLeaf =
    rawBodyChildren[0] !== undefined && !isCstToken(rawBodyChildren[0])
      ? findFirstLeafToken(rawBodyChildren[0])
      : rawBodyChildren[0]
  if (
    pass1FirstLeaf &&
    pass1FirstLeaf.leadingTrivia &&
    pass1FirstLeaf.leadingTrivia.length > 0 &&
    subTree.children.length > 0
  ) {
    const subFirst = subTree.children[0]!
    const subFirstLeaf = 'kind' in subFirst ? findFirstLeafToken(subFirst) : subFirst
    if (subFirstLeaf && subFirstLeaf.leadingTrivia.length === 0) {
      subFirstLeaf.leadingTrivia = pass1FirstLeaf.leadingTrivia
    }
  }

  // Replace the raw body tokens in the main Quote with the structured children,
  // preserving the closing `end` token (which was emitted during pass 1 and
  // will be removed by the truncate).
  builder.truncateCurrent(bodyStartCheckpoint)
  for (const child of subTree.children) {
    builder.appendChild(child)
  }
  builder.appendChild(endToken)
}

/**
 * True when a CST child is a leaf token rather than a sub-node. Tokens carry
 * `text` + trivia arrays; sub-nodes carry `kind` + `children`.
 */
function isCstToken(v: unknown): v is CstToken {
  return typeof v === 'object' && v !== null && 'text' in v && !('kind' in v)
}

/** Find the first leaf CstToken in a CST sub-tree (pre-order). */
function findFirstLeafToken(node: UntypedCstNode): CstToken | undefined {
  for (const child of node.children) {
    if (isCstToken(child)) return child
    const nested = findFirstLeafToken(child)
    if (nested) return nested
  }
  return undefined
}

function isSpliceCstNode(child: unknown): child is UntypedCstNode {
  return typeof child === 'object' && child !== null && 'kind' in child && (child as { kind: string }).kind === 'Splice'
}

/**
 * Walk the body range building a trivia-preserving token stream for the sub-parse.
 * This-level splices (effectiveLevel === 1) become placeholder Symbol tokens so
 * parseExpression treats them as plain identifiers; nested-level splices pass
 * through so the recursive parseQuote call on the inner quote handles them.
 *
 * The returned placeholderToSplice array is indexed by this-level splice count
 * and holds the original main-Quote Splice CST sub-node for each placeholder,
 * so the caller can swap them back after sub-parsing.
 */
function buildSubParseStream(
  ctx: ParserContext,
  bodyStartPos: number,
  bodyEndPos: number,
  templateId: number,
  mainSpliceSubNodes: UntypedCstNode[],
): { subTokens: Token[]; placeholderToSplice: UntypedCstNode[] } {
  const subTokens: Token[] = []
  const placeholderToSplice: UntypedCstNode[] = []
  const blockStack: ('quote' | 'other')[] = []
  // Positional index among all Splice sub-nodes (this-level + nested) so we
  // can find the main-Quote Splice sub-node corresponding to a given this-level
  // splice by its position in pass-1 order.
  let overallSpliceCount = 0

  let i = bodyStartPos
  while (i < bodyEndPos) {
    const t = ctx.getTokenAt(i)!

    // Trivia tokens pass through untouched — this is how the sub-CST picks
    // up comments and whitespace inside the quote body.
    if (isTrivia(t)) {
      subTokens.push(t)
      i++
      continue
    }

    // Property access: a symbol following '.' isn't a keyword even if it
    // shares text with one (e.g. `x.do`). Guard so we don't mis-track depth.
    if (subTokens.length > 0 && isOperatorToken(subTokens[subTokens.length - 1], '.') && isSymbolToken(t)) {
      subTokens.push(t)
      i++
      continue
    }

    if (isBlockOpener(t)) {
      blockStack.push(isReservedSymbolToken(t, 'quote') ? 'quote' : 'other')
      subTokens.push(t)
      i++
      continue
    }

    if (isReservedSymbolToken(t, 'end')) {
      blockStack.pop()
      subTokens.push(t)
      i++
      continue
    }

    if (t[0] === 'QuoteSplice') {
      const level = countCarets(t[1])
      const innerQuoteDepth = blockStack.filter(b => b === 'quote').length
      const effectiveLevel = level - innerQuoteDepth
      const spliceSubNode = mainSpliceSubNodes[overallSpliceCount]
      overallSpliceCount++

      if (effectiveLevel === 1) {
        // This-level splice: emit a placeholder symbol that parseExpression
        // can consume as a normal identifier. We remember the original Splice
        // CST sub-node so the caller can swap it back after parsing.
        const placeholderIndex = placeholderToSplice.length
        const placeholderName = `__splice_${templateId}_${placeholderIndex}__`
        // Placeholder tokens copy the marker's debug info when available so
        // later source-map and error-position lookups still make sense.
        const placeholderToken: Token = t[2] ? ['Symbol', placeholderName, t[2]] : ['Symbol', placeholderName]
        subTokens.push(placeholderToken)
        // Splice node is optional at runtime because building the main Quote
        // CST children is conditional; if it's missing, the swap step simply
        // leaves the placeholder Symbol in place.
        if (spliceSubNode) placeholderToSplice.push(spliceSubNode)
        else placeholderToSplice.push({ kind: 'Symbol', children: [] })
        // Skip the splice's expression tokens and closing brace.
        i++
        let braceDepth = 1
        while (i < bodyEndPos && braceDepth > 0) {
          const inner = ctx.getTokenAt(i)!
          if (isLBraceToken(inner)) braceDepth++
          else if (isRBraceToken(inner)) braceDepth--
          i++
        }
        continue
      }
      // Nested-level splice: pass through — the recursive parseQuote for the
      // surrounding inner quote will handle it.
      subTokens.push(t)
      i++
      let braceDepth = 1
      while (i < bodyEndPos && braceDepth > 0) {
        const inner = ctx.getTokenAt(i)!
        if (isLBraceToken(inner)) braceDepth++
        else if (isRBraceToken(inner)) braceDepth--
        subTokens.push(inner)
        i++
      }
      continue
    }

    subTokens.push(t)
    i++
  }

  return { subTokens, placeholderToSplice }
}

/**
 * Walk a CST sub-tree and, wherever a Symbol node wraps a placeholder token
 * named `__splice_${templateId}_N__`, replace the Symbol node with the
 * corresponding Splice sub-node supplied by placeholderToSplice[N].
 *
 * Uses templateId so this only touches placeholders from this parseQuote call —
 * nested Quote sub-nodes with their own templateId are left alone.
 */
function replacePlaceholderSymbolsInCst(
  node: UntypedCstNode,
  templateId: number,
  placeholderToSplice: UntypedCstNode[],
): void {
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i]!
    if (!('kind' in child)) continue
    if (child.kind === 'Symbol' && child.children.length === 1) {
      const inner = child.children[0]
      if (inner && 'text' in inner) {
        const match = inner.text.match(/^__splice_(\d+)_(\d+)__$/)
        if (match && Number(match[1]) === templateId) {
          const index = Number(match[2])
          const splice = placeholderToSplice[index]
          if (splice) node.children[i] = splice
          continue
        }
      }
    }
    // Recurse into any non-Symbol sub-node (nested quotes, functions, etc.).
    replacePlaceholderSymbolsInCst(child, templateId, placeholderToSplice)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Count the number of ^ characters in a QuoteSplice value like "$^^{" */
function countCarets(value: string): number {
  let count = 0
  for (let j = 1; j < value.length; j++) {
    if (value[j] === '^') count++
    else break
  }
  return count
}

/**
 * Extract a splice expression from bodyTokens starting at position i (a QuoteSplice token).
 * Parses the expression tokens between the splice opener and matching RBrace.
 * Pushes a placeholder Symbol token into processedTokens.
 * Returns the new position in bodyTokens (after the closing RBrace).
 */
function extractSplice(
  bodyTokens: Token[],
  i: number,
  spliceExprs: AstNode[],
  processedTokens: Token[],
  templateId: number,
  sci: ReturnType<ParserContext['resolveTokenDebugInfo']>,
  allocateId: () => number,
): number {
  const spliceToken = bodyTokens[i]!
  const spliceDebugInfo = spliceToken[2]
  i++ // skip QuoteSplice token

  // Collect expression tokens until matching RBrace
  const exprTokens: Token[] = []
  let braceDepth = 1
  while (i < bodyTokens.length && braceDepth > 0) {
    const t = bodyTokens[i]!
    if (isLBraceToken(t)) braceDepth++
    else if (isRBraceToken(t)) {
      braceDepth--
      if (braceDepth === 0) {
        i++ // consume closing brace
        break
      }
    }
    exprTokens.push(t)
    i++
  }

  if (braceDepth > 0) {
    throw new ParseError('Unclosed splice expression in quote block', sci)
  }

  if (exprTokens.length === 0) {
    throw new ParseError('Empty splice expression in quote block', sci)
  }

  // Parse the splice expression
  const innerStream: TokenStream = { tokens: exprTokens }
  const innerCtx = createParserContext(innerStream, allocateId)
  const expr = parseExpression(innerCtx, 0)
  const index = spliceExprs.length
  spliceExprs.push(expr)

  // Emit placeholder symbol token
  const placeholder: Token = spliceDebugInfo
    ? ['Symbol', `__splice_${templateId}_${index}__`, spliceDebugInfo]
    : ['Symbol', `__splice_${templateId}_${index}__`]
  processedTokens.push(placeholder)
  return i
}

/** Check if a token opens a block that ends with 'end'. */
function isBlockOpener(t: Token): boolean {
  if (isReservedSymbolToken(t, 'do')) return true
  if (isSymbolToken(t, 'handler')) return true
  if (isReservedSymbolToken(t, 'quote')) return true
  if (isSymbolToken(t, 'if')) return true
  if (isSymbolToken(t, 'match')) return true
  if (isSymbolToken(t, 'for')) return true
  if (isSymbolToken(t, 'loop')) return true
  return false
}

// ---------------------------------------------------------------------------
// Placeholder replacement (same logic as parseCodeTemplate.ts)
// ---------------------------------------------------------------------------

/**
 * Recursively walk an AST node and replace UserDefinedSymbol nodes
 * named `__splice_N_M__` with Splice nodes referencing the Mth splice expression.
 */
function replacePlaceholders(node: AstNode, spliceExprs: AstNode[], indexOffset = 0, templateId?: number): AstNode {
  const [type, payload, nodeId] = node

  if (type === NodeTypes.Sym && typeof payload === 'string') {
    const match = payload.match(/^__splice_(\d+)_(\d+)__$/)
    if (match && (templateId === undefined || parseInt(match[1]!, 10) === templateId)) {
      const index = parseInt(match[2]!, 10) + indexOffset
      return [NodeTypes.Splice, index, nodeId] as AstNode
    }
  }

  // For nested CodeTmpl nodes, recurse but offset outer splice indices
  if (type === NodeTypes.CodeTmpl && Array.isArray(payload)) {
    const [bodyAst, innerSpliceExprs] = payload as [AstNode[], AstNode[]]
    const innerCount = innerSpliceExprs.length
    const newBody = bodyAst.map(n => replacePlaceholders(n, spliceExprs, innerCount, templateId))
    return [type, [newBody, innerSpliceExprs], nodeId] as AstNode
  }

  if (Array.isArray(payload)) {
    const newPayload = payload.map(item =>
      Array.isArray(item) ? replacePlaceholdersInValue(item, spliceExprs, indexOffset, templateId) : item,
    )
    return [type, newPayload, nodeId] as AstNode
  }

  return node
}

function replacePlaceholdersInValue(
  value: unknown[],
  spliceExprs: AstNode[],
  indexOffset = 0,
  templateId?: number,
): unknown[] {
  if (value.length >= 2 && typeof value[0] === 'string') {
    return replacePlaceholders(value as AstNode, spliceExprs, indexOffset, templateId)
  }
  return value.map(item =>
    Array.isArray(item) ? replacePlaceholdersInValue(item, spliceExprs, indexOffset, templateId) : item,
  )
}
