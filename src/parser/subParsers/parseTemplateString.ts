import { NodeTypes } from '../../constants/constants'
import { DvalaError } from '../../errors'
import { minifyTokenStream } from '../../tokenizer/minifyTokenStream'
import { tokenize } from '../../tokenizer/tokenize'
import type { TemplateStringToken } from '../../tokenizer/token'
import { withSourceCodeInfo } from '../helpers'
import type { ParserContext } from '../ParserContext'
import type { AstNode, StringNode, TemplateStringNode } from '../types'
import { createParserContext, parseExpression } from './parseExpression'

// ---------------------------------------------------------------------------
// Segment types
// ---------------------------------------------------------------------------

type LiteralSegment = { type: 'literal'; value: string }
type ExpressionSegment = { type: 'expression'; value: string }
export type Segment = LiteralSegment | ExpressionSegment

// ---------------------------------------------------------------------------
// Raw content scanner — splits template content into literal/expression spans
// ---------------------------------------------------------------------------

/**
 * Scan from `start` inside a `${...}` interpolation until the matching `}`.
 * Returns the expression source text (without the outer `${` and `}`) and
 * the number of characters consumed (including the closing `}`).
 */
function scanExpression(raw: string, start: number): { expr: string; consumed: number } {
  let i = start
  let expr = ''
  let depth = 1

  while (i < raw.length && depth > 0) {
    const c = raw[i]!

    if (c === '{') {
      depth++
      expr += c
      i++
    } else if (c === '}') {
      depth--
      if (depth > 0) {
        expr += c
      }
      i++ // consume the `}` in both cases
    } else if (c === '"') {
      const { str, consumed } = scanString(raw, i)
      expr += str
      i += consumed
    } else if (c === '\'') {
      const { str, consumed } = scanQuotedSymbol(raw, i)
      expr += str
      i += consumed
    } else if (c === '`') {
      const { str, consumed } = scanNestedTemplate(raw, i)
      expr += str
      i += consumed
    } else {
      expr += c
      i++
    }
  }

  return { expr, consumed: i - start }
}

function scanString(raw: string, start: number): { str: string; consumed: number } {
  let i = start + 1
  let str = '"'
  let escaping = false
  while (i < raw.length) {
    const c = raw[i]!
    str += c
    i++
    if (escaping) {
      escaping = false
    } else if (c === '\\') {
      escaping = true
    } else if (c === '"') {
      break
    }
  }
  return { str, consumed: i - start }
}

function scanQuotedSymbol(raw: string, start: number): { str: string; consumed: number } {
  let i = start + 1
  let str = '\''
  let escaping = false
  while (i < raw.length) {
    const c = raw[i]!
    str += c
    i++
    if (escaping) {
      escaping = false
    } else if (c === '\\') {
      escaping = true
    } else if (c === '\'') {
      break
    }
  }
  return { str, consumed: i - start }
}

/**
 * Scan a full nested template string starting at `start` (pointing at the opening backtick).
 * Handles ${...} spans inside the template recursively.
 */
function scanNestedTemplate(raw: string, start: number): { str: string; consumed: number } {
  let i = start + 1 // skip opening backtick
  let str = '`'

  while (i < raw.length) {
    const c = raw[i]!

    if (c === '`') {
      str += c
      i++
      break
    } else if (c === '$' && raw[i + 1] === '{') {
      str += '${'
      i += 2
      const { expr, consumed } = scanExpression(raw, i)
      str += `${expr}}`
      i += consumed
    } else {
      str += c
      i++
    }
  }

  return { str, consumed: i - start }
}

/**
 * Split the raw content of a template string (between the surrounding backticks)
 * into alternating literal and expression segments.
 */
export function splitSegments(raw: string): Segment[] {
  const segments: Segment[] = []
  let i = 0
  let literal = ''

  while (i < raw.length) {
    if (raw[i] === '$' && raw[i + 1] === '{') {
      if (literal.length > 0) {
        segments.push({ type: 'literal', value: literal })
        literal = ''
      }
      i += 2 // skip `${`
      const { expr, consumed } = scanExpression(raw, i)
      i += consumed
      segments.push({ type: 'expression', value: expr })
    } else {
      literal += raw[i]!
      i++
    }
  }

  if (literal.length > 0) {
    segments.push({ type: 'literal', value: literal })
  }

  return segments
}

// ---------------------------------------------------------------------------
// Public parser
// ---------------------------------------------------------------------------

export function parseTemplateString(ctx: ParserContext, token: TemplateStringToken): StringNode | TemplateStringNode {
  ctx.advance()
  const debugInfo = token[2]
  const resolvedSci = ctx.resolveTokenDebugInfo(debugInfo)

  // Strip surrounding backticks
  const raw = token[1].slice(1, -1)

  const segments = splitSegments(raw)

  // Empty template: ``, or single literal with no interpolation: `hello`
  if (segments.length === 0) {
    const node = withSourceCodeInfo([NodeTypes.String, '', 0], debugInfo, ctx) as StringNode
    ctx.setNodeEnd(node[2])
    return node
  }
  if (segments.length === 1 && segments[0]!.type === 'literal') {
    const node = withSourceCodeInfo([NodeTypes.String, segments[0]!.value, 0], debugInfo, ctx) as StringNode
    ctx.setNodeEnd(node[2])
    return node
  }

  // Build segment AST nodes
  const segmentNodes: (StringNode | AstNode)[] = []

  for (const segment of segments) {
    if (segment.type === 'literal') {
      if (segment.value.length === 0)
        continue
      segmentNodes.push(withSourceCodeInfo([NodeTypes.String, segment.value, 0], debugInfo, ctx) as StringNode)
    } else {
      if (segment.value.trim().length === 0) {
        throw new DvalaError('Empty interpolation in template string', resolvedSci)
      }
      // Re-tokenize and re-parse the expression
      const innerStream = tokenize(segment.value, false, resolvedSci?.filePath)
      const minified = minifyTokenStream(innerStream, { removeWhiteSpace: true })

      for (const t of minified.tokens) {
        if (t[0] === 'Error') {
          throw new DvalaError(`Template string interpolation error: ${t[3]}`, resolvedSci)
        }
      }

      const innerCtx = createParserContext(minified)
      const expr = parseExpression(innerCtx, 0)
      segmentNodes.push(expr)
    }
  }

  const node = withSourceCodeInfo([NodeTypes.TemplateString, segmentNodes, 0], debugInfo, ctx) as TemplateStringNode
  ctx.setNodeEnd(node[2])
  return node
}
