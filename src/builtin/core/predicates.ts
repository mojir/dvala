import { isDvalaFunction } from '../../typeGuards/dvalaFunction'
import { assertColl, isColl, isEffect, isObj, isRegularExpression, isSeq } from '../../typeGuards/dvala'
import { assertNumber, isNumber } from '../../typeGuards/number'
import type { BuiltinNormalExpressions } from '../interface'
import { isGrid, isMatrix, isVector } from '../../typeGuards/annotatedCollections'
import { EPSILON } from '../../utils'
import { toFixedArity } from '../../utils/arity'

export const predicatesNormalExpression: BuiltinNormalExpressions = {
  'isFunction': {
    evaluate: ([first]): boolean => isDvalaFunction(first),
    arity: toFixedArity(1),
    docs: {
      category: 'predicate',
      returns: { type: 'boolean' },
      args: { x: { type: 'any' } },
      variants: [{ argumentNames: ['x'] }],
      description: 'Returns `true` if `x` is a function, otherwise `false`.',
      seeAlso: ['isString', 'isNumber', 'isBoolean', 'isNull', 'isArray', 'isObject', 'isRegexp', 'typeOf'],
      examples: [
        'isFunction(+)',
        'isFunction(/)',
        'isFunction((x, y) -> x + y)',
        'isFunction(false)',
        'isFunction("false")',
        'isFunction([1, 2, 3])',
      ],
    },
  },

  'isString': {
    evaluate: ([first]): boolean => typeof first === 'string',
    arity: toFixedArity(1),
    docs: {
      category: 'predicate',
      returns: { type: 'boolean' },
      args: { x: { type: 'any' } },
      variants: [{ argumentNames: ['x'] }],
      description: 'Returns `true` if `x` is a string, otherwise `false`.',
      seeAlso: ['isBlank', 'isNumber', 'isBoolean', 'isNull', 'isArray', 'isObject', 'isRegexp', 'isFunction', 'isCollection', 'isSequence', 'typeOf'],
      examples: [
        'isString("")',
        'isString("A string")',
        'isString(if true then "A string" else false end)',
        'isString(false)',
        'isString([1, 2, 3])',
        'isString(100)',
      ],
    },
  },

  'isNumber': {
    evaluate: ([first]): boolean => typeof first === 'number',
    arity: toFixedArity(1),
    docs: {
      category: 'predicate',
      returns: { type: 'boolean' },
      args: { x: { type: 'any' } },
      variants: [{ argumentNames: ['x'] }],
      description: 'Returns `true` if `x` is a number, otherwise `false`.',
      seeAlso: ['isInteger', 'isZero', 'isPos', 'isNeg', 'isFinite', 'number', 'isString', 'isBoolean', 'isNull', 'isFunction', 'typeOf'],
      examples: [
        'isNumber(0)',
        'isNumber(2)',
        'isNumber(-0.12)',
        'isNumber(false)',
        'isNumber([1, 2, 3])',
        'isNumber("A string")',
      ],
    },
  },

  'isInteger': {
    evaluate: ([first]): boolean => typeof first === 'number' && isNumber(first, { integer: true }),
    arity: toFixedArity(1),
    docs: {
      category: 'predicate',
      returns: { type: 'boolean' },
      args: { x: { type: 'any' } },
      variants: [{ argumentNames: ['x'] }],
      description: 'Returns `true` if `x` is an integer, otherwise `false`.',
      seeAlso: ['isNumber', 'number', 'isEven', 'isOdd'],
      examples: [
        'isInteger(0)',
        'isInteger(-12)',
        'isInteger(42)',
        'isInteger(10.1)',
        'isInteger((x, y) -> x + y)',
        'isInteger(false)',
        'isInteger("false")',
        'isInteger([1, 2, 3])',
      ],
    },
  },

  'isBoolean': {
    evaluate: ([first]): boolean => typeof first === 'boolean',
    arity: toFixedArity(1),
    docs: {
      category: 'predicate',
      returns: { type: 'boolean' },
      args: { x: { type: 'any' } },
      variants: [{ argumentNames: ['x'] }],
      description: 'Returns `true` if `x` is a `boolean`, otherwise `false`.',
      seeAlso: ['isTrue', 'isFalse', 'boolean', 'isString', 'isNumber', 'isNull', 'isFunction', 'typeOf'],
      examples: [
        'isBoolean(true)',
        'isBoolean(false)',
        'isBoolean([1, 2, 3])',
        'isBoolean(0)',
        'isBoolean("A string")',
      ],
    },
  },

  'isNull': {
    evaluate: ([first]): boolean => first === null || first === undefined,
    arity: toFixedArity(1),
    docs: {
      category: 'predicate',
      returns: { type: 'boolean' },
      args: { x: { type: 'any' } },
      variants: [{ argumentNames: ['x'] }],
      description: 'Returns `true` if `x` is `null`, otherwise `false`.',
      seeAlso: ['isEmpty', 'isNotEmpty', 'isString', 'isNumber', 'isBoolean', 'isFunction', 'typeOf'],
      examples: [
        'isNull(null)',
        'isNull(false)',
        'isNull([1, 2, 3])',
        'isNull(0)',
        'isNull("A string")',
      ],
    },
  },

  'isZero': {
    evaluate: ([value], sourceCodeInfo): boolean => {
      assertNumber(value, sourceCodeInfo, { finite: true })
      return Math.abs(value) < EPSILON
    },
    arity: toFixedArity(1),
    docs: {
      category: 'predicate',
      returns: { type: 'boolean' },
      args: { x: { type: 'number' } },
      variants: [{ argumentNames: ['x'] }],
      description: 'Returns `true` if `x` is `0`, otherwise `false`.',
      seeAlso: ['isPos', 'isNeg', 'isEven', 'isNumber'],
      examples: [
        'isZero(0)',
        'isZero(-0.0)',
        'isZero(1)',
        'isZero(0.1)',
      ],
    },
  },

  'isPos': {
    evaluate: ([first], sourceCodeInfo): boolean => {
      assertNumber(first, sourceCodeInfo, { finite: true })
      return first > 0
    },
    arity: toFixedArity(1),
    docs: {
      category: 'predicate',
      returns: { type: 'boolean' },
      args: { x: { type: 'number' } },
      variants: [{ argumentNames: ['x'] }],
      description: 'Returns `true` if `x` is greater than `0`, otherwise `false`.',
      seeAlso: ['isNeg', 'isZero', 'isNumber'],
      examples: [
        'isPos(0)',
        'isPos(-0.0)',
        'isPos(1)',
        'isPos(-0.1)',
      ],
    },
  },

  'isNeg': {
    evaluate: ([first], sourceCodeInfo): boolean => {
      assertNumber(first, sourceCodeInfo, { finite: true })
      return first < 0
    },
    arity: toFixedArity(1),
    docs: {
      category: 'predicate',
      returns: { type: 'boolean' },
      args: { x: { type: 'number' } },
      variants: [{ argumentNames: ['x'] }],
      description: 'Returns `true` if `x` is less than `0`, otherwise `false`.',
      seeAlso: ['isPos', 'isZero', 'isNumber'],
      examples: [
        'isNeg(0)',
        'isNeg(-0.0)',
        'isNeg(1)',
        'isNeg(-0.1)',
      ],
    },
  },

  'isEven': {
    evaluate: ([first], sourceCodeInfo): boolean => {
      assertNumber(first, sourceCodeInfo, { finite: true })
      return first % 2 === 0
    },
    arity: toFixedArity(1),
    docs: {
      category: 'predicate',
      returns: { type: 'boolean' },
      args: { x: { type: 'number' } },
      variants: [{ argumentNames: ['x'] }],
      description: 'Returns `true` if `x` is even, otherwise `false`.',
      seeAlso: ['isOdd', 'isInteger', 'isZero'],
      examples: [
        'isEven(0)',
        'isEven(-0.0)',
        'isEven(-1)',
        'isEven(2.1)',
      ],
    },
  },

  'isOdd': {
    evaluate: ([first], sourceCodeInfo): boolean => {
      assertNumber(first, sourceCodeInfo, { finite: true })
      return isNumber(first, { integer: true }) && first % 2 !== 0
    },
    arity: toFixedArity(1),
    docs: {
      category: 'predicate',
      returns: { type: 'boolean' },
      args: { x: { type: 'number' } },
      variants: [{ argumentNames: ['x'] }],
      description: 'Returns `true` if `x` is odd, otherwise `false`.',
      seeAlso: ['isEven', 'isInteger'],
      examples: [
        'isOdd(1.0)',
        'isOdd(1.001)',
        'isOdd(-1)',
        'isOdd(2.1)',
      ],
    },
  },

  'isArray': {
    evaluate: ([first]): boolean => {
      return Array.isArray(first)
    },
    arity: toFixedArity(1),
    docs: {
      category: 'predicate',
      returns: { type: 'boolean' },
      args: { x: { type: 'any' } },
      variants: [{ argumentNames: ['x'] }],
      description: 'Returns `true` if `x` is an array, otherwise `false`.',
      seeAlso: ['isSequence', 'isCollection', 'isObject', 'isString', 'isVector', 'isMatrix', 'isGrid', 'isFunction', 'typeOf'],
      examples: [
        'isArray([])',
        'isArray([1, 2, 3])',
        'isArray(object("a", 10))',
        'isArray(42)',
        'isArray(10.1)',
        'isArray((x, y) -> x + y)',
      ],
    },
  },

  'isCollection': {
    evaluate: ([first]): boolean => {
      return isColl(first)
    },
    arity: toFixedArity(1),
    docs: {
      category: 'predicate',
      returns: { type: 'boolean' },
      args: { x: { type: 'any' } },
      variants: [{ argumentNames: ['x'] }],
      description: 'Returns `true` if `x` is a collection i.e. an array, an object or a string, otherwise `false`.',
      seeAlso: ['isSequence', 'isArray', 'isObject', 'isString'],
      examples: [
        'isCollection([])',
        'isCollection([1, 2, 3])',
        'isCollection(object("a", 10))',
        'isCollection("Albert")',
        'isCollection(42)',
        'isCollection(10.1)',
        'isCollection((x, y) -> x + y)',
      ],
    },
  },

  'isSequence': {
    evaluate: ([first]): boolean => {
      return isSeq(first)
    },
    arity: toFixedArity(1),
    docs: {
      category: 'predicate',
      returns: { type: 'boolean' },
      args: { x: { type: 'any' } },
      variants: [{ argumentNames: ['x'] }],
      description: 'Returns `true` if `x` is a sequence i.e. an array or a string, otherwise `false`.',
      seeAlso: ['isCollection', 'isArray', 'isString'],
      examples: [
        'isSequence([])',
        'isSequence([1, 2, 3])',
        'isSequence(object("a", 10))',
        'isSequence("Albert")',
        'isSequence(42)',
        'isSequence(10.1)',
        'isSequence((x, y) -> x + y)',
      ],
    },
  },

  'isObject': {
    evaluate: ([first]): boolean => isObj(first),
    arity: toFixedArity(1),
    docs: {
      category: 'predicate',
      returns: { type: 'boolean' },
      args: { x: { type: 'any' } },
      variants: [{ argumentNames: ['x'] }],
      description: 'Returns `true` if `x` is an object, otherwise `false`.',
      seeAlso: ['isCollection', 'isArray', 'isString', 'isFunction', 'typeOf'],
      examples: [
        'isObject(object("a", 10))',
        'isObject(42)',
        'isObject(10.1)',
        'isObject((x, y) -> x + y)',
        'isObject(#"^start")',
        'isObject("false")',
        'isObject([1, 2, 3])',
      ],
    },
  },

  'isRegexp': {
    evaluate: ([value]): boolean => isRegularExpression(value),
    arity: toFixedArity(1),
    docs: {
      category: 'predicate',
      returns: { type: 'boolean' },
      args: { x: { type: 'any' } },
      variants: [{ argumentNames: ['x'] }],
      description: 'Returns `true` if `x` is a regexp, otherwise `false`.',
      seeAlso: ['regexp', 'reMatch', 'isString', 'isFunction', 'typeOf'],
      examples: [
        'isRegexp(regexp("^start"))',
        'isRegexp(#"^start")',
        'isRegexp(-12)',
        'isRegexp({})',
        'isRegexp(10.1)',
        'isRegexp((x, y) -> x + y)',
        'isRegexp(false)',
        'isRegexp("false")',
        'isRegexp([1, 2, 3])',
      ],
    },
  },

  'isEffect': {
    evaluate: ([value]): boolean => isEffect(value),
    arity: toFixedArity(1),
    docs: {
      category: 'predicate',
      returns: { type: 'boolean' },
      args: { x: { type: 'any' } },
      variants: [{ argumentNames: ['x'] }],
      description: 'Returns `true` if `x` is an effect, otherwise `false`.',
      seeAlso: ['effect', 'effectName', 'effectMatcher', 'perform', 'handle', 'typeOf'],
      examples: [
        'isEffect(@dvala.io.print)',
        'isEffect(42)',
        'isEffect("hello")',
        'isEffect(null)',
        'isEffect({})',
        'isEffect([1, 2, 3])',
      ],
    },
  },

  'isFinite': {
    evaluate: ([value], sourceCodeInfo): boolean => {
      assertNumber(value, sourceCodeInfo)
      return Number.isFinite(value)
    },
    arity: toFixedArity(1),
    docs: {
      category: 'predicate',
      returns: { type: 'boolean' },
      args: { x: { type: 'number' } },
      variants: [{ argumentNames: ['x'] }],
      description: 'Returns `true` if `x` is finite, otherwise `false`.',
      seeAlso: ['isPositiveInfinity', 'isNegativeInfinity', 'isNumber'],
      examples: [
        'isFinite(1.0)',
        'isFinite(1 / 0)',
        'isFinite(-1 / 0)',
      ],
    },
  },

  'isPositiveInfinity': {
    evaluate: ([value], sourceCodeInfo): boolean => {
      assertNumber(value, sourceCodeInfo)
      return value === Number.POSITIVE_INFINITY
    },
    arity: toFixedArity(1),
    docs: {
      category: 'predicate',
      returns: { type: 'boolean' },
      args: { x: { type: 'number' } },
      variants: [{ argumentNames: ['x'] }],
      description: 'Returns `true` if `x` equals positive infinity, otherwise `false`.',
      seeAlso: ['isNegativeInfinity', 'isFinite'],
      examples: [
        'isPositiveInfinity(1.0)',
        'isPositiveInfinity(1 / 0)',
        'isPositiveInfinity(-1 / 0)',
      ],
    },
  },

  'isNegativeInfinity': {
    evaluate: ([value], sourceCodeInfo): boolean => {
      assertNumber(value, sourceCodeInfo)
      return value === Number.NEGATIVE_INFINITY
    },
    arity: toFixedArity(1),
    docs: {
      category: 'predicate',
      returns: { type: 'boolean' },
      args: { x: { type: 'number' } },
      variants: [{ argumentNames: ['x'] }],
      description: 'Returns `true` if `x` equals negative infinity, otherwise `false`.',
      seeAlso: ['isPositiveInfinity', 'isFinite'],
      examples: [
        'isNegativeInfinity(1.0)',
        'isNegativeInfinity(1 / 0)',
        'isNegativeInfinity(-1 / 0)',
      ],
    },
  },

  'isTrue': {
    evaluate: ([value]): boolean => {
      return value === true
    },
    arity: toFixedArity(1),
    docs: {
      category: 'predicate',
      returns: { type: 'boolean' },
      args: { x: { type: 'any' } },
      variants: [{ argumentNames: ['x'] }],
      description: 'Returns `true` if `x` is `true`, otherwise `false`.',
      seeAlso: ['isFalse', 'isBoolean', 'boolean'],
      examples: [
        'isTrue(false)',
        'isTrue(true)',
        'isTrue(1)',
        'isTrue(0)',
      ],
    },
  },

  'isFalse': {
    evaluate: ([value]): boolean => {
      return value === false
    },
    arity: toFixedArity(1),
    docs: {
      category: 'predicate',
      returns: { type: 'boolean' },
      args: { x: { type: 'any' } },
      variants: [{ argumentNames: ['x'] }],
      description: 'Returns `true` if `x` is `true`, otherwise `false`.',
      seeAlso: ['isTrue', 'isBoolean', 'boolean'],
      examples: [
        'isFalse(false)',
        'isFalse(true)',
        'isFalse(1)',
        'isFalse(0)',
      ],
    },
  },

  'isEmpty': {
    evaluate: ([coll], sourceCodeInfo): boolean => {
      if (coll === null)
        return true

      assertColl(coll, sourceCodeInfo)
      if (typeof coll === 'string')
        return coll.length === 0

      if (Array.isArray(coll))
        return coll.length === 0

      return Object.keys(coll).length === 0
    },
    arity: toFixedArity(1),
    docs: {
      category: 'predicate',
      returns: { type: 'boolean' },
      args: { x: { type: ['collection', 'string', 'null'] } },
      variants: [{ argumentNames: ['x'] }],
      description: 'Returns `true` if `x` is empty or `null`, otherwise `false`.',
      seeAlso: ['isNotEmpty', 'collection.notEmpty', 'isNull', 'isBlank', 'count'],
      examples: [
        'isEmpty([])',
        'isEmpty([1, 2, 3])',
        'isEmpty({})',
        'isEmpty({ a: 2 })',
        'isEmpty("")',
        'isEmpty("Albert")',
        'isEmpty(null)',
      ],
    },
  },
  'isNotEmpty': {
    evaluate: ([coll], sourceCodeInfo): boolean => {
      if (coll === null)
        return false

      assertColl(coll, sourceCodeInfo)
      if (typeof coll === 'string')
        return coll.length > 0

      if (Array.isArray(coll))
        return coll.length > 0

      return Object.keys(coll).length > 0
    },
    arity: toFixedArity(1),
    docs: {
      category: 'predicate',
      returns: { type: 'boolean' },
      args: { x: { type: ['collection', 'string', 'null'] } },
      variants: [{ argumentNames: ['x'] }],
      description: 'Returns `false` if `x` is empty or `null`, otherwise `true`.',
      seeAlso: ['isEmpty', 'collection.notEmpty', 'isNull'],
      examples: [
        'isNotEmpty([])',
        'isNotEmpty([1, 2, 3])',
        'isNotEmpty({})',
        'isNotEmpty({ a: 2 })',
        'isNotEmpty("")',
        'isNotEmpty("Albert")',
        'isNotEmpty(null)',
      ],
    },
  },
  'isVector': {
    evaluate: ([vector]): boolean => isVector(vector),
    arity: toFixedArity(1),
    docs: {
      category: 'predicate',
      description: 'Checks if a value is a `vector`. A `vector` is an array of `numbers`.',
      seeAlso: ['isMatrix', 'isGrid', 'isArray'],
      returns: { type: 'boolean' },
      args: { value: { type: 'any', description: 'The value to check.' } },
      variants: [{ argumentNames: ['value'] }],
      examples: [
        'isVector(1)',
        'isVector([1, 2, 3])',
        'isVector([1, 2, "3"])',
      ],
    },
  },
  'isMatrix': {
    evaluate: ([matrix]): boolean => isMatrix(matrix),
    arity: toFixedArity(1),
    docs: {
      category: 'predicate',
      description: 'Checks if a value is a `matrix`. A `matrix` is an array of arrays of `numbers`.',
      seeAlso: ['isVector', 'isGrid', 'isArray'],
      returns: { type: 'boolean' },
      args: { value: { type: 'any', description: 'The value to check.' } },
      variants: [{ argumentNames: ['value'] }],
      examples: [
        'isMatrix(1)',
        'isMatrix([1, 2, 3])',
        'isMatrix([[1, 2], [3, 4]])',
        'isMatrix([[1, 2], [3, "4"]])',
        'isMatrix([[1, 2], [3]])',
      ],
    },
  },
  'isGrid': {
    evaluate: ([table]): boolean => isGrid(table),
    arity: toFixedArity(1),
    docs: {
      category: 'predicate',
      description: 'Checks if a `value` is a `grid`. A `grid` is an `array` of `arrays` where all inner `arrays` have the same length.',
      seeAlso: ['isVector', 'isMatrix', 'isArray'],
      returns: { type: 'boolean' },
      args: { value: { type: 'any', description: 'The value to check.' } },
      variants: [{ argumentNames: ['value'] }],
      examples: [
        'isGrid("1")',
        'isGrid(["1", 2, 3])',
        'isGrid([["1", 2], [3, 4]])',
        'isGrid([["1", 2], [3, "4"]])',
        'isGrid([["1", 2], [3]])',
      ],
    },
  },

}
