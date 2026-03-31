import { describe, expect, it } from 'vitest'
import { createDvala } from '../src/createDvala'

describe('object literals', () => {
  for (const dvala of [createDvala(), createDvala({ debug: true })]) {
    it('samples', () => {
      expect(dvala.run('{ "1": 1, "2": 2}')).toEqual({ 1: 1, 2: 2 })
      expect(dvala.run('{}')).toEqual({})
    })

    it('shorthand properties', () => {
      expect(dvala.run('let foo = 42; { foo }')).toEqual({ foo: 42 })
      expect(dvala.run('let x = 1; let y = 2; { x, y }')).toEqual({ x: 1, y: 2 })
      expect(dvala.run('let a = 1; { a, b: 2 }')).toEqual({ a: 1, b: 2 })
    })
  }
})
