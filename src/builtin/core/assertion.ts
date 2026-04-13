import type { Any } from '../../interface'
import { AssertionError } from '../../errors'
import { asAny } from '../../typeGuards/dvala'
import { assertString } from '../../typeGuards/string'
import type { BuiltinNormalExpressions } from '../interface'

export const assertionNormalExpression: BuiltinNormalExpressions = {
  assert: {
    evaluate: (params, sourceCodeInfo): Any => {
      const value = params.get(0)
      const message = params.size === 2 ? params.get(1) : `${value}`
      assertString(message, sourceCodeInfo)
      if (!value)
        throw new AssertionError(message, sourceCodeInfo)

      return asAny(value, sourceCodeInfo)
    },
    arity: { min: 1, max: 2 },
    docs: {
      type: '((Unknown) -> Unknown) & ((Unknown, String) -> Unknown)',
      category: 'assertion',
      description: 'If `value` is falsy it throws `AssertionError` with `message`. If no `message` is provided, message is set to `value`.',
      returns: {
        type: 'any',
      },
      args: {
        value: {
          type: 'any',
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
        'do with handler @dvala.error(arg) -> resume(arg) end; assert(0, "Expected a positive value") end',
      ],
      seeAlso: ['assertion.assertTruthy', 'assertion.assertTrue'],
      hideOperatorForm: true,
    },
  },
}
