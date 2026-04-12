import type { Arr } from '../../interface'
import type { AstNode } from '../../parser/types'
import type { NodeTypes } from '../../constants/constants'
import type { BuiltinSpecialExpression, CustomDocs } from '../interface'

export type SettledNode = [typeof NodeTypes.Settled, AstNode, number]

const docs: CustomDocs = {
  category: 'special-expression',
  customVariants: [
    'settled(fns)',
  ],
  details: [
    ['fns', 'array', 'Array of zero-argument functions to evaluate concurrently. Each result is wrapped as `[:ok, value]` on success or `[:error, errorPayload]` on error.'],
  ],
  description: 'Evaluates all branch functions concurrently and returns an array of tagged results in order. '
    + 'Each result is `[:ok, value]` if the branch succeeded or `[:error, errorPayload]` if it raised an error. '
    + 'Never throws — all errors are captured as results. If any branch suspends, '
    + 'the entire `settled` suspends with a composite blob. '
    + 'Outer handlers do not reach branches by default. With `with propagate handler;`, a propagated error handler catches errors before `settled` sees them — use deliberately. '
    + 'Only available in async mode (`run()`). Requires at least one branch.',
  examples: [
    { code: 'settled([-> perform(@host.fetch, url1), -> perform(@host.fetch, url2)])', noRun: true },
  ],
}

export const settledSpecialExpression: BuiltinSpecialExpression<Arr, SettledNode> = {
  arity: { min: 1, max: 1 },
  docs,
}
