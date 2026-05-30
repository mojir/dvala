import { describe, expect, it } from 'vitest'
import { getUndefinedSymbols } from '@mojir/dvala-core-tooling'
describe('analyze', () => {
  describe('getUndefinedSymbols.', () => {
    it('example', () => {
      expect(getUndefinedSymbols('a + b')).toEqual(new Set(['a', 'b']))
    })
  })
})
