import type { DoNode, WithHandler } from '../../builtin/specialExpressions/block'
import { specialExpressionTypes } from '../../builtin/specialExpressionTypes'
import { NodeTypes } from '../../constants/constants'
import { DvalaError } from '../../errors'
import { asReservedSymbolToken, assertReservedSymbolToken, isOperatorToken, isReservedSymbolToken } from '../../tokenizer/token'
import type { AstNode } from '../types'
import type { ParserContext } from '../ParserContext'
import { withSourceCodeInfo } from '../helpers'
import { parseImplicitBlock } from './parseImplicitBlock'

export function parseDo(ctx: ParserContext): DoNode {
  const token = asReservedSymbolToken(ctx.tryPeek(), 'do')
  ctx.advance()

  const expressions: AstNode[] = []
  while (!ctx.isAtEnd() && !isReservedSymbolToken(ctx.tryPeek(), 'end') && !isReservedSymbolToken(ctx.tryPeek(), 'with')) {
    expressions.push(ctx.parseExpression())
    if (isOperatorToken(ctx.tryPeek(), ';')) {
      ctx.advance()
    }
    else if (!isReservedSymbolToken(ctx.tryPeek(), 'end') && !isReservedSymbolToken(ctx.tryPeek(), 'with')) {
      throw new DvalaError('Expected end', ctx.peekSourceCodeInfo())
    }
  }

  // Parse optional with-handlers
  let withHandlers: WithHandler[] | undefined
  if (isReservedSymbolToken(ctx.tryPeek(), 'with')) {
    ctx.advance()
    withHandlers = []
    while (!ctx.isAtEnd() && !isReservedSymbolToken(ctx.tryPeek(), 'end')) {
      assertReservedSymbolToken(ctx.tryPeek(), 'case')
      ctx.advance()
      const effectExpr = ctx.parseExpression()
      assertReservedSymbolToken(ctx.tryPeek(), 'then')
      ctx.advance()
      const handlerFn = parseImplicitBlock(ctx, ['case', 'end'])
      withHandlers.push([effectExpr, handlerFn])
    }
  }

  assertReservedSymbolToken(ctx.tryPeek(), 'end')
  ctx.advance()
  return withSourceCodeInfo([NodeTypes.SpecialExpression, [specialExpressionTypes.block, expressions, withHandlers]], token[2]) satisfies DoNode
}
