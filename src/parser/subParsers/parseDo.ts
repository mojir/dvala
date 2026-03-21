import type { DoNode } from '../../builtin/specialExpressions/block'
import { specialExpressionTypes } from '../../builtin/specialExpressionTypes'
import { NodeTypes } from '../../constants/constants'
import { DvalaError } from '../../errors'
import { asReservedSymbolToken, assertReservedSymbolToken, isOperatorToken, isReservedSymbolToken } from '../../tokenizer/token'
import type { AstNode } from '../types'
import type { ParserContext } from '../ParserContext'
import { withSourceCodeInfo } from '../helpers'

export function parseDo(ctx: ParserContext): DoNode {
  const token = asReservedSymbolToken(ctx.tryPeek(), 'do')
  ctx.advance()

  const expressions: AstNode[] = []
  while (!ctx.isAtEnd() && !isReservedSymbolToken(ctx.tryPeek(), 'end')) {
    expressions.push(ctx.parseExpression())
    if (isOperatorToken(ctx.tryPeek(), ';')) {
      ctx.advance()
    } else if (!isReservedSymbolToken(ctx.tryPeek(), 'end')) {
      throw new DvalaError('Expected end', ctx.peekSourceCodeInfo())
    }
  }

  assertReservedSymbolToken(ctx.tryPeek(), 'end')
  ctx.advance()
  return withSourceCodeInfo([NodeTypes.SpecialExpression, [specialExpressionTypes.block, expressions, undefined]], token[2]) satisfies DoNode
}
