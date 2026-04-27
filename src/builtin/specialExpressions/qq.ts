import type { Any } from '../../interface'
import type { AstNode } from '../../parser/types'
import type { NodeTypes } from '../../constants/constants'
import { asAny } from '../../typeGuards/dvala'
import type { BuiltinSpecialExpression, FunctionDocs } from '../interface'

export type QqNode = [typeof NodeTypes.Qq, AstNode[], number]

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
  variants: [{ argumentNames: ['a'] }, { argumentNames: ['a', 'b'] }, { argumentNames: ['a', 'b', 'c'] }],
  description: `Nullish coalescing operator. Returns the first non-\`null\` value.

Evaluation is short-circuited — as soon as a non-\`null\` value is found, the remaining expressions are not evaluated.

If all values are \`null\`, returns \`null\`.`,
  examples: [
    '1 ?? 2',
    'null ?? 2',
    '??(null)',
    '??(null, "default")',
    '??(1, "default")',
    'false ?? "default"',
    '??(null, null, 3)',
  ],
}

export const qqSpecialExpression: BuiltinSpecialExpression<Any, QqNode> = {
  arity: { min: 1 },
  docs,
  evaluateAsNormalExpression: (params, sourceCodeInfo) => {
    for (const param of params) {
      const value = asAny(param, sourceCodeInfo)
      if (value !== null) {
        return value
      }
    }
    return null
  },
}
