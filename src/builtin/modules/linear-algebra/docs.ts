import type { FunctionDocs } from '../../interface'

export const moduleDocs: Record<string, FunctionDocs> = {
  'reflect': {
    category: 'linear-algebra',
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
      'let { reflect } = import(linear-algebra);\nreflect([1, 2], [0, 1])',
      'let { reflect } = import(linear-algebra);\nreflect([1, 2, 3], [0, 0, 1])',
    ],
    seeAlso: ['linear-algebra.refract', 'linear-algebra.projection'],
  },
  'refract': {
    category: 'linear-algebra',
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
      'let { refract } = import(linear-algebra);\nrefract([1, 2], [0, 1], 1.5)',
      'let { refract } = import(linear-algebra);\nrefract([1, 2, 3], [0, 0, 1], 1.5)',
    ],
    seeAlso: ['linear-algebra.reflect'],
  },
  'lerp': {
    category: 'linear-algebra',
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
      'let { lerp } = import(linear-algebra);\nlerp([1, 2], [3, 4], 0.5)',
      'let { lerp } = import(linear-algebra);\nlerp([1, 2], [3, 4], 2)',
      'let { lerp } = import(linear-algebra);\nlerp([1, 2], [3, 4], -1)',
      'let { lerp } = import(linear-algebra);\nlerp([1, 2, 3], [4, 5, 6], 0.25)',
    ],
    seeAlso: ['linear-algebra.projection'],
  },
  'rotate2d': {
    category: 'linear-algebra',
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
      'let { rotate2d } = import(linear-algebra);\nrotate2d([1, 0], PI / 2)',
      'let { rotate2d } = import(linear-algebra);\nrotate2d([0, 1], PI)',
    ],
    seeAlso: ['linear-algebra.rotate3d', 'linear-algebra.angle'],
  },
  'rotate3d': {
    category: 'linear-algebra',
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
      'let { rotate3d } = import(linear-algebra);\nrotate3d([1, 0, 0], [0, 1, 0], PI / 2)',
      'let { rotate3d } = import(linear-algebra);\nrotate3d([0, 1, 0], [1, 0, 0], PI)',
    ],
    seeAlso: ['linear-algebra.rotate2d', 'linear-algebra.angle'],
  },
  'dot': {
    category: 'linear-algebra',
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
      'let { dot } = import(linear-algebra);\ndot([1, 2], [3, 4])',
      'let { dot } = import(linear-algebra);\ndot([1, 2, 3], [4, 5, 6])',
    ],
    seeAlso: ['linear-algebra.cross', 'linear-algebra.cosineSimilarity', 'linear-algebra.angle', 'linear-algebra.projection', 'linear-algebra.isOrthogonal'],
  },
  'cross': {
    category: 'linear-algebra',
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
      'let { cross } = import(linear-algebra);\ncross([1, 2, 3], [4, 5, 6])',
      'let { cross } = import(linear-algebra);\ncross([1, 0, 0], [0, 1, 0])',
      'let { cross } = import(linear-algebra);\ncross([0, 0, 1], [1, 0, 0])',
      'let { cross } = import(linear-algebra);\ncross([1, 2, 3], [0, 0, 0])',
      'let { cross } = import(linear-algebra);\ncross([0, 0, 0], [1, 2, 3])',
    ],
    seeAlso: ['linear-algebra.dot'],
  },
  'normalizeMinmax': {
    category: 'linear-algebra',
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
      'let { normalizeMinmax } = import(linear-algebra);\nnormalizeMinmax([1, 2, 3])',
      'let { normalizeMinmax } = import(linear-algebra);\nnormalizeMinmax([1, 2, -3])',
      'let { normalizeMinmax } = import(linear-algebra);\nnormalizeMinmax([1, 2, 3, 4])',
      'let { normalizeMinmax } = import(linear-algebra);\nnormalizeMinmax([1, 2, -3, 4])',
      'let { normalizeMinmax } = import(linear-algebra);\nnormalizeMinmax([1, 2, 3, 40, 50])',
    ],
    seeAlso: ['linear-algebra.normalizeZscore', 'linear-algebra.normalizeRobust', 'linear-algebra.normalizeL1', 'linear-algebra.normalizeL2', 'linear-algebra.normalizeLog'],
  },
  'normalizeZscore': {
    category: 'linear-algebra',
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
      'let { normalizeZscore } = import(linear-algebra);\nnormalizeZscore([1, 2, 3])',
      'let { normalizeZscore } = import(linear-algebra);\nnormalizeZscore([1, 2, -3])',
      'let { normalizeZscore } = import(linear-algebra);\nnormalizeZscore([1, 2, 3, 4])',
      'let { normalizeZscore } = import(linear-algebra);\nnormalizeZscore([1, 2, -3, 4])',
      'let { normalizeZscore } = import(linear-algebra);\nnormalizeZscore([1, 2, 3, 40, 50])',
    ],
    seeAlso: ['linear-algebra.normalizeMinmax', 'linear-algebra.normalizeRobust', 'linear-algebra.normalizeL1', 'linear-algebra.normalizeL2', 'linear-algebra.normalizeLog'],
  },
  'normalizeRobust': {
    category: 'linear-algebra',
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
      'let { normalizeRobust } = import(linear-algebra);\nnormalizeRobust([1, 2, 3])',
      'let { normalizeRobust } = import(linear-algebra);\nnormalizeRobust([1, 2, -3])',
      'let { normalizeRobust } = import(linear-algebra);\nnormalizeRobust([1, 2, 3, 4])',
      'let { normalizeRobust } = import(linear-algebra);\nnormalizeRobust([1, 2, -3, 4])',
      'let { normalizeRobust } = import(linear-algebra);\nnormalizeRobust([1, 2, 3, 40, 50])',
    ],
    seeAlso: ['linear-algebra.normalizeMinmax', 'linear-algebra.normalizeZscore'],
  },
  'normalizeL1': {
    category: 'linear-algebra',
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
      'let { normalizeL1 } = import(linear-algebra);\nnormalizeL1([1, 2, 3])',
      'let { normalizeL1 } = import(linear-algebra);\nnormalizeL1([1, 2, -3])',
      'let { normalizeL1 } = import(linear-algebra);\nnormalizeL1([1, 2, 3, 4])',
      'let { normalizeL1 } = import(linear-algebra);\nnormalizeL1([1, 2, -3, 4])',
      'let { normalizeL1 } = import(linear-algebra);\nnormalizeL1([1, 2, 3, 40, 50])',
    ],
    seeAlso: ['linear-algebra.normalizeL2', 'linear-algebra.normalizeMinmax', 'linear-algebra.manhattanNorm', 'linear-algebra.normalizeZscore'],
  },
  'normalizeL2': {
    category: 'linear-algebra',
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
      'let { normalizeL2 } = import(linear-algebra);\nnormalizeL2([1, 2, 3])',
      'let { normalizeL2 } = import(linear-algebra);\nnormalizeL2([1, 2, 3])',
      'let { normalizeL2 } = import(linear-algebra);\nnormalizeL2([1, 2, -3])',
      'let { normalizeL2 } = import(linear-algebra);\nnormalizeL2([1, 2, 3, 4])',
      'let { normalizeL2 } = import(linear-algebra);\nnormalizeL2([1, 2, -3, 4])',
      'let { normalizeL2 } = import(linear-algebra);\nnormalizeL2([1, 2, 3, 40, 50])',
    ],
    seeAlso: ['linear-algebra.normalizeL1', 'linear-algebra.normalizeMinmax', 'linear-algebra.euclideanNorm', 'linear-algebra.normalizeZscore'],
  },
  'normalizeLog': {
    category: 'linear-algebra',
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
      'let { normalizeLog } = import(linear-algebra);\nnormalizeLog([1, 2, 3])',
      'let { normalizeLog } = import(linear-algebra);\nnormalizeLog([1, 2, 3, 4])',
      'let { normalizeLog } = import(linear-algebra);\nnormalizeLog([1, 2, 3, 40, 50])',
    ],
    seeAlso: ['linear-algebra.normalizeMinmax', 'linear-algebra.normalizeZscore'],
  },
  'angle': {
    category: 'linear-algebra',
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
      'let { angle } = import(linear-algebra);\nangle([1, 0], [0, 1])',
      'let { angle } = import(linear-algebra);\nangle([1, 0, 1], [0, 1, 0])',
    ],
    seeAlso: ['linear-algebra.dot', 'linear-algebra.isCollinear', 'linear-algebra.isOrthogonal', 'linear-algebra.rotate2d', 'linear-algebra.rotate3d', 'linear-algebra.isParallel', 'linear-algebra.cosineSimilarity', 'linear-algebra.toPolar'],
  },
  'projection': {
    category: 'linear-algebra',
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
      'let { projection } = import(linear-algebra);\nprojection([1, 2], [3, 4])',
      'let { projection } = import(linear-algebra);\nprojection([1, 2, 3], [4, 5, 6])',
    ],
    seeAlso: ['linear-algebra.dot', 'linear-algebra.reflect', 'linear-algebra.lerp'],
  },
  'isCollinear': {
    category: 'linear-algebra',
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
      'let { isCollinear } = import(linear-algebra);\nisCollinear([1, 2], [2, 4])',
      'let { isCollinear } = import(linear-algebra);\nisCollinear([1, 2], [-2, -4])',
      'let { isCollinear } = import(linear-algebra);\nisCollinear([1, 2, 3], [2, 4, 6])',
    ],
    seeAlso: ['linear-algebra.isParallel', 'linear-algebra.isOrthogonal', 'linear-algebra.angle'],
  },
  'isParallel': {
    category: 'linear-algebra',
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
      'let { isParallel } = import(linear-algebra);\nisParallel([1, 2], [2, 4])',
      'let { isParallel } = import(linear-algebra);\nisParallel([1, 2], [-2, -4])',
      'let { isParallel } = import(linear-algebra);\nisParallel([1, 2, 3], [2, 4, 6])',
      'let { isParallel } = import(linear-algebra);\nisParallel([1, 2], [3, 4])',
    ],
    seeAlso: ['linear-algebra.isCollinear', 'linear-algebra.isOrthogonal', 'linear-algebra.angle'],
  },
  'isOrthogonal': {
    category: 'linear-algebra',
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
      'let { isOrthogonal } = import(linear-algebra);\nisOrthogonal([1, 0], [0, 1])',
      'let { isOrthogonal } = import(linear-algebra);\nisOrthogonal([1, 0, 1], [0, 1, 0])',
      'let { isOrthogonal } = import(linear-algebra);\nisOrthogonal([1, 2], [2, -1])',
    ],
    seeAlso: ['linear-algebra.isCollinear', 'linear-algebra.isParallel', 'linear-algebra.dot', 'matrix.isOrthogonalMatrix', 'linear-algebra.angle'],
  },
  'cosineSimilarity': {
    category: 'linear-algebra',
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
      'let { cosineSimilarity } = import(linear-algebra);\ncosineSimilarity([1, 2], [3, 4])',
      'let { cosineSimilarity } = import(linear-algebra);\ncosineSimilarity([1, 2, 3], [4, 5, 6])',
      'let { cosineSimilarity } = import(linear-algebra);\ncosineSimilarity([1, 0], [0, 1])',
    ],
    seeAlso: ['linear-algebra.dot', 'linear-algebra.angle', 'linear-algebra.euclideanDistance'],
  },
  'euclideanDistance': {
    category: 'linear-algebra',
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
      'let { euclideanDistance } = import(linear-algebra);\neuclideanDistance([1, 2], [3, 4])',
      'let { euclideanDistance } = import(linear-algebra);\neuclideanDistance([1, 2, 3], [4, 5, 6])',
      'let { euclideanDistance } = import(linear-algebra);\neuclideanDistance([1, 0], [0, 1])',
    ],
    seeAlso: ['linear-algebra.manhattanDistance', 'linear-algebra.chebyshevDistance', 'linear-algebra.minkowskiDistance', 'linear-algebra.euclideanNorm', 'linear-algebra.cosineSimilarity', 'linear-algebra.hammingDistance'],
  },
  'euclideanNorm': {
    category: 'linear-algebra',
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
      'let { euclideanNorm } = import(linear-algebra);\neuclideanNorm([1, 2])',
      'let { euclideanNorm } = import(linear-algebra);\neuclideanNorm([3, 4])',
      'let { euclideanNorm } = import(linear-algebra);\neuclideanNorm([1, 2, 3])',
    ],
    seeAlso: ['linear-algebra.manhattanNorm', 'linear-algebra.chebyshevNorm', 'linear-algebra.minkowskiNorm', 'linear-algebra.euclideanDistance', 'linear-algebra.normalizeL2', 'linear-algebra.hammingNorm'],
  },
  'manhattanDistance': {
    category: 'linear-algebra',
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
      'let { manhattanDistance } = import(linear-algebra);\nmanhattanDistance([1, 2], [3, 4])',
      'let { manhattanDistance } = import(linear-algebra);\nmanhattanDistance([1, 2, 3], [4, 5, 6])',
      'let { manhattanDistance } = import(linear-algebra);\nmanhattanDistance([1, 0], [0, 1])',
    ],
    seeAlso: ['linear-algebra.euclideanDistance', 'linear-algebra.chebyshevDistance', 'linear-algebra.minkowskiDistance', 'linear-algebra.manhattanNorm', 'linear-algebra.hammingDistance'],
  },
  'manhattanNorm': {
    category: 'linear-algebra',
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
      'let { manhattanNorm } = import(linear-algebra);\nmanhattanNorm([1, 2])',
      'let { manhattanNorm } = import(linear-algebra);\nmanhattanNorm([3, 4])',
      'let { manhattanNorm } = import(linear-algebra);\nmanhattanNorm([1, 2, 3])',
    ],
    seeAlso: ['linear-algebra.euclideanNorm', 'linear-algebra.chebyshevNorm', 'linear-algebra.minkowskiNorm', 'linear-algebra.manhattanDistance', 'linear-algebra.normalizeL1', 'linear-algebra.hammingNorm'],
  },
  'hammingDistance': {
    category: 'linear-algebra',
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
      'let { hammingDistance } = import(linear-algebra);\nhammingDistance([1, 2], [3, 4])',
      'let { hammingDistance } = import(linear-algebra);\nhammingDistance([1, 2, 3], [4, 5, 6])',
      'let { hammingDistance } = import(linear-algebra);\nhammingDistance([1, 0], [0, 1])',
    ],
    seeAlso: ['linear-algebra.euclideanDistance', 'linear-algebra.manhattanDistance', 'linear-algebra.hammingNorm'],
  },
  'hammingNorm': {
    category: 'linear-algebra',
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
      'let { hammingNorm } = import(linear-algebra);\nhammingNorm([1, 2])',
      'let { hammingNorm } = import(linear-algebra);\nhammingNorm([3, 4])',
      'let { hammingNorm } = import(linear-algebra);\nhammingNorm([1, 2, 3])',
    ],
    seeAlso: ['linear-algebra.euclideanNorm', 'linear-algebra.manhattanNorm', 'linear-algebra.hammingDistance'],
  },
  'chebyshevDistance': {
    category: 'linear-algebra',
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
      'let { chebyshevDistance } = import(linear-algebra);\nchebyshevDistance([1, 2], [3, 4])',
      'let { chebyshevDistance } = import(linear-algebra);\nchebyshevDistance([1, 2, 3], [4, 5, 6])',
      'let { chebyshevDistance } = import(linear-algebra);\nchebyshevDistance([1, 0], [0, 1])',
    ],
    seeAlso: ['linear-algebra.euclideanDistance', 'linear-algebra.manhattanDistance', 'linear-algebra.minkowskiDistance', 'linear-algebra.chebyshevNorm'],
  },
  'chebyshevNorm': {
    category: 'linear-algebra',
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
      'let { chebyshevNorm } = import(linear-algebra);\nchebyshevNorm([1, 2])',
      'let { chebyshevNorm } = import(linear-algebra);\nchebyshevNorm([3, 4])',
      'let { chebyshevNorm } = import(linear-algebra);\nchebyshevNorm([1, 2, 3])',
    ],
    seeAlso: ['linear-algebra.euclideanNorm', 'linear-algebra.manhattanNorm', 'linear-algebra.minkowskiNorm', 'linear-algebra.chebyshevDistance'],
  },
  'minkowskiDistance': {
    category: 'linear-algebra',
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
      'let { minkowskiDistance } = import(linear-algebra);\nminkowskiDistance([1, 2], [3, 4], 2)',
      'let { minkowskiDistance } = import(linear-algebra);\nminkowskiDistance([1, 2, 3], [4, 5, 6], 3)',
      'let { minkowskiDistance } = import(linear-algebra);\nminkowskiDistance([1, 0], [0, 1], 1)',
    ],
    seeAlso: ['linear-algebra.euclideanDistance', 'linear-algebra.manhattanDistance', 'linear-algebra.chebyshevDistance', 'linear-algebra.minkowskiNorm'],
  },
  'minkowskiNorm': {
    category: 'linear-algebra',
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
      'let { minkowskiNorm } = import(linear-algebra);\nminkowskiNorm([1, 2], 2)',
      'let { minkowskiNorm } = import(linear-algebra);\nminkowskiNorm([3, 4], 3)',
      'let { minkowskiNorm } = import(linear-algebra);\nminkowskiNorm([1, 2, 3], 4)',
    ],
    seeAlso: ['linear-algebra.euclideanNorm', 'linear-algebra.manhattanNorm', 'linear-algebra.chebyshevNorm', 'linear-algebra.minkowskiDistance'],
  },
  'cov': {
    category: 'linear-algebra',
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
      'let { cov } = import(linear-algebra);\ncov([1, 2], [3, 4])',
      'let { cov } = import(linear-algebra);\ncov([1, 2, 3], [4, 5, 6])',
      'let { cov } = import(linear-algebra);\ncov([1, 0], [0, 1])',
    ],
    seeAlso: ['linear-algebra.corr', 'linear-algebra.pearsonCorr', 'vector.variance'],
  },
  'corr': {
    category: 'linear-algebra',
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
      'let { corr } = import(linear-algebra);\ncorr([1, 2], [3, 4])',
      'let { corr } = import(linear-algebra);\ncorr([1, 2, 3], [4, 5, 6])',
      'let { corr } = import(linear-algebra);\ncorr([1, 0], [0, 1])',
    ],
    seeAlso: ['linear-algebra.cov', 'linear-algebra.pearsonCorr', 'linear-algebra.spearmanCorr', 'linear-algebra.kendallTau', 'linear-algebra.autocorrelation', 'linear-algebra.crossCorrelation'],
  },
  'spearmanCorr': {
    category: 'linear-algebra',
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
      'let { spearmanCorr } = import(linear-algebra);\nspearmanCorr([1, 2], [3, 4])',
      'let { spearmanCorr } = import(linear-algebra);\nspearmanCorr([1, 2, 3], [4, 5, 6])',
      'let { spearmanCorr } = import(linear-algebra);\nspearmanCorr([1, 0], [0, 1])',
    ],
    seeAlso: ['linear-algebra.pearsonCorr', 'linear-algebra.kendallTau', 'linear-algebra.corr'],
  },
  'pearsonCorr': {
    category: 'linear-algebra',
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
      'let { pearsonCorr } = import(linear-algebra);\npearsonCorr([1, 2], [3, 4])',
      'let { pearsonCorr } = import(linear-algebra);\npearsonCorr([1, 2, 3], [4, 5, 6])',
      'let { pearsonCorr } = import(linear-algebra);\npearsonCorr([1, 0], [0, 1])',
    ],
    seeAlso: ['linear-algebra.spearmanCorr', 'linear-algebra.kendallTau', 'linear-algebra.corr', 'linear-algebra.cov'],
  },
  'kendallTau': {
    category: 'linear-algebra',
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
      'let { kendallTau } = import(linear-algebra);\nkendallTau([1, 2], [3, 4])',
      'let { kendallTau } = import(linear-algebra);\nkendallTau([1, 2, 3], [4, 5, 6])',
      'let { kendallTau } = import(linear-algebra);\nkendallTau([1, 0], [0, 1])',
    ],
    seeAlso: ['linear-algebra.spearmanCorr', 'linear-algebra.pearsonCorr', 'linear-algebra.corr'],
  },
  'autocorrelation': {
    category: 'linear-algebra',
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
      'let { autocorrelation } = import(linear-algebra);\nautocorrelation([1, 2, 3], -2)',
      'let { autocorrelation } = import(linear-algebra);\nautocorrelation([1, 2, 3], -1)',
      'let { autocorrelation } = import(linear-algebra);\nautocorrelation([1, 2, 3], 0)',
      'let { autocorrelation } = import(linear-algebra);\nautocorrelation([1, 2, 3], 1)',
      'let { autocorrelation } = import(linear-algebra);\nautocorrelation([1, 2, 3], 2)',
    ],
    seeAlso: ['linear-algebra.crossCorrelation', 'linear-algebra.corr'],
  },
  'crossCorrelation': {
    category: 'linear-algebra',
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
      'let { crossCorrelation } = import(linear-algebra);\ncrossCorrelation([1, 2, 3], [4, 5, 6], -2)',
      'let { crossCorrelation } = import(linear-algebra);\ncrossCorrelation([1, 2, 3], [4, 5, 6], -1)',
      'let { crossCorrelation } = import(linear-algebra);\ncrossCorrelation([1, 2, 3], [4, 5, 6], 0)',
      'let { crossCorrelation } = import(linear-algebra);\ncrossCorrelation([1, 2, 3], [4, 5, 6], 1)',
      'let { crossCorrelation } = import(linear-algebra);\ncrossCorrelation([1, 2, 3], [4, 5, 6], 2)',
    ],
    seeAlso: ['linear-algebra.autocorrelation', 'linear-algebra.corr'],
  },
  'rref': {
    category: 'linear-algebra',
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
      'let { rref } = import(linear-algebra);\nrref([[1, 2], [3, 4]])',
      'let { rref } = import(linear-algebra);\nrref([[1, 2, 3], [4, 5, 6], [7, 8, 9]])',
      'let { rref } = import(linear-algebra);\nrref([[1, 2, 3], [7, 8, 9], [4, 5, 7]])',
    ],
    seeAlso: ['linear-algebra.solve', 'matrix.rank'],
  },
  'solve': {
    category: 'linear-algebra',
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
      'let { solve } = import(linear-algebra);\nsolve([\n  [2, 1, -1, 1], \n  [4, 5, -3, 2], \n  [6, -2, 5, -3], \n  [8, 3, 2, 4]\n], [5, 10, 2, 17])',
      `let { solve } = import(linear-algebra);
solve([[2, 0, 0], [3, 1, 0], [4, 5, 6]], [4, 5, 38])`,
      `let { solve } = import(linear-algebra);
solve([[2, 3], [1, -1]], [8, 2])`,
    ],
    seeAlso: ['linear-algebra.rref', 'matrix.inv'],
  },
  'toPolar': {
    category: 'linear-algebra',
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
      'let { toPolar } = import(linear-algebra);\ntoPolar([1, 2])',
      'let { toPolar } = import(linear-algebra);\ntoPolar([3, 4])',
    ],
    seeAlso: ['linear-algebra.fromPolar', 'linear-algebra.angle'],
  },
  'fromPolar': {
    category: 'linear-algebra',
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
      'let { fromPolar } = import(linear-algebra);\nfromPolar([1, PI / 4])',
      'let { fromPolar } = import(linear-algebra);\nfromPolar([1, 0])',
      'let { fromPolar } = import(linear-algebra);\nfromPolar([1, -PI / 2])',
    ],
    seeAlso: ['linear-algebra.toPolar'],
  },
}
