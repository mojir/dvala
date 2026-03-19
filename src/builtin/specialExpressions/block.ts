import type { Any } from '../../interface'
import type { AstNode, SpecialExpressionNode } from '../../parser/types'
import { joinSets } from '../../utils'
import type { BuiltinSpecialExpression, CustomDocs } from '../interface'
import type { specialExpressionTypes } from '../specialExpressionTypes'

export type WithHandler = [AstNode, AstNode] // [effectExpr, handlerFn]

export type DoNode = SpecialExpressionNode<[typeof specialExpressionTypes['block'], AstNode[], WithHandler[] | undefined]>

const docs: CustomDocs = {
  category: 'special-expression',
  customVariants: ['do body end', 'do body with case @name then handler end'],
  details: [
    ['body', 'expressions', 'The expressions to evaluate.'],
    ['@name', 'expression', 'An expression evaluating to an effect value.'],
    ['handler', 'expression', 'A function (args) -> result that handles the effect. Its return value resumes the perform call.'],
  ],
  description: 'Evaluates `body`. Resulting value is the value of the last expression. '
    + 'Effect handlers can be installed via `with` to intercept `perform` calls.',
  examples: [
    `
do
  let a = 1 + 2 + 3 + 4;
  let b = -> $ * ( $ + 1 );
  b(a)
end`,
    `
do
  perform(@dvala.io.println, "hello")
with
  case @dvala.io.println then ([msg]) -> null
end`,
  ],
}

export const doSpecialExpression: BuiltinSpecialExpression<Any, DoNode> = {
  arity: {},
  docs,
  getUndefinedSymbols: (node, contextStack, { getUndefinedSymbols, builtin }) => {
    const bodyResult = getUndefinedSymbols(node[1][1], contextStack.create({}), builtin)
    const withHandlers = node[1][2]
    if (!withHandlers || withHandlers.length === 0) {
      return bodyResult
    }
    let withResult = new Set<string>()
    for (const [effectExpr, handlerFn] of withHandlers) {
      const effectResult = getUndefinedSymbols([effectExpr], contextStack, builtin)
      const handlerResult = getUndefinedSymbols([handlerFn], contextStack, builtin)
      withResult = joinSets(withResult, effectResult, handlerResult)
    }
    return joinSets(bodyResult, withResult)
  },
}
