import type { Any } from '../../interface'
import type { AstNode, SpecialExpressionNode } from '../../parser/types'
import type { BuiltinSpecialExpression, CustomDocs } from '../interface'
import type { specialExpressionTypes } from '../specialExpressionTypes'

export type DoNode = SpecialExpressionNode<[typeof specialExpressionTypes['block'], AstNode[], undefined]>

const docs: CustomDocs = {
  category: 'special-expression',
  customVariants: ['do body end', 'handle body with [handler-fn] end'],
  details: [
    ['body', 'expressions', 'The expressions to evaluate.'],
  ],
  description: 'Evaluates `body`. Resulting value is the value of the last expression. '
    + 'Use `handle...with...end` to install effect handlers that intercept `perform` calls.',
  examples: [
    `
do
  let a = 1 + 2 + 3 + 4;
  let b = -> $ * ( $ + 1 );
  b(a)
end`,
    `
handle
  perform(@dvala.io.println, "hello")
with [(arg, eff, nxt) -> if eff == @dvala.io.println then null else nxt(eff, arg) end]
end`,
  ],
}

export const doSpecialExpression: BuiltinSpecialExpression<Any, DoNode> = {
  arity: {},
  docs,
  getUndefinedSymbols: (node, contextStack, { getUndefinedSymbols, builtin }) => {
    return getUndefinedSymbols(node[1][1], contextStack.create({}), builtin)
  },
}
