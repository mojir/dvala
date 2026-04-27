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

describe('giniCoefficient', () => {
  it('should calculate giniCoefficient of a vector', () => {
    expect(runVec('giniCoefficient([1, 2, 3])')).toEqual(0.22222222222222232)
    expect(runVec('giniCoefficient([1, 1, 3])')).toEqual(0.26666666666666683)
    expect(runVec('giniCoefficient([0, 0, 0])')).toEqual(0)
    expect(() => runVec('giniCoefficient([-1, 0, 0])')).toThrow(DvalaError)
    expect(() => runVec('giniCoefficient([])')).toThrowError(DvalaError)
  })
  it('should calculate the moving giniCoefficient of a vector', () => {
    expect(runVec('movingGiniCoefficient([1, 2, 3], 2)')).toEqual([0.16666666666666674, 0.10000000000000009])
    expect(runVec('movingGiniCoefficient([1, 1, 3], 2)')).toEqual([0, 0.25])
    expect(runVec('movingGiniCoefficient([0, 0, 0], 2)')).toEqual([0, 0])
    expect(() => runVec('movingGiniCoefficient([], 2)')).toThrowError(DvalaError)
  })
  it('should calculate the centered moving giniCoefficient of a vector with padding', () => {
    expect(runVec('centeredMovingGiniCoefficient([1, 2, 3], 2)')).toEqual([
      null,
      0.16666666666666674,
      0.10000000000000009,
    ])
    expect(runVec('centeredMovingGiniCoefficient([1, 1, 3], 2)')).toEqual([null, 0, 0.25])
    expect(runVec('centeredMovingGiniCoefficient([0, 0, 0], 2)')).toEqual([null, 0, 0])
    expect(() => runVec('centeredMovingGiniCoefficient([], 2)')).toThrowError(DvalaError)
  })
  it('should calculate the running giniCoefficient of a vector', () => {
    expect(runVec('runningGiniCoefficient([1, 2, 3])')).toEqual([0, 0.16666666666666674, 0.22222222222222232])
    expect(runVec('runningGiniCoefficient([1, 1, 3])')).toEqual([0, 0, 0.26666666666666683])
    expect(runVec('runningGiniCoefficient([0, 0, 0])')).toEqual([0, 0, 0])
    expect(() => runVec('runningGiniCoefficient([])')).toThrowError(DvalaError)
  })
})
