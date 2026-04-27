import type { Any } from '../../interface'
import type { AstNode } from '../../parser/types'
import type { NodeTypes } from '../../constants/constants'
import type { BuiltinSpecialExpression, CustomDocs } from '../interface'

export type DoNode = [typeof NodeTypes.Block, AstNode[], number]

const docs: CustomDocs = {
  category: 'special-expression',
  customVariants: ['do body end', 'do with handler; body end'],
  details: [
    ['body', 'expressions', 'The expressions to evaluate.'],
  ],
  description: 'Evaluates `body`. Resulting value is the value of the last expression. '
    + 'Use `with handler...end;` inside a `do` block to install effect handlers that intercept `perform` calls.',
  examples: [
    `
do
  let a = 1 + 2 + 3 + 4;
  let b = -> $ * ( $ + 1 );
  b(a)
end`,
    `
do
  with handler @dvala.io.print(arg) -> resume(null) end;
  perform(@dvala.io.print, "hello")
end`,
  ],
}

export const doSpecialExpression: BuiltinSpecialExpression<Any, DoNode> = {
  arity: {},
  docs,
  getUndefinedSymbols: (node, contextStack, { getUndefinedSymbols, builtin }) => {
    return getUndefinedSymbols(node[1], contextStack.create({}), builtin)
  },
}
