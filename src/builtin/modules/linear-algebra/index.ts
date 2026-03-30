import { DvalaError, RuntimeError } from '../../../errors'
import type { Any } from '../../../interface'
import { assert2dVector, assert3dVector, assertMatrix, assertNonEmptyVector, assertSquareMatrix, assertVector } from '../../../typeGuards/annotatedCollections'
import { assertNumber } from '../../../typeGuards/number'
import type { BuiltinNormalExpressions } from '../../../builtin/interface'
import type { DvalaModule } from '../interface'
import { calcMean } from '../vector/calcMean'
import { calcMedad } from '../vector/calcMedad'
import { calcMedian } from '../vector/calcMedian'
import { calcStdDev } from '../vector/calcStdDev'
import { toFixedArity } from '../../../utils/arity'
import { moduleDocs } from './docs'
import { gaussJordanElimination } from './helpers/gaussJordanElimination'
import { solve } from './helpers/solve'
import { areVectorsCollinear, areVectorsParallel } from './helpers/collinear'
import { isZeroVector } from './helpers/isZeroVector'
import { pearsonCorr } from './helpers/pearsonCorr'
import { calcFractionalRanks } from './helpers/calcFractionalRanks'
import { kendallTau } from './helpers/kendallTau'
import { calcCovariance } from './helpers/covariance'
import { calcCorrelation, extractOverlappingSegments } from './helpers/corrleation'
import { getUnit } from './helpers/getUnit'
import { dot } from './helpers/dot'
import { subtract } from './helpers/subtract'
import { scale } from './helpers/scale'
import { length } from './helpers/length'
import linearAlgebraModuleSource from './linear-algebra.dvala'

// Casts number[] and number[][] annotated plain JS arrays to Any for evaluator compatibility
function toAny(val: unknown): Any { return val as Any }

export const linearAlgebraNormalExpression: BuiltinNormalExpressions = {
  'rotate2d': {
    evaluate: ([vector_, radians], sourceCodeInfo): Any => {
      const vector = assert2dVector(vector_, sourceCodeInfo)
      if (isZeroVector(vector)) {
        return toAny(vector)
      }
      assertNumber(radians, sourceCodeInfo, { finite: true })
      const cosTheta = Math.cos(radians)
      const sinTheta = Math.sin(radians)
      return toAny([
        vector[0] * cosTheta - vector[1] * sinTheta,
        vector[0] * sinTheta + vector[1] * cosTheta,
      ])
    },
    arity: toFixedArity(2),
  },
  'rotate3d': {
    evaluate: ([vector_, axis_, radians], sourceCodeInfo): Any => {
      const vector = assert3dVector(vector_, sourceCodeInfo)
      if (isZeroVector(vector)) {
        return toAny(vector)
      }
      assertNumber(radians, sourceCodeInfo, { finite: true })
      const axis = assert3dVector(axis_, sourceCodeInfo)
      if (isZeroVector(axis)) {
        throw new RuntimeError('Rotation axis must not be zero', sourceCodeInfo)
      }
      const cosTheta = Math.cos(radians)
      const sinTheta = Math.sin(radians)
      const [u, vComp, w] = getUnit(axis, sourceCodeInfo)
      const dotProduct = vector[0] * u + vector[1] * vComp + vector[2] * w
      return toAny([
        dotProduct * u * (1 - cosTheta) + vector[0] * cosTheta + (-w * vector[1] + vComp * vector[2]) * sinTheta,
        dotProduct * vComp * (1 - cosTheta) + vector[1] * cosTheta + (w * vector[0] - u * vector[2]) * sinTheta,
        dotProduct * w * (1 - cosTheta) + vector[2] * cosTheta + (-vComp * vector[0] + u * vector[1]) * sinTheta,
      ])
    },
    arity: toFixedArity(3),
  },
  'reflect': {
    evaluate: ([vector_, normal_], sourceCodeInfo): Any => {
      const vector = assertVector(vector_, sourceCodeInfo)
      const normal = assertVector(normal_, sourceCodeInfo)
      if (vector.length !== normal.length) {
        throw new RuntimeError('Vectors must be of the same length', sourceCodeInfo)
      }
      if (isZeroVector(normal)) {
        throw new RuntimeError('Reflection normal must not be zero', sourceCodeInfo)
      }
      if (isZeroVector(vector)) {
        return toAny(vector)
      }
      const unitNormal = getUnit(normal, sourceCodeInfo)
      const doubleDot = 2 * dot(vector, unitNormal)
      return toAny(subtract(vector, scale(unitNormal, doubleDot)))
    },
    arity: toFixedArity(2),
  },
  'refract': {
    evaluate: ([vector_, normal_, eta], sourceCodeInfo): Any => {
      const vector = assertVector(vector_, sourceCodeInfo)
      const normal = assertVector(normal_, sourceCodeInfo)
      assertNumber(eta, sourceCodeInfo, { finite: true, positive: true })
      if (vector.length !== normal.length) {
        throw new RuntimeError('Vectors must be of the same length', sourceCodeInfo)
      }
      if (isZeroVector(normal)) {
        throw new RuntimeError('Refraction normal must not be zero', sourceCodeInfo)
      }
      if (isZeroVector(vector)) {
        return toAny(vector)
      }
      // Make sure vectors are normalized
      const normalizedV = getUnit(vector, sourceCodeInfo)
      const normalizedNormal = getUnit(normal, sourceCodeInfo)

      // Calculate dot product between incident vector and normal
      const dotProduct = dot(normalizedV, normalizedNormal)

      // Calculate discriminant
      const discriminant = 1 - eta * eta * (1 - dotProduct * dotProduct)

      // Check for total internal reflection
      if (discriminant < 0) {
        return toAny(vector) // Total internal reflection occurs
      }

      // Calculate the refracted vector
      const scaledIncident = scale(normalizedV, eta)
      const scaledNormal = scale(
        normalizedNormal,
        eta * dotProduct + Math.sqrt(discriminant),
      )

      return toAny(subtract(scaledIncident, scaledNormal))
    },
    arity: toFixedArity(3),
  },
  'lerp': {
    evaluate: ([vectorA_, vectorB_, t], sourceCodeInfo): Any => {
      const vectorA = assertVector(vectorA_, sourceCodeInfo)
      const vectorB = assertVector(vectorB_, sourceCodeInfo)
      assertNumber(t, sourceCodeInfo, { finite: true })
      if (vectorA.length !== vectorB.length) {
        throw new RuntimeError('Vectors must be of the same length', sourceCodeInfo)
      }
      return toAny(vectorA.map((val, i) => val + (vectorB[i]! - val) * t))
    },
    arity: toFixedArity(3),
  },
  'dot': {
    evaluate: ([vectorA_, vectorB_], sourceCodeInfo): number => {
      const vectorA = assertVector(vectorA_, sourceCodeInfo)
      const vectorB = assertVector(vectorB_, sourceCodeInfo)

      if (vectorA.length !== vectorB.length) {
        throw new RuntimeError('Vectors must be of the same length', sourceCodeInfo)
      }

      return dot(vectorA, vectorB)
    },
    arity: toFixedArity(2),
  },
  'cross': {
    evaluate: ([vectorA_, vectorB_], sourceCodeInfo): Any => {
      const vectorA = assertVector(vectorA_, sourceCodeInfo)
      const vectorB = assertVector(vectorB_, sourceCodeInfo)

      if (vectorA.length !== 3 || vectorB.length !== 3) {
        throw new RuntimeError('Cross product is only defined for 3D vectors', sourceCodeInfo)
      }

      return toAny([
        vectorA[1]! * vectorB[2]! - vectorA[2]! * vectorB[1]!,
        vectorA[2]! * vectorB[0]! - vectorA[0]! * vectorB[2]!,
        vectorA[0]! * vectorB[1]! - vectorA[1]! * vectorB[0]!,
      ])
    },
    arity: toFixedArity(2),
  },
  'normalizeMinmax': {
    evaluate: ([vector_], sourceCodeInfo): Any => {
      const vector = assertVector(vector_, sourceCodeInfo)

      if (vector.length === 0) {
        return toAny([])
      }

      const min = vector.reduce((acc, val) => (val < acc ? val : acc), vector[0]!)
      const max = vector.reduce((acc, val) => (val > acc ? val : acc), vector[0]!)

      if (min === max) {
        return toAny(vector.map(() => 0))
      }

      return toAny(vector.map(val => (val - min) / (max - min)))
    },
    arity: toFixedArity(1),
  },
  'normalizeRobust': {
    evaluate: ([vector_], sourceCodeInfo): Any => {
      const vector = assertVector(vector_, sourceCodeInfo)

      if (vector.length === 0) {
        return toAny([])
      }

      const median = calcMedian(vector)
      const medad = calcMedad(vector)

      if (medad === 0) {
        return toAny(vector.map(val => val - median))
      }
      return toAny(vector.map(val => (val - median) / medad))
    },
    arity: toFixedArity(1),
  },
  'normalizeZscore': {
    evaluate: ([vector_], sourceCodeInfo): Any => {
      const vector = assertVector(vector_, sourceCodeInfo)

      const mean = calcMean(vector)
      const stdDev = calcStdDev(vector)

      if (stdDev === 0) {
        return toAny(vector.map(() => 0))
      }

      return toAny(vector.map(val => (val - mean) / stdDev))
    },
    arity: toFixedArity(1),
  },
  'normalizeL1': {
    evaluate: ([vector_], sourceCodeInfo): Any => {
      const vector = assertVector(vector_, sourceCodeInfo)
      if (vector.length === 0) {
        return toAny([])
      }
      const norm = vector.reduce((acc, val) => acc + Math.abs(val), 0)

      if (norm === 0) {
        return toAny(vector.map(() => 0))
      }

      return toAny(vector.map(val => val / norm))
    },
    arity: toFixedArity(1),
  },
  'normalizeL2': {
    evaluate: ([vector_], sourceCodeInfo): Any => {
      const vector = assertVector(vector_, sourceCodeInfo)
      return toAny(getUnit(vector, sourceCodeInfo))
    },
    arity: toFixedArity(1),
  },
  'normalizeLog': {
    evaluate: ([vector_], sourceCodeInfo): Any => {
      const vector = assertVector(vector_, sourceCodeInfo)

      if (vector.length === 0) {
        return toAny([])
      }

      const min = Math.min(...vector)

      if (min <= 0) {
        throw new RuntimeError('Log normalization requires all values to be positive', sourceCodeInfo)
      }

      return toAny(vector.map(val => Math.log(val / min)))
    },
    arity: toFixedArity(1),
  },
  'angle': {
    evaluate: ([vectorA_, vectorB_], sourceCodeInfo): number => {
      const vectorA = assertNonEmptyVector(vectorA_, sourceCodeInfo)
      const vectorB = assertNonEmptyVector(vectorB_, sourceCodeInfo)
      if (isZeroVector(vectorA) || isZeroVector(vectorB)) {
        throw new RuntimeError('Cannot calculate angle with zero-length vector', sourceCodeInfo)
      }

      if (vectorA.length !== vectorB.length) {
        throw new RuntimeError('Vectors must be of the same length', sourceCodeInfo)
      }

      const dotProduct = vectorA.reduce((acc, val, i) => acc + val * vectorB[i]!, 0)
      const magnitudeA = Math.sqrt(vectorA.reduce((acc, val) => acc + val * val, 0))
      const magnitudeB = Math.sqrt(vectorB.reduce((acc, val) => acc + val * val, 0))

      return Math.acos(dotProduct / (magnitudeA * magnitudeB))
    },
    arity: toFixedArity(2),
  },
  'projection': {
    evaluate: ([vectorA_, vectorB_], sourceCodeInfo): Any => {
      const vectorA = assertNonEmptyVector(vectorA_, sourceCodeInfo)
      const vectorB = assertNonEmptyVector(vectorB_, sourceCodeInfo)
      if (isZeroVector(vectorB)) {
        throw new RuntimeError('Cannot project onto zero-length vector', sourceCodeInfo)
      }

      if (vectorA.length !== vectorB.length) {
        throw new RuntimeError('Vectors must be of the same length', sourceCodeInfo)
      }

      const dotProduct = vectorA.reduce((acc, val, i) => acc + val * vectorB[i]!, 0)
      const magnitudeB = Math.sqrt(vectorB.reduce((acc, val) => acc + val * val, 0))

      return toAny(vectorB.map(val => (dotProduct / (magnitudeB ** 2)) * val))
    },
    arity: toFixedArity(2),
  },
  'isOrthogonal': {
    evaluate: ([vectorA_, vectorB_], sourceCodeInfo): boolean => {
      const vectorA = assertNonEmptyVector(vectorA_, sourceCodeInfo)
      const vectorB = assertNonEmptyVector(vectorB_, sourceCodeInfo)

      if (vectorA.length !== vectorB.length) {
        throw new RuntimeError('Vectors must be of the same length', sourceCodeInfo)
      }

      const dotProduct = vectorA.reduce((acc, val, i) => acc + val * vectorB[i]!, 0)
      return dotProduct === 0
    },
    arity: toFixedArity(2),
  },
  'isParallel': {
    evaluate: ([vectorA_, vectorB_], sourceCodeInfo): boolean => {
      const vectorA = assertNonEmptyVector(vectorA_, sourceCodeInfo)
      const vectorB = assertNonEmptyVector(vectorB_, sourceCodeInfo)

      if (vectorA.length !== vectorB.length) {
        throw new RuntimeError('Vectors must be of the same length', sourceCodeInfo)
      }

      return areVectorsParallel(vectorA, vectorB)
    },
    arity: toFixedArity(2),
  },
  'isCollinear': {
    evaluate: ([vectorA_, vectorB_], sourceCodeInfo): boolean => {
      const vectorA = assertNonEmptyVector(vectorA_, sourceCodeInfo)
      const vectorB = assertNonEmptyVector(vectorB_, sourceCodeInfo)

      if (vectorA.length !== vectorB.length) {
        throw new RuntimeError('Vectors must be of the same length', sourceCodeInfo)
      }

      return areVectorsCollinear(vectorA, vectorB)
    },
    arity: toFixedArity(2),
  },
  'cosineSimilarity': {
    evaluate: ([vectorA_, vectorB_], sourceCodeInfo): number => {
      const vectorA = assertNonEmptyVector(vectorA_, sourceCodeInfo)
      const vectorB = assertNonEmptyVector(vectorB_, sourceCodeInfo)
      if (isZeroVector(vectorA) || isZeroVector(vectorB)) {
        throw new RuntimeError('Cannot calculate cosine similarity with zero-length vector', sourceCodeInfo)
      }

      if (vectorA.length !== vectorB.length) {
        throw new RuntimeError('Vectors must be of the same length', sourceCodeInfo)
      }

      const dotProduct = vectorA.reduce((acc, val, i) => acc + val * vectorB[i]!, 0)
      const magnitudeA = Math.sqrt(vectorA.reduce((acc, val) => acc + val * val, 0))
      const magnitudeB = Math.sqrt(vectorB.reduce((acc, val) => acc + val * val, 0))

      return dotProduct / (magnitudeA * magnitudeB)
    },
    arity: toFixedArity(2),
  },
  'euclideanDistance': {
    evaluate: ([vectorA_, vectorB_], sourceCodeInfo): number => {
      const vectorA = assertNonEmptyVector(vectorA_, sourceCodeInfo)
      const vectorB = assertNonEmptyVector(vectorB_, sourceCodeInfo)

      if (vectorA.length !== vectorB.length) {
        throw new RuntimeError('Vectors must be of the same length', sourceCodeInfo)
      }

      return Math.sqrt(vectorA.reduce((acc, val, i) => acc + (val - vectorB[i]!) ** 2, 0))
    },
    arity: toFixedArity(2),
  },
  'euclideanNorm': {
    evaluate: ([vector_], sourceCodeInfo): number => {
      const vector = assertNonEmptyVector(vector_, sourceCodeInfo)

      return length(vector)
    },
    arity: toFixedArity(1),
  },
  'manhattanDistance': {
    evaluate: ([vectorA_, vectorB_], sourceCodeInfo): number => {
      const vectorA = assertNonEmptyVector(vectorA_, sourceCodeInfo)
      const vectorB = assertNonEmptyVector(vectorB_, sourceCodeInfo)

      if (vectorA.length !== vectorB.length) {
        throw new RuntimeError('Vectors must be of the same length', sourceCodeInfo)
      }

      return vectorA.reduce((acc, val, i) => acc + Math.abs(val - vectorB[i]!), 0)
    },
    arity: toFixedArity(2),
  },
  'manhattanNorm': {
    evaluate: ([vector_], sourceCodeInfo): number => {
      const vector = assertNonEmptyVector(vector_, sourceCodeInfo)

      return vector.reduce((acc, val) => acc + Math.abs(val), 0)
    },
    arity: toFixedArity(1),
  },
  'hammingDistance': {
    evaluate: ([vectorA_, vectorB_], sourceCodeInfo): number => {
      const vectorA = assertNonEmptyVector(vectorA_, sourceCodeInfo)
      const vectorB = assertNonEmptyVector(vectorB_, sourceCodeInfo)

      if (vectorA.length !== vectorB.length) {
        throw new RuntimeError('Vectors must be of the same length', sourceCodeInfo)
      }

      return vectorA.reduce((acc, val, i) => acc + (val !== vectorB[i]! ? 1 : 0), 0)
    },
    arity: toFixedArity(2),
  },
  'hammingNorm': {
    evaluate: ([vector_], sourceCodeInfo): number => {
      const vector = assertNonEmptyVector(vector_, sourceCodeInfo)
      return vector.reduce((acc, val) => acc + (val !== 0 ? 1 : 0), 0)
    },
    arity: toFixedArity(1),
  },
  'chebyshevDistance': {
    evaluate: ([vectorA_, vectorB_], sourceCodeInfo): number => {
      const vectorA = assertNonEmptyVector(vectorA_, sourceCodeInfo)
      const vectorB = assertNonEmptyVector(vectorB_, sourceCodeInfo)

      if (vectorA.length !== vectorB.length) {
        throw new RuntimeError('Vectors must be of the same length', sourceCodeInfo)
      }

      return Math.max(...vectorA.map((val, i) => Math.abs(val - vectorB[i]!)))
    },
    arity: toFixedArity(2),
  },
  'chebyshevNorm': {
    evaluate: ([vector_], sourceCodeInfo): number => {
      const vector = assertNonEmptyVector(vector_, sourceCodeInfo)
      return Math.max(...vector.map(val => Math.abs(val)))
    },
    arity: toFixedArity(1),
  },
  'minkowskiDistance': {
    evaluate: ([vectorA_, vectorB_, p], sourceCodeInfo): number => {
      const vectorA = assertNonEmptyVector(vectorA_, sourceCodeInfo)
      const vectorB = assertNonEmptyVector(vectorB_, sourceCodeInfo)
      assertNumber(p, sourceCodeInfo, { finite: true, positive: true })

      if (vectorA.length !== vectorB.length) {
        throw new RuntimeError('Vectors must be of the same length', sourceCodeInfo)
      }

      return vectorA.reduce((acc, val, i) => acc + Math.abs(val - vectorB[i]!) ** p, 0) ** (1 / p)
    },
    arity: toFixedArity(3),
  },
  'minkowskiNorm': {
    evaluate: ([vector_, p], sourceCodeInfo): number => {
      const vector = assertNonEmptyVector(vector_, sourceCodeInfo)
      assertNumber(p, sourceCodeInfo, { finite: true, positive: true })
      return vector.reduce((acc, val) => acc + Math.abs(val) ** p, 0) ** (1 / p)
    },
    arity: toFixedArity(2),
  },
  'cov': {
    evaluate: ([vectorA_, vectorB_], sourceCodeInfo): number => {
      const vectorA = assertNonEmptyVector(vectorA_, sourceCodeInfo)
      const vectorB = assertNonEmptyVector(vectorB_, sourceCodeInfo)

      if (vectorA.length !== vectorB.length) {
        throw new RuntimeError('Vectors must be of the same length', sourceCodeInfo)
      }
      if (vectorA.length === 1) {
        return 0
      }

      return calcCovariance(vectorA, vectorB)
    },
    arity: toFixedArity(2),
  },
  'corr': {
    evaluate: ([vectorA_, vectorB_], sourceCodeInfo): number => {
      const vectorA = assertVector(vectorA_, sourceCodeInfo)
      const vectorB = assertVector(vectorB_, sourceCodeInfo)

      if (vectorA.length <= 1) {
        throw new RuntimeError('Vectors must have at least 2 elements for corr', sourceCodeInfo)
      }

      if (vectorA.length !== vectorB.length) {
        throw new RuntimeError('Vectors must be of the same length', sourceCodeInfo)
      }

      const meanA = calcMean(vectorA)
      const meanB = calcMean(vectorB)

      const numerator = vectorA.reduce((acc, val, i) => acc + (val - meanA) * (vectorB[i]! - meanB), 0)
      const denominator = Math.sqrt(
        vectorA.reduce((acc, val) => acc + (val - meanA) ** 2, 0) * vectorB.reduce((acc, val) => acc + (val - meanB) ** 2, 0),
      )

      return numerator / denominator
    },
    arity: toFixedArity(2),
  },
  'spearmanCorr': {
    evaluate: ([vectorA_, vectorB_], sourceCodeInfo): number => {
      const vectorA = assertVector(vectorA_, sourceCodeInfo)
      const vectorB = assertVector(vectorB_, sourceCodeInfo)

      if (vectorA.length <= 1) {
        throw new RuntimeError('Vectors must have at least 2 elements for corr', sourceCodeInfo)
      }

      if (vectorA.length !== vectorB.length) {
        throw new RuntimeError('Vectors must be of the same length', sourceCodeInfo)
      }

      const ranksA = calcFractionalRanks(vectorA)
      const ranksB = calcFractionalRanks(vectorB)

      try {
        return pearsonCorr(ranksA, ranksB)
      } catch (error) {
        throw new DvalaError(error, sourceCodeInfo)
      }
    },
    arity: toFixedArity(2),
  },
  'pearsonCorr': {
    evaluate: ([vectorA_, vectorB_], sourceCodeInfo): number => {
      const vectorA = assertVector(vectorA_, sourceCodeInfo)
      const vectorB = assertVector(vectorB_, sourceCodeInfo)

      if (vectorA.length <= 1) {
        throw new RuntimeError('Vectors must have at least 2 elements for pearsonCorr', sourceCodeInfo)
      }

      if (vectorA.length !== vectorB.length) {
        throw new RuntimeError('Vectors must be of the same length', sourceCodeInfo)
      }

      try {
        return pearsonCorr(vectorA, vectorB)
      } catch (error) {
        throw new DvalaError(error, sourceCodeInfo)
      }
    },
    arity: toFixedArity(2),
  },
  'kendallTau': {
    evaluate: ([vectorA_, vectorB_], sourceCodeInfo): number => {
      const vectorA = assertVector(vectorA_, sourceCodeInfo)
      const vectorB = assertVector(vectorB_, sourceCodeInfo)

      if (vectorA.length < 2) {
        throw new RuntimeError('Vectors must have at least 2 elements for kendallTau', sourceCodeInfo)
      }

      if (vectorA.length !== vectorB.length) {
        throw new RuntimeError('Vectors must be of the same length', sourceCodeInfo)
      }

      try {
        return kendallTau(vectorA, vectorB)
      } catch (error) {
        throw new DvalaError(error, sourceCodeInfo)
      }
    },
    arity: toFixedArity(2),
  },
  'autocorrelation': {
    evaluate: ([vector_, lag], sourceCodeInfo): number => {
      const vector = assertVector(vector_, sourceCodeInfo)
      if (vector.length < 2) {
        throw new RuntimeError('Vector must have at least 2 elements for autocorrelation', sourceCodeInfo)
      }

      assertNumber(lag, sourceCodeInfo, {
        integer: true,
        lt: vector.length,
        gt: -vector.length,
      })

      // For lag 0, return 1 (a series is perfectly correlated with itself)
      if (lag === 0) {
        return 1
      }
      const absLag = Math.abs(lag)
      const mean = calcMean(vector)

      // Calculate the numerator (sum of products of deviations)
      let numerator = 0
      const n = vector.length

      // If lag is positive, correlate current with past values
      // If lag is negative, correlate current with future values (same calculation, different interpretation)
      for (let i = 0; i < n - absLag; i++) {
        const currentIndex = lag < 0 ? i + absLag : i
        const laggedIndex = lag < 0 ? i : i + absLag

        numerator += (vector[currentIndex]! - mean) * (vector[laggedIndex]! - mean)
      }

      // Calculate the denominator (sum of squared deviations)
      let denominator = 0
      for (let i = 0; i < n; i++) {
        denominator += (vector[i]! - mean) ** 2
      }

      // Handle edge case of zero variance
      if (denominator === 0) {
        return 0 // Conventional definition
      }

      // Return the autocorrelation coefficient
      return numerator / denominator
    },
    arity: toFixedArity(2),
  },

  'crossCorrelation': {
    evaluate: ([vectorA_, vectorB_, lag], sourceCodeInfo): number => {
      const vectorA = assertVector(vectorA_, sourceCodeInfo)
      const vectorB = assertVector(vectorB_, sourceCodeInfo)

      if (vectorA.length < 2) {
        throw new RuntimeError('Vectors must have at least 2 elements', sourceCodeInfo)
      }

      if (vectorA.length !== vectorB.length) {
        throw new RuntimeError('Vectors must be of the same length', sourceCodeInfo)
      }

      assertNumber(lag, sourceCodeInfo, {
        integer: true,
        lt: vectorA.length,
        gt: -vectorA.length,
      })

      // For lag 0 between identical vectors, return 1
      if (lag === 0
        && vectorA.length === vectorB.length
        && vectorA.every((v, i) => v === vectorB[i])) {
        return 1
      }

      const [segmentA, segmentB] = extractOverlappingSegments(vectorA, vectorB, lag)
      return calcCorrelation(segmentA, segmentB)
    },
    arity: toFixedArity(3),
  },
  'rref': {
    evaluate: ([matrix_], sourceCodeInfo): Any => {
      const matrix = assertMatrix(matrix_, sourceCodeInfo)

      // Reduced Row Echelon Form (RREF)
      const [rref] = gaussJordanElimination(matrix)
      return toAny(rref)
    },
    arity: toFixedArity(1),
  },
  'solve': {
    evaluate: ([matrix_, vector_], sourceCodeInfo): Any => {
      const matrix = assertSquareMatrix(matrix_, sourceCodeInfo)
      const vector = assertVector(vector_, sourceCodeInfo)
      if (matrix.length !== vector.length) {
        throw new RuntimeError(`The number of rows in the matrix must be equal to the length of the vector, but got ${matrix.length} and ${vector.length}`, sourceCodeInfo)
      }
      return toAny(solve(matrix, vector))
    },
    arity: toFixedArity(2),
  },
  'toPolar': {
    evaluate: ([vector_], sourceCodeInfo): Any => {
      const vector = assert2dVector(vector_, sourceCodeInfo)
      if (isZeroVector(vector)) {
        return toAny([0, 0])
      }
      const r = Math.sqrt(vector[0] ** 2 + vector[1] ** 2)
      const theta = Math.atan2(vector[1], vector[0])
      return toAny([r, theta])
    },
    arity: toFixedArity(1),
  },
  'fromPolar': {
    evaluate: ([polar_], sourceCodeInfo): Any => {
      const polar = assert2dVector(polar_, sourceCodeInfo)
      const [r, theta] = polar
      if (r === 0) {
        return toAny([0, 0])
      }
      return toAny([r * Math.cos(theta), r * Math.sin(theta)])
    },
    arity: toFixedArity(1),
  },
}

for (const [key, docs] of Object.entries(moduleDocs)) {
  // Defensive: all doc keys correspond to existing expressions
  /* v8 ignore next 2 */
  if (linearAlgebraNormalExpression[key])
    linearAlgebraNormalExpression[key].docs = docs
}

export const linearAlgebraModule: DvalaModule = {
  name: 'linearAlgebra',
  functions: linearAlgebraNormalExpression,
  source: linearAlgebraModuleSource,
  docs: moduleDocs,
}
