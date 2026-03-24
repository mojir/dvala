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
  Computes logical \`or\`. Evaluation of expressions evaluation starts from left.
  As soon as a \`expression\` evaluates to a truthy value, the result is returned.

  If all expressions evaluate to falsy values, the value of the last expression is returned.`,
  examples: [
    'false || 1',
    '||(1, 1)',
    '||(3 > 2, "string")',
    '||(3 < 2, "string")',
    '||(false, false, false, true)',
    '||(1, 2, 3, 4)',
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
      if (value)
        break
    }
    return value
  },
  getUndefinedSymbols: (node, contextStack, { getUndefinedSymbols, builtin }) => getUndefinedSymbols(node[1], contextStack, builtin),
}
