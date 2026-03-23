import type { ObjectNode } from '../../builtin/specialExpressions/object'
import { specialExpressionTypes } from '../../builtin/specialExpressionTypes'
import { NodeTypes } from '../../constants/constants'
import { DvalaError } from '../../errors'
import { asLBraceToken, assertOperatorToken, assertRBraceToken, assertRBracketToken, isLBracketToken, isOperatorToken, isRBraceToken, isStringToken, isSymbolToken, isTemplateStringToken } from '../../tokenizer/token'
import type { AstNode } from '../types'
import { stringFromQuotedSymbol, withSourceCodeInfo } from '../helpers'
import type { ParserContext } from '../ParserContext'
import { parseString } from './parseString'
import { parseTemplateString } from './parseTemplateString'

export function parseObject(ctx: ParserContext): ObjectNode {
  const
    firstToken = asLBraceToken(ctx.tryPeek())
  ctx.advance()
  const params: AstNode[] = []
  while (!ctx.isAtEnd() && !isRBraceToken(ctx.tryPeek())) {
    if (isOperatorToken(ctx.tryPeek(), '...')) {
      ctx.advance()
      params.push(withSourceCodeInfo([NodeTypes.Spread, ctx.parseExpression(), 0], ctx.peekDebugInfo(), ctx))
    } else {
      const token = ctx.tryPeek()
      if (isTemplateStringToken(token)) {
        params.push(parseTemplateString(ctx, token))
      } else if (isStringToken(token)) {
        const stringNode = parseString(ctx, token)
        params.push(withSourceCodeInfo([NodeTypes.String, stringNode[1], 0], token[2], ctx))
      } else if (isSymbolToken(token)) {
        const value = token[1].startsWith('\'')
          ? stringFromQuotedSymbol(token[1])
          : token[1]
        params.push(withSourceCodeInfo([NodeTypes.String, value, 0], token[2], ctx))
        ctx.advance()
      } else if (isLBracketToken(token)) {
        ctx.advance()
        params.push(ctx.parseExpression())
        assertRBracketToken(ctx.tryPeek())
        ctx.advance()
      } else {
        throw new DvalaError('Expected key to be a symbol or a string', ctx.peekSourceCodeInfo())
      }

      assertOperatorToken(ctx.tryPeek(), ':')
      ctx.advance()

      params.push(ctx.parseExpression())
    }
    const nextToken = ctx.tryPeek()
    if (!isOperatorToken(nextToken, ',') && !isRBraceToken(nextToken)) {
      throw new DvalaError('Expected comma or closing brace', ctx.peekSourceCodeInfo())
    }

    if (isOperatorToken(nextToken, ',')) {
      ctx.advance()
    }
  }

  assertRBraceToken(ctx.tryPeek())
  ctx.advance()

  return withSourceCodeInfo([NodeTypes.SpecialExpression, [specialExpressionTypes.object, params], 0], firstToken[2], ctx) as ObjectNode
}
