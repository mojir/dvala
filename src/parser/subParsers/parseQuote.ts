import { NodeTypes } from '../../constants/constants'
import { ParseError } from '../../errors'
import { isLBraceToken, isOperatorToken, isRBraceToken, isReservedSymbolToken, isSymbolToken } from '../../tokenizer/token'
import type { Token } from '../../tokenizer/token'
import type { TokenStream } from '../../tokenizer/tokenize'
import { withSourceCodeInfo } from '../helpers'
import type { ParserContext } from '../ParserContext'
import type { AstNode } from '../types'
import { createParserContext, parseExpression } from './parseExpression'

export type CodeTemplateNode = AstNode<typeof NodeTypes.CodeTmpl, [AstNode[], AstNode[]]>

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
  const token = ctx.peek()
  const debugInfo = token[2]
  ctx.advance() // consume 'quote'

  // Pass 1: Collect all tokens between 'quote' and matching 'end'.
  // Track block depth to find the correct matching 'end'.
  const bodyTokens: Token[] = []
  let depth = 1

  while (!ctx.isAtEnd() && depth > 0) {
    const t = ctx.peek()

    // Skip symbols after '.' — property access, not a keyword
    if (bodyTokens.length > 0 && isOperatorToken(bodyTokens[bodyTokens.length - 1], '.') && isSymbolToken(t)) {
      bodyTokens.push(t)
      ctx.advance()
      continue
    }

    // Skip tokens inside QuoteSplice expressions (brace-matched)
    if (t[0] === 'QuoteSplice') {
      bodyTokens.push(t)
      ctx.advance()
      let braceDepth = 1
      while (!ctx.isAtEnd() && braceDepth > 0) {
        const inner = ctx.peek()
        if (isLBraceToken(inner)) braceDepth++
        else if (isRBraceToken(inner)) braceDepth--
        bodyTokens.push(inner)
        ctx.advance()
      }
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
    if (processedTokens.length > 0
      && isOperatorToken(processedTokens[processedTokens.length - 1], '.')
      && isSymbolToken(bt)) {
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
        i = extractSplice(bodyTokens, i, spliceExprs, processedTokens, templateId, resolvedSci)
        continue
      } else if (effectiveLevel > 1) {
        throw new ParseError(
          `Splice level ${level} but only ${innerQuoteDepth + 1} quote level(s) deep`,
          resolvedSci,
        )
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
  const bodyCtx = createParserContext(bodyStream)
  const bodyAst: AstNode[] = []
  while (!bodyCtx.isAtEnd()) {
    bodyAst.push(parseExpression(bodyCtx, 0))
    if (isOperatorToken(bodyCtx.tryPeek(), ';')) {
      bodyCtx.advance()
    }
  }

  // Pass 4: Walk AST and replace placeholder symbols with Splice nodes
  const processedBody = bodyAst.map(node => replacePlaceholders(node, spliceExprs, 0, templateId))

  const resultNode = withSourceCodeInfo(
    [NodeTypes.CodeTmpl, [processedBody, spliceExprs], 0],
    debugInfo,
    ctx,
  ) as CodeTemplateNode
  ctx.setNodeEnd(resultNode[2])
  return resultNode
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
  const innerCtx = createParserContext(innerStream)
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

function replacePlaceholdersInValue(value: unknown[], spliceExprs: AstNode[], indexOffset = 0, templateId?: number): unknown[] {
  if (value.length >= 2 && typeof value[0] === 'string') {
    return replacePlaceholders(value as AstNode, spliceExprs, indexOffset, templateId)
  }
  return value.map(item =>
    Array.isArray(item) ? replacePlaceholdersInValue(item, spliceExprs, indexOffset, templateId) : item,
  )
}
