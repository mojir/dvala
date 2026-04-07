import { snippet } from './dvala'
import type { DatatypeReference } from '.'
import type { DatatypeName } from './api'

export const datatype: Record<DatatypeName, DatatypeReference> = {
  '-type-number': {
    datatype: true,
    title: 'number',
    category: 'datatype',
    description: 'A `number`',
    examples: [
      snippet('42'),
      snippet('3.14'),
    ],
  },
  '-type-string': {
    datatype: true,
    title: 'string',
    category: 'datatype',
    description: 'A `string`. Strings are written with double quotes. Template strings use backticks and support `${...}` interpolation — any expression can appear inside the braces.',
    examples: [
      snippet('"hello"'),
      snippet('""'),
      snippet('`Hello, World!`'),
      snippet('`${2} * ${3} = ${2 * 3}`'),
    ],
  },
  '-type-object': {
    datatype: true,
    title: 'object',
    category: 'datatype',
    description: 'An `object`, a collection of key-value pairs where keys are `strings`',
    examples: [
      snippet('{}'),
      snippet('{ a: 1, b: 2}'),
    ],
  },
  '-type-array': {
    datatype: true,
    title: 'array',
    category: 'datatype',
    description: 'An `array`',
    examples: [
      snippet('[]'),
      snippet('[1, 2, 3]'),
      snippet('["a", null, true]'),
    ],
  },
  '-type-vector': {
    datatype: true,
    title: 'vector',
    category: 'datatype',
    description: 'An `array` of `numbers`',
    examples: [
      snippet('[]'),
      snippet('[1, 2, 3]'),
    ],
  },
  '-type-matrix': {
    datatype: true,
    title: 'matrix',
    category: 'datatype',
    description: 'A `matrix`, a two-dimensional `array` with `numbers` where each row has the same number of columns. A `matrix` is also a `grid`.',
    examples: [
      snippet('[[42]]'),
      snippet('[[1, 2], [3, 4]]'),
      snippet('[[1, 2], [3, 4], [5, 6]]'),
    ],
  },
  '-type-grid': {
    datatype: true,
    title: 'grid',
    category: 'datatype',
    description: 'A `grid`, a two-dimensional `array` where each row has the same number of columns',
    examples: [
      snippet('[[]]'),
      snippet('[[1, 2], [3, 4]]'),
      snippet('[["a", "b"], [3, 4], [5, 6]]'),
    ],
  },
  '-type-boolean': {
    datatype: true,
    title: 'boolean',
    category: 'datatype',
    description: 'A `boolean`',
    examples: [
      snippet('true'),
      snippet('false'),
    ],
  },
  '-type-function': {
    datatype: true,
    title: 'function',
    category: 'datatype',
    description: 'A `function`',
    examples: [
      snippet('x -> x + 1'),
      snippet('(a, b, c) -> (a + b) * c'),
      snippet('() -> 42'),
      snippet('-> $ + $2'),
    ],
  },
  '-type-integer': {
    datatype: true,
    title: 'integer',
    category: 'datatype',
    description: 'An `integer`',
    examples: [
      snippet('42'),
      snippet('-42'),
    ],
  },
  '-type-any': {
    datatype: true,
    title: 'any',
    category: 'datatype',
    description: '`Any` value',
    examples: [
      snippet('42'),
      snippet('"hello"'),
      snippet('true'),
      snippet('null'),
    ],
  },
  '-type-null': {
    datatype: true,
    title: 'null',
    category: 'datatype',
    description: 'The value `null`',
    examples: [
      snippet('null'),
    ],
  },
  '-type-collection': {
    datatype: true,
    title: 'collection',
    category: 'datatype',
    description: 'A collection, an `object`, an `array` or a `string`',
    examples: [
      snippet('{ foo: 42 }'),
      snippet('[1, 2, 3]'),
      snippet('"hello"'),
    ],
  },
  '-type-sequence': {
    datatype: true,
    title: 'sequence',
    category: 'datatype',
    description: 'A sequence, an `array` or a `string`',
    examples: [
      snippet('[1, 2, 3]'),
      snippet('"hello"'),
    ],
  },
  '-type-regexp': {
    datatype: true,
    title: 'regexp',
    category: 'datatype',
    description: 'A regular expression',
    examples: [
      snippet('regexp("^\\\\s*(.*)$")'),
      snippet('#"^\\s*(.*)$"'),
      snippet('#"albert"ig'),
    ],
  },
  '-type-effect': {
    datatype: true,
    title: 'effect',
    category: 'datatype',
    description: 'An effect, created with the `effect` special expression. Effects are used with `perform` to trigger algebraic effects.',
    examples: [
      snippet('@dvala.io.print'),
      snippet('@dvala.time.now'),
    ],
  },
  '-type-never': {
    datatype: true,
    title: 'never',
    category: 'datatype',
    description: 'A value that can never be created',
    examples: [`
// perform(@dvala.error, { message: "error" }) will never return a value
do with handler @dvala.error(arg) -> resume("never") end; perform(@dvala.error, { message: "error" }) end`],
  },
}
