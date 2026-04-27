import { RuntimeError } from '../../../errors'
import type { Any } from '../../../interface'
import { assertMatrix, assertSquareMatrix, assertVector, isSquareMatrix } from '../../../typeGuards/annotatedCollections'
import { assertNumber } from '../../../typeGuards/number'
import { approxZero } from '../../../utils'
import { toFixedArity } from '../../../utils/arity'
import type { BuiltinNormalExpressions } from '../../../builtin/interface'
import type { DvalaModule } from '../interface'
import { gaussJordanElimination } from '../linear-algebra/helpers/gaussJordanElimination'
import { moduleDocs } from './docs'
import { adjugate } from './helpers/adjugate'
import { band } from './helpers/band'
import { cofactor } from './helpers/cofactor'
import { determinant } from './helpers/determinant'
import { inverse } from './helpers/inverse'
import { isBanded } from './helpers/isBanded'
import { isDiagonal } from './helpers/isDiagonal'
import { isIdentity } from './helpers/isIdentity'
import { isOrthogonal } from './helpers/isOrthogonal'
import { isSquare } from './helpers/isSquare'
import { isSymetric } from './helpers/isSymetric'
import { isTriangular, isTriangularLower, isTriangularUpper } from './helpers/isTriangular'
import { matrixMultiply } from './helpers/matrixMultiply'
import { minor } from './helpers/minor'
import { norm1 } from './helpers/norm1'
import { trace } from './helpers/trace'
import matrixModuleSource from './matrix.dvala'

const matrixNormalExpression: BuiltinNormalExpressions = {
  'mul': {
    evaluate: ([matrix1_, matrix2_], sourceCodeInfo): Any => {
      const matrix1 = assertMatrix(matrix1_, sourceCodeInfo)
      const matrix2 = assertMatrix(matrix2_, sourceCodeInfo)
      try {
        return matrixMultiply(matrix1, matrix2) as unknown as Any
      } catch (_error) {
        throw new RuntimeError(`The number of columns in the first matrix must be equal to the number of rows in the second matrix, but got ${matrix1[0]!.length} and ${matrix2.length}`, sourceCodeInfo)
      }
    },
    arity: toFixedArity(2),
  },
  'det': {
    evaluate: ([matrix_], sourceCodeInfo): number => {
      const matrix = assertSquareMatrix(matrix_, sourceCodeInfo)
      return determinant(matrix)
    },
    arity: toFixedArity(1),
  },
  'inv': {
    evaluate: ([matrix_], sourceCodeInfo): Any => {
      const matrix = assertSquareMatrix(matrix_, sourceCodeInfo)
      const result = inverse(matrix)
      if (result === null) {
        throw new RuntimeError('The matrix must be invertible', sourceCodeInfo)
      }
      return result as unknown as Any
    },
    arity: toFixedArity(1),
  },
  'adj': {
    evaluate: ([matrix_], sourceCodeInfo): Any => {
      const matrix = assertSquareMatrix(matrix_, sourceCodeInfo)
      return adjugate(matrix) as unknown as Any
    },
    arity: toFixedArity(1),
  },
  'cofactor': {
    evaluate: ([matrix_], sourceCodeInfo): Any => {
      const matrix = assertSquareMatrix(matrix_, sourceCodeInfo)
      return cofactor(matrix) as unknown as Any
    },
    arity: toFixedArity(1),
  },
  'minor': {
    evaluate: ([matrix_, row, col], sourceCodeInfo): Any => {
      const matrix = assertMatrix(matrix_, sourceCodeInfo)
      assertNumber(row, sourceCodeInfo, { integer: true, nonNegative: true, lte: matrix.length })
      assertNumber(col, sourceCodeInfo, { integer: true, nonNegative: true, lte: matrix[0]!.length })

      return minor(matrix, row, col) as unknown as Any
    },
    arity: toFixedArity(3),
  },
  'trace': {
    evaluate: ([matrix_], sourceCodeInfo): number => {
      const matrix = assertSquareMatrix(matrix_, sourceCodeInfo)
      return trace(matrix)
    },
    arity: toFixedArity(1),
  },
  'isSymmetric': {
    evaluate: ([matrix_], sourceCodeInfo): boolean => {
      const matrix = assertMatrix(matrix_, sourceCodeInfo)
      return isSymetric(matrix)
    },
    arity: toFixedArity(1),
  },
  'isTriangular': {
    evaluate: ([matrix_], sourceCodeInfo): boolean => {
      const matrix = assertMatrix(matrix_, sourceCodeInfo)
      return isTriangular(matrix)
    },
    arity: toFixedArity(1),
  },
  'isUpperTriangular': {
    evaluate: ([matrix_], sourceCodeInfo): boolean => {
      const matrix = assertMatrix(matrix_, sourceCodeInfo)
      return isTriangularUpper(matrix)
    },
    arity: toFixedArity(1),
  },
  'isLowerTriangular': {
    evaluate: ([matrix_], sourceCodeInfo): boolean => {
      const matrix = assertMatrix(matrix_, sourceCodeInfo)
      return isTriangularLower(matrix)
    },
    arity: toFixedArity(1),
  },
  'isDiagonal': {
    evaluate: ([matrix_], sourceCodeInfo): boolean => {
      const matrix = assertMatrix(matrix_, sourceCodeInfo)
      return isDiagonal(matrix)
    },
    arity: toFixedArity(1),
  },
  'isSquare': {
    evaluate: ([matrix_], sourceCodeInfo): boolean => {
      const matrix = assertMatrix(matrix_, sourceCodeInfo)
      return isSquare(matrix)
    },
    arity: toFixedArity(1),
  },
  'isOrthogonalMatrix': {
    evaluate: ([matrix_], sourceCodeInfo): boolean => {
      const matrix = assertMatrix(matrix_, sourceCodeInfo)
      return isOrthogonal(matrix)
    },
    arity: toFixedArity(1),
  },
  'isIdentity': {
    evaluate: ([matrix_], sourceCodeInfo): boolean => {
      const matrix = assertMatrix(matrix_, sourceCodeInfo)
      return isIdentity(matrix)
    },
    arity: toFixedArity(1),
  },
  'isInvertible': {
    evaluate: ([matrix_], sourceCodeInfo): boolean => {
      const matrix = assertMatrix(matrix_, sourceCodeInfo)
      if (!isSquareMatrix(matrix)) {
        return false
      }
      return !approxZero(determinant(matrix))
    },
    arity: toFixedArity(1),
  },
  'hilbert': {
    evaluate: ([size], sourceCodeInfo): Any => {
      assertNumber(size, sourceCodeInfo, { integer: true, positive: true })
      const result: number[][] = []
      for (let i = 0; i < size; i += 1) {
        const row: number[] = []
        for (let j = 0; j < size; j += 1) {
          row.push(1 / (i + j + 1))
        }
        result.push(row)
      }
      return result as unknown as Any
    },
    arity: toFixedArity(1),
  },
  'vandermonde': {
    evaluate: ([vector_], sourceCodeInfo): Any => {
      const vector = assertVector(vector_, sourceCodeInfo)
      const result: number[][] = []
      for (let i = 0; i < vector.length; i += 1) {
        const row: number[] = []
        for (let j = 0; j < vector.length; j += 1) {
          row.push((vector[i]!) ** j)
        }
        result.push(row)
      }
      return result as unknown as Any
    },
    arity: toFixedArity(1),
  },
  'band': {
    evaluate: ([n, lband, uband], sourceCodeInfo): Any => {
      assertNumber(n, sourceCodeInfo, { integer: true, positive: true })
      assertNumber(lband, sourceCodeInfo, { integer: true, nonNegative: true, lt: n })
      assertNumber(uband, sourceCodeInfo, { integer: true, nonNegative: true, lte: n })
      return band(n, lband, uband) as unknown as Any
    },
    arity: toFixedArity(3),
  },
  'isBanded': {
    evaluate: ([matrix_, lband, uband], sourceCodeInfo): boolean => {
      const matrix = assertMatrix(matrix_, sourceCodeInfo)
      const maxBand = Math.max(matrix.length, matrix[0]!.length)
      assertNumber(lband, sourceCodeInfo, { integer: true, nonNegative: true, lt: maxBand })
      assertNumber(uband, sourceCodeInfo, { integer: true, nonNegative: true, lt: maxBand })
      return isBanded(matrix, lband, uband)
    },
    arity: toFixedArity(3),
  },
  'rank': {
    evaluate: ([matrix_], sourceCodeInfo): number => {
      const matrix = assertMatrix(matrix_, sourceCodeInfo)
      const [, result] = gaussJordanElimination(matrix)
      return result
    },
    arity: toFixedArity(1),
  },
  // Frobenius norm
  'frobeniusNorm': {
    evaluate: ([matrix_], sourceCodeInfo): number => {
      const matrix = assertMatrix(matrix_, sourceCodeInfo)
      return Math.sqrt(matrix.reduce((sum, row) => sum + row.reduce((rowSum, cell) => rowSum + cell * cell, 0), 0))
    },
    arity: toFixedArity(1),
  },
  // oneNorm (column norm)
  'oneNorm': {
    evaluate: ([matrix_], sourceCodeInfo): number => {
      const matrix = assertMatrix(matrix_, sourceCodeInfo)
      return norm1(matrix)
    },
    arity: toFixedArity(1),
  },
  // Infinity norm
  'infNorm': {
    evaluate: ([matrix_], sourceCodeInfo): number => {
      const matrix = assertMatrix(matrix_, sourceCodeInfo)
      return matrix.reduce((max, row) => Math.max(max, row.reduce((sum, cell) => sum + Math.abs(cell), 0)), 0)
    },
    arity: toFixedArity(1),
  },
  // Max norm
  'maxNorm': {
    evaluate: ([matrix_], sourceCodeInfo): number => {
      const matrix = assertMatrix(matrix_, sourceCodeInfo)

      return matrix.reduce((maxVal, row) => {
        const rowMax = row.reduce((max, val) => Math.max(max, Math.abs(val)), 0)
        return Math.max(maxVal, rowMax)
      }, 0)
    },
    arity: toFixedArity(1),
  },
}

for (const [key, docs] of Object.entries(moduleDocs)) {
  // Defensive: all doc keys correspond to existing expressions
  /* v8 ignore next 2 */
  if (matrixNormalExpression[key])
    matrixNormalExpression[key].docs = docs
}

export const matrixModule: DvalaModule = {
  name: 'matrix',
  description: 'Matrix algebra: multiplication, determinant, inverse, rank, and decomposition.',
  functions: matrixNormalExpression,
  source: matrixModuleSource,
  docs: moduleDocs,
}
