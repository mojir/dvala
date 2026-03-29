import type { Any } from '../../interface'
import type { AstNode, BindingTarget } from '../../parser/types'
import type { NodeTypes } from '../../constants/constants'
import { toFixedArity } from '../../utils/arity'
import type { BuiltinSpecialExpression, CustomDocs } from '../interface'

export type LetNode = [typeof NodeTypes.Let, [BindingTarget, AstNode], number]

const docs: CustomDocs = {
  category: 'special-expression',
  customVariants: ['let s = value;'],
  details: [
    ['s', 'symbol', 'The name of the variable to bind.'],
    ['value', 'any', 'The value to bind to the variable.'],
  ],
  description: `
  Binds local variables s to \`value\`. \`value\` can be any expression. The scope of the variables is the body of the let expression.`,
  examples: [`
let a = 1 + 2 + 3 + 4;
let b = -> $ * ( $ + 1 );
b(a)`],
}

export const letSpecialExpression: BuiltinSpecialExpression<Any, LetNode> = {
  arity: toFixedArity(0),
  docs,
}
