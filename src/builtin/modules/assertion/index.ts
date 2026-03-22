import { AssertionError } from '../../../errors'
import { compare, deepEqual } from '../../../utils'
import type { BuiltinNormalExpressions } from '../../../builtin/interface'
import { asAny, isColl, isObj, isRegularExpression, isSeq } from '../../../typeGuards/dvala'
import { isDvalaFunction } from '../../../typeGuards/dvalaFunction'
import { isNumber } from '../../../typeGuards/number'
import { assertString, assertStringOrNumber } from '../../../typeGuards/string'
import { isGrid, isMatrix, isVector } from '../../../typeGuards/annotatedCollections'
import type { DvalaModule } from '../interface'
import assertionModuleSource from './assertion.dvala'
import { moduleDocs } from './docs'

const assertNormalExpression: BuiltinNormalExpressions = {
  'assertEqual': {
    evaluate: ([first, second, message], sourceCodeInfo): null => {
      if (message !== undefined) {
        assertString(message, sourceCodeInfo)
        message = ` ${message}`
      }
      message ??= ''
      if (!deepEqual(asAny(first, sourceCodeInfo), asAny(second, sourceCodeInfo), sourceCodeInfo)) {
        throw new AssertionError(
          `Expected ${JSON.stringify(first, null, 2)} to deep equal ${JSON.stringify(second, null, 2)}.${message}`,
          sourceCodeInfo,
        )
      }
      return null
    },
    arity: { min: 2, max: 3 },
  },
  'assertNotEqual': {
    evaluate: ([first, second, message], sourceCodeInfo): null => {
      if (message !== undefined) {
        assertString(message, sourceCodeInfo)
        message = ` ${message}`
      }
      message ??= ''
      if (deepEqual(asAny(first, sourceCodeInfo), asAny(second, sourceCodeInfo), sourceCodeInfo)) {
        throw new AssertionError(
          `Expected ${JSON.stringify(first)} not to deep equal ${JSON.stringify(second)}.${message}`,
          sourceCodeInfo,
        )
      }
      return null
    },
    arity: { min: 2, max: 3 },
  },
  'assertGt': {
    evaluate: ([first, second, message], sourceCodeInfo): null => {
      assertStringOrNumber(first, sourceCodeInfo)
      assertStringOrNumber(second, sourceCodeInfo)
      if (message !== undefined) {
        assertString(message, sourceCodeInfo)
        message = ` ${message}`
      }
      message ??= ''
      if (compare(first, second, sourceCodeInfo) <= 0)
        throw new AssertionError(`Expected ${first} to be grater than ${second}.${message}`, sourceCodeInfo)

      return null
    },
    arity: { min: 2, max: 3 },
  },
  'assertGte': {
    evaluate: ([first, second, message], sourceCodeInfo): null => {
      assertStringOrNumber(first, sourceCodeInfo)
      assertStringOrNumber(second, sourceCodeInfo)
      if (message !== undefined) {
        assertString(message, sourceCodeInfo)
        message = ` ${message}`
      }
      message ??= ''
      if (compare(first, second, sourceCodeInfo) < 0)
        throw new AssertionError(`Expected ${first} to be grater than or equal to ${second}.${message}`, sourceCodeInfo)

      return null
    },
    arity: { min: 2, max: 3 },
  },
  'assertLt': {
    evaluate: ([first, second, message], sourceCodeInfo): null => {
      assertStringOrNumber(first, sourceCodeInfo)
      assertStringOrNumber(second, sourceCodeInfo)
      if (message !== undefined) {
        assertString(message, sourceCodeInfo)
        message = ` ${message}`
      }
      message ??= ''
      if (compare(first, second, sourceCodeInfo) >= 0)
        throw new AssertionError(`Expected ${first} to be less than ${second}.${message}`, sourceCodeInfo)

      return null
    },
    arity: { min: 2, max: 3 },
  },
  'assertLte': {
    evaluate: ([first, second, message], sourceCodeInfo): null => {
      assertStringOrNumber(first, sourceCodeInfo)
      assertStringOrNumber(second, sourceCodeInfo)
      if (message !== undefined) {
        assertString(message, sourceCodeInfo)
        message = ` ${message}`
      }
      message ??= ''
      if (compare(first, second, sourceCodeInfo) > 0)
        throw new AssertionError(`Expected ${first} to be less than or equal to ${second}.${message}`, sourceCodeInfo)

      return null
    },
    arity: { min: 2, max: 3 },
  },
  'assertTrue': {
    evaluate: ([first, message], sourceCodeInfo): null => {
      if (message !== undefined) {
        assertString(message, sourceCodeInfo)
        message = ` ${message}`
      }
      message ??= ''
      if (first !== true)
        throw new AssertionError(`Expected ${first} to be true.${message}`, sourceCodeInfo)

      return null
    },
    arity: { min: 1, max: 2 },
  },
  'assertFalse': {
    evaluate: ([first, message], sourceCodeInfo): null => {
      if (message !== undefined) {
        assertString(message, sourceCodeInfo)
        message = ` ${message}`
      }
      message ??= ''
      if (first !== false)
        throw new AssertionError(`Expected ${first} to be false.${message}`, sourceCodeInfo)

      return null
    },
    arity: { min: 1, max: 2 },
  },
  'assertTruthy': {
    evaluate: ([first, message], sourceCodeInfo): null => {
      if (message !== undefined) {
        assertString(message, sourceCodeInfo)
        message = ` ${message}`
      }
      message ??= ''
      if (!first)
        throw new AssertionError(`Expected ${first} to be truthy.${message}`, sourceCodeInfo)

      return null
    },
    arity: { min: 1, max: 2 },
  },
  'assertFalsy': {
    evaluate: ([first, message], sourceCodeInfo): null => {
      if (message !== undefined) {
        assertString(message, sourceCodeInfo)
        message = ` ${message}`
      }
      message ??= ''
      if (first)
        throw new AssertionError(`Expected ${first} to be falsy.${message}`, sourceCodeInfo)

      return null
    },
    arity: { min: 1, max: 2 },
  },
  'assertNull': {
    evaluate: ([first, message], sourceCodeInfo): null => {
      if (message !== undefined) {
        assertString(message, sourceCodeInfo)
        message = ` ${message}`
      }
      message ??= ''
      if (first !== null)
        throw new AssertionError(`Expected ${first} to be null.${message}`, sourceCodeInfo)

      return null
    },
    arity: { min: 1, max: 2 },
  },
  // Implemented in assertion.dvala - these stubs provide arity checking
  // The evaluate functions are placeholders; actual execution uses dvalaImpl
  'assertFails': {
    /* v8 ignore next 1 */
    evaluate: () => null,
    arity: { min: 1, max: 2 },
  },
  'assertFailsWith': {
    /* v8 ignore next 1 */
    evaluate: () => null,
    arity: { min: 2, max: 3 },
  },
  'assertSucceeds': {
    /* v8 ignore next 1 */
    evaluate: () => null,
    arity: { min: 1, max: 2 },
  },
  'assertArray': {
    evaluate: ([first, message], sourceCodeInfo): null => {
      if (message !== undefined) {
        assertString(message, sourceCodeInfo)
        message = ` ${message}`
      }
      message ??= ''
      if (!Array.isArray(first))
        throw new AssertionError(`Expected ${JSON.stringify(first)} to be an array.${message}`, sourceCodeInfo)

      return null
    },
    arity: { min: 1, max: 2 },
  },
  'assertBoolean': {
    evaluate: ([first, message], sourceCodeInfo): null => {
      if (message !== undefined) {
        assertString(message, sourceCodeInfo)
        message = ` ${message}`
      }
      message ??= ''
      if (typeof first !== 'boolean')
        throw new AssertionError(`Expected ${JSON.stringify(first)} to be a boolean.${message}`, sourceCodeInfo)

      return null
    },
    arity: { min: 1, max: 2 },
  },
  'assertCollection': {
    evaluate: ([first, message], sourceCodeInfo): null => {
      if (message !== undefined) {
        assertString(message, sourceCodeInfo)
        message = ` ${message}`
      }
      message ??= ''
      if (!isColl(first))
        throw new AssertionError(`Expected ${JSON.stringify(first)} to be a collection.${message}`, sourceCodeInfo)

      return null
    },
    arity: { min: 1, max: 2 },
  },
  'assertFunction': {
    evaluate: ([first, message], sourceCodeInfo): null => {
      if (message !== undefined) {
        assertString(message, sourceCodeInfo)
        message = ` ${message}`
      }
      message ??= ''
      if (!isDvalaFunction(first))
        throw new AssertionError(`Expected ${JSON.stringify(first)} to be a function.${message}`, sourceCodeInfo)

      return null
    },
    arity: { min: 1, max: 2 },
  },
  'assertGrid': {
    evaluate: ([first, message], sourceCodeInfo): null => {
      if (message !== undefined) {
        assertString(message, sourceCodeInfo)
        message = ` ${message}`
      }
      message ??= ''
      if (!isGrid(first))
        throw new AssertionError(`Expected ${JSON.stringify(first)} to be a grid.${message}`, sourceCodeInfo)

      return null
    },
    arity: { min: 1, max: 2 },
  },
  'assertInteger': {
    evaluate: ([first, message], sourceCodeInfo): null => {
      if (message !== undefined) {
        assertString(message, sourceCodeInfo)
        message = ` ${message}`
      }
      message ??= ''
      if (typeof first !== 'number' || !isNumber(first, { integer: true }))
        throw new AssertionError(`Expected ${JSON.stringify(first)} to be an integer.${message}`, sourceCodeInfo)

      return null
    },
    arity: { min: 1, max: 2 },
  },
  'assertMatrix': {
    evaluate: ([first, message], sourceCodeInfo): null => {
      if (message !== undefined) {
        assertString(message, sourceCodeInfo)
        message = ` ${message}`
      }
      message ??= ''
      if (!isMatrix(first))
        throw new AssertionError(`Expected ${JSON.stringify(first)} to be a matrix.${message}`, sourceCodeInfo)

      return null
    },
    arity: { min: 1, max: 2 },
  },
  'assertNumber': {
    evaluate: ([first, message], sourceCodeInfo): null => {
      if (message !== undefined) {
        assertString(message, sourceCodeInfo)
        message = ` ${message}`
      }
      message ??= ''
      if (typeof first !== 'number')
        throw new AssertionError(`Expected ${JSON.stringify(first)} to be a number.${message}`, sourceCodeInfo)

      return null
    },
    arity: { min: 1, max: 2 },
  },
  'assertObject': {
    evaluate: ([first, message], sourceCodeInfo): null => {
      if (message !== undefined) {
        assertString(message, sourceCodeInfo)
        message = ` ${message}`
      }
      message ??= ''
      if (!isObj(first))
        throw new AssertionError(`Expected ${JSON.stringify(first)} to be an object.${message}`, sourceCodeInfo)

      return null
    },
    arity: { min: 1, max: 2 },
  },
  'assertRegexp': {
    evaluate: ([first, message], sourceCodeInfo): null => {
      if (message !== undefined) {
        assertString(message, sourceCodeInfo)
        message = ` ${message}`
      }
      message ??= ''
      if (!isRegularExpression(first))
        throw new AssertionError(`Expected ${JSON.stringify(first)} to be a regexp.${message}`, sourceCodeInfo)

      return null
    },
    arity: { min: 1, max: 2 },
  },
  'assertSequence': {
    evaluate: ([first, message], sourceCodeInfo): null => {
      if (message !== undefined) {
        assertString(message, sourceCodeInfo)
        message = ` ${message}`
      }
      message ??= ''
      if (!isSeq(first))
        throw new AssertionError(`Expected ${JSON.stringify(first)} to be a sequence.${message}`, sourceCodeInfo)

      return null
    },
    arity: { min: 1, max: 2 },
  },
  'assertString': {
    evaluate: ([first, message], sourceCodeInfo): null => {
      if (message !== undefined) {
        assertString(message, sourceCodeInfo)
        message = ` ${message}`
      }
      message ??= ''
      if (typeof first !== 'string')
        throw new AssertionError(`Expected ${JSON.stringify(first)} to be a string.${message}`, sourceCodeInfo)

      return null
    },
    arity: { min: 1, max: 2 },
  },
  'assertVector': {
    evaluate: ([first, message], sourceCodeInfo): null => {
      if (message !== undefined) {
        assertString(message, sourceCodeInfo)
        message = ` ${message}`
      }
      message ??= ''
      if (!isVector(first))
        throw new AssertionError(`Expected ${JSON.stringify(first)} to be a vector.${message}`, sourceCodeInfo)

      return null
    },
    arity: { min: 1, max: 2 },
  },
}

for (const [key, docs] of Object.entries(moduleDocs)) {
  // Defensive: all doc keys correspond to existing expressions
  /* v8 ignore next 2 */
  if (assertNormalExpression[key])
    assertNormalExpression[key].docs = docs
}

export const assertModule: DvalaModule = {
  name: 'assertion',
  functions: assertNormalExpression,
  source: assertionModuleSource,
  docs: moduleDocs,
}
