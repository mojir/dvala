import { describe, expect, test } from 'vitest'
import { DvalaError } from '@mojir/dvala-types'
import { asBinaryOperator, asSymbolicOperator } from './operators'

describe('operators', () => {
  describe('guards', () => {
    test('asBinaryOperator', () => {
      expect(() => asBinaryOperator('??')).not.toThrow()
      expect(() => asBinaryOperator('...')).toThrow(DvalaError)
    })
    test('asSymbolOperator', () => {
      expect(() => asSymbolicOperator('??')).not.toThrow()
      expect(() => asSymbolicOperator('...')).not.toThrow()
      expect(() => asSymbolicOperator('a')).toThrow()
    })
  })
})
