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

describe('mean functions', () => {
  describe('mean', () => {
    it('should calculate the moving mean of a vector', () => {
      expect(runVec('movingMean([1, 2, 3, 4, 5, 6], 1)')).toEqual([1, 2, 3, 4, 5, 6])
      expect(runVec('movingMean([1, 2, 3, 4, 5, 6], 3)')).toEqual([2, 3, 4, 5])
      expect(runVec('movingMean([1, 2, 3, 4, 5, 6], 6)')).toEqual([3.5])
    })
    it('should calculate the centered moving mean of a vector with padding', () => {
      expect(runVec('centeredMovingMean([1, 2, 3, 4, 5, 6], 1)')).toEqual([1, 2, 3, 4, 5, 6])
      expect(runVec('centeredMovingMean([1, 2, 3, 4, 5, 6], 2)')).toEqual([null, 1.5, 2.5, 3.5, 4.5, 5.5])
      expect(runVec('centeredMovingMean([1, 2, 3, 4, 5, 6], 2, 10)')).toEqual([5.5, 1.5, 2.5, 3.5, 4.5, 5.5])
      expect(runVec('centeredMovingMean([1, 2, 3, 4, 5, 6], 3)')).toEqual([null, 2, 3, 4, 5, null])
      expect(runVec('centeredMovingMean([1, 2, 3, 4, 5, 6], 4)')).toEqual([null, null, 10 / 4, 14 / 4, 18 / 4, null])
      expect(runVec('centeredMovingMean([1, 2, 3, 4, 5, 6], 5)')).toEqual([null, null, 3, 4, null, null])
      expect(runVec('centeredMovingMean([1, 2, 3, 4, 5, 6], 6)')).toEqual([null, null, null, 21 / 6, null, null])
    })
    it('should calculate the running mean of a vector', () => {
      expect(runVec('runningMean([1, 2, 3, 4, 5, 6])')).toEqual([1, 1.5, 2, 2.5, 3, 3.5])
      expect(runVec('runningMean([1, -3, 2])')).toEqual([1, -1, 0])
      expect(runVec('runningMean([-1, -2, -3])')).toEqual([-1, -1.5, -2])
      expect(runVec('runningMean([0])')).toEqual([0])
      expect(() => runVec('runningMean([])')).toThrowError(DvalaError)
    })
  })
  describe('geometricMean', () => {
    it('should calculate the geometric mean of a vector', () => {
      expect(runVec('geometricMean([2, 4, 8, 16])')).toBeCloseTo(5.656854)
      expect(runVec('geometricMean([1, 2, 2, 3])')).toBeCloseTo(1.8612097182041991)
      expect(() => runVec('geometricMean([])')).toThrowError(DvalaError)
    })
    it('should calculate the moving geometric mean of a vector', () => {
      expect(runVec('movingGeometricMean([1, 2, 3, 4, 5, 6], 1)')).toEqual([1, 2, 2.9999999999999996, 4, 5, 6])
      expect(runVec('movingGeometricMean([1, 2, 3, 4, 5, 6], 3)')).toEqual([1.8171205928321394, 2.8844991406148166, 3.9148676411688634, 4.93242414866094])
      expect(() => runVec('movingGeometricMean([1, -2, -3], 2)')).toThrow(DvalaError)
      expect(() => runVec('movingGeometricMean([1], 100)')).toThrow(DvalaError)
      expect(() => runVec('movingGeometricMean([], 1)')).toThrowError(DvalaError)
    })
    it('should calculate the centered moving geometric mean of a vector with padding', () => {
      expect(runVec('centeredMovingGeometricMean([1, 2, 3, 4, 5], 3)')).toEqual([null, 1.8171205928321394, 2.8844991406148166, 3.9148676411688634, null])
      expect(() => runVec('centeredMovingGeometricMean([1, -2, -3], 2)')).toThrow(DvalaError)
      expect(() => runVec('centeredMovingGeometricMean([1], 100)')).toThrow(DvalaError)
      expect(() => runVec('centeredMovingGeometricMean([], 1)')).toThrowError(DvalaError)
    })
    it('should calculate the running geometric mean of a vector', () => {
      expect(runVec('runningGeometricMean([1, 2, 3, 4, 5, 6])')).toEqual([1, 1.414213562373095, 1.8171205928321394, 2.213363839400643, 2.6051710846973517, 2.993795165523909])
      expect(() => runVec('runningGeometricMean([])')).toThrowError(DvalaError)
      expect(() => runVec('runningGeometricMean([1, -2, -3])')).toThrow(DvalaError)
    })
  })
  describe('harmonicMean', () => {
    it('should calculate the harmonic mean of a vector', () => {
      expect(runVec('harmonicMean([2, 4, 8, 16])')).toBeCloseTo(4.266666666667)
      expect(runVec('harmonicMean([1, 2, 2, 3])')).toBeCloseTo(1.7142857142857142)
      expect(() => runVec('harmonicMean([])')).toThrowError(DvalaError)
    })
    it('should calculate the moving harmonic mean of a vector', () => {
      expect(runVec('movingHarmonicMean([1, 2, 3, 4, 5, 6], 1)')).toEqual([1, 2, 3, 4, 5, 6])
      expect(runVec('movingHarmonicMean([1, 2, 3, 4, 5, 6], 3)')).toEqual([1.6363636363636365, 2.7692307692307696, 3.829787234042554, 4.864864864864865])
      expect(() => runVec('movingHarmonicMean([1], 100)')).toThrow(DvalaError)
      expect(() => runVec('movingHarmonicMean([], 1)')).toThrowError(DvalaError)
    })
    it('should calculate the centered moving harmonic mean of a vector with padding', () => {
      expect(runVec('centeredMovingHarmonicMean([1, 2, 3, 4, 5], 3)')).toEqual([null, 1.6363636363636365, 2.7692307692307696, 3.829787234042554, null])
      expect(() => runVec('centeredMovingHarmonicMean([1], 100)')).toThrow(DvalaError)
      expect(() => runVec('centeredMovingHarmonicMean([], 1)')).toThrowError(DvalaError)
    })
    it('should calculate the running harmonic mean of a vector', () => {
      expect(runVec('runningHarmonicMean([1, 2, 3, 4, 5, 6])')).toEqual([1, 1.3333333333333333, 1.6363636363636365, 1.9200000000000004, 2.18978102189781, 2.4489795918367347])
      expect(() => runVec('runningHarmonicMean([])')).toThrowError(DvalaError)
      expect(() => runVec('runningHarmonicMean([1], 100)')).toThrow(DvalaError)
    })
  })
})
