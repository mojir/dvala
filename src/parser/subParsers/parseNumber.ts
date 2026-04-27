import { NodeTypes } from '../../constants/constants'
import type { NumberNode } from '../types'
import { withSourceCodeInfo } from '../helpers'
import type { ParserContext } from '../ParserContext'

export function parseNumber(ctx: ParserContext): NumberNode {
  ctx.builder?.startNode('NumberLiteral')
  const token = ctx.peek()
  ctx.advance()

  const value = token[1]
  const negative = value[0] === '-'
  const numberString = (negative ? value.substring(1) : value).replace(/_/g, '')
  const node = withSourceCodeInfo([NodeTypes.Num, negative ? -Number(numberString) : Number(numberString), 0], token[2], ctx)
  ctx.setNodeEnd(node[2])
  ctx.builder?.endNode()
  return node
}
