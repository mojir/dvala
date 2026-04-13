import type { Any, Arr, Obj } from '../../interface'
import { assertArray, assertStringArray } from '../../typeGuards/array'
import { assertObj } from '../../typeGuards/dvala'
import { asString, assertString } from '../../typeGuards/string'
import { collHasKey, toAny } from '../../utils'
import { toFixedArity } from '../../utils/arity'
import { PersistentMap, PersistentVector } from '../../utils/persistent'
import type { BuiltinNormalExpressions } from '../interface'

export const objectNormalExpression: BuiltinNormalExpressions = {
  'keys': {
    evaluate: ([obj], sourceCodeInfo): Arr => {
      assertObj(obj, sourceCodeInfo)
      return PersistentVector.from(obj.keys())
    },
    arity: toFixedArity(1),
    docs: {
      type: '({...}) -> String[]',
      category: 'object',
      returns: { type: 'any', array: true },
      args: { obj: { type: 'object' } },
      variants: [{ argumentNames: ['obj'] }],
      description: 'Returns array of all keys in `obj`.',
      seeAlso: ['vals', 'entries', 'zipmap', 'selectKeys'],
      examples: [
        { code: 'keys({})', noCheck: true },
        { code: 'keys({ x: 10, y: true, z: "A string" })', noCheck: true },
        { code: 'keys(object("x", 10, "y", true, "z", "A string"))', noCheck: true },
      ],
    },
  },

  'vals': {
    evaluate: ([obj], sourceCodeInfo): Arr => {
      assertObj(obj, sourceCodeInfo)
      return PersistentVector.from(obj.values())
    },
    arity: toFixedArity(1),
    docs: {
      type: '({...}) -> Unknown[]',
      category: 'object',
      returns: { type: 'any', array: true },
      args: { obj: { type: 'object' } },
      variants: [{ argumentNames: ['obj'] }],
      description: 'Returns array of all values in `obj`.',
      seeAlso: ['keys', 'entries', 'zipmap'],
      examples: [
        { code: 'vals({})', noCheck: true },
        { code: 'vals({ x: 10, y: true, z: "A string" })', noCheck: true },
        { code: 'vals(object("x", 10, "y", true, "z", "A string"))', noCheck: true },
      ],
    },
  },

  'entries': {
    evaluate: ([obj], sourceCodeInfo): Arr => {
      assertObj(obj, sourceCodeInfo)
      // Each entry is a [key, value] pair represented as a PersistentVector
      return PersistentVector.from(obj.entries().map(([k, v]) => PersistentVector.from([k, v]) as Arr))
    },
    arity: toFixedArity(1),
    docs: {
      type: '({...}) -> Unknown[][]',
      category: 'object',
      returns: { type: 'array' },
      args: { obj: { type: 'object' } },
      variants: [{ argumentNames: ['obj'] }],
      description: 'Returns nested array of all key - value pairs in `obj`.',
      seeAlso: ['keys', 'vals', 'zipmap', 'find'],
      examples: [
        { code: 'entries({})', noCheck: true },
        { code: 'entries({ x: 10, y: true, z: "A string" })', noCheck: true },
        { code: 'entries(object("x", 10, "y", true, "z", "A string"))', noCheck: true },
      ],
    },
  },

  'find': {
    evaluate: ([obj, key], sourceCodeInfo): Arr | null => {
      assertObj(obj, sourceCodeInfo)
      assertString(key, sourceCodeInfo)
      if (collHasKey(obj, key))
        return PersistentVector.from([key, obj.get(key)])

      return null
    },
    arity: toFixedArity(2),
    docs: {
      type: '({...}, String) -> Unknown[] | Null',
      category: 'object',
      returns: { type: ['array', 'null'] },
      args: {
        a: { type: 'object' },
        b: { type: 'string' },
        obj: { type: 'object' },
        key: { type: 'string' },
      },
      variants: [{ argumentNames: ['obj', 'key'] }],
      description: 'Returns entry (key-value pair) for `key`, or `null` if `key` not present in `obj`.',
      seeAlso: ['get', 'contains', 'entries', 'sequence.position', 'some'],
      examples: [
        { code: '{ a: 1, "b": 2 } find "a"', noCheck: true },
        { code: 'find(object("a", 1, "b", 2), "b")', noCheck: true },
        { code: 'find(object("a", 1, "b", 2), "c")', noCheck: true },
      ],
    },
  },

  'dissoc': {
    evaluate: ([obj, key], sourceCodeInfo): Any => {
      assertObj(obj, sourceCodeInfo)
      assertString(key, sourceCodeInfo)
      // PersistentMap.dissoc returns a new map with the key removed
      return obj.dissoc(key)
    },
    arity: toFixedArity(2),
    docs: {
      type: '({...}, String) -> {...}',
      category: 'object',
      returns: { type: 'object' },
      args: {
        a: { type: 'object' },
        b: { type: 'string' },
        obj: { type: 'object' },
        key: { type: 'string' },
      },
      variants: [{ argumentNames: ['obj', 'key'] }],
      description: 'Return shallow copy of `obj` with `key` deleted.',
      seeAlso: ['assoc', 'selectKeys'],
      examples: [
        { code: '{ x: 10, y: 20 } dissoc "y"', noCheck: true },
        { code: 'dissoc({ x: 10, y: 20 }, "x")', noCheck: true },
        { code: 'dissoc({ x: 10 }, "y")', noCheck: true },
        { code: `
let o = { a: 5 };
dissoc(o, "a");
o`, noCheck: true },
      ],
    },
  },

  'merge': {
    evaluate: (params, sourceCodeInfo): Any => {
      if (params.size === 0)
        return null

      const [first, ...rest] = params
      assertObj(first, sourceCodeInfo)

      return rest.reduce(
        (result: Obj, obj) => {
          assertObj(obj, sourceCodeInfo)
          // Fold all entries of obj into result via assoc
          let merged = result
          for (const [k, v] of obj) {
            merged = merged.assoc(k, v)
          }
          return merged
        },
        first,
      )
    },
    arity: { min: 0 },
    docs: {
      type: '({...}, {...}) -> {...}',
      category: 'object',
      returns: { type: 'object' },
      args: {
        a: { type: 'object' },
        b: { type: 'object' },
        objs: { type: 'object', rest: true },
      },
      variants: [{ argumentNames: ['objs'] }],
      description: `Returns a new object created by merging together all arguments.

If two keys appears in more than one object the value from the last object is used.
If no arguments are provided \`null\` is returned.`,
      seeAlso: ['mergeWith', 'assoc'],
      examples: [
        { code: '{ x: 10 } merge { y: 20 }', noCheck: true },
        { code: 'merge(object("x", 10), object("y", 20))', noCheck: true },
        { code: 'merge(object("x", 10), object("x", 15, "y", 20))', noCheck: true },
      ],
    },
  },

  'mergeWith': {
    evaluate: () => { throw new Error('mergeWith is implemented in Dvala') },
    arity: { min: 2 },
    docs: {
      category: 'object',
      returns: { type: 'object' },
      args: {
        objs: { type: 'object', rest: true },
        fun: { type: 'function' },
      },
      variants: [{ argumentNames: ['objs', 'fun'] }],
      description: `
Returns a new object created by merging together all arguments.
If two keys appears in more than one object \`fun\` is used to calculate the new value.

If no arguments are provided \`null\` is returned.`,
      seeAlso: ['merge'],
      examples: [
        { code: 'mergeWith(object("x", 10), object("y", 20), +)', noCheck: true },
        { code: 'mergeWith(object("x", 10), object("x", 15, "y", 20), +)', noCheck: true },
        { code: 'mergeWith({ x: 10 }, { x: 20 }, { x: 30 }, { x: 40 }, -)', noCheck: true },
      ],
      hideOperatorForm: true,
    },
  },

  'zipmap': {
    evaluate: ([keys, values], sourceCodeInfo): Any => {
      assertStringArray(keys, sourceCodeInfo)
      assertArray(values, sourceCodeInfo)

      const length = Math.min(keys.size, values.size)

      let result: Obj = PersistentMap.empty()

      for (let i = 0; i < length; i += 1) {
        const key = asString(keys.get(i), sourceCodeInfo)
        result = result.assoc(key, toAny(values.get(i)))
      }
      return result
    },
    arity: toFixedArity(2),
    docs: {
      type: '(String[], Unknown[]) -> {...}',
      category: 'object',
      returns: { type: 'object' },
      args: {
        a: { type: 'array' },
        b: { type: 'array' },
      },
      variants: [{ argumentNames: ['a', 'b'] }],
      description: 'Returns a new object created by mapping `a` to `b`.',
      seeAlso: ['entries', 'keys', 'vals', 'sequence.interleave'],
      examples: [
        { code: '["a", "b", "c"] zipmap [1, 2, 3]', noCheck: true },
        { code: 'zipmap(["a", "b", "c"], [10, null, [1, 2, 3]])', noCheck: true },
        { code: 'zipmap(["a", "b", "c"], [1])', noCheck: true },
        { code: 'zipmap([], [10, null, [1, 2, 3]])', noCheck: true },
      ],
    },
  },

  'selectKeys': {
    evaluate: ([obj, keys], sourceCodeInfo): Any => {
      assertStringArray(keys, sourceCodeInfo)
      assertObj(obj, sourceCodeInfo)

      let result: Obj = PersistentMap.empty()
      for (const key of keys) {
        if (typeof key === 'string' && collHasKey(obj, key))
          result = result.assoc(key, toAny(obj.get(key)))
      }
      return result
    },
    arity: toFixedArity(2),
    docs: {
      type: '({...}, String[]) -> {...}',
      category: 'object',
      returns: { type: 'object' },
      args: {
        a: { type: 'object' },
        b: { type: 'array' },
      },
      variants: [{ argumentNames: ['a', 'b'] }],
      description: 'Returns an object containing only those entries in `a` whose key is in `b`.',
      seeAlso: ['dissoc', 'keys'],
      examples: [
        { code: '{ a: 1, b: 2, c: 3 } selectKeys ["a", "b"]', noCheck: true },
        { code: 'selectKeys({ a: 1, b: 2, c: 3 }, ["a", "b"])', noCheck: true },
        { code: 'selectKeys({ a: 1 }, ["a", "b"])', noCheck: true },
      ],
    },
  },
}
