import type { FunctionDocs } from '../../interface'

export const moduleDocs: Record<string, FunctionDocs> = {
  'reflect': {
    category: 'linearAlgebra',
    description: 'Reflects a vector across a given axis.',
    returns: {
      type: 'vector',
    },
    args: {
      a: {
        type: 'vector',
        description: 'Vector to reflect.',
      },
      b: {
        type: 'vector',
        description: 'Axis of reflection.',
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
      'let { reflect } = import("linearAlgebra");\nreflect([1, 2], [0, 1])',
      'let { reflect } = import("linearAlgebra");\nreflect([1, 2, 3], [0, 0, 1])',
    ],
    seeAlso: ['linearAlgebra.refract', 'linearAlgebra.projection'],
  },
  'refract': {
    category: 'linearAlgebra',
    description: 'Refracts a vector across a given axis.',
    returns: {
      type: 'vector',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'Vector to refract.',
      },
      axis: {
        type: 'vector',
        description: 'Axis of refraction.',
      },
      eta: {
        type: 'number',
        description: 'Refraction index.',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'axis',
          'eta',
        ],
      },
    ],
    examples: [
      'let { refract } = import("linearAlgebra");\nrefract([1, 2], [0, 1], 1.5)',
      'let { refract } = import("linearAlgebra");\nrefract([1, 2, 3], [0, 0, 1], 1.5)',
    ],
    seeAlso: ['linearAlgebra.reflect'],
  },
  'lerp': {
    category: 'linearAlgebra',
    description: 'Performs linear interpolation between two vectors.',
    returns: {
      type: 'vector',
    },
    args: {
      a: {
        type: 'vector',
        description: 'Start vector.',
      },
      b: {
        type: 'vector',
        description: 'End vector.',
      },
      t: {
        type: 'number',
        description: 'Interpolation factor (0 to 1).',
      },
    },
    variants: [
      {
        argumentNames: [
          'a',
          'b',
          't',
        ],
      },
    ],
    examples: [
      'let { lerp } = import("linearAlgebra");\nlerp([1, 2], [3, 4], 0.5)',
      'let { lerp } = import("linearAlgebra");\nlerp([1, 2], [3, 4], 2)',
      'let { lerp } = import("linearAlgebra");\nlerp([1, 2], [3, 4], -1)',
      'let { lerp } = import("linearAlgebra");\nlerp([1, 2, 3], [4, 5, 6], 0.25)',
    ],
    seeAlso: ['linearAlgebra.projection'],
  },
  'rotate2d': {
    category: 'linearAlgebra',
    description: 'Rotates a 2D vector by a given angle in radians.',
    returns: {
      type: 'vector',
    },
    args: {
      a: {
        type: 'vector',
        description: 'Vector to rotate.',
      },
      b: {
        type: 'number',
        description: 'Angle in b.',
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
      'let { rotate2d } = import("linearAlgebra");\nrotate2d([1, 0], PI / 2)',
      'let { rotate2d } = import("linearAlgebra");\nrotate2d([0, 1], PI)',
    ],
    seeAlso: ['linearAlgebra.rotate3d', 'linearAlgebra.angle'],
  },
  'rotate3d': {
    category: 'linearAlgebra',
    description: 'Rotates a 3D vector around a given axis by a given angle in radians.',
    returns: {
      type: 'vector',
    },
    args: {
      v: {
        type: 'vector',
        description: 'Vector to rotate.',
      },
      axis: {
        type: 'vector',
        description: 'Axis of rotation.',
      },
      radians: {
        type: 'number',
        description: 'Angle in radians.',
      },
    },
    variants: [
      {
        argumentNames: [
          'v',
          'axis',
          'radians',
        ],
      },
    ],
    examples: [
      'let { rotate3d } = import("linearAlgebra");\nrotate3d([1, 0, 0], [0, 1, 0], PI / 2)',
      'let { rotate3d } = import("linearAlgebra");\nrotate3d([0, 1, 0], [1, 0, 0], PI)',
    ],
    seeAlso: ['linearAlgebra.rotate2d', 'linearAlgebra.angle'],
  },
  'dot': {
    category: 'linearAlgebra',
    description: 'Calculates the dot product of two vectors. The result is a scalar.',
    returns: {
      type: 'number',
    },
    args: {
      a: {
        type: 'vector',
        description: 'First vector.',
      },
      b: {
        type: 'vector',
        description: 'Second vector.',
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
      'let { dot } = import("linearAlgebra");\ndot([1, 2], [3, 4])',
      'let { dot } = import("linearAlgebra");\ndot([1, 2, 3], [4, 5, 6])',
    ],
    seeAlso: ['linearAlgebra.cross', 'linearAlgebra.cosineSimilarity', 'linearAlgebra.angle', 'linearAlgebra.projection', 'linearAlgebra.isOrthogonal'],
  },
  'cross': {
    category: 'linearAlgebra',
    description: 'Calculates the cross product of two 3D vectors. The result is a vector perpendicular to both input vectors.',
    returns: {
      type: 'vector',
    },
    args: {
      a: {
        type: 'vector',
        description: 'First vector (3D).',
      },
      b: {
        type: 'vector',
        description: 'Second vector (3D).',
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
      'let { cross } = import("linearAlgebra");\ncross([1, 2, 3], [4, 5, 6])',
      'let { cross } = import("linearAlgebra");\ncross([1, 0, 0], [0, 1, 0])',
      'let { cross } = import("linearAlgebra");\ncross([0, 0, 1], [1, 0, 0])',
      'let { cross } = import("linearAlgebra");\ncross([1, 2, 3], [0, 0, 0])',
      'let { cross } = import("linearAlgebra");\ncross([0, 0, 0], [1, 2, 3])',
    ],
    seeAlso: ['linearAlgebra.dot'],
  },
  'normalizeMinmax': {
    category: 'linearAlgebra',
    description: 'Normalizes the vector using min-max normalization. The result is a vector with values between 0 and 1.',
    returns: {
      type: 'number',
      array: true,
    },
    args: {
      v: {
        type: 'vector',
        description: 'Vector to normalize.',
      },
    },
    variants: [
      {
        argumentNames: [
          'v',
        ],
      },
    ],
    examples: [
      'let { normalizeMinmax } = import("linearAlgebra");\nnormalizeMinmax([1, 2, 3])',
      'let { normalizeMinmax } = import("linearAlgebra");\nnormalizeMinmax([1, 2, -3])',
      'let { normalizeMinmax } = import("linearAlgebra");\nnormalizeMinmax([1, 2, 3, 4])',
      'let { normalizeMinmax } = import("linearAlgebra");\nnormalizeMinmax([1, 2, -3, 4])',
      'let { normalizeMinmax } = import("linearAlgebra");\nnormalizeMinmax([1, 2, 3, 40, 50])',
    ],
    seeAlso: ['linearAlgebra.normalizeZscore', 'linearAlgebra.normalizeRobust', 'linearAlgebra.normalizeL1', 'linearAlgebra.normalizeL2', 'linearAlgebra.normalizeLog'],
  },
  'normalizeZscore': {
    category: 'linearAlgebra',
    description: 'Normalizes the vector using z-score normalization. The result is a vector with mean 0 and standard deviation 1.',
    returns: {
      type: 'number',
      array: true,
    },
    args: {
      v: {
        type: 'vector',
        description: 'Vector to normalize.',
      },
    },
    variants: [
      {
        argumentNames: [
          'v',
        ],
      },
    ],
    examples: [
      'let { normalizeZscore } = import("linearAlgebra");\nnormalizeZscore([1, 2, 3])',
      'let { normalizeZscore } = import("linearAlgebra");\nnormalizeZscore([1, 2, -3])',
      'let { normalizeZscore } = import("linearAlgebra");\nnormalizeZscore([1, 2, 3, 4])',
      'let { normalizeZscore } = import("linearAlgebra");\nnormalizeZscore([1, 2, -3, 4])',
      'let { normalizeZscore } = import("linearAlgebra");\nnormalizeZscore([1, 2, 3, 40, 50])',
    ],
    seeAlso: ['linearAlgebra.normalizeMinmax', 'linearAlgebra.normalizeRobust', 'linearAlgebra.normalizeL1', 'linearAlgebra.normalizeL2', 'linearAlgebra.normalizeLog'],
  },
  'normalizeRobust': {
    category: 'linearAlgebra',
    description: 'Normalizes the vector using robust normalization. The result is a vector with median 0 and median absolute deviation 1.',
    returns: {
      type: 'number',
      array: true,
    },
    args: {
      v: {
        type: 'vector',
        description: 'Vector to normalize.',
      },
    },
    variants: [
      {
        argumentNames: [
          'v',
        ],
      },
    ],
    examples: [
      'let { normalizeRobust } = import("linearAlgebra");\nnormalizeRobust([1, 2, 3])',
      'let { normalizeRobust } = import("linearAlgebra");\nnormalizeRobust([1, 2, -3])',
      'let { normalizeRobust } = import("linearAlgebra");\nnormalizeRobust([1, 2, 3, 4])',
      'let { normalizeRobust } = import("linearAlgebra");\nnormalizeRobust([1, 2, -3, 4])',
      'let { normalizeRobust } = import("linearAlgebra");\nnormalizeRobust([1, 2, 3, 40, 50])',
    ],
    seeAlso: ['linearAlgebra.normalizeMinmax', 'linearAlgebra.normalizeZscore'],
  },
  'normalizeL1': {
    category: 'linearAlgebra',
    description: 'Normalizes the vector using L1 normalization. The result is a vector with L1 norm equal to 1.',
    returns: {
      type: 'number',
      array: true,
    },
    args: {
      v: {
        type: 'vector',
        description: 'Vector to normalize.',
      },
    },
    variants: [
      {
        argumentNames: [
          'v',
        ],
      },
    ],
    examples: [
      'let { normalizeL1 } = import("linearAlgebra");\nnormalizeL1([1, 2, 3])',
      'let { normalizeL1 } = import("linearAlgebra");\nnormalizeL1([1, 2, -3])',
      'let { normalizeL1 } = import("linearAlgebra");\nnormalizeL1([1, 2, 3, 4])',
      'let { normalizeL1 } = import("linearAlgebra");\nnormalizeL1([1, 2, -3, 4])',
      'let { normalizeL1 } = import("linearAlgebra");\nnormalizeL1([1, 2, 3, 40, 50])',
    ],
    seeAlso: ['linearAlgebra.normalizeL2', 'linearAlgebra.normalizeMinmax', 'linearAlgebra.manhattanNorm', 'linearAlgebra.normalizeZscore'],
  },
  'normalizeL2': {
    category: 'linearAlgebra',
    description: 'Normalizes the vector using L2 normalization. The result is a vector with L2 norm equal to 1.',
    returns: {
      type: 'number',
      array: true,
    },
    args: {
      v: {
        type: 'vector',
        description: 'Vector to normalize.',
      },
    },
    variants: [
      {
        argumentNames: [
          'v',
        ],
      },
    ],
    examples: [
      'let { normalizeL2 } = import("linearAlgebra");\nnormalizeL2([1, 2, 3])',
      'let { normalizeL2 } = import("linearAlgebra");\nnormalizeL2([1, 2, 3])',
      'let { normalizeL2 } = import("linearAlgebra");\nnormalizeL2([1, 2, -3])',
      'let { normalizeL2 } = import("linearAlgebra");\nnormalizeL2([1, 2, 3, 4])',
      'let { normalizeL2 } = import("linearAlgebra");\nnormalizeL2([1, 2, -3, 4])',
      'let { normalizeL2 } = import("linearAlgebra");\nnormalizeL2([1, 2, 3, 40, 50])',
    ],
    seeAlso: ['linearAlgebra.normalizeL1', 'linearAlgebra.normalizeMinmax', 'linearAlgebra.euclideanNorm', 'linearAlgebra.normalizeZscore'],
  },
  'normalizeLog': {
    category: 'linearAlgebra',
    description: 'Normalizes the vector using natural log normalization. The result is a vector with log-transformed values.',
    returns: {
      type: 'number',
      array: true,
    },
    args: {
      v: {
        type: 'vector',
        description: 'Vector to normalize.',
      },
    },
    variants: [
      {
        argumentNames: [
          'v',
        ],
      },
    ],
    examples: [
      'let { normalizeLog } = import("linearAlgebra");\nnormalizeLog([1, 2, 3])',
      'let { normalizeLog } = import("linearAlgebra");\nnormalizeLog([1, 2, 3, 4])',
      'let { normalizeLog } = import("linearAlgebra");\nnormalizeLog([1, 2, 3, 40, 50])',
    ],
    seeAlso: ['linearAlgebra.normalizeMinmax', 'linearAlgebra.normalizeZscore'],
  },
  'angle': {
    category: 'linearAlgebra',
    description: 'Calculates the **angle** between two vectors in radians.',
    returns: {
      type: 'number',
    },
    args: {
      a: {
        type: 'vector',
      },
      b: {
        type: 'vector',
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
      'let { angle } = import("linearAlgebra");\nangle([1, 0], [0, 1])',
      'let { angle } = import("linearAlgebra");\nangle([1, 0, 1], [0, 1, 0])',
    ],
    seeAlso: ['linearAlgebra.dot', 'linearAlgebra.isCollinear', 'linearAlgebra.isOrthogonal', 'linearAlgebra.rotate2d', 'linearAlgebra.rotate3d', 'linearAlgebra.isParallel', 'linearAlgebra.cosineSimilarity', 'linearAlgebra.toPolar'],
  },
  'projection': {
    category: 'linearAlgebra',
    description: 'Calculates the **projection** of vector `a` onto vector `b`.',
    returns: {
      type: 'vector',
    },
    args: {
      a: {
        type: 'vector',
      },
      b: {
        type: 'vector',
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
      'let { projection } = import("linearAlgebra");\nprojection([1, 2], [3, 4])',
      'let { projection } = import("linearAlgebra");\nprojection([1, 2, 3], [4, 5, 6])',
    ],
    seeAlso: ['linearAlgebra.dot', 'linearAlgebra.reflect', 'linearAlgebra.lerp'],
  },
  'isCollinear': {
    category: 'linearAlgebra',
    description: 'Checks if two vectors are **collinear**.',
    returns: {
      type: 'boolean',
    },
    args: {
      a: {
        type: 'vector',
      },
      b: {
        type: 'vector',
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
      'let { isCollinear } = import("linearAlgebra");\nisCollinear([1, 2], [2, 4])',
      'let { isCollinear } = import("linearAlgebra");\nisCollinear([1, 2], [-2, -4])',
      'let { isCollinear } = import("linearAlgebra");\nisCollinear([1, 2, 3], [2, 4, 6])',
    ],
    seeAlso: ['linearAlgebra.isParallel', 'linearAlgebra.isOrthogonal', 'linearAlgebra.angle'],
  },
  'isParallel': {
    category: 'linearAlgebra',
    description: 'Checks if two vectors are **parallel**.',
    returns: {
      type: 'boolean',
    },
    args: {
      a: {
        type: 'vector',
      },
      b: {
        type: 'vector',
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
      'let { isParallel } = import("linearAlgebra");\nisParallel([1, 2], [2, 4])',
      'let { isParallel } = import("linearAlgebra");\nisParallel([1, 2], [-2, -4])',
      'let { isParallel } = import("linearAlgebra");\nisParallel([1, 2, 3], [2, 4, 6])',
      'let { isParallel } = import("linearAlgebra");\nisParallel([1, 2], [3, 4])',
    ],
    seeAlso: ['linearAlgebra.isCollinear', 'linearAlgebra.isOrthogonal', 'linearAlgebra.angle'],
  },
  'isOrthogonal': {
    category: 'linearAlgebra',
    description: 'Checks if two vectors are **orthogonal**.',
    returns: {
      type: 'boolean',
    },
    args: {
      a: {
        type: 'vector',
      },
      b: {
        type: 'vector',
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
      'let { isOrthogonal } = import("linearAlgebra");\nisOrthogonal([1, 0], [0, 1])',
      'let { isOrthogonal } = import("linearAlgebra");\nisOrthogonal([1, 0, 1], [0, 1, 0])',
      'let { isOrthogonal } = import("linearAlgebra");\nisOrthogonal([1, 2], [2, -1])',
    ],
    seeAlso: ['linearAlgebra.isCollinear', 'linearAlgebra.isParallel', 'linearAlgebra.dot', 'matrix.isOrthogonalMatrix', 'linearAlgebra.angle'],
  },
  'cosineSimilarity': {
    category: 'linearAlgebra',
    description: 'Calculates the **cosine similarity** between two vectors. The result is a value between -1 and 1.',
    returns: {
      type: 'number',
    },
    args: {
      a: {
        type: 'vector',
      },
      b: {
        type: 'vector',
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
      'let { cosineSimilarity } = import("linearAlgebra");\ncosineSimilarity([1, 2], [3, 4])',
      'let { cosineSimilarity } = import("linearAlgebra");\ncosineSimilarity([1, 2, 3], [4, 5, 6])',
      'let { cosineSimilarity } = import("linearAlgebra");\ncosineSimilarity([1, 0], [0, 1])',
    ],
    seeAlso: ['linearAlgebra.dot', 'linearAlgebra.angle', 'linearAlgebra.euclideanDistance'],
  },
  'euclideanDistance': {
    category: 'linearAlgebra',
    description: 'Calculates the **Euclidean distance** between two vectors. The result is a non-negative number.',
    returns: {
      type: 'number',
    },
    args: {
      a: {
        type: 'vector',
      },
      b: {
        type: 'vector',
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
      'let { euclideanDistance } = import("linearAlgebra");\neuclideanDistance([1, 2], [3, 4])',
      'let { euclideanDistance } = import("linearAlgebra");\neuclideanDistance([1, 2, 3], [4, 5, 6])',
      'let { euclideanDistance } = import("linearAlgebra");\neuclideanDistance([1, 0], [0, 1])',
    ],
    seeAlso: ['linearAlgebra.manhattanDistance', 'linearAlgebra.chebyshevDistance', 'linearAlgebra.minkowskiDistance', 'linearAlgebra.euclideanNorm', 'linearAlgebra.cosineSimilarity', 'linearAlgebra.hammingDistance'],
  },
  'euclideanNorm': {
    category: 'linearAlgebra',
    description: 'Calculates the **Euclidean norm** (L2 norm) of a vector. The result is a non-negative number.',
    returns: {
      type: 'number',
    },
    args: {
      v: {
        type: 'vector',
        description: 'Vector to calculate the norm for.',
      },
    },
    variants: [
      {
        argumentNames: [
          'v',
        ],
      },
    ],
    examples: [
      'let { euclideanNorm } = import("linearAlgebra");\neuclideanNorm([1, 2])',
      'let { euclideanNorm } = import("linearAlgebra");\neuclideanNorm([3, 4])',
      'let { euclideanNorm } = import("linearAlgebra");\neuclideanNorm([1, 2, 3])',
    ],
    seeAlso: ['linearAlgebra.manhattanNorm', 'linearAlgebra.chebyshevNorm', 'linearAlgebra.minkowskiNorm', 'linearAlgebra.euclideanDistance', 'linearAlgebra.normalizeL2', 'linearAlgebra.hammingNorm'],
  },
  'manhattanDistance': {
    category: 'linearAlgebra',
    description: 'Calculates the **Manhattan distance** between two vectors. The result is a non-negative number.',
    returns: {
      type: 'number',
    },
    args: {
      a: {
        type: 'vector',
      },
      b: {
        type: 'vector',
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
      'let { manhattanDistance } = import("linearAlgebra");\nmanhattanDistance([1, 2], [3, 4])',
      'let { manhattanDistance } = import("linearAlgebra");\nmanhattanDistance([1, 2, 3], [4, 5, 6])',
      'let { manhattanDistance } = import("linearAlgebra");\nmanhattanDistance([1, 0], [0, 1])',
    ],
    seeAlso: ['linearAlgebra.euclideanDistance', 'linearAlgebra.chebyshevDistance', 'linearAlgebra.minkowskiDistance', 'linearAlgebra.manhattanNorm', 'linearAlgebra.hammingDistance'],
  },
  'manhattanNorm': {
    category: 'linearAlgebra',
    description: 'Calculates the **Manhattan norm** (L1 norm) of a vector. The result is a non-negative number.',
    returns: {
      type: 'number',
    },
    args: {
      v: {
        type: 'vector',
        description: 'Vector to calculate the norm for.',
      },
    },
    variants: [
      {
        argumentNames: [
          'v',
        ],
      },
    ],
    examples: [
      'let { manhattanNorm } = import("linearAlgebra");\nmanhattanNorm([1, 2])',
      'let { manhattanNorm } = import("linearAlgebra");\nmanhattanNorm([3, 4])',
      'let { manhattanNorm } = import("linearAlgebra");\nmanhattanNorm([1, 2, 3])',
    ],
    seeAlso: ['linearAlgebra.euclideanNorm', 'linearAlgebra.chebyshevNorm', 'linearAlgebra.minkowskiNorm', 'linearAlgebra.manhattanDistance', 'linearAlgebra.normalizeL1', 'linearAlgebra.hammingNorm'],
  },
  'hammingDistance': {
    category: 'linearAlgebra',
    description: 'Calculates the **Hamming distance** between two vectors. The result is a non-negative integer.',
    returns: {
      type: 'integer',
    },
    args: {
      a: {
        type: 'vector',
      },
      b: {
        type: 'vector',
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
      'let { hammingDistance } = import("linearAlgebra");\nhammingDistance([1, 2], [3, 4])',
      'let { hammingDistance } = import("linearAlgebra");\nhammingDistance([1, 2, 3], [4, 5, 6])',
      'let { hammingDistance } = import("linearAlgebra");\nhammingDistance([1, 0], [0, 1])',
    ],
    seeAlso: ['linearAlgebra.euclideanDistance', 'linearAlgebra.manhattanDistance', 'linearAlgebra.hammingNorm'],
  },
  'hammingNorm': {
    category: 'linearAlgebra',
    description: 'Calculates the **Hamming norm** of a vector. The result is a non-negative integer.',
    returns: {
      type: 'integer',
    },
    args: {
      v: {
        type: 'vector',
        description: 'Vector to calculate the norm for.',
      },
    },
    variants: [
      {
        argumentNames: [
          'v',
        ],
      },
    ],
    examples: [
      'let { hammingNorm } = import("linearAlgebra");\nhammingNorm([1, 2])',
      'let { hammingNorm } = import("linearAlgebra");\nhammingNorm([3, 4])',
      'let { hammingNorm } = import("linearAlgebra");\nhammingNorm([1, 2, 3])',
    ],
    seeAlso: ['linearAlgebra.euclideanNorm', 'linearAlgebra.manhattanNorm', 'linearAlgebra.hammingDistance'],
  },
  'chebyshevDistance': {
    category: 'linearAlgebra',
    description: 'Calculates the **Chebyshev distance** between two vectors. The result is a non-negative number.',
    returns: {
      type: 'number',
    },
    args: {
      a: {
        type: 'vector',
      },
      b: {
        type: 'vector',
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
      'let { chebyshevDistance } = import("linearAlgebra");\nchebyshevDistance([1, 2], [3, 4])',
      'let { chebyshevDistance } = import("linearAlgebra");\nchebyshevDistance([1, 2, 3], [4, 5, 6])',
      'let { chebyshevDistance } = import("linearAlgebra");\nchebyshevDistance([1, 0], [0, 1])',
    ],
    seeAlso: ['linearAlgebra.euclideanDistance', 'linearAlgebra.manhattanDistance', 'linearAlgebra.minkowskiDistance', 'linearAlgebra.chebyshevNorm'],
  },
  'chebyshevNorm': {
    category: 'linearAlgebra',
    description: 'Calculates the **Chebyshev norm** of a vector. The result is a non-negative number.',
    returns: {
      type: 'number',
    },
    args: {
      v: {
        type: 'vector',
        description: 'Vector to calculate the norm for.',
      },
    },
    variants: [
      {
        argumentNames: [
          'v',
        ],
      },
    ],
    examples: [
      'let { chebyshevNorm } = import("linearAlgebra");\nchebyshevNorm([1, 2])',
      'let { chebyshevNorm } = import("linearAlgebra");\nchebyshevNorm([3, 4])',
      'let { chebyshevNorm } = import("linearAlgebra");\nchebyshevNorm([1, 2, 3])',
    ],
    seeAlso: ['linearAlgebra.euclideanNorm', 'linearAlgebra.manhattanNorm', 'linearAlgebra.minkowskiNorm', 'linearAlgebra.chebyshevDistance'],
  },
  'minkowskiDistance': {
    category: 'linearAlgebra',
    description: 'Calculates the **Minkowski distance** between two vectors. The result is a non-negative number.',
    returns: {
      type: 'number',
    },
    args: {
      a: {
        type: 'vector',
      },
      b: {
        type: 'vector',
      },
      p: {
        type: 'number',
        description: 'Order of the norm (p).',
      },
    },
    variants: [
      {
        argumentNames: [
          'a',
          'b',
          'p',
        ],
      },
    ],
    examples: [
      'let { minkowskiDistance } = import("linearAlgebra");\nminkowskiDistance([1, 2], [3, 4], 2)',
      'let { minkowskiDistance } = import("linearAlgebra");\nminkowskiDistance([1, 2, 3], [4, 5, 6], 3)',
      'let { minkowskiDistance } = import("linearAlgebra");\nminkowskiDistance([1, 0], [0, 1], 1)',
    ],
    seeAlso: ['linearAlgebra.euclideanDistance', 'linearAlgebra.manhattanDistance', 'linearAlgebra.chebyshevDistance', 'linearAlgebra.minkowskiNorm'],
  },
  'minkowskiNorm': {
    category: 'linearAlgebra',
    description: 'Calculates the **Minkowski norm** of a vector. The result is a non-negative number.',
    returns: {
      type: 'number',
    },
    args: {
      a: {
        type: 'vector',
        description: 'Vector to calculate the norm for.',
      },
      b: {
        type: 'number',
        description: 'Order of the norm (p).',
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
      'let { minkowskiNorm } = import("linearAlgebra");\nminkowskiNorm([1, 2], 2)',
      'let { minkowskiNorm } = import("linearAlgebra");\nminkowskiNorm([3, 4], 3)',
      'let { minkowskiNorm } = import("linearAlgebra");\nminkowskiNorm([1, 2, 3], 4)',
    ],
    seeAlso: ['linearAlgebra.euclideanNorm', 'linearAlgebra.manhattanNorm', 'linearAlgebra.chebyshevNorm', 'linearAlgebra.minkowskiDistance'],
  },
  'cov': {
    category: 'linearAlgebra',
    description: 'Calculates the **covariance** between two vectors. The result is a number.',
    returns: {
      type: 'number',
    },
    args: {
      a: {
        type: 'vector',
      },
      b: {
        type: 'vector',
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
      'let { cov } = import("linearAlgebra");\ncov([1, 2], [3, 4])',
      'let { cov } = import("linearAlgebra");\ncov([1, 2, 3], [4, 5, 6])',
      'let { cov } = import("linearAlgebra");\ncov([1, 0], [0, 1])',
    ],
    seeAlso: ['linearAlgebra.corr', 'linearAlgebra.pearsonCorr', 'vector.variance'],
  },
  'corr': {
    category: 'linearAlgebra',
    description: 'Calculates the **correlation** between two vectors. The result is a number between -1 and 1.',
    returns: {
      type: 'number',
    },
    args: {
      a: {
        type: 'vector',
      },
      b: {
        type: 'vector',
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
      'let { corr } = import("linearAlgebra");\ncorr([1, 2], [3, 4])',
      'let { corr } = import("linearAlgebra");\ncorr([1, 2, 3], [4, 5, 6])',
      'let { corr } = import("linearAlgebra");\ncorr([1, 0], [0, 1])',
    ],
    seeAlso: ['linearAlgebra.cov', 'linearAlgebra.pearsonCorr', 'linearAlgebra.spearmanCorr', 'linearAlgebra.kendallTau', 'linearAlgebra.autocorrelation', 'linearAlgebra.crossCorrelation'],
  },
  'spearmanCorr': {
    category: 'linearAlgebra',
    description: 'Calculates the **Spearman rank correlation** between two vectors. The result is a number between -1 and 1.',
    returns: {
      type: 'number',
    },
    args: {
      a: {
        type: 'vector',
      },
      b: {
        type: 'vector',
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
      'let { spearmanCorr } = import("linearAlgebra");\nspearmanCorr([1, 2], [3, 4])',
      'let { spearmanCorr } = import("linearAlgebra");\nspearmanCorr([1, 2, 3], [4, 5, 6])',
      'let { spearmanCorr } = import("linearAlgebra");\nspearmanCorr([1, 0], [0, 1])',
    ],
    seeAlso: ['linearAlgebra.pearsonCorr', 'linearAlgebra.kendallTau', 'linearAlgebra.corr'],
  },
  'pearsonCorr': {
    category: 'linearAlgebra',
    description: 'Calculates the **Pearson correlation** between two vectors. The result is a number between -1 and 1.',
    returns: {
      type: 'number',
    },
    args: {
      a: {
        type: 'vector',
      },
      b: {
        type: 'vector',
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
      'let { pearsonCorr } = import("linearAlgebra");\npearsonCorr([1, 2], [3, 4])',
      'let { pearsonCorr } = import("linearAlgebra");\npearsonCorr([1, 2, 3], [4, 5, 6])',
      'let { pearsonCorr } = import("linearAlgebra");\npearsonCorr([1, 0], [0, 1])',
    ],
    seeAlso: ['linearAlgebra.spearmanCorr', 'linearAlgebra.kendallTau', 'linearAlgebra.corr', 'linearAlgebra.cov'],
  },
  'kendallTau': {
    category: 'linearAlgebra',
    description: 'Calculates the **Kendall Tau** rank correlation coefficient between two vectors. The result is a number between -1 and 1.',
    returns: {
      type: 'number',
    },
    args: {
      a: {
        type: 'vector',
      },
      b: {
        type: 'vector',
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
      'let { kendallTau } = import("linearAlgebra");\nkendallTau([1, 2], [3, 4])',
      'let { kendallTau } = import("linearAlgebra");\nkendallTau([1, 2, 3], [4, 5, 6])',
      'let { kendallTau } = import("linearAlgebra");\nkendallTau([1, 0], [0, 1])',
    ],
    seeAlso: ['linearAlgebra.spearmanCorr', 'linearAlgebra.pearsonCorr', 'linearAlgebra.corr'],
  },
  'autocorrelation': {
    category: 'linearAlgebra',
    description: 'Calculates the **autocorrelation** of a vector. The result is a vector of autocorrelation coefficients.',
    returns: {
      type: 'number',
    },
    args: {
      a: {
        type: 'vector',
        description: 'Vector to calculate the autocorrelation for.',
      },
      b: {
        type: 'integer',
        description: 'Lag value for the autocorrelation.',
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
      'let { autocorrelation } = import("linearAlgebra");\nautocorrelation([1, 2, 3], -2)',
      'let { autocorrelation } = import("linearAlgebra");\nautocorrelation([1, 2, 3], -1)',
      'let { autocorrelation } = import("linearAlgebra");\nautocorrelation([1, 2, 3], 0)',
      'let { autocorrelation } = import("linearAlgebra");\nautocorrelation([1, 2, 3], 1)',
      'let { autocorrelation } = import("linearAlgebra");\nautocorrelation([1, 2, 3], 2)',
    ],
    seeAlso: ['linearAlgebra.crossCorrelation', 'linearAlgebra.corr'],
  },
  'crossCorrelation': {
    category: 'linearAlgebra',
    description: 'Calculates the **crossCorrelation** between two vectors. The result is a vector of crossCorrelation coefficients.',
    returns: {
      type: 'number',
    },
    args: {
      a: {
        type: 'vector',
      },
      b: {
        type: 'vector',
      },
      lag: {
        type: 'integer',
        description: 'Lag value for the crossCorrelation.',
      },
    },
    variants: [
      {
        argumentNames: [
          'a',
          'b',
          'lag',
        ],
      },
    ],
    examples: [
      'let { crossCorrelation } = import("linearAlgebra");\ncrossCorrelation([1, 2, 3], [4, 5, 6], -2)',
      'let { crossCorrelation } = import("linearAlgebra");\ncrossCorrelation([1, 2, 3], [4, 5, 6], -1)',
      'let { crossCorrelation } = import("linearAlgebra");\ncrossCorrelation([1, 2, 3], [4, 5, 6], 0)',
      'let { crossCorrelation } = import("linearAlgebra");\ncrossCorrelation([1, 2, 3], [4, 5, 6], 1)',
      'let { crossCorrelation } = import("linearAlgebra");\ncrossCorrelation([1, 2, 3], [4, 5, 6], 2)',
    ],
    seeAlso: ['linearAlgebra.autocorrelation', 'linearAlgebra.corr'],
  },
  'rref': {
    category: 'linearAlgebra',
    description: 'Calculates the **Reduced Row Echelon Form** (RREF) of a matrix.',
    returns: {
      type: 'matrix',
    },
    args: {
      m: {
        type: 'matrix',
        description: 'Matrix to calculate the RREF for.',
      },
    },
    variants: [
      {
        argumentNames: [
          'm',
        ],
      },
    ],
    examples: [
      'let { rref } = import("linearAlgebra");\nrref([[1, 2], [3, 4]])',
      'let { rref } = import("linearAlgebra");\nrref([[1, 2, 3], [4, 5, 6], [7, 8, 9]])',
      'let { rref } = import("linearAlgebra");\nrref([[1, 2, 3], [7, 8, 9], [4, 5, 7]])',
    ],
    seeAlso: ['linearAlgebra.solve', 'matrix.rank'],
  },
  'solve': {
    category: 'linearAlgebra',
    description: 'Solves a system of linear equations represented by a matrix and a vector.',
    returns: {
      type: 'vector',
    },
    args: {
      a: {
        type: 'matrix',
      },
      b: {
        type: 'vector',
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
      'let { solve } = import("linearAlgebra");\nsolve([\n  [2, 1, -1, 1], \n  [4, 5, -3, 2], \n  [6, -2, 5, -3], \n  [8, 3, 2, 4]\n], [5, 10, 2, 17])',
      `let { solve } = import("linearAlgebra");
solve([[2, 0, 0], [3, 1, 0], [4, 5, 6]], [4, 5, 38])`,
      `let { solve } = import("linearAlgebra");
solve([[2, 3], [1, -1]], [8, 2])`,
    ],
    seeAlso: ['linearAlgebra.rref', 'matrix.inv'],
  },
  'toPolar': {
    category: 'linearAlgebra',
    description: 'Converts a 2D vector to polar coordinates.',
    returns: {
      type: 'vector',
    },
    args: {
      vector: {
        type: 'vector',
        description: '2D Vector to convert.',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
        ],
      },
    ],
    examples: [
      'let { toPolar } = import("linearAlgebra");\ntoPolar([1, 2])',
      'let { toPolar } = import("linearAlgebra");\ntoPolar([3, 4])',
    ],
    seeAlso: ['linearAlgebra.fromPolar', 'linearAlgebra.angle'],
  },
  'fromPolar': {
    category: 'linearAlgebra',
    description: 'Converts polar coordinates to a 2D vector.',
    returns: {
      type: 'vector',
    },
    args: {
      polar: {
        type: 'vector',
        description: 'Polar coordinates to convert.',
      },
    },
    variants: [
      {
        argumentNames: [
          'polar',
        ],
      },
    ],
    examples: [
      'let { fromPolar } = import("linearAlgebra");\nfromPolar([1, PI / 4])',
      'let { fromPolar } = import("linearAlgebra");\nfromPolar([1, 0])',
      'let { fromPolar } = import("linearAlgebra");\nfromPolar([1, -PI / 2])',
    ],
    seeAlso: ['linearAlgebra.toPolar'],
  },
}
