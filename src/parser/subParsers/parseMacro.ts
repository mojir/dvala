import type { LambdaNode } from '../../builtin/specialExpressions/functions'
import { NodeTypes } from '../../constants/constants'
import { ParseError } from '../../errors'
import type { AstNode, BindingTarget } from '../types'
import { assertOperatorToken, isReservedSymbolToken } from '../../tokenizer/token'
import { withSourceCodeInfo } from '../helpers'
import type { ParserContext } from '../ParserContext'
import { parseDo } from './parseDo'
import { parseFunctionArguments } from './parseFunction'

// Payload: [params, body] — same shape as LambdaNode payload
export type MacroPayload = LambdaNode[1]
export type MacroNode = [typeof NodeTypes.Macro, MacroPayload, number]

export function parseMacro(ctx: ParserContext): MacroNode {
  ctx.builder?.startNode('Macro')
  const token = ctx.peek()
  ctx.advance() // skip 'macro' token

  let functionArguments: BindingTarget[]
  try {
    functionArguments = parseFunctionArguments(ctx)
  } catch {
    throw new ParseError('Expected function parameters after "macro"', ctx.peekSourceCodeInfo())
  }

  assertOperatorToken(ctx.peek(), '->')
  ctx.advance()

  let bodyNodes: AstNode[]
  if (isReservedSymbolToken(ctx.peek(), 'do')) {
    const doNode = parseDo(ctx)
    bodyNodes = doNode[1]
  } else {
    bodyNodes = [ctx.parseExpression()]
  }

  const node = withSourceCodeInfo([NodeTypes.Macro, [functionArguments, bodyNodes], 0], token[2], ctx) as MacroNode
  ctx.setNodeEnd(node[2])
  ctx.builder?.endNode()
  return node
}
