import type { ArrayNode } from '../../builtin/specialExpressions/array'
import { NodeTypes } from '../../constants/constants'
import { ParseError } from '../../errors'
import { asLBracketToken, assertRBracketToken, isOperatorToken, isRBracketToken } from '../../tokenizer/token'
import type { AstNode } from '../types'
import { withSourceCodeInfo } from '../helpers'
import type { ParserContext } from '../ParserContext'

export function parseArray(ctx: ParserContext): ArrayNode {
  const firstToken = asLBracketToken(ctx.tryPeek())
  ctx.advance()
  const params: AstNode[] = []
  while (!ctx.isAtEnd() && !isRBracketToken(ctx.tryPeek())) {
    if (isOperatorToken(ctx.tryPeek(), '...')) {
      ctx.advance()
      params.push(withSourceCodeInfo([NodeTypes.Spread, ctx.parseExpression(), 0], ctx.peekDebugInfo(), ctx))
    } else {
      params.push(ctx.parseExpression())
    }
    const nextToken = ctx.tryPeek()
    if (!isOperatorToken(nextToken, ',') && !isRBracketToken(nextToken)) {
      throw new ParseError('Expected comma or closing parenthesis', ctx.peekSourceCodeInfo())
    }
    if (isOperatorToken(nextToken, ',')) {
      ctx.advance()
    }
  }

  assertRBracketToken(ctx.tryPeek())
  ctx.advance()

  const node = withSourceCodeInfo([NodeTypes.Array, params, 0], firstToken[2], ctx)
  ctx.setNodeEnd(node[2])
  return node as ArrayNode
}
