import type { ArrayNode } from '../../builtin/specialExpressions/array'
import { NodeTypes } from '@mojir/dvala-types'
import { ParseError } from '../../errors'
import { asLBracketToken, assertRBracketToken, isOperatorToken, isRBracketToken } from '../../tokenizer/token'
import type { AstNode } from '@mojir/dvala-types'
import { withSourceCodeInfo } from '../helpers'
import type { ParserContext } from '../ParserContext'

export function parseArray(ctx: ParserContext): ArrayNode {
  ctx.builder?.startNode('Array')
  const firstToken = asLBracketToken(ctx.tryPeek())
  ctx.advance()
  const params: AstNode[] = []
  while (!ctx.isAtEnd() && !isRBracketToken(ctx.tryPeek())) {
    if (isOperatorToken(ctx.tryPeek(), '...')) {
      ctx.builder?.startNode('Spread')
      ctx.advance()
      params.push(withSourceCodeInfo([NodeTypes.Spread, ctx.parseExpression(), 0], ctx.peekDebugInfo(), ctx))
      ctx.builder?.endNode()
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
  ctx.builder?.endNode()
  return node
}
