import type { FunctionDocs } from '../../interface'

export const moduleDocs: Record<string, FunctionDocs> = {
  'isCellEvery': {
    type: '(Unknown[][], (Unknown -> Boolean)) -> Boolean',
    category: 'grid',
    description: 'Checks if all elements in a grid satisfy a predicate. Returns true only if the predicate returns true for every element in the grid.',
    returns: {
      type: 'boolean',
    },
    args: {
      a: {
        type: 'grid',
      },
      b: {
        type: 'function',
      },
    },
    variants: [
      {
        argumentNames: [
          'a',
          'b',
        ],
      },
    ],
    examples: [
      'let { isCellEvery } = import("grid");\nisCellEvery([\n  ["Albert", "father", 10],\n  ["Nina", "mother", 20],\n  ["Kian", "son", 30],\n], isString)',
      'let { isCellEvery } = import("grid");\nisCellEvery([\n  ["Albert", "father"],\n  ["Nina", "mother"],\n  ["Kian", "son"],\n], isString)',
      'let { isCellEvery } = import("grid");\nisCellEvery([\n  [1, 2],\n  [3, 4],\n], isString)',
    ],
    seeAlso: ['collection.isEvery', 'grid.isSome', 'grid.isEveryRow', 'grid.isEveryCol'],
  },
  'isSome': {
    type: '(Unknown[][], (Unknown -> Boolean)) -> Boolean',
    category: 'grid',
    description: 'Checks if any element in a grid satisfies a predicate. Returns true if the predicate returns true for at least one element in the grid.',
    returns: {
      type: 'boolean',
    },
    args: {
      a: {
        type: 'grid',
      },
      b: {
        type: 'function',
      },
    },
    variants: [
      {
        argumentNames: [
          'a',
          'b',
        ],
      },
    ],
    examples: [
      'let { isSome } = import("grid");\nisSome([\n  ["Albert", "father", 10],\n  ["Nina", "mother", 20],\n  ["Kian", "son", 30],\n], isString)',
      'let { isSome } = import("grid");\nisSome([\n  ["Albert", "father"],\n  ["Nina", "mother"],\n  ["Kian", "son"],\n], isString)',
      'let { isSome } = import("grid");\nisSome([\n  [1, 2],\n  [3, 4],\n], isString)',
    ],
    seeAlso: ['collection.isAny', 'grid.isCellEvery', 'grid.isSomeRow', 'grid.isSomeCol'],
  },
  'isEveryRow': {
    type: '(Unknown[][], (Unknown[] -> Boolean)) -> Boolean',
    category: 'grid',
    description: 'Checks if all rows in a grid satisfy a predicate. Returns true only if the predicate returns true for every row in the grid.',
    returns: {
      type: 'boolean',
    },
    args: {
      a: {
        type: 'grid',
      },
      b: {
        type: 'function',
      },
    },
    variants: [
      {
        argumentNames: [
          'a',
          'b',
        ],
      },
    ],
    examples: [
      'let { isEveryRow } = import("grid");\nisEveryRow([\n  ["Albert", "father", 10],\n  ["Nina", "mother", 20],\n  ["Kian", "son", 30],\n], -> isString($[0]))',
      'let { isEveryRow } = import("grid");\nisEveryRow([\n  ["Albert", "father"],\n  ["Nina", "mother"],\n  ["Kian", "son"],\n], -> isString($[0]))',
      'let { isEveryRow } = import("grid");\nisEveryRow([\n  [1, 2],\n  [3, 4],\n], -> isString($[0]))',
    ],
    seeAlso: ['grid.isSomeRow', 'grid.isEveryCol', 'grid.isCellEvery'],
  },
  'isSomeRow': {
    type: '(Unknown[][], (Unknown[] -> Boolean)) -> Boolean',
    category: 'grid',
    description: 'Checks if any row in a grid satisfies a predicate. Returns true if the predicate returns true for at least one row in the grid.',
    returns: {
      type: 'boolean',
    },
    args: {
      a: {
        type: 'grid',
      },
      b: {
        type: 'function',
      },
    },
    variants: [
      {
        argumentNames: [
          'a',
          'b',
        ],
      },
    ],
    examples: [
      'let { isSomeRow } = import("grid");\nisSomeRow([\n  ["Albert", "father", 10],\n  ["Nina", "mother", 20],\n  ["Kian", "son", 30],\n], -> $ contains "Albert")',
      'let { isSomeRow } = import("grid");\nisSomeRow([\n  ["Albert", "father"],\n  ["Nina", "mother"],\n  ["Kian", "son"],\n], -> $ contains "Albert")',
      'let { isSomeRow } = import("grid");\nisSomeRow([\n  [1, 2],\n  [3, 4],\n], -> $ contains "Albert")',
    ],
    seeAlso: ['grid.isEveryRow', 'grid.isSomeCol', 'grid.isSome'],
  },
  'isEveryCol': {
    type: '(Unknown[][], (Unknown[] -> Boolean)) -> Boolean',
    category: 'grid',
    description: 'Checks if all columns in a grid satisfy a predicate. Returns true only if the predicate returns true for every column in the grid.',
    returns: {
      type: 'boolean',
    },
    args: {
      a: {
        type: 'grid',
      },
      b: {
        type: 'function',
      },
    },
    variants: [
      {
        argumentNames: [
          'a',
          'b',
        ],
      },
    ],
    examples: [
      'let { isEveryCol } = import("grid");\nisEveryCol([\n  ["Albert", "father", 10],\n  ["Nina", "mother", 20],\n  ["Kian", "son", 30],\n], -> isString($[0]))',
      'let { isEveryCol } = import("grid");\nisEveryCol([\n  ["Albert", "father"],\n  ["Nina", "mother"],\n  ["Kian", "son"],\n], -> isString($[0]))',
      'let { isEveryCol } = import("grid");\nisEveryCol([\n  [1, 2],\n  [3, 4],\n], -> isString($[0]))',
    ],
    seeAlso: ['grid.isSomeCol', 'grid.isEveryRow', 'grid.isCellEvery'],
  },
  'isSomeCol': {
    type: '(Unknown[][], (Unknown[] -> Boolean)) -> Boolean',
    category: 'grid',
    description: 'Checks if any column in a grid satisfies a predicate. Returns true if the predicate returns true for at least one column in the grid.',
    returns: {
      type: 'boolean',
    },
    args: {
      a: {
        type: 'grid',
      },
      b: {
        type: 'function',
      },
    },
    variants: [
      {
        argumentNames: [
          'a',
          'b',
        ],
      },
    ],
    examples: [
      'let { isSomeCol } = import("grid");\nisSomeCol([\n  ["Albert", "father", 10],\n  ["Nina", "mother", 20],\n  ["Kian", "son", 30],\n], -> $ contains "Albert")',
      'let { isSomeCol } = import("grid");\nisSomeCol([\n  ["Albert", "father"],\n  ["Nina", "mother"],\n  ["Kian", "son"],\n], -> $ contains "Albert")',
      'let { isSomeCol } = import("grid");\nisSomeCol([\n  [1, 2],\n  [3, 4],\n], -> $ contains "Albert")',
    ],
    seeAlso: ['grid.isEveryCol', 'grid.isSomeRow', 'grid.isSome'],
  },
  'row': {
    type: '(Unknown[][], Number) -> Unknown[]',
    category: 'grid',
    description: 'Returns the row at index `a` in the grid `b`.',
    returns: {
      type: 'any',
    },
    args: {
      a: {
        type: 'grid',
      },
      b: {
        type: 'number',
      },
    },
    variants: [
      {
        argumentNames: [
          'a',
          'b',
        ],
      },
    ],
    examples: [
      'let { row } = import("grid");\nrow([\n  ["Albert", "father", 10],\n  ["Nina", "mother", 20],\n  ["Kian", "son", 30],\n], 0)',
      'let { row } = import("grid");\nrow([\n  ["Albert", "father", 10],\n  ["Nina", "mother", 20],\n  ["Kian", "son", 30],\n], 1)',
      'let { row } = import("grid");\nrow([\n  ["Albert", "father", 10],\n  ["Nina", "mother", 20],\n  ["Kian", "son", 30],\n], 2)',
    ],
    seeAlso: ['grid.col', 'grid.shape'],
  },
  'col': {
    type: '(Unknown[][], Number) -> Unknown[]',
    category: 'grid',
    description: 'Returns the column at index `a` in the grid `b`.',
    returns: {
      type: 'any',
    },
    args: {
      a: {
        type: 'grid',
      },
      b: {
        type: 'number',
      },
    },
    variants: [
      {
        argumentNames: [
          'a',
          'b',
        ],
      },
    ],
    examples: [
      'let { col } = import("grid");\ncol([\n  ["Albert", "father", 10],\n  ["Nina", "mother", 20],\n  ["Kian", "son", 30],\n], 0)',
      'let { col } = import("grid");\ncol([\n  ["Albert", "father", 10],\n  ["Nina", "mother", 20],\n  ["Kian", "son", 30],\n], 1)',
      'let { col } = import("grid");\ncol([\n  ["Albert", "father", 10],\n  ["Nina", "mother", 20],\n  ["Kian", "son", 30],\n], 2)',
    ],
    seeAlso: ['grid.row', 'grid.shape'],
  },
  'shape': {
    type: '(Unknown[][]) -> Number[]',
    category: 'grid',
    description: 'Returns the shape of the grid `g` as a `vector` of two numbers, where the first number is the number of rows and the second number is the number of columns.',
    returns: {
      type: 'vector',
    },
    args: {
      g: {
        type: 'grid',
        description: 'The grid to get the shape of.',
      },
    },
    variants: [
      {
        argumentNames: [
          'g',
        ],
      },
    ],
    examples: [
      'let { shape } = import("grid");\nshape([\n  ["Albert", "father", 10],\n  ["Nina", "mother", 20],\n  ["Kian", "son", 30],\n])',
      'let { shape } = import("grid");\nshape([\n  ["Albert", "father"],\n  ["Nina", "mother"],\n  ["Kian", "son"],\n])',
      'let { shape } = import("grid");\nshape([\n  [1, 2],\n  [3, 4],\n])',
    ],
    seeAlso: ['grid.row', 'grid.col', 'grid.reshape'],
  },
  'fill': {
    type: '(Number, Number, Unknown) -> Unknown[][]',
    category: 'grid',
    description: 'Creates a grid of the specified size, filled with the specified value.',
    returns: {
      type: 'grid',
    },
    args: {
      rows: {
        type: 'integer',
        description: 'The number of rows in the grid.',
      },
      cols: {
        type: 'integer',
        description: 'The number of columns in the grid.',
      },
      value: {
        type: 'any',
        description: 'The value to fill the grid with.',
      },
    },
    variants: [
      {
        argumentNames: [
          'rows',
          'cols',
          'value',
        ],
      },
    ],
    examples: [
      'let { fill } = import("grid");\nfill(2, 3, 0)',
      'let { fill } = import("grid");\nfill(2, 3, "x")',
    ],
    seeAlso: ['grid.generate', 'grid.fromArray'],
  },
  'generate': {
    type: '(Number, Number, (Number, Number) -> Unknown) -> Unknown[][]',
    category: 'grid',
    description: 'Generates a grid of the specified size, where each element is generated by the provided function.',
    returns: {
      type: 'grid',
    },
    args: {
      rows: {
        type: 'number',
        description: 'The number of rows in the grid.',
      },
      cols: {
        type: 'number',
        description: 'The number of columns in the grid.',
      },
      generator: {
        type: 'function',
        description: 'The function to generate the grid. It takes two arguments: the row index and the column index.',
      },
    },
    variants: [
      {
        argumentNames: [
          'rows',
          'cols',
          'generator',
        ],
      },
    ],
    examples: [
      'let { generate } = import("grid");\ngenerate(3, 3, (i, j) -> i + j)',
    ],
    seeAlso: ['grid.fill', 'grid.fromArray'],
  },
  'reshape': {
    type: '(Unknown[][], Number) -> Unknown[][]',
    category: 'grid',
    description: 'Reshapes the grid `a` into a new grid with the specified number of rows `b`. The number of columns is automatically calculated based on the total number of elements in the grid.',
    returns: {
      type: 'grid',
    },
    args: {
      a: {
        type: 'grid',
      },
      b: {
        type: 'number',
      },
    },
    variants: [
      {
        argumentNames: [
          'a',
          'b',
        ],
      },
    ],
    examples: [
      'let { reshape } = import("grid");\nreshape([\n  ["Albert", "father"],\n  ["Nina", "mother"],\n  ["Kian", "son"],\n], 2)',
    ],
    seeAlso: ['grid.shape', 'grid.fromArray'],
  },
  'transpose': {
    type: '(Unknown[][]) -> Unknown[][]',
    category: 'grid',
    description: 'Transposes the grid `g`, swapping its rows and columns.',
    returns: {
      type: 'grid',
    },
    args: {
      g: {
        type: 'grid',
        description: 'The grid to transpose.',
      },
    },
    variants: [
      {
        argumentNames: [
          'g',
        ],
      },
    ],
    examples: [
      'let { transpose } = import("grid");\ntranspose([\n  ["Albert", "father", 10],\n  ["Nina", "mother", 20],\n  ["Kian", "son", 30],\n])',
      'let { transpose } = import("grid");\ntranspose([\n  ["Albert", "father"],\n  ["Nina", "mother"],\n  ["Kian", "son"],\n])',
      'let { transpose } = import("grid");\ntranspose([\n  [1, 2],\n  [3, 4],\n])',
    ],
    seeAlso: ['grid.flipH', 'grid.flipV', 'grid.rotate'],
  },
  'flipH': {
    type: '(Unknown[][]) -> Unknown[][]',
    category: 'grid',
    description: 'Flips the grid `g` horizontally.',
    returns: {
      type: 'grid',
    },
    args: {
      g: {
        type: 'grid',
        description: 'The grid to flip horizontally.',
      },
    },
    variants: [
      {
        argumentNames: [
          'g',
        ],
      },
    ],
    examples: [
      'let { flipH } = import("grid");\nflipH([\n  ["Albert", "father", 10],\n  ["Nina", "mother", 20],\n  ["Kian", "son", 30],\n])',
      'let { flipH } = import("grid");\nflipH([\n  ["Albert", "father"],\n  ["Nina", "mother"],\n  ["Kian", "son"],\n])',
      'let { flipH } = import("grid");\nflipH([\n  [1, 2],\n  [3, 4],\n])',
    ],
    seeAlso: ['grid.flipV', 'grid.transpose', 'grid.rotate'],
  },
  'flipV': {
    type: '(Unknown[][]) -> Unknown[][]',
    category: 'grid',
    description: 'Flips the grid `g` vertically.',
    returns: {
      type: 'grid',
    },
    args: {
      g: {
        type: 'grid',
        description: 'The grid to flip vertically.',
      },
    },
    variants: [
      {
        argumentNames: [
          'g',
        ],
      },
    ],
    examples: [
      'let { flipV } = import("grid");\nflipV([\n  ["Albert", "father", 10],\n  ["Nina", "mother", 20],\n  ["Kian", "son", 30],\n])',
      'let { flipV } = import("grid");\nflipV([\n  ["Albert", "father"],\n  ["Nina", "mother"],\n  ["Kian", "son"],\n])',
      'let { flipV } = import("grid");\nflipV([\n  [1, 2],\n  [3, 4],\n])',
    ],
    seeAlso: ['grid.flipH', 'grid.transpose', 'grid.rotate'],
  },
  'rotate': {
    type: '(Unknown[][], Number) -> Unknown[][]',
    category: 'grid',
    description: 'Rotates the grid `g` by the specified angle. The angle is given in terms of 90-degree rotations. Positive values rotate the grid clockwise, while negative values rotate it counterclockwise.',
    returns: {
      type: 'grid',
    },
    args: {
      a: {
        type: 'grid',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'a',
          'b',
        ],
      },
    ],
    examples: [
      'let { rotate } = import("grid");\nrotate([\n  [1, 2],\n  [3, 4],\n], 1)',
      'let { rotate } = import("grid");\nrotate([\n  [1, 2],\n  [3, 4],\n], 2)',
      'let { rotate } = import("grid");\nrotate([\n  [1, 2],\n  [3, 4],\n], 3)',
      'let { rotate } = import("grid");\nrotate([\n  [1, 2],\n  [3, 4],\n], 4)',
      'let { rotate } = import("grid");\nrotate([\n  [1, 2],\n  [3, 4],\n], -1)',
      'let { rotate } = import("grid");\nrotate([\n  [1, 2],\n  [3, 4],\n], -2)',
      'let { rotate } = import("grid");\nrotate([\n  [1, 2],\n  [3, 4],\n], -3)',
    ],
    seeAlso: ['grid.transpose', 'grid.flipH', 'grid.flipV'],
  },
  'crop': {
    type: '(Unknown[][], Number[]) -> Unknown[][]',
    category: 'grid',
    description: 'Crops the grid `g` from the starting index `begin` to the optional ending index `stop`. The crop is inclusive of the starting index and exclusive of the ending index.',
    returns: {
      type: 'grid',
    },
    args: {
      g: {
        type: 'grid',
        description: 'The grid to slice.',
      },
      begin: {
        type: 'vector',
        description: 'The starting index of the slice as a vector of two numbers: `[row, col]`.',
      },
      stop: {
        type: 'vector',
        description: 'Optional ending index of the slice as a vector of two numbers: `[row, col]`.',
      },
    },
    variants: [
      {
        argumentNames: [
          'g',
          'begin',
        ],
      },
      {
        argumentNames: [
          'g',
          'begin',
          'stop',
        ],
      },
    ],
    examples: [
      'let { crop } = import("grid");\ncrop([\n  ["Albert", "father", 10],\n  ["Nina", "mother", 20],\n  ["Kian", "son", 30],\n], [1, 1], [2, 2])',
      'let { crop } = import("grid");\ncrop([\n  ["Albert", "father", 10],\n  ["Nina", "mother", 20],\n  ["Kian", "son", 30],\n], [1, 1])',
    ],
    hideOperatorForm: true,
    seeAlso: ['grid.sliceRows', 'grid.sliceCols'],
  },
  'sliceRows': {
    type: '(Unknown[][], Number) -> Unknown[][]',
    category: 'grid',
    description: 'Slices rows of the grid `g` from the starting index `begin` to the optional ending index `stop`. The slice is inclusive of the starting index and exclusive of the ending index.',
    returns: {
      type: 'grid',
    },
    args: {
      g: {
        type: 'grid',
        description: 'The grid to slice.',
      },
      begin: {
        type: 'number',
        description: 'The starting index of the slice.',
      },
      stop: {
        type: 'number',
        description: 'Optional ending index of the slice.',
      },
    },
    variants: [
      {
        argumentNames: [
          'g',
          'begin',
        ],
      },
      {
        argumentNames: [
          'g',
          'begin',
          'stop',
        ],
      },
    ],
    examples: [
      'let { sliceRows } = import("grid");\nsliceRows([\n  ["Albert", "father", 10],\n  ["Nina", "mother", 20],\n  ["Kian", "son", 30],\n], 1, 2)',
      'let { sliceRows } = import("grid");\nsliceRows([\n  ["Albert", "father", 10],\n  ["Nina", "mother", 20],\n  ["Kian", "son", 30],\n], 1)',
    ],
    hideOperatorForm: true,
    seeAlso: ['grid.crop', 'grid.sliceCols', 'grid.spliceRows'],
  },
  'sliceCols': {
    type: '(Unknown[][], Number) -> Unknown[][]',
    category: 'grid',
    description: 'Slices columns of the grid `g` from the starting index `begin` to the optional ending index `stop`. The slice is inclusive of the starting index and exclusive of the ending index.',
    returns: {
      type: 'grid',
    },
    args: {
      g: {
        type: 'grid',
        description: 'The grid to slice.',
      },
      begin: {
        type: 'number',
        description: 'The starting index of the slice.',
      },
      stop: {
        type: 'number',
        description: 'Optional ending index of the slice.',
      },
    },
    variants: [
      {
        argumentNames: [
          'g',
          'begin',
        ],
      },
      {
        argumentNames: [
          'g',
          'begin',
          'stop',
        ],
      },
    ],
    examples: [
      'let { sliceCols } = import("grid");\nsliceCols([\n  ["Albert", "father", 10],\n  ["Nina", "mother", 20],\n  ["Kian", "son", 30],\n], 1, 2)',
      'let { sliceCols } = import("grid");\nsliceCols([\n  ["Albert", "father", 10],\n  ["Nina", "mother", 20],\n  ["Kian", "son", 30],\n], 1)',
    ],
    hideOperatorForm: true,
    seeAlso: ['grid.crop', 'grid.sliceRows', 'grid.spliceCols'],
  },
  'spliceRows': {
    type: '(Unknown[][], Number, Number, ...Unknown[]) -> Unknown[][]',
    category: 'grid',
    description: 'Splices rows of the grid `g` starting from the index `begin`. Deletes `deleteCount` rows and inserts the specified `items` at that position.',
    returns: {
      type: 'grid',
    },
    args: {
      g: {
        type: 'grid',
        description: 'The grid to splice.',
      },
      begin: {
        type: 'number',
        description: 'The starting index of the splice.',
      },
      deleteCount: {
        type: 'number',
        description: 'The number of rows to delete.',
      },
      items: {
        type: 'array',
        rest: true,
        description: 'The rows to insert.',
      },
    },
    variants: [
      {
        argumentNames: [
          'g',
          'begin',
          'deleteCount',
        ],
      },
      {
        argumentNames: [
          'g',
          'begin',
          'deleteCount',
          'items',
        ],
      },
    ],
    examples: [
      'let { spliceRows } = import("grid");\nspliceRows([\n  ["Albert", "father", 10],\n  ["Nina", "mother", 20],\n  ["Kian", "son", 30],\n], 1, 2)',
      'let { spliceRows } = import("grid");\nspliceRows([\n  ["Albert", "father", 10],\n  ["Nina", "mother", 20],\n  ["Kian", "son", 30],\n], 1, 1, ["Nazanin", "mother", 40])',
    ],
    hideOperatorForm: true,
    seeAlso: ['grid.spliceCols', 'grid.sliceRows'],
  },
  'spliceCols': {
    type: '(Unknown[][], Number, Number, ...Unknown[]) -> Unknown[][]',
    category: 'grid',
    description: 'Splices columns of the grid `g` starting from the index `begin`. Deletes `deleteCount` columns and inserts the specified `items` at that position.',
    returns: {
      type: 'grid',
    },
    args: {
      g: {
        type: 'grid',
        description: 'The grid to splice.',
      },
      begin: {
        type: 'number',
        description: 'The starting index of the splice.',
      },
      deleteCount: {
        type: 'number',
        description: 'The number of columns to delete.',
      },
      items: {
        type: 'array',
        rest: true,
        description: 'The columns to insert.',
      },
    },
    variants: [
      {
        argumentNames: [
          'g',
          'begin',
          'deleteCount',
        ],
      },
      {
        argumentNames: [
          'g',
          'begin',
          'deleteCount',
          'items',
        ],
      },
    ],
    examples: [
      'let { spliceCols } = import("grid");\nspliceCols([\n  ["Albert", "father", 10],\n  ["Nina", "mother", 20],\n  ["Kian", "son", 30],\n], 1, 2)',
      'let { spliceCols } = import("grid");\nspliceCols([\n  ["Albert", "father", 10],\n  ["Nina", "mother", 20],\n  ["Kian", "son", 30],\n], 1, 1, ["f", "m", "s"])',
    ],
    hideOperatorForm: true,
    seeAlso: ['grid.spliceRows', 'grid.sliceCols'],
  },
  'concatRows': {
    type: '(Unknown[][], Unknown[][]) -> Unknown[][]',
    category: 'grid',
    description: 'Concatenates two grids `a` and `b` by rows. The number of columns in both grids must be the same.',
    returns: {
      type: 'grid',
    },
    args: {
      a: {
        type: 'grid',
      },
      b: {
        type: 'grid',
      },
    },
    variants: [
      {
        argumentNames: [
          'a',
          'b',
        ],
      },
    ],
    examples: [
      'let { concatRows } = import("grid");\nconcatRows([\n  ["Albert", "father"],\n  ["Nina", "mother"],\n  ["Kian", "son"],\n], [\n  [1, 2],\n  [3, 4],\n])',
    ],
    seeAlso: ['grid.concatCols', 'grid.pushRows'],
  },
  'concatCols': {
    type: '(Unknown[][], Unknown[][]) -> Unknown[][]',
    category: 'grid',
    description: 'Concatenates two grids `a` and `b` by columns. The number of rows in both grids must be the same.',
    returns: {
      type: 'grid',
    },
    args: {
      a: {
        type: 'grid',
      },
      b: {
        type: 'grid',
      },
    },
    variants: [
      {
        argumentNames: [
          'a',
          'b',
        ],
      },
    ],
    examples: [
      'let { concatCols } = import("grid");\nconcatCols([\n  ["Albert", "father", 10],\n  ["Nina", "mother", 20],\n  ["Kian", "son", 30],\n], [\n  ["Albert", "father"],\n  ["Nina", "mother"],\n  ["Kian", "son"],\n])',
    ],
    seeAlso: ['grid.concatRows', 'grid.pushCols'],
  },
  'cellMap': {
    type: '(Unknown[][], (Unknown -> Unknown)) -> Unknown[][]',
    category: 'grid',
    description: 'Maps a function `a` over each element of the grid `b`, returning a new grid with the results.',
    returns: {
      type: 'grid',
    },
    args: {
      a: {
        type: 'grid',
      },
      b: {
        type: 'function',
      },
    },
    variants: [
      {
        argumentNames: [
          'a',
          'b',
        ],
      },
    ],
    examples: [
      'let { cellMap } = import("grid");\ncellMap([\n  ["Albert", "father", 10],\n  ["Nina", "mother", 20],\n  ["Kian", "son", 30],\n], str)',
    ],
    seeAlso: ['map', 'grid.cellMapi', 'grid.cellReduce'],
  },
  'cellMapi': {
    type: '(Unknown[][], (Unknown, Number, Number) -> Unknown) -> Unknown[][]',
    category: 'grid',
    description: 'Maps a function `a` over each element of the grid `b`, passing the row and column index as additional arguments to the function.',
    returns: {
      type: 'grid',
    },
    args: {
      a: {
        type: 'grid',
      },
      b: {
        type: 'function',
      },
    },
    variants: [
      {
        argumentNames: [
          'a',
          'b',
        ],
      },
    ],
    examples: [
      'let { cellMapi } = import("grid");\ncellMapi([\n  ["Albert", "father", 10],\n  ["Nina", "mother", 20],\n  ["Kian", "son", 30],\n], -> $ ++ "(" ++ $2 ++ ", " ++ $3 ++ ")")',
    ],
    seeAlso: ['grid.cellMap', 'grid.cellReducei', 'map'],
  },
  'cellReduce': {
    type: '(Unknown[][], (Unknown, Unknown) -> Unknown, Unknown) -> Unknown',
    category: 'grid',
    description: 'Reduces the grid `a` using the function `b`, returning a single value.',
    returns: {
      type: 'any',
    },
    args: {
      'g': {
        type: 'grid',
        description: 'The grid to reduce.',
      },
      'f': {
        type: 'function',
        description: 'The function to reduce the grid. It takes two arguments: the accumulator and the current element.',
      },
      'initialValue': {
        type: 'any',
        description: 'The initial value for the accumulator.',
      },
    },
    variants: [
      {
        argumentNames: [
          'g',
          'f',
          'initialValue',
        ],
      },
    ],
    examples: [
      '// Using "as" alias because "reduce" shadows a builtin function\nlet { cellReduce } = import("grid");\ncellReduce([\n  ["Albert", "father", 10],\n  ["Nina", "mother", 20],\n  ["Kian", "son", 30],\n], ++, "")',
    ],
    seeAlso: ['reduce', 'grid.cellReducei', 'grid.cellMap'],
  },
  'cellReducei': {
    type: '(Unknown[][], (Unknown, Unknown, Number, Number) -> Unknown, Unknown) -> Unknown',
    category: 'grid',
    description: 'Reduces the grid `a` using the function `b`, passing the row and column indices as additional arguments to the function.',
    returns: {
      type: 'any',
    },
    args: {
      'g': {
        type: 'grid',
        description: 'The grid to reduce.',
      },
      'f': {
        type: 'function',
        description: 'The function to reduce the grid. It takes four arguments: the accumulator, the current element, the row index, and the column index.',
      },
      'initialValue': {
        type: 'any',
        description: 'The initial value for the accumulator.',
      },
    },
    variants: [
      {
        argumentNames: [
          'g',
          'f',
          'initialValue',
        ],
      },
    ],
    examples: [
      '// Using "as" alias because "reducei" shadows a builtin function\nlet { cellReducei } = import("grid");\ncellReducei([\n  ["Albert", "father", 10],\n  ["Nina", "mother", 20],\n  ["Kian", "son", 30],\n], ++, "")',
    ],
    seeAlso: ['grid.cellReduce', 'grid.cellMapi', 'reduce'],
  },
  'pushRows': {
    type: '(Unknown[][], ...Unknown[]) -> Unknown[][]',
    category: 'grid',
    description: 'Pushes the specified rows into the grid `g` and returns the new grid.',
    returns: {
      type: 'grid',
    },
    args: {
      g: {
        type: 'grid',
        description: 'The grid to push rows into.',
      },
      rows: {
        type: 'array',
        rest: true,
        description: 'The rows to push into the grid.',
      },
    },
    variants: [
      {
        argumentNames: [
          'g',
          'rows',
        ],
      },
    ],
    examples: [
      'let { pushRows } = import("grid");\npushRows([\n  ["Albert", "father", 10],\n  ["Nina", "mother", 20],\n  ["Kian", "son", 30],\n], ["Nazanin", "mother", 40])',
    ],
    hideOperatorForm: true,
    seeAlso: ['grid.unshiftRows', 'grid.popRow', 'grid.shiftRow', 'grid.concatRows'],
  },
  'unshiftRows': {
    type: '(Unknown[][], ...Unknown[]) -> Unknown[][]',
    category: 'grid',
    description: 'Unshifts the specified rows into the grid `g` and returns the new grid.',
    returns: {
      type: 'grid',
    },
    args: {
      g: {
        type: 'grid',
        description: 'The grid to unshift rows into.',
      },
      rows: {
        type: 'array',
        rest: true,
        description: 'The rows to unshift into the grid.',
      },
    },
    variants: [
      {
        argumentNames: [
          'g',
          'rows',
        ],
      },
    ],
    examples: [
      'let { unshiftRows } = import("grid");\nunshiftRows([\n  ["Albert", "father", 10],\n  ["Nina", "mother", 20],\n  ["Kian", "son", 30],\n], ["Nazanin", "mother", 40])',
    ],
    hideOperatorForm: true,
    seeAlso: ['grid.pushRows', 'grid.shiftRow', 'grid.popRow'],
  },
  'popRow': {
    type: '(Unknown[][]) -> Unknown[][]',
    category: 'grid',
    description: 'Pops the last row from the grid `g` and returns the new grid.',
    returns: {
      type: 'grid',
    },
    args: {
      g: {
        type: 'grid',
        description: 'The grid to pop a row from.',
      },
    },
    variants: [
      {
        argumentNames: [
          'g',
        ],
      },
    ],
    examples: [
      'let { popRow } = import("grid");\npopRow([\n  ["Albert", "father", 10],\n  ["Nina", "mother", 20],\n  ["Kian", "son", 30],\n])',
    ],
    seeAlso: ['grid.shiftRow', 'grid.pushRows', 'grid.unshiftRows'],
  },
  'shiftRow': {
    type: '(Unknown[][]) -> Unknown[][]',
    category: 'grid',
    description: 'Shifts the first row from the grid `g` and returns the new grid.',
    returns: {
      type: 'grid',
    },
    args: {
      g: {
        type: 'grid',
        description: 'The grid to shift a row from.',
      },
    },
    variants: [
      {
        argumentNames: [
          'g',
        ],
      },
    ],
    examples: [
      'let { shiftRow } = import("grid");\nshiftRow([\n  ["Albert", "father", 10],\n  ["Nina", "mother", 20],\n  ["Kian", "son", 30],\n])',
    ],
    seeAlso: ['grid.popRow', 'grid.pushRows', 'grid.unshiftRows'],
  },
  'pushCols': {
    type: '(Unknown[][], ...Unknown[]) -> Unknown[][]',
    category: 'grid',
    description: 'Pushes the specified columns into the grid `g` and returns the new grid.',
    returns: {
      type: 'grid',
    },
    args: {
      g: {
        type: 'grid',
        description: 'The grid to push columns into.',
      },
      cols: {
        type: 'array',
        rest: true,
        description: 'The columns to push into the grid.',
      },
    },
    variants: [
      {
        argumentNames: [
          'g',
          'cols',
        ],
      },
    ],
    examples: [
      'let { pushCols } = import("grid");\npushCols([\n  ["Albert", "father", 10],\n  ["Nina", "mother", 20],\n  ["Kian", "son", 30],\n], ["f", "m", "s"])',
    ],
    hideOperatorForm: true,
    seeAlso: ['grid.unshiftCols', 'grid.popCol', 'grid.shiftCol', 'grid.concatCols'],
  },
  'unshiftCols': {
    type: '(Unknown[][], ...Unknown[]) -> Unknown[][]',
    category: 'grid',
    description: 'Unshifts the specified columns into the grid `g` and returns the new grid.',
    returns: {
      type: 'grid',
    },
    args: {
      g: {
        type: 'grid',
        description: 'The grid to unshift columns into.',
      },
      cols: {
        type: 'array',
        rest: true,
        description: 'The columns to unshift into the grid.',
      },
    },
    variants: [
      {
        argumentNames: [
          'g',
          'cols',
        ],
      },
    ],
    examples: [
      'let { unshiftCols } = import("grid");\nunshiftCols([\n  ["Albert", "father", 10],\n  ["Nina", "mother", 20],\n  ["Kian", "son", 30],\n], ["f", "m", "s"])',
    ],
    hideOperatorForm: true,
    seeAlso: ['grid.pushCols', 'grid.shiftCol', 'grid.popCol'],
  },
  'popCol': {
    type: '(Unknown[][]) -> Unknown[][]',
    category: 'grid',
    description: 'Pops the last column from the grid `g` and returns the new grid.',
    returns: {
      type: 'grid',
    },
    args: {
      g: {
        type: 'grid',
        description: 'The grid to pop a column from.',
      },
    },
    variants: [
      {
        argumentNames: [
          'g',
        ],
      },
    ],
    examples: [
      'let { popCol } = import("grid");\npopCol([\n  ["Albert", "father", 10],\n  ["Nina", "mother", 20],\n  ["Kian", "son", 30],\n])',
    ],
    seeAlso: ['grid.shiftCol', 'grid.pushCols', 'grid.unshiftCols'],
  },
  'shiftCol': {
    type: '(Unknown[][]) -> Unknown[][]',
    category: 'grid',
    description: 'Shifts the first column from the grid `g` and returns the new grid.',
    returns: {
      type: 'grid',
    },
    args: {
      g: {
        type: 'grid',
        description: 'The grid to shift a column from.',
      },
    },
    variants: [
      {
        argumentNames: [
          'g',
        ],
      },
    ],
    examples: [
      'let { shiftCol } = import("grid");\nshiftCol([\n  ["Albert", "father", 10],\n  ["Nina", "mother", 20],\n  ["Kian", "son", 30],\n])',
    ],
    seeAlso: ['grid.popCol', 'grid.pushCols', 'grid.unshiftCols'],
  },
  'fromArray': {
    type: '(Unknown[], Number) -> Unknown[][]',
    category: 'grid',
    description: 'Creates a grid from a flat array with specified dimensions. The array is reshaped into the specified number of rows, and the number of columns is automatically calculated based on the total number of elements in the array.',
    returns: {
      type: 'grid',
    },
    args: {
      a: {
        type: 'array',
      },
      b: {
        type: 'number',
      },
    },
    variants: [
      {
        argumentNames: [
          'a',
          'b',
        ],
      },
    ],
    examples: [
      'let { fromArray } = import("grid");\nfromArray([1, 2, 3, 4], 2)',
      'let { fromArray } = import("grid");\nfromArray([1, 2, 3, 4], 4)',
    ],
    seeAlso: ['grid.fill', 'grid.generate', 'grid.reshape'],
  },
}
