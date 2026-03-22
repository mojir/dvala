import type { FunctionDocs } from '../../interface'

export const moduleDocs: Record<string, FunctionDocs> = {
  'assertNotEqual': {
    category: 'assertion',
    description: 'If $a is the same as $b it throws `AssertionError`.',
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
      'let { assertNotEqual } = import(assertion);\nhandle assertNotEqual(0, 0, "Expected different values") with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertNotEqual } = import(assertion);\nhandle assertNotEqual(0, 0) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertNotEqual } = import(assertion);\nhandle 0 assertNotEqual 0 with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertNotEqual } = import(assertion);\nhandle assertNotEqual(0, 1) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
    ],
    seeAlso: ['assertion.assertEqual'],
    hideOperatorForm: true,
  },
  'assertEqual': {
    category: 'assertion',
    description: 'If $a is not structural equal to $b it throws `AssertionError`.',
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
      'let { assertEqual } = import(assertion);\nhandle assertEqual({ "a": 1 }, { "a": 2 }, "Expected equal values") with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertEqual } = import(assertion);\nhandle assertEqual({ "a": 1 }, { "a": 2 }) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertEqual } = import(assertion);\nhandle assertEqual({ "a": 1 }, { "a": 1 }) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
    ],
    seeAlso: ['assertion.assertNotEqual'],
    hideOperatorForm: true,
  },
  'assertGt': {
    category: 'assertion',
    description: 'If $a is not greater than $b it throws `AssertionError`.',
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
      'let { assertGt } = import(assertion);\nhandle assertGt(0, 1, "Expected greater value") with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertGt } = import(assertion);\nhandle assertGt(0, 0) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertGt } = import(assertion);\nhandle assertGt(1, 0) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
    ],
    seeAlso: ['assertion.assertLt', 'assertion.assertGte', 'assertion.assertLte'],
    hideOperatorForm: true,
  },
  'assertLt': {
    category: 'assertion',
    description: 'If $a is not less than $b it throws `AssertionError`.',
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
      'let { assertLt } = import(assertion);\nhandle assertLt(1, 0, "Expected smaller value value") with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertLt } = import(assertion);\nhandle assertLt(1, 1) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertLt } = import(assertion);\nhandle assertLt(0, 1) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
    ],
    seeAlso: ['assertion.assertGt', 'assertion.assertLte', 'assertion.assertGte'],
    hideOperatorForm: true,
  },
  'assertGte': {
    category: 'assertion',
    description: 'If $a is less than $b it throws `AssertionError`.',
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
      'let { assertGte } = import(assertion);\nhandle assertGte(0, 1, "Expected greater value") with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertGte } = import(assertion);\nhandle assertGte(0, 1) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertGte } = import(assertion);\nhandle assertGte(1, 1) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
    ],
    seeAlso: ['assertion.assertLte', 'assertion.assertGt', 'assertion.assertLt'],
    hideOperatorForm: true,
  },
  'assertLte': {
    category: 'assertion',
    description: 'If $a is grater than $b it throws `AssertionError`.',
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
      'let { assertLte } = import(assertion);\nhandle assertLte(1, 0, "Expected smaller value value") with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertLte } = import(assertion);\nhandle assertLte(1, 0) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertLte } = import(assertion);\nhandle assertLte(1, 1) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
    ],
    seeAlso: ['assertion.assertGte', 'assertion.assertLt', 'assertion.assertGt'],
    hideOperatorForm: true,
  },
  'assertTrue': {
    category: 'assertion',
    description: 'If $value is not `true` it throws `AssertionError`.',
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
      'let { assertTrue } = import(assertion);\nhandle assertTrue(false, "Expected true") with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertTrue } = import(assertion);\nhandle assertTrue(false) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertTrue } = import(assertion);\nhandle assertTrue(true) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
    ],
    seeAlso: ['assertion.assertFalse', 'assertion.assertTruthy', 'assertion.assertFalsy', 'assert', 'assertion.assertBoolean'],
    hideOperatorForm: true,
  },
  'assertFalse': {
    category: 'assertion',
    description: 'If $value is not `false` it throws `AssertionError`.',
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
      'let { assertFalse } = import(assertion);\nhandle assertFalse(true, "Expected false") with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertFalse } = import(assertion);\nhandle assertFalse(true) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertFalse } = import(assertion);\nhandle assertFalse(false) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
    ],
    seeAlso: ['assertion.assertTrue', 'assertion.assertFalsy', 'assertion.assertTruthy', 'assertion.assertBoolean'],
    hideOperatorForm: true,
  },
  'assertTruthy': {
    category: 'assertion',
    description: 'If $value is not `truthy` it throws `AssertionError`.',
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
      'let { assertTruthy } = import(assertion);\nhandle assertTruthy(false, "Expected truthy") with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertTruthy } = import(assertion);\nhandle assertTruthy(false) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertTruthy } = import(assertion);\nhandle assertTruthy(0) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertTruthy } = import(assertion);\nhandle assertTruthy(null) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertTruthy } = import(assertion);\nhandle assertTruthy("") with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertTruthy } = import(assertion);\nhandle assertTruthy(true) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertTruthy } = import(assertion);\nhandle assertTruthy(1) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertTruthy } = import(assertion);\nhandle assertTruthy("x") with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertTruthy } = import(assertion);\nhandle assertTruthy([]) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertTruthy } = import(assertion);\nhandle assertTruthy(nd) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
    ],
    seeAlso: ['assertion.assertFalsy', 'assertion.assertTrue', 'assertion.assertFalse', 'assert', 'assertion.assertNull'],
    hideOperatorForm: true,
  },
  'assertFalsy': {
    category: 'assertion',
    description: 'If $value is not `falsy` it throws `AssertionError`.',
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
      'let { assertFalsy } = import(assertion);\nhandle assertFalsy(true, "Expected falsy") with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertFalsy } = import(assertion);\nhandle assertFalsy("x") with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertFalsy } = import(assertion);\nhandle assertFalsy([]) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertFalsy } = import(assertion);\nhandle assertFalsy(nd) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertFalsy } = import(assertion);\nhandle assertFalsy(1) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertFalsy } = import(assertion);\nhandle assertFalsy(false) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertFalsy } = import(assertion);\nhandle assertFalsy(0) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertFalsy } = import(assertion);\nhandle assertFalsy(null) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertFalsy } = import(assertion);\nhandle assertFalsy("") with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
    ],
    seeAlso: ['assertion.assertTruthy', 'assertion.assertFalse', 'assertion.assertTrue', 'assertion.assertNull'],
    hideOperatorForm: true,
  },
  'assertNull': {
    category: 'assertion',
    description: 'If $value is not `null` it throws `AssertionError`.',
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
      'let { assertNull } = import(assertion);\nhandle assertNull(null) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertNull } = import(assertion);\nhandle assertNull(true, "Expected null") with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertNull } = import(assertion);\nhandle assertNull("x") with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertNull } = import(assertion);\nhandle assertNull([]) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertNull } = import(assertion);\nhandle assertNull(nd) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertNull } = import(assertion);\nhandle assertNull(1) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertNull } = import(assertion);\nhandle assertNull(false) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertNull } = import(assertion);\nhandle assertNull(0) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertNull } = import(assertion);\nhandle assertNull("") with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
    ],
    seeAlso: ['assertion.assertTruthy', 'assertion.assertFalsy'],
    hideOperatorForm: true,
  },
  'assertFails': {
    category: 'assertion',
    description: 'If $fun does not fail (perform `dvala.error`), it throws `AssertionError`.',
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
      'let { assertFails } = import(assertion);\nassertFails(-> perform(@dvala.error, "Error"))',
      'let { assertFails } = import(assertion);\nhandle assertFails(-> identity("Error")) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
    ],
    seeAlso: ['assertion.assertFailsWith', 'assertion.assertSucceeds'],
    hideOperatorForm: true,
  },
  'assertFailsWith': {
    category: 'assertion',
    description: 'If $fun does not fail with $error-message, it throws `AssertionError`.',
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
      'let { assertFailsWith } = import(assertion);\nhandle assertFailsWith(-> perform(@dvala.error, "Error"), "Error") with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertFailsWith } = import(assertion);\nhandle assertFailsWith(-> identity("Error"), "Error") with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
    ],
    seeAlso: ['assertion.assertFails', 'assertion.assertSucceeds'],
    hideOperatorForm: true,
  },
  'assertSucceeds': {
    category: 'assertion',
    description: 'If $fun fails (performs `dvala.error`), it throws `AssertionError`.',
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
      'let { assertSucceeds } = import(assertion);\nhandle assertSucceeds(-> identity("OK")) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertSucceeds } = import(assertion);\nhandle assertSucceeds(-> perform(@dvala.error, "Error")) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
    ],
    seeAlso: ['assertion.assertFails', 'assertion.assertFailsWith'],
    hideOperatorForm: true,
  },
  'assertArray': {
    category: 'assertion',
    description: 'If $value is not an `array` it throws `AssertionError`.',
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
      'let { assertArray } = import(assertion);\nhandle assertArray([1, 2, 3]) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertArray } = import(assertion);\nhandle assertArray("string") with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertArray } = import(assertion);\nhandle assertArray(42, "Expected an array") with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
    ],
    seeAlso: ['assertion.assertObject', 'assertion.assertCollection', 'assertion.assertSequence'],
    hideOperatorForm: true,
  },
  'assertBoolean': {
    category: 'assertion',
    description: 'If $value is not a `boolean` it throws `AssertionError`.',
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
      'let { assertBoolean } = import(assertion);\nhandle assertBoolean(true) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertBoolean } = import(assertion);\nhandle assertBoolean(false) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertBoolean } = import(assertion);\nhandle assertBoolean(1, "Expected a boolean") with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
    ],
    seeAlso: ['assertion.assertTrue', 'assertion.assertFalse', 'assertion.assertNumber', 'assertion.assertString'],
    hideOperatorForm: true,
  },
  'assertCollection': {
    category: 'assertion',
    description: 'If $value is not a `collection` (array, object, or string) it throws `AssertionError`.',
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
      'let { assertCollection } = import(assertion);\nhandle assertCollection([1, 2]) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertCollection } = import(assertion);\nhandle assertCollection({ a: 1 }) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertCollection } = import(assertion);\nhandle assertCollection("hello") with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertCollection } = import(assertion);\nhandle assertCollection(42, "Expected a collection") with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
    ],
    seeAlso: ['assertion.assertSequence', 'assertion.assertArray', 'assertion.assertObject'],
    hideOperatorForm: true,
  },
  'assertFunction': {
    category: 'assertion',
    description: 'If $value is not a `function` it throws `AssertionError`.',
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
      'let { assertFunction } = import(assertion);\nhandle assertFunction(-> $ + 1) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertFunction } = import(assertion);\nhandle assertFunction(42, "Expected a function") with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
    ],
    seeAlso: ['assertion.assertNumber', 'assertion.assertString'],
    hideOperatorForm: true,
  },
  'assertGrid': {
    category: 'assertion',
    description: 'If $value is not a `grid` it throws `AssertionError`.',
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
      'let { assertGrid } = import(assertion);\nhandle assertGrid([[1, 2], [3, 4]]) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertGrid } = import(assertion);\nhandle assertGrid([1, 2], "Expected a grid") with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
    ],
    seeAlso: ['assertion.assertMatrix', 'assertion.assertVector'],
    hideOperatorForm: true,
  },
  'assertInteger': {
    category: 'assertion',
    description: 'If $value is not an `integer` it throws `AssertionError`.',
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
      'let { assertInteger } = import(assertion);\nhandle assertInteger(42) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertInteger } = import(assertion);\nhandle assertInteger(3.14, "Expected an integer") with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
    ],
    seeAlso: ['assertion.assertNumber'],
    hideOperatorForm: true,
  },
  'assertMatrix': {
    category: 'assertion',
    description: 'If $value is not a `matrix` it throws `AssertionError`.',
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
      'let { assertMatrix } = import(assertion);\nhandle assertMatrix([[1, 2], [3, 4]]) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertMatrix } = import(assertion);\nhandle assertMatrix([1, 2], "Expected a matrix") with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
    ],
    seeAlso: ['assertion.assertVector', 'assertion.assertGrid'],
    hideOperatorForm: true,
  },
  'assertNumber': {
    category: 'assertion',
    description: 'If $value is not a `number` it throws `AssertionError`.',
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
      'let { assertNumber } = import(assertion);\nhandle assertNumber(42) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertNumber } = import(assertion);\nhandle assertNumber("hello", "Expected a number") with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
    ],
    seeAlso: ['assertion.assertInteger', 'assertion.assertBoolean', 'assertion.assertString', 'assertion.assertFunction'],
    hideOperatorForm: true,
  },
  'assertObject': {
    category: 'assertion',
    description: 'If $value is not an `object` it throws `AssertionError`.',
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
      'let { assertObject } = import(assertion);\nhandle assertObject({ a: 1 }) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertObject } = import(assertion);\nhandle assertObject([1, 2], "Expected an object") with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
    ],
    seeAlso: ['assertion.assertArray', 'assertion.assertCollection'],
    hideOperatorForm: true,
  },
  'assertRegexp': {
    category: 'assertion',
    description: 'If $value is not a `regexp` it throws `AssertionError`.',
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
      'let { assertRegexp } = import(assertion);\nhandle assertRegexp(#"^start") with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertRegexp } = import(assertion);\nhandle assertRegexp("hello", "Expected a regexp") with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
    ],
    seeAlso: ['assertion.assertString'],
    hideOperatorForm: true,
  },
  'assertSequence': {
    category: 'assertion',
    description: 'If $value is not a `sequence` (array or string) it throws `AssertionError`.',
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
      'let { assertSequence } = import(assertion);\nhandle assertSequence([1, 2]) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertSequence } = import(assertion);\nhandle assertSequence("hello") with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertSequence } = import(assertion);\nhandle assertSequence({ a: 1 }, "Expected a sequence") with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
    ],
    seeAlso: ['assertion.assertCollection', 'assertion.assertArray'],
    hideOperatorForm: true,
  },
  'assertString': {
    category: 'assertion',
    description: 'If $value is not a `string` it throws `AssertionError`.',
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
      'let { assertString } = import(assertion);\nhandle assertString("hello") with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertString } = import(assertion);\nhandle assertString(42, "Expected a string") with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
    ],
    seeAlso: ['assertion.assertNumber', 'assertion.assertBoolean', 'assertion.assertRegexp', 'assertion.assertFunction'],
    hideOperatorForm: true,
  },
  'assertVector': {
    category: 'assertion',
    description: 'If $value is not a `vector` it throws `AssertionError`.',
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
      'let { assertVector } = import(assertion);\nhandle assertVector([1, 2, 3]) with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
      'let { assertVector } = import(assertion);\nhandle assertVector(["a", "b"], "Expected a vector") with [(arg, eff, nxt) -> if eff == @dvala.error then arg else nxt(eff, arg) end] end',
    ],
    seeAlso: ['assertion.assertMatrix', 'assertion.assertGrid'],
    hideOperatorForm: true,
  },
}
