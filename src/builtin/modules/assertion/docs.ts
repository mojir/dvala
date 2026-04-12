import type { FunctionDocs } from '../../interface'

export const moduleDocs: Record<string, FunctionDocs> = {
  'assertNotEqual': {
    category: 'assertion',
    description: 'If `a` is the same as `b` it throws `AssertionError`.',
    returns: {
      type: 'null',
    },
    args: {
      a: {
        type: 'any',
      },
      b: {
        type: 'any',
      },
      message: {
        type: 'string',
      },
    },
    variants: [
      {
        argumentNames: [
          'a',
          'b',
        ],
      },
      {
        argumentNames: [
          'a',
          'b',
          'message',
        ],
      },
    ],
    examples: [
      'let { assertNotEqual } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertNotEqual(0, 0, "Expected different values") end',
      'let { assertNotEqual } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertNotEqual(0, 0) end',
      'let { assertNotEqual } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; 0 assertNotEqual 0 end',
      'let { assertNotEqual } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertNotEqual(0, 1) end',
    ],
    seeAlso: ['assertion.assertEqual'],
    hideOperatorForm: true,
  },
  'assertEqual': {
    category: 'assertion',
    description: 'If `a` is not structural equal to `b` it throws `AssertionError`.',
    returns: {
      type: 'null',
    },
    args: {
      a: {
        type: 'any',
      },
      b: {
        type: 'any',
      },
      message: {
        type: 'string',
      },
    },
    variants: [
      {
        argumentNames: [
          'a',
          'b',
        ],
      },
      {
        argumentNames: [
          'a',
          'b',
          'message',
        ],
      },
    ],
    examples: [
      'let { assertEqual } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertEqual({ "a": 1 }, { "a": 2 }, "Expected equal values") end',
      'let { assertEqual } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertEqual({ "a": 1 }, { "a": 2 }) end',
      'let { assertEqual } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertEqual({ "a": 1 }, { "a": 1 }) end',
    ],
    seeAlso: ['assertion.assertNotEqual'],
    hideOperatorForm: true,
  },
  'assertGt': {
    category: 'assertion',
    description: 'If `a` is not greater than `b` it throws `AssertionError`.',
    returns: {
      type: 'null',
    },
    args: {
      a: {
        type: 'any',
      },
      b: {
        type: 'any',
      },
      message: {
        type: 'string',
      },
    },
    variants: [
      {
        argumentNames: [
          'a',
          'b',
        ],
      },
      {
        argumentNames: [
          'a',
          'b',
          'message',
        ],
      },
    ],
    examples: [
      'let { assertGt } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertGt(0, 1, "Expected greater value") end',
      'let { assertGt } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertGt(0, 0) end',
      'let { assertGt } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertGt(1, 0) end',
    ],
    seeAlso: ['assertion.assertLt', 'assertion.assertGte', 'assertion.assertLte'],
    hideOperatorForm: true,
  },
  'assertLt': {
    category: 'assertion',
    description: 'If `a` is not less than `b` it throws `AssertionError`.',
    returns: {
      type: 'null',
    },
    args: {
      a: {
        type: 'any',
      },
      b: {
        type: 'any',
      },
      message: {
        type: 'string',
      },
    },
    variants: [
      {
        argumentNames: [
          'a',
          'b',
        ],
      },
      {
        argumentNames: [
          'a',
          'b',
          'message',
        ],
      },
    ],
    examples: [
      'let { assertLt } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertLt(1, 0, "Expected smaller value") end',
      'let { assertLt } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertLt(1, 1) end',
      'let { assertLt } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertLt(0, 1) end',
    ],
    seeAlso: ['assertion.assertGt', 'assertion.assertLte', 'assertion.assertGte'],
    hideOperatorForm: true,
  },
  'assertGte': {
    category: 'assertion',
    description: 'If `a` is less than `b` it throws `AssertionError`.',
    returns: {
      type: 'null',
    },
    args: {
      a: {
        type: 'any',
      },
      b: {
        type: 'any',
      },
      message: {
        type: 'string',
      },
    },
    variants: [
      {
        argumentNames: [
          'a',
          'b',
        ],
      },
      {
        argumentNames: [
          'a',
          'b',
          'message',
        ],
      },
    ],
    examples: [
      'let { assertGte } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertGte(0, 1, "Expected greater value") end',
      'let { assertGte } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertGte(0, 1) end',
      'let { assertGte } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertGte(1, 1) end',
    ],
    seeAlso: ['assertion.assertLte', 'assertion.assertGt', 'assertion.assertLt'],
    hideOperatorForm: true,
  },
  'assertLte': {
    category: 'assertion',
    description: 'If `a` is grater than `b` it throws `AssertionError`.',
    returns: {
      type: 'null',
    },
    args: {
      a: {
        type: 'any',
      },
      b: {
        type: 'any',
      },
      message: {
        type: 'string',
      },
    },
    variants: [
      {
        argumentNames: [
          'a',
          'b',
        ],
      },
      {
        argumentNames: [
          'a',
          'b',
          'message',
        ],
      },
    ],
    examples: [
      'let { assertLte } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertLte(1, 0, "Expected smaller value") end',
      'let { assertLte } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertLte(1, 0) end',
      'let { assertLte } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertLte(1, 1) end',
    ],
    seeAlso: ['assertion.assertGte', 'assertion.assertLt', 'assertion.assertGt'],
    hideOperatorForm: true,
  },
  'assertTrue': {
    category: 'assertion',
    description: 'If `value` is not `true` it throws `AssertionError`.',
    returns: {
      type: 'null',
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
      'let { assertTrue } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertTrue(false, "Expected true") end',
      'let { assertTrue } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertTrue(false) end',
      'let { assertTrue } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertTrue(true) end',
    ],
    seeAlso: ['assertion.assertFalse', 'assertion.assertTruthy', 'assertion.assertFalsy', 'assert', 'assertion.assertBoolean'],
    hideOperatorForm: true,
  },
  'assertFalse': {
    category: 'assertion',
    description: 'If `value` is not `false` it throws `AssertionError`.',
    returns: {
      type: 'null',
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
      'let { assertFalse } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertFalse(true, "Expected false") end',
      'let { assertFalse } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertFalse(true) end',
      'let { assertFalse } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertFalse(false) end',
    ],
    seeAlso: ['assertion.assertTrue', 'assertion.assertFalsy', 'assertion.assertTruthy', 'assertion.assertBoolean'],
    hideOperatorForm: true,
  },
  'assertTruthy': {
    category: 'assertion',
    description: 'If `value` is not `truthy` it throws `AssertionError`.',
    returns: {
      type: 'null',
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
      'let { assertTruthy } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertTruthy(false, "Expected truthy") end',
      'let { assertTruthy } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertTruthy(false) end',
      'let { assertTruthy } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertTruthy(0) end',
      'let { assertTruthy } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertTruthy(null) end',
      'let { assertTruthy } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertTruthy("") end',
      'let { assertTruthy } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertTruthy(true) end',
      'let { assertTruthy } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertTruthy(1) end',
      'let { assertTruthy } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertTruthy("x") end',
      'let { assertTruthy } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertTruthy([]) end',
      'let { assertTruthy } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertTruthy(null) end',
    ],
    seeAlso: ['assertion.assertFalsy', 'assertion.assertTrue', 'assertion.assertFalse', 'assert', 'assertion.assertNull'],
    hideOperatorForm: true,
  },
  'assertFalsy': {
    category: 'assertion',
    description: 'If `value` is not `falsy` it throws `AssertionError`.',
    returns: {
      type: 'null',
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
      'let { assertFalsy } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertFalsy(true, "Expected falsy") end',
      'let { assertFalsy } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertFalsy("x") end',
      'let { assertFalsy } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertFalsy([]) end',
      'let { assertFalsy } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertFalsy(null) end',
      'let { assertFalsy } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertFalsy(1) end',
      'let { assertFalsy } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertFalsy(false) end',
      'let { assertFalsy } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertFalsy(0) end',
      'let { assertFalsy } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertFalsy(null) end',
      'let { assertFalsy } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertFalsy("") end',
    ],
    seeAlso: ['assertion.assertTruthy', 'assertion.assertFalse', 'assertion.assertTrue', 'assertion.assertNull'],
    hideOperatorForm: true,
  },
  'assertNull': {
    category: 'assertion',
    description: 'If `value` is not `null` it throws `AssertionError`.',
    returns: {
      type: 'null',
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
      'let { assertNull } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertNull(null) end',
      'let { assertNull } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertNull(true, "Expected null") end',
      'let { assertNull } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertNull("x") end',
      'let { assertNull } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertNull([]) end',
      'let { assertNull } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertNull(null) end',
      'let { assertNull } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertNull(1) end',
      'let { assertNull } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertNull(false) end',
      'let { assertNull } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertNull(0) end',
      'let { assertNull } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertNull("") end',
    ],
    seeAlso: ['assertion.assertTruthy', 'assertion.assertFalsy'],
    hideOperatorForm: true,
  },
  'assertFails': {
    category: 'assertion',
    description: 'If `fun` does not fail (perform `dvala.error`), it throws `AssertionError`.',
    returns: {
      type: 'null',
    },
    args: {
      fun: {
        type: 'function',
      },
      message: {
        type: 'string',
      },
    },
    variants: [
      {
        argumentNames: [
          'fun',
        ],
      },
      {
        argumentNames: [
          'fun',
          'message',
        ],
      },
    ],
    examples: [
      'let { assertFails } = import("assertion");\nassertFails(-> perform(@dvala.error, "Error"))',
      'let { assertFails } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertFails(-> identity("Error")) end',
    ],
    seeAlso: ['assertion.assertFailsWith', 'assertion.assertSucceeds'],
    hideOperatorForm: true,
  },
  'assertFailsWith': {
    category: 'assertion',
    description: 'If `fun` does not fail with `error-message`, it throws `AssertionError`.',
    returns: {
      type: 'null',
    },
    args: {
      'fun': {
        type: 'function',
      },
      'errorMessage': {
        type: 'string',
      },
      'message': {
        type: 'string',
      },
    },
    variants: [
      {
        argumentNames: [
          'fun',
          'errorMessage',
        ],
      },
      {
        argumentNames: [
          'fun',
          'errorMessage',
          'message',
        ],
      },
    ],
    examples: [
      'let { assertFailsWith } = import("assertion");\nassertFailsWith(-> raise("Error"), "Error")',
      'let { assertFailsWith } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertFailsWith(-> identity("Error"), "Error") end',
    ],
    seeAlso: ['assertion.assertFails', 'assertion.assertSucceeds'],
    hideOperatorForm: true,
  },
  'assertSucceeds': {
    category: 'assertion',
    description: 'If `fun` fails (performs `dvala.error`), it throws `AssertionError`.',
    returns: {
      type: 'null',
    },
    args: {
      fun: {
        type: 'function',
      },
      message: {
        type: 'string',
      },
    },
    variants: [
      {
        argumentNames: [
          'fun',
        ],
      },
      {
        argumentNames: [
          'fun',
          'message',
        ],
      },
    ],
    examples: [
      'let { assertSucceeds } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertSucceeds(-> identity("OK")) end',
      'let { assertSucceeds } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertSucceeds(-> perform(@dvala.error, "Error")) end',
    ],
    seeAlso: ['assertion.assertFails', 'assertion.assertFailsWith'],
    hideOperatorForm: true,
  },
  'assertArray': {
    category: 'assertion',
    description: 'If `value` is not an `array` it throws `AssertionError`.',
    returns: {
      type: 'null',
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
      'let { assertArray } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertArray([1, 2, 3]) end',
      'let { assertArray } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertArray("string") end',
      'let { assertArray } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertArray(42, "Expected an array") end',
    ],
    seeAlso: ['assertion.assertObject', 'assertion.assertCollection', 'assertion.assertSequence'],
    hideOperatorForm: true,
  },
  'assertBoolean': {
    category: 'assertion',
    description: 'If `value` is not a `boolean` it throws `AssertionError`.',
    returns: {
      type: 'null',
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
      'let { assertBoolean } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertBoolean(true) end',
      'let { assertBoolean } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertBoolean(false) end',
      'let { assertBoolean } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertBoolean(1, "Expected a boolean") end',
    ],
    seeAlso: ['assertion.assertTrue', 'assertion.assertFalse', 'assertion.assertNumber', 'assertion.assertString'],
    hideOperatorForm: true,
  },
  'assertCollection': {
    category: 'assertion',
    description: 'If `value` is not a `collection` (array, object, or string) it throws `AssertionError`.',
    returns: {
      type: 'null',
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
      'let { assertCollection } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertCollection([1, 2]) end',
      'let { assertCollection } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertCollection({ a: 1 }) end',
      'let { assertCollection } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertCollection("hello") end',
      'let { assertCollection } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertCollection(42, "Expected a collection") end',
    ],
    seeAlso: ['assertion.assertSequence', 'assertion.assertArray', 'assertion.assertObject'],
    hideOperatorForm: true,
  },
  'assertFunction': {
    category: 'assertion',
    description: 'If `value` is not a `function` it throws `AssertionError`.',
    returns: {
      type: 'null',
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
      'let { assertFunction } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertFunction(-> $ + 1) end',
      'let { assertFunction } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertFunction(42, "Expected a function") end',
    ],
    seeAlso: ['assertion.assertNumber', 'assertion.assertString'],
    hideOperatorForm: true,
  },
  'assertGrid': {
    category: 'assertion',
    description: 'If `value` is not a `grid` it throws `AssertionError`.',
    returns: {
      type: 'null',
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
      'let { assertGrid } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertGrid([[1, 2], [3, 4]]) end',
      'let { assertGrid } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertGrid([1, 2], "Expected a grid") end',
    ],
    seeAlso: ['assertion.assertMatrix', 'assertion.assertVector'],
    hideOperatorForm: true,
  },
  'assertInteger': {
    category: 'assertion',
    description: 'If `value` is not an `integer` it throws `AssertionError`.',
    returns: {
      type: 'null',
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
      'let { assertInteger } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertInteger(42) end',
      'let { assertInteger } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertInteger(3.14, "Expected an integer") end',
    ],
    seeAlso: ['assertion.assertNumber'],
    hideOperatorForm: true,
  },
  'assertMatrix': {
    category: 'assertion',
    description: 'If `value` is not a `matrix` it throws `AssertionError`.',
    returns: {
      type: 'null',
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
      'let { assertMatrix } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertMatrix([[1, 2], [3, 4]]) end',
      'let { assertMatrix } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertMatrix([1, 2], "Expected a matrix") end',
    ],
    seeAlso: ['assertion.assertVector', 'assertion.assertGrid'],
    hideOperatorForm: true,
  },
  'assertNumber': {
    category: 'assertion',
    description: 'If `value` is not a `number` it throws `AssertionError`.',
    returns: {
      type: 'null',
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
      'let { assertNumber } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertNumber(42) end',
      'let { assertNumber } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertNumber("hello", "Expected a number") end',
    ],
    seeAlso: ['assertion.assertInteger', 'assertion.assertBoolean', 'assertion.assertString', 'assertion.assertFunction'],
    hideOperatorForm: true,
  },
  'assertObject': {
    category: 'assertion',
    description: 'If `value` is not an `object` it throws `AssertionError`.',
    returns: {
      type: 'null',
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
      'let { assertObject } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertObject({ a: 1 }) end',
      'let { assertObject } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertObject([1, 2], "Expected an object") end',
    ],
    seeAlso: ['assertion.assertArray', 'assertion.assertCollection'],
    hideOperatorForm: true,
  },
  'assertRegexp': {
    category: 'assertion',
    description: 'If `value` is not a `regexp` it throws `AssertionError`.',
    returns: {
      type: 'null',
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
      'let { assertRegexp } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertRegexp(#"^start") end',
      'let { assertRegexp } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertRegexp("hello", "Expected a regexp") end',
    ],
    seeAlso: ['assertion.assertString'],
    hideOperatorForm: true,
  },
  'assertSequence': {
    category: 'assertion',
    description: 'If `value` is not a `sequence` (array or string) it throws `AssertionError`.',
    returns: {
      type: 'null',
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
      'let { assertSequence } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertSequence([1, 2]) end',
      'let { assertSequence } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertSequence("hello") end',
      'let { assertSequence } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertSequence({ a: 1 }, "Expected a sequence") end',
    ],
    seeAlso: ['assertion.assertCollection', 'assertion.assertArray'],
    hideOperatorForm: true,
  },
  'assertString': {
    category: 'assertion',
    description: 'If `value` is not a `string` it throws `AssertionError`.',
    returns: {
      type: 'null',
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
      'let { assertString } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertString("hello") end',
      'let { assertString } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertString(42, "Expected a string") end',
    ],
    seeAlso: ['assertion.assertNumber', 'assertion.assertBoolean', 'assertion.assertRegexp', 'assertion.assertFunction'],
    hideOperatorForm: true,
  },
  'assertVector': {
    category: 'assertion',
    description: 'If `value` is not a `vector` it throws `AssertionError`.',
    returns: {
      type: 'null',
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
      'let { assertVector } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertVector([1, 2, 3]) end',
      'let { assertVector } = import("assertion");\ndo with handler @dvala.error(arg) -> resume(arg) end; assertVector(["a", "b"], "Expected a vector") end',
    ],
    seeAlso: ['assertion.assertMatrix', 'assertion.assertGrid'],
    hideOperatorForm: true,
  },
}
