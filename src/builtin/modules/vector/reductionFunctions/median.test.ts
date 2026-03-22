import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../../createDvala'
import { vectorModule } from '..'
import { DvalaError } from '../../../../errors'

const dvala = createDvala({ modules: [vectorModule] })

// Helper to run vec module functions with the new import syntax
function runVec(code: string): unknown {
  // Add module import prefix to function calls
  const modifiedCode = `let v = import(vector); v.${code}`
  return dvala.run(modifiedCode)
}

describe('median', () => {
  it('should calculate the moving median of a vector', () => {
    expect(runVec('movingMedian([1, 2, 3, 4, 5, 6], 1)')).toEqual([1, 2, 3, 4, 5, 6])
    expect(runVec('movingMedian([1, 2, 3, 4, 5, 6], 3)')).toEqual([2, 3, 4, 5])
    expect(runVec('movingMedian([1, 2, 3, 4, 5, 6], 6)')).toEqual([3.5])
  })
  it('should calculate the centered moving median of a vector with padding', () => {
    expect(runVec('centeredMovingMedian([1, 2, 3, 4, 5, 6], 1)')).toEqual([1, 2, 3, 4, 5, 6])
    expect(runVec('centeredMovingMedian([1, 2, 3, 4, 5, 6], 2)')).toEqual([null, 1.5, 2.5, 3.5, 4.5, 5.5])
    expect(runVec('centeredMovingMedian([1, 2, 3, 4, 5, 6], 2, 10)')).toEqual([5.5, 1.5, 2.5, 3.5, 4.5, 5.5])
    expect(runVec('centeredMovingMedian([1, 2, 3, 4, 5, 6], 3)')).toEqual([null, 2, 3, 4, 5, null])
  })
  it('should calculate the running median of a vector', () => {
    expect(runVec('runningMedian([1, 2, 3, 4, 5, 6])')).toEqual([1, 1.5, 2, 2.5, 3, 3.5])
    expect(runVec('runningMedian([1, -3, 2])')).toEqual([1, -1, 1])
    expect(runVec('runningMedian([-1, -2, -3])')).toEqual([-1, -1.5, -2])
    expect(runVec('runningMedian([0])')).toEqual([0])
    expect(() => runVec('runningMedian([])')).toThrowError(DvalaError)
  })
})
