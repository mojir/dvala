import { RuntimeError } from '../../../errors'
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

// Grid functions return plain JS Any[][] (annotated collections), not PersistentVector.
// Cast to Any to satisfy the NormalExpressionEvaluator<Any> return type.
function toAnyGrid(val: unknown): Any { return val as Any }

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
    evaluate: (params, sourceCodeInfo): Any => {
      const [grid_, row] = params
      const grid = assertGrid(grid_, sourceCodeInfo)
      assertNumber(row, sourceCodeInfo, { integer: true, nonNegative: true, lt: grid.length })
      return toAnyGrid(grid[row]!)
    },
    arity: toFixedArity(2),
  },
  'col': {
    evaluate: (params, sourceCodeInfo): Any => {
      const [grid_, col] = params
      const grid = assertGrid(grid_, sourceCodeInfo)
      assertNumber(col, sourceCodeInfo, { integer: true, nonNegative: true, lt: grid[0]!.length })
      return toAnyGrid(grid.map(row => row[col]!))
    },
    arity: toFixedArity(2),
  },
  'shape': {
    evaluate: (params, sourceCodeInfo): Any => {
      const grid = assertGrid(params.get(0), sourceCodeInfo)
      return toAnyGrid([grid.length, grid[0]!.length])
    },
    arity: toFixedArity(1),
  },
  'fill': {
    evaluate: (params, sourceCodeInfo): Any => {
      const [rows, cols, value] = params
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
      return toAnyGrid(result)
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
    evaluate: (params, sourceCodeInfo): Any => {
      const [grid_, rows] = params
      const grid = assertGrid(grid_, sourceCodeInfo)
      assertNumber(rows, sourceCodeInfo, { integer: true, positive: true })

      const flatTable = grid.flat()
      if (flatTable.length % rows !== 0) {
        throw new RuntimeError(`The number of elements in the grid must be divisible by rows, but got ${flatTable.length} and ${rows}`, sourceCodeInfo)
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
      return toAnyGrid(result)
    },
    arity: toFixedArity(2),
  },
  'transpose': {
    evaluate: (params, sourceCodeInfo): Any => {
      const grid = assertGrid(params.get(0), sourceCodeInfo)
      return toAnyGrid(transpose(grid))
    },
    arity: toFixedArity(1),
  },
  'flipH': {
    evaluate: (params, sourceCodeInfo): Any => {
      const grid = assertGrid(params.get(0), sourceCodeInfo)
      return toAnyGrid(grid.map(row => row.reverse()))
    },
    arity: toFixedArity(1),
  },
  'flipV': {
    evaluate: (params, sourceCodeInfo): Any => {
      const grid = assertGrid(params.get(0), sourceCodeInfo)
      return toAnyGrid(grid.reverse())
    },
    arity: toFixedArity(1),
  },
  'rotate': {
    evaluate: (params, sourceCodeInfo): Any => {
      const [grid_, times] = params
      const grid = assertGrid(grid_, sourceCodeInfo)
      assertNumber(times, sourceCodeInfo, { integer: true })
      // Normalize times to be between 0 and 3
      const t = ((times % 4) + 4) % 4

      // If times is 0, return the original grid
      if (t === 0 || grid.length === 0) {
        return toAnyGrid(grid.map(row => [...row]))
      }

      const height = grid.length
      const width = grid[0]!.length

      let result: Any[][]

      switch (t) {
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

      return toAnyGrid(result!)
    },
    arity: toFixedArity(2),
  },
  'crop': {
    evaluate: (params, sourceCodeInfo): Any => {
      const [grid_, start_, end_] = params
      const grid = assertGrid(grid_, sourceCodeInfo)
      const start = assertVector(start_, sourceCodeInfo)
      if (start.length !== 2) {
        throw new RuntimeError(`The start vector must have 2 elements, but got ${start.length}`, sourceCodeInfo)
      }
      const [rowStart, colStart] = start
      assertNumber(rowStart, sourceCodeInfo, { integer: true, nonNegative: true, lt: grid.length })
      assertNumber(colStart, sourceCodeInfo, { integer: true, nonNegative: true, lt: grid[0]!.length })

      const end = assertVector(end_ ?? [grid.length, grid[0]!.length], sourceCodeInfo)
      if (end.length !== 2) {
        throw new RuntimeError(`The end vector must have 2 elements, but got ${end.length}`, sourceCodeInfo)
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
      return toAnyGrid(result)
    },
    arity: { min: 2, max: 3 },
  },
  'sliceRows': {
    evaluate: (params, sourceCodeInfo): Any => {
      const [grid_, rowStart, rowEnd] = params
      const grid = assertGrid(grid_, sourceCodeInfo)

      if (typeof rowEnd === 'undefined') {
        assertNumber(rowStart, sourceCodeInfo, { integer: true, lte: grid.length, gte: -grid.length })
        if (rowStart < 0) {
          return toAnyGrid(grid.slice(grid.length + rowStart))
        }
        return toAnyGrid(grid.slice(rowStart))
      }

      assertNumber(rowStart, sourceCodeInfo, { integer: true, nonNegative: true, lte: grid.length })
      assertNumber(rowEnd, sourceCodeInfo, { integer: true })
      const end = rowEnd < 0 ? grid.length + rowEnd : rowEnd
      assertNumber(end, sourceCodeInfo, { gt: rowStart, lte: grid.length })

      return toAnyGrid(grid.slice(rowStart, end))
    },
    arity: { min: 2, max: 3 },
  },
  'sliceCols': {
    evaluate: (params, sourceCodeInfo): Any => {
      const [grid_, colStart, colEnd] = params
      const grid = assertGrid(grid_, sourceCodeInfo)
      const trMatrix = transpose(grid)

      if (typeof colEnd === 'undefined') {
        assertNumber(colStart, sourceCodeInfo, { integer: true, lte: trMatrix.length, gte: -trMatrix.length })
        if (colStart < 0) {
          return toAnyGrid(transpose(trMatrix.slice(trMatrix.length + colStart)))
        }
        return toAnyGrid(transpose(trMatrix.slice(colStart)))
      }

      assertNumber(colStart, sourceCodeInfo, { integer: true, nonNegative: true, lte: trMatrix.length })
      assertNumber(colEnd, sourceCodeInfo, { integer: true })
      const end = colEnd < 0 ? trMatrix.length + colEnd : colEnd
      assertNumber(end, sourceCodeInfo, { gt: colStart, lte: trMatrix.length })

      return toAnyGrid(transpose(trMatrix.slice(colStart, end)))
    },
    arity: { min: 2, max: 3 },
  },
  'spliceRows': {
    evaluate: (params, sourceCodeInfo): Any => {
      const [grid_, rowStart, rowDeleteCount, ...rows_] = params
      const grid = assertGrid(grid_, sourceCodeInfo)
      assertNumber(rowStart, sourceCodeInfo, { integer: true, nonNegative: true, lte: grid.length })
      assertNumber(rowDeleteCount, sourceCodeInfo, { integer: true, nonNegative: true })
      const validatedRows: Any[][] = rows_.length !== 0
        ? (() => {
          const rows = assertGrid(rows_, sourceCodeInfo)
          rows.every(row => {
            assertArray(row, sourceCodeInfo)
            if (grid[0]!.length !== (row as unknown[]).length) {
              throw new RuntimeError(`All rows must have the same length as the number of columns in grid, but got ${(row as unknown[]).length}`, sourceCodeInfo)
            }
            return true
          })
          return rows
        })()
        : []

      const result: Any[][] = []
      for (let i = 0; i < rowStart; i += 1) {
        result.push(grid[i]!)
      }
      if (validatedRows.length > 0) {
        result.push(...validatedRows)
      }
      for (let i = rowStart + rowDeleteCount; i < grid.length; i += 1) {
        result.push(grid[i]!)
      }
      return toAnyGrid(result)
    },
    arity: { min: 3 },
  },
  'spliceCols': {
    evaluate: (params, sourceCodeInfo): Any => {
      const [grid_, colStart, colDeleteCount, ...cols_] = params
      const grid = assertGrid(grid_, sourceCodeInfo)
      const trMatrix = transpose(grid)
      assertNumber(colStart, sourceCodeInfo, { integer: true, nonNegative: true, lte: trMatrix.length })
      assertNumber(colDeleteCount, sourceCodeInfo, { integer: true, nonNegative: true })

      const validatedCols: Any[][] = cols_.length !== 0
        ? (() => {
          const cols = assertGrid(cols_, sourceCodeInfo)
          cols.every(row => {
            assertArray(row, sourceCodeInfo)
            if (trMatrix[0]!.length !== (row as unknown[]).length) {
              throw new RuntimeError(`All rows must have the same length as the number of rows in grid, but got ${(row as unknown[]).length}`, sourceCodeInfo)
            }
            return true
          })
          return cols
        })()
        : []

      const result: Any[][] = []
      for (let i = 0; i < colStart; i += 1) {
        result.push(trMatrix[i]!)
      }
      result.push(...validatedCols)
      for (let i = colStart + colDeleteCount; i < trMatrix.length; i += 1) {
        result.push(trMatrix[i]!)
      }
      return toAnyGrid(transpose(result))
    },
    arity: { min: 3 },
  },
  'concatRows': {
    evaluate: (params, sourceCodeInfo): Any => {
      const paramsArr = [...params].map(grid => assertGrid(grid, sourceCodeInfo))
      const cols = paramsArr[0]![0]!.length
      paramsArr.slice(1).every(grid => {
        if (grid[0]!.length !== cols) {
          throw new RuntimeError(`All grids must have the same number of columns, but got ${cols} and ${grid[0]!.length}`, sourceCodeInfo)
        }
        return true
      })

      const result: Any[][] = []
      paramsArr.forEach(grid => {
        grid.forEach(row => {
          result.push(row)
        })
      })
      return toAnyGrid(result)
    },
    arity: { min: 1 },
  },
  'concatCols': {
    evaluate: (params, sourceCodeInfo): Any => {
      const paramsArr = [...params].map(grid => assertGrid(grid, sourceCodeInfo))
      const rows = paramsArr[0]!.length
      paramsArr.slice(1).every(grid => {
        if (grid.length !== rows) {
          throw new RuntimeError(`All grids must have the same number of rows, but got ${rows} and ${grid.length}`, sourceCodeInfo)
        }
        return true
      })

      const result: Any[][] = []
      for (let i = 0; i < rows; i += 1) {
        const row: Any[] = []
        paramsArr.forEach(grid => {
          row.push(...grid[i]!)
        })
        result.push(row)
      }
      return toAnyGrid(result)
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
    evaluate: (params, sourceCodeInfo): Any => {
      const [grid_, ...rows_] = params
      const grid = assertGrid(grid_, sourceCodeInfo)
      const rows = assertGrid(rows_, sourceCodeInfo)
      if (grid[0]!.length !== rows[0]!.length) {
        throw new RuntimeError(`All rows must have the same length as the number of columns in grid, but got ${grid[0]!.length} and ${rows[0]!.length}`, sourceCodeInfo)
      }
      return toAnyGrid([...grid, ...rows])
    },
    arity: { min: 2 },
  },
  'unshiftRows': {
    evaluate: (params, sourceCodeInfo): Any => {
      const [grid_, ...rows_] = params
      const grid = assertGrid(grid_, sourceCodeInfo)
      const rows = assertGrid(rows_, sourceCodeInfo)
      if (grid[0]!.length !== rows[0]!.length) {
        throw new RuntimeError(`All rows must have the same length as the number of columns in grid, but got ${grid[0]!.length} and ${rows[0]!.length}`, sourceCodeInfo)
      }
      return toAnyGrid([...rows, ...grid])
    },
    arity: { min: 2 },
  },
  'popRow': {
    evaluate: (params, sourceCodeInfo): Any => {
      const grid = assertGrid(params.get(0), sourceCodeInfo)
      if (grid.length === 1) {
        return null
      }
      return toAnyGrid(grid.slice(0, -1))
    },
    arity: toFixedArity(1),

  },
  'shiftRow': {
    evaluate: (params, sourceCodeInfo): Any => {
      const grid = assertGrid(params.get(0), sourceCodeInfo)
      if (grid.length === 1) {
        return null
      }
      return toAnyGrid(grid.slice(1))
    },
    arity: toFixedArity(1),
  },
  'pushCols': {
    evaluate: (params, sourceCodeInfo): Any => {
      const [grid_, ...cols_] = params
      const grid = assertGrid(grid_, sourceCodeInfo)
      const cols = assertGrid(cols_, sourceCodeInfo)
      if (grid.length !== cols[0]!.length) {
        throw new RuntimeError(`All columns must have the same length as the number of rows in grid, but got ${cols.length}`, sourceCodeInfo)
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
      return toAnyGrid(result)
    },
    arity: { min: 2 },
  },
  'unshiftCols': {
    evaluate: (params, sourceCodeInfo): Any => {
      const [grid_, ...cols_] = params
      const grid = assertGrid(grid_, sourceCodeInfo)
      const cols = assertGrid(cols_, sourceCodeInfo)
      if (grid.length !== cols[0]!.length) {
        throw new RuntimeError(`All columns must have the same length as the number of rows in grid, but got ${cols.length}`, sourceCodeInfo)
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
      return toAnyGrid(result)
    },
    arity: { min: 2 },
  },
  'popCol': {
    evaluate: (params, sourceCodeInfo): Any => {
      const grid = assertGrid(params.get(0), sourceCodeInfo)
      if (grid[0]!.length === 1) {
        return null
      }
      return toAnyGrid(grid.map(row => row.slice(0, -1)))
    },
    arity: toFixedArity(1),
  },
  'shiftCol': {
    evaluate: (params, sourceCodeInfo): Any => {
      const grid = assertGrid(params.get(0), sourceCodeInfo)
      if (grid[0]!.length === 1) {
        return null
      }
      return toAnyGrid(grid.map(row => row.slice(1)))
    },
    arity: toFixedArity(1),
  },
  'fromArray': {
    evaluate: (params, sourceCodeInfo): Any => {
      const [array, rows] = params
      assertArray(array, sourceCodeInfo)
      assertNumber(rows, sourceCodeInfo, { integer: true, positive: true })
      if (array.size % rows !== 0) {
        throw new RuntimeError(`The number of elements in the array must be divisible by rows, but got ${array.size} and ${rows}`, sourceCodeInfo)
      }
      return toAnyGrid(fromArray([...array], rows))
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
