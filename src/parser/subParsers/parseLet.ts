import type { LetNode } from '../../builtin/specialExpressions/let'
import { NodeTypes } from '../../constants/constants'
import type { SymbolToken } from '../../tokenizer/token'
import { withSourceCodeInfo } from '../helpers'
import type { ParserContext } from '../ParserContext'
import { parseBindingTarget } from './parseBindingTarget'

export function parseLet(ctx: ParserContext, token: SymbolToken): LetNode {
  ctx.advance()

  const target = parseBindingTarget(ctx, { requireDefaultValue: true, noRest: true })

  const value = target[1][1]!
  target[1][1] = undefined

  const node = withSourceCodeInfo([NodeTypes.Let, [target, value], 0], token[2], ctx) as LetNode
  ctx.setNodeEnd(node[2])
  return node
}
