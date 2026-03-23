import { NodeTypes } from '../../constants/constants'
import type { NumberNode, ReservedNode } from '../types'
import { isNumberReservedSymbol, numberReservedSymbolRecord } from '../../tokenizer/reservedNames'
import { asReservedSymbolToken } from '../../tokenizer/token'
import { withSourceCodeInfo } from '../helpers'
import type { ParserContext } from '../ParserContext'

export function parseReservedSymbol(ctx: ParserContext): ReservedNode | NumberNode {
  const token = asReservedSymbolToken(ctx.tryPeek())
  ctx.advance()

  const symbol = token[1]
  if (isNumberReservedSymbol(symbol)) {
    const node = withSourceCodeInfo([NodeTypes.Number, numberReservedSymbolRecord[symbol], 0], token[2], ctx) as NumberNode
    ctx.setNodeEnd(node[2])
    return node
  }
  const node = withSourceCodeInfo([NodeTypes.Reserved, token[1], 0], token[2], ctx) as ReservedNode
  ctx.setNodeEnd(node[2])
  return node
}
