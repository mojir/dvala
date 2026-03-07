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
      expect(runVec('moving-stdev([1, 2, 4, 7, 11, 16], 1)')).toEqual([0, 0, 0, 0, 0, 0])
      expect(runVec('moving-stdev([1, 2, 4, 7, 11, 16], 4)')).toEqual([2.29128784747792, 3.391164991562634, 4.5])
      expect(runVec('moving-stdev([1, 2, 4, 7, 11, 16], 6)')).toEqual([5.273097339852125])
    })
    it('should calculate the centered moving standard deviation of a vector with padding', () => {
      expect(runVec('centered-moving-stdev([1, 2, 4, 7], 4)')).toEqual([null, null, 2.29128784747792, null])
    })
    it('should calculate the running standard deviation of a vector', () => {
      expect(runVec('running-stdev([1, 2, 4, 7])')).toEqual([0, 0.5, 1.247219128924647, 2.29128784747792])
      expect(runVec('running-stdev([0])')).toEqual([0])
      expect(() => runVec('running-stdev([])')).toThrowError(DvalaError)
    })
  })

  describe('sample-stdev', () => {
    it('should calculate the sample standard deviation of a vector', () => {
      expect(runVec('sample-stdev([1, 2, 3])')).toEqual(1)
      expect(runVec('sample-stdev([1, 2, 2, 3])')).toEqual(0.816496580927726)
      expect(() => runVec('sample-stdev([0])')).toThrowError(DvalaError)
      expect(() => runVec('sample-stdev([])')).toThrowError(DvalaError)
    })
    it('should calculate the moving sample standard deviation of a vector', () => {
      expect(runVec('moving-sample-stdev([1, 2, 4, 7], 2)')).toEqual([0.7071067811865476, 1.4142135623730951, 2.1213203435596424])
      expect(runVec('moving-sample-stdev([1, 2, 4, 7], 4)')).toEqual([2.6457513110645907])
    })
    it('should calculate the centered moving sample standard deviation of a vector with padding', () => {
      expect(runVec('centered-moving-sample-stdev([1, 2, 4], 3)')).toEqual([null, 1.5275252316519465, null])
      expect(runVec('centered-moving-sample-stdev([1, 2, 4], 3, 0, 5)')).toEqual([1, 1.5275252316519465, 1.5275252316519465])
      expect(() => runVec('centered-moving-sample-stdev([1, 2, 4], 1)')).toThrowError(DvalaError)
    })
    it('should calculate the running sample standard deviation of a vector', () => {
      expect(runVec('running-sample-stdev([1, 2, 3])')).toEqual([null, 0.7071067811865476, 1])
      expect(runVec('running-sample-stdev([0, 1])')).toEqual([null, 0.7071067811865476])
      expect(() => runVec('running-sample-stdev([2])')).toThrowError(DvalaError)
      expect(() => runVec('running-sample-stdev([])')).toThrowError(DvalaError)
    })
  })
})
