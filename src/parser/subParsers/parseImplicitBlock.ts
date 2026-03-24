import { isOperatorToken, isReservedSymbolToken } from '../../tokenizer/token'
import type { AstNode } from '../types'
import { DvalaError } from '../../errors'
import { NodeTypes } from '../../constants/constants'
import type { DoNode } from '../../builtin/specialExpressions/block'
import type { ParserContext } from '../ParserContext'
import { withSourceCodeInfo } from '../helpers'

type ImplicitBlockEnd = 'end' | 'else' | 'case' | 'with'

export function parseImplicitBlock(ctx: ParserContext, ends: ImplicitBlockEnd[]): AstNode {
  const nodes: AstNode[] = []
  while (!ctx.isAtEnd() && !isImplicitBlockEnd(ctx, ends)) {
    if (isOperatorToken(ctx.tryPeek(), ';')) {
      ctx.advance()
    } else {
      nodes.push(ctx.parseExpression())
    }
  }
  assertImplicitBlockEnd(ctx, ends)

  if (nodes.length === 0) {
    throw new DvalaError('Expected expression', ctx.peekSourceCodeInfo())
  }

  if (nodes.length === 1) {
    return nodes[0]!
  }
  const node = withSourceCodeInfo([NodeTypes.Block, nodes, 0], ctx.peekDebugInfo(), ctx) as DoNode
  ctx.setNodeEnd(node[2])
  return node
}

function assertImplicitBlockEnd(ctx: ParserContext, ends: ImplicitBlockEnd[]): void {
  if (!isImplicitBlockEnd(ctx, ends)) {
    throw new DvalaError(`Expected ${ends.map(e => e[1]).join(' or ')}`, ctx.peekSourceCodeInfo())
  }
}

function isImplicitBlockEnd(ctx: ParserContext, ends: ImplicitBlockEnd[]): boolean {
  for (const end of ends) {
    if (isReservedSymbolToken(ctx.tryPeek(), end)) {
      return true
    }
  }
  return false
}
