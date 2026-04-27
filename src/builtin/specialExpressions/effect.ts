import type { EffectRef } from '../../parser/types'
import type { NodeTypes } from '../../constants/constants'
import type { BuiltinSpecialExpression, CustomDocs } from '../interface'

export type EffectNode = [typeof NodeTypes.Effect, string, number]

const docs: CustomDocs = {
  category: 'special-expression',
  customVariants: ['@name'],
  details: [['name', 'dotted identifier', 'The effect name, e.g. `llm.complete` or `dvala.io.print`.']],
  description:
    'Returns the unique effect reference for the given name. ' +
    'Calling `effect` with the same name always returns the same reference. ' +
    'Effect references are first-class values that can be stored, passed, and compared with `==`.',
  examples: ['@dvala.io.print', '==(@llm.complete, @llm.complete)'],
  seeAlso: ['isEffect'],
}

export const effectSpecialExpression: BuiltinSpecialExpression<EffectRef, EffectNode> = {
  arity: {},
  docs,
}
