import { describe, expect, it } from 'vitest'
import { Dvala } from '../src/Dvala/Dvala'

describe('object literals', () => {
  for (const dvala of [new Dvala(), new Dvala({ debug: true })]) {
    it('samples', () => {
      expect(dvala.run('{ "1": 1, "2": 2}')).toEqual({ 1: 1, 2: 2 })
      expect(dvala.run('{}')).toEqual({})
    })
  }
})
