import type { Any } from '../../interface'
import type { AstNode } from '../../parser/types'
import type { NodeTypes } from '../../constants/constants'
import { asAny } from '../../typeGuards/dvala'
import type { BuiltinSpecialExpression, FunctionDocs } from '../interface'

export type OrNode = [typeof NodeTypes.Or, AstNode[], number]

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
  variants: [{ argumentNames: ['a', 'b'] }, { argumentNames: ['a', 'b', 'c'] }],
  description: `
  Computes logical \`or\`. Evaluation starts from left. As soon as an
  operand evaluates to \`true\`, the result is \`true\`; otherwise the
  result is \`false\`. Every operand must be \`Boolean\`.`,
  seeAlso: ['&&', '!'],
  examples: [
    'false || true',
    '||(true, true)',
    '||(3 > 2, 4 > 2)',
    '||(3 < 2, 4 < 2)',
    '||(false, false, false, true)',
    '||(true, false, true, false)',
  ],
}

export const orSpecialExpression: BuiltinSpecialExpression<Any, OrNode> = {
  arity: {},
  docs,
  evaluateAsNormalExpression: (params, sourceCodeInfo) => {
    let value: Any = false
    for (const param of params) {
      value = asAny(param, sourceCodeInfo)
      // Defensive: or always has at least one param from the parser
      /* v8 ignore next 2 */
      if (value) break
    }
    return value
  },
}
