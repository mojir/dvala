import { RecurSignal } from '../../errors'
import type { AstNode } from '../../parser/types'
import type { NodeTypes } from '../../constants/constants'
import type { BuiltinSpecialExpression, CustomDocs } from '../interface'

export type RecurNode = [typeof NodeTypes.Recur, AstNode[], number]

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
    getUndefinedSymbols(node[1] as AstNode[], contextStack, builtin),
}
