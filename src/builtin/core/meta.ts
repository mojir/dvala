import type { EffectReference, FunctionReference } from '../../../reference'
import { assertNonUndefined } from '../../typeGuards'
import { assertFunctionLike, isEffect } from '../../typeGuards/dvala'
import { isDvalaFunction } from '../../typeGuards/dvalaFunction'
import { assertString } from '../../typeGuards/string'
import { toFixedArity } from '../../utils/arity'
import { generateDocString } from '../../utils/docString/generateDocString'
import type { Any } from '../../interface'
import type { Arity, BuiltinNormalExpressions } from '../interface'
import { FUNCTION_SYMBOL } from '../../utils/symbols'

export function getMetaNormalExpression(
  normalExpressionReference: Record<string, FunctionReference>,
  effectReference: Record<string, EffectReference>,
): BuiltinNormalExpressions {
  return {
    'doc': {
      evaluate: ([value], sourceCodeInfo): string => {
        assertNonUndefined(normalExpressionReference)

        // Handle effects
        if (isEffect(value)) {
          const key = `-effect-${value.name}`
          const ref = effectReference[key]
          return ref ? generateDocString(ref) : ''
        }

        // Handle functions
        assertFunctionLike(value, sourceCodeInfo)
        if (!isDvalaFunction(value)) {
          return ''
        }
        if (value.functionType === 'Builtin') {
          const reference = normalExpressionReference[value.name]
          return reference ? generateDocString(reference) : ''
        }
        if (value.functionType === 'UserDefined') {
          return value.docString
        }
        return ''
      },
      arity: toFixedArity(1),
      docs: {
        category: 'meta',
        returns: { type: 'string' },
        args: { value: { type: ['function', 'effect'] } },
        variants: [{ argumentNames: ['value'] }],
        description: 'Returns documentation string of the $value. Works on functions and effects.',
        seeAlso: ['arity', 'with-doc'],
        examples: [
          'doc(+)',
          'doc(@dvala.io.println)',
          'let add = (x, y) -> x + y with-doc "Adds two numbers.";\ndoc(add)',
        ],
      },
    },
    'with-doc': {
      evaluate: ([fn, docString], sourceCodeInfo): Any => {
        assertFunctionLike(fn, sourceCodeInfo)
        assertString(docString, sourceCodeInfo)
        if (!isDvalaFunction(fn) || fn.functionType !== 'UserDefined') {
          throw new Error('with-doc can only be used with user-defined functions')
        }
        return {
          ...fn,
          [FUNCTION_SYMBOL]: true,
          docString,
        }
      },
      arity: toFixedArity(2),
      docs: {
        category: 'meta',
        returns: { type: 'function' },
        args: {
          a: { type: 'function' },
          b: { type: 'string' },
        },
        variants: [{ argumentNames: ['a', 'b'] }],
        description: 'Returns a new function with the documentation string $b attached. The original function is not modified.',
        seeAlso: ['doc'],
        examples: [
          '((x, y) -> x + y) with-doc "Adds two numbers."',
          'let add = (x, y) -> x + y;\nadd with-doc "Adds x and y."',
        ],
      },
    },
    'arity': {
      evaluate: ([value], sourceCodeInfo): Arity | Any => {
        // Handle effects
        if (isEffect(value)) {
          const key = `-effect-${value.name}`
          const ref = effectReference[key]
          if (!ref)
            return {}
          // Derive arity from variants
          const argCounts = ref.variants.map(v => v.argumentNames.length)
          const min = Math.min(...argCounts)
          const max = Math.max(...argCounts)
          return { min, max }
        }

        // Handle functions
        assertFunctionLike(value, sourceCodeInfo)
        return isDvalaFunction(value) ? value.arity : toFixedArity(1)
      },
      arity: toFixedArity(1),
      docs: {
        category: 'meta',
        returns: { type: 'object' },
        args: { value: { type: ['function', 'effect'] } },
        variants: [{ argumentNames: ['value'] }],
        description: 'Returns arity of the $value. The arity is an object with the properties: `min` and `max`. If the function has fixed arity, `min` and `max` are equal to the number of required parameters. If no restrictions apply, empty object is returned. Also works on effects.',
        seeAlso: ['doc'],
        examples: [
          'arity(+)',
          'arity(defined?)',
          'arity(@dvala.random.int)',
          `
let add = (x, y = 0) -> do
  x + y;
end;

arity(add)`,
          `
let foo = (k, ...x) -> do
  k + x;
end;
  arity(foo)`,
        ],
      },
    },
  }
}
