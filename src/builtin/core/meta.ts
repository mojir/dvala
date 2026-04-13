import type { EffectReference, FunctionReference } from '../../../reference'
import { assertNonUndefined } from '../../typeGuards'
import { assertFunctionLike, isEffect } from '../../typeGuards/dvala'
import { isDvalaFunction } from '../../typeGuards/dvalaFunction'
import { assertString } from '../../typeGuards/string'
import { toFixedArity } from '../../utils/arity'
import { generateDocString } from '../../utils/docString/generateDocString'
import type { Any } from '../../interface'
import { PersistentMap } from '../../utils/persistent'
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
        description: 'Returns documentation string of the `value`. Works on functions and effects.',
        seeAlso: ['arity', 'withDoc'],
        examples: [
          { code: 'doc(+)', noCheck: true },
          { code: 'doc(@dvala.io.print)', noCheck: true },
          { code: 'let add = (x, y) -> x + y withDoc "Adds two numbers.";\ndoc(add)', noCheck: true },
        ],
      },
    },
    'withDoc': {
      evaluate: ([fn, docString], sourceCodeInfo): Any => {
        assertFunctionLike(fn, sourceCodeInfo)
        assertString(docString, sourceCodeInfo)
        if (!isDvalaFunction(fn) || fn.functionType !== 'UserDefined') {
          throw new Error('withDoc can only be used with user-defined functions')
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
        description: 'Returns a new function with the documentation string `b` attached. The original function is not modified.',
        seeAlso: ['doc'],
        examples: [
          { code: '((x, y) -> x + y) withDoc "Adds two numbers."', noCheck: true },
          { code: 'let add = (x, y) -> x + y;\nadd withDoc "Adds x and y."', noCheck: true },
        ],
      },
    },
    'arity': {
      evaluate: ([value], sourceCodeInfo): Any => {
        // Helper: convert a plain arity object to a PersistentMap so it's a valid Dvala object
        function arityToMap(a: Arity): Any {
          let m = PersistentMap.empty<unknown>()
          if (a.min !== undefined) m = m.assoc('min', a.min)
          if (a.max !== undefined) m = m.assoc('max', a.max)
          return m
        }

        // Handle effects
        if (isEffect(value)) {
          const key = `-effect-${value.name}`
          const ref = effectReference[key]
          if (!ref)
            return PersistentMap.empty()
          // Derive arity from variants
          const argCounts = ref.variants.map(v => v.argumentNames.length)
          const min = Math.min(...argCounts)
          const max = Math.max(...argCounts)
          return arityToMap({ min, max })
        }

        // Handle functions
        assertFunctionLike(value, sourceCodeInfo)
        return arityToMap(isDvalaFunction(value) ? value.arity : toFixedArity(1))
      },
      arity: toFixedArity(1),
      docs: {
        category: 'meta',
        returns: { type: 'object' },
        args: { value: { type: ['function', 'effect'] } },
        variants: [{ argumentNames: ['value'] }],
        description: 'Returns arity of the `value`. The arity is an object with the properties: `min` and `max`. If the function has fixed arity, `min` and `max` are equal to the number of required parameters. If no restrictions apply, empty object is returned. Also works on effects.',
        seeAlso: ['doc'],
        examples: [
          { code: 'arity(+)', noCheck: true },
          { code: 'arity(map)', noCheck: true },
          { code: 'arity(@dvala.random.int)', noCheck: true },
          { code: `
let add = (x, y = 0) -> do
  x + y;
end;

arity(add)`, noCheck: true },
          { code: `
let foo = (k, ...x) -> do
  k + x;
end;
  arity(foo)`, noCheck: true },
        ],
      },
    },
  }
}
