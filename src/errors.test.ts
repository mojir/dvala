import { describe, expect, it } from 'vitest'
import { DvalaError } from './errors'

describe('getCodeMarker', () => {
  it('should return the code marker', () => {
    const error1 = new DvalaError('Error message', { code: '(str 1)', filePath: 'file.dvala', position: { line: 1, column: 1 } })
    expect(error1.getCodeMarker()).toBe('^      ')

    const error2 = new DvalaError(new Error('Error message'), { code: '(str 1)', filePath: 'file.dvala', position: { line: 1, column: 1 } })
    expect(error2.getCodeMarker()).toBe('^      ')

    const error3 = new DvalaError(new Error('Error message'), undefined)
    expect(error3.getCodeMarker()).toBeUndefined()
  })
})
