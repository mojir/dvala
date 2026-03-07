import { describe, expect, it } from 'vitest'
import { createDvala } from '../src/createDvala'

describe('array literals', () => {
  for (const dvala of [createDvala(), createDvala({ debug: true })]) {
    it('samples', () => {
      expect(dvala.run('[1, 2, 3]')).toEqual([1, 2, 3])
      expect(dvala.run('["1", null]')).toEqual(['1', null])
      expect(dvala.run('[]')).toEqual([])
    })
  }
})
