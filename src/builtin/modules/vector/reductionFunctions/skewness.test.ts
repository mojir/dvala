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

describe('skewness functions', () => {
  describe('skewness', () => {
    it('should calculate the skewness of a vector', () => {
      expect(runVec('skewness([1, 2, 3, 6])')).toBeCloseTo(0.687243193)
      expect(runVec('skewness([1, 2, 2, 3])')).toEqual(0)
      expect(() => runVec('skewness([1, 1, 1, 1])')).toThrowError(DvalaError)
      expect(() => runVec('skewness([0, 1])')).toThrowError(DvalaError)
      expect(() => runVec('skewness([])')).toThrowError(DvalaError)
    })
    it('should calculate the moving skewness of a vector', () => {
      expect(runVec('movingSkewness([1, 2, 3, 4, 5], 3)')).toEqual([0, 0, 0])
      expect(runVec('movingSkewness([1, 2, 3, 4, 5], 5)')).toEqual([0])
      expect(() => runVec('movingSkewness([1, 2], 2)')).toThrowError(DvalaError)
    })
    it('should calculate the centered moving skewness of a vector with padding', () => {
      expect(runVec('centeredMovingSkewness([1, 2, 4, 7, 11], 4)')).toEqual([null, null, 0.4987837491108398, 0.3461680709723672, null])
      expect(() => runVec('centeredMovingSkewness([1, 2], 2)')).toThrowError(DvalaError)
    })
    it('should calculate the running skewness of a vector', () => {
      expect(runVec('runningSkewness([1, 2, 4, 7, 11])')).toEqual([null, null, 0.38180177416060584, 0.4987837491108398, 0.5504818825631803])
      expect(runVec('runningSkewness([-1, -2, -3])')).toEqual([null, null, 0])
      expect(() => runVec('runningSkewness([1, 2])')).toThrowError(DvalaError)
    })
  })
  describe('sampleSkewness', () => {
    it('should calculate the skewness of a vector', () => {
      expect(runVec('sampleSkewness([1, 2, 3, 6])')).toBeCloseTo(1.19034013)
      expect(runVec('sampleSkewness([1, 2, 2, 3])')).toEqual(0)
      expect(() => runVec('sampleSkewness([1, 1, 1, 1])')).toThrowError(DvalaError)
      expect(() => runVec('sampleSkewness([0, 1])')).toThrowError(DvalaError)
      expect(() => runVec('sampleSkewness([])')).toThrowError(DvalaError)
    })
    it('should calculate the moving sample skewness of a vector', () => {
      expect(runVec('movingSampleSkewness([1, 2, 3, 4, 5], 3)')).toEqual([0, 0, 0])
      expect(runVec('movingSampleSkewness([1, 2, 3, 4, 5], 5)')).toEqual([0])
      expect(() => runVec('movingSampleSkewness([1, 2], 2)')).toThrowError(DvalaError)
    })
    it('should calculate the centered moving sample skewness of a vector with padding', () => {
      expect(runVec('centeredMovingSampleSkewness([1, 2, 4, 7, 11, 16], 4)')).toEqual([null, null, 0.8639187954496621, 0.5995806868822491, 0.4561779904708154, null])
      expect(() => runVec('centeredMovingSampleSkewness([1, 2], 2)')).toThrowError(DvalaError)
    })
    it('should calculate the running sample skewness of a vector', () => {
      expect(runVec('runningSampleSkewness([1, 2, 4, 7, 11])')).toEqual([null, null, 0.9352195295828237, 0.8639187954496621, 0.8206099398622181])
      expect(runVec('runningSampleSkewness([-1, -2, -3])')).toEqual([null, null, 0])
      expect(() => runVec('runningSampleSkewness([1, 2])')).toThrowError(DvalaError)
    })
  })
})
