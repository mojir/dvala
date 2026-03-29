import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../createDvala'
import { DvalaError } from '../../../errors'
import { vectorModule } from './'

const dvala = createDvala({ modules: [vectorModule] })

// Helper to run vec module functions with the new import syntax
function runVec(code: string): unknown {
  // Replace 'vec:functionName(' with 'let v = import("vector"); v.functionName('
  const modifiedCode = code.replace(/vec:(\S+?)\(/g, 'let v = import("vector"); v.$1(')
  return dvala.run(modifiedCode)
}

describe('vector functions', () => {
  describe('vec:isMonotonic', () => {
    it('should determine if a vector is monotonic', () => {
      expect(runVec('vec:isMonotonic([1, 2, 3])')).toEqual(true)
      expect(runVec('vec:isMonotonic([1, 2, 3, 2])')).toEqual(false)
      expect(runVec('vec:isMonotonic([1, 2, 3, 4])')).toEqual(true)
      expect(runVec('vec:isMonotonic([4, 3, 2, 1])')).toEqual(true)
      expect(runVec('vec:isMonotonic([4, 3, 2, 1, 1, 1])')).toEqual(true)
      expect(runVec('vec:isMonotonic([])')).toEqual(true)
    })
  })
  describe('vec:isStrictlyMonotonic', () => {
    it('should determine if a vector is monotonic', () => {
      expect(runVec('vec:isStrictlyMonotonic([1, 2, 3])')).toEqual(true)
      expect(runVec('vec:isStrictlyMonotonic([1, 2, 3, 2])')).toEqual(false)
      expect(runVec('vec:isStrictlyMonotonic([1, 2, 3, 4])')).toEqual(true)
      expect(runVec('vec:isStrictlyMonotonic([4, 3, 2, 1])')).toEqual(true)
      expect(runVec('vec:isStrictlyMonotonic([4, 3, 2, 1, 1, 1])')).toEqual(false)
      expect(runVec('vec:isStrictlyMonotonic([])')).toEqual(true)
    })
  })
  describe('vec:isIncreasing', () => {
    it('should determine if a vector is monotonic increasing', () => {
      expect(runVec('vec:isIncreasing([1, 2, 3])')).toEqual(true)
      expect(runVec('vec:isIncreasing([1, 2, 2, 3, 2])')).toEqual(false)
      expect(runVec('vec:isIncreasing([1, 2, 2, 3, 4])')).toEqual(true)
      expect(runVec('vec:isIncreasing([4, 3, 2, 1])')).toEqual(false)
      expect(runVec('vec:isIncreasing([])')).toEqual(true)
    })
  })
  describe('vec:isDecreasing', () => {
    it('should determine if a vector is monotonic decreasing', () => {
      expect(runVec('vec:isDecreasing([1, 2, 2, 3])')).toEqual(false)
      expect(runVec('vec:isDecreasing([1, 2, 3, 2])')).toEqual(false)
      expect(runVec('vec:isDecreasing([1, 2, 3, 4])')).toEqual(false)
      expect(runVec('vec:isDecreasing([4, 3, 2, 2, 1])')).toEqual(true)
      expect(runVec('vec:isDecreasing([4, 4, 3, 2, 2, 1])')).toEqual(true)
      expect(runVec('vec:isDecreasing([])')).toEqual(true)
    })
  })
  describe('vec:isStrictlyIncreasing', () => {
    it('should determine if a vector is strictly monotonic increasing', () => {
      expect(runVec('vec:isStrictlyIncreasing([1, 2, 3])')).toEqual(true)
      expect(runVec('vec:isStrictlyIncreasing([1, 2, 3, 2])')).toEqual(false)
      expect(runVec('vec:isStrictlyIncreasing([1, 2, 3, 4])')).toEqual(true)
      expect(runVec('vec:isStrictlyIncreasing([1, 1, 2, 3, 4])')).toEqual(false)
      expect(runVec('vec:isStrictlyIncreasing([4, 3, 2, 1])')).toEqual(false)
      expect(runVec('vec:isStrictlyIncreasing([])')).toEqual(true)
    })
  })
  describe('vec:isStrictlyDecreasing', () => {
    it('should determine if a vector is strictly monotonic decreasing', () => {
      expect(runVec('vec:isStrictlyDecreasing([1, 2, 3])')).toEqual(false)
      expect(runVec('vec:isStrictlyDecreasing([1, 2, 3, 2])')).toEqual(false)
      expect(runVec('vec:isStrictlyDecreasing([1, 2, 3, 4])')).toEqual(false)
      expect(runVec('vec:isStrictlyDecreasing([4, 3, 2, 1])')).toEqual(true)
      expect(runVec('vec:isStrictlyDecreasing([4, 3, 3, 2, 1])')).toEqual(false)
      expect(runVec('vec:isStrictlyDecreasing([])')).toEqual(true)
    })
  })
  describe('vec:mode', () => {
    it('should calculate the mode of a vector', () => {
      expect(runVec('vec:mode([1, 2, 3])')).toEqual([1, 2, 3])
      expect(runVec('vec:mode([1, 2, 2, 3])')).toEqual([2])
      expect(runVec('vec:mode([0])')).toEqual([0])
      expect(() => runVec('vec:mode([])')).toThrowError(DvalaError)
    })
  })
  describe('vec:minIndex', () => {
    it('should find the index of the minimum value in a vector', () => {
      expect(runVec('vec:minIndex([1, 2, 3])')).toEqual(0)
      expect(runVec('vec:minIndex([3, 2, 1])')).toEqual(2)
      expect(runVec('vec:minIndex([0])')).toEqual(0)
      expect(() => runVec('vec:minIndex([])')).toThrowError(DvalaError)
    })
  })
  describe('vec:maxIndex', () => {
    it('should find the index of the maximum value in a vector', () => {
      expect(runVec('vec:maxIndex([1, 2, 3])')).toEqual(2)
      expect(runVec('vec:maxIndex([3, 2, 1])')).toEqual(0)
      expect(runVec('vec:maxIndex([0])')).toEqual(0)
      expect(() => runVec('vec:maxIndex([])')).toThrowError(DvalaError)
    })
  })
  describe('vec:sortIndices', () => {
    it('should sort the indices of a vector', () => {
      expect(runVec('vec:sortIndices([1, 2, 3])')).toEqual([0, 1, 2])
      expect(runVec('vec:sortIndices([3, 2, 1])')).toEqual([2, 1, 0])
      expect(runVec('vec:sortIndices([0])')).toEqual([0])
      expect(runVec('vec:sortIndices([])')).toEqual([])
    })
  })
  describe('vec:countValues', () => {
    it('should count the occurrences of each value in a vector', () => {
      expect(runVec('vec:countValues([1, 2, 3])')).toEqual([[1, 1], [2, 1], [3, 1]])
      expect(runVec('vec:countValues([1, 2, 2, 3])')).toEqual([[2, 2], [1, 1], [3, 1]])
      expect(runVec('vec:countValues([0])')).toEqual([[0, 1]])
      expect(runVec('vec:countValues([])')).toEqual([])
      expect(runVec('vec:countValues([1, 2, 3, 1])')).toEqual([[1, 2], [2, 1], [3, 1]])
    })
  })
  describe('vec:linspace', () => {
    it('should create a linearly spaced vector', () => {
      expect(runVec('vec:linspace(1, 10, 5)')).toEqual([1, 3.25, 5.5, 7.75, 10])
      expect(runVec('vec:linspace(1, 10, 0)')).toEqual([])
      expect(() => runVec('vec:linspace(1, 10, -1)')).toThrowError(DvalaError)
      expect(runVec('vec:linspace(1, 10, 1)')).toEqual([1])
      expect(() => runVec('vec:linspace(1, 10)')).toThrowError(DvalaError)
    })
  })
  describe('vec:cumsum', () => {
    it('should calculate the cumulative sum of a vector', () => {
      expect(runVec('vec:cumsum([1, 2, 3])')).toEqual([1, 3, 6])
      expect(runVec('vec:cumsum([1, -2, 3])')).toEqual([1, -1, 2])
      expect(runVec('vec:cumsum([-1, -2, -3])')).toEqual([-1, -3, -6])
      expect(runVec('vec:cumsum([0])')).toEqual([0])
      expect(runVec('vec:cumsum([])')).toEqual([])
    })
  })
  describe('vec:cumprod', () => {
    it('should calculate the cumulative product of a vector', () => {
      expect(runVec('vec:cumprod([1, 2, 3])')).toEqual([1, 2, 6])
      expect(runVec('vec:cumprod([1, -2, 3])')).toEqual([1, -2, -6])
      expect(runVec('vec:cumprod([1, 0, 1])')).toEqual([1, 0, 0])
      expect(runVec('vec:cumprod([-1, -2, -3])')).toEqual([-1, 2, -6])
      expect(runVec('vec:cumprod([0])')).toEqual([0])
      expect(runVec('vec:cumprod([])')).toEqual([])
    })
  })
  describe('vec:quartiles', () => {
    it('should calculate the quartiles of a vector', () => {
      expect(runVec('vec:quartiles([1, 2, 3, 4])')).toEqual([1.5, 2.5, 3.5])
      expect(runVec('vec:quartiles([1, 2, 3, 4, 5])')).toEqual([1.5, 3, 4.5])
      expect(() => runVec('vec:quartiles([1])')).toThrowError(DvalaError)
      expect(() => runVec('vec:quartiles([1, 2, 3])')).toThrowError(DvalaError)
      expect(() => runVec('vec:quartiles([])')).toThrowError(DvalaError)
    })
  })
  describe('vec:percentile', () => {
    it('should calculate the percentile of a vector', () => {
      expect(runVec('vec:percentile([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 0)')).toEqual(10)
      expect(runVec('vec:percentile([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 25)')).toEqual(32.5)
      expect(runVec('vec:percentile([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 50)')).toEqual(55)
      expect(runVec('vec:percentile([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 75)')).toEqual(77.5)
      expect(runVec('vec:percentile([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 100)')).toEqual(100)

      expect(runVec('vec:percentile([1], 0.5)')).toBe(1)
      expect(runVec('vec:percentile([1], 50)')).toBe(1)
      expect(runVec('vec:percentile([1], 0)')).toBe(1)
      expect(runVec('vec:percentile([1], 100)')).toBe(1)

      expect(runVec('vec:percentile([42, 15, 87, 23, 56, 91, 34, 68, 72, 29], 0)')).toEqual(15)
      expect(runVec('vec:percentile([42, 15, 87, 23, 56, 91, 34, 68, 72, 29], 25)')).toEqual(30.25)
      expect(runVec('vec:percentile([42, 15, 87, 23, 56, 91, 34, 68, 72, 29], 50)')).toEqual(49)
      expect(runVec('vec:percentile([42, 15, 87, 23, 56, 91, 34, 68, 72, 29], 75)')).toEqual(71)
      expect(runVec('vec:percentile([42, 15, 87, 23, 56, 91, 34, 68, 72, 29], 100)')).toEqual(91)

      expect(runVec('vec:percentile([5, 10, 15, 20, 25], 0)')).toEqual(5)
      expect(runVec('vec:percentile([5, 10, 15, 20, 25], 25)')).toEqual(10)
      expect(runVec('vec:percentile([5, 10, 15, 20, 25], 50)')).toEqual(15)
      expect(runVec('vec:percentile([5, 10, 15, 20, 25], 75)')).toEqual(20)
      expect(runVec('vec:percentile([5, 10, 15, 20, 25], 100)')).toEqual(25)
    })
  })
  describe('vec:quantile', () => {
    it('should calculate the quantile of a vector', () => {
      expect(runVec('vec:quantile([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 0)')).toEqual(10)
      expect(runVec('vec:quantile([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 0.25)')).toEqual(32.5)
      expect(runVec('vec:quantile([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 0.50)')).toEqual(55)
      expect(runVec('vec:quantile([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 0.75)')).toEqual(77.5)
      expect(runVec('vec:quantile([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 1)')).toEqual(100)

      expect(runVec('vec:quantile([1], 0.5)')).toBe(1)
      expect(runVec('vec:quantile([1], 0)')).toBe(1)
      expect(runVec('vec:quantile([1], 1)')).toBe(1)

      expect(runVec('vec:quantile([42, 15, 87, 23, 56, 91, 34, 68, 72, 29], 0)')).toEqual(15)
      expect(runVec('vec:quantile([42, 15, 87, 23, 56, 91, 34, 68, 72, 29], 0.25)')).toEqual(30.25)
      expect(runVec('vec:quantile([42, 15, 87, 23, 56, 91, 34, 68, 72, 29], 0.50)')).toEqual(49)
      expect(runVec('vec:quantile([42, 15, 87, 23, 56, 91, 34, 68, 72, 29], 0.75)')).toEqual(71)
      expect(runVec('vec:quantile([42, 15, 87, 23, 56, 91, 34, 68, 72, 29], 1)')).toEqual(91)

      expect(runVec('vec:quantile([5, 10, 15, 20, 25], 0)')).toEqual(5)
      expect(runVec('vec:quantile([5, 10, 15, 20, 25], 0.25)')).toEqual(10)
      expect(runVec('vec:quantile([5, 10, 15, 20, 25], 0.50)')).toEqual(15)
      expect(runVec('vec:quantile([5, 10, 15, 20, 25], 0.75)')).toEqual(20)
      expect(runVec('vec:quantile([5, 10, 15, 20, 25], 1)')).toEqual(25)
    })
  })
  describe('vec:histogram', () => {
    it('should calculate the histogram of a vector', () => {
      expect(runVec('vec:histogram([1, 2, 2, 3, 2, 6, 4, 3, 2, 4, 1, 3, 2, 9], 3)')).toEqual([
        [
          1,
          3.6666666666666665,
          10,
        ],
        [
          3.6666666666666665,
          6.333333333333333,
          3,
        ],
        [
          6.333333333333333,
          9,
          1,
        ],
      ])
      expect(runVec('vec:histogram([1, 2, 3], 5)')).toEqual([
        [
          1,
          1.4,
          1,
        ],
        [
          1.4,
          1.8,
          0,
        ],
        [
          1.8,
          2.2,
          1,
        ],
        [
          2.2,
          2.6,
          0,
        ],
        [
          2.6,
          3,
          1,
        ],
      ])
      expect(runVec('vec:histogram([0], 5)')).toEqual([
        [
          0,
          0,
          1,
        ],
        [
          0,
          0,
          0,
        ],
        [
          0,
          0,
          0,
        ],
        [
          0,
          0,
          0,
        ],
        [
          0,
          0,
          0,
        ],
      ])
      expect(runVec('vec:histogram([], 5)')).toEqual([
        [
          0,
          0,
          0,
        ],
        [
          0,
          0,
          0,
        ],
        [
          0,
          0,
          0,
        ],
        [
          0,
          0,
          0,
        ],
        [
          0,
          0,
          0,
        ],
      ])
    })
  })
  describe('vec:ecdf', () => {
    it('should calculate the cumulative distribution function of a vector', () => {
      expect(runVec('vec:ecdf([1, 2, 2, 3, 2, 6, 4, 3, 2, 4, 1, 3, 2, 9, 10], 5)')).toBe(0.8)
      expect(runVec('vec:ecdf([1, 2, 2, 3, 2, 6, 4, 3, 2, 4, 1, 3, 2, 9, 10, 12], 5)')).toEqual(0.75)
      expect(runVec('vec:ecdf([1], 3)')).toEqual(1)
      expect(runVec('vec:ecdf([1], 0)')).toEqual(0)
      expect(() => runVec('vec:ecdf([], 1)')).toThrow(DvalaError)
    })
  })
  describe('vec:isOutliers', () => {
    it('should check if a vector has no extreme outliers', () => {
      expect(runVec('vec:isOutliers([1, 2, 3])')).toEqual(false)
      expect(runVec('vec:isOutliers([1, 2, 3, 4, 2, 1, 100])')).toEqual(true)
      expect(runVec('vec:isOutliers([1, 2, 0, 2, -100])')).toEqual(true)
      expect(runVec('vec:isOutliers([1])')).toEqual(false)
      expect(runVec('vec:isOutliers([])')).toBe(false)
    })
  })
  describe('vec:outliers', () => {
    it('should find the extreme outliers in a vector', () => {
      expect(runVec('vec:outliers([1, 2, 3])')).toEqual([])
      expect(runVec('vec:outliers([1, 2, 3, 4, 2, 1, 100])')).toEqual([100])
      expect(runVec('vec:outliers([1, 2, 0, 2, -100])')).toEqual([-100])
      expect(runVec('vec:outliers([1])')).toEqual([])
      expect(runVec('vec:outliers([])')).toEqual([])
      expect(runVec('vec:outliers([10, 20, 30, 40, 50, 60, 70, 80])')).toEqual([])
    })
  })
  describe('vec:bincount', () => {
    it('should count the occurrences of each value in a vector', () => {
      expect(runVec('vec:bincount([])')).toEqual([])
      expect(runVec('vec:bincount([], 2)')).toEqual([0, 0])
      expect(runVec('vec:bincount([1, 2, 3])')).toEqual([0, 1, 1, 1])
      expect(runVec('vec:bincount([1, 2, 2, 3])')).toEqual([0, 1, 2, 1])
      expect(runVec('vec:bincount([1, 2, 2, 3], 5)')).toEqual([0, 1, 2, 1, 0])
      expect(runVec('vec:bincount([1, 2, 2, 3], 5, [1, 2, 3, 4])')).toEqual([0, 1, 5, 4, 0])
      expect(() => runVec('vec:bincount([1, 2, 2, 3], 5, [1, 2, 3])')).toThrowError(DvalaError)
    })
  })
  describe('vec:winsorize', () => {
    it('should winsorize a vector', () => {
      expect(runVec('vec:winsorize([2, 5, 8, 10, 15, 18, 20, 35, 60, 100], 0.1, 0.9)')).toEqual([5, 5, 8, 10, 15, 18, 20, 35, 60, 60])
      expect(runVec('vec:winsorize([2, 5, 8, 10, 15, 18, 20, 35, 60, 100], 0.2, 1)')).toEqual([8, 8, 8, 10, 15, 18, 20, 35, 60, 100])
      expect(runVec('vec:winsorize([2, 5, 8, 10, 15, 18, 20, 35, 60, 100], 0, 1)')).toEqual([2, 5, 8, 10, 15, 18, 20, 35, 60, 100])
      expect(runVec('vec:winsorize([2, 5, 8, 10, 15, 18, 20, 35, 60, 100], 0, 0)')).toEqual([2, 2, 2, 2, 2, 2, 2, 2, 2, 2])
      expect(runVec('vec:winsorize([2, 5, 8, 10, 15, 18, 20, 35, 60, 100], 0.1, 0.1)')).toEqual([5, 5, 5, 5, 5, 5, 5, 5, 5, 5])
      expect(runVec('vec:winsorize([2, 5, 8, 10, 15, 18, 20, 35, 60, 100], 0.6)')).toEqual([20, 20, 20, 20, 20, 20, 20, 35, 60, 100])
      expect(runVec('vec:winsorize([10, 20, 30, 40, 50], 0, 0.79)')).toEqual([10, 20, 30, 30, 30])
      expect(runVec('vec:winsorize([10, 20, 30, 40, 50], 0, 0)')).toEqual([10, 10, 10, 10, 10])
      expect(runVec('vec:winsorize([], 0.05)')).toEqual([])
    })
  })
  describe('vec:mse', () => {
    it('should calculate the mean squared error between two vectors', () => {
      expect(runVec('vec:mse([1, 2, 3], [1, 2, 3])')).toEqual(0)
      expect(runVec('vec:mse([1, 2, 3], [4, 5, 6])')).toEqual(9)
      expect(runVec('vec:mse([1, 2], [1, 1])')).toEqual(0.5)
      expect(runVec('vec:mse([1], [1])')).toEqual(0)
      expect(() => runVec('vec:mse([], [])')).toThrowError(DvalaError)
      expect(() => runVec('vec:mse([2, 1], [1])')).toThrowError(DvalaError)
    })
  })
  describe('vec:mae', () => {
    it('should calculate the mean absolute error between two vectors', () => {
      expect(runVec('vec:mae([1, 2, 3], [1, 2, 3])')).toEqual(0)
      expect(runVec('vec:mae([1, 2, 3], [4, 5, 6])')).toEqual(3)
      expect(runVec('vec:mae([1, 2], [1, 1])')).toEqual(0.5)
      expect(runVec('vec:mae([1], [1])')).toEqual(0)
      expect(() => runVec('vec:mae([], [])')).toThrowError(DvalaError)
      expect(() => runVec('vec:mae([2, 1], [2])')).toThrowError(DvalaError)
    })
  })
  describe('vec:rmse', () => {
    it('should calculate the root mean squared error between two vectors', () => {
      expect(runVec('vec:rmse([1, 2, 3], [1, 2, 3])')).toEqual(0)
      expect(runVec('vec:rmse([1, 2, 3], [4, 5, 6])')).toEqual(3)
      expect(runVec('vec:rmse([1, 2], [1, 1])')).toEqual(0.7071067811865476)
      expect(runVec('vec:rmse([1], [1])')).toEqual(0)
      expect(() => runVec('vec:rmse([], [])')).toThrowError(DvalaError)
      expect(() => runVec('vec:rmse([2, 1], [1])')).toThrowError(DvalaError)
    })
  })
  describe('vec:smape', () => {
    it('should calculate the symmetric mean absolute percentage error between two vectors', () => {
      expect(runVec('vec:smape([1, 2, 3], [1, 2, 3])')).toEqual(0)
      expect(runVec('vec:smape([1, 2, 3], [4, 5, 6])')).toEqual(0.9079365079365078)
      expect(runVec('vec:smape([0, 1, 2], [0, 3, 4])')).toEqual(0.5555555555555555)
      expect(runVec('vec:smape([1, 2], [1, 1])')).toEqual(0.3333333333333333)
      expect(runVec('vec:smape([1], [1])')).toEqual(0)
      expect(() => runVec('vec:smape([], [])')).toThrowError(DvalaError)
      expect(() => runVec('vec:smape([2, 1], [2])')).toThrowError(DvalaError)
    })
  })
})
