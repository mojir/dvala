import { describe, expect, it } from 'vitest'
import { DvalaError, RecurSignal, UserError, isDvalaError } from '../src/errors'
import { PersistentVector } from '../src/utils/persistent'

describe('errors', () => {
  it('recurSignal', () => {
    const err = new RecurSignal(PersistentVector.from([100]))
    expect(err).toBeInstanceOf(RecurSignal)
    expect(err.name).toBe('RecurSignal')
    expect(err.params).toEqual(PersistentVector.from([100]))
  })
  it('userDefinedError', () => {
    const err = new UserError('A message', {
      position: {
        line: 1,
        column: 1,
      },
      code: '(+ 1 2)',
    })
    expect(err).toBeInstanceOf(UserError)
    expect(err.name).toBe('UserError')
    expect(err.message).toBe('A message\nLocation 1:1\n(+ 1 2)\n^      ')
  })
  describe('isDvalaError', () => {
    it('isDvalaError', () => {
      const error = new Error('An error')
      const dvalaError = new DvalaError('An error', undefined)
      const recurSignal = new RecurSignal(PersistentVector.from([100]))
      const userDefinedError = new UserError('An error')

      expect(isDvalaError(dvalaError)).toBe(true)
      expect(isDvalaError(userDefinedError)).toBe(true)

      expect(isDvalaError(error)).toBe(false)
      expect(isDvalaError(recurSignal)).toBe(false)
      expect(isDvalaError({})).toBe(false)
      expect(isDvalaError(null)).toBe(false)
      expect(isDvalaError(undefined)).toBe(false)
    })
  })
})
