import type { Any } from '../../interface'
import type { AstNode, SpecialExpressionNode } from '../../parser/types'
import { joinSets } from '../../utils'
import type { BuiltinSpecialExpression, CustomDocs } from '../interface'
import type { specialExpressionTypes } from '../specialExpressionTypes'

export type PerformNode = SpecialExpressionNode<[typeof specialExpressionTypes['perform'], AstNode, AstNode | undefined]>

const docs: CustomDocs = {
  category: 'special-expression',
  customVariants: [
    'perform(eff)',
    'perform(eff, payload)',
  ],
  details: [
    ['eff', 'expression', 'An expression evaluating to an effect value (from `@name`).'],
    ['payload', 'expression', 'Optional single payload value passed to the effect handler. Defaults to `null` if omitted.'],
  ],
  description: 'Invokes an effect. The nearest enclosing `handle/with` handler matching the effect '
    + 'intercepts the call. The handler receives the payload and its return value '
    + 'becomes the result of `perform`. If no local handler matches, the effect is dispatched '
    + 'to the host.',
  examples: [
    `
handle
  perform(@dvala.io.println, "hello")
with [(arg, eff, nxt) -> if eff == @dvala.io.println then arg else nxt(eff, arg) end]
end
`,
  ],
  seeAlso: ['effect?', 'handle'],
}

export const performSpecialExpression: BuiltinSpecialExpression<Any, PerformNode> = {
  arity: { min: 1, max: 2 },
  docs,
  getUndefinedSymbols: (node, contextStack, { getUndefinedSymbols, builtin }) => {
    const [, effectExpr, payloadExpr] = node[1]
    const effectResult = getUndefinedSymbols([effectExpr], contextStack, builtin)
    const payloadResult = payloadExpr ? getUndefinedSymbols([payloadExpr], contextStack, builtin) : new Set<string>()
    return joinSets(effectResult, payloadResult)
  },
}
