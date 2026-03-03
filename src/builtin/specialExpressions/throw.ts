import { UserDefinedError } from '../../errors'
import type { AstNode, SpecialExpressionNode } from '../../parser/types'
import { asString } from '../../typeGuards/string'
import { toFixedArity } from '../../utils/arity'
import type { BuiltinSpecialExpression, FunctionDocs } from '../interface'
import type { specialExpressionTypes } from '../specialExpressionTypes'

export type ThrowNode = SpecialExpressionNode<[typeof specialExpressionTypes['throw'], AstNode]>

const docs: FunctionDocs = {
  category: 'special-expression',
  returns: {
    type: 'never',
  },
  args: {
    expr: {
      type: 'any',
    },
  },
  variants: [
    { argumentNames: ['expr'] },
  ],
  description: 'Throws `UserDefinedError` with message set to $expr evaluated. $expr must evaluate to a string.',
  examples: [
    'do throw("You shall not pass!") with case effect(dvala.error) then ([msg]) -> "Error: " ++ msg end',
    'do throw(slice("You shall not pass!", 0, 3)) with case effect(dvala.error) then ([msg]) -> "Error: " ++ msg end',
  ],
}

export const throwSpecialExpression: BuiltinSpecialExpression<null, ThrowNode> = {
  arity: toFixedArity(1),
  docs,
  evaluateAsNormalExpression: (params, sourceCodeInfo) => {
    const message = asString(params[0], sourceCodeInfo, {
      nonEmpty: true,
    })
    throw new UserDefinedError(message, undefined)
  },
  getUndefinedSymbols: (node, contextStack, { getUndefinedSymbols, builtin, evaluateNode }) => getUndefinedSymbols([node[1][1]], contextStack, builtin, evaluateNode),
}
