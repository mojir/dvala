import { NodeTypes } from '../../constants/constants'
import { ParseError } from '../../errors'
import { minifyTokenStream } from '../../tokenizer/minifyTokenStream'
import { tokenize } from '../../tokenizer/tokenize'
import type { CodeTemplateToken } from '../../tokenizer/token'
import { isOperatorToken } from '../../tokenizer/token'
import { withSourceCodeInfo } from '../helpers'
import type { ParserContext } from '../ParserContext'
import type { AstNode } from '../types'
import { createParserContext, parseExpression } from './parseExpression'
import { splitSegments } from './parseTemplateString'

export type CodeTemplateNode = AstNode<typeof NodeTypes.CodeTmpl, [AstNode[], AstNode[]]>

/**
 * Parse a code template (triple-backtick delimited).
 *
 * The content is parsed as Dvala code at parse time. ${expr} interpolations
 * become Splice nodes in the AST. At evaluation time, splice expressions are
 * evaluated and their results inserted into the AST data structure.
 *
 * Returns a CodeTmpl node with payload [bodyAst, spliceExprs]:
 * - bodyAst: the parsed Dvala code as AST, with Splice nodes for interpolations
 * - spliceExprs: the parsed expressions from ${...} interpolations
 */
export function parseCodeTemplate(ctx: ParserContext, token: CodeTemplateToken): CodeTemplateNode {
  ctx.advance()
  const debugInfo = token[2]
  const resolvedSci = ctx.resolveTokenDebugInfo(debugInfo)

  const raw = token[1]

  // Count opening backticks to determine delimiter length
  let backtickCount = 0
  while (raw[backtickCount] === '`') {
    backtickCount++
  }

  // Strip opening and closing backtick delimiters
  const content = raw.slice(backtickCount, -backtickCount)

  // Split into literal and expression segments
  const segments = splitSegments(content)

  // Build source with splice placeholders, and collect splice expressions
  const spliceExprs: AstNode[] = []
  let source = ''

  for (const segment of segments) {
    if (segment.type === 'literal') {
      source += segment.value
    } else {
      if (segment.value.trim().length === 0) {
        throw new ParseError('Empty interpolation in code template', resolvedSci)
      }
      // Replace ${expr} with a unique placeholder symbol
      const index = spliceExprs.length
      source += `__splice_${index}__`

      // Parse the splice expression
      const innerStream = tokenize(segment.value, false, resolvedSci?.filePath)
      const minified = minifyTokenStream(innerStream, { removeWhiteSpace: true })
      for (const t of minified.tokens) {
        if (t[0] === 'Error') {
          throw new ParseError(`Code template interpolation error: ${t[3]}`, resolvedSci)
        }
      }
      const innerCtx = createParserContext(minified)
      const expr = parseExpression(innerCtx, 0)
      spliceExprs.push(expr)
    }
  }

  // Parse the assembled source as Dvala code
  const templateStream = tokenize(source, false, resolvedSci?.filePath)
  const templateMinified = minifyTokenStream(templateStream, { removeWhiteSpace: true })
  for (const t of templateMinified.tokens) {
    if (t[0] === 'Error') {
      throw new ParseError(`Code template parse error: ${t[3]}`, resolvedSci)
    }
  }
  const templateCtx = createParserContext(templateMinified)
  const bodyAst: AstNode[] = []
  while (!templateCtx.isAtEnd()) {
    bodyAst.push(parseExpression(templateCtx, 0))
    // Consume statement separator if present
    if (isOperatorToken(templateCtx.tryPeek(), ';')) {
      templateCtx.advance()
    }
  }

  // Walk AST and replace placeholder symbols with Splice nodes
  const processedBody = bodyAst.map(node => replacePlaceholders(node, spliceExprs))

  const resultNode = withSourceCodeInfo(
    [NodeTypes.CodeTmpl, [processedBody, spliceExprs], 0],
    debugInfo,
    ctx,
  ) as CodeTemplateNode
  ctx.setNodeEnd(resultNode[2])
  return resultNode
}

/**
 * Recursively walk an AST node and replace UserDefinedSymbol nodes
 * named `__splice_N__` with Splice nodes referencing the Nth splice expression.
 */
function replacePlaceholders(node: AstNode, spliceExprs: AstNode[]): AstNode {
  const [type, payload, nodeId] = node

  // Check if this is a splice placeholder symbol
  if (type === NodeTypes.Sym && typeof payload === 'string') {
    const match = payload.match(/^__splice_(\d+)__$/)
    if (match) {
      const index = parseInt(match[1]!, 10)
      // Splice node payload is the index into spliceExprs
      return [NodeTypes.Splice, index, nodeId] as AstNode
    }
  }

  // Recursively walk array payloads
  if (Array.isArray(payload)) {
    const newPayload = payload.map(item =>
      Array.isArray(item) ? replacePlaceholdersInValue(item, spliceExprs) : item,
    )
    return [type, newPayload, nodeId] as AstNode
  }

  return node
}

/**
 * Replace placeholders in a value that may or may not be an AST node.
 * AST nodes are arrays starting with a string type tag.
 */
function replacePlaceholdersInValue(value: unknown[], spliceExprs: AstNode[]): unknown[] {
  // Check if this looks like an AST node: [stringType, payload, number]
  if (value.length >= 2 && typeof value[0] === 'string') {
    return replacePlaceholders(value as AstNode, spliceExprs)
  }
  // It's a plain array — recurse into elements
  return value.map(item =>
    Array.isArray(item) ? replacePlaceholdersInValue(item, spliceExprs) : item,
  )
}
