import type { Any, Arr, Coll, Obj } from '../../interface'
import type { SourceCodeInfo } from '../../tokenizer/token'
import { collHasKey, deepEqual, toAny } from '../../utils'
import { asAny, assertAny, assertColl, assertObj, isObj, isSeq } from '../../typeGuards/dvala'
import type { BuiltinNormalExpressions } from '../interface'
import { assertArray } from '../../typeGuards/array'
import { assertNumber, isNumber } from '../../typeGuards/number'
import { assertString, assertStringOrNumber, isString, isStringOrNumber } from '../../typeGuards/string'
import { toFixedArity } from '../../utils/arity'
import { isPersistentVector, PersistentMap, PersistentVector } from '../../utils/persistent'

function get(coll: Coll, key: string | number): Any | undefined {
  if (isObj(coll)) {
    if (typeof key === 'string' && collHasKey(coll, key))
      return toAny(coll.get(key))
  } else if (typeof coll === 'string') {
    if (isNumber(key, { nonNegative: true, integer: true }) && key >= 0 && key < coll.length)
      return toAny(coll[key])
  } else {
    // PersistentVector
    if (isNumber(key, { nonNegative: true, integer: true }) && key >= 0 && key < coll.size)
      return toAny(coll.get(key))
  }
  return undefined
}

function assoc(coll: Coll, key: string | number, value: Any, sourceCodeInfo?: SourceCodeInfo) {
  assertColl(coll, sourceCodeInfo)
  assertStringOrNumber(key, sourceCodeInfo)
  if (isPersistentVector(coll) || typeof coll === 'string') {
    assertNumber(key, sourceCodeInfo, { integer: true })
    assertNumber(key, sourceCodeInfo, { gte: 0 })
    const seqLength = typeof coll === 'string' ? coll.length : coll.size
    assertNumber(key, sourceCodeInfo, { lte: seqLength })
    if (typeof coll === 'string') {
      assertString(value, sourceCodeInfo, { char: true })
      return `${coll.slice(0, key)}${value}${coll.slice(key + 1)}`
    }
    // Append when key equals size (PersistentVector.set() rejects out-of-bounds)
    if (key === seqLength)
      return coll.append(value)
    return coll.set(key, value)
  }
  assertString(key, sourceCodeInfo)
  return coll.assoc(key, value)
}

export const collectionNormalExpression: BuiltinNormalExpressions = {
  'filter': {
    evaluate: () => { throw new Error('filter is implemented in Dvala') },
    arity: toFixedArity(2),
    docs: {
      type: '((A[], (A) -> Boolean) -> A[]) & (({...}, (Unknown) -> Boolean) -> {...})',
      category: 'collection',
      returns: { type: 'collection' },
      args: {
        a: { type: 'collection' },
        b: { type: 'function' },
        coll: { type: 'collection' },
        fun: { type: 'function' },
      },
      variants: [{ argumentNames: ['coll', 'fun'] }],
      description: 'Creates a new collection with all elements that pass the test implemented by `fun`.',
      seeAlso: ['collection.filteri', 'map', 'sequence.remove'],
      examples: [
        `
filter(
  ["Albert", "Mojir", 160, [1, 2]],
  isString
)`,
        `
filter(
  [5, 10, 15, 20],
  -> $ > 10
)`,
        `
filter(
  { a: 1, b: 2 },
  isOdd
)`,
      ],
    },
  },
  'map': {
    evaluate: () => { throw new Error('map is implemented in Dvala') },
    arity: { min: 2 },
    docs: {
      type: '((A[], (A) -> B) -> B[]) & ((A[], A[], (A, A) -> B) -> B[]) & (({...}, (Unknown) -> Unknown) -> {...}) & (({...}, {...}, (Unknown, Unknown) -> Unknown) -> {...})',
      category: 'collection',
      returns: { type: 'collection' },
      args: {
        a: { type: 'collection' },
        b: { type: 'function' },
        colls: { type: 'collection', rest: true, description: 'At least one.' },
        fun: { type: 'function' },
      },
      variants: [{ argumentNames: ['colls', 'fun'] }],
      description: 'Creates a new collection populated with the results of calling `fun` on every element in `colls`.',
      seeAlso: ['collection.mapi', 'filter', 'reduce', 'sequence.mapcat', 'grid.cellMap', 'grid.cellMapi'],
      examples: [
        '[1, 2, 3] map -',
        '[1, 2, 3] map -> -($)',
        'map(["Albert", "Mojir", 42], str)',
        'map([1, 2, 3], inc)',
        'map([1, 2, 3], [1, 10, 100], *)',
        'map({ a: 1, b: 2 }, inc)',
        'map({ a: 1, b: 2 }, { a: 10, b: 20 }, +)',
      ],
    },
  },
  'reduce': {
    evaluate: () => { throw new Error('reduce is implemented in Dvala') },
    arity: toFixedArity(3),
    docs: {
      type: '((A[], (B, A) -> B, B) -> B) & (({...}, (B, Unknown) -> B, B) -> B)',
      category: 'collection',
      returns: { type: 'any' },
      args: {
        fun: { type: 'function' },
        coll: { type: 'collection' },
        initial: { type: 'any' },
      },
      variants: [{ argumentNames: ['coll', 'fun', 'initial'] }],
      description: 'Runs `fun` function on each element of the `coll`, passing in the return value from the calculation on the preceding element. The final result of running the reducer across all elements of the `coll` is a single value.',
      seeAlso: ['collection.reduceRight', 'collection.reducei', 'collection.reductions', 'map', 'grid.cellReduce', 'grid.cellReducei'],
      examples: [
        'reduce([1, 2, 3], +, 0)',
        'reduce([], +, 0)',
        'reduce({ a: 1, b: 2 }, +, 0)',
        `
reduce(
  [1, 2, 3, 4, 5, 6, 7, 8, 9],
  (result, value) -> result + (if isEven(value) then value else 0 end),
  0)`,
      ],
    },
  },
  'get': {
    evaluate: (params, sourceCodeInfo) => {
      const [coll, key] = params
      const defaultValue = toAny(params.get(2))
      assertStringOrNumber(key, sourceCodeInfo)
      if (coll === null)
        return defaultValue

      assertColl(coll, sourceCodeInfo)
      const result = get(coll, key)
      return result === undefined ? defaultValue : result
    },
    arity: { min: 2, max: 3 },
    docs: {
      // Record + literal-string-key overload returns the exact field type
      // via indexed-access (PR #80). Relies on `freshenAnnotationVars`
      // giving each call-site fresh `R` and `K` so the indexed-access
      // placeholder `R[K]` resolves at simplify time against the caller's
      // concrete record and key. Listed FIRST so inference's overload
      // resolution picks it when applicable; falls through to the wider
      // collection overloads for arrays, strings, Null, or non-literal keys.
      // Indexed-access overload returns the concrete field / element
      // type via `R[K]` (PR #80). `indexType` handles:
      //   - Record × literal-string-key → field type (+ Null if optional)
      //   - Tuple × integer-literal → element or Never if out of bounds
      //   - Array/Sequence/String × integer-literal → element type
      // `freshenAnnotationVars` gives each call-site fresh R and K so
      // the placeholder `R[K]` resolves at simplify time. Listed FIRST
      // so overload resolution picks it when the key is concrete; falls
      // through to the wider collection overloads for Null, non-literal
      // keys, or the default-value (3-arg) variant.
      //
      // We do NOT union `Null` into the return here: strict-known-good
      // accesses (`tuple[0]`, `record.field`) should stay tight. The
      // caller expecting a Null fallback should use the 3-arg variant
      // with an explicit default or the generic fallback overload.
      type: '((R, K) -> R[K]) & ((String | Unknown[] | {...} | Null, String | Number) -> Unknown) & ((String | Unknown[] | {...} | Null, String | Number, Unknown) -> Unknown)',
      category: 'collection',
      returns: { type: 'any' },
      args: {
        'a': { type: 'collection' },
        'b': { type: ['string', 'integer'] },
        'notFound': { type: 'any', description: 'Default value to return if `b` is not found.' },
      },
      variants: [
        { argumentNames: ['a', 'b'] },
        { argumentNames: ['a', 'b', 'notFound'] },
      ],
      description: 'Returns value in `a` mapped at `b`.',
      seeAlso: ['collection.getIn', 'contains', 'find', 'nth'],
      examples: [
        '[1, 2, 3] get 1',
        '{ a: 1 } get "a"',
        '"Albert" get "3"',
        `
get(
  [1, 2, 3],
  1, // Optional comma after last argument
)`,
        `
get(
  [],
  1
)`,
        `
get(
  [],
  1,
  "default"
)`,
        `
get(
  { a: 1 },
  "a"
)`,
        `
get(
  { a: 1 },
  "b"
)`,
        `
get(
  { a: 1 },
  "b",
  "default"
)`,
        `
get(
  null,
  "a"
)`,
        `
get(
  null,
  "b",
  "default"
)`,
      ],
    },
  },
  'count': {
    evaluate: ([coll], sourceCodeInfo): number => {
      if (coll === null)
        return 0

      if (typeof coll === 'string')
        return coll.length

      assertColl(coll, sourceCodeInfo)
      // Both PersistentVector and PersistentMap expose `.size`
      if (isPersistentVector(coll))
        return coll.size

      // Must be PersistentMap (Obj) — cast to access .size
      return (coll as PersistentMap).size
    },
    arity: toFixedArity(1),
    docs: {
      type: '(String | Unknown[] | {...} | Null) -> Integer',
      category: 'collection',
      returns: { type: 'integer' },
      args: {
        coll: { type: ['collection', 'null'] },
      },
      variants: [{ argumentNames: ['coll'] }],
      description: 'Returns number of elements in `coll`.',
      seeAlso: ['isEmpty'],
      examples: [
        'count([1, 2, 3])',
        'count([])',
        'count({ a: 1 })',
        'count("")',
        'count("Albert")',
        'count(null)',
      ],
    },
  },
  'contains': {
    evaluate: ([coll, key], sourceCodeInfo): boolean => {
      if (coll === null)
        return false

      assertColl(coll, sourceCodeInfo)
      if (isString(coll)) {
        assertString(key, sourceCodeInfo)
        return coll.includes(key)
      }
      if (isSeq(coll)) {
        assertAny(key, sourceCodeInfo)
        // Iterate PersistentVector to find matching element
        for (const elem of coll) {
          if (deepEqual(asAny(elem), key, sourceCodeInfo))
            return true
        }
        return false
      }
      assertString(key, sourceCodeInfo)
      return coll.has(key)
    },
    arity: toFixedArity(2),
    docs: {
      type: '(String | Unknown[] | {...} | Null, Unknown) -> Boolean',
      category: 'collection',
      returns: { type: 'boolean' },
      args: {
        a: { type: ['collection', 'null'] },
        b: { type: ['string', 'integer'] },
      },
      variants: [{ argumentNames: ['a', 'b'] }],
      description: 'Returns `true` if `a` contains `b`, otherwise returns `false`. For strings, it checks if substring is included.',
      seeAlso: ['get', 'find', 'indexOf'],
      examples: [
        '[1, 2, 3] contains 1',
        'null contains 1',
        '{ a: 1, b: 2 } contains "a"',
        `
contains(
  [],
  1
)`,
        `
contains(
  [1],
  1
)`,
        `
contains(
  [1, 2, 3],
  1
)`,
        `
contains(
  {},
  "a"
)`,
        `
contains(
  { a: 1, b: 2 },
  "a"
)`,
      ],
    },
  },
  'assoc': {
    evaluate: ([coll, key, value], sourceCodeInfo): Coll => {
      assertColl(coll, sourceCodeInfo)
      assertStringOrNumber(key, sourceCodeInfo)
      assertAny(value, sourceCodeInfo)
      return assoc(coll, key, value, sourceCodeInfo)
    },
    arity: toFixedArity(3),
    docs: {
      type: '(String | Unknown[] | {...}, String | Number, Unknown) -> String | Unknown[] | {...}',
      category: 'collection',
      returns: { type: 'collection' },
      args: {
        coll: { type: 'collection' },
        key: { type: ['string', 'number'] },
        value: { type: 'any' },
        kvs: { type: 'any', description: 'Key-value pairs to associate.', rest: true },
      },
      variants: [
        { argumentNames: ['coll', 'key', 'value'] },
        { argumentNames: ['coll', 'key', 'value', 'kvs'] },
      ],
      description: `
Add or replace the value of element \`key\` to \`value\` in \`coll\`. Repeated for all key-value pairs in \`kvs\`.
If \`coll\` is an 'array', \`key\` must be \`number\` satisfying \`0 <=\` \`key\` \`<= length\`.`,
      seeAlso: ['collection.assocIn', 'dissoc', 'merge', 'collection.update'],
      examples: [
        `
assoc(
  [1, 2, 3],
  1,
  "Two"
)`,
        `
assoc(
  [1, 2, 3],
  3,
  "Four"
)`,
        `
assoc(
  { a: 1, b: 2 },
  "a",
  "One")`,
        `
assoc(
  { a: 1, b: 2 },
  "c",
  "Three")`,
        `
assoc(
  "Albert",
  6,
  "a")`,
      ],
    },
  },
  '++': {
    evaluate: (params, sourceCodeInfo): Any => {
      const first = params.get(0)
      if (!isNumber(first)) {
        assertColl(first, sourceCodeInfo)
      }
      if (isPersistentVector(first)) {
        // Concatenate all arrays by spreading into a transient
        let result: Arr = PersistentVector.empty()
        for (const arr of params) {
          assertArray(arr, sourceCodeInfo)
          for (const item of arr) {
            result = result.append(item)
          }
        }
        return result
      } else if (isStringOrNumber(first)) {
        let result = ''
        for (const s of params) {
          assertStringOrNumber(s, sourceCodeInfo)
          result = `${result}${s}`
        }
        return result
      } else {
        // Merge objects: fold assoc over all entries from each object
        let result: Obj = PersistentMap.empty()
        for (const obj of params) {
          assertObj(obj, sourceCodeInfo)
          for (const [k, v] of obj) {
            result = result.assoc(k, v)
          }
        }
        return result
      }
    },
    arity: { min: 1 },
    docs: {
      type: '((String | A[] | {...}) -> String | A[] | {...}) & ((String, ...String[]) -> String) & ((A[], ...A[][]) -> A[]) & (({...}, ...{...}[]) -> {...})',
      category: 'collection',
      returns: { type: 'collection' },
      args: {
        a: { type: 'collection' },
        b: { type: 'collection' },
        colls: { type: 'collection', rest: true },
      },
      variants: [
        { argumentNames: ['a'] },
        { argumentNames: ['a', 'colls'] },
      ],
      description: 'Concatenates collections into one collection.',
      seeAlso: ['sequence.mapcat', 'str', 'join', 'push', 'sequence.unshift'],
      examples: [
        '"Albert" ++ " " ++ "Mojir"',
        '"Albert" ++ "Mojir"',

        '++("Albert", "-", "Mojir")',
        '++("Albert")',

        '++("A", "l", "b", "e", "r", "t")',
        '++([1, 2], [3, 4])',
        '++([], [3, 4])',
        '++([1, 2], [])',
        '++([1, 2], [3, 4], [5, 6])',
        '++([])',
        '++({ a: 1, b: 2 }, { b: 1, c: 2 })',
        '++({}, { a: 1 })',
      ],
    },
  },
}
