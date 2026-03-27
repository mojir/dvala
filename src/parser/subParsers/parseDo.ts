import type { DoNode } from '../../builtin/specialExpressions/block'
import { NodeTypes } from '../../constants/constants'
import { ParseError } from '../../errors'
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
      throw new ParseError('Expected end', ctx.peekSourceCodeInfo())
    }
  }

  assertReservedSymbolToken(ctx.tryPeek(), 'end')
  ctx.advance()
  const node = withSourceCodeInfo([NodeTypes.Block, expressions, 0], token[2], ctx) as DoNode
  ctx.setNodeEnd(node[2])
  return node
}
