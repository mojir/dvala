import type { Any, Arr, Seq } from '../../interface'
import { assertCharArray } from '../../typeGuards/array'
import { asAny, assertAny, assertSeq } from '../../typeGuards/dvala'
import { assertNumber } from '../../typeGuards/number'
import { assertString } from '../../typeGuards/string'
import { deepEqual, toAny } from '../../utils'
import { toFixedArity } from '../../utils/arity'
import { isPersistentVector, PersistentVector } from '../../utils/persistent'
import type { BuiltinNormalExpressions } from '../interface'

export const sequenceNormalExpression: BuiltinNormalExpressions = {
  'nth': {
    evaluate: (params, sourceCodeInfo): Any => {
      const [seq, i] = params
      const defaultValue = toAny(params.get(2))

      assertNumber(i, sourceCodeInfo, { integer: true })

      if (seq === null)
        return defaultValue

      assertSeq(seq, sourceCodeInfo)
      if (typeof seq === 'string') {
        if (i >= 0 && i < seq.length)
          return toAny(seq[i])
        return defaultValue
      }
      if (i >= 0 && i < seq.size) {
        const result = toAny(seq.get(i))
        return result
      } else {
        return defaultValue
      }
    },
    arity: { min: 2, max: 3 },
    docs: {
      type: '((String | Unknown[] | Null, Number) -> Unknown) & ((String | Unknown[] | Null, Number, Unknown) -> Unknown)',
      category: 'sequence',
      returns: { type: 'any' },
      args: {
        'a': { type: 'sequence' },
        'b': { type: 'integer' },
        'seq': { type: ['sequence', 'null'] },
        'n': { type: 'integer' },
        'notFound': { type: 'any' },
      },
      variants: [
        { argumentNames: ['seq', 'n'] },
        { argumentNames: ['seq', 'n', 'notFound'] },
      ],
      description: 'Accesses element `n` of `seq`. Accessing out-of-bounds indices returns `not-found`, if present, else `null`.',
      seeAlso: ['first', 'second', 'last', 'get', 'slice'],
      examples: [
        '[1, 2, 3] nth 1',
        '"A string" nth 3',
        'nth([1, 2, 3], 1)',
        'nth([1, 2, 3], 3)',
        'nth([1, 2, 3], -1)',
        'nth([1, 2, 3], 3, 99)',
        'nth("A string", 1)',
        'nth("A string", 3)',
        'nth("A string", -3)',
        'nth("A string", 30, "X")',
        'nth(null, 1)',
        'nth(null, 1, "Default value")',
      ],
    },
  },
  'first': {
    evaluate: ([array], sourceCodeInfo): Any => {
      if (array === null)
        return null

      assertSeq(array, sourceCodeInfo)
      if (typeof array === 'string')
        return toAny(array[0])

      return toAny(array.get(0))
    },
    arity: toFixedArity(1),
    docs: {
      type: '(String | Unknown[] | Null) -> Unknown',
      category: 'sequence',
      returns: { type: 'any' },
      args: { seq: { type: ['sequence', 'null'] } },
      variants: [{ argumentNames: ['seq'] }],
      description: 'Returns the first element of `seq`. If `seq` is empty or `null`, `null` is returned.',
      seeAlso: ['second', 'last', 'nth', 'rest', 'next'],
      examples: [
        'first(["Albert", "Mojir", 160, [1, 2]])',
        'first([])',
        'first(null)',
      ],
    },
  },
  'last': {
    evaluate: ([array], sourceCodeInfo): Any => {
      if (array === null)
        return null

      assertSeq(array, sourceCodeInfo)
      if (typeof array === 'string')
        return toAny(array.length > 0 ? array[array.length - 1] : undefined)

      return toAny(array.get(array.size - 1))
    },
    arity: toFixedArity(1),
    docs: {
      type: '(String | Unknown[] | Null) -> Unknown',
      category: 'sequence',
      returns: { type: 'any' },
      args: { seq: { type: ['sequence', 'null'] } },
      variants: [{ argumentNames: ['seq'] }],
      description: 'Returns the last element of `seq`. If `seq` is empty, `null` is returned.',
      seeAlso: ['first', 'second', 'nth', 'pop'],
      examples: [
        'last(["Albert", "Mojir", 160, [1, 2]])',
        'last([1, 2])',
        'last([1])',
        'last([])',
        'last(null)',
      ],
    },
  },
  'pop': {
    evaluate: ([seq], sourceCodeInfo): Seq => {
      assertSeq(seq, sourceCodeInfo)
      if (typeof seq === 'string') {
        return seq.substring(0, seq.length - 1)
      }

      return PersistentVector.from([...seq].slice(0, seq.size - 1))
    },
    arity: toFixedArity(1),
    docs: {
      type: '(String | Unknown[]) -> String | Unknown[]',
      category: 'sequence',
      returns: { type: ['sequence', 'null'], rest: true },
      args: { seq: { type: 'sequence' } },
      variants: [{ argumentNames: ['seq'] }],
      description: 'Returns a copy of `seq` with last element removed. If `seq` is empty `null` is returned.',
      seeAlso: ['push', 'last'],
      examples: [
        'pop([1, 2, 3])',
        'pop([])',
      ],
    },
  },
  'indexOf': {
    evaluate: ([seq, value], sourceCodeInfo): number | null => {
      assertAny(value, sourceCodeInfo)
      if (seq === null)
        return null

      assertSeq(seq, sourceCodeInfo)
      if (typeof seq === 'string') {
        assertString(value, sourceCodeInfo)
        const index = seq.indexOf(value)
        return index !== -1 ? index : null
      } else {
        const index = [...seq].findIndex(item => deepEqual(asAny(item, sourceCodeInfo), value))
        return index !== -1 ? index : null
      }
    },
    arity: toFixedArity(2),
    docs: {
      type: '(String | Unknown[] | Null, Unknown) -> Number | Null',
      category: 'sequence',
      returns: { type: ['number', 'null'] },
      args: {
        a: { type: 'sequence' },
        b: { type: 'any' },
        seq: { type: ['sequence', 'null'] },
        x: { type: 'any' },
      },
      variants: [{ argumentNames: ['seq', 'x'] }],
      description: 'Returns the index of `x` in `seq`. If element is not present in `seq` `null` is returned.',
      seeAlso: ['sequence.lastIndexOf', 'sequence.position', 'contains'],
      examples: [
        '[[1], [2], [1], [2]] indexOf [1]',
        'indexOf(["Albert", "Mojir", 160, [1, 2]], "Mojir")',
        'indexOf([5, 10, 15, 20], 15)',
        'indexOf([5, 10, 15, 20], 1)',
        'indexOf(null, 1)',
      ],
    },
  },
  'push': {
    evaluate: ([seq, ...values], sourceCodeInfo): Seq => {
      assertSeq(seq, sourceCodeInfo)
      if (typeof seq === 'string') {
        // values is a plain JS array here (rest parameter from destructuring Arr)
        assertCharArray(PersistentVector.from(values), sourceCodeInfo)
        return [seq, ...values].join('')
      } else {
        // Append each value to the persistent vector
        let result: Arr = seq
        for (const v of values) result = result.append(v)
        return result
      }
    },
    arity: { min: 2 },
    docs: {
      type: '(String | Unknown[], ...Unknown[]) -> String | Unknown[]',
      category: 'sequence',
      returns: { type: 'sequence' },
      args: {
        a: { type: 'sequence' },
        b: { type: 'any' },
        seq: { type: 'sequence' },
        values: { type: 'any', rest: true, description: 'At least one.' },
      },
      variants: [{ argumentNames: ['seq', 'values'] }],
      description: 'Returns copy of `seq` with `values` added to the end of it.',
      seeAlso: ['sequence.unshift', 'pop', '++'],
      examples: [
        '[1, 2, 3] push 4',
        '"Albert" push "!"',
        'push([1, 2, 3], 4)',
        'push([1, 2, 3], 4, 5, 6)',
        `
let l = [1, 2, 3];
push(l, 4);
l`,
      ],
    },
  },
  'rest': {
    evaluate: ([seq], sourceCodeInfo): Arr | string => {
      assertSeq(seq, sourceCodeInfo)
      if (isPersistentVector(seq)) {
        if (seq.size <= 1)
          return PersistentVector.empty()

        return PersistentVector.from([...seq].slice(1))
      }
      return seq.substring(1)
    },
    arity: toFixedArity(1),
    docs: {
      type: '(String | Unknown[]) -> String | Unknown[]',
      category: 'sequence',
      returns: { type: ['sequence', 'null'] },
      args: { seq: { type: 'sequence' } },
      variants: [{ argumentNames: ['seq'] }],
      description: `If \`seq\` is an array, returns a new array with all but the first element from \`seq\`.
If \`seq\` has less than two elements, an empty array is returned.
For string \`seq\` returns all but the first characters in \`seq\`.`,
      seeAlso: ['next', 'first'],
      examples: [
        'rest(["Albert", "Mojir", 160, [1, 2]])',
        'rest(["Albert"])',
        'rest([])',
        'rest("Albert")',
        'rest("A",)',
        'rest("")',
      ],
    },
  },
  'next': {
    evaluate: ([seq], sourceCodeInfo): Arr | string | null => {
      assertSeq(seq, sourceCodeInfo)
      if (isPersistentVector(seq)) {
        if (seq.size <= 1)
          return null

        return PersistentVector.from([...seq].slice(1))
      }
      if (seq.length <= 1)
        return null

      return seq.substring(1)
    },
    arity: toFixedArity(1),
    docs: {
      type: '(String | Unknown[]) -> String | Unknown[] | Null',
      category: 'sequence',
      returns: { type: ['sequence', 'null'] },
      args: { seq: { type: 'sequence' } },
      variants: [{ argumentNames: ['seq'] }],
      description: 'If `seq` is an array, returns a new array with all but the first element from `seq`. If `seq` has less than two elements, `null` is returned. For string `seq` returns all but the first characters in `seq`. If length of string `seq` is less than two, `null` is returned.',
      seeAlso: ['rest', 'first'],
      examples: [
        'next(["Albert", "Mojir", 160, [1, 2]])',
        'next(["Albert"])',
        'next([])',
        'next("Albert")',
        'next("A",)',
        'next("")',
      ],
    },
  },
  'reverse': {
    evaluate: ([seq], sourceCodeInfo): Any => {
      if (seq === null)
        return null

      assertSeq(seq, sourceCodeInfo)
      if (isPersistentVector(seq)) {
        return PersistentVector.from([...seq].reverse())
      }

      return seq.split('').reverse().join('')
    },
    arity: toFixedArity(1),
    docs: {
      type: '(String | Unknown[] | Null) -> String | Unknown[] | Null',
      category: 'sequence',
      returns: { type: ['sequence', 'null'] },
      args: { seq: { type: ['sequence', 'null'] } },
      variants: [{ argumentNames: ['seq'] }],
      description: 'If `seq` is an array, creates a new array with the elements from `seq` in reversed order. If `seq` is a string, returns new reversed string.',
      seeAlso: ['sort'],
      examples: [
        'reverse(["Albert", "Mojir", 160, [1, 2]])',
        'reverse([])',
        'reverse("Albert")',
        'reverse(null)',
      ],
    },
  },
  'second': {
    evaluate: ([seq], sourceCodeInfo): Any => {
      if (seq === null)
        return null

      assertSeq(seq, sourceCodeInfo)
      if (typeof seq === 'string')
        return toAny(seq[1])

      return toAny(seq.get(1))
    },
    arity: toFixedArity(1),
    docs: {
      type: '(String | Unknown[] | Null) -> Unknown',
      category: 'sequence',
      returns: { type: 'any' },
      args: { seq: { type: ['sequence', 'null'] } },
      variants: [{ argumentNames: ['seq'] }],
      description: 'Returns the second element of `seq`. If `seq` has less than two elements or is `null`, `null` is returned.',
      seeAlso: ['first', 'last', 'nth'],
      examples: [
        'second(["Albert", "Mojir", 160, [1, 2]])',
        'second([1])',
        'second([])',
        'second(null)',
      ],
    },
  },
  'slice': {
    evaluate: (params, sourceCodeInfo): Any => {
      const [seq, from, to] = params
      assertSeq(seq, sourceCodeInfo)
      assertNumber(from, sourceCodeInfo, { integer: true })

      if (params.size === 2) {
        if (isPersistentVector(seq)) {
          return PersistentVector.from([...seq].slice(from))
        }
        return seq.slice(from)
      }

      assertNumber(to, sourceCodeInfo, { integer: true })
      if (isPersistentVector(seq)) {
        return PersistentVector.from([...seq].slice(from, to))
      }
      return seq.slice(from, to)
    },
    arity: { min: 2, max: 3 },
    docs: {
      type: '((String | Unknown[], Number) -> String | Unknown[]) & ((String | Unknown[], Number, Number) -> String | Unknown[])',
      category: 'sequence',
      returns: { type: 'sequence' },
      args: {
        a: { type: 'sequence' },
        b: { type: 'integer' },
        seq: { type: 'sequence' },
        start: { type: 'integer', description: 'Defaults to `0`.' },
        stop: { type: 'integer', description: 'Defaults to length of sequence + 1.' },
      },
      variants: [
        { argumentNames: ['seq', 'start'] },
        { argumentNames: ['seq', 'start', 'stop'] },
      ],
      description: 'Returns a copy of a portion of `seq` from index `start` (inclusive) to `stop` (exclusive).',
      seeAlso: ['take', 'drop', 'sequence.splice', 'nth'],
      examples: [
        '[1, 2, 3, 4, 5] slice 2',
        'slice([1, 2, 3, 4, 5], 2, 4)',
        'slice([1, 2, 3, 4, 5], 2)',
      ],
    },
  },
  'some': {
    evaluate: () => { throw new Error('some is implemented in Dvala') },
    arity: toFixedArity(2),
    docs: {
      type: '(String | Unknown[] | Null, (Unknown) -> Boolean) -> Unknown',
      category: 'sequence',
      returns: { type: 'any' },
      args: {
        a: { type: 'sequence' },
        b: { type: 'function' },
        seq: { type: ['sequence', 'null'] },
        fun: { type: 'function' },
      },
      variants: [{ argumentNames: ['seq', 'fun'] }],
      description: 'Returns the first element that passes the test implemented by `fun`. I no element was found, `null` is returned.',
      seeAlso: ['sequence.position', 'collection.isAny', 'find'],
      examples: [
        `
some(
  ["Albert", "Mojir", 160, [1, 2]],
  isString
)`,
        `
some(
  [5, 10, 15, 20],
  -> $ > 10
)`,
        `
some(
  [1, 2, 3, 4],
  -> $ > 10
)`,
        `
some(
  [],
  -> $ > 10
)`,
        `
some(
  null,
  -> $ > 10
)`,
      ],
    },
  },
  'sort': {
    evaluate: () => { throw new Error('sort is implemented in Dvala') },
    arity: { min: 1, max: 2 },
    docs: {
      type: '((Unknown[]) -> Unknown[]) & ((Unknown[], (Unknown, Unknown) -> Number) -> Unknown[])',
      category: 'sequence',
      returns: { type: 'any', rest: true },
      args: {
        a: { type: 'sequence' },
        b: { type: 'function' },
        seq: { type: 'sequence' },
        fun: { type: 'function' },
      },
      variants: [
        { argumentNames: ['seq'] },
        { argumentNames: ['seq', 'fun'] },
      ],
      description: 'Returns a new sequence with the elements from `seq` sorted according to `fun`. If no `fun` is supplied, builtin `compare` will be used.',
      seeAlso: ['sequence.sortBy', 'compare', 'reverse', 'vector.sortIndices'],
      examples: [
        '[3, 1, 2] sort (a, b) -> b - a',
        'sort([3, 1, 2])',
        `
sort(
  [3, 1, 2],
  (a, b) -> if a < b then -1 else if a > b then 1 else -1 end
)`,
        `
sort(
  [3, 1, 2],
  (a, b) -> if a > b then -1 else if a < b then 1 else -1 end
)`,
      ],
    },
  },
  'take': {
    evaluate: ([input, n], sourceCodeInfo): Seq => {
      assertNumber(n, sourceCodeInfo)
      assertSeq(input, sourceCodeInfo)
      const num = Math.max(Math.ceil(n), 0)
      if (isPersistentVector(input))
        return PersistentVector.from([...input].slice(0, num))

      return input.slice(0, num)
    },
    arity: toFixedArity(2),
    docs: {
      type: '(String | Unknown[], Number) -> String | Unknown[]',
      category: 'sequence',
      returns: { type: 'sequence' },
      args: {
        a: { type: 'sequence' },
        b: { type: 'integer' },
        n: { type: 'integer' },
        seq: { type: 'sequence' },
      },
      variants: [{ argumentNames: ['seq', 'n'] }],
      description: 'Constructs a new array/string with the `n` first elements from `seq`.',
      seeAlso: ['takeLast', 'takeWhile', 'drop', 'slice', 'sequence.splitAt'],
      examples: [
        'take([1, 2, 3, 4, 5], 3)',
        '[1, 2, 3, 4, 5] take 3',
        'take([1, 2, 3, 4, 5], 0)',
        'take("Albert", 2)',
        'take("Albert", 50)',
      ],
    },
  },
  'takeLast': {
    evaluate: ([array, n], sourceCodeInfo): Seq => {
      assertSeq(array, sourceCodeInfo)
      assertNumber(n, sourceCodeInfo)
      const num = Math.max(Math.ceil(n), 0)
      if (isPersistentVector(array)) {
        const from = array.size - num
        return PersistentVector.from([...array].slice(from))
      }
      const from = array.length - num
      return array.slice(from)
    },
    arity: toFixedArity(2),
    docs: {
      type: '(String | Unknown[], Number) -> String | Unknown[]',
      category: 'sequence',
      returns: { type: 'sequence' },
      args: {
        a: { type: 'sequence' },
        b: { type: 'integer' },
        n: { type: 'integer' },
        seq: { type: 'sequence' },
      },
      variants: [{ argumentNames: ['seq', 'n'] }],
      description: 'Constructs a new array with the `n` last elements from `seq`.',
      seeAlso: ['take', 'dropLast'],
      examples: [
        'takeLast([1, 2, 3, 4, 5], 3)',
        '[1, 2, 3, 4, 5] takeLast 3',
        'takeLast([1, 2, 3, 4, 5], 0)',
      ],
    },
  },
  'drop': {
    evaluate: ([input, n], sourceCodeInfo): Seq => {
      assertNumber(n, sourceCodeInfo)
      const num = Math.max(Math.ceil(n), 0)
      assertSeq(input, sourceCodeInfo)
      if (isPersistentVector(input))
        return PersistentVector.from([...input].slice(num))

      return input.slice(num)
    },
    arity: toFixedArity(2),
    docs: {
      type: '(String | Unknown[], Number) -> String | Unknown[]',
      category: 'sequence',
      returns: { type: 'sequence' },
      args: {
        a: { type: 'sequence' },
        b: { type: 'integer' },
        seq: { type: 'sequence' },
        n: { type: 'integer' },
      },
      variants: [{ argumentNames: ['seq', 'n'] }],
      description: 'Constructs a new array/string with the `n` first elements dropped from `seq`.',
      seeAlso: ['dropLast', 'dropWhile', 'take', 'slice', 'sequence.splitAt'],
      examples: [
        'drop([1, 2, 3, 4, 5], 3)',
        '[1, 2, 3, 4, 5] drop 0',
        'drop("Albert", 2)',
        'drop("Albert", 50)',
      ],
    },
  },
  'dropLast': {
    evaluate: ([array, n], sourceCodeInfo): Seq => {
      assertSeq(array, sourceCodeInfo)
      assertNumber(n, sourceCodeInfo)
      const num = Math.max(Math.ceil(n), 0)
      if (isPersistentVector(array)) {
        const from = array.size - num
        return PersistentVector.from([...array].slice(0, from))
      }
      const from = array.length - num
      return array.slice(0, from)
    },
    arity: toFixedArity(2),
    docs: {
      type: '(String | Unknown[], Number) -> String | Unknown[]',
      category: 'sequence',
      returns: { type: 'sequence' },
      args: {
        a: { type: 'sequence' },
        b: { type: 'integer' },
        seq: { type: 'sequence' },
        n: { type: 'integer' },
      },
      variants: [{ argumentNames: ['seq', 'n'] }],
      description: 'Constructs a new array with the `n` last elements dropped from `seq`.',
      seeAlso: ['drop', 'takeLast'],
      examples: [
        'dropLast([1, 2, 3, 4, 5], 3)',
        '[1, 2, 3, 4, 5] dropLast 3',
        'dropLast([1, 2, 3, 4, 5], 0)',
      ],
    },
  },
  'takeWhile': {
    evaluate: () => { throw new Error('takeWhile is implemented in Dvala') },
    arity: toFixedArity(2),
    docs: {
      type: '(String | Unknown[], (Unknown) -> Boolean) -> String | Unknown[]',
      category: 'sequence',
      returns: { type: 'sequence' },
      args: {
        a: { type: 'sequence' },
        b: { type: 'function' },
        seq: { type: 'sequence' },
        fun: { type: 'function' },
      },
      variants: [{ argumentNames: ['seq', 'fun'] }],
      description: 'Returns the members of `seq` in order, stopping before the first one for which `predicate` returns a falsy value.',
      seeAlso: ['take', 'dropWhile', 'sequence.splitWith'],
      examples: [
        `takeWhile(
  [1, 2, 3, 2, 1],
  -> $ < 3
)`,
        `takeWhile(
  [1, 2, 3, 2, 1],
  -> $ > 3
)`,
      ],
    },
  },
  'dropWhile': {
    evaluate: () => { throw new Error('dropWhile is implemented in Dvala') },
    arity: toFixedArity(2),
    docs: {
      type: '(String | Unknown[], (Unknown) -> Boolean) -> String | Unknown[]',
      category: 'sequence',
      returns: { type: 'sequence' },
      args: {
        a: { type: 'sequence' },
        b: { type: 'function' },
        seq: { type: 'sequence' },
        fun: { type: 'function' },
      },
      variants: [{ argumentNames: ['seq', 'fun'] }],
      description: 'Returns the members of `seq` in order, skipping the fist elements for witch the `predicate` returns a truethy value.',
      seeAlso: ['drop', 'takeWhile', 'sequence.splitWith'],
      examples: [
        `dropWhile(
  [1, 2, 3, 2, 1],
  -> $ < 3
)`,
        `dropWhile(
  [1, 2, 3, 2, 1],
  -> $ > 3
)`,
      ],
    },
  },
}
