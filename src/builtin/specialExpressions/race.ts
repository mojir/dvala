import type { Any } from '../../interface'
import type { AstNode } from '../../parser/types'
import type { NodeTypes } from '../../constants/constants'
import type { BuiltinSpecialExpression, CustomDocs } from '../interface'

export type RaceNode = [typeof NodeTypes.Race, AstNode, number]

const docs: CustomDocs = {
  category: 'special-expression',
  customVariants: [
    'race(fns)',
  ],
  details: [
    ['fns', 'array', 'Array of zero-argument functions to race concurrently. Typically `[-> perform(...), -> perform(...)]`.'],
  ],
  description: 'Races all branch functions concurrently. The first branch to complete wins — '
    + 'its value becomes the result. Losing branches are cancelled via AbortSignal. '
    + 'Errored branches are silently dropped. If all branches error, throws an aggregate error. '
    + 'If no branch completes but some suspend, the race suspends. '
    + 'Only available in async mode (`run()`). Requires at least one branch.',
  examples: [
    { code: 'race([-> perform(@a.get), -> perform(@b.get)])', noRun: true },
  ],
}

export const raceSpecialExpression: BuiltinSpecialExpression<Any, RaceNode> = {
  arity: { min: 1, max: 1 },
  docs,
}
