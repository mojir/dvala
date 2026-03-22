import { DvalaError } from '../../../errors'
import type { Any } from '../../../interface'
import { assertGrid, assertVector } from '../../../typeGuards/annotatedCollections'
import { assertArray } from '../../../typeGuards/array'
import { assertAny } from '../../../typeGuards/dvala'
import { assertNumber } from '../../../typeGuards/number'
import { toFixedArity } from '../../../utils/arity'
import type { BuiltinNormalExpressions } from '../../../builtin/interface'
import type { DvalaModule } from '../interface'
import gridModuleSource from './grid.dvala'
import { moduleDocs } from './docs'
import { fromArray } from './fromArray'
import { transpose } from './transpose'

const gridFunctions: BuiltinNormalExpressions = {
  'isCellEvery': {
    evaluate: () => {
      throw new Error('isCellEvery: Dvala implementation should be used instead')
    },
    arity: toFixedArity(2),
  },
  'isSome': {
    evaluate: () => {
      throw new Error('isSome: Dvala implementation should be used instead')
    },
    arity: toFixedArity(2),
  },
  'isEveryRow': {
    evaluate: () => {
      throw new Error('isEveryRow: Dvala implementation should be used instead')
    },
    arity: toFixedArity(2),
  },
  'isSomeRow': {
    evaluate: () => {
      throw new Error('isSomeRow: Dvala implementation should be used instead')
    },
    arity: toFixedArity(2),
  },
  'isEveryCol': {
    evaluate: () => {
      throw new Error('isEveryCol: Dvala implementation should be used instead')
    },
    arity: toFixedArity(2),
  },
  'isSomeCol': {
    evaluate: () => {
      throw new Error('isSomeCol: Dvala implementation should be used instead')
    },
    arity: toFixedArity(2),
  },
  'row': {
    evaluate: ([grid, row], sourceCodeInfo): Any[] => {
      assertGrid(grid, sourceCodeInfo)
      assertNumber(row, sourceCodeInfo, { integer: true, nonNegative: true, lt: grid.length })
      return grid[row]!
    },
    arity: toFixedArity(2),
  },
  'col': {
    evaluate: ([grid, col], sourceCodeInfo): Any[] => {
      assertGrid(grid, sourceCodeInfo)
      assertNumber(col, sourceCodeInfo, { integer: true, nonNegative: true, lt: grid[0]!.length })
      return grid.map(row => row[col]!)
    },
    arity: toFixedArity(2),
  },
  'shape': {
    evaluate: ([grid], sourceCodeInfo): Any[] => {
      assertGrid(grid, sourceCodeInfo)
      return [grid.length, grid[0]!.length]
    },
    arity: toFixedArity(1),
  },
  'fill': {
    evaluate: ([rows, cols, value], sourceCodeInfo): Any[][] => {
      assertNumber(rows, sourceCodeInfo, { integer: true, positive: true })
      assertNumber(cols, sourceCodeInfo, { integer: true, positive: true })
      assertAny(value, sourceCodeInfo)
      const result: Any[][] = []
      for (let i = 0; i < rows; i += 1) {
        const row: Any[] = []
        for (let j = 0; j < cols; j += 1) {
          row.push(value)
        }
        result.push(row)
      }
      return result
    },
    arity: toFixedArity(3),
  },
  'generate': {
    evaluate: () => {
      throw new Error('generate: Dvala implementation should be used instead')
    },
    arity: toFixedArity(3),
  },
  'reshape': {
    evaluate: ([grid, rows], sourceCodeInfo): Any[][] => {
      assertGrid(grid, sourceCodeInfo)
      assertNumber(rows, sourceCodeInfo, { integer: true, positive: true })

      const flatTable = grid.flat()
      if (flatTable.length % rows !== 0) {
        throw new DvalaError(`The number of elements in the grid must be divisible by rows, but got ${flatTable.length} and ${rows}`, sourceCodeInfo)
      }
      const cols = flatTable.length / rows

      const result: Any[][] = []
      for (let i = 0; i < rows; i += 1) {
        const row: Any[] = []
        for (let j = 0; j < cols; j += 1) {
          row.push(flatTable[i * cols + j]!)
        }
        result.push(row)
      }
      return result
    },
    arity: toFixedArity(2),
  },
  'transpose': {
    evaluate: ([grid], sourceCodeInfo): Any[][] => {
      assertGrid(grid, sourceCodeInfo)
      return transpose(grid)
    },
    arity: toFixedArity(1),
  },
  'flipH': {
    evaluate: ([grid], sourceCodeInfo): Any[][] => {
      assertGrid(grid, sourceCodeInfo)
      return grid.map(row => row.reverse())
    },
    arity: toFixedArity(1),
  },
  'flipV': {
    evaluate: ([grid], sourceCodeInfo): Any[][] => {
      assertGrid(grid, sourceCodeInfo)
      return grid.reverse()
    },
    arity: toFixedArity(1),
  },
  'rotate': {
    evaluate: ([grid, times], sourceCodeInfo): Any[][] => {
      assertGrid(grid, sourceCodeInfo)
      assertNumber(times, sourceCodeInfo, { integer: true })
      // Normalize times to be between 0 and 3
      times = ((times % 4) + 4) % 4

      // If times is 0, return the original grid
      if (times === 0 || grid.length === 0) {
        return grid.map(row => [...row])
      }

      const height = grid.length
      const width = grid[0]!.length

      let result: Any[][]

      switch (times) {
        case 1: // 90 degrees clockwise
          result = Array<Any>(width).fill(null).map(() => Array<Any>(height).fill(null))
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              result[x]![height - 1 - y] = grid[y]![x]!
            }
          }
          break

        case 2: // 180 degrees
          result = Array<Any>(height).fill(null).map(() => Array<Any>(width).fill(null))
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              result[height - 1 - y]![width - 1 - x] = grid[y]![x]!
            }
          }
          break

        case 3: // 270 degrees clockwise (or 90 degrees counter-clockwise)
          result = Array<Any>(width).fill(null).map(() => Array<Any>(height).fill(null))
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              result[width - 1 - x]![y] = grid[y]![x]!
            }
          }
          break
      }

      return result!
    },
    arity: toFixedArity(2),
  },
  'crop': {
    evaluate: ([grid, start, end], sourceCodeInfo): Any[][] => {
      assertGrid(grid, sourceCodeInfo)
      assertVector(start, sourceCodeInfo)
      if (start.length !== 2) {
        throw new DvalaError(`The start vector must have 2 elements, but got ${start.length}`, sourceCodeInfo)
      }
      const [rowStart, colStart] = start
      assertNumber(rowStart, sourceCodeInfo, { integer: true, nonNegative: true, lt: grid.length })
      assertNumber(colStart, sourceCodeInfo, { integer: true, nonNegative: true, lt: grid[0]!.length })

      end ??= [grid.length, grid[0]!.length]
      assertVector(end, sourceCodeInfo)
      if (end.length !== 2) {
        throw new DvalaError(`The end vector must have 2 elements, but got ${end.length}`, sourceCodeInfo)
      }
      const [rowEnd, colEnd] = end
      assertNumber(rowEnd, sourceCodeInfo, { gt: rowStart, lte: grid.length })
      assertNumber(colEnd, sourceCodeInfo, { gt: colStart, lte: grid[0]!.length })

      const result: Any[][] = []
      for (let i = rowStart; i < rowEnd; i += 1) {
        const row: Any[] = []
        for (let j = colStart; j < colEnd; j += 1) {
          row.push(grid[i]![j]!)
        }
        result.push(row)
      }
      return result
    },
    arity: { min: 2, max: 3 },
  },
  'sliceRows': {
    evaluate: ([grid, rowStart, rowEnd], sourceCodeInfo): Any[][] => {
      assertGrid(grid, sourceCodeInfo)

      if (typeof rowEnd === 'undefined') {
        assertNumber(rowStart, sourceCodeInfo, { integer: true, lte: grid.length, gte: -grid.length })
        if (rowStart < 0) {
          return grid.slice(grid.length + rowStart)
        }
        return grid.slice(rowStart)
      }

      assertNumber(rowStart, sourceCodeInfo, { integer: true, nonNegative: true, lte: grid.length })
      assertNumber(rowEnd, sourceCodeInfo, { integer: true })
      rowEnd = rowEnd < 0 ? grid.length + rowEnd : rowEnd
      assertNumber(rowEnd, sourceCodeInfo, { gt: rowStart, lte: grid.length })

      return grid.slice(rowStart, rowEnd)
    },
    arity: { min: 2, max: 3 },
  },
  'sliceCols': {
    evaluate: ([grid, colStart, colEnd], sourceCodeInfo): Any[][] => {
      assertGrid(grid, sourceCodeInfo)
      const trMatrix = transpose(grid)

      if (typeof colEnd === 'undefined') {
        assertNumber(colStart, sourceCodeInfo, { integer: true, lte: trMatrix.length, gte: -trMatrix.length })
        if (colStart < 0) {
          return transpose(trMatrix.slice(trMatrix.length + colStart))
        }
        return transpose(trMatrix.slice(colStart))
      }

      assertNumber(colStart, sourceCodeInfo, { integer: true, nonNegative: true, lte: trMatrix.length })
      assertNumber(colEnd, sourceCodeInfo, { integer: true })
      colEnd = colEnd < 0 ? trMatrix.length + colEnd : colEnd
      assertNumber(colEnd, sourceCodeInfo, { gt: colStart, lte: trMatrix.length })

      return transpose(trMatrix.slice(colStart, colEnd))
    },
    arity: { min: 2, max: 3 },
  },
  'spliceRows': {
    evaluate: ([grid, rowStart, rowDeleteCount, ...rows], sourceCodeInfo): Any[][] => {
      assertGrid(grid, sourceCodeInfo)
      assertNumber(rowStart, sourceCodeInfo, { integer: true, nonNegative: true, lte: grid.length })
      assertNumber(rowDeleteCount, sourceCodeInfo, { integer: true, nonNegative: true })
      if (rows.length !== 0) {
        assertGrid(rows, sourceCodeInfo)
        rows.every(row => {
          assertArray(row, sourceCodeInfo)
          if (grid[0]!.length !== row.length) {
            throw new DvalaError(`All rows must have the same length as the number of columns in grid, but got ${row.length}`, sourceCodeInfo)
          }
          return true
        })
      }

      const result: Any[][] = []
      for (let i = 0; i < rowStart; i += 1) {
        result.push(grid[i]!)
      }
      if (rows.length > 0) {
        result.push(...(rows as Any[][]))
      }
      for (let i = rowStart + rowDeleteCount; i < grid.length; i += 1) {
        result.push(grid[i]!)
      }
      return result
    },
    arity: { min: 3 },
  },
  'spliceCols': {
    evaluate: ([grid, colStart, colDeleteCount, ...cols], sourceCodeInfo): Any[][] => {
      assertGrid(grid, sourceCodeInfo)
      const trMatrix = transpose(grid)
      assertNumber(colStart, sourceCodeInfo, { integer: true, nonNegative: true, lte: trMatrix.length })
      assertNumber(colDeleteCount, sourceCodeInfo, { integer: true, nonNegative: true })

      if (cols.length !== 0) {
        assertGrid(cols, sourceCodeInfo)
        cols.every(row => {
          assertArray(row, sourceCodeInfo)
          if (trMatrix[0]!.length !== row.length) {
            throw new DvalaError(`All rows must have the same length as the number of rows in grid, but got ${row.length}`, sourceCodeInfo)
          }
          return true
        })
      }

      const result: Any[][] = []
      for (let i = 0; i < colStart; i += 1) {
        result.push(trMatrix[i]!)
      }
      result.push(...(cols as Any[][]))
      for (let i = colStart + colDeleteCount; i < trMatrix.length; i += 1) {
        result.push(trMatrix[i]!)
      }
      return transpose(result)
    },
    arity: { min: 3 },
  },
  'concatRows': {
    evaluate: (params, sourceCodeInfo): Any[][] => {
      assertArray(params, sourceCodeInfo)
      params.every(grid => assertGrid(grid, sourceCodeInfo))
      const cols = (params[0] as Any[][])[0]!.length
      ;(params as Any[][][]).slice(1).every(grid => {
        if (grid[0]!.length !== cols) {
          throw new DvalaError(`All grids must have the same number of columns, but got ${cols} and ${grid[0]!.length}`, sourceCodeInfo)
        }
        return true
      })

      const result: Any[][] = []
      ;(params as Any[][][]).forEach(grid => {
        grid.forEach(row => {
          result.push(row)
        })
      })
      return result
    },
    arity: { min: 1 },
  },
  'concatCols': {
    evaluate: (params, sourceCodeInfo): Any[][] => {
      assertArray(params, sourceCodeInfo)
      params.every(grid => assertGrid(grid, sourceCodeInfo))
      const rows = (params[0] as Any[][]).length
      ;(params as Any[][][]).slice(1).every(grid => {
        if (grid.length !== rows) {
          throw new DvalaError(`All grids must have the same number of rows, but got ${rows} and ${grid.length}`, sourceCodeInfo)
        }
        return true
      })

      const result: Any[][] = []
      for (let i = 0; i < rows; i += 1) {
        const row: Any[] = []
        ;(params as Any[][][]).forEach(grid => {
          row.push(...grid[i]!)
        })
        result.push(row)
      }
      return result
    },
    arity: { min: 1 },
  },
  'cellMap': {
    evaluate: () => {
      throw new Error('cellMap: Dvala implementation should be used instead')
    },
    arity: { min: 2 },
  },
  'cellMapi': {
    evaluate: () => {
      throw new Error('cellMapi: Dvala implementation should be used instead')
    },
    arity: toFixedArity(2),
  },
  'cellReduce': {
    evaluate: () => {
      throw new Error('cellReduce: Dvala implementation should be used instead')
    },
    arity: toFixedArity(3),
  },
  'cellReducei': {
    evaluate: () => {
      throw new Error('cellReducei: Dvala implementation should be used instead')
    },
    arity: toFixedArity(3),
  },
  'pushRows': {
    evaluate: ([grid, ...rows], sourceCodeInfo): Any[][] => {
      assertGrid(grid, sourceCodeInfo)
      assertGrid(rows, sourceCodeInfo)
      if (grid[0]!.length !== rows[0]!.length) {
        throw new DvalaError(`All rows must have the same length as the number of columns in grid, but got ${grid[0]!.length} and ${rows[0]!.length}`, sourceCodeInfo)
      }
      return [...grid, ...rows]
    },
    arity: { min: 2 },
  },
  'unshiftRows': {
    evaluate: ([grid, ...rows], sourceCodeInfo): Any[][] => {
      assertGrid(grid, sourceCodeInfo)
      assertGrid(rows, sourceCodeInfo)
      if (grid[0]!.length !== rows[0]!.length) {
        throw new DvalaError(`All rows must have the same length as the number of columns in grid, but got ${grid[0]!.length} and ${rows[0]!.length}`, sourceCodeInfo)
      }
      return [...rows, ...grid]
    },
    arity: { min: 2 },
  },
  'popRow': {
    evaluate: ([grid], sourceCodeInfo): Any[][] | null => {
      assertGrid(grid, sourceCodeInfo)
      if (grid.length === 1) {
        return null
      }
      return grid.slice(0, -1)
    },
    arity: toFixedArity(1),

  },
  'shiftRow': {
    evaluate: ([grid], sourceCodeInfo): Any[][] | null => {
      assertGrid(grid, sourceCodeInfo)
      if (grid.length === 1) {
        return null
      }
      return grid.slice(1)
    },
    arity: toFixedArity(1),
  },
  'pushCols': {
    evaluate: ([grid, ...cols], sourceCodeInfo): Any[][] => {
      assertGrid(grid, sourceCodeInfo)
      assertGrid(cols, sourceCodeInfo)
      if (grid.length !== cols[0]!.length) {
        throw new DvalaError(`All columns must have the same length as the number of rows in grid, but got ${cols.length}`, sourceCodeInfo)
      }

      const result: Any[][] = []

      for (let i = 0; i < grid.length; i += 1) {
        const row: Any[] = []
        row.push(...grid[i]!)
        cols.forEach(col => {
          row.push(col[i]!)
        })
        result.push(row)
      }
      return result
    },
    arity: { min: 2 },
  },
  'unshiftCols': {
    evaluate: ([grid, ...cols], sourceCodeInfo): Any[][] => {
      assertGrid(grid, sourceCodeInfo)
      assertGrid(cols, sourceCodeInfo)
      if (grid.length !== cols[0]!.length) {
        throw new DvalaError(`All columns must have the same length as the number of rows in grid, but got ${cols.length}`, sourceCodeInfo)
      }

      const result: Any[][] = []

      for (let i = 0; i < grid.length; i += 1) {
        const row: Any[] = []
        cols.forEach(col => {
          row.push(col[i]!)
        })
        row.push(...grid[i]!)
        result.push(row)
      }
      return result
    },
    arity: { min: 2 },
  },
  'popCol': {
    evaluate: ([grid], sourceCodeInfo): Any[][] | null => {
      assertGrid(grid, sourceCodeInfo)
      if (grid[0]!.length === 1) {
        return null
      }
      return grid.map(row => row.slice(0, -1))
    },
    arity: toFixedArity(1),
  },
  'shiftCol': {
    evaluate: ([grid], sourceCodeInfo): Any[][] | null => {
      assertGrid(grid, sourceCodeInfo)
      if (grid[0]!.length === 1) {
        return null
      }
      return grid.map(row => row.slice(1))
    },
    arity: toFixedArity(1),
  },
  'fromArray': {
    evaluate: ([array, rows], sourceCodeInfo): unknown[][] => {
      assertArray(array, sourceCodeInfo)
      assertNumber(rows, sourceCodeInfo, { integer: true, positive: true })
      if (array.length % rows !== 0) {
        throw new DvalaError(`The number of elements in the array must be divisible by rows, but got ${array.length} and ${rows}`, sourceCodeInfo)
      }
      return fromArray(array, rows)
    },
    arity: toFixedArity(2),
  },
}

/**
 * The grid module containing 2D array manipulation functions.
 */
for (const [key, docs] of Object.entries(moduleDocs)) {
  // Defensive: all doc keys correspond to existing expressions
  /* v8 ignore next 2 */
  if (gridFunctions[key])
    gridFunctions[key].docs = docs
}

export const gridModule: DvalaModule = {
  name: 'grid',
  functions: gridFunctions,
  source: gridModuleSource,
  docs: moduleDocs,
}
