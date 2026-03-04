import type { Any } from '../../interface'
import type { AstNode, SpecialExpressionNode } from '../../parser/types'
import type { BuiltinSpecialExpression, CustomDocs } from '../interface'
import type { specialExpressionTypes } from '../specialExpressionTypes'

export type CondNode = SpecialExpressionNode<[typeof specialExpressionTypes['cond'], [AstNode, AstNode][]]>

const docs: CustomDocs = {
  category: 'special-expression',
  customVariants: ['cond cond-branch cond-branch ... end'],
  details: [
    ['cond-branch', 'case test then body', 'A branch of the cond expression.'],
    ['test', 'expression', 'The condition to test.'],
    ['body', 'expressions', 'The expressions to evaluate if the test is truthy.'],
  ],
  description: 'Used for branching. `cond-branches` are tested sequentially from the top. If no branch is tested truthy, `null` is returned.',
  examples: [
    `
cond
  case false then "FALSE"
  case true then "TRUE"
end`,
    `
cond
  case false then "FALSE"
  case null then "null"
end ?? "TRUE"`,
    `
cond
  case false then "FALSE"
  case null then "null"
end ?? "TRUE"`,
  ],
}

export const condSpecialExpression: BuiltinSpecialExpression<Any, CondNode> = {
  arity: {},
  docs,
  getUndefinedSymbols: (node, contextStack, { getUndefinedSymbols, builtin, evaluateNode }) => getUndefinedSymbols(node[1][1].flat(), contextStack, builtin, evaluateNode),
}
