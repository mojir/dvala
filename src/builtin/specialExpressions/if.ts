import type { Any } from '../../interface'
import type { AstNode } from '../../parser/types'
import type { NodeTypes } from '../../constants/constants'
import type { BuiltinSpecialExpression, CustomDocs } from '../interface'

export type IfNode = [typeof NodeTypes.If, [AstNode, AstNode, AstNode?], number]

const docs: CustomDocs = {
  category: 'special-expression',
  customVariants: ['if test then true-expr else false-expr', 'if test then true-expr'],
  details: [
    ['test', 'expression', 'The condition to test.'],
    ['true-expr', 'expression', 'The expression to evaluate if the test is truthy.'],
    ['false-expr', 'expression', 'The expression to evaluate if the test is falsy.'],
  ],
  description: 'Either `true-expr` or `false-expr` branch is taken. `true-expr` is selected when `test` is truthy. If `test` is falsy `false-expr` is executed, if no `false-expr` exists, `null` is returned.',
  examples: [
    `
if true then
  "TRUE"
else
  "FALSE"
end`,
    'if false then "TRUE" else "FALSE" end',
    'if true then "TRUE" end',
    'if false then "TRUE" end',
  ],
}

export const ifSpecialExpression: BuiltinSpecialExpression<Any, IfNode> = {
  arity: { min: 2, max: 3 },
  docs,
  getUndefinedSymbols: (node, contextStack, { getUndefinedSymbols, builtin }) =>
    getUndefinedSymbols((node[1] as AstNode[]).filter(n => !!n), contextStack, builtin),
}
