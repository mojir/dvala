import type { IfNode } from '../../builtin/specialExpressions/if'
import { NodeTypes } from '../../constants/constants'
import { ParseError } from '../../errors'
import type { SymbolToken } from '../../tokenizer/token'
import { assertReservedSymbolToken, isReservedSymbolToken, isSymbolToken } from '../../tokenizer/token'
import type { AstNode } from '../types'
import { withSourceCodeInfo } from '../helpers'
import type { ParserContext } from '../ParserContext'
import { parseImplicitBlock } from './parseImplicitBlock'

export function parseIf(ctx: ParserContext, token: SymbolToken): IfNode {
  ctx.builder?.startNode('If')
  ctx.advance()
  const condition = ctx.parseExpression()
  assertReservedSymbolToken(ctx.tryPeek(), 'then')
  ctx.advance()
  const thenExpression = parseImplicitBlock(ctx, ['else', 'end'])

  let elseExpression: AstNode | undefined
  if (isReservedSymbolToken(ctx.tryPeek(), 'else')) {
    ctx.advance()
    if (isSymbolToken(ctx.tryPeek()) && ctx.tryPeek()![1] === 'if') {
      // else if — chain: parse inner if which shares the outer end
      elseExpression = parseElseIf(ctx)
    } else {
      elseExpression = parseImplicitBlock(ctx, ['end'])
    }
  } else {
    throw new ParseError(
      '`if` without `else` is not allowed — use `when condition do expr end` for side effects, or add an `else` clause',
      ctx.peekSourceCodeInfo(),
    )
  }

  ctx.advance()

  const node = withSourceCodeInfo(
    [NodeTypes.If, [condition, thenExpression, elseExpression], 0],
    token[2],
    ctx,
  ) as IfNode
  ctx.setNodeEnd(node[2])
  ctx.builder?.endNode()
  return node
}

/**
 * Parse `if condition then body [else if ... | else ...]` without consuming `end`.
 * Used by `else if` chains — the outermost `if` consumes the single shared `end`.
 */
function parseElseIf(ctx: ParserContext): IfNode {
  const token = ctx.tryPeek()!
  ctx.advance() // skip 'if'
  const condition = ctx.parseExpression()
  assertReservedSymbolToken(ctx.tryPeek(), 'then')
  ctx.advance()
  const thenExpression = parseImplicitBlock(ctx, ['else', 'end'])

  let elseExpression: AstNode | undefined
  if (isReservedSymbolToken(ctx.tryPeek(), 'else')) {
    ctx.advance()
    if (isSymbolToken(ctx.tryPeek()) && ctx.tryPeek()![1] === 'if') {
      elseExpression = parseElseIf(ctx)
    } else {
      elseExpression = parseImplicitBlock(ctx, ['end'])
    }
  } else {
    throw new ParseError(
      '`if` without `else` is not allowed — use `when condition do expr end` for side effects, or add an `else` clause',
      ctx.peekSourceCodeInfo(),
    )
  }

  const node = withSourceCodeInfo(
    [NodeTypes.If, [condition, thenExpression, elseExpression], 0],
    token[2],
    ctx,
  ) as IfNode
  ctx.setNodeEnd(node[2])
  return node
}
