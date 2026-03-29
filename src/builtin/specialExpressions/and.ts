import type { Any } from '../../interface'
import type { AstNode } from '../../parser/types'
import type { NodeTypes } from '../../constants/constants'
import { asAny } from '../../typeGuards/dvala'
import type { BuiltinSpecialExpression, FunctionDocs } from '../interface'

export type AndNode = [typeof NodeTypes.And, AstNode[], number]

const docs: FunctionDocs = {
  category: 'special-expression',
  returns: {
    type: 'any',
  },
  args: {
    a: { type: 'any' },
    b: { type: 'any' },
    c: {
      type: 'any',
      rest: true,
    },
  },
  variants: [
    { argumentNames: ['a', 'b'] },
    { argumentNames: ['a', 'b', 'c'] },
  ],
  description: `
Computes logical \`and\`. Evaluation of expressions starts from left.
As soon as an \`expression\` evaluates to a falsy value, the result is returned.

If all expressions evaluate to truthy values, the value of the last expression is returned.`,
  examples: [
    'true && 1',
    '&&(1, 1)',
    '&&(3 > 2, "string")',
    '&&(3 < 2, "string")',
    '&&(true, true, true, true)',
    '&&(true, true, 0, true)',
  ],
}

export const andSpecialExpression: BuiltinSpecialExpression<Any, AndNode> = {
  arity: {},
  docs,
  evaluateAsNormalExpression: (params, sourceCodeInfo) => {
    let value: Any = true
    for (const param of params) {
      value = asAny(param, sourceCodeInfo)
      if (!value)
        break
    }
    return value
  },

}
