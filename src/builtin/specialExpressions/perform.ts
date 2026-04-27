import type { Any } from '../../interface'
import type { AstNode } from '../../parser/types'
import type { NodeTypes } from '../../constants/constants'
import type { BuiltinSpecialExpression, CustomDocs } from '../interface'

export type PerformNode = [typeof NodeTypes.Perform, [AstNode, AstNode | undefined], number]

const docs: CustomDocs = {
  category: 'special-expression',
  customVariants: ['perform(eff)', 'perform(eff, payload)'],
  details: [
    ['eff', 'expression', 'An expression evaluating to an effect value (from `@name`).'],
    [
      'payload',
      'expression',
      'Optional single payload value passed to the effect handler. Defaults to `null` if omitted.',
    ],
  ],
  description:
    'Invokes an effect. The nearest enclosing `with handler` matching the effect ' +
    'intercepts the call. The handler clause receives the payload via its parameter ' +
    'and can `resume(value)` to continue the body or return a value to abort. ' +
    'If no local handler matches, the effect is dispatched to the host.',
  examples: [
    `
do
  with handler @dvala.io.print(arg) -> resume(arg) end;
  perform(@dvala.io.print, "hello")
end
`,
  ],
  seeAlso: ['isEffect', 'raise'],
}

export const performSpecialExpression: BuiltinSpecialExpression<Any, PerformNode> = {
  arity: { min: 1, max: 2 },
  docs,
}
