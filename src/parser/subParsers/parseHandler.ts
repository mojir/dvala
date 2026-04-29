import { NodeTypes } from '../../constants/constants'
import { ParseError } from '../../errors'
import type { AstNode, BindingTarget } from '../types'
import {
  isEffectNameToken,
  isLParenToken,
  isOperatorToken,
  isRParenToken,
  isReservedSymbolToken,
  isSymbolToken,
} from '../../tokenizer/token'
import { withSourceCodeInfo } from '../helpers'
import type { ParserContext } from '../ParserContext'
import { parseBindingTarget } from './parseBindingTarget'
import { parseDo } from './parseDo'

/**
 * Parsed handler clause — effect name, parameter bindings, and body expressions.
 */
interface ParsedHandlerClause {
  effectName: string
  params: BindingTarget[]
  body: AstNode[]
}

/**
 * HandlerNode: ["Handler", [clauses, transform, shallow, linear], nodeId]
 * - clauses: array of { effectName, params, body } parsed clause descriptors
 * - transform: [paramBindingTarget, bodyExprs] | null
 * - shallow: `shallow handler ...` — resume does NOT reinstall on continuation
 * - linear: `linear handler ...` — host-style dispatch (single-shot resume,
 *   barrier-free reach into parallel/race branches). See
 *   design/active/2026-04-29_linear-handler.md.
 *
 * The handler value is created at evaluation time from this AST node.
 */
type HandlerNode = [
  typeof NodeTypes.Handler,
  [ParsedHandlerClause[], [BindingTarget, AstNode[]] | null, boolean, boolean],
  number,
]

/**
 * Parse `handler <clauses> [transform x -> expr] end`.
 *
 * `handler` and `transform` are contextual keywords (regular symbols),
 * not reserved words — they can be used as variable names elsewhere.
 * `end` is a reserved keyword as usual.
 *
 * Clauses: `@effect(params...) -> expr` — the `@effect` token starts each clause.
 * No separators between clauses (like match cases).
 * Duplicate effect names are a parse error.
 * Transform: optional, `transform x -> expr` (or `transform x -> do...end`).
 */
export function parseHandler(ctx: ParserContext, shallow = false, linear = false): HandlerNode {
  // startNode is emitted by the caller when a `shallow` or `linear` modifier
  // was consumed in parseExpression before calling parseHandler. For a plain
  // `handler ... end`, we start the node here.
  if (!shallow && !linear) {
    ctx.builder?.startNode('Handler')
  }
  // `handler` is a contextual keyword (Symbol token, not ReservedSymbol)
  const token = ctx.tryPeek()!
  ctx.advance() // consume 'handler'

  const clauses: ParsedHandlerClause[] = []
  const seenEffects = new Set<string>()

  // Parse effect clauses until we hit `transform` or `end`
  while (!ctx.isAtEnd() && !isSymbolToken(ctx.tryPeek(), 'transform') && !isReservedSymbolToken(ctx.tryPeek(), 'end')) {
    const clauseToken = ctx.tryPeek()
    if (!isEffectNameToken(clauseToken)) {
      throw new ParseError('Expected effect clause (@effect) or "transform" or "end"', ctx.peekSourceCodeInfo())
    }

    const effectName = clauseToken[1]
    ctx.advance() // consume effect name token

    // Check for duplicate effect clauses
    if (seenEffects.has(effectName)) {
      throw new ParseError(`Duplicate handler clause for effect '@${effectName}'`, ctx.peekSourceCodeInfo())
    }
    seenEffects.add(effectName)

    // Parse parameters: @effect(params...) or @effect() or @effect with no parens
    const params: BindingTarget[] = []
    if (isLParenToken(ctx.tryPeek())) {
      ctx.advance() // consume (
      while (!ctx.isAtEnd() && !isRParenToken(ctx.tryPeek())) {
        params.push(parseBindingTarget(ctx, { stopTypeAnnotationAtRParen: true }))
        if (isOperatorToken(ctx.tryPeek(), ',')) {
          ctx.advance() // consume comma
        }
      }
      if (!isRParenToken(ctx.tryPeek())) {
        throw new ParseError('Expected ")"', ctx.peekSourceCodeInfo())
      }
      ctx.advance() // consume )
    }

    // Expect ->
    if (!isOperatorToken(ctx.tryPeek(), '->')) {
      throw new ParseError('Expected "->" after handler clause parameters', ctx.peekSourceCodeInfo())
    }
    ctx.advance() // consume ->

    // Parse body: single expression or do...end block
    let body: AstNode[]
    if (isReservedSymbolToken(ctx.tryPeek(), 'do')) {
      const doNode = parseDo(ctx)
      body = doNode[1]
    } else {
      body = [ctx.parseExpression()]
    }

    clauses.push({ effectName, params, body })
  }

  // Parse optional transform clause (`transform` is a contextual keyword)
  let transform: [BindingTarget, AstNode[]] | null = null
  if (isSymbolToken(ctx.tryPeek(), 'transform')) {
    ctx.advance() // consume 'transform'

    // Parse transform parameter binding
    const transformParam = parseBindingTarget(ctx)

    // Expect ->
    if (!isOperatorToken(ctx.tryPeek(), '->')) {
      throw new ParseError('Expected "->" after transform parameter', ctx.peekSourceCodeInfo())
    }
    ctx.advance() // consume ->

    // Parse transform body
    let transformBody: AstNode[]
    if (isReservedSymbolToken(ctx.tryPeek(), 'do')) {
      const doNode = parseDo(ctx)
      transformBody = doNode[1]
    } else {
      transformBody = [ctx.parseExpression()]
    }

    transform = [transformParam, transformBody]
  }

  // Expect end
  if (!isReservedSymbolToken(ctx.tryPeek(), 'end')) {
    throw new ParseError('Expected "end" to close handler', ctx.peekSourceCodeInfo())
  }
  ctx.advance() // consume 'end'

  const node = withSourceCodeInfo(
    [NodeTypes.Handler, [clauses, transform, shallow, linear], 0],
    token[2],
    ctx,
  ) as HandlerNode
  ctx.setNodeEnd(node[2])
  ctx.builder?.endNode()
  return node
}
