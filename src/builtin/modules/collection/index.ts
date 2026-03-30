import type { Any, Arr, Coll, Obj } from '../../../interface'
import type { SourceCodeInfo } from '../../../tokenizer/token'
import { cloneColl, collHasKey, toAny } from '../../../utils'
import { asColl, assertAny, assertColl, assertObj, isColl, isArr, isObj } from '../../../typeGuards/dvala'
import type { BuiltinNormalExpressions } from '../../interface'
import { assertArray } from '../../../typeGuards/array'
import { assertNumber, isNumber } from '../../../typeGuards/number'
import { asStringOrNumber, assertString, assertStringOrNumber } from '../../../typeGuards/string'
import { toFixedArity } from '../../../utils/arity'
import { moduleDocsFromFunctions } from '../interface'
import type { DvalaModule } from '../interface'
import { PersistentMap, PersistentVector } from '../../../utils/persistent'
import collectionModuleSource from './collection.dvala'

// --- Private helper: get value from collection by key ---
function get(coll: Coll, key: string | number): Any | undefined {
  if (isObj(coll)) {
    // PersistentMap: use .get(key) for string keys
    if (typeof key === 'string' && collHasKey(coll, key))
      return toAny(coll.get(key))
  } else if (isArr(coll)) {
    // PersistentVector: use .get(i) for numeric indices
    if (isNumber(key, { nonNegative: true, integer: true }) && key >= 0 && key < coll.size)
      return toAny(coll.get(key))
  }
  return undefined
}

// --- Private helper: assoc value into collection ---
function assoc(coll: Coll, key: string | number, value: Any, sourceCodeInfo?: SourceCodeInfo) {
  assertColl(coll, sourceCodeInfo)
  if (isArr(coll) || typeof coll === 'string') {
    assertNumber(key, sourceCodeInfo, { integer: true })
    assertNumber(key, sourceCodeInfo, { gte: 0 })
    if (typeof coll === 'string') {
      assertNumber(key, sourceCodeInfo, { lte: coll.length })
      assertString(value, sourceCodeInfo, { char: true })
      return `${coll.slice(0, key)}${value}${coll.slice(key + 1)}`
    }
    assertNumber(key, sourceCodeInfo, { lte: coll.size })
    // PersistentVector: use functional set for immutable update
    return coll.set(key, value)
  }
  assertString(key, sourceCodeInfo)
  // PersistentMap: use functional assoc for immutable update
  return coll.assoc(key, value)
}

interface CollMeta {
  coll: Coll
  parent: Obj | Arr
}

// --- Private helper: clone and get meta for nested operations ---
function cloneAndGetMeta(
  originalColl: Coll,
  keys: Arr,
  sourceCodeInfo?: SourceCodeInfo,
): { coll: Coll; innerCollMeta: CollMeta } {
  const coll = cloneColl(originalColl)

  // All keys except the last one (we navigate to the parent before updating)
  const butLastKeys = keys.size > 1 ? [...keys].slice(0, keys.size - 1) : []

  const innerCollMeta = butLastKeys.reduce(
    (result: CollMeta, key) => {
      const resultColl = result.coll

      let newResultColl: Coll
      if (isArr(resultColl)) {
        assertNumber(key, sourceCodeInfo)
        newResultColl = asColl(resultColl.get(key), sourceCodeInfo)
      } else {
        assertObj(resultColl, sourceCodeInfo)
        assertString(key, sourceCodeInfo)
        if (!collHasKey(result.coll, key)) {
          // Create a nested empty map if the key doesn't exist yet
          return { coll: PersistentMap.empty(), parent: resultColl }
        }

        newResultColl = asColl(resultColl.get(key), sourceCodeInfo)
      }

      return { coll: newResultColl, parent: resultColl }
    },
    { coll, parent: PersistentMap.empty() },
  )
  return { coll, innerCollMeta }
}

const collectionUtilsFunctions: BuiltinNormalExpressions = {
  'getIn': {
    evaluate: (params, sourceCodeInfo): Any => {
      let coll = toAny(params.get(0))
      const keys = params.get(1) ?? PersistentVector.empty() // null behaves as empty array
      const defaultValue = toAny(params.get(2))
      assertArray(keys, sourceCodeInfo)
      for (const key of keys) {
        assertStringOrNumber(key, sourceCodeInfo)
        if (isColl(coll)) {
          const nextValue = get(coll, key)
          if (nextValue !== undefined)
            coll = nextValue
          else
            return defaultValue
        } else {
          return defaultValue
        }
      }
      return coll
    },
    arity: { min: 2, max: 3 },
    docs: {
      category: 'collection',
      returns: { type: 'any' },
      args: {
        'a': { type: 'collection' },
        'b': { type: 'array' },
        'notFound': { type: 'any' },
      },
      variants: [
        { argumentNames: ['a', 'b'] },
        { argumentNames: ['a', 'b', 'notFound'] },
      ],
      description: 'Returns the value in a nested collection, where `b` is an array of keys. Returns `not-found` if the key is not present. If `not-found` is not set, `null` is returned.',
      seeAlso: ['get', 'collection.assocIn', 'collection.updateIn'],
      examples: [
        `
let cu = import("collection");
cu.getIn(
  [[1, 2, 3], [4, { a: "Kalle" }, 6]],
  [1, 1, "a", 0]
)`,
        `
let cu = import("collection");
cu.getIn(
  [[1, 2, 3], [4, { a: "Kalle" }, 6]],
  [1, 1, "b", 0]
)`,
        `
let cu = import("collection");
cu.getIn(
  [[1, 2, 3], [4, { a: "Kalle" }, 6]],
  [1, 1, "b", 0],
  "Lisa"
)`,
      ],
    },
  },
  'assocIn': {
    evaluate: ([originalColl, keys, value], sourceCodeInfo): Coll => {
      assertColl(originalColl, sourceCodeInfo)
      assertArray(keys, sourceCodeInfo)
      assertAny(value, sourceCodeInfo)

      if (keys.size === 1) {
        assertStringOrNumber(keys.get(0), sourceCodeInfo)
        return assoc(originalColl, keys.get(0) as string | number, value, sourceCodeInfo)
      }

      const { coll, innerCollMeta } = cloneAndGetMeta(originalColl, keys, sourceCodeInfo)

      const lastKey = asStringOrNumber(keys.get(keys.size - 1), sourceCodeInfo)
      const parentKey = asStringOrNumber(keys.get(keys.size - 2), sourceCodeInfo)

      // Update the parent with the new nested value
      assoc(innerCollMeta.coll, lastKey, value, sourceCodeInfo)
      assoc(innerCollMeta.parent, parentKey, innerCollMeta.coll, sourceCodeInfo)

      return coll
    },
    arity: toFixedArity(3),
    docs: {
      category: 'collection',
      returns: { type: 'collection' },
      args: {
        coll: { type: 'collection' },
        ks: { type: ['number', 'string'], array: true },
        value: { type: 'any' },
      },
      variants: [{ argumentNames: ['coll', 'ks', 'value'] }],
      description: `
Associates a value in the nested collection \`coll\`, where \`ks\` is an array of keys and \`value\` is the new value.

If any levels do not exist, objects will be created - and the corresponding keys must be of type string.`,
      seeAlso: ['assoc', 'collection.getIn', 'collection.updateIn'],
      examples: [
        `
let cu = import("collection");
cu.assocIn(
  {},
  ["a", "b", "c"],
  "Albert"
)`,
        `
let cu = import("collection");
cu.assocIn(
  [1, 2, [1, 2, 3]],
  [2, 1],
  "Albert"
)`,
        `
let cu = import("collection");
cu.assocIn(
  [1, 2, { name: "albert" }],
  [2, "name", 0],
  "A"
)`,
      ],
    },
  },
  'update': {
    evaluate: () => { throw new Error('update: Dvala implementation should be used instead') },
    arity: { min: 3 },
    docs: {
      category: 'collection',
      returns: { type: 'collection' },
      args: {
        'coll': { type: 'collection' },
        'key': { type: ['string', 'number'] },
        'fun': { type: 'function' },
        'funArgs': { type: 'any', rest: true },
      },
      variants: [
        { argumentNames: ['coll', 'key', 'fun'] },
        { argumentNames: ['coll', 'key', 'fun', 'funArgs'] },
      ],
      description: `
Updates a value in the \`coll\` collection, where \`key\` is a key. \`fun\` is a function
that will take the old value and any supplied \`fun-args\` and
return the new value.
If the key does not exist, \`null\` is passed as the old value.`,
      seeAlso: ['collection.updateIn', 'assoc'],
      examples: [
        `
let cu = import("collection");
let x = { a: 1, b: 2 };
cu.update(x, "a", inc)`,
        `
let cu = import("collection");
let x = { a: 1, b: 2 };
cu.update(
  x,
  "c",
  val -> if isNull(val) then 0 else inc(val) end
)`,
      ],
    },
  },
  'updateIn': {
    evaluate: () => { throw new Error('updateIn: Dvala implementation should be used instead') },
    arity: { min: 3 },
    docs: {
      category: 'collection',
      returns: { type: 'collection' },
      args: {
        'coll': { type: 'collection' },
        'ks': { type: 'array' },
        'fun': { type: 'function' },
        'funArgs': { type: 'any', rest: true },
      },
      variants: [
        { argumentNames: ['coll', 'ks', 'fun'] },
        { argumentNames: ['coll', 'ks', 'fun', 'funArgs'] },
      ],
      description: `Updates a value in the \`coll\` collection, where \`ks\` is an array of
keys and \`fun\` is a function that will take the old value and
any supplied \`fun-args\` and return the new value. If any levels do not exist,
objects will be created - and the corresponding keys must be of type string.`,
      seeAlso: ['collection.update', 'collection.assocIn', 'collection.getIn'],
      examples: [
        `
let cu = import("collection");
cu.updateIn(
  { a: [1, 2, 3] },
  ["a", 1],
  -> if isNull($) then 0 else inc($) end
)`,
        `
let cu = import("collection");
cu.updateIn(
  { a: { foo: "bar"} },
  ["a", "foo"],
  -> if isNull($) then "?" else "!" end
)`,
        `
let cu = import("collection");
cu.updateIn(
  { a: { foo: "bar"} },
  ["a", "baz"],
  -> if isNull($) then "?" else "!" end
)`,
        `
let cu = import("collection");
cu.updateIn(
  { a: [1, 2, 3] },
  ["a", 1],
  *,
  10,
  10,
  10,
)`,
      ],
    },
  },
  'filteri': {
    evaluate: () => { throw new Error('filteri: Dvala implementation should be used instead') },
    arity: toFixedArity(2),
    docs: {
      category: 'collection',
      returns: { type: 'collection' },
      args: {
        a: { type: 'collection' },
        b: {
          type: 'function',
          description: 'The function to call for each element in the collection. The function should take two arguments: the element itself and the index.',
        },
      },
      variants: [{ argumentNames: ['a', 'b'] }],
      description: 'Creates a new collection with all elements that pass the test implemented by `b`. The function is called for each element in the collection, and it should take two arguments: the element itself and the index.',
      seeAlso: ['filter', 'collection.mapi'],
      examples: [
        'let cu = import("collection"); cu.filteri([1, 2, 3], (x, i) -> i % 2 == 0)',
        'let cu = import("collection"); cu.filteri([1, 2, 3], (x, i) -> x % 2 == 0)',
        'let cu = import("collection"); cu.filteri([1, 2, 3], (x, i) -> x + i > 3)',
      ],
    },
  },
  'mapi': {
    evaluate: () => { throw new Error('mapi: Dvala implementation should be used instead') },
    arity: toFixedArity(2),
    docs: {
      category: 'collection',
      returns: { type: 'collection' },
      args: {
        a: { type: 'collection' },
        b: {
          type: 'function',
          description: 'The function to call for each element in the collection. The function should take two arguments: the element itself and the index.',
        },
      },
      variants: [{ argumentNames: ['a', 'b'] }],
      description: 'Creates a new collection populated with the results of calling `b` on every element in `a`. The function is called for each element in the collection, and it should take two arguments: the element itself and the index.',
      seeAlso: ['map', 'collection.filteri'],
      examples: [
        'let cu = import("collection"); cu.mapi([1, 2, 3], (x, i) -> x + i)',
        'let cu = import("collection"); cu.mapi([1, 2, 3], (x, i) -> x * i)',
        'let cu = import("collection"); cu.mapi([1, 2, 3], (x, i) -> x - i)',
        'let cu = import("collection"); cu.mapi([1, 2, 3], (x, i) -> x / i)',
        'let cu = import("collection"); cu.mapi([1, 2, 3], (x, i) -> x % inc(i))',
      ],
    },
  },
  'reducei': {
    evaluate: () => { throw new Error('reducei: Dvala implementation should be used instead') },
    arity: toFixedArity(3),
    docs: {
      category: 'collection',
      returns: { type: 'any' },
      args: {
        coll: { type: 'collection' },
        fun: {
          type: 'function',
          description: 'The function to call for each element in the collection. The function should take three arguments: the accumulator, the element itself, and the index.',
        },
        initial: {
          type: 'any',
          description: 'The initial value to use as the accumulator.',
        },
      },
      variants: [{ argumentNames: ['coll', 'fun', 'initial'] }],
      description: 'Runs `fun` function on each element of the `coll`, passing in the return value from the calculation on the preceding element. The final result of running the reducer across all elements of the `coll` is a single value. The function is called for each element in the collection, and it should take three arguments: the accumulator, the element itself, and the index.',
      seeAlso: ['reduce', 'collection.reduceiRight', 'collection.reductionsi'],
      examples: [
        'let cu = import("collection"); cu.reducei([1, 2, 3], (acc, x, i) -> acc + x + i, 0)',
        'let cu = import("collection"); cu.reducei("Albert", (acc, x, i) -> acc ++ x ++ i, "")',
        'let cu = import("collection"); cu.reducei({ a: 1, b: 2 }, -> $ ++ $3, "")',
      ],
    },
  },
  'reduceRight': {
    evaluate: () => { throw new Error('reduceRight: Dvala implementation should be used instead') },
    arity: toFixedArity(3),
    docs: {
      category: 'collection',
      returns: { type: 'any' },
      args: {
        fun: { type: 'function' },
        coll: { type: 'collection' },
        initial: { type: 'any' },
      },
      variants: [{ argumentNames: ['coll', 'fun', 'initial'] }],
      description: 'Runs `fun` function on each element of the `coll` (starting from the last item), passing in the return value from the calculation on the preceding element. The final result of running the reducer across all elements of the `coll` is a single value.',
      seeAlso: ['reduce', 'collection.reduceiRight'],
      examples: [
        'let cu = import("collection"); cu.reduceRight(["A", "B", "C"], str, "")',
        'let cu = import("collection"); cu.reduceRight({ a: 1, b: 2 }, +, 0)',
      ],
    },
  },
  'reduceiRight': {
    evaluate: () => { throw new Error('reduceiRight: Dvala implementation should be used instead') },
    arity: toFixedArity(3),
    docs: {
      category: 'collection',
      returns: { type: 'any' },
      args: {
        coll: { type: 'collection' },
        fun: {
          type: 'function',
          description: 'The function to call for each element in the collection. The function should take three arguments: the accumulator, the element itself, and the index.',
        },
        initial: {
          type: 'any',
          description: 'The initial value to use as the accumulator.',
        },
      },
      variants: [{ argumentNames: ['coll', 'fun', 'initial'] }],
      description: 'Runs `fun` function on each element of the `coll` (starting from the last item), passing in the return value from the calculation on the preceding element. The final result of running the reducer across all elements of the `coll` is a single value. The function is called for each element in the collection, and it should take three arguments: the accumulator, the element itself, and the index.',
      seeAlso: ['collection.reducei', 'collection.reduceRight'],
      examples: [
        'let cu = import("collection"); cu.reduceiRight([1, 2, 3], (acc, x, i) -> acc + x + i, 0)',
        'let cu = import("collection"); cu.reduceiRight("Albert", (acc, x, i) -> acc ++ x ++ i, "")',
        'let cu = import("collection"); cu.reduceiRight({ a: 1, b: 2 }, -> $ ++ $3, "")',
      ],
    },
  },
  'reductions': {
    evaluate: () => { throw new Error('reductions: Dvala implementation should be used instead') },
    arity: toFixedArity(3),
    docs: {
      category: 'collection',
      returns: { type: 'any', array: true },
      args: {
        fun: { type: 'function' },
        coll: { type: 'collection' },
        initial: { type: 'any' },
      },
      variants: [{ argumentNames: ['coll', 'fun', 'initial'] }],
      description: 'Returns an array of the intermediate values of the reduction (see `reduce`) of `coll` by `fun`.',
      seeAlso: ['reduce', 'collection.reductionsi'],
      examples: [
        'let cu = import("collection"); cu.reductions([1, 2, 3], +, 0)',
        'let cu = import("collection"); cu.reductions([1, 2, 3], +, 10)',
        'let cu = import("collection"); cu.reductions([], +, 0)',
        'let cu = import("collection"); cu.reductions({ a: 1, b: 2 }, +, 0)',
        `
let cu = import("collection");
cu.reductions(
  [1, 2, 3, 4, 5, 6, 7, 8, 9],
  (result, value) -> result + (if isEven(value) then value else 0 end),
  0
)`,
      ],
    },
  },
  'reductionsi': {
    evaluate: () => { throw new Error('reductionsi: Dvala implementation should be used instead') },
    arity: toFixedArity(3),
    docs: {
      category: 'collection',
      returns: { type: 'any', array: true },
      args: {
        coll: { type: 'collection' },
        fun: {
          type: 'function',
          description: 'The function to call for each element in the collection. The function should take three arguments: the accumulator, the element itself, and the index.',
        },
        initial: {
          type: 'any',
          description: 'The initial value to use as the accumulator.',
        },
      },
      variants: [{ argumentNames: ['coll', 'fun', 'initial'] }],
      description: 'Returns an array of the intermediate values of the reduction (see `reduce`) of `coll` by `fun`. The function is called for each element in the collection, and it should take three arguments: the accumulator, the element itself, and the index.',
      seeAlso: ['collection.reductions', 'collection.reducei'],
      examples: [
        'let cu = import("collection"); cu.reductionsi([1, 2, 3], (acc, x, i) -> acc + x + i, 0)',
        'let cu = import("collection"); cu.reductionsi("Albert", (acc, x, i) -> acc ++ x ++ i, "")',
        'let cu = import("collection"); cu.reductionsi({ a: 1, b: 2 }, -> $ ++ $3, "")',
      ],
    },
  },
  'notEmpty': {
    evaluate: ([coll], sourceCodeInfo): Coll | null => {
      if (coll === null)
        return null

      assertColl(coll, sourceCodeInfo)
      if (typeof coll === 'string')
        return coll.length > 0 ? coll : null

      if (isArr(coll))
        return coll.size > 0 ? coll : null

      // Obj is PersistentMap: use .size property
      return coll.size > 0 ? coll : null
    },
    arity: toFixedArity(1),
    docs: {
      category: 'collection',
      returns: { type: 'any' },
      args: {
        coll: { type: ['collection', 'null'] },
      },
      variants: [{ argumentNames: ['coll'] }],
      description: 'Returns `null` if `coll` is empty or `null`, otherwise `coll`.',
      seeAlso: ['isEmpty', 'isNotEmpty'],
      examples: [
        'let cu = import("collection"); cu.notEmpty([])',
        'let cu = import("collection"); cu.notEmpty([1, 2, 3])',
        'let cu = import("collection"); cu.notEmpty({})',
        'let cu = import("collection"); cu.notEmpty({ a: 2 })',
        'let cu = import("collection"); cu.notEmpty("")',
        'let cu = import("collection"); cu.notEmpty("Albert")',
        'let cu = import("collection"); cu.notEmpty(null)',
      ],
    },
  },
  'isEvery': {
    evaluate: () => { throw new Error('isEvery: Dvala implementation should be used instead') },
    arity: toFixedArity(2),
    docs: {
      category: 'collection',
      returns: { type: 'boolean' },
      args: {
        a: { type: 'collection' },
        b: { type: 'function' },
      },
      variants: [{ argumentNames: ['a', 'b'] }],
      description: 'Returns `true` if all entries in `a` pass the test implemented by `b`, otherwise returns `false`.',
      seeAlso: ['collection.isAny', 'collection.notEvery', 'collection.notAny', 'functional.everyPred', 'grid.isCellEvery'],
      examples: [
        'let cu = import("collection"); cu.isEvery([1, 2, 3], isNumber)',
        'let cu = import("collection"); cu.isEvery([1, 2, 3], isEven)',
        `
let cu = import("collection");
cu.isEvery(
  ["Albert", "Mojir", 160, [1, 2]],
  isString,
)`,
        `
let cu = import("collection");
cu.isEvery(
  [50, 100, 150, 200],
  -> $ > 10,
)`,
        'let cu = import("collection"); cu.isEvery([], isNumber)',
        'let cu = import("collection"); cu.isEvery("", isNumber)',
        'let cu = import("collection"); cu.isEvery({}, isNumber)',
        `
let cu = import("collection");
cu.isEvery(
  { a: 2, b: 4},
  -> isEven(second($))
)`,
        `
let cu = import("collection");
cu.isEvery(
  { a: 2, b: 3 },
  -> isEven(second($))
)`,
      ],
    },
  },
  'isAny': {
    evaluate: () => { throw new Error('isAny: Dvala implementation should be used instead') },
    arity: toFixedArity(2),
    docs: {
      category: 'collection',
      returns: { type: 'boolean' },
      args: {
        a: { type: 'collection' },
        b: { type: 'function' },
      },
      variants: [{ argumentNames: ['a', 'b'] }],
      description: 'Returns `true` if any element in `a` pass the test implemented by `b`, otherwise returns `false`.',
      seeAlso: ['collection.isEvery', 'collection.notAny', 'collection.notEvery', 'functional.somePred', 'some', 'grid.isSome'],
      examples: [
        `
let cu = import("collection");
cu.isAny(
  ["Albert", "Mojir", 160, [1, 2]],
  isString
)`,
        `
let cu = import("collection");
cu.isAny(
  [50, 100, 150, 200],
  x -> x > 10
)`,
        'let cu = import("collection"); cu.isAny([], isNumber)',
        'let cu = import("collection"); cu.isAny("", isNumber)',
        'let cu = import("collection"); cu.isAny({}, isNumber)',
        `
let cu = import("collection");
cu.isAny(
  { a: 2, b: 3 },
  -> isEven(second($))
)`,
        `
let cu = import("collection");
cu.isAny(
  { a: 1, b: 3 },
  -> isEven(second($))
)`,
      ],
    },
  },
  'notAny': {
    evaluate: () => { throw new Error('notAny: Dvala implementation should be used instead') },
    arity: toFixedArity(2),
    docs: {
      category: 'collection',
      returns: { type: 'boolean' },
      args: {
        a: { type: 'collection' },
        b: { type: 'function' },
      },
      variants: [{ argumentNames: ['a', 'b'] }],
      description: 'Returns `false` if any element in `a` pass the test implemented by `b`, otherwise returns `true`.',
      seeAlso: ['collection.isAny', 'collection.isEvery', 'collection.notEvery'],
      examples: [
        `
let cu = import("collection");
cu.notAny(
  ["Albert", "Mojir", 160, [1, 2]],
  isString
)`,
        `
let cu = import("collection");
cu.notAny(
  [50, 100, 150, 200],
  x -> x > 10
)`,
        'let cu = import("collection"); cu.notAny([], isNumber)',
        'let cu = import("collection"); cu.notAny("", isNumber)',
        'let cu = import("collection"); cu.notAny({}, isNumber)',
        `
let cu = import("collection");
cu.notAny(
  { a: 2, b: 3 },
  -> isEven(second($))
)`,
        `
let cu = import("collection");
cu.notAny(
  { a: 1, b: 3 },
  -> isEven(second($))
)`,
      ],
    },
  },
  'notEvery': {
    evaluate: () => { throw new Error('notEvery: Dvala implementation should be used instead') },
    arity: toFixedArity(2),
    docs: {
      category: 'collection',
      returns: { type: 'boolean' },
      args: {
        a: { type: 'collection' },
        b: { type: 'function' },
      },
      variants: [{ argumentNames: ['a', 'b'] }],
      description: 'Returns `true` if at least one element in `a` does not pass the test implemented by `b`, otherwise returns `false`.',
      seeAlso: ['collection.isEvery', 'collection.isAny', 'collection.notAny'],
      examples: [
        `
let cu = import("collection");
cu.notEvery(
  ["Albert", "Mojir", 160, [1, 2]],
  isString
)`,
        `
let cu = import("collection");
cu.notEvery(
  [50, 100, 150, 200],
  x -> x > 10
)`,
        'let cu = import("collection"); cu.notEvery([], isNumber)',
        'let cu = import("collection"); cu.notEvery("", isNumber)',
        'let cu = import("collection"); cu.notEvery({}, isNumber)',
        `
let cu = import("collection");
cu.notEvery(
  { a: 2, b: 4 },
  -> isEven(second($))
)`,
        `
let cu = import("collection");
cu.notEvery(
  { a: 2, b: 3 },
  -> isEven(second($))
)`,
      ],
    },
  },
}

export const collectionUtilsModule: DvalaModule = {
  name: 'collection',
  functions: collectionUtilsFunctions,
  source: collectionModuleSource,
  docs: moduleDocsFromFunctions(collectionUtilsFunctions),
}
