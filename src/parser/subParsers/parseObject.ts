import type { ObjectEntry, ObjectNode } from '../../builtin/specialExpressions/object'
import { NodeTypes } from '../../constants/constants'
import { ParseError } from '../../errors'
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
  const entries: ObjectEntry[] = []
  while (!ctx.isAtEnd() && !isRBraceToken(ctx.tryPeek())) {
    if (isOperatorToken(ctx.tryPeek(), '...')) {
      ctx.advance()
      entries.push(withSourceCodeInfo([NodeTypes.Spread, ctx.parseExpression(), 0], ctx.peekDebugInfo(), ctx))
    } else {
      const token = ctx.tryPeek()
      let keyNode: AstNode
      if (isTemplateStringToken(token)) {
        keyNode = parseTemplateString(ctx, token)
      } else if (isStringToken(token)) {
        const stringNode = parseString(ctx, token)
        keyNode = withSourceCodeInfo([NodeTypes.Str, stringNode[1], 0], token[2], ctx)
      } else if (isSymbolToken(token)) {
        const isQuoted = token[1].startsWith('\'')
        const value = isQuoted
          ? stringFromQuotedSymbol(token[1])
          : token[1]
        keyNode = withSourceCodeInfo([NodeTypes.Str, value, 0], token[2], ctx)
        ctx.advance()
        // Shorthand property: { foo } → { foo: foo } (only for unquoted symbols)
        if (!isQuoted && !isOperatorToken(ctx.tryPeek(), ':')) {
          const valueNode = withSourceCodeInfo([NodeTypes.Sym, value, 0], token[2], ctx)
          entries.push([keyNode, valueNode])
          const nextToken = ctx.tryPeek()
          if (!isOperatorToken(nextToken, ',') && !isRBraceToken(nextToken)) {
            throw new ParseError('Expected comma or closing brace', ctx.peekSourceCodeInfo())
          }
          if (isOperatorToken(nextToken, ',')) {
            ctx.advance()
          }
          continue
        }
      } else if (isLBracketToken(token)) {
        ctx.advance()
        keyNode = ctx.parseExpression()
        assertRBracketToken(ctx.tryPeek())
        ctx.advance()
      } else {
        throw new ParseError('Expected key to be a symbol or a string', ctx.peekSourceCodeInfo())
      }

      assertOperatorToken(ctx.tryPeek(), ':')
      ctx.advance()

      const valueNode = ctx.parseExpression()
      entries.push([keyNode, valueNode])
    }
    const nextToken = ctx.tryPeek()
    if (!isOperatorToken(nextToken, ',') && !isRBraceToken(nextToken)) {
      throw new ParseError('Expected comma or closing brace', ctx.peekSourceCodeInfo())
    }

    if (isOperatorToken(nextToken, ',')) {
      ctx.advance()
    }
  }

  assertRBraceToken(ctx.tryPeek())
  ctx.advance()

  const node = withSourceCodeInfo([NodeTypes.Object, entries, 0], firstToken[2], ctx) as ObjectNode
  ctx.setNodeEnd(node[2])
  return node
}
