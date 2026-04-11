import type { Arr } from '../../interface'
import type { AstNode } from '../../parser/types'
import type { NodeTypes } from '../../constants/constants'
import type { BuiltinSpecialExpression, CustomDocs } from '../interface'

export type SettledNode = [typeof NodeTypes.Settled, AstNode[], number]

const docs: CustomDocs = {
  category: 'special-expression',
  customVariants: [
    'settled(expr1, expr2, ...)',
  ],
  details: [
    ['expr1, expr2, ...', 'expressions', 'Expressions to evaluate concurrently. Each result is wrapped as `[:ok, value]` on success or `[:error, errorPayload]` on error.'],
  ],
  description: 'Evaluates all branch expressions concurrently and returns an array of tagged results in order. '
    + 'Each result is `[:ok, value]` if the branch succeeded or `[:error, errorPayload]` if it raised an error. '
    + 'Never throws — all errors are captured as results. If any branch suspends, '
    + 'the entire `settled` suspends with a composite blob. On resume, branches are resumed '
    + 'one at a time. Only available in async mode (`run()`). Requires at least one branch.',
  examples: [
    { code: 'settled(perform(@host.fetch, url1), perform(@host.fetch, url2))', noRun: true },
  ],
}

export const settledSpecialExpression: BuiltinSpecialExpression<Arr, SettledNode> = {
  arity: { min: 1 },
  docs,
}
