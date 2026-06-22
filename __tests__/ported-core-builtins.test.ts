import { describe, expect, it } from 'vitest'
import { createDvala } from '@mojir/dvala-core-tooling'

// Core builtins ported from TypeScript to `.dvala` (sequence/object/functional).
// Covers happy paths, edge cases, and every input guard so the `.dvala` union
// report stays at 100%.
describe('ported core builtins', () => {
  for (const dvala of [createDvala(), createDvala({ debug: true })]) {
    it('second / rest / next over arrays and strings', () => {
      expect(dvala.run('second([1, 2, 3])')).toBe(2)
      expect(dvala.run('second([1])')).toBe(null)
      expect(dvala.run('rest([1, 2, 3])')).toEqual([2, 3])
      expect(dvala.run('rest([1])')).toEqual([])
      expect(dvala.run('rest("abc")')).toBe('bc')
      expect(dvala.run('next([1, 2, 3])')).toEqual([2, 3])
      expect(dvala.run('next([1])')).toBe(null)
      expect(dvala.run('next("a")')).toBe(null)
      expect(dvala.run('next("ab")')).toBe('b')
      expect(() => dvala.run('rest(42)')).toThrow()
    })

    it('take / drop / takeLast / dropLast with clamping', () => {
      expect(dvala.run('take([1, 2, 3, 4, 5], 3)')).toEqual([1, 2, 3])
      expect(dvala.run('take("Albert", 2)')).toBe('Al')
      expect(dvala.run('take([1, 2, 3], -1)')).toEqual([])
      expect(dvala.run('drop([1, 2, 3, 4, 5], 3)')).toEqual([4, 5])
      expect(dvala.run('drop("Albert", 50)')).toBe('')
      expect(dvala.run('takeLast([1, 2, 3, 4, 5], 3)')).toEqual([3, 4, 5])
      expect(dvala.run('takeLast([1, 2, 3, 4, 5], 50)')).toEqual([1, 2, 3, 4, 5])
      expect(dvala.run('dropLast([1, 2, 3, 4, 5], 3)')).toEqual([1, 2])
      expect(dvala.run('dropLast([1, 2, 3, 4, 5], 50)')).toEqual([])
      expect(() => dvala.run('take([1, 2, 3], "x")')).toThrow()
    })

    it('indexOf over arrays (deep equality) and strings (substring)', () => {
      expect(dvala.run('indexOf([5, 10, 15], 15)')).toBe(2)
      expect(dvala.run('indexOf([5, 10, 15], 99)')).toBe(null)
      expect(dvala.run('indexOf([[1], [2], [1]], [1])')).toBe(0)
      expect(dvala.run('indexOf("hello", "ll")')).toBe(2)
      expect(dvala.run('indexOf("hello", "x")')).toBe(null)
      expect(dvala.run('indexOf("hello", "")')).toBe(0) // empty substring -> 0
      expect(dvala.run('indexOf(null, 1)')).toBe(null)
    })

    it('find returns [key, value] or null and guards its inputs', () => {
      expect(dvala.run('find({ a: 1, b: 2 }, "a")')).toEqual(['a', 1])
      expect(dvala.run('find({ a: 1 }, "z")')).toBe(null)
      expect(() => dvala.run('find(5, "a")')).toThrow() // non-object
      expect(() => dvala.run('find({ a: 1 }, 5)')).toThrow() // non-string key
    })

    it('merge folds right-most wins, empty -> null, guards each object', () => {
      expect(dvala.run('merge({ a: 1 }, { b: 2 }, { a: 9 })')).toEqual({ a: 9, b: 2 })
      expect(dvala.run('merge({ a: 1 })')).toEqual({ a: 1 })
      expect(dvala.run('merge()')).toBe(null)
      expect(() => dvala.run('merge(5)')).toThrow() // first non-object
      expect(() => dvala.run('merge({ a: 1 }, 5)')).toThrow() // later non-object
    })

    it('zipmap pairs keys to values up to the shorter length, guards inputs', () => {
      expect(dvala.run('zipmap(["a", "b", "c"], [1, 2])')).toEqual({ a: 1, b: 2 })
      expect(dvala.run('zipmap([], [1])')).toEqual({})
      expect(() => dvala.run('zipmap(5, [1])')).toThrow() // keys not array
      expect(() => dvala.run('zipmap(["a"], 5)')).toThrow() // values not array
      expect(() => dvala.run('zipmap(["a", 5], [1, 2])')).toThrow() // non-string key
    })

    it('selectKeys keeps present string keys, guards inputs', () => {
      expect(dvala.run('selectKeys({ a: 1, b: 2, c: 3 }, ["a", "c", "z"])')).toEqual({ a: 1, c: 3 })
      expect(dvala.run('selectKeys({ a: 1 }, [])')).toEqual({})
      expect(() => dvala.run('selectKeys({ a: 1 }, 5)')).toThrow() // keys not array
      expect(() => dvala.run('selectKeys({ a: 1 }, ["a", 5])')).toThrow() // non-string key
      expect(() => dvala.run('selectKeys(5, ["a"])')).toThrow() // non-object
    })

    it('identity returns its argument unchanged', () => {
      expect(dvala.run('identity(42)')).toBe(42)
      expect(dvala.run('identity([1, 2])')).toEqual([1, 2])
      expect(dvala.run('identity(null)')).toBe(null)
    })

    it('mergeWith reports a proper type error on a non-object (regression: was "Undefined symbol type")', () => {
      expect(() => dvala.run('mergeWith(5, (a, b) -> a)')).toThrow(/Expected object/)
    })
  }
})
