import type { Any, Arr, Obj, Seq } from '../../../interface'
import type { SourceCodeInfo } from '../../../tokenizer/token'
import { asArray, assertArray } from '../../../typeGuards/array'
import { asAny, asSeq, assertAny, assertSeq } from '../../../typeGuards/dvala'
import { asNumber, assertNumber } from '../../../typeGuards/number'
import { assertString } from '../../../typeGuards/string'
import { collHasKey, deepEqual, toNonNegativeInteger } from '../../../utils'
import { toFixedArity } from '../../../utils/arity'
import { isPersistentVector, PersistentMap, PersistentVector } from '../../../utils/persistent'
import type { BuiltinNormalExpressions } from '../../interface'
import { moduleDocsFromFunctions } from '../interface'
import type { DvalaModule } from '../interface'
import sequenceModuleSource from './sequence.dvala'

const sequenceUtilsFunctions: BuiltinNormalExpressions = {
  'mapcat': {
    evaluate: () => { throw new Error('mapcat is implemented in Dvala') },
    arity: toFixedArity(2),
    docs: {
      category: 'sequence',
      returns: { type: 'collection' },
      args: {
        a: { type: 'collection' },
        b: { type: 'function' },
        colls: { type: 'collection', array: true },
        fun: { type: 'function' },
      },
      variants: [{ argumentNames: ['colls', 'fun'] }],
      description: 'Returns the result of applying concat to the result of applying map to `fun` and `colls`.',
      seeAlso: ['flatten', 'map', '++'],
      examples: [
        'let { mapcat } = import("sequence");\nmapcat([[3, 2, 1, 0], [6, 5, 4], [9, 8, 7]], reverse)',
        `
let { mapcat } = import("sequence");
let foo = (n) -> do
  [n - 1, n, n + 1]
end;
mapcat([1, 2, 3], foo)`,
        `
let { mapcat } = import("sequence");
mapcat(
  [[1, 2], [2, 2], [2, 3]],
  -> $ filter isOdd
)`,
      ],
    },
  },
  'position': {
    evaluate: () => { throw new Error('position: Dvala implementation should be used instead') },
    arity: toFixedArity(2),
    docs: {
      category: 'sequence',
      returns: { type: ['number', 'null'] },
      args: {
        a: { type: 'sequence' },
        b: { type: 'function' },
        seq: { type: ['sequence', 'null'] },
        fun: { type: 'function' },
      },
      variants: [{ argumentNames: ['seq', 'fun'] }],
      description: 'Returns the index of the first elements that passes the test implemented by `fun`. If no element was found, `null` is returned.',
      seeAlso: ['indexOf', 'some', 'find'],
      examples: [
        `
let su = import("sequence");
su.position(
  ["Albert", "Mojir", 160, [1, 2]],
  isString
)`,
        `
let su = import("sequence");
su.position(
  [5, 10, 15, 20],
  -> $ > 10
)`,
        `
let su = import("sequence");
su.position(
  [5, 10, 15, 20],
  -> $ > 100
)`,
        `
let su = import("sequence");
su.position(
  null,
  -> $ > 100
)`,
      ],
    },
  },
  'lastIndexOf': {
    evaluate: ([seq, value], sourceCodeInfo): number | null => {
      assertAny(value, sourceCodeInfo)
      if (seq === null)
        return null

      assertSeq(seq, sourceCodeInfo)
      if (typeof seq === 'string') {
        assertString(value, sourceCodeInfo)
        const index = seq.lastIndexOf(value)
        return index !== -1 ? index : null
      } else {
        // Iterate backwards to find last matching index
        let lastIndex = -1
        let i = 0
        for (const item of seq) {
          if (deepEqual(asAny(item, sourceCodeInfo), value, sourceCodeInfo))
            lastIndex = i
          i++
        }
        return lastIndex !== -1 ? lastIndex : null
      }
    },
    arity: toFixedArity(2),
    docs: {
      category: 'sequence',
      returns: { type: ['number', 'null'] },
      args: {
        a: { type: 'sequence' },
        b: { type: 'any' },
        seq: { type: ['sequence', 'null'] },
        x: { type: 'any' },
      },
      variants: [{ argumentNames: ['seq', 'x'] }],
      description: 'Returns the last index of `x` in `seq`. If element is not present in `seq` `null` is returned.',
      seeAlso: ['indexOf'],
      examples: [
        'let su = import("sequence"); su.lastIndexOf([[1], [2], [1], [2]], [1])',
        'let su = import("sequence"); su.lastIndexOf(["Albert", "Mojir", 160, [1, 2]], "Mojir")',
        'let su = import("sequence"); su.lastIndexOf([5, 10, 15, 20, 15], 15)',
        'let su = import("sequence"); su.lastIndexOf([5, 10, 15, 20], 1)',
        'let su = import("sequence"); su.lastIndexOf(null, 1)',
      ],
    },
  },
  'splice': {
    evaluate: (params, sourceCodeInfo): Any => {
      const seq = asSeq(params.get(0), sourceCodeInfo)
      const start = asNumber(params.get(1), sourceCodeInfo, { integer: true })
      const deleteCount = asNumber(params.get(2), sourceCodeInfo, { integer: true, nonNegative: true })
      const rest: unknown[] = []
      for (let i = 3; i < params.size; i++) rest.push(params.get(i))

      const seqLen = typeof seq === 'string' ? seq.length : seq.size
      const from = start < 0 ? seqLen + start : start

      if (isPersistentVector(seq)) {
        let result = PersistentVector.empty<Any>()
        let i = 0
        let restInserted = false
        for (const item of seq) {
          if (i === from) {
            for (const r of rest) result = result.append(r as Any)
            restInserted = true
          }
          if (i < from || i >= from + deleteCount)
            result = result.append(item as Any)
          i++
        }
        // Append rest at end if from was beyond the seq length
        if (!restInserted) {
          for (const r of rest) result = result.append(r as Any)
        }
        return result
      }

      rest.forEach(elem => assertString(elem, sourceCodeInfo))
      return `${seq.substring(0, from)}${(rest as string[]).join('')}${seq.substring(from + deleteCount)}`
    },
    arity: { min: 3 },
    docs: {
      category: 'sequence',
      returns: { type: 'sequence' },
      args: {
        seq: { type: 'sequence', rest: true },
        start: { type: 'integer' },
        deleteCount: { type: 'integer' },
        items: { type: 'any', rest: true },
      },
      variants: [
        { argumentNames: ['seq', 'start', 'deleteCount'] },
        { argumentNames: ['seq', 'start', 'deleteCount', 'items'] },
      ],
      description: 'Returns a a spliced array. Removes `deleteCount` elements from `seq` starting at `start` and replaces them with `items`. If `start` is negative, it is counting from the end of the array.',
      seeAlso: ['slice', 'sequence.removeAt'],
      examples: [
        'let su = import("sequence"); su.splice([1, 2, 3, 4, 5], 2, 2, "x")',
        'let su = import("sequence"); su.splice([1, 2, 3, 4, 5], -2, 1, "x")',
        'let su = import("sequence"); su.splice("Albert", 2, 2, "fo")',
      ],
    },
  },
  'sortBy': {
    evaluate: () => { throw new Error('sortBy: Dvala implementation should be used instead') },
    arity: { min: 2, max: 3 },
    docs: {
      category: 'sequence',
      returns: { type: 'any', rest: true },
      args: {
        a: { type: 'sequence' },
        b: { type: 'function' },
        seq: { type: 'sequence' },
        keyfn: { type: 'function' },
        comparer: { type: 'function' },
      },
      variants: [
        { argumentNames: ['seq', 'keyfn'] },
        { argumentNames: ['seq', 'keyfn', 'comparer'] },
      ],
      description: 'Returns a sorted sequence of the items in `seq`, where the sort order is determined by comparing `(keyfn item)`. If no `comparer` is supplied, uses builtin `compare`.',
      seeAlso: ['sort', 'compare'],
      examples: [
        'let su = import("sequence"); su.sortBy(["Albert", "Mojir", "Nina"], count)',
        'let su = import("sequence"); su.sortBy(["Albert", "Mojir", "Nina"], count)',
        'let su = import("sequence"); su.sortBy("Albert", lowerCase, -> $2 compare $)',
      ],
    },
  },
  'unshift': {
    evaluate: ([seq, ...values], sourceCodeInfo): Seq => {
      assertSeq(seq, sourceCodeInfo)
      if (typeof seq === 'string') {
        // values comes from rest destructuring (plain JS array), check each char manually
        for (const v of values) {
          if (typeof v !== 'string' || v.length !== 1)
            throw new TypeError(`Expected char, got ${typeof v === 'string' ? `"${v}"` : String(v)}`)
        }
        return [...(values as string[]), seq].join('')
      }
      // Prepend all values to the vector in order
      let result = PersistentVector.empty<Any>()
      for (const v of values) result = result.append(v as Any)
      for (const item of seq) result = result.append(item as Any)
      return result
    },
    arity: { min: 2 },
    docs: {
      category: 'sequence',
      returns: { type: 'sequence' },
      args: {
        a: { type: 'sequence' },
        b: { type: 'any' },
        seq: { type: 'sequence' },
        values: { type: 'any', rest: true },
      },
      variants: [{ argumentNames: ['seq', 'values'] }],
      description: 'Returns copy of `seq` with `values` added to the beginning.',
      seeAlso: ['push', '++'],
      examples: [
        'let su = import("sequence"); su.unshift([1, 2, 3], 4)',
        'let su = import("sequence"); su.unshift([1, 2, 3], 4)',
        'let su = import("sequence"); su.unshift([1, 2, 3], 4, 5, 6)',
        `
let su = import("sequence");
let l = [1, 2, 3];
su.unshift(l, 4);
l`,
      ],
    },
  },
  'distinct': {
    evaluate: ([input], sourceCodeInfo): Seq => {
      assertSeq(input, sourceCodeInfo)

      if (isPersistentVector(input)) {
        let result = PersistentVector.empty<Any>()
        for (const item of input) {
          assertAny(item, sourceCodeInfo)
          let found = false
          for (const existingItem of result) {
            if (deepEqual(existingItem, item, sourceCodeInfo)) { found = true; break }
          }
          if (!found)
            result = result.append(item)
        }
        return result
      }

      return Array.from(new Set(input.split(''))).join('')
    },
    arity: toFixedArity(1),
    docs: {
      category: 'sequence',
      returns: { type: 'sequence' },
      args: { seq: { type: 'sequence' } },
      variants: [{ argumentNames: ['seq'] }],
      description: 'Returns a copy of `seq` with no duplicates.',
      seeAlso: ['sequence.frequencies'],
      examples: [
        'let su = import("sequence"); su.distinct([[1], [2], [3], [1], [3], [5]])',
        'let su = import("sequence"); su.distinct([1, 2, 3, 1, 3, 5])',
        'let su = import("sequence"); su.distinct("Albert Mojir")',
        'let su = import("sequence"); su.distinct([])',
        'let su = import("sequence"); su.distinct("")',
      ],
    },
  },
  'remove': {
    evaluate: () => { throw new Error('remove: Dvala implementation should be used instead') },
    arity: toFixedArity(2),
    docs: {
      category: 'sequence',
      returns: { type: 'sequence' },
      args: {
        a: { type: 'sequence' },
        b: { type: 'function' },
        seq: { type: 'sequence' },
        fun: { type: 'function' },
      },
      variants: [{ argumentNames: ['seq', 'fun'] }],
      description: 'Returns a new sequence of items in `seq` for witch `pred(item)` returns a falsy value.',
      seeAlso: ['filter', 'sequence.removeAt'],
      examples: [
        'let su = import("sequence"); su.remove([1, 2, 3, 1, 3, 5], isOdd)',
        'let su = import("sequence"); su.remove([1, 2, 3, 1, 3, 5], isEven)',
        'let su = import("sequence"); su.remove("Albert Mojir", -> "aoueiyAOUEIY" contains $)',
      ],
    },
  },
  'removeAt': {
    evaluate: ([input, index], sourceCodeInfo): Seq => {
      assertNumber(index, sourceCodeInfo, { integer: true })
      assertSeq(input, sourceCodeInfo)

      const inputLen = typeof input === 'string' ? input.length : input.size
      const at = index < 0 ? inputLen + index : index
      if (at < 0 || at >= inputLen)
        return input

      if (isPersistentVector(input)) {
        let result = PersistentVector.empty<Any>()
        let i = 0
        for (const item of input) {
          if (i !== at) result = result.append(item as Any)
          i++
        }
        return result
      }
      return `${input.substring(0, at)}${input.substring(at + 1)}`
    },
    arity: toFixedArity(2),
    docs: {
      category: 'sequence',
      returns: { type: 'sequence' },
      args: {
        a: { type: 'sequence' },
        b: { type: 'integer' },
        seq: { type: 'sequence' },
        n: { type: 'number' },
      },
      variants: [{ argumentNames: ['seq', 'n'] }],
      description: 'Returns a new sequence of all items in `seq` except item at position `n`. If `n` is negative, it is counting from the end of the sequence.',
      seeAlso: ['sequence.remove', 'sequence.splice'],
      examples: [
        'let su = import("sequence"); su.removeAt([1, 2, 3, 1, 3, 5], 2)',
        'let su = import("sequence"); su.removeAt("Albert", -2)',
        'let su = import("sequence"); su.removeAt([1, 2, 3, 1, 3, 5], 0)',
        'let su = import("sequence"); su.removeAt([1, 2, 3, 1, 3, 5], -1)',
        'let su = import("sequence"); su.removeAt("Albert Mojir", 6)',
      ],
    },
  },
  'splitAt': {
    evaluate: ([seq, pos], sourceCodeInfo): Arr => {
      assertNumber(pos, sourceCodeInfo, { integer: true })
      assertSeq(seq, sourceCodeInfo)

      const seqLen = typeof seq === 'string' ? seq.length : seq.size
      const at = pos < 0 ? seqLen + pos : pos

      if (isPersistentVector(seq)) {
        let before = PersistentVector.empty<Any>()
        let after = PersistentVector.empty<Any>()
        let i = 0
        for (const item of seq) {
          if (i < at) before = before.append(item as Any)
          else after = after.append(item as Any)
          i++
        }
        return PersistentVector.from<Any>([before, after])
      }
      return PersistentVector.from<Any>([seq.slice(0, at), seq.slice(at)])
    },
    arity: toFixedArity(2),
    docs: {
      category: 'sequence',
      returns: { type: 'sequence' },
      args: {
        a: { type: 'sequence' },
        b: { type: 'integer' },
        seq: { type: 'sequence' },
        n: { type: 'number' },
      },
      variants: [{ argumentNames: ['seq', 'n'] }],
      description: 'Returns a pair of sequence `[take(pos input), drop(pos input)]`.',
      seeAlso: ['sequence.splitWith', 'take', 'drop'],
      examples: [
        'let su = import("sequence"); su.splitAt([1, 2, 3, 4, 5], 2)',
        'let su = import("sequence"); su.splitAt("Albert", -2)',
        'let su = import("sequence"); su.splitAt([1, 2, 3, 4, 5], -2)',
        'let su = import("sequence"); su.splitAt("Albert", 2)',
      ],
    },
  },

  'splitWith': {
    evaluate: () => { throw new Error('splitWith: Dvala implementation should be used instead') },
    arity: toFixedArity(2),
    docs: {
      category: 'sequence',
      returns: { type: 'sequence' },
      args: {
        a: { type: 'sequence' },
        b: { type: 'function' },
        seq: { type: 'sequence' },
        fun: { type: 'function' },
      },
      variants: [{ argumentNames: ['seq', 'fun'] }],
      description: 'Returns a pair of sequences `[takeWhile(input, fun), dropWhile(input, fun)]`.',
      seeAlso: ['sequence.splitAt', 'takeWhile', 'dropWhile'],
      examples: [
        'let su = import("sequence"); su.splitWith([1, 2, 3, 4, 5], isOdd)',
        'let su = import("sequence"); su.splitWith([1, 2, 3, 4, 5], -> $ > 3)',
        'let su = import("sequence"); su.splitWith("Albert", -> $ <= "o")',
      ],
    },
  },

  'frequencies': {
    evaluate: ([seq], sourceCodeInfo): Obj => {
      assertSeq(seq, sourceCodeInfo)

      // Build frequency map using PersistentMap
      let result = PersistentMap.empty<Any>()
      const items = typeof seq === 'string' ? seq.split('') : [...seq]
      for (const val of items) {
        assertString(val, sourceCodeInfo)
        const count = collHasKey(result, val) ? (result.get(val) as number) : 0
        result = result.assoc(val, count + 1)
      }
      return result
    },
    arity: toFixedArity(1),
    docs: {
      category: 'sequence',
      returns: { type: 'object' },
      args: { seq: { type: 'sequence' } },
      variants: [{ argumentNames: ['seq'] }],
      description: 'Returns an object from distinct items in `seq` to the number of times they appear. Note that all items in `seq` must be valid object keys i.e. strings.',
      seeAlso: ['sequence.groupBy', 'sequence.distinct', 'vector.countValues'],
      examples: [
        'let su = import("sequence"); su.frequencies(["Albert", "Mojir", "Nina", "Mojir"])',
        'let su = import("sequence"); su.frequencies("Pneumonoultramicroscopicsilicovolcanoconiosis")',
      ],
    },
  },

  'groupBy': {
    evaluate: () => { throw new Error('groupBy: Dvala implementation should be used instead') },
    arity: toFixedArity(2),
    docs: {
      category: 'sequence',
      returns: { type: 'object' },
      args: {
        a: { type: 'sequence' },
        b: { type: 'function' },
        seq: { type: 'sequence' },
        fun: { type: 'function' },
      },
      variants: [{ argumentNames: ['seq', 'fun'] }],
      description: 'Returns an object of the elements of `seq` keyed by the result of `fun` on each element. The value at each key will be an array of the corresponding elements.',
      seeAlso: ['sequence.frequencies', 'sequence.partitionBy'],
      examples: [
        'let su = import("sequence"); su.groupBy([{ name: "Albert" }, { name: "Albert" }, { name: "Mojir" }], "name")',
        'let su = import("sequence"); su.groupBy([{name: "Albert"}, {name: "Albert"}, {name: "Mojir"}], "name")',
        'let su = import("sequence"); su.groupBy("Albert Mojir", -> if "aoueiAOUEI" contains $ then "vowel" else "other" end)',
      ],
    },
  },

  'partition': {
    evaluate: (params, sourceCodeInfo): Arr => {
      const seq = asSeq(params.get(0), sourceCodeInfo)
      const n = toNonNegativeInteger(asNumber(params.get(1), sourceCodeInfo))
      const step = params.size >= 3 ? toNonNegativeInteger(asNumber(params.get(2), sourceCodeInfo)) : n
      const pad = params.size === 4
        ? params.get(3) === null ? PersistentVector.empty<Any>() : asArray(params.get(3), sourceCodeInfo)
        : undefined

      return partitionHelper(n, step, seq, pad, sourceCodeInfo)
    },
    arity: { min: 2, max: 4 },
    docs: {
      category: 'sequence',
      returns: { type: 'sequence' },
      args: {
        a: { type: 'sequence' },
        b: { type: 'number' },
        seq: { type: 'sequence' },
        n: { type: 'number' },
        step: { type: 'number' },
        pad: { type: 'array' },
      },
      variants: [
        { argumentNames: ['seq', 'n'] },
        { argumentNames: ['seq', 'n', 'step'] },
        { argumentNames: ['seq', 'n', 'step', 'pad'] },
      ],
      description: 'Returns an array of sequences of `n` items each, at offsets `step` apart. If `step` is not supplied, defaults to `n`. If a `pad` array is supplied, use its elements as necessary to complete last partition upto `n` items. In case there are not enough padding elements, return a partition with less than `n` items.',
      seeAlso: ['sequence.partitionAll', 'sequence.partitionBy'],
      examples: [
        'let su = import("sequence"); su.partition(range(20), 4)',
        'let su = import("sequence"); su.partition(range(20), 4)',
        'let su = import("sequence"); su.partition(range(22), 4)',
        'let su = import("sequence"); su.partition(range(20), 4, 6)',
        'let su = import("sequence"); su.partition(range(20), 4, 3)',
        'let su = import("sequence"); su.partition(range(20), 3, 6, ["a"])',
        'let su = import("sequence"); su.partition(range(20), 4, 6, ["a"])',
        'let su = import("sequence"); su.partition(range(20), 4, 6, ["a", "b", "c", "d"])',
        'let su = import("sequence"); su.partition(["a", "b", "c", "d", "e", "f"], 3, 1)',
        'let su = import("sequence"); su.partition([1, 2, 3, 4], 10)',
        'let su = import("sequence"); su.partition([1, 2, 3, 4], 10, 10)',
        'let su = import("sequence"); su.partition([1, 2, 3, 4], 10, 10, [])',
        'let su = import("sequence"); su.partition([1, 2, 3, 4], 10, 10, null)',
        'let su = import("sequence"); su.partition("superfragilistic", 5)',
        'let su = import("sequence"); su.partition("superfragilistic", 5, 5, null)',
        'let su = import("sequence"); let foo = [5, 6, 7, 8]; su.partition(foo, 2, 1, foo)',
      ],
    },
  },

  'partitionAll': {
    evaluate: (params, sourceCodeInfo): Arr => {
      const seq = asSeq(params.get(0), sourceCodeInfo)
      const n = toNonNegativeInteger(asNumber(params.get(1), sourceCodeInfo))
      const step = params.size === 3 ? toNonNegativeInteger(asNumber(params.get(2), sourceCodeInfo)) : n

      return partitionHelper(n, step, seq, PersistentVector.empty<Any>(), sourceCodeInfo)
    },
    arity: { min: 2, max: 3 },
    docs: {
      category: 'sequence',
      returns: { type: 'sequence' },
      args: {
        a: { type: 'sequence' },
        b: { type: 'number' },
        seq: { type: 'sequence' },
        n: { type: 'number' },
        step: { type: 'number' },
      },
      variants: [
        { argumentNames: ['seq', 'n'] },
        { argumentNames: ['seq', 'n', 'step'] },
      ],
      description: 'Returns an array of sequences like partition, but may include partitions with fewer than n items at the end.',
      seeAlso: ['sequence.partition', 'sequence.partitionBy'],
      examples: [
        'let su = import("sequence"); su.partitionAll([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 4)',
        'let su = import("sequence"); su.partitionAll([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 4)',
        'let su = import("sequence"); su.partition([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 4)',
        'let su = import("sequence"); su.partitionAll([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 2, 4)',
      ],
    },
  },

  'partitionBy': {
    evaluate: () => { throw new Error('partitionBy: Dvala implementation should be used instead') },
    arity: toFixedArity(2),
    docs: {
      category: 'sequence',
      returns: { type: 'sequence' },
      args: {
        a: { type: 'sequence' },
        b: { type: 'function' },
        seq: { type: 'sequence' },
        fun: { type: 'function' },
      },
      variants: [{ argumentNames: ['seq', 'fun'] }],
      description: 'Applies `fun` to each value in `seq`, splitting it each time `fun` returns a new value. Returns an array of sequences.',
      seeAlso: ['sequence.partition', 'sequence.partitionAll', 'sequence.groupBy'],
      examples: [
        'let su = import("sequence"); su.partitionBy([1, 2, 3, 4, 5], isOdd)',
        'let su = import("sequence"); su.partitionBy([1, 2, 3, 4, 5], -> $ == 3)',
        'let su = import("sequence"); su.partitionBy([1, 1, 1, 2, 2, 3, 3], isOdd)',
        'let su = import("sequence"); su.partitionBy("Leeeeeerrroyyy", identity)',
      ],
    },
  },
  'isEndsWith': {
    evaluate: ([str, search], sourceCodeInfo): boolean => {
      assertSeq(str, sourceCodeInfo)

      if (typeof str === 'string') {
        assertString(search, sourceCodeInfo)
        return str.endsWith(search)
      }

      // Check if last element equals search
      return deepEqual(asAny(str.get(str.size - 1), sourceCodeInfo), asAny(search, sourceCodeInfo), sourceCodeInfo)
    },
    arity: toFixedArity(2),
    docs: {
      category: 'sequence',
      returns: { type: 'boolean' },
      args: {
        a: { type: 'sequence' },
        b: { type: 'sequence' },
        seq: { type: 'sequence' },
        suffix: { type: 'sequence' },
      },
      variants: [{ argumentNames: ['seq', 'suffix'] }],
      description: 'Returns `true` if `seq` ends with `suffix`, otherwise `false`.',
      seeAlso: ['sequence.isStartsWith'],
      examples: [
        'let su = import("sequence"); su.isEndsWith([[1], [2], [3], [4], [5]], [5])',
        'let su = import("sequence"); su.isEndsWith([[1], [2], [3], [4], [5]], 5)',
        'let su = import("sequence"); su.isEndsWith([1, 2, 3, 4, 5], 5)',
        'let su = import("sequence"); su.isEndsWith([1, 2, 3, 4, 5], [5])',
        'let su = import("sequence"); su.isEndsWith("Albert", "rt")',
        'let su = import("sequence"); su.isEndsWith("Albert", "RT")',
      ],
    },
  },
  'isStartsWith': {
    evaluate: ([seq, search], sourceCodeInfo): boolean => {
      assertSeq(seq, sourceCodeInfo)

      if (typeof seq === 'string') {
        assertString(search, sourceCodeInfo)
        return seq.startsWith(search)
      }

      // Check if first element equals search
      return deepEqual(asAny(seq.get(0), sourceCodeInfo), asAny(search, sourceCodeInfo), sourceCodeInfo)
    },
    arity: toFixedArity(2),
    docs: {
      category: 'sequence',
      returns: { type: 'boolean' },
      args: {
        a: { type: 'sequence' },
        b: { type: 'sequence' },
        seq: { type: 'sequence' },
        prefix: { type: 'sequence' },
      },
      variants: [{ argumentNames: ['seq', 'prefix'] }],
      description: 'Returns `true` if `seq` starts with `prefix`, otherwise `false`.',
      seeAlso: ['sequence.isEndsWith'],
      examples: [
        'let su = import("sequence"); su.isStartsWith([[1], [2], [3], [4], [5]], [1])',
        'let su = import("sequence"); su.isStartsWith([1, 2, 3, 4, 5], 1)',
        'let su = import("sequence"); su.isStartsWith([1, 2, 3, 4, 5], [1])',
        'let su = import("sequence"); su.isStartsWith("Albert", "Al")',
        'let su = import("sequence"); su.isStartsWith("Albert", "al")',
      ],
    },
  },
  'interleave': {
    evaluate: ([...seqs], sourceCodeInfo): Seq => {
      const isStringSeq = typeof seqs[0] === 'string'

      // Normalize all sequences to a common form for iteration
      const normalizedSeqs: (string[] | Arr)[] = isStringSeq
        ? seqs.map(seq => {
          assertString(seq, sourceCodeInfo)
          return seq.split('')
        })
        : seqs.map(seq => {
          assertArray(seq, sourceCodeInfo)
          return seq
        })

      // Get length/size of each normalized seq
      const getLen = (s: string[] | Arr): number => Array.isArray(s) ? s.length : s.size
      const getItem = (s: string[] | Arr, i: number): unknown => Array.isArray(s) ? s[i] : s.get(i)

      const maxLength = Math.min(...normalizedSeqs.map(getLen))
      let result = PersistentVector.empty<Any>()
      for (let i = 0; i < maxLength; i += 1) {
        for (const seq of normalizedSeqs) {
          // Defensive: i is bounded by maxLength which is min of all seq lengths
          /* v8 ignore next 2 */
          if (i < getLen(seq))
            result = result.append(getItem(seq, i) as Any)
        }
      }
      return isStringSeq ? [...result].join('') : result
    },
    arity: { min: 1 },
    docs: {
      category: 'sequence',
      returns: { type: 'sequence' },
      args: {
        a: { type: 'sequence' },
        b: { type: 'sequence' },
        seqs: { type: 'sequence', rest: true },
      },
      variants: [{ argumentNames: ['seqs'] }],
      description: 'Returns a sequence of the first item from each of the `seqs`, then the second item from each of the `seqs`, until all items from the shortest seq are exhausted.',
      seeAlso: ['sequence.interpose', 'zipmap'],
      examples: [
        'let su = import("sequence"); su.interleave([1, 2, 3], [4, 5, 6])',
        'let su = import("sequence"); su.interleave("Albert", ".,.,.,")',
        'let su = import("sequence"); su.interleave([1, 2, 3], [4, 5, 6])',
        'let su = import("sequence"); su.interleave([1, 2, 3], [4, 5, 6], [7, 8, 9])',
        'let su = import("sequence"); su.interleave([1, 2, 3], [4, 5, 6], [7, 8])',
        'let su = import("sequence"); su.interleave([1, 2, 3], [4, 5, 6], [7])',
        'let su = import("sequence"); su.interleave([1, 2, 3], [4, 5, 6], [])',
        'let su = import("sequence"); su.interleave([1, 2, 3], [])',
        'let su = import("sequence"); su.interleave([])',
      ],
    },
  },
  'interpose': {
    evaluate: ([seq, separator], sourceCodeInfo): Seq => {
      assertSeq(seq, sourceCodeInfo)
      if (typeof seq === 'string') {
        assertString(separator, sourceCodeInfo)
        return seq.split('').join(separator)
      }

      if (seq.size === 0)
        return PersistentVector.empty<Any>()

      let result = PersistentVector.empty<Any>()
      let i = 0
      for (const item of seq) {
        result = result.append(item as Any)
        // Append separator between items, not after the last one
        if (i < seq.size - 1)
          result = result.append(separator as Any)
        i++
      }
      return result
    },
    arity: toFixedArity(2),
    docs: {
      category: 'sequence',
      returns: { type: 'sequence' },
      args: {
        a: { type: 'sequence' },
        b: { type: 'any' },
        seq: { type: 'sequence' },
        separator: { type: 'any' },
      },
      variants: [{ argumentNames: ['seq', 'separator'] }],
      description: 'Returns a sequence of the elements of `seq` separated by `separator`. If `seq` is a string, the separator must be a string.',
      seeAlso: ['sequence.interleave', 'join'],
      examples: [
        'let su = import("sequence"); su.interpose("Albert", "-")',
        'let su = import("sequence"); su.interpose([1, 2, 3, 4, 5], "a")',
        'let su = import("sequence"); su.interpose(["Albert", "Mojir", "Nina"], ", ")',
        'let su = import("sequence"); su.interpose("Albert", ".")',
      ],
    },
  },
}

function partitionHelper(n: number, step: number, seq: Seq, pad: Arr | undefined, sourceCodeInfo?: SourceCodeInfo): Arr {
  assertNumber(step, sourceCodeInfo, { positive: true })
  const isStringSeq = typeof seq === 'string'
  const seqLen = isStringSeq ? seq.length : seq.size

  let result = PersistentVector.empty<Any>()
  let start = 0
  outer: while (start < seqLen) {
    let innerArr = PersistentVector.empty<Any>()
    for (let i = start; i < start + n; i += 1) {
      if (i >= seqLen) {
        const padIndex = i - seqLen
        if (!pad) {
          start += step
          continue outer
        }
        if (padIndex >= pad.size)
          break

        innerArr = innerArr.append(pad.get(padIndex) as Any)
      } else {
        // Get element at position i from the sequence
        const item = isStringSeq ? seq[i] : seq.get(i)
        innerArr = innerArr.append(item as Any)
      }
    }
    // For string sequences, join the inner array chars into a string
    result = result.append(isStringSeq ? [...innerArr].join('') as Any : innerArr as Any)
    start += step
  }
  return result
}

export const sequenceUtilsModule: DvalaModule = {
  name: 'sequence',
  description: 'Sequence generation and transformation: iterate, unfold, windows, and chunks.',
  functions: sequenceUtilsFunctions,
  source: sequenceModuleSource,
  docs: moduleDocsFromFunctions(sequenceUtilsFunctions),
}
