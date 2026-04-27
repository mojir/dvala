import { describe, expect, it } from 'vitest'
import type { Any } from '../interface'
import { bindingTargetTypes } from '../parser/types'
import { PersistentMap, PersistentVector } from '../utils/persistent'
import {
  checkTypeAtPath,
  extractMatchArrayRest,
  extractMatchObjectRest,
  extractMatchValueByPath,
  flattenMatchPattern,
} from './matchSlot'

describe('flattenMatchPattern', () => {
  it('rest at top level', () => {
    const slots = flattenMatchPattern([bindingTargetTypes.rest, ['xs', undefined], 0])
    expect(slots).toEqual([
      {
        kind: 'rest',
        name: 'xs',
        path: [],
        defaultNode: undefined,
        nodeId: 0,
      },
    ])
  })
})

describe('extractMatchValueByPath', () => {
  it('returns undefined when traversal hits null mid-path', () => {
    const val: Any = PersistentMap.fromRecord({ a: null })
    const result = extractMatchValueByPath(val, [
      { type: 'key', key: 'a' },
      { type: 'key', key: 'b' },
    ])
    expect(result).toBeUndefined()
  })

  it('returns undefined when traversal hits undefined mid-path', () => {
    // PersistentMap.fromRecord omits undefined values — use a map without key 'a'
    const val: Any = PersistentMap.empty()
    const result = extractMatchValueByPath(val, [
      { type: 'key', key: 'a' },
      { type: 'key', key: 'b' },
    ])
    expect(result).toBeUndefined()
  })

  it('returns undefined when following key step on non-record', () => {
    const val: Any = PersistentVector.from([1, 2, 3])
    const result = extractMatchValueByPath(val, [{ type: 'key', key: 'x' }])
    expect(result).toBeUndefined()
  })

  it('returns undefined when following index step on non-array', () => {
    const val: Any = PersistentMap.fromRecord({ x: 1 })
    const result = extractMatchValueByPath(val, [{ type: 'index', index: 0 }])
    expect(result).toBeUndefined()
  })
})

describe('checkTypeAtPath', () => {
  it('returns false for null root value with empty path', () => {
    const val: Any = null
    expect(checkTypeAtPath(val, [], 'object')).toBe(false)
  })

  it('returns false for undefined value at path', () => {
    const val: Any = PersistentMap.fromRecord({ a: null })
    expect(checkTypeAtPath(val, [{ type: 'key', key: 'a' }], 'object')).toBe(false)
  })
})

describe('extractMatchObjectRest', () => {
  it('extracts rest from path', () => {
    const val: Any = PersistentMap.fromRecord({ wrapper: PersistentMap.fromRecord({ a: 1, b: 2, c: 3 }) })
    const result = extractMatchObjectRest(val, [{ type: 'key', key: 'wrapper' }], new Set(['a']))
    expect(result).toEqual(PersistentMap.fromRecord({ b: 2, c: 3 }))
  })

  it('returns empty object when value is not a record', () => {
    const val: Any = PersistentVector.from([1, 2])
    const result = extractMatchObjectRest(val, [], new Set())
    expect(result).toEqual(PersistentMap.empty())
  })
})

describe('extractMatchArrayRest', () => {
  it('returns empty array when value is not an array', () => {
    const val: Any = PersistentMap.fromRecord({ x: 1 })
    const result = extractMatchArrayRest(val, [], 0)
    expect(result).toEqual(PersistentVector.empty())
  })
})
