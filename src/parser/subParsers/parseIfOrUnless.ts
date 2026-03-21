import type { IfNode } from '../../builtin/specialExpressions/if'
import type { UnlessNode } from '../../builtin/specialExpressions/unless'
import { specialExpressionTypes } from '../../builtin/specialExpressionTypes'
import { NodeTypes } from '../../constants/constants'
import type { SymbolToken } from '../../tokenizer/token'
import { assertReservedSymbolToken, isReservedSymbolToken, isSymbolToken } from '../../tokenizer/token'
import type { AstNode } from '../types'
import { withSourceCodeInfo } from '../helpers'
import type { ParserContext } from '../ParserContext'
import { parseImplicitBlock } from './parseImplicitBlock'

export function parseIfOrUnless(ctx: ParserContext, token: SymbolToken): IfNode | UnlessNode {
  const isUnless = token[1] === 'unless'
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
  }

  ctx.advance()

  return isUnless
    ? withSourceCodeInfo([NodeTypes.SpecialExpression, [specialExpressionTypes.unless, [condition, thenExpression, elseExpression]]], token[2]) satisfies UnlessNode
    : withSourceCodeInfo([NodeTypes.SpecialExpression, [specialExpressionTypes.if, [condition, thenExpression, elseExpression]]], token[2]) satisfies IfNode
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
      // else if — recurse
      elseExpression = parseElseIf(ctx)
    } else {
      elseExpression = parseImplicitBlock(ctx, ['end'])
    }
  }

  // Do NOT advance past 'end' — the outermost if handles that
  return withSourceCodeInfo([NodeTypes.SpecialExpression, [specialExpressionTypes.if, [condition, thenExpression, elseExpression]]], token[2]) satisfies IfNode
}
