import type { LoopNode } from '../../builtin/specialExpressions/loop'
import { NodeTypes } from '../../constants/constants'
import { ParseError } from '../../errors'
import type { AstNode, BindingTarget } from '../types'
import type { SymbolToken } from '../../tokenizer/token'
import {
  assertLParenToken,
  assertOperatorToken,
  assertRParenToken,
  isOperatorToken,
  isRParenToken,
} from '../../tokenizer/token'
import { withSourceCodeInfo } from '../helpers'
import type { ParserContext } from '../ParserContext'
import { parseBindingTarget } from './parseBindingTarget'

export function parseLoop(ctx: ParserContext, firstToken: SymbolToken): LoopNode {
  ctx.builder?.startNode('Loop')
  ctx.advance()

  assertLParenToken(ctx.tryPeek())
  ctx.advance()

  const bindings: [BindingTarget, AstNode][] = []
  let token = ctx.tryPeek()
  while (!ctx.isAtEnd() && !isRParenToken(token)) {
    const target = parseBindingTarget(ctx, { requireDefaultValue: true, noRest: true })
    const value = target[1][1]!
    target[1][1] = undefined

    bindings.push([target, value])

    if (isOperatorToken(ctx.tryPeek(), ',')) {
      ctx.advance()
    }
    token = ctx.tryPeek()
  }
  if (bindings.length === 0) {
    throw new ParseError('Expected binding', ctx.peekSourceCodeInfo())
  }

  assertRParenToken(token)
  ctx.advance()

  assertOperatorToken(ctx.tryPeek(), '->')
  ctx.advance()

  const expression = ctx.parseExpression()

  const node = withSourceCodeInfo([NodeTypes.Loop, [bindings, expression], 0], firstToken[2], ctx) as LoopNode
  ctx.setNodeEnd(node[2])
  ctx.builder?.endNode()
  return node
}
