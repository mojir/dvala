import type { Arr } from '../../interface'
import type { AstNode } from '../../parser/types'
import type { NodeTypes } from '../../constants/constants'
import type { BuiltinSpecialExpression, CustomDocs } from '../interface'

export type ParallelNode = [typeof NodeTypes.Parallel, AstNode[], number]

const docs: CustomDocs = {
  category: 'special-expression',
  customVariants: [
    'parallel(expr1, expr2, ...)',
  ],
  details: [
    ['expr1, expr2, ...', 'expressions', 'Expressions to evaluate concurrently. Typically `perform(...)` calls.'],
  ],
  description: 'Evaluates all branch expressions concurrently and returns an array of results in order. '
    + 'Each branch runs as an independent trampoline invocation. If any branch suspends, '
    + 'the entire `parallel` suspends with a composite blob. On resume, branches are resumed '
    + 'one at a time. Only available in async mode (`run()`). Requires at least one branch.',
  examples: [],
}

export const parallelSpecialExpression: BuiltinSpecialExpression<Arr, ParallelNode> = {
  arity: { min: 1 },
  docs,
  // Dead code — parser converts parallel(...) to native ParallelNode before getUndefinedSymbols is called
  getUndefinedSymbols: () => new Set(),
}
