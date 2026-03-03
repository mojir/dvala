import { DvalaError } from '../errors'
import type { Any } from '../interface'
import type { SourceCodeInfo } from '../tokenizer/token'
import { isNumber } from './number'

const annotatedArrays = new WeakSet<unknown[]>()
const annotatedVectors = new WeakSet<unknown[]>()
const annotadedNonVectors = new WeakSet<unknown[]>()
const annotadedMatrices = new WeakSet<unknown[]>()
const annotatedNonMatrices = new WeakSet<unknown[]>()
const annotatedGrids = new WeakSet<unknown[]>()
const annotatedNonGrids = new WeakSet<unknown[]>()

export function annotate<T>(value: T): T {
  if (!Array.isArray(value)) {
    return value
  }
  if (annotatedArrays.has(value)) {
    return value
  }
  isVector(value)
  if (!isMatrix(value)) {
    isGrid(value)
  }

  return value
}
export function isVector(vector: unknown): vector is number[] {
  if (!Array.isArray(vector)) {
    return false
  }

  if (annotatedVectors.has(vector)) {
    return true
  }
  if (annotadedNonVectors.has(vector)) {
    return false
  }

  if (vector.every(elem => isNumber(elem))) {
    annotatedArrays.add(vector)
    annotatedVectors.add(vector)
    return true
  }
  annotadedNonVectors.add(vector)
  return false
}

export function assertVector(vector: unknown, sourceCodeInfo: SourceCodeInfo | undefined): asserts vector is number[] {
  if (!isVector(vector)) {
    throw new DvalaError(`Expected a vector, but got ${vector}`, sourceCodeInfo)
  }
}

export function is2dVector(vector: unknown): vector is [number, number] {
  if (!isVector(vector)) {
    return false
  }
  return vector.length === 2
}
export function assert2dVector(vector: unknown, sourceCodeInfo: SourceCodeInfo | undefined): asserts vector is [number, number] {
  if (!is2dVector(vector)) {
    throw new DvalaError(`Expected a 2d vector, but got ${vector}`, sourceCodeInfo)
  }
}

export function is3dVector(vector: unknown): vector is [number, number, number] {
  if (!isVector(vector)) {
    return false
  }
  return vector.length === 3
}
export function assert3dVector(vector: unknown, sourceCodeInfo: SourceCodeInfo | undefined): asserts vector is [number, number, number] {
  if (!is3dVector(vector)) {
    throw new DvalaError(`Expected a 3d vector, but got ${vector}`, sourceCodeInfo)
  }
}

export function assertNonEmptyVector(vector: unknown, sourceCodeInfo: SourceCodeInfo | undefined): asserts vector is number[] {
  assertVector(vector, sourceCodeInfo)
  if (vector.length === 0) {
    throw new DvalaError(`Expected a non empty vector, but got ${vector}`, sourceCodeInfo)
  }
}

export function isGrid(grid: unknown, typePred?: (elem: unknown) => boolean): grid is unknown[][] {
  if (!Array.isArray(grid)) {
    return false
  }
  if (annotatedGrids.has(grid)) {
    return true
  }
  if (annotatedNonGrids.has(grid)) {
    return false
  }
  if (grid.length === 0) {
    annotatedNonGrids.add(grid)
    return false
  }
  if (!Array.isArray(grid[0])) {
    annotatedNonGrids.add(grid)
    return false
  }
  const nbrOfCols = grid[0].length
  if (nbrOfCols === 0) {
    annotatedNonGrids.add(grid)
    return false
  }
  for (const row of grid) {
    if (!Array.isArray(row)) {
      annotatedNonGrids.add(grid)
      return false
    }
    if (row.length !== nbrOfCols) {
      annotatedNonGrids.add(grid)
      return false
    }
    if (typePred && row.some(cell => !typePred(cell))) {
      annotatedNonGrids.add(grid)
      return false
    }
  }
  annotatedArrays.add(grid)
  annotatedGrids.add(grid)
  return true
}

export function assertGrid(grid: unknown, sourceCodeInfo: SourceCodeInfo | undefined): asserts grid is Any[][] {
  if (!isGrid(grid)) {
    throw new DvalaError(`Expected a grid, but got ${grid}`, sourceCodeInfo)
  }
}

export function isMatrix(matrix: unknown): matrix is number[][] {
  if (!isGrid(matrix, isNumber)) {
    if (Array.isArray(matrix)) {
      annotatedNonMatrices.add(matrix)
    }
    return false
  }
  annotadedMatrices.add(matrix)
  return true
}

export function assertMatrix(matrix: unknown, sourceCodeInfo: SourceCodeInfo | undefined): asserts matrix is number[][] {
  if (!isMatrix(matrix)) {
    throw new DvalaError(`Expected a matrix, but got ${matrix}`, sourceCodeInfo)
  }
}

export function assertSquareMatrix(matrix: unknown, sourceCodeInfo: SourceCodeInfo | undefined): asserts matrix is number[][] {
  if (!isMatrix(matrix)) {
    throw new DvalaError(`Expected a matrix, but got ${matrix}`, sourceCodeInfo)
  }
  if (matrix.length !== matrix[0]!.length) {
    throw new DvalaError(`Expected square matrix, but got ${matrix.length} and ${matrix[0]!.length}`, sourceCodeInfo)
  }
}

export function isSquareMatrix(matrix: unknown): matrix is number[][] {
  if (!isMatrix(matrix)) {
    return false
  }
  if (matrix.length !== matrix[0]!.length) {
    return false
  }
  return true
}
