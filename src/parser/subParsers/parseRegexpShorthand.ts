import { NodeTypes } from '../../constants/constants'
import type { NormalExpressionNodeWithName, StringNode } from '../types'
import { withSourceCodeInfo } from '../helpers'
import type { ParserContext } from '../ParserContext'

export function parseRegexpShorthand(ctx: ParserContext): NormalExpressionNodeWithName {
  const token = ctx.peek()
  ctx.advance()

  const endStringPosition = token[1].lastIndexOf('"')
  const regexpString = token[1].substring(2, endStringPosition)
  const optionsString = token[1].substring(endStringPosition + 1)
  const stringNode: StringNode = withSourceCodeInfo([NodeTypes.String, regexpString, 0], token[2], ctx) as StringNode

  const optionsNode: StringNode = withSourceCodeInfo([NodeTypes.String, optionsString, 0], token[2], ctx) as StringNode

  const node: NormalExpressionNodeWithName = withSourceCodeInfo([
    NodeTypes.Call,
    [
      withSourceCodeInfo([NodeTypes.Builtin, 'regexp', 0], token[2], ctx),
      [stringNode, optionsNode],
    ],
    0,
  ], token[2], ctx) as NormalExpressionNodeWithName

  ctx.setNodeEnd(node[2])
  return node
}
