import type { FunctionDocs } from '../../interface'

export const moduleDocs: Record<string, FunctionDocs> = {
  'assert!=': {
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
      'let { assert!= } = import(assertion);\ndo assert!=(0, 0, "Expected different values") with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert!= } = import(assertion);\ndo assert!=(0, 0) with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert!= } = import(assertion);\ndo 0 assert!= 0 with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert!= } = import(assertion);\ndo assert!=(0, 1) with case effect(dvala.error) then ([msg]) -> msg end',
    ],
    seeAlso: ['assertion.assert='],
    hideOperatorForm: true,
  },
  'assert=': {
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
      'let { assert= } = import(assertion);\ndo assert=({ "a": 1 }, { "a": 2 }, "Expected equal values") with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert= } = import(assertion);\ndo assert=({ "a": 1 }, { "a": 2 }) with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert= } = import(assertion);\ndo assert=({ "a": 1 }, { "a": 1 }) with case effect(dvala.error) then ([msg]) -> msg end',
    ],
    seeAlso: ['assertion.assert!='],
    hideOperatorForm: true,
  },
  'assert-gt': {
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
      'let { assert-gt } = import(assertion);\ndo assert-gt(0, 1, "Expected greater value") with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-gt } = import(assertion);\ndo assert-gt(0, 0) with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-gt } = import(assertion);\ndo assert-gt(1, 0) with case effect(dvala.error) then ([msg]) -> msg end',
    ],
    seeAlso: ['assertion.assert-lt', 'assertion.assert-gte', 'assertion.assert-lte'],
    hideOperatorForm: true,
  },
  'assert-lt': {
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
      'let { assert-lt } = import(assertion);\ndo assert-lt(1, 0, "Expected smaller value value") with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-lt } = import(assertion);\ndo assert-lt(1, 1) with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-lt } = import(assertion);\ndo assert-lt(0, 1) with case effect(dvala.error) then ([msg]) -> msg end',
    ],
    seeAlso: ['assertion.assert-gt', 'assertion.assert-lte', 'assertion.assert-gte'],
    hideOperatorForm: true,
  },
  'assert-gte': {
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
      'let { assert-gte } = import(assertion);\ndo assert-gte(0, 1, "Expected greater value") with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-gte } = import(assertion);\ndo assert-gte(0, 1) with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-gte } = import(assertion);\ndo assert-gte(1, 1) with case effect(dvala.error) then ([msg]) -> msg end',
    ],
    seeAlso: ['assertion.assert-lte', 'assertion.assert-gt', 'assertion.assert-lt'],
    hideOperatorForm: true,
  },
  'assert-lte': {
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
      'let { assert-lte } = import(assertion);\ndo assert-lte(1, 0, "Expected smaller value value") with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-lte } = import(assertion);\ndo assert-lte(1, 0) with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-lte } = import(assertion);\ndo assert-lte(1, 1) with case effect(dvala.error) then ([msg]) -> msg end',
    ],
    seeAlso: ['assertion.assert-gte', 'assertion.assert-lt', 'assertion.assert-gt'],
    hideOperatorForm: true,
  },
  'assert-true': {
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
      'let { assert-true } = import(assertion);\ndo assert-true(false, "Expected true") with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-true } = import(assertion);\ndo assert-true(false) with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-true } = import(assertion);\ndo assert-true(true) with case effect(dvala.error) then ([msg]) -> msg end',
    ],
    seeAlso: ['assertion.assert-false', 'assertion.assert-truthy', 'assertion.assert-falsy', 'assert', 'assertion.assert-boolean'],
    hideOperatorForm: true,
  },
  'assert-false': {
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
      'let { assert-false } = import(assertion);\ndo assert-false(true, "Expected false") with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-false } = import(assertion);\ndo assert-false(true) with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-false } = import(assertion);\ndo assert-false(false) with case effect(dvala.error) then ([msg]) -> msg end',
    ],
    seeAlso: ['assertion.assert-true', 'assertion.assert-falsy', 'assertion.assert-truthy', 'assertion.assert-boolean'],
    hideOperatorForm: true,
  },
  'assert-truthy': {
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
      'let { assert-truthy } = import(assertion);\ndo assert-truthy(false, "Expected truthy") with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-truthy } = import(assertion);\ndo assert-truthy(false) with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-truthy } = import(assertion);\ndo assert-truthy(0) with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-truthy } = import(assertion);\ndo assert-truthy(null) with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-truthy } = import(assertion);\ndo assert-truthy("") with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-truthy } = import(assertion);\ndo assert-truthy(true) with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-truthy } = import(assertion);\ndo assert-truthy(1) with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-truthy } = import(assertion);\ndo assert-truthy("x") with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-truthy } = import(assertion);\ndo assert-truthy([]) with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-truthy } = import(assertion);\ndo assert-truthy(nd) with case effect(dvala.error) then ([msg]) -> msg end',
    ],
    seeAlso: ['assertion.assert-falsy', 'assertion.assert-true', 'assertion.assert-false', 'assert', 'assertion.assert-null'],
    hideOperatorForm: true,
  },
  'assert-falsy': {
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
      'let { assert-falsy } = import(assertion);\ndo assert-falsy(true, "Expected falsy") with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-falsy } = import(assertion);\ndo assert-falsy("x") with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-falsy } = import(assertion);\ndo assert-falsy([]) with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-falsy } = import(assertion);\ndo assert-falsy(nd) with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-falsy } = import(assertion);\ndo assert-falsy(1) with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-falsy } = import(assertion);\ndo assert-falsy(false) with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-falsy } = import(assertion);\ndo assert-falsy(0) with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-falsy } = import(assertion);\ndo assert-falsy(null) with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-falsy } = import(assertion);\ndo assert-falsy("") with case effect(dvala.error) then ([msg]) -> msg end',
    ],
    seeAlso: ['assertion.assert-truthy', 'assertion.assert-false', 'assertion.assert-true', 'assertion.assert-null'],
    hideOperatorForm: true,
  },
  'assert-null': {
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
      'let { assert-null } = import(assertion);\ndo assert-null(null) with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-null } = import(assertion);\ndo assert-null(true, "Expected null") with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-null } = import(assertion);\ndo assert-null("x") with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-null } = import(assertion);\ndo assert-null([]) with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-null } = import(assertion);\ndo assert-null(nd) with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-null } = import(assertion);\ndo assert-null(1) with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-null } = import(assertion);\ndo assert-null(false) with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-null } = import(assertion);\ndo assert-null(0) with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-null } = import(assertion);\ndo assert-null("") with case effect(dvala.error) then ([msg]) -> msg end',
    ],
    seeAlso: ['assertion.assert-truthy', 'assertion.assert-falsy'],
    hideOperatorForm: true,
  },
  'assert-throws': {
    category: 'assertion',
    description: 'If $fun does not throw, it throws `AssertionError`.',
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
      'let { assert-throws } = import(assertion);\nassert-throws(-> throw("Error"))',
      'let { assert-throws } = import(assertion);\ndo assert-throws(-> identity("Error")) with case effect(dvala.error) then ([msg]) -> msg end',
    ],
    seeAlso: ['assertion.assert-throws-error', 'assertion.assert-not-throws'],
    hideOperatorForm: true,
  },
  'assert-throws-error': {
    category: 'assertion',
    description: 'If $fun does not throw $error-message, it throws `AssertionError`.',
    returns: {
      type: 'null',
    },
    args: {
      'fun': {
        type: 'function',
      },
      'error-message': {
        type: 'string',
      },
      'message': {
        type: 'string',
      },
    },
    variants: [
      {
        argumentNames: [
          'value',
          'error-message',
        ],
      },
      {
        argumentNames: [
          'value',
          'error-message',
          'message',
        ],
      },
    ],
    examples: [
      'let { assert-throws-error } = import(assertion);\ndo assert-throws-error(-> throw("Error"), "Error") with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-throws-error } = import(assertion);\ndo assert-throws-error(-> identity("Error"), "Error") with case effect(dvala.error) then ([msg]) -> msg end',
    ],
    seeAlso: ['assertion.assert-throws', 'assertion.assert-not-throws'],
    hideOperatorForm: true,
  },
  'assert-not-throws': {
    category: 'assertion',
    description: 'If $fun throws, it throws `AssertionError`.',
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
      'let { assert-not-throws } = import(assertion);\ndo assert-not-throws(-> identity("Error")) with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-not-throws } = import(assertion);\ndo assert-not-throws(-> throw("Error")) with case effect(dvala.error) then ([msg]) -> msg end',
    ],
    seeAlso: ['assertion.assert-throws', 'assertion.assert-throws-error'],
    hideOperatorForm: true,
  },
  'assert-array': {
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
      'let { assert-array } = import(assertion);\ndo assert-array([1, 2, 3]) with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-array } = import(assertion);\ndo assert-array("string") with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-array } = import(assertion);\ndo assert-array(42, "Expected an array") with case effect(dvala.error) then ([msg]) -> msg end',
    ],
    seeAlso: ['assertion.assert-object', 'assertion.assert-collection', 'assertion.assert-sequence'],
    hideOperatorForm: true,
  },
  'assert-boolean': {
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
      'let { assert-boolean } = import(assertion);\ndo assert-boolean(true) with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-boolean } = import(assertion);\ndo assert-boolean(false) with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-boolean } = import(assertion);\ndo assert-boolean(1, "Expected a boolean") with case effect(dvala.error) then ([msg]) -> msg end',
    ],
    seeAlso: ['assertion.assert-true', 'assertion.assert-false', 'assertion.assert-number', 'assertion.assert-string'],
    hideOperatorForm: true,
  },
  'assert-collection': {
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
      'let { assert-collection } = import(assertion);\ndo assert-collection([1, 2]) with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-collection } = import(assertion);\ndo assert-collection({ a: 1 }) with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-collection } = import(assertion);\ndo assert-collection("hello") with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-collection } = import(assertion);\ndo assert-collection(42, "Expected a collection") with case effect(dvala.error) then ([msg]) -> msg end',
    ],
    seeAlso: ['assertion.assert-sequence', 'assertion.assert-array', 'assertion.assert-object'],
    hideOperatorForm: true,
  },
  'assert-function': {
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
      'let { assert-function } = import(assertion);\ndo assert-function(-> $ + 1) with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-function } = import(assertion);\ndo assert-function(42, "Expected a function") with case effect(dvala.error) then ([msg]) -> msg end',
    ],
    seeAlso: ['assertion.assert-number', 'assertion.assert-string'],
    hideOperatorForm: true,
  },
  'assert-grid': {
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
      'let { assert-grid } = import(assertion);\ndo assert-grid([[1, 2], [3, 4]]) with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-grid } = import(assertion);\ndo assert-grid([1, 2], "Expected a grid") with case effect(dvala.error) then ([msg]) -> msg end',
    ],
    seeAlso: ['assertion.assert-matrix', 'assertion.assert-vector'],
    hideOperatorForm: true,
  },
  'assert-integer': {
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
      'let { assert-integer } = import(assertion);\ndo assert-integer(42) with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-integer } = import(assertion);\ndo assert-integer(3.14, "Expected an integer") with case effect(dvala.error) then ([msg]) -> msg end',
    ],
    seeAlso: ['assertion.assert-number'],
    hideOperatorForm: true,
  },
  'assert-matrix': {
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
      'let { assert-matrix } = import(assertion);\ndo assert-matrix([[1, 2], [3, 4]]) with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-matrix } = import(assertion);\ndo assert-matrix([1, 2], "Expected a matrix") with case effect(dvala.error) then ([msg]) -> msg end',
    ],
    seeAlso: ['assertion.assert-vector', 'assertion.assert-grid'],
    hideOperatorForm: true,
  },
  'assert-number': {
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
      'let { assert-number } = import(assertion);\ndo assert-number(42) with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-number } = import(assertion);\ndo assert-number("hello", "Expected a number") with case effect(dvala.error) then ([msg]) -> msg end',
    ],
    seeAlso: ['assertion.assert-integer', 'assertion.assert-boolean', 'assertion.assert-string', 'assertion.assert-function'],
    hideOperatorForm: true,
  },
  'assert-object': {
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
      'let { assert-object } = import(assertion);\ndo assert-object({ a: 1 }) with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-object } = import(assertion);\ndo assert-object([1, 2], "Expected an object") with case effect(dvala.error) then ([msg]) -> msg end',
    ],
    seeAlso: ['assertion.assert-array', 'assertion.assert-collection'],
    hideOperatorForm: true,
  },
  'assert-regexp': {
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
      'let { assert-regexp } = import(assertion);\ndo assert-regexp(#"^start") with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-regexp } = import(assertion);\ndo assert-regexp("hello", "Expected a regexp") with case effect(dvala.error) then ([msg]) -> msg end',
    ],
    seeAlso: ['assertion.assert-string'],
    hideOperatorForm: true,
  },
  'assert-sequence': {
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
      'let { assert-sequence } = import(assertion);\ndo assert-sequence([1, 2]) with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-sequence } = import(assertion);\ndo assert-sequence("hello") with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-sequence } = import(assertion);\ndo assert-sequence({ a: 1 }, "Expected a sequence") with case effect(dvala.error) then ([msg]) -> msg end',
    ],
    seeAlso: ['assertion.assert-collection', 'assertion.assert-array'],
    hideOperatorForm: true,
  },
  'assert-string': {
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
      'let { assert-string } = import(assertion);\ndo assert-string("hello") with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-string } = import(assertion);\ndo assert-string(42, "Expected a string") with case effect(dvala.error) then ([msg]) -> msg end',
    ],
    seeAlso: ['assertion.assert-number', 'assertion.assert-boolean', 'assertion.assert-regexp', 'assertion.assert-function'],
    hideOperatorForm: true,
  },
  'assert-vector': {
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
      'let { assert-vector } = import(assertion);\ndo assert-vector([1, 2, 3]) with case effect(dvala.error) then ([msg]) -> msg end',
      'let { assert-vector } = import(assertion);\ndo assert-vector(["a", "b"], "Expected a vector") with case effect(dvala.error) then ([msg]) -> msg end',
    ],
    seeAlso: ['assertion.assert-matrix', 'assertion.assert-grid'],
    hideOperatorForm: true,
  },
}
