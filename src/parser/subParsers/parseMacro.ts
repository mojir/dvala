import type { LambdaNode } from '../../builtin/specialExpressions/functions'
import { NodeTypes } from '../../constants/constants'
import { DvalaError } from '../../errors'
import type { AstNode, BindingTarget } from '../types'
import { assertOperatorToken, isReservedSymbolToken } from '../../tokenizer/token'
import { withSourceCodeInfo } from '../helpers'
import type { ParserContext } from '../ParserContext'
import { parseDo } from './parseDo'
import { parseFunctionArguments } from './parseFunction'

export type MacroNode = [typeof NodeTypes.Macro, LambdaNode[1], number]

export function parseMacro(ctx: ParserContext): MacroNode {
  const token = ctx.peek()
  ctx.advance() // skip 'macro'

  let functionArguments: BindingTarget[]
  try {
    functionArguments = parseFunctionArguments(ctx)
  } catch {
    throw new DvalaError('Expected function parameters after "macro"', ctx.peekSourceCodeInfo())
  }

  assertOperatorToken(ctx.peek(), '->')
  ctx.advance()

  let bodyNodes: AstNode[]
  if (isReservedSymbolToken(ctx.peek(), 'do')) {
    const doNode = parseDo(ctx)
    bodyNodes = doNode[1] as AstNode[]
  } else {
    bodyNodes = [ctx.parseExpression()]
  }

  const node = withSourceCodeInfo([NodeTypes.Macro, [functionArguments, bodyNodes], 0], token[2], ctx) as MacroNode
  ctx.setNodeEnd(node[2])
  return node
}
