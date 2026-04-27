import { NodeTypes } from '../../constants/constants'
import type { NormalExpressionNodeWithName, StringNode } from '../types'
import { withSourceCodeInfo } from '../helpers'
import type { ParserContext } from '../ParserContext'

export function parseRegexpShorthand(ctx: ParserContext): NormalExpressionNodeWithName {
  ctx.builder?.startNode('RegexpShorthand')
  const token = ctx.peek()
  ctx.advance()

  const endStringPosition = token[1].lastIndexOf('"')
  const regexpString = token[1].substring(2, endStringPosition)
  const optionsString = token[1].substring(endStringPosition + 1)
  const stringNode: StringNode = withSourceCodeInfo([NodeTypes.Str, regexpString, 0], token[2], ctx)

  const optionsNode: StringNode = withSourceCodeInfo([NodeTypes.Str, optionsString, 0], token[2], ctx)

  const node: NormalExpressionNodeWithName = withSourceCodeInfo([
    NodeTypes.Call,
    [
      withSourceCodeInfo([NodeTypes.Builtin, 'regexp', 0], token[2], ctx),
      [stringNode, optionsNode],
    ],
    0,
  ], token[2], ctx)

  ctx.setNodeEnd(node[2])
  ctx.builder?.endNode()
  return node
}
