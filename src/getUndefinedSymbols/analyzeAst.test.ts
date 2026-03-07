import { describe, expect, it } from 'vitest'
import { getUndefinedSymbols } from '../tooling'

describe('analyze', () => {
  describe('getUndefinedSymbols.', () => {
    it('example', () => {
      expect(getUndefinedSymbols('a + b')).toEqual(new Set(['a', 'b']))
    })
  })
})
