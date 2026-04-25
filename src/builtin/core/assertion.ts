import { AssertionError } from '../../errors'
import { assertString } from '../../typeGuards/string'
import type { BuiltinNormalExpressions } from '../interface'

export const assertionNormalExpression: BuiltinNormalExpressions = {
  assert: {
    evaluate: (params, sourceCodeInfo): boolean => {
      const value = params.get(0)
      const message = params.size === 2 ? params.get(1) : `${value}`
      assertString(message, sourceCodeInfo)
      if (!value)
        throw new AssertionError(message, sourceCodeInfo)

      return true
    },
    arity: { min: 1, max: 2 },
    docs: {
      type: '((Boolean) -> Boolean) & ((Boolean, String) -> Boolean)',
      category: 'assertion',
      description: 'If `value` is `false` it throws `AssertionError` with `message`. If no `message` is provided, the message is derived from the value. Under strict Boolean, the value must be `Boolean` — e.g. `assert(x != null, "x is null")` instead of `assert(x, "x is null")`.',
      returns: {
        type: 'boolean',
      },
      args: {
        value: {
          type: 'boolean',
        },
        message: {
          type: 'string',
        },
      },
      variants: [
        {
          argumentNames: [
            'value',
          ],
        },
        {
          argumentNames: [
            'value',
            'message',
          ],
        },
      ],
      examples: [
        'do with handler @dvala.error(arg) -> resume(arg) end; assert(false, "Expected a positive value") end',
      ],
      seeAlso: ['assertion.assertTruthy', 'assertion.assertTrue'],
      hideOperatorForm: true,
      // Phase 2.5c — the value at index 0 is the predicate; calling
      // `assert(P)` with a fragment-eligible single-symbol P narrows
      // the referenced variable in subsequent statements. See
      // `extractAssertNarrowings` in src/typechecker/infer.ts.
      asserts: { paramIndex: 0 },
    },
  },
}
