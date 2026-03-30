import type { Any, Arr } from '../../interface'
import type { NodeTypes } from '../../constants/constants'
import type { AstNode } from '../../parser/types'
import { asAny } from '../../typeGuards/dvala'
import { PersistentVector } from '../../utils/persistent'
import type { BuiltinSpecialExpression, FunctionDocs } from '../interface'

export type ArrayNode = [typeof NodeTypes.Array, AstNode[], number]

const docs: FunctionDocs = {
  category: 'special-expression',
  returns: {
    type: 'any',
    array: true,
  },
  args: {
    values: {
      type: 'any',
      rest: true,
    },
  },
  variants: [
    { argumentNames: ['values'] },
  ],
  description: 'Makes new array from `values`.',
  examples: [
    'array(1, 2, 3)',
    'array(array(null, false, true))',
    '[]',
    '[1, 2, 3]',
    '[1, 2, ...[3, 4, 5], 6]',
    '[[null, false, true]]',
    '[1, 2, 3][1]',
  ],
  hideOperatorForm: true,
}

export const arraySpecialExpression: BuiltinSpecialExpression<Any, ArrayNode> = {
  arity: {},
  docs,
  evaluateAsNormalExpression: (params, sourceCodeInfo) => {
    let result: Arr = PersistentVector.empty()

    for (const param of params) {
      result = result.append(asAny(param, sourceCodeInfo))
    }

    return result
  },

}
