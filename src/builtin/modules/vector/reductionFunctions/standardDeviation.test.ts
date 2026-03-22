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

describe('standard deviation functions', () => {
  describe('stdev', () => {
    it('should calculate the standard deviation of a vector', () => {
      expect(runVec('stdev([1, 2, 3])')).toEqual(0.816496580927726)
      expect(runVec('stdev([1, 2, 2, 3])')).toEqual(0.7071067811865476)
      expect(runVec('stdev([0])')).toEqual(0)
      expect(() => runVec('stdev([])')).toThrowError(DvalaError)
    })
    it('should calculate the moving standard deviation of a vector', () => {
      expect(runVec('movingStdev([1, 2, 4, 7, 11, 16], 1)')).toEqual([0, 0, 0, 0, 0, 0])
      expect(runVec('movingStdev([1, 2, 4, 7, 11, 16], 4)')).toEqual([2.29128784747792, 3.391164991562634, 4.5])
      expect(runVec('movingStdev([1, 2, 4, 7, 11, 16], 6)')).toEqual([5.273097339852125])
    })
    it('should calculate the centered moving standard deviation of a vector with padding', () => {
      expect(runVec('centeredMovingStdev([1, 2, 4, 7], 4)')).toEqual([null, null, 2.29128784747792, null])
    })
    it('should calculate the running standard deviation of a vector', () => {
      expect(runVec('runningStdev([1, 2, 4, 7])')).toEqual([0, 0.5, 1.247219128924647, 2.29128784747792])
      expect(runVec('runningStdev([0])')).toEqual([0])
      expect(() => runVec('runningStdev([])')).toThrowError(DvalaError)
    })
  })

  describe('sampleStdev', () => {
    it('should calculate the sample standard deviation of a vector', () => {
      expect(runVec('sampleStdev([1, 2, 3])')).toEqual(1)
      expect(runVec('sampleStdev([1, 2, 2, 3])')).toEqual(0.816496580927726)
      expect(() => runVec('sampleStdev([0])')).toThrowError(DvalaError)
      expect(() => runVec('sampleStdev([])')).toThrowError(DvalaError)
    })
    it('should calculate the moving sample standard deviation of a vector', () => {
      expect(runVec('movingSampleStdev([1, 2, 4, 7], 2)')).toEqual([0.7071067811865476, 1.4142135623730951, 2.1213203435596424])
      expect(runVec('movingSampleStdev([1, 2, 4, 7], 4)')).toEqual([2.6457513110645907])
    })
    it('should calculate the centered moving sample standard deviation of a vector with padding', () => {
      expect(runVec('centeredMovingSampleStdev([1, 2, 4], 3)')).toEqual([null, 1.5275252316519465, null])
      expect(runVec('centeredMovingSampleStdev([1, 2, 4], 3, 0, 5)')).toEqual([1, 1.5275252316519465, 1.5275252316519465])
      expect(() => runVec('centeredMovingSampleStdev([1, 2, 4], 1)')).toThrowError(DvalaError)
    })
    it('should calculate the running sample standard deviation of a vector', () => {
      expect(runVec('runningSampleStdev([1, 2, 3])')).toEqual([null, 0.7071067811865476, 1])
      expect(runVec('runningSampleStdev([0, 1])')).toEqual([null, 0.7071067811865476])
      expect(() => runVec('runningSampleStdev([2])')).toThrowError(DvalaError)
      expect(() => runVec('runningSampleStdev([])')).toThrowError(DvalaError)
    })
  })
})
