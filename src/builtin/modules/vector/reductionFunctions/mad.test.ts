import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../../createDvala'
import { vectorModule } from '..'
import { DvalaError } from '../../../../errors'

const dvala = createDvala({ modules: [vectorModule] })

// Helper to run vec module functions with the new import syntax
function runVec(code: string): unknown {
  // Add module import prefix to function calls
  const modifiedCode = `let v = import("vector"); v.${code}`
  return dvala.run(modifiedCode)
}

describe('mad', () => {
  it('should calculate the mean absolute deviation of a vector', () => {
    expect(runVec('mad([1, 2, 3])')).toEqual(0.6666666666666666)
    expect(runVec('mad([1, 2, 2, 3])')).toEqual(0.5)
    expect(() => runVec('mad([])')).toThrowError(DvalaError)
  })
  it('should calculate the moving mean absolute deviation of a vector', () => {
    expect(runVec('movingMad([1, 2, 3, 4, 5, 6], 1)')).toEqual([0, 0, 0, 0, 0, 0])
    expect(runVec('movingMad([1, 2, 4, 7, 11], 3)')).toEqual([1, 1.6666666666666667, 2.3333333333333335])
    expect(runVec('movingMad([1, -2, -3], 2)')).toEqual([1.5, 0.5])
    expect(() => runVec('movingMad([1], 100)')).toThrow(DvalaError)
    expect(() => runVec('movingMad([], 1)')).toThrowError(DvalaError)
  })
  it('should calculate the centered moving mean absolute deviation of a vector with padding', () => {
    expect(runVec('centeredMovingMad([1, 2, 3, 4, 5], 3)')).toEqual([null, 0.6666666666666666, 0.6666666666666666, 0.6666666666666666, null])
    expect(runVec('centeredMovingMad([1, -2, -3], 2)')).toEqual([null, 1.5, 0.5])
    expect(() => runVec('centeredMovingMad([1], 100)')).toThrow(DvalaError)
    expect(() => runVec('centeredMovingMad([], 1)')).toThrowError(DvalaError)
  })
  it('should calculate the running mean absolute deviation of a vector', () => {
    expect(runVec('runningMad([1, 2, 3])')).toEqual([0, 0.5, 0.6666666666666666])
    expect(runVec('runningMad([1, -2, -3])')).toEqual([0, 1.5, 1.3333333333333333])
    expect(() => runVec('runningMad([])')).toThrowError(DvalaError)
  })
})
