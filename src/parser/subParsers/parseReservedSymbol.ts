import { NodeTypes } from '@mojir/dvala-types'
import type { NumberNode, ReservedNode } from '../types'
import { isNumberReservedSymbol, numberReservedSymbolRecord } from '@mojir/dvala-types'
import { asReservedSymbolToken } from '../../tokenizer/token'
import { withSourceCodeInfo } from '../helpers'
import type { ParserContext } from '../ParserContext'

export function parseReservedSymbol(ctx: ParserContext): ReservedNode | NumberNode {
  ctx.builder?.startNode('ReservedSymbol')
  const token = asReservedSymbolToken(ctx.tryPeek())
  ctx.advance()

  const symbol = token[1]
  if (isNumberReservedSymbol(symbol)) {
    const node = withSourceCodeInfo([NodeTypes.Num, numberReservedSymbolRecord[symbol], 0], token[2], ctx)
    ctx.setNodeEnd(node[2])
    ctx.builder?.endNode()
    return node
  }
  const node = withSourceCodeInfo([NodeTypes.Reserved, token[1], 0], token[2], ctx)
  ctx.setNodeEnd(node[2])
  ctx.builder?.endNode()
  return node
}
