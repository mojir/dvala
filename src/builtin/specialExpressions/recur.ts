import { RecurSignal } from '../../errors'
import type { AstNode, SpecialExpressionNode } from '../../parser/types'
import type { BuiltinSpecialExpression, CustomDocs } from '../interface'
import type { specialExpressionTypes } from '../specialExpressionTypes'

export type RecurNode = SpecialExpressionNode<[typeof specialExpressionTypes['recur'], AstNode[]]>

const docs: CustomDocs = {
  category: 'special-expression',
  customVariants: ['recur(...recur-args)'],
  description: 'Recursevly calls enclosing function or loop with its evaluated `recur-args`.',
  examples: [
    `
let foo = (n) -> do
  if isZero(n) then
    0
  else
    n + recur(n - 1)
  end
end;
foo(3)`,
    `
((n) -> do
  if isZero(n) then
    0
  else
    n + recur(n - 1)
  end
end)(3)`,
    `
loop (n = 3, acc = 0) -> do
  if isZero(n) then
    acc
  else
    recur(n - 1, acc + n)
  end
end`,
  ],
}

export const recurSpecialExpression: BuiltinSpecialExpression<null, RecurNode> = {
  arity: {},
  docs,
  evaluateAsNormalExpression: params => {
    throw new RecurSignal(params)
  },
  getUndefinedSymbols: (node, contextStack, { getUndefinedSymbols, builtin }) =>
    getUndefinedSymbols(node[1][1], contextStack, builtin),
}
