import { describe, expect, it } from 'vitest'
import { Dvala } from '../src/Dvala/Dvala'

describe('serializable bindings', () => {
  const dvala = new Dvala()

  describe('valid bindings are accepted', () => {
    it('accepts null, booleans, strings, finite numbers', () => {
      expect(dvala.run('x', { bindings: { x: null } })).toBeNull()
      expect(dvala.run('x', { bindings: { x: true } })).toBe(true)
      expect(dvala.run('x', { bindings: { x: 'hello' } })).toBe('hello')
      expect(dvala.run('x', { bindings: { x: 42 } })).toBe(42)
    })

    it('accepts plain arrays and objects', () => {
      expect(dvala.run('x', { bindings: { x: [1, 2, 3] } })).toEqual([1, 2, 3])
      expect(dvala.run('x', { bindings: { x: { a: 1 } } })).toEqual({ a: 1 })
    })

    it('accepts deeply nested plain objects', () => {
      expect(dvala.run('x', { bindings: { x: { a: { b: [1, 'two', null] } } } }))
        .toEqual({ a: { b: [1, 'two', null] } })
    })
  })

  describe('invalid bindings are rejected', () => {
    it('rejects a top-level function', () => {
      expect(() => dvala.run('x', { bindings: { x: () => 42 } }))
        .toThrow('bindings["x"] is not serializable (function)')
    })

    it('rejects a function nested in an object', () => {
      expect(() => dvala.run('x', { bindings: { x: { fn: () => 42 } } }))
        .toThrow('bindings["x"].fn is not serializable (function)')
    })

    it('rejects a function nested in an array', () => {
      expect(() => dvala.run('x', { bindings: { x: [1, () => 2] } }))
        .toThrow('bindings["x"][1] is not serializable (function)')
    })

    it('rejects NaN', () => {
      expect(() => dvala.run('x', { bindings: { x: Number.NaN } }))
        .toThrow('bindings["x"] is not serializable')
    })

    it('rejects Infinity', () => {
      expect(() => dvala.run('x', { bindings: { x: Infinity } }))
        .toThrow('bindings["x"] is not serializable')
    })

    it('rejects a Date object', () => {
      expect(() => dvala.run('x', { bindings: { x: new Date() } }))
        .toThrow('bindings["x"] is not serializable (not a plain object)')
    })

    it('rejects on async.run too', async () => {
      await expect(dvala.async.run('x', { bindings: { x: () => 1 } }))
        .rejects.toThrow('bindings["x"] is not serializable (function)')
    })
  })
})
