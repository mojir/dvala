import type { Any } from '../../interface'
import type { AstNode, SpecialExpressionNode } from '../../parser/types'
import { joinSets } from '../../utils'
import type { BuiltinSpecialExpression, CustomDocs } from '../interface'
import type { specialExpressionTypes } from '../specialExpressionTypes'

/**
 * HandleNode: [type, bodyExprs, handlersExpr]
 * - bodyExprs: array of body expression AST nodes
 * - handlersExpr: single expression evaluating to a handler function or list of handler functions
 */
export type HandleNode = SpecialExpressionNode<[typeof specialExpressionTypes['handle'], AstNode[], AstNode]>

const docs: CustomDocs = {
  category: 'special-expression',
  customVariants: ['handle body with handlers end'],
  details: [
    ['body', 'expressions', 'The expressions to evaluate.'],
    ['handlers', 'expression', 'An expression evaluating to a handler function `(eff, arg, next) -> value` or a list of handler functions.'],
  ],
  description: 'Evaluates `body` with effect handlers installed. When `perform` is called inside the body, '
    + 'the handlers are tried in order. Each handler is a function `(eff, arg, next) -> value` where '
    + '`eff` is the effect, `arg` is the payload, and `next` is a function to pass to the next handler. '
    + 'The handler\'s return value becomes the result of `perform`.',
  examples: [
    `do
  let h = (arg, eff, nxt) ->
    if eff == @dvala.io.println then "handled: " ++ arg
    else nxt(eff, arg)
    end;
  handle
    perform(@dvala.io.println, "hello")
  with [h]
  end
end`,
  ],
  seeAlso: ['perform', 'effect?'],
}

export const handleSpecialExpression: BuiltinSpecialExpression<Any, HandleNode> = {
  arity: { min: 0 },
  docs,
  getUndefinedSymbols: (node, contextStack, { getUndefinedSymbols, builtin }) => {
    const [, bodyExprs, handlersExpr] = node[1]
    const bodyResult = getUndefinedSymbols(bodyExprs, contextStack, builtin)
    const handlersResult = getUndefinedSymbols([handlersExpr], contextStack, builtin)
    return joinSets(bodyResult, handlersResult)
  },
}
