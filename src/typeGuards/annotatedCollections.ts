import { TypeError } from '../errors'
import type { Any } from '../interface'
import type { SourceCodeInfo } from '../tokenizer/token'
import { isPersistentVector } from '../utils/persistent'
import { isNumber } from './number'

const annotatedArrays = new WeakSet<unknown[]>()
const annotatedVectors = new WeakSet<unknown[]>()
const annotadedNonVectors = new WeakSet<unknown[]>()
const annotadedMatrices = new WeakSet<unknown[]>()
const annotatedNonMatrices = new WeakSet<unknown[]>()
const annotatedGrids = new WeakSet<unknown[]>()
const annotatedNonGrids = new WeakSet<unknown[]>()

/**
 * If value is a PersistentVector, convert it (deeply) to a plain JS array.
 * Otherwise, return the value unchanged. This is used at module boundaries
 * where downstream code expects plain arrays with bracket indexing.
 */
function toPlainArray(value: unknown): unknown {
  if (isPersistentVector(value)) {
    const arr: unknown[] = []
    for (const item of value) arr.push(toPlainArray(item))
    return arr
  }
  if (Array.isArray(value)) {
    // Also recurse into plain arrays — handles rest-spread params (e.g. `[grid_, ...rows_] = pvParams`)
    // where `rows_` is a plain JS array but each element may still be a PersistentVector.
    return value.map(toPlainArray)
  }
  return value
}

export function isVector(vector: unknown): vector is number[] {
  const plain = toPlainArray(vector)
  if (!Array.isArray(plain)) {
    return false
  }

  if (annotatedVectors.has(plain)) {
    return true
  }
  if (annotadedNonVectors.has(plain)) {
    return false
  }

  if (plain.every(elem => isNumber(elem))) {
    annotatedArrays.add(plain)
    annotatedVectors.add(plain)
    return true
  }
  annotadedNonVectors.add(plain)
  return false
}

/**
 * Assert that `vector` is a numeric vector. If it's a PersistentVector,
 * converts to a plain `number[]` and returns it. Callers should use the
 * return value: `vector = assertVector(vector, sci)`
 */
export function assertVector(vector: unknown, sourceCodeInfo: SourceCodeInfo | undefined): number[] {
  const plain = toPlainArray(vector)
  if (!isVector(plain)) {
    throw new TypeError(`Expected a vector, but got ${vector}`, sourceCodeInfo)
  }
  return plain
}

export function is2dVector(vector: unknown): vector is [number, number] {
  const plain = toPlainArray(vector)
  if (!isVector(plain)) {
    return false
  }
  return plain.length === 2
}
export function assert2dVector(vector: unknown, sourceCodeInfo: SourceCodeInfo | undefined): [number, number] {
  const plain = toPlainArray(vector)
  if (!is2dVector(plain)) {
    throw new TypeError(`Expected a 2d vector, but got ${vector}`, sourceCodeInfo)
  }
  return plain
}

export function is3dVector(vector: unknown): vector is [number, number, number] {
  const plain = toPlainArray(vector)
  if (!isVector(plain)) {
    return false
  }
  return plain.length === 3
}
export function assert3dVector(vector: unknown, sourceCodeInfo: SourceCodeInfo | undefined): [number, number, number] {
  const plain = toPlainArray(vector)
  if (!is3dVector(plain)) {
    throw new TypeError(`Expected a 3d vector, but got ${vector}`, sourceCodeInfo)
  }
  return plain
}

export function assertNonEmptyVector(vector: unknown, sourceCodeInfo: SourceCodeInfo | undefined): number[] {
  const plain = assertVector(vector, sourceCodeInfo)
  if (plain.length === 0) {
    throw new TypeError(`Expected a non empty vector, but got ${vector}`, sourceCodeInfo)
  }
  return plain
}

export function isGrid(grid: unknown, typePred?: (elem: unknown) => boolean): grid is unknown[][] {
  const plain = toPlainArray(grid)
  if (!Array.isArray(plain)) {
    return false
  }
  if (annotatedGrids.has(plain)) {
    return true
  }
  if (annotatedNonGrids.has(plain)) {
    return false
  }
  if (plain.length === 0) {
    annotatedNonGrids.add(plain)
    return false
  }
  if (!Array.isArray(plain[0])) {
    annotatedNonGrids.add(plain)
    return false
  }
  const nbrOfCols = plain[0].length
  if (nbrOfCols === 0) {
    annotatedNonGrids.add(plain)
    return false
  }
  for (const row of plain) {
    if (!Array.isArray(row)) {
      annotatedNonGrids.add(plain)
      return false
    }
    if (row.length !== nbrOfCols) {
      annotatedNonGrids.add(plain)
      return false
    }
    if (typePred && row.some(cell => !typePred(cell))) {
      // typePred failure is a type constraint issue, not a structural one.
      // Don't cache in annotatedNonGrids — the value IS structurally a grid,
      // just not one where all cells satisfy the predicate.
      return false
    }
  }
  annotatedArrays.add(plain)
  annotatedGrids.add(plain)
  return true
}

export function assertGrid(grid: unknown, sourceCodeInfo: SourceCodeInfo | undefined): Any[][] {
  const plain = toPlainArray(grid)
  if (!isGrid(plain)) {
    throw new TypeError(`Expected a grid, but got ${grid}`, sourceCodeInfo)
  }
  return plain as Any[][]
}

export function isMatrix(matrix: unknown): matrix is number[][] {
  const plain = toPlainArray(matrix)
  if (!isGrid(plain, isNumber)) {
    if (Array.isArray(plain)) {
      annotatedNonMatrices.add(plain)
    }
    return false
  }
  annotadedMatrices.add(plain)
  return true
}

export function assertMatrix(matrix: unknown, sourceCodeInfo: SourceCodeInfo | undefined): number[][] {
  const plain = toPlainArray(matrix)
  if (!isMatrix(plain)) {
    throw new TypeError(`Expected a matrix, but got ${matrix}`, sourceCodeInfo)
  }
  return plain
}

export function assertSquareMatrix(matrix: unknown, sourceCodeInfo: SourceCodeInfo | undefined): number[][] {
  const plain = toPlainArray(matrix)
  if (!isMatrix(plain)) {
    throw new TypeError(`Expected a matrix, but got ${matrix}`, sourceCodeInfo)
  }
  if (plain.length !== (plain[0] as number[]).length) {
    throw new TypeError(`Expected square matrix, but got ${plain.length} and ${(plain[0] as number[]).length}`, sourceCodeInfo)
  }
  return plain
}

export function isSquareMatrix(matrix: unknown): matrix is number[][] {
  const plain = toPlainArray(matrix)
  if (!isMatrix(plain)) {
    return false
  }
  if ((plain).length !== (plain)[0]!.length) {
    return false
  }
  return true
}
