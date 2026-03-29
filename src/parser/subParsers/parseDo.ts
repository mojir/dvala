import type { DoNode } from '../../builtin/specialExpressions/block'
import { NodeTypes } from '../../constants/constants'
import { ParseError } from '../../errors'
import { asReservedSymbolToken, assertReservedSymbolToken, isOperatorToken, isReservedSymbolToken } from '../../tokenizer/token'
import type { AstNode } from '../types'
import type { ParserContext } from '../ParserContext'
import { withSourceCodeInfo } from '../helpers'

/**
 * WithHandlerNode: ["WithHandler", [handlerExpr, bodyExprs], nodeId]
 * - handlerExpr: expression evaluating to a HandlerFunction
 * - bodyExprs: remaining expressions in the block (handler is active for these)
 */
export type WithHandlerNode = [typeof NodeTypes.WithHandler, [AstNode, AstNode[]], number]

export function parseDo(ctx: ParserContext): DoNode {
  const token = asReservedSymbolToken(ctx.tryPeek(), 'do')
  ctx.advance()

  const expressions: AstNode[] = []
  while (!ctx.isAtEnd() && !isReservedSymbolToken(ctx.tryPeek(), 'end')) {
    // Check for `with h;` — handler installation for rest of block.
    // `with` is a reserved keyword; inside parseDo it's always a handler install.
    if (isReservedSymbolToken(ctx.tryPeek(), 'with')) {
      const withNode = parseWithHandler(ctx)
      expressions.push(withNode)
      break // remaining expressions are inside the WithHandler node
    }

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

/**
 * Parse `with <expr>; <body>` inside a do...end block.
 *
 * Consumes `with`, parses the handler expression, consumes `;`,
 * then collects remaining expressions until `end` as the handler's body.
 * The handler is active for the body (like `let` scoping).
 */
function parseWithHandler(ctx: ParserContext): WithHandlerNode {
  const token = asReservedSymbolToken(ctx.tryPeek(), 'with')
  ctx.advance() // consume 'with'

  const handlerExpr = ctx.parseExpression()

  if (!isOperatorToken(ctx.tryPeek(), ';')) {
    throw new ParseError('Expected ";" after with handler expression', ctx.peekSourceCodeInfo())
  }
  ctx.advance() // consume ';'

  // Collect remaining expressions until 'end' as the body
  const bodyExprs: AstNode[] = []
  while (!ctx.isAtEnd() && !isReservedSymbolToken(ctx.tryPeek(), 'end')) {
    // Nested `with h;` — recurse to capture the rest
    if (isReservedSymbolToken(ctx.tryPeek(), 'with')) {
      bodyExprs.push(parseWithHandler(ctx))
      break
    }

    bodyExprs.push(ctx.parseExpression())
    if (isOperatorToken(ctx.tryPeek(), ';')) {
      ctx.advance()
    } else if (!isReservedSymbolToken(ctx.tryPeek(), 'end')) {
      throw new ParseError('Expected ";" or "end"', ctx.peekSourceCodeInfo())
    }
  }

  const node = withSourceCodeInfo(
    [NodeTypes.WithHandler, [handlerExpr, bodyExprs], 0],
    token[2],
    ctx,
  ) as WithHandlerNode
  ctx.setNodeEnd(node[2])
  return node
}
