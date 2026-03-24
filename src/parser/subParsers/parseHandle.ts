import type { HandleNode } from '../../builtin/specialExpressions/handle'
import { NodeTypes } from '../../constants/constants'
import { DvalaError } from '../../errors'
import { asReservedSymbolToken, assertReservedSymbolToken, isOperatorToken, isReservedSymbolToken } from '../../tokenizer/token'
import type { AstNode } from '../types'
import type { ParserContext } from '../ParserContext'
import { withSourceCodeInfo } from '../helpers'

/**
 * Parse `handle <body> with <handlers-expr> end`.
 *
 * - body: semicolon-separated expressions
 * - handlers-expr: single expression evaluating to a handler function or list
 */
export function parseHandle(ctx: ParserContext): HandleNode {
  const token = asReservedSymbolToken(ctx.tryPeek(), 'handle')
  ctx.advance()

  const expressions: AstNode[] = []
  while (!ctx.isAtEnd() && !isReservedSymbolToken(ctx.tryPeek(), 'with')) {
    expressions.push(ctx.parseExpression())
    if (isOperatorToken(ctx.tryPeek(), ';')) {
      ctx.advance()
    } else if (!isReservedSymbolToken(ctx.tryPeek(), 'with')) {
      throw new DvalaError('Expected "with" or ";"', ctx.peekSourceCodeInfo())
    }
  }

  if (!isReservedSymbolToken(ctx.tryPeek(), 'with')) {
    throw new DvalaError('Expected "with"', ctx.peekSourceCodeInfo())
  }
  ctx.advance()

  const handlersExpr = ctx.parseExpression()

  assertReservedSymbolToken(ctx.tryPeek(), 'end')
  ctx.advance()

  const node = withSourceCodeInfo(
    [NodeTypes.Handle, [expressions, handlersExpr], 0],
    token[2],
    ctx,
  ) as HandleNode
  ctx.setNodeEnd(node[2])
  return node
}
