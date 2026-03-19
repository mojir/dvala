import type { Any } from '../../interface'
import type { AstNode, SpecialExpressionNode } from '../../parser/types'
import { joinSets } from '../../utils'
import type { BuiltinSpecialExpression, CustomDocs } from '../interface'
import type { specialExpressionTypes } from '../specialExpressionTypes'

export type PerformNode = SpecialExpressionNode<[typeof specialExpressionTypes['perform'], AstNode, AstNode[]]>

const docs: CustomDocs = {
  category: 'special-expression',
  customVariants: [
    'perform(eff)',
    'perform(eff, arg1)',
    'perform(eff, arg1, arg2, ...)',
  ],
  details: [
    ['eff', 'expression', 'An expression evaluating to an effect value (from `@name`).'],
    ['arg1, arg2, ...', 'expressions', 'Arguments passed to the effect handler.'],
  ],
  description: 'Invokes an effect. The nearest enclosing `do/with` handler matching the effect '
    + 'intercepts the call. The handler receives the arguments as an array and its return value '
    + 'becomes the result of `perform`. If no local handler matches, the effect is dispatched '
    + 'to the host.',
  examples: [
    `
do
  perform(@dvala.io.println, "hello")
with
  case @dvala.io.println then ([msg]) -> msg
end
`,
  ],
  seeAlso: ['effect?'],
}

export const performSpecialExpression: BuiltinSpecialExpression<Any, PerformNode> = {
  arity: { min: 1 },
  docs,
  getUndefinedSymbols: (node, contextStack, { getUndefinedSymbols, builtin }) => {
    const [, effectExpr, argExprs] = node[1]
    const effectResult = getUndefinedSymbols([effectExpr], contextStack, builtin)
    const argsResult = getUndefinedSymbols(argExprs, contextStack, builtin)
    return joinSets(effectResult, argsResult)
  },
}
