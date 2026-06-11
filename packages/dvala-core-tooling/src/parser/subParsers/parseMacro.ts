import type { LambdaNode } from '@mojir/dvala-engine'
import { NodeTypes } from '@mojir/dvala-types'
import { ParseError } from '@mojir/dvala-types'
import type { AstNode, BindingTarget } from '@mojir/dvala-types'
import { assertOperatorToken, isReservedSymbolToken } from '../../tokenizer/token'
import { withSourceCodeInfo } from '../helpers'
import type { ParserContext } from '../ParserContext'
import { parseDo } from './parseDo'
import { parseFunctionArguments } from './parseFunction'

// Payload: [params, body] — same shape as LambdaNode payload
type MacroPayload = LambdaNode[1]
type MacroNode = [typeof NodeTypes.Macro, MacroPayload, number]

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
    // The do node is discarded (only its statements survive), so the evaluator
    // never fires onNodeEval for it — flag its already-recorded source-map
    // position a structural leaf so coverage doesn't count it as found-but-unhit.
    // Mirrors the same unwrap in parseFunction. See ParserContext.markStructuralLeaf.
    ctx.markStructuralLeaf(doNode[2])
  } else {
    bodyNodes = [ctx.parseExpression()]
  }

  const node = withSourceCodeInfo([NodeTypes.Macro, [functionArguments, bodyNodes], 0], token[2], ctx) as MacroNode
  ctx.setNodeEnd(node[2])
  ctx.builder?.endNode()
  return node
}
