import type { Any } from '../../interface'
import type { AstNode } from '../../parser/types'
import type { NodeTypes } from '../../constants/constants'
import { asAny } from '../../typeGuards/dvala'
import type { BuiltinSpecialExpression, FunctionDocs } from '../interface'

export type AndNode = [typeof NodeTypes.And, AstNode[], number]

const docs: FunctionDocs = {
  category: 'special-expression',
  returns: {
    type: 'boolean',
  },
  args: {
    a: { type: 'boolean' },
    b: { type: 'boolean' },
    c: {
      type: 'boolean',
      rest: true,
    },
  },
  variants: [
    { argumentNames: ['a', 'b'] },
    { argumentNames: ['a', 'b', 'c'] },
  ],
  description: `
Computes logical \`and\`. Evaluation starts from left. As soon as an
operand evaluates to \`false\`, the result is \`false\`; otherwise the
result is the value of the last operand. Under strict Boolean, every
operand must be \`Boolean\`.`,
  seeAlso: ['||', '!'],
  examples: [
    'true && false',
    '&&(true, true)',
    '&&(3 > 2, 4 > 2)',
    '&&(3 < 2, 4 < 2)',
    '&&(true, true, true, true)',
    '&&(true, true, false, true)',
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
