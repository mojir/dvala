import { describe, expect, it } from 'vitest'
import { createDvala } from '../src/createDvala'

describe('serializable bindings', () => {
  const dvala = createDvala()

  describe('valid bindings are accepted', () => {
    it('accepts null, booleans, strings, finite numbers', () => {
      expect(dvala.run('x', { scope: { x: null } })).toBeNull()
      expect(dvala.run('x', { scope: { x: true } })).toBe(true)
      expect(dvala.run('x', { scope: { x: 'hello' } })).toBe('hello')
      expect(dvala.run('x', { scope: { x: 42 } })).toBe(42)
    })

    it('accepts plain arrays and objects', () => {
      expect(dvala.run('x', { scope: { x: [1, 2, 3] } })).toEqual([1, 2, 3])
      expect(dvala.run('x', { scope: { x: { a: 1 } } })).toEqual({ a: 1 })
    })

    it('accepts deeply nested plain objects', () => {
      expect(dvala.run('x', { scope: { x: { a: { b: [1, 'two', null] } } } }))
        .toEqual({ a: { b: [1, 'two', null] } })
    })
  })

})
