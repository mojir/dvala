import type { Any } from '../../interface'
import type { CompFunction, ConstantlyFunction, FunctionLike } from '../../parser/types'
import { toAny } from '../../utils'
import { getArityFromFunction, toFixedArity } from '../../utils/arity'
import { FUNCTION_SYMBOL } from '../../utils/symbols'
import type { BuiltinNormalExpressions } from '../interface'
import { assertFunctionLike } from '../../typeGuards/dvala'

export const functionalNormalExpression: BuiltinNormalExpressions = {
  '|>': {
    evaluate: (): never => {
      throw new Error('|> is implemented in Dvala')
    },
    arity: toFixedArity(2),
    docs: {
      type: '(A, (A) -> B) -> B',
      category: 'functional',
      returns: { type: 'any' },
      args: {
        a: { type: 'any' },
        b: { type: 'function' },
      },
      variants: [{ argumentNames: ['a', 'b'] }],
      description: 'Takes a value `a` and a function `b`, and returns the result of applying `b` to `a`.',
      seeAlso: ['apply', 'comp'],
      examples: [
        `
1 |> inc |> inc`,
        {
          code: `range(10)
  |> map(_, -> $ ^ 2) // [0, 1, 4, 9, 16, 25, 36, 49, 64, 81]
  |> filter(_, isOdd)  // [1, 9, 25, 49, 81]
  |> reduce(_, +, 0)  // 165
  |> sqrt             // 12.84523257866513
  |> round(_, 2)`,
          noCheck: true,
        },
      ],
    },
  },
  apply: {
    evaluate: (): never => {
      throw new Error('apply is implemented in Dvala')
    },
    arity: { min: 2 },
    docs: {
      type: '(Function, Unknown[]) -> Unknown',
      category: 'functional',
      returns: { type: 'any' },
      args: {
        a: { type: 'function' },
        b: { type: 'array' },
        fun: { type: 'function' },
        args: { type: 'array' },
      },
      variants: [{ argumentNames: ['fun', 'args'] }],
      description: 'Call supplied function `fun` with specified arguments `args`.',
      seeAlso: ['|>'],
      examples: [
        `
apply(+, [1, 2, 3])`,
        `
apply(
  (x, y) -> sqrt(x ^ 2 + y ^ 2),
  [3, 4]
)`,
        {
          code: `
(x, y) -> sqrt(x ^ 2 + y ^ 2) apply [3, 4]`,
          noCheck: true,
        },
      ],
    },
  },

  identity: {
    evaluate: ([value]): Any => {
      return toAny(value)
    },
    arity: toFixedArity(1),
    docs: {
      type: '(A) -> A',
      category: 'functional',
      returns: { type: 'any' },
      args: { x: { type: 'any' } },
      variants: [{ argumentNames: ['x'] }],
      description: 'Returns `x`.',
      seeAlso: ['constantly', 'functional.fnull'],
      examples: ['identity(1)', 'identity("Albert")', 'identity({ a: 1 })', 'identity(null)'],
    },
  },

  comp: {
    evaluate: (params, sourceCodeInfo): CompFunction => {
      for (const param of params) assertFunctionLike(param, sourceCodeInfo)
      return {
        [FUNCTION_SYMBOL]: true,
        sourceCodeInfo,
        functionType: 'Comp',
        params,
        arity: params.size > 0 ? getArityFromFunction(params.get(params.size - 1) as FunctionLike) : { min: 1, max: 1 },
      }
    },
    arity: {},
    docs: {
      type: '((Unknown) -> Unknown, (Unknown) -> Unknown) -> (Unknown) -> Unknown',
      category: 'functional',
      returns: { type: 'function' },
      args: {
        a: { type: 'function' },
        b: { type: 'function' },
        fns: { type: 'function', rest: true },
      },
      variants: [{ argumentNames: ['fns'] }],
      description: `Takes a variable number of functions and returns a function that is the composition of those.

  The returned function takes a variable number of arguments,
  applies the rightmost function to the args,
  the next function (right-to-left) to the result, etc.`,
      seeAlso: ['|>', 'functional.juxt', 'functional.complement'],
      examples: [
        {
          code: `
let negativeQuotient = comp(-, /);
negativeQuotient(9, 3)`,
          noCheck: true,
        },
        {
          code: `
let x = { bar: { foo: 42 } };
comp("foo", "bar")(x)`,
          noCheck: true,
        },
      ],
    },
  },

  constantly: {
    evaluate: ([value], sourceCodeInfo): ConstantlyFunction => {
      return {
        [FUNCTION_SYMBOL]: true,
        sourceCodeInfo,
        functionType: 'Constantly',
        value: toAny(value),
        arity: {},
      }
    },
    arity: toFixedArity(1),
    docs: {
      type: '(A) -> (...Unknown[]) -> A',
      category: 'functional',
      returns: { type: 'function' },
      args: { x: { type: 'any' } },
      variants: [{ argumentNames: ['x'] }],
      description: 'Returns a function that takes any number of arguments and always returns `x`.',
      seeAlso: ['identity', 'functional.fnull'],
      examples: [
        {
          code: `
let alwaysTrue = constantly(true);
alwaysTrue(9, 3)`,
          noCheck: true,
        },
      ],
    },
  },
}
