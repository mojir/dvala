import { RuntimeError } from '../../../errors'
import type { Any } from '../../../interface'
import { assertNonEmptyVector, assertVector } from '../../../typeGuards/annotatedCollections'
import { assertNumber } from '../../../typeGuards/number'
import { toFixedArity } from '../../../utils/arity'
import type { BuiltinNormalExpressions } from '../../../builtin/interface'
import type { DvalaModule } from '../interface'
import { moduleDocs } from './docs'
import { bincount } from './bincount'
import { calcHistogram } from './histogram'
import { mode } from './mode'
import { hasOutliers, outliers } from './outliers'
import { calcPercentile } from './percentile'
import { quartiles } from './quartiles'
import { reductionFunctionNormalExpressions } from './reductionFunctions'
import vectorModuleSource from './vector.dvala'

function calcMedian(vector: number[]): number {
  const sorted = [...vector].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!
}

const vectorFunctions: BuiltinNormalExpressions = {
  'movingFn': {
    evaluate: () => { throw new Error('movingFn is implemented in Dvala') },
    arity: toFixedArity(3),
    docs: {
      category: 'vector',
      returns: { type: 'array' },
      args: {
        arr: { type: 'array' },
        windowSize: { type: 'number', description: 'The size of the moving window.' },
        fn: { type: 'function' },
      },
      variants: [{ argumentNames: ['arr', 'windowSize', 'fn'] }],
      description: 'Returns the result of applying `fn` to each moving window of size `windowSize` in `arr`.',
      seeAlso: ['vector.runningFn', 'vector.movingMean'],
      examples: [
        'let { sum, movingFn } = import("vector");\nmovingFn([1, 2, 3], 2, sum)',
        'let { sum, movingFn } = import("vector");\nmovingFn([1, 2, 3], 1, sum)',
        'let { sum, movingFn } = import("vector");\nmovingFn([1, 2, 3], 3, sum)',
      ],
    },
  },
  'runningFn': {
    evaluate: () => { throw new Error('runningFn is implemented in Dvala') },
    arity: toFixedArity(2),
    docs: {
      category: 'vector',
      returns: { type: 'array' },
      args: {
        a: { type: 'array' },
        b: { type: 'function' },
      },
      variants: [{ argumentNames: ['a', 'b'] }],
      description: 'Returns the result of applying `b` to each element of `a`.',
      seeAlso: ['vector.movingFn', 'vector.runningMean'],
      examples: [
        'let { sum, runningFn } = import("vector");\nrunningFn([1, 2, 3], sum)',
        'let { runningFn } = import("vector");\nrunningFn([1, 2, 3], max)',
        'let { runningFn } = import("vector");\nrunningFn([1, 2, 3], min)',
      ],
    },
  },
  'sum': {
    evaluate: ([vector_], sourceCodeInfo): number => {
      const vector = assertVector(vector_, sourceCodeInfo)
      return vector.reduce((acc, val) => acc + val, 0)
    },
    arity: toFixedArity(1),
    docs: {
      category: 'vector',
      returns: { type: 'number' },
      args: {
        vector: { type: 'vector', description: 'The vector to sum.' },
      },
      variants: [{ argumentNames: ['vector'] }],
      description: 'Returns the **sum** of all elements in the `vector`. Returns `0` for an empty vector.',
      seeAlso: ['vector.prod', 'vector.mean', 'vector.median', 'vector.movingSum', 'vector.centeredMovingSum', 'vector.runningSum', 'vector.cumsum'],
      examples: [
        'let { sum } = import("vector");\nsum([1, 2, 3, 4, 5])',
        'let { sum } = import("vector");\nsum([1, -2, 3])',
        'let { sum } = import("vector");\nsum([])',
      ],
    },
  },
  'prod': {
    evaluate: ([vector_], sourceCodeInfo): number => {
      const vector = assertVector(vector_, sourceCodeInfo)
      return vector.reduce((acc, val) => acc * val, 1)
    },
    arity: toFixedArity(1),
    docs: {
      category: 'vector',
      returns: { type: 'number' },
      args: {
        vector: { type: 'vector', description: 'The vector to multiply.' },
      },
      variants: [{ argumentNames: ['vector'] }],
      description: 'Returns the **product** of all elements in the `vector`. Returns `1` for an empty vector.',
      seeAlso: ['vector.sum', 'vector.mean', 'vector.median', 'vector.movingProd', 'vector.centeredMovingProd', 'vector.runningProd', 'vector.cumprod'],
      examples: [
        'let { prod } = import("vector");\nprod([1, 2, 3, 4, 5])',
        'let { prod } = import("vector");\nprod([1, -2, 3])',
        'let { prod } = import("vector");\nprod([])',
      ],
    },
  },
  'mean': {
    evaluate: ([vector_], sourceCodeInfo): number => {
      const vector = assertNonEmptyVector(vector_, sourceCodeInfo)
      return vector.reduce((acc, val) => acc + val, 0) / vector.length
    },
    arity: toFixedArity(1),
    docs: {
      category: 'vector',
      returns: { type: 'number' },
      args: {
        vector: { type: 'vector', description: 'The vector to calculate the mean of.' },
      },
      variants: [{ argumentNames: ['vector'] }],
      description: 'Returns the arithmetic **mean** of all elements in the `vector`. Throws for an empty vector.',
      seeAlso: ['vector.median', 'vector.sum', 'vector.prod', 'vector.movingMean', 'vector.centeredMovingMean', 'vector.runningMean', 'vector.geometricMean', 'vector.harmonicMean', 'vector.rms', 'vector.mode'],
      examples: [
        'let { mean } = import("vector");\nmean([1, 2, 3, 4, 5])',
        'let { mean } = import("vector");\nmean([1, -2, 3])',
      ],
    },
  },
  'median': {
    evaluate: ([vector_], sourceCodeInfo): number => {
      const vector = assertNonEmptyVector(vector_, sourceCodeInfo)
      return calcMedian(vector)
    },
    arity: toFixedArity(1),
    docs: {
      category: 'vector',
      returns: { type: 'number' },
      args: {
        vector: { type: 'vector', description: 'The vector to calculate the median of.' },
      },
      variants: [{ argumentNames: ['vector'] }],
      description: 'Returns the **median** of all elements in the `vector`. For even-length vectors, returns the average of the two middle values. Throws for an empty vector.',
      seeAlso: ['vector.mean', 'vector.sum', 'vector.prod', 'vector.movingMedian', 'vector.centeredMovingMedian', 'vector.runningMedian', 'vector.mode', 'vector.quartiles', 'vector.percentile', 'vector.iqr', 'vector.medad'],
      examples: [
        'let { median } = import("vector");\nmedian([1, 2, 3, 4, 5])',
        'let { median } = import("vector");\nmedian([1, 2, 3, 4])',
        'let { median } = import("vector");\nmedian([3, 1, 4, 1, 5])',
      ],
    },
  },
  'isMonotonic': {
    evaluate: ([vector_], sourceCodeInfo): boolean => {
      const vector = assertVector(vector_, sourceCodeInfo)
      return vector.every((val, i) => i === 0 || val >= vector[i - 1]!)
        || vector.every((val, i) => i === 0 || val <= vector[i - 1]!)
    },
    arity: toFixedArity(1),
  },
  'isStrictlyMonotonic': {
    evaluate: ([vector_], sourceCodeInfo): boolean => {
      const vector = assertVector(vector_, sourceCodeInfo)
      return vector.every((val, i) => i === 0 || val > vector[i - 1]!)
        || vector.every((val, i) => i === 0 || val < vector[i - 1]!)
    },
    arity: toFixedArity(1),
  },
  'isIncreasing': {
    evaluate: ([vector_], sourceCodeInfo): boolean => {
      const vector = assertVector(vector_, sourceCodeInfo)
      return vector.every((val, i) => i === 0 || val >= vector[i - 1]!)
    },
    arity: toFixedArity(1),
  },
  'isDecreasing': {
    evaluate: ([vector_], sourceCodeInfo): boolean => {
      const vector = assertVector(vector_, sourceCodeInfo)
      return vector.every((val, i) => i === 0 || val <= vector[i - 1]!)
    },
    arity: toFixedArity(1),
  },
  'isStrictlyIncreasing': {
    evaluate: ([vector_], sourceCodeInfo): boolean => {
      const vector = assertVector(vector_, sourceCodeInfo)
      return vector.every((val, i) => i === 0 || val > vector[i - 1]!)
    },
    arity: toFixedArity(1),
  },
  'isStrictlyDecreasing': {
    evaluate: ([vector_], sourceCodeInfo): boolean => {
      const vector = assertVector(vector_, sourceCodeInfo)
      return vector.every((val, i) => i === 0 || val < vector[i - 1]!)
    },
    arity: toFixedArity(1),
  },
  'mode': {
    evaluate: ([vector_], sourceCodeInfo): Any => {
      const vector = assertNonEmptyVector(vector_, sourceCodeInfo)
      return mode(vector) as unknown as Any
    },
    arity: toFixedArity(1),
  },
  'minIndex': {
    evaluate: ([vector_], sourceCodeInfo): number => {
      const vector = assertNonEmptyVector(vector_, sourceCodeInfo)

      return vector.reduce((acc, val, i) => (val < vector[acc]! ? i : acc), 0)
    },
    arity: toFixedArity(1),
  },
  'maxIndex': {
    evaluate: ([vector_], sourceCodeInfo): number => {
      const vector = assertNonEmptyVector(vector_, sourceCodeInfo)

      return vector.reduce((acc, val, i) => (val > vector[acc]! ? i : acc), 0)
    },
    arity: toFixedArity(1),
  },
  'sortIndices': {
    evaluate: ([vector_], sourceCodeInfo): Any => {
      const vector = assertVector(vector_, sourceCodeInfo)

      return [...vector.keys()].sort((a, b) => vector[a]! - vector[b]!) as unknown as Any
    },
    arity: toFixedArity(1),
  },
  'countValues': {
    evaluate: ([vector_], sourceCodeInfo): Any => {
      const vector = assertVector(vector_, sourceCodeInfo)

      const frequencyMap = new Map<number, number>()
      for (const value of vector) {
        frequencyMap.set(value, (frequencyMap.get(value) || 0) + 1)
      }
      return [...frequencyMap.entries()].sort((a, b) => {
        // First compare by count (descending)
        const countDiff = b[1] - a[1]
        if (countDiff !== 0)
          return countDiff
        // If counts are equal, sort by value (ascending)
        return a[0] - b[0]
      }) as unknown as Any
    },
    arity: toFixedArity(1),
  },
  'linspace': {
    evaluate: ([start, end, numPoints], sourceCodeInfo): Any => {
      assertNumber(start, sourceCodeInfo, { finite: true })
      assertNumber(end, sourceCodeInfo, { finite: true })
      assertNumber(numPoints, sourceCodeInfo, { integer: true, nonNegative: true })

      if (numPoints === 0) {
        return [] as unknown as Any
      }
      if (numPoints === 1) {
        return [start] as unknown as Any
      }
      const step = (end - start) / (numPoints - 1)
      return Array.from({ length: numPoints }, (_, i) => start + i * step) as unknown as Any
    },
    arity: toFixedArity(3),
  },
  'cumsum': {
    evaluate: ([vector_], sourceCodeInfo): Any => {
      const vector = assertVector(vector_, sourceCodeInfo)

      return vector.reduce((acc, val) => {
        const last = acc[acc.length - 1] ?? 0
        acc.push(last + val)
        return acc
      }, [] as number[]) as unknown as Any
    },
    arity: toFixedArity(1),
  },
  'cumprod': {
    evaluate: ([vector_], sourceCodeInfo): Any => {
      const vector = assertVector(vector_, sourceCodeInfo)

      return vector.reduce((acc, val) => {
        const last = acc[acc.length - 1] ?? 1
        acc.push(last * val)
        return acc
      }, [] as number[]) as unknown as Any
    },
    arity: toFixedArity(1),
  },
  'quartiles': {
    evaluate: ([vector_], sourceCodeInfo): Any => {
      const vector = assertVector(vector_, sourceCodeInfo)
      if (vector.length < 4) {
        throw new RuntimeError('Quartiles require at least four values', sourceCodeInfo)
      }
      return quartiles(vector) as unknown as Any
    },
    arity: toFixedArity(1),
  },
  'percentile': {
    evaluate: ([vector_, percentile], sourceCodeInfo): number => {
      const vector = assertNonEmptyVector(vector_, sourceCodeInfo)
      assertNumber(percentile, sourceCodeInfo, { finite: true, nonNegative: true, lte: 100 })
      return calcPercentile(vector, percentile)
    },
    arity: toFixedArity(2),
  },
  'quantile': {
    evaluate: ([vector_, quantile], sourceCodeInfo): number => {
      const vector = assertVector(vector_, sourceCodeInfo)
      assertNumber(quantile, sourceCodeInfo, { finite: true, nonNegative: true, lte: 1 })
      return calcPercentile(vector, quantile * 100)
    },
    arity: toFixedArity(2),
  },
  'histogram': {
    evaluate: ([vector_, bins], sourceCodeInfo): Any => {
      const vector = assertVector(vector_, sourceCodeInfo)
      assertNumber(bins, sourceCodeInfo, { integer: true, positive: true })

      return calcHistogram(vector, bins) as unknown as Any
    },
    arity: toFixedArity(2),
  },
  'ecdf': {
    evaluate: ([vector_, value], sourceCodeInfo): number => {
      const vector = assertNonEmptyVector(vector_, sourceCodeInfo)
      assertNumber(value, sourceCodeInfo, { finite: true })

      const sorted = [...vector].sort((a, b) => a - b)
      const index = sorted.findIndex(val => val > value)

      return index === -1 ? 1 : index / sorted.length
    },
    arity: toFixedArity(2),
  },
  'isOutliers': {
    evaluate: ([vector_], sourceCodeInfo): boolean => {
      const vector = assertVector(vector_, sourceCodeInfo)
      return hasOutliers(vector)
    },
    arity: toFixedArity(1),
  },
  'outliers': {
    evaluate: ([vector_], sourceCodeInfo): Any => {
      const vector = assertVector(vector_, sourceCodeInfo)
      return outliers(vector) as unknown as Any
    },
    arity: toFixedArity(1),
  },
  'bincount': {
    evaluate: (params, sourceCodeInfo): Any => {
      const vector = assertVector(params.get(0), sourceCodeInfo)
      vector.forEach(val => assertNumber(val, sourceCodeInfo, { finite: true, integer: true, nonNegative: true }))

      const minSize = params.get(1) ?? 0
      assertNumber(minSize, sourceCodeInfo, { integer: true, nonNegative: true })

      const weights_ = params.get(2) ?? undefined
      const weights = weights_ !== undefined ? assertVector(weights_, sourceCodeInfo) : undefined
      if (weights !== undefined) {
        if (weights.length !== vector.length) {
          throw new RuntimeError('Weights vector must be the same length as the input vector', sourceCodeInfo)
        }
        weights.forEach(val => assertNumber(val, sourceCodeInfo, { finite: true }))
      }

      return bincount(vector, minSize, weights) as unknown as Any
    },
    arity: { min: 1, max: 3 },
  },
  'winsorize': {
    evaluate: ([vector_, lowerQuantile, upperQuantile], sourceCodeInfo): Any => {
      const vector = assertVector(vector_, sourceCodeInfo)
      assertNumber(lowerQuantile, sourceCodeInfo, { finite: true, gte: 0, lte: 1 })
      upperQuantile ??= lowerQuantile > 0.5 ? 1 : (1 - lowerQuantile)
      assertNumber(upperQuantile, sourceCodeInfo, { finite: true, gte: lowerQuantile, lte: 1 })

      if (vector.length === 0)
        return [] as unknown as Any

      const sorted = [...vector].sort((a, b) => a - b)

      const lowerIndex = Math.max(0, Math.floor(lowerQuantile * vector.length))
      const upperIndex = Math.min(vector.length - 1, Math.max(0, Math.floor(upperQuantile * vector.length) - 1))

      const lowerBound = sorted[lowerIndex]!
      const upperBound = sorted[upperIndex]!

      return vector.map(val => Math.max(lowerBound, Math.min(val, upperBound))) as unknown as Any
    },
    arity: { min: 2, max: 3 },
  },
  'mse': {
    evaluate: ([vectorA_, vectorB_], sourceCodeInfo): number => {
      const vectorA = assertNonEmptyVector(vectorA_, sourceCodeInfo)
      const vectorB = assertNonEmptyVector(vectorB_, sourceCodeInfo)
      if (vectorA.length !== vectorB.length) {
        throw new RuntimeError('Vectors must be of the same length', sourceCodeInfo)
      }
      return vectorA.reduce((acc, val, i) => acc + (val - vectorB[i]!) ** 2, 0) / vectorA.length
    },
    arity: toFixedArity(2),
  },
  'rmse': {
    evaluate: ([vectorA_, vectorB_], sourceCodeInfo): number => {
      const vectorA = assertNonEmptyVector(vectorA_, sourceCodeInfo)
      const vectorB = assertNonEmptyVector(vectorB_, sourceCodeInfo)
      if (vectorA.length !== vectorB.length) {
        throw new RuntimeError('Vectors must be of the same length', sourceCodeInfo)
      }
      return Math.sqrt(vectorA.reduce((acc, val, i) => acc + (val - vectorB[i]!) ** 2, 0) / vectorA.length)
    },
    arity: toFixedArity(2),
  },
  'mae': {
    evaluate: ([vectorA_, vectorB_], sourceCodeInfo): number => {
      const vectorA = assertNonEmptyVector(vectorA_, sourceCodeInfo)
      const vectorB = assertNonEmptyVector(vectorB_, sourceCodeInfo)
      if (vectorA.length !== vectorB.length) {
        throw new RuntimeError('Vectors must be of the same length', sourceCodeInfo)
      }
      return vectorA.reduce((acc, val, i) => acc + Math.abs(val - vectorB[i]!), 0) / vectorA.length
    },
    arity: toFixedArity(2),
  },
  'smape': {
    evaluate: ([vectorA_, vectorB_], sourceCodeInfo): number => {
      const vectorA = assertNonEmptyVector(vectorA_, sourceCodeInfo)
      const vectorB = assertNonEmptyVector(vectorB_, sourceCodeInfo)
      if (vectorA.length !== vectorB.length) {
        throw new RuntimeError('Vectors must be of the same length', sourceCodeInfo)
      }
      return vectorA.reduce((acc, val, i) => {
        const diff = Math.abs(val - vectorB[i]!)
        const denom = (Math.abs(val) + Math.abs(vectorB[i]!)) / 2
        return acc + (denom === 0 ? 0 : diff / denom)
      }, 0) / vectorA.length
    },
    arity: toFixedArity(2),
  },

}

addReductionFunctions(reductionFunctionNormalExpressions)

function addReductionFunctions(sequences: BuiltinNormalExpressions) {
  for (const [key, value] of Object.entries(sequences)) {
    /* v8 ignore next 3 */
    if (vectorFunctions[key]) {
      throw new Error(`Duplicate normal expression key found: ${key}`)
    }
    vectorFunctions[key] = value
  }
}

for (const [key, docs] of Object.entries(moduleDocs)) {
  // Defensive: all doc keys correspond to existing expressions
  /* v8 ignore next 2 */
  if (vectorFunctions[key])
    vectorFunctions[key].docs = docs
}

export const vectorModule: DvalaModule = {
  name: 'vector',
  functions: vectorFunctions,
  source: vectorModuleSource,
  docs: moduleDocs,
}
