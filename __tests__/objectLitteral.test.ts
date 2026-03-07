import { describe, expect, it } from 'vitest'
import { createDvala } from '../src/createDvala'

describe('object literals', () => {
  for (const dvala of [createDvala(), createDvala({ debug: true })]) {
    it('samples', () => {
      expect(dvala.run('{ "1": 1, "2": 2}')).toEqual({ 1: 1, 2: 2 })
      expect(dvala.run('{}')).toEqual({})
    })
  }
})
