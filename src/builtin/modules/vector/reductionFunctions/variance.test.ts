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

describe('variance functions', () => {
  describe('variance', () => {
    it('should calculate the variance of a vector', () => {
      expect(runVec('variance([1, 2, 3])')).toEqual(0.6666666666666666)
      expect(runVec('variance([1, 2, 3, 4, 5, 6])')).toEqual(2.9166666666666665)
      expect(runVec('variance([1, -3, 2])')).toEqual(4.666666666666667)
      expect(runVec('variance([-1, -2, -3])')).toEqual(0.6666666666666666)
      expect(runVec('variance([0])')).toEqual(0)
      expect(() => runVec('variance([])')).toThrowError(DvalaError)
    })
    it('should calculate the moving variance of a vector', () => {
      expect(runVec('movingVariance([1, 2, 4, 7, 11, 16], 1)')).toEqual([0, 0, 0, 0, 0, 0])
      expect(runVec('movingVariance([1, 2, 4, 7, 11, 16], 4)')).toEqual([5.25, 11.5, 20.25])
      expect(runVec('movingVariance([1, 2, 4, 7, 11, 16], 6)')).toEqual([27.805555555555557])
    })
    it('should calculate the centered moving variance of a vector with padding', () => {
      expect(runVec('centeredMovingVariance([1, 2, 4, 7, 11, 16], 4)')).toEqual([null, null, 5.25, 11.5, 20.25, null])
      expect(runVec('centeredMovingVariance([1, 2, 4, 7, 11, 16], 6)')).toEqual([null, null, null, 27.805555555555557, null, null])
    })
    it('should calculate the running variance of a vector', () => {
      expect(runVec('runningVariance([1, 2, 3, 4, 5, 6])')).toEqual([0, 0.25, 0.6666666666666666, 1.25, 2, 2.9166666666666665])
      expect(runVec('runningVariance([0])')).toEqual([0])
      expect(() => runVec('runningVariance([])')).toThrowError(DvalaError)
    })
  })

  describe('sampleVariance', () => {
    it('should calculate the sample variance of a vector', () => {
      expect(runVec('sampleVariance([1, 2, 3])')).toEqual(1)
      expect(runVec('sampleVariance([1, 2, 2, 3])')).toEqual(0.6666666666666666)
      expect(() => runVec('sampleVariance([0])')).toThrowError(DvalaError)
      expect(() => runVec('sampleVariance([])')).toThrowError(DvalaError)
    })
    it('should calculate the moving sample variance of a vector', () => {
      expect(runVec('movingSampleVariance([1, 2, 4, 7, 11, 16], 2)')).toEqual([0.5, 2, 4.5, 8, 12.5])
      expect(runVec('movingSampleVariance([1, 2, 4, 7, 11, 16], 6)')).toEqual([33.366666666666667])
    })
    it('should calculate the centered moving sample variance of a vector with padding', () => {
      expect(runVec('centeredMovingSampleVariance([1, 2, 4], 3)')).toEqual([null, 2.333333333333333, null])
      expect(runVec('centeredMovingSampleVariance([1, 2, 4], 3, 0, 5)')).toEqual([1, 2.333333333333333, 2.333333333333333])
      expect(runVec('centeredMovingSampleVariance([1, 2, 4], 3, null, 5)')).toEqual([null, 2.333333333333333, 2.333333333333333])
      expect(runVec('centeredMovingSampleVariance([1, 2, 4], 3, 0)')).toEqual([1, 2.333333333333333, null])
      expect(() => runVec('centeredMovingSampleVariance([1, 2, 4], 1)')).toThrowError(DvalaError)
    })
    it('should calculate the running sample variance of a vector', () => {
      expect(runVec('runningSampleVariance([1, 2, 3])')).toEqual([null, 0.5, 1])
      expect(runVec('runningSampleVariance([0, 1])')).toEqual([null, 0.5])
      expect(() => runVec('runningSampleVariance([2])')).toThrowError(DvalaError)
      expect(() => runVec('runningSampleVariance([1])')).toThrowError(DvalaError)
    })
  })
})
