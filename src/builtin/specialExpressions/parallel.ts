import type { Arr } from '../../interface'
import type { AstNode } from '../../parser/types'
import type { NodeTypes } from '../../constants/constants'
import type { BuiltinSpecialExpression, CustomDocs } from '../interface'

export type ParallelNode = [typeof NodeTypes.Parallel, AstNode, number]

const docs: CustomDocs = {
  category: 'special-expression',
  customVariants: [
    'parallel(fns)',
  ],
  details: [
    ['fns', 'array', 'Array of zero-argument functions to evaluate concurrently. Typically `[-> perform(...), -> perform(...)]`.'],
  ],
  description: 'Evaluates all branch functions concurrently and returns an array of results in order. '
    + 'Each branch runs as an independent trampoline invocation. If any branch errors, throws the first error (fail-fast). '
    + 'If any branch suspends, the entire `parallel` suspends with a composite blob. '
    + 'Only available in async mode (`run()`). Requires at least one branch.',
  examples: [
    { code: 'parallel([-> 1 + 2, -> 3 + 4])', noRun: true },
  ],
}

export const parallelSpecialExpression: BuiltinSpecialExpression<Arr, ParallelNode> = {
  arity: { min: 1, max: 1 },
  docs,
}
