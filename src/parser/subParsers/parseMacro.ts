import type { LambdaNode } from '../../builtin/specialExpressions/functions'
import { NodeTypes } from '../../constants/constants'
import { DvalaError } from '../../errors'
import type { AstNode, BindingTarget } from '../types'
import { assertOperatorToken, isMacroQualifiedToken, isReservedSymbolToken } from '../../tokenizer/token'
import { withSourceCodeInfo } from '../helpers'
import type { ParserContext } from '../ParserContext'
import { parseDo } from './parseDo'
import { parseFunctionArguments } from './parseFunction'

// Payload: [params, body, qualifiedName?]
export type MacroPayload = [LambdaNode[1][0], LambdaNode[1][1], string | null]
export type MacroNode = [typeof NodeTypes.Macro, MacroPayload, number]

export function parseMacro(ctx: ParserContext): MacroNode {
  const token = ctx.peek()
  ctx.advance() // skip 'macro' or 'macro@qualified.name' token

  // Qualified name comes from the MacroQualified token (macro@foo.bar)
  const qualifiedName: string | null = isMacroQualifiedToken(token) ? token[1] : null

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

  const node = withSourceCodeInfo([NodeTypes.Macro, [functionArguments, bodyNodes, qualifiedName], 0], token[2], ctx) as MacroNode
  ctx.setNodeEnd(node[2])
  return node
}
