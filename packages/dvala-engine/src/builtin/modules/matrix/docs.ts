import type { FunctionDocs } from '../../interface'

export const moduleDocs: Record<string, FunctionDocs> = {
  mul: {
    type: '(Number[][], Number[][]) -> Number[][]',
    category: 'matrix',
    description:
      'Multiplies two `matrices` using standard `matrix` multiplication based on **dot products** of rows and columns.',
    returns: {
      type: 'matrix',
    },
    args: {
      a: {
        type: 'matrix',
      },
      b: {
        type: 'matrix',
      },
    },
    variants: [
      {
        argumentNames: ['a', 'b'],
      },
    ],
    examples: [
      'let { mul } = import("matrix");\nmul([[1, 2], [3, 4]], [[5, 6], [7, 8]])',
      'let { mul } = import("matrix");\nmul([[1, 2, 3], [4, 5, 6]], [[7, 8], [9, 10], [11, 12]])',
    ],
    seeAlso: ['matrix.det', 'matrix.inv'],
  },
  det: {
    type: '(Number[][]) -> Number',
    category: 'matrix',
    description: 'Calculates the **determinant** of a square matrix.',
    returns: {
      type: 'number',
    },
    args: {
      m: {
        type: 'matrix',
        description: 'The `matrix` to calculate the determinant of.',
      },
    },
    variants: [
      {
        argumentNames: ['m'],
      },
    ],
    examples: [
      'let { det } = import("matrix");\ndet([[1, 2], [3, 4]])',
      'let { det } = import("matrix");\ndet([[1, 2, 3], [4, 5, 6], [7, 8, 9]])',
    ],
    seeAlso: [
      'matrix.inv',
      'matrix.cofactor',
      'matrix.adj',
      'matrix.trace',
      'matrix.rank',
      'matrix.isInvertible',
      'matrix.mul',
      'matrix.minor',
    ],
  },
  inv: {
    type: '(Number[][]) -> Number[][]',
    category: 'matrix',
    description: 'Calculates the **inverse** of a square matrix.',
    returns: {
      type: 'matrix',
    },
    args: {
      m: {
        type: 'matrix',
        description: 'The `matrix` to calculate the inverse of.',
      },
    },
    variants: [
      {
        argumentNames: ['m'],
      },
    ],
    examples: [
      'let { inv } = import("matrix");\ninv([[1, 2], [3, 4]])',
      'let { inv } = import("matrix");\ninv([[1, 2, 3], [4, 5, 7], [7, 8, 10]])',
    ],
    seeAlso: [
      'matrix.det',
      'matrix.adj',
      'matrix.isInvertible',
      'linearAlgebra.solve',
      'matrix.mul',
      'matrix.isOrthogonalMatrix',
    ],
  },
  adj: {
    type: '(Number[][]) -> Number[][]',
    category: 'matrix',
    description: 'Calculates the **adjugate** of a square matrix.',
    returns: {
      type: 'matrix',
    },
    args: {
      m: {
        type: 'matrix',
        description: 'The `matrix` to calculate the adjugate of.',
      },
    },
    variants: [
      {
        argumentNames: ['m'],
      },
    ],
    examples: [
      'let { adj } = import("matrix");\nadj([[1, 2], [3, 4]])',
      'let { adj } = import("matrix");\nadj([[1, 2, 3], [4, 5, 6], [7, 8, 9]])',
      'let { adj } = import("matrix");\nadj([[1, 2, 3], [7, 8, 9], [4, 5, 6]])',
    ],
    seeAlso: ['matrix.cofactor', 'matrix.det', 'matrix.inv'],
  },
  cofactor: {
    type: '(Number[][]) -> Number[][]',
    category: 'matrix',
    description: 'Calculates the **cofactor** of a square matrix.',
    returns: {
      type: 'matrix',
    },
    args: {
      m: {
        type: 'matrix',
        description: 'The `matrix` to calculate the cofactor of.',
      },
    },
    variants: [
      {
        argumentNames: ['m'],
      },
    ],
    examples: [
      'let { cofactor } = import("matrix");\ncofactor([[1, 2], [3, 4]])',
      'let { cofactor } = import("matrix");\ncofactor([[1, 2, 3], [4, 5, 6], [7, 8, 9]])',
      'let { cofactor } = import("matrix");\ncofactor([[1, 2, 3], [7, 8, 9], [4, 5, 6]])',
    ],
    seeAlso: ['matrix.adj', 'matrix.minor', 'matrix.det'],
  },
  minor: {
    type: '(Number[][], Number, Number) -> Number[][]',
    category: 'matrix',
    description: 'Calculates the **minor** of a square matrix.',
    returns: {
      type: 'matrix',
    },
    args: {
      m: {
        type: 'matrix',
        description: 'The `matrix` to calculate the minor of.',
      },
      row: {
        type: 'integer',
        description: 'The row index of the element to calculate the minor for.',
      },
      col: {
        type: 'integer',
        description: 'The column index of the element to calculate the minor for.',
      },
    },
    variants: [
      {
        argumentNames: ['m', 'row', 'col'],
      },
    ],
    examples: [
      'let { minor } = import("matrix");\nminor([[1, 2], [3, 4]], 0, 1)',
      'let { minor } = import("matrix");\nminor([[1, 2, 3], [4, 5, 6], [7, 8, 9]], 1, 1)',
    ],
    seeAlso: ['matrix.cofactor', 'matrix.det'],
  },
  trace: {
    type: '(Number[][]) -> Number',
    category: 'matrix',
    description: 'Calculates the **trace** of a square matrix.',
    returns: {
      type: 'number',
    },
    args: {
      m: {
        type: 'matrix',
        description: 'The `matrix` to calculate the trace of.',
      },
    },
    variants: [
      {
        argumentNames: ['m'],
      },
    ],
    examples: [
      'let { trace } = import("matrix");\ntrace([[1, 2], [3, 4]])',
      'let { trace } = import("matrix");\ntrace([[1, 2, 3], [4, 5, 6], [7, 8, 9]])',
    ],
    seeAlso: ['matrix.det', 'matrix.isDiagonal'],
  },
  isSymmetric: {
    type: '(Number[][]) -> Boolean',
    category: 'matrix',
    description: 'Checks if a `matrix` is **symmetric**.',
    returns: {
      type: 'boolean',
    },
    args: {
      m: {
        type: 'matrix',
        description: 'The `matrix` to check for symmetry.',
      },
    },
    variants: [
      {
        argumentNames: ['m'],
      },
    ],
    examples: [
      'let { isSymmetric } = import("matrix");\nisSymmetric([[1, 2], [2, 1]])',
      'let { isSymmetric } = import("matrix");\nisSymmetric([[1, 2, 3], [2, 1, 4], [3, 4, 1]])',
    ],
    seeAlso: ['matrix.isOrthogonalMatrix', 'matrix.isDiagonal', 'matrix.isSquare', 'matrix.hilbert'],
  },
  isTriangular: {
    type: '(Number[][]) -> Boolean',
    category: 'matrix',
    description: 'Checks if a `matrix` is **triangular**.',
    returns: {
      type: 'boolean',
    },
    args: {
      m: {
        type: 'matrix',
        description: 'The `matrix` to check for triangularity.',
      },
    },
    variants: [
      {
        argumentNames: ['m'],
      },
    ],
    examples: [
      'let { isTriangular } = import("matrix");\nisTriangular([[2, 0], [0, 1]])',
      'let { isTriangular } = import("matrix");\nisTriangular([[1, 2, 3], [0, 4, 5], [0, 0, 6]])',
    ],
    seeAlso: ['matrix.isUpperTriangular', 'matrix.isLowerTriangular', 'matrix.isDiagonal', 'matrix.isBanded'],
  },
  isUpperTriangular: {
    type: '(Number[][]) -> Boolean',
    category: 'matrix',
    description: 'Checks if a `matrix` is **upper triangular**.',
    returns: {
      type: 'boolean',
    },
    args: {
      m: {
        type: 'matrix',
        description: 'The `matrix` to check for upper triangularity.',
      },
    },
    variants: [
      {
        argumentNames: ['m'],
      },
    ],
    examples: [
      'let { isUpperTriangular } = import("matrix");\nisUpperTriangular([[1, 2], [0, 3]])',
      'let { isUpperTriangular } = import("matrix");\nisUpperTriangular([[1, 2, 3], [0, 4, 5], [0, 0, 6]])',
    ],
    seeAlso: ['matrix.isLowerTriangular', 'matrix.isTriangular', 'matrix.isDiagonal'],
  },
  isLowerTriangular: {
    type: '(Number[][]) -> Boolean',
    category: 'matrix',
    description: 'Checks if a `matrix` is **lower triangular**.',
    returns: {
      type: 'boolean',
    },
    args: {
      m: {
        type: 'matrix',
        description: 'The `matrix` to check for lower triangularity.',
      },
    },
    variants: [
      {
        argumentNames: ['m'],
      },
    ],
    examples: [
      'let { isLowerTriangular } = import("matrix");\nisLowerTriangular([[1, 0], [2, 3]])',
      'let { isLowerTriangular } = import("matrix");\nisLowerTriangular([[1, 0, 0], [2, 3, 0], [4, 5, 6]])',
    ],
    seeAlso: ['matrix.isUpperTriangular', 'matrix.isTriangular', 'matrix.isDiagonal'],
  },
  isDiagonal: {
    type: '(Number[][]) -> Boolean',
    category: 'matrix',
    description: 'Checks if a `matrix` is **diagonal**.',
    returns: {
      type: 'boolean',
    },
    args: {
      m: {
        type: 'matrix',
        description: 'The `matrix` to check for diagonal property.',
      },
    },
    variants: [
      {
        argumentNames: ['m'],
      },
    ],
    examples: [
      'let { isDiagonal } = import("matrix");\nisDiagonal([[1, 0], [0, 2]])',
      'let { isDiagonal } = import("matrix");\nisDiagonal([[1, 0, 0], [0, 2, 0], [0, 0, 3]])',
      'let { isDiagonal } = import("matrix");\nisDiagonal([[1, 0, 0], [2, 2, 2], [0, 0, 3]])',
    ],
    seeAlso: [
      'matrix.isIdentity',
      'matrix.isSymmetric',
      'matrix.isTriangular',
      'matrix.trace',
      'matrix.isUpperTriangular',
      'matrix.isLowerTriangular',
      'matrix.band',
      'matrix.isBanded',
    ],
  },
  isSquare: {
    type: '(Number[][]) -> Boolean',
    category: 'matrix',
    description: 'Checks if a `matrix` is **square**.',
    returns: {
      type: 'boolean',
    },
    args: {
      m: {
        type: 'matrix',
        description: 'The `matrix` to check for square property.',
      },
    },
    variants: [
      {
        argumentNames: ['m'],
      },
    ],
    examples: [
      'let { isSquare } = import("matrix");\nisSquare([[1, 2], [3, 4]])',
      'let { isSquare } = import("matrix");\nisSquare([[1, 2, 3], [4, 5, 6], [7, 8, 9]])',
      'let { isSquare } = import("matrix");\nisSquare([[1, 2, 3], [4, 5, 6]])',
    ],
    seeAlso: ['matrix.isSymmetric', 'matrix.isIdentity', 'matrix.isInvertible'],
  },
  isOrthogonalMatrix: {
    type: '(Number[][]) -> Boolean',
    category: 'matrix',
    description: 'Checks if a `matrix` is **orthogonal**.',
    returns: {
      type: 'boolean',
    },
    args: {
      m: {
        type: 'matrix',
        description: 'The `matrix` to check for **orthogonality**.',
      },
    },
    variants: [
      {
        argumentNames: ['m'],
      },
    ],
    examples: [
      'let { isOrthogonalMatrix } = import("matrix");\nisOrthogonalMatrix([[1, 0], [0, 1]])',
      'let { isOrthogonalMatrix } = import("matrix");\nisOrthogonalMatrix([[1, 0], [0, -1]])',
      'let { isOrthogonalMatrix } = import("matrix");\nisOrthogonalMatrix([[1, 2], [3, 4]])',
    ],
    seeAlso: ['matrix.isSymmetric', 'matrix.inv', 'matrix.isIdentity', 'linearAlgebra.isOrthogonal'],
  },
  isIdentity: {
    type: '(Number[][]) -> Boolean',
    category: 'matrix',
    description: 'Checks if a `matrix` is an **identity matrix**.',
    returns: {
      type: 'boolean',
    },
    args: {
      m: {
        type: 'matrix',
        description: 'The `matrix` to check for identity property.',
      },
    },
    variants: [
      {
        argumentNames: ['m'],
      },
    ],
    examples: [
      'let { isIdentity } = import("matrix");\nisIdentity([[1, 0], [0, 1]])',
      'let { isIdentity } = import("matrix");\nisIdentity([[1, 0, 0], [0, 1, 0], [0, 0, 1]])',
      'let { isIdentity } = import("matrix");\nisIdentity([[1, 0, 0], [0, 1, 0], [0, 0, 0]])',
    ],
    seeAlso: ['matrix.isDiagonal', 'matrix.isSquare', 'matrix.isOrthogonalMatrix'],
  },
  isInvertible: {
    type: '(Number[][]) -> Boolean',
    category: 'matrix',
    description: 'Checks if a `matrix` is **invertible**.',
    returns: {
      type: 'boolean',
    },
    args: {
      m: {
        type: 'matrix',
        description: 'The `matrix` to check for invertibility.',
      },
    },
    variants: [
      {
        argumentNames: ['m'],
      },
    ],
    examples: [
      'let { isInvertible } = import("matrix");\nisInvertible([[1, 2], [3, 4]])',
      'let { isInvertible } = import("matrix");\nisInvertible([[1, 2, 3], [4, 5, 6], [7, 8, 9]])',
      'let { isInvertible } = import("matrix");\nisInvertible([[1, 2], [2, 4]])',
    ],
    seeAlso: ['matrix.det', 'matrix.inv', 'matrix.rank', 'matrix.isSquare'],
  },
  hilbert: {
    type: '(Number) -> Number[][]',
    category: 'matrix',
    description: 'Generates a **Hilbert matrix** of size `n`.',
    returns: {
      type: 'matrix',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The size of the Hilbert matrix.',
      },
    },
    variants: [
      {
        argumentNames: ['n'],
      },
    ],
    examples: ['let { hilbert } = import("matrix");\nhilbert(3)', 'let { hilbert } = import("matrix");\nhilbert(4)'],
    seeAlso: ['matrix.vandermonde', 'matrix.isSymmetric'],
  },
  vandermonde: {
    type: '(Number[]) -> Number[][]',
    category: 'matrix',
    description: 'Generates a **Vandermonde matrix** from a vector.',
    returns: {
      type: 'matrix',
    },
    args: {
      v: {
        type: 'vector',
        description: 'The vector to generate the Vandermonde matrix from.',
      },
    },
    variants: [
      {
        argumentNames: ['v'],
      },
    ],
    examples: [
      'let { vandermonde } = import("matrix");\nvandermonde([1, 2, 3])',
      'let { vandermonde } = import("matrix");\nvandermonde([1, 0, 1])',
    ],
    seeAlso: ['matrix.hilbert', 'matrix.band'],
  },
  band: {
    type: '(Number, Number, Number) -> Number[][]',
    category: 'matrix',
    description:
      'Generates a **banded matrix** of size `n` with lower band index `lband` and upper band index `uband`.',
    returns: {
      type: 'matrix',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The size of the banded matrix.',
      },
      lband: {
        type: 'integer',
        description: 'The lower band index.',
      },
      uband: {
        type: 'integer',
        description: 'The upper band index.',
      },
    },
    variants: [
      {
        argumentNames: ['n', 'lband', 'uband'],
      },
    ],
    examples: ['let { band } = import("matrix");\nband(3, 1, 1)', 'let { band } = import("matrix");\nband(4, 1, 2)'],
    seeAlso: ['matrix.isBanded', 'matrix.isDiagonal', 'matrix.vandermonde'],
  },
  isBanded: {
    type: '(Number[][], Number, Number) -> Boolean',
    category: 'matrix',
    description: 'Checks if a `matrix` is **banded** with lower band index `lband` and upper band index `uband`.',
    returns: {
      type: 'boolean',
    },
    args: {
      m: {
        type: 'matrix',
        description: 'The `matrix` to check for **banded** property.',
      },
      lband: {
        type: 'integer',
        description: 'The lower band index.',
      },
      uband: {
        type: 'integer',
        description: 'The upper band index.',
      },
    },
    variants: [
      {
        argumentNames: ['m', 'lband', 'uband'],
      },
    ],
    examples: [
      'let { isBanded } = import("matrix");\nisBanded([\n  [1, 1, 1, 0],\n  [1, 1, 1, 1],\n  [1, 1, 1, 1],\n  [0, 1, 1, 1],\n], 2, 2)',
      'let { isBanded } = import("matrix");\nisBanded([\n  [1, 1, 1, 0],\n  [1, 1, 1, 1],\n  [1, 1, 1, 1],\n  [0, 1, 1, 1],\n], 1, 1)',
    ],
    seeAlso: ['matrix.band', 'matrix.isTriangular', 'matrix.isDiagonal'],
  },
  rank: {
    type: '(Number[][]) -> Number',
    category: 'matrix',
    description: 'Calculates the **rank** of a matrix using **Gaussian elimination**.',
    returns: {
      type: 'number',
    },
    args: {
      m: {
        type: 'matrix',
        description: 'The `matrix` to calculate the rank of.',
      },
    },
    variants: [
      {
        argumentNames: ['m'],
      },
    ],
    examples: [
      'let { rank } = import("matrix");\nrank([[1, 0, 0], [0, 1, 0], [0, 0, 1]])',
      'let { rank } = import("matrix");\nrank([[1, 2, 3], [4, 5, 6], [7, 8, 9]])',
      'let { rank } = import("matrix");\nrank([[2, 4, 6], [3, 6, 9], [4, 8, 12]])',
    ],
    seeAlso: ['matrix.det', 'matrix.isInvertible', 'linearAlgebra.rref'],
  },
  frobeniusNorm: {
    type: '(Number[][]) -> Number',
    category: 'matrix',
    description: 'Calculates the **Frobenius norm** of a matrix.',
    returns: {
      type: 'number',
    },
    args: {
      m: {
        type: 'matrix',
        description: 'The `matrix` to calculate the Frobenius norm of.',
      },
    },
    variants: [
      {
        argumentNames: ['m'],
      },
    ],
    examples: [
      'let { frobeniusNorm } = import("matrix");\nfrobeniusNorm([[1, 2], [3, 4]])',
      'let { frobeniusNorm } = import("matrix");\nfrobeniusNorm([[1, 2, 3], [4, 5, 6], [7, 8, 9]])',
    ],
    seeAlso: ['matrix.oneNorm', 'matrix.infNorm', 'matrix.maxNorm'],
  },
  oneNorm: {
    type: '(Number[][]) -> Number',
    category: 'matrix',
    description: 'Calculates the **oneNorm** (column norm) of a matrix.',
    returns: {
      type: 'number',
    },
    args: {
      m: {
        type: 'matrix',
        description: 'The `matrix` to calculate the oneNorm of.',
      },
    },
    variants: [
      {
        argumentNames: ['m'],
      },
    ],
    examples: [
      'let { oneNorm } = import("matrix");\noneNorm([[1, 2], [3, 4]])',
      'let { oneNorm } = import("matrix");\noneNorm([[1, 2, 3], [4, 5, 6], [7, 8, 9]])',
    ],
    seeAlso: ['matrix.frobeniusNorm', 'matrix.infNorm', 'matrix.maxNorm'],
  },
  infNorm: {
    type: '(Number[][]) -> Number',
    category: 'matrix',
    description: 'Calculates the **infinity norm** of a matrix.',
    returns: {
      type: 'number',
    },
    args: {
      m: {
        type: 'matrix',
        description: 'The `matrix` to calculate the infinity norm of.',
      },
    },
    variants: [
      {
        argumentNames: ['m'],
      },
    ],
    examples: [
      'let { infNorm } = import("matrix");\ninfNorm([[1, 2], [3, 4]])',
      'let { infNorm } = import("matrix");\ninfNorm([[1, 2, 3], [4, 5, 6], [7, 8, 9]])',
    ],
    seeAlso: ['matrix.frobeniusNorm', 'matrix.oneNorm', 'matrix.maxNorm'],
  },
  maxNorm: {
    type: '(Number[][]) -> Number',
    category: 'matrix',
    description: 'Calculates the **max norm** of a matrix.',
    returns: {
      type: 'number',
    },
    args: {
      m: {
        type: 'matrix',
        description: 'The `matrix` to calculate the max norm of.',
      },
    },
    variants: [
      {
        argumentNames: ['m'],
      },
    ],
    examples: [
      'let { maxNorm } = import("matrix");\nmaxNorm([[1, 2], [3, 4]])',
      'let { maxNorm } = import("matrix");\nmaxNorm([[1, 2, 3], [4, 5, 6], [7, 8, 9]])',
    ],
    seeAlso: ['matrix.frobeniusNorm', 'matrix.oneNorm', 'matrix.infNorm'],
  },
}
