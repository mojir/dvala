import type { FunctionDocs } from '../../interface'

export const moduleDocs: Record<string, FunctionDocs> = {
  'movingFn': {
    category: 'vector',
    returns: { type: 'array' },
    args: {
      arr: { type: 'array' },
      windowSize: { type: 'number', description: 'The size of the moving window.' },
      fn: { type: 'function' },
    },
    variants: [{ argumentNames: ['arr', 'windowSize', 'fn'] }],
    description: 'Returns the result of applying `fn` to each moving window of size `windowSize` in `arr`.',
    seeAlso: ['vector.runningFn', 'vector.movingMean'],
    examples: [
      'let { sum, movingFn } = import(vector);\nmovingFn([1, 2, 3], 2, sum)',
      'let { sum, movingFn } = import(vector);\nmovingFn([1, 2, 3], 1, sum)',
      'let { sum, movingFn } = import(vector);\nmovingFn([1, 2, 3], 3, sum)',
    ],
  },
  'runningFn': {
    category: 'vector',
    returns: { type: 'array' },
    args: {
      a: { type: 'array' },
      b: { type: 'function' },
    },
    variants: [{ argumentNames: ['a', 'b'] }],
    description: 'Returns the result of applying `b` to each element of `a`.',
    seeAlso: ['vector.movingFn', 'vector.runningMean'],
    examples: [
      'let { sum, runningFn } = import(vector);\nrunningFn([1, 2, 3], sum)',
      'let { runningFn } = import(vector);\nrunningFn([1, 2, 3], max)',
      'let { runningFn } = import(vector);\nrunningFn([1, 2, 3], min)',
    ],
  },
  'sum': {
    category: 'vector',
    returns: { type: 'number' },
    args: {
      vector: { type: 'vector', description: 'The vector to sum.' },
    },
    variants: [{ argumentNames: ['vector'] }],
    description: 'Returns the **sum** of all elements in the `vector`. Returns `0` for an empty vector.',
    seeAlso: ['vector.prod', 'vector.mean', 'vector.median', 'vector.movingSum', 'vector.centeredMovingSum', 'vector.runningSum', 'vector.cumsum'],
    examples: [
      'let { sum } = import(vector);\nsum([1, 2, 3, 4, 5])',
      'let { sum } = import(vector);\nsum([1, -2, 3])',
      'let { sum } = import(vector);\nsum([])',
    ],
  },
  'prod': {
    category: 'vector',
    returns: { type: 'number' },
    args: {
      vector: { type: 'vector', description: 'The vector to multiply.' },
    },
    variants: [{ argumentNames: ['vector'] }],
    description: 'Returns the **product** of all elements in the `vector`. Returns `1` for an empty vector.',
    seeAlso: ['vector.sum', 'vector.mean', 'vector.median', 'vector.movingProd', 'vector.centeredMovingProd', 'vector.runningProd', 'vector.cumprod'],
    examples: [
      'let { prod } = import(vector);\nprod([1, 2, 3, 4, 5])',
      'let { prod } = import(vector);\nprod([1, -2, 3])',
      'let { prod } = import(vector);\nprod([])',
    ],
  },
  'mean': {
    category: 'vector',
    returns: { type: 'number' },
    args: {
      vector: { type: 'vector', description: 'The vector to calculate the mean of.' },
    },
    variants: [{ argumentNames: ['vector'] }],
    description: 'Returns the arithmetic **mean** of all elements in the `vector`. Throws for an empty vector.',
    seeAlso: ['vector.median', 'vector.sum', 'vector.prod', 'vector.movingMean', 'vector.centeredMovingMean', 'vector.runningMean', 'vector.geometricMean', 'vector.harmonicMean', 'vector.rms', 'vector.mode'],
    examples: [
      'let { mean } = import(vector);\nmean([1, 2, 3, 4, 5])',
      'let { mean } = import(vector);\nmean([1, -2, 3])',
    ],
  },
  'median': {
    category: 'vector',
    returns: { type: 'number' },
    args: {
      vector: { type: 'vector', description: 'The vector to calculate the median of.' },
    },
    variants: [{ argumentNames: ['vector'] }],
    description: 'Returns the **median** of all elements in the `vector`. For even-length vectors, returns the average of the two middle values. Throws for an empty vector.',
    seeAlso: ['vector.mean', 'vector.sum', 'vector.prod', 'vector.movingMedian', 'vector.centeredMovingMedian', 'vector.runningMedian', 'vector.mode', 'vector.quartiles', 'vector.percentile', 'vector.iqr', 'vector.medad'],
    examples: [
      'let { median } = import(vector);\nmedian([1, 2, 3, 4, 5])',
      'let { median } = import(vector);\nmedian([1, 2, 3, 4])',
      'let { median } = import(vector);\nmedian([3, 1, 4, 1, 5])',
    ],
  },
  'movingMean': {
    category: 'vector',
    description: 'Returns the **moving mean** of the `vector` with a given window size.',
    returns: {
      type: 'vector',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **moving mean** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the moving window.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
    ],
    examples: [
      'let { movingMean } = import(vector);\nmovingMean([1, 2, 3, 4, 5], 3)',
      'let { movingMean } = import(vector);\nmovingMean([1, 2, 3, 4, 5], 5)',
    ],
    seeAlso: ['vector.movingFn', 'vector.mean', 'vector.centeredMovingMean', 'vector.runningMean'],
  },
  'centeredMovingMean': {
    category: 'vector',
    description: 'Returns the **centered moving mean** of the `vector` with a given window size.',
    returns: {
      type: 'array',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **centered moving mean** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the centered moving window.',
      },
      leftPadding: {
        type: 'number',
        description: 'Optional value to use for padding. Default is `null`.',
      },
      rightPadding: {
        type: 'number',
        description: 'Optional value to use for right padding. Default is `null`.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
          'rightPadding',
        ],
      },
    ],
    examples: [
      'let { centeredMovingMean } = import(vector);\ncenteredMovingMean([1, 2, 3, 4, 5], 3)',
      'let { centeredMovingMean } = import(vector);\ncenteredMovingMean([1, 2, 3, 4, 5], 3, 0, 10)',
      'let { centeredMovingMean } = import(vector);\ncenteredMovingMean([1, 2, 3, 4, 5], 3, 10)',
    ],
    seeAlso: ['vector.mean', 'vector.movingMean', 'vector.runningMean'],
  },
  'runningMean': {
    category: 'vector',
    description: 'Returns the **running mean** of the `vector`.',
    returns: {
      type: 'vector',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **running mean** of.',
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
      'let { runningMean } = import(vector);\nrunningMean([1, 2, 3, 4, 5])',
    ],
    seeAlso: ['vector.runningFn', 'vector.mean', 'vector.movingMean', 'vector.centeredMovingMean'],
  },
  'geometricMean': {
    category: 'vector',
    description: 'Returns the **geometric mean** of all elements in the `vector`.',
    returns: {
      type: 'number',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **geometric mean** of.',
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
      'let { geometricMean } = import(vector);\ngeometricMean([1, 2, 3])',
      'let { geometricMean } = import(vector);\ngeometricMean([1, 2, 9])',
    ],
    seeAlso: ['vector.movingGeometricMean', 'vector.centeredMovingGeometricMean', 'vector.runningGeometricMean', 'vector.mean', 'vector.harmonicMean'],
  },
  'movingGeometricMean': {
    category: 'vector',
    description: 'Returns the **moving geometric mean** of the `vector` with a given window size.',
    returns: {
      type: 'vector',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **moving geometric mean** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the moving window.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
    ],
    examples: [
      'let { movingGeometricMean } = import(vector);\nmovingGeometricMean([1, 2, 3, 4, 5], 3)',
      'let { movingGeometricMean } = import(vector);\nmovingGeometricMean([1, 2, 3, 4, 5], 5)',
    ],
    seeAlso: ['vector.geometricMean', 'vector.centeredMovingGeometricMean', 'vector.runningGeometricMean'],
  },
  'centeredMovingGeometricMean': {
    category: 'vector',
    description: 'Returns the **centered moving geometric mean** of the `vector` with a given window size.',
    returns: {
      type: 'array',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **centered moving geometric mean** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the centered moving window.',
      },
      leftPadding: {
        type: 'number',
        description: 'Optional value to use for padding. Default is `null`.',
      },
      rightPadding: {
        type: 'number',
        description: 'Optional value to use for right padding. Default is `null`.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
          'rightPadding',
        ],
      },
    ],
    examples: [
      'let { centeredMovingGeometricMean } = import(vector);\ncenteredMovingGeometricMean([1, 2, 3, 4, 5], 3)',
      'let { centeredMovingGeometricMean } = import(vector);\ncenteredMovingGeometricMean([1, 2, 3, 4, 5], 3, 0, 10)',
      'let { centeredMovingGeometricMean } = import(vector);\ncenteredMovingGeometricMean([1, 2, 3, 4, 5], 3, 10)',
    ],
    seeAlso: ['vector.geometricMean', 'vector.movingGeometricMean', 'vector.runningGeometricMean'],
  },
  'runningGeometricMean': {
    category: 'vector',
    description: 'Returns the **running geometric mean** of the `vector`.',
    returns: {
      type: 'vector',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **running geometric mean** of.',
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
      'let { runningGeometricMean } = import(vector);\nrunningGeometricMean([1, 2, 3, 4, 5])',
    ],
    seeAlso: ['vector.geometricMean', 'vector.movingGeometricMean', 'vector.centeredMovingGeometricMean'],
  },
  'harmonicMean': {
    category: 'vector',
    description: 'Returns the **harmonic mean** of all elements in the `vector`.',
    returns: {
      type: 'number',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **harmonic mean** of.',
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
      'let { harmonicMean } = import(vector);\nharmonicMean([1, 2, 3])',
      'let { harmonicMean } = import(vector);\nharmonicMean([1, 2, 9])',
    ],
    seeAlso: ['vector.movingHarmonicMean', 'vector.centeredMovingHarmonicMean', 'vector.runningHarmonicMean', 'vector.mean', 'vector.geometricMean'],
  },
  'movingHarmonicMean': {
    category: 'vector',
    description: 'Returns the **moving harmonic mean** of the `vector` with a given window size.',
    returns: {
      type: 'vector',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **moving harmonic mean** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the moving window.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
    ],
    examples: [
      'let { movingHarmonicMean } = import(vector);\nmovingHarmonicMean([1, 2, 3, 4, 5], 3)',
      'let { movingHarmonicMean } = import(vector);\nmovingHarmonicMean([1, 2, 3, 4, 5], 5)',
    ],
    seeAlso: ['vector.harmonicMean', 'vector.centeredMovingHarmonicMean', 'vector.runningHarmonicMean'],
  },
  'centeredMovingHarmonicMean': {
    category: 'vector',
    description: 'Returns the **centered moving harmonic mean** of the `vector` with a given window size.',
    returns: {
      type: 'array',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **centered moving harmonic mean** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the centered moving window.',
      },
      leftPadding: {
        type: 'number',
        description: 'Optional value to use for padding. Default is `null`.',
      },
      rightPadding: {
        type: 'number',
        description: 'Optional value to use for right padding. Default is `null`.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
          'rightPadding',
        ],
      },
    ],
    examples: [
      'let { centeredMovingHarmonicMean } = import(vector);\ncenteredMovingHarmonicMean([1, 2, 3, 4, 5], 3)',
      'let { centeredMovingHarmonicMean } = import(vector);\ncenteredMovingHarmonicMean([1, 2, 3, 4, 5], 3, 0, 10)',
      'let { centeredMovingHarmonicMean } = import(vector);\ncenteredMovingHarmonicMean([1, 2, 3, 4, 5], 3, 10)',
    ],
    seeAlso: ['vector.harmonicMean', 'vector.movingHarmonicMean', 'vector.runningHarmonicMean'],
  },
  'runningHarmonicMean': {
    category: 'vector',
    description: 'Returns the **running harmonic mean** of the `vector`.',
    returns: {
      type: 'vector',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **running harmonic mean** of.',
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
      'let { runningHarmonicMean } = import(vector);\nrunningHarmonicMean([1, 2, 3, 4, 5])',
    ],
    seeAlso: ['vector.harmonicMean', 'vector.movingHarmonicMean', 'vector.centeredMovingHarmonicMean'],
  },
  'movingMedian': {
    category: 'vector',
    description: 'Returns the **moving median** of the `vector` with a given window size.',
    returns: {
      type: 'vector',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **moving median** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the moving window.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
    ],
    examples: [
      'let { movingMedian } = import(vector);\nmovingMedian([1, 2, 3, 4, 5], 3)',
      'let { movingMedian } = import(vector);\nmovingMedian([1, 2, 3, 4, 5], 5)',
    ],
    seeAlso: ['vector.median', 'vector.centeredMovingMedian', 'vector.runningMedian'],
  },
  'centeredMovingMedian': {
    category: 'vector',
    description: 'Returns the **centered moving median** of the `vector` with a given window size.',
    returns: {
      type: 'array',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **centered moving median** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the centered moving window.',
      },
      leftPadding: {
        type: 'number',
        description: 'Optional value to use for padding. Default is `null`.',
      },
      rightPadding: {
        type: 'number',
        description: 'Optional value to use for right padding. Default is `null`.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
          'rightPadding',
        ],
      },
    ],
    examples: [
      'let { centeredMovingMedian } = import(vector);\ncenteredMovingMedian([1, 2, 3, 4, 5], 3)',
      'let { centeredMovingMedian } = import(vector);\ncenteredMovingMedian([1, 2, 3, 4, 5], 3, 0, 10)',
      'let { centeredMovingMedian } = import(vector);\ncenteredMovingMedian([1, 2, 3, 4, 5], 3, 10)',
    ],
    seeAlso: ['vector.median', 'vector.movingMedian', 'vector.runningMedian'],
  },
  'runningMedian': {
    category: 'vector',
    description: 'Returns the **running median** of the `vector`.',
    returns: {
      type: 'vector',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **running median** of.',
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
      'let { runningMedian } = import(vector);\nrunningMedian([1, 2, 3, 4, 5])',
    ],
    seeAlso: ['vector.median', 'vector.movingMedian', 'vector.centeredMovingMedian'],
  },
  'variance': {
    category: 'vector',
    description: 'Returns the **variance** of all elements in the `vector`.',
    returns: {
      type: 'number',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **variance** of.',
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
      'let { variance } = import(vector);\nvariance([1, 2, 3])',
      'let { variance } = import(vector);\nvariance([1, 2, -3])',
    ],
    seeAlso: ['linearAlgebra.cov', 'vector.movingVariance', 'vector.centeredMovingVariance', 'vector.runningVariance', 'vector.stdev', 'vector.sampleVariance', 'vector.mad'],
  },
  'movingVariance': {
    category: 'vector',
    description: 'Returns the **moving variance** of the `vector` with a given window size.',
    returns: {
      type: 'vector',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **moving variance** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the moving window.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
    ],
    examples: [
      'let { movingVariance } = import(vector);\nmovingVariance([1, 2, 3, 4, 5], 3)',
      'let { movingVariance } = import(vector);\nmovingVariance([1, 2, 3, 4, 5], 5)',
    ],
    seeAlso: ['vector.variance', 'vector.centeredMovingVariance', 'vector.runningVariance'],
  },
  'centeredMovingVariance': {
    category: 'vector',
    description: 'Returns the **centered moving variance** of the `vector` with a given window size.',
    returns: {
      type: 'array',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **centered moving variance** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the centered moving window.',
      },
      leftPadding: {
        type: 'number',
        description: 'Optional value to use for padding. Default is `null`.',
      },
      rightPadding: {
        type: 'number',
        description: 'Optional value to use for right padding. Default is `null`.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
          'rightPadding',
        ],
      },
    ],
    examples: [
      'let { centeredMovingVariance } = import(vector);\ncenteredMovingVariance([1, 2, 3, 4, 5], 3)',
      'let { centeredMovingVariance } = import(vector);\ncenteredMovingVariance([1, 2, 3, 4, 5], 3, 1)',
      'let { centeredMovingVariance } = import(vector);\ncenteredMovingVariance([1, 2, 3, 4, 5], 3, 1, 5)',
      'let { centeredMovingVariance } = import(vector);\ncenteredMovingVariance([1, 2, 3, 4, 5], 3, 0, 6)',
    ],
    seeAlso: ['vector.variance', 'vector.movingVariance', 'vector.runningVariance'],
  },
  'runningVariance': {
    category: 'vector',
    description: 'Returns the **running variance** of the `vector`.',
    returns: {
      type: 'vector',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **running variance** of.',
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
      'let { runningVariance } = import(vector);\nrunningVariance([1, 2, 3, 4, 5])',
    ],
    seeAlso: ['vector.variance', 'vector.movingVariance', 'vector.centeredMovingVariance'],
  },
  'sampleVariance': {
    category: 'vector',
    description: 'Returns the sample variance of all elements in the vector.',
    returns: {
      type: 'number',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'Non emtpy vector to calculate the sample variance of.',
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
      'let { sampleVariance } = import(vector);\nsampleVariance([1, 2, 3])',
      'let { sampleVariance } = import(vector);\nsampleVariance([1, 2, -3])',
      'let { sampleVariance } = import(vector);\nsampleVariance([1, 2, 3, 4])',
      'let { sampleVariance } = import(vector);\nsampleVariance([1, 2, -3, 4])',
      'let { sampleVariance } = import(vector);\nsampleVariance([1, 2, 3, 40, 50])',
    ],
    seeAlso: ['vector.movingSampleVariance', 'vector.centeredMovingSampleVariance', 'vector.runningSampleVariance', 'vector.variance', 'vector.sampleStdev'],
  },
  'movingSampleVariance': {
    category: 'vector',
    description: 'Returns the **moving sample variance** of the `vector` with a given window size.',
    returns: {
      type: 'vector',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **moving sample variance** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the moving window.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
    ],
    examples: [
      'let { movingSampleVariance } = import(vector);\nmovingSampleVariance([1, 2, 3, 4, 5], 3)',
      'let { movingSampleVariance } = import(vector);\nmovingSampleVariance([1, 2, 3, 4, 5], 5)',
    ],
    seeAlso: ['vector.sampleVariance', 'vector.centeredMovingSampleVariance', 'vector.runningSampleVariance'],
  },
  'centeredMovingSampleVariance': {
    category: 'vector',
    description: 'Returns the **centered moving sample variance** of the `vector` with a given window size.',
    returns: {
      type: 'array',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **centered moving sample variance** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the centered moving window.',
      },
      leftPadding: {
        type: 'number',
        description: 'Optional value to use for padding. Default is `null`.',
      },
      rightPadding: {
        type: 'number',
        description: 'Optional value to use for right padding. Default is `null`.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
          'rightPadding',
        ],
      },
    ],
    examples: [
      'let { centeredMovingSampleVariance } = import(vector);\ncenteredMovingSampleVariance([1, 2, 3, 4, 5], 3)',
      'let { centeredMovingSampleVariance } = import(vector);\ncenteredMovingSampleVariance([1, 2, 3, 4, 5], 3, 1)',
      'let { centeredMovingSampleVariance } = import(vector);\ncenteredMovingSampleVariance([1, 2, 3, 4, 5], 3, 1, 5)',
      'let { centeredMovingSampleVariance } = import(vector);\ncenteredMovingSampleVariance([1, 2, 3, 4, 5], 3, 0, 6)',
    ],
    seeAlso: ['vector.sampleVariance', 'vector.movingSampleVariance', 'vector.runningSampleVariance'],
  },
  'runningSampleVariance': {
    category: 'vector',
    description: 'Returns the **running sample variance** of the `vector`.',
    returns: {
      type: 'array',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **running sample variance** of. First element in result is `null` since **sample variance** is not defined for a single element.',
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
      'let { runningSampleVariance } = import(vector);\nrunningSampleVariance([1, 2, 3, 4, 5])',
    ],
    seeAlso: ['vector.sampleVariance', 'vector.movingSampleVariance', 'vector.centeredMovingSampleVariance'],
  },
  'stdev': {
    category: 'vector',
    description: 'Returns the standard deviation of all elements in the vector.',
    returns: {
      type: 'number',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'Non emtpy vector to calculate the standard deviation of.',
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
      'let { stdev } = import(vector);\nstdev([1, 2, 3])',
      'let { stdev } = import(vector);\nstdev([1, 2, -3])',
      'let { stdev } = import(vector);\nstdev([1, 2, 3, 4])',
      'let { stdev } = import(vector);\nstdev([1, 2, -3, 4])',
      'let { stdev } = import(vector);\nstdev([1, 2, 3, 40, 50])',
    ],
    seeAlso: ['vector.movingStdev', 'vector.centeredMovingStdev', 'vector.runningStdev', 'vector.variance', 'vector.sampleStdev', 'vector.rms', 'vector.mad'],
  },
  'movingStdev': {
    category: 'vector',
    description: 'Returns the **moving standard deviation** of the `vector` with a given window size.',
    returns: {
      type: 'vector',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **moving standard deviation** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the moving window.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
    ],
    examples: [
      'let { movingStdev } = import(vector);\nmovingStdev([1, 2, 3, 4, 5], 3)',
      'let { movingStdev } = import(vector);\nmovingStdev([1, 2, 3, 4, 5], 5)',
    ],
    seeAlso: ['vector.stdev', 'vector.centeredMovingStdev', 'vector.runningStdev'],
  },
  'centeredMovingStdev': {
    category: 'vector',
    description: 'Returns the **centered moving standard deviation** of the `vector` with a given window size.',
    returns: {
      type: 'array',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **centered moving standard deviation** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the centered moving window.',
      },
      leftPadding: {
        type: 'number',
        description: 'Optional value to use for padding. Default is `null`.',
      },
      rightPadding: {
        type: 'number',
        description: 'Optional value to use for right padding. Default is `null`.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
          'rightPadding',
        ],
      },
    ],
    examples: [
      'let { centeredMovingStdev } = import(vector);\ncenteredMovingStdev([1, 2, 3, 4, 5], 3)',
      'let { centeredMovingStdev } = import(vector);\ncenteredMovingStdev([1, 2, 3, 4, 5], 3, 1)',
      'let { centeredMovingStdev } = import(vector);\ncenteredMovingStdev([1, 2, 3, 4, 5], 3, 1, 5)',
      'let { centeredMovingStdev } = import(vector);\ncenteredMovingStdev([1, 2, 3, 4, 5], 3, 0, 6)',
    ],
    seeAlso: ['vector.stdev', 'vector.movingStdev', 'vector.runningStdev'],
  },
  'runningStdev': {
    category: 'vector',
    description: 'Returns the **running standard deviation** of the `vector`.',
    returns: {
      type: 'vector',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **running standard deviation** of.',
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
      'let { runningStdev } = import(vector);\nrunningStdev([1, 2, 3, 4, 5])',
    ],
    seeAlso: ['vector.stdev', 'vector.movingStdev', 'vector.centeredMovingStdev'],
  },
  'sampleStdev': {
    category: 'vector',
    description: 'Returns the sample standard deviation of all elements in the vector.',
    returns: {
      type: 'number',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'Non emtpy vector to calculate the sample standard deviation of.',
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
      'let { sampleStdev } = import(vector);\nsampleStdev([1, 2, 3])',
      'let { sampleStdev } = import(vector);\nsampleStdev([1, 2, -3])',
      'let { sampleStdev } = import(vector);\nsampleStdev([1, 2, 3, 4])',
      'let { sampleStdev } = import(vector);\nsampleStdev([1, 2, -3, 4])',
      'let { sampleStdev } = import(vector);\nsampleStdev([1, 2, 3, 40, 50])',
    ],
    seeAlso: ['vector.movingSampleStdev', 'vector.centeredMovingSampleStdev', 'vector.runningSampleStdev', 'vector.stdev', 'vector.sampleVariance'],
  },
  'movingSampleStdev': {
    category: 'vector',
    description: 'Returns the **moving sample standard deviation** of the `vector` with a given window size.',
    returns: {
      type: 'vector',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **moving sample standard deviation** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the moving window.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
    ],
    examples: [
      'let { movingSampleStdev } = import(vector);\nmovingSampleStdev([1, 2, 3, 4, 5], 3)',
      'let { movingSampleStdev } = import(vector);\nmovingSampleStdev([1, 2, 3, 4, 5], 5)',
    ],
    seeAlso: ['vector.sampleStdev', 'vector.centeredMovingSampleStdev', 'vector.runningSampleStdev'],
  },
  'centeredMovingSampleStdev': {
    category: 'vector',
    description: 'Returns the **centered moving sample standard deviation** of the `vector` with a given window size.',
    returns: {
      type: 'array',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **centered moving sample standard deviation** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the centered moving window.',
      },
      leftPadding: {
        type: 'number',
        description: 'Optional value to use for padding. Default is `null`.',
      },
      rightPadding: {
        type: 'number',
        description: 'Optional value to use for right padding. Default is `null`.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
          'rightPadding',
        ],
      },
    ],
    examples: [
      'let { centeredMovingSampleStdev } = import(vector);\ncenteredMovingSampleStdev([1, 2, 3, 4, 5], 3)',
      'let { centeredMovingSampleStdev } = import(vector);\ncenteredMovingSampleStdev([1, 2, 3, 4, 5], 3, 1)',
      'let { centeredMovingSampleStdev } = import(vector);\ncenteredMovingSampleStdev([1, 2, 3, 4, 5], 3, 1, 5)',
      'let { centeredMovingSampleStdev } = import(vector);\ncenteredMovingSampleStdev([1, 2, 3, 4, 5], 3, 0, 6)',
    ],
    seeAlso: ['vector.sampleStdev', 'vector.movingSampleStdev', 'vector.runningSampleStdev'],
  },
  'runningSampleStdev': {
    category: 'vector',
    description: 'Returns the **running sample standard deviation** of the `vector`.',
    returns: {
      type: 'array',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **running sample standard deviation** of. First element in result is `null` since **sample standard deviation** is not defined for a single element.',
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
      'let { runningSampleStdev } = import(vector);\nrunningSampleStdev([1, 2, 3, 4, 5])',
    ],
    seeAlso: ['vector.sampleStdev', 'vector.movingSampleStdev', 'vector.centeredMovingSampleStdev'],
  },
  'iqr': {
    category: 'vector',
    description: 'Calculates the **interquartile range** of a `vector`. Returns the difference between the third and first quartiles.',
    returns: {
      type: 'number',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **interquartile range** of. Minimum length is 4.',
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
      'let { iqr } = import(vector);\niqr([1, 2, 3, 4])',
      'let { iqr } = import(vector);\niqr([5, 4, 3, 2, 1, 2, 3, 4, 5])',
      'let { iqr } = import(vector);\niqr(range(1, 1000))',
      'let { iqr } = import(vector);\niqr(map(range(1000), -> 1e6 / ($ + 1) ^ 2))',
      'let { iqr } = import(vector);\nlet { ln } = import(math);\niqr(map(range(1000), -> ln($ + 1)))',
    ],
    seeAlso: ['vector.movingIqr', 'vector.centeredMovingIqr', 'vector.runningIqr', 'vector.quartiles', 'vector.median', 'vector.mad', 'vector.medad', 'vector.isOutliers', 'vector.outliers'],
  },
  'movingIqr': {
    category: 'vector',
    description: 'Calculates the **moving interquartile range** of a `vector` with a given window size.',
    returns: {
      type: 'vector',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **moving interquartile range** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the moving window.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
    ],
    examples: [
      'let { movingIqr } = import(vector);\nmovingIqr([1, 2, 4, 7, 11, 16], 4)',
      'let { movingIqr } = import(vector);\nmovingIqr([1, 2, 4, 7, 11, 16], 5)',
      'let { movingIqr } = import(vector);\nmovingIqr([1, 2, 4, 7, 11, 16], 6)',
    ],
    seeAlso: ['vector.iqr', 'vector.centeredMovingIqr', 'vector.runningIqr'],
  },
  'centeredMovingIqr': {
    category: 'vector',
    description: 'Calculates the **centered moving interquartile range** of a `vector` with a given window size.',
    returns: {
      type: 'array',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **centered moving interquartile range** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the moving window.',
      },
      leftPadding: {
        type: 'number',
        description: 'Optional value to use for padding. Default is `null`.',
      },
      rightPadding: {
        type: 'number',
        description: 'Optional value to use for right padding. Default is `null`.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
          'rightPadding',
        ],
      },
    ],
    examples: [
      'let { centeredMovingIqr } = import(vector);\ncenteredMovingIqr([1, 2, 4, 7, 11, 16], 4)',
      'let { centeredMovingIqr } = import(vector);\ncenteredMovingIqr([1, 2, 4, 7, 11, 16], 4, 0, 0)',
    ],
    seeAlso: ['vector.iqr', 'vector.movingIqr', 'vector.runningIqr'],
  },
  'runningIqr': {
    category: 'vector',
    description: 'Calculates the **running interquartile range** of a `vector`. First three element in result is `null` since **running interquartile range** is not defined for less than four elements.',
    returns: {
      type: 'number',
      array: true,
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **running interquartile range** of.',
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
      'let { runningIqr } = import(vector);\nrunningIqr([1, 2, 3, 4, 5, 6])',
      'let { runningIqr } = import(vector);\nrunningIqr([-1, -2, -3, 1, 2, 3])',
    ],
    seeAlso: ['vector.iqr', 'vector.movingIqr', 'vector.centeredMovingIqr'],
  },
  'movingSum': {
    category: 'vector',
    description: 'Returns the **moving sum** of the `vector` with a given window size.',
    returns: {
      type: 'vector',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **moving sum** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the moving window.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
    ],
    examples: [
      'let { movingSum } = import(vector);\nmovingSum([1, 2, 3, 4, 5], 3)',
      'let { movingSum } = import(vector);\nmovingSum([1, 2, 3, 4, 5], 5)',
    ],
    seeAlso: ['vector.sum', 'vector.centeredMovingSum', 'vector.runningSum'],
  },
  'centeredMovingSum': {
    category: 'vector',
    description: 'Returns the **centered moving sum** of the `vector` with a given window size.',
    returns: {
      type: 'array',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **centered moving sum** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the centered moving window.',
      },
      leftPadding: {
        type: 'number',
        description: 'Optional value to use for padding. Default is `null`.',
      },
      rightPadding: {
        type: 'number',
        description: 'Optional value to use for right padding. Default is `null`.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
          'rightPadding',
        ],
      },
    ],
    examples: [
      'let { centeredMovingSum } = import(vector);\ncenteredMovingSum([1, 2, 3, 4, 5], 3)',
      'let { centeredMovingSum } = import(vector);\ncenteredMovingSum([1, 2, 3, 4, 5], 3, 0, 0)',
      'let { centeredMovingSum } = import(vector);\ncenteredMovingSum([1, 2, 3, 4, 5], 3, 10)',
    ],
    seeAlso: ['vector.sum', 'vector.movingSum', 'vector.runningSum'],
  },
  'runningSum': {
    category: 'vector',
    description: 'Returns the **running sum** of the `vector`.',
    returns: {
      type: 'vector',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **running sum** of.',
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
      'let { runningSum } = import(vector);\nrunningSum([1, 2, 3])',
      'let { runningSum } = import(vector);\nrunningSum([1, -2, -3])',
    ],
    seeAlso: ['vector.sum', 'vector.movingSum', 'vector.centeredMovingSum', 'vector.cumsum'],
  },
  'movingProd': {
    category: 'vector',
    description: 'Returns the **moving product** of the `vector` with a given window size.',
    returns: {
      type: 'vector',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **moving product** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the moving window.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
    ],
    examples: [
      'let { movingProd } = import(vector);\nmovingProd([1, 2, 3, 4, 5], 3)',
      'let { movingProd } = import(vector);\nmovingProd([1, 2, 3, 4, 5], 5)',
    ],
    seeAlso: ['vector.prod', 'vector.centeredMovingProd', 'vector.runningProd'],
  },
  'centeredMovingProd': {
    category: 'vector',
    description: 'Returns the **centered moving product** of the `vector` with a given window size.',
    returns: {
      type: 'array',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **centered moving product** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the moving window.',
      },
      leftPadding: {
        type: 'number',
        description: 'Optional value to use for padding. Default is `null`.',
      },
      rightPadding: {
        type: 'number',
        description: 'Optional value to use for right padding. Default is `null`.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
          'rightPadding',
        ],
      },
    ],
    examples: [
      'let { centeredMovingProd } = import(vector);\ncenteredMovingProd([1, 2, 3, 4, 5], 3)',
      'let { centeredMovingProd } = import(vector);\ncenteredMovingProd([1, 2, 3, 4, 5], 3, 0, 0)',
    ],
    seeAlso: ['vector.prod', 'vector.movingProd', 'vector.runningProd'],
  },
  'runningProd': {
    category: 'vector',
    description: 'Returns the **running product** of the `vector`.',
    returns: {
      type: 'vector',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **running product** of.',
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
      'let { runningProd } = import(vector);\nrunningProd([1, 2, 3, 4, 5])',
      'let { runningProd } = import(vector);\nrunningProd([1, -2, -3])',
    ],
    seeAlso: ['vector.prod', 'vector.movingProd', 'vector.centeredMovingProd', 'vector.cumprod'],
  },
  'span': {
    category: 'vector',
    description: 'Returns the difference between the maximum and minimum values in a vector.',
    returns: {
      type: 'number',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The vector to calculate the span of.',
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
      'let { span } = import(vector);\nspan([1, 2, 3])',
      'let { span } = import(vector);\nspan([1, 1, 2, 3, 3])',
      'let { span } = import(vector);\nspan([1, 2, -3])',
    ],
    seeAlso: ['vector.movingSpan', 'vector.centeredMovingSpan', 'vector.runningSpan', 'min', 'max'],
  },
  'movingSpan': {
    category: 'vector',
    description: 'Calculates the **moving span** of a `vector` with a given window size.',
    returns: {
      type: 'vector',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **moving span** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the moving window.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
    ],
    examples: [
      'let { movingSpan } = import(vector);\nmovingSpan([1, 2, 4, 7, 11, 16], 4)',
      'let { movingSpan } = import(vector);\nmovingSpan([1, 2, 4, 7, 11, 16], 5)',
      'let { movingSpan } = import(vector);\nmovingSpan([1, 2, 4, 7, 11, 16], 6)',
    ],
    seeAlso: ['vector.span', 'vector.centeredMovingSpan', 'vector.runningSpan'],
  },
  'centeredMovingSpan': {
    category: 'vector',
    description: 'Calculates the **centered moving span** of a `vector` with a given window size. The result is padded with `leftPadding` on the left and right.',
    returns: {
      type: 'array',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **centered moving span** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the moving window.',
      },
      leftPadding: {
        type: 'number',
        description: 'The value to pad the result with on the left.',
      },
      rightPadding: {
        type: 'number',
        description: 'The value to pad the result with on the right.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
          'rightPadding',
        ],
      },
    ],
    examples: [
      'let { centeredMovingSpan } = import(vector);\ncenteredMovingSpan([1, 2, 4, 7, 11, 16], 4)',
      'let { centeredMovingSpan } = import(vector);\ncenteredMovingSpan([1, 2, 4, 7, 11, 16], 3, 0, 100)',
    ],
    seeAlso: ['vector.span', 'vector.movingSpan', 'vector.runningSpan'],
  },
  'runningSpan': {
    category: 'vector',
    description: 'Calculates the **running span** of a `vector` with a given window size.',
    returns: {
      type: 'vector',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **running span** of.',
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
      'let { runningSpan } = import(vector);\nrunningSpan([1, 2, 4])',
    ],
    seeAlso: ['vector.span', 'vector.movingSpan', 'vector.centeredMovingSpan'],
  },
  'skewness': {
    category: 'vector',
    description: 'Calculates the **skewness** of a `vector`. Returns the third standardized moment.',
    returns: {
      type: 'number',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **skewness** of. Minimum length is 3.',
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
      'let { skewness } = import(vector);\nskewness([1, 2, 3, 6, 20])',
      'let { skewness } = import(vector);\nskewness([1, 2, 2, 3])',
    ],
    seeAlso: ['vector.movingSkewness', 'vector.centeredMovingSkewness', 'vector.runningSkewness', 'vector.kurtosis', 'vector.sampleSkewness', 'vector.excessKurtosis'],
  },
  'movingSkewness': {
    category: 'vector',
    description: 'Calculates the **moving skewness** of a `vector` with a given window size.',
    returns: {
      type: 'vector',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **moving skewness** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the moving window.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
    ],
    examples: [
      'let { movingSkewness } = import(vector);\nmovingSkewness([1, 2, 4, 7, 11, 16], 4)',
      'let { movingSkewness } = import(vector);\nmovingSkewness([1, 2, 4, 7, 11, 16], 5)',
    ],
    seeAlso: ['vector.skewness', 'vector.centeredMovingSkewness', 'vector.runningSkewness'],
  },
  'centeredMovingSkewness': {
    category: 'vector',
    description: 'Calculates the **centered moving skewness** of a `vector` with a given window size and padding.',
    returns: {
      type: 'array',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **centered moving skewness** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the moving window.',
      },
      leftPadding: {
        type: 'number',
        description: 'Optional value to use for padding. Default is `null`.',
      },
      rightPadding: {
        type: 'number',
        description: 'Optional value to use for right padding. Default is `null`.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
          'rightPadding',
        ],
      },
    ],
    examples: [
      'let { centeredMovingSkewness } = import(vector);\ncenteredMovingSkewness([1, 2, 4, 7, 11, 16], 4)',
      'let { centeredMovingSkewness } = import(vector);\ncenteredMovingSkewness([1, 2, 4, 7, 11, 16], 4, 0, 0)',
    ],
    seeAlso: ['vector.skewness', 'vector.movingSkewness', 'vector.runningSkewness'],
  },
  'runningSkewness': {
    category: 'vector',
    description: 'Calculates the **running skewness** of a `vector` with a given window size. First two element in result is `null` since **running skewness** is not defined for less than three elements.',
    returns: {
      type: 'array',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **running skewness** of.',
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
      'let { runningSkewness } = import(vector);\nrunningSkewness([1, 2, 4, 7, 11])',
    ],
    seeAlso: ['vector.skewness', 'vector.movingSkewness', 'vector.centeredMovingSkewness'],
  },
  'sampleSkewness': {
    category: 'vector',
    description: 'Calculates the **sample skewness** of a `vector`. Returns the third standardized moment.',
    returns: {
      type: 'number',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **sample skewness** of. Minimum length is 3.',
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
      'let { sampleSkewness } = import(vector);\nsampleSkewness([1, 2, 3, 6, 20])',
      'let { sampleSkewness } = import(vector);\nsampleSkewness([1, 2, 2, 3])',
    ],
    seeAlso: ['vector.movingSampleSkewness', 'vector.centeredMovingSampleSkewness', 'vector.runningSampleSkewness', 'vector.skewness', 'vector.sampleKurtosis'],
  },
  'movingSampleSkewness': {
    category: 'vector',
    description: 'Calculates the **moving sample skewness** of a `vector` with a given window size.',
    returns: {
      type: 'vector',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **moving sample skewness** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the moving window.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
    ],
    examples: [
      'let { movingSampleSkewness } = import(vector);\nmovingSampleSkewness([1, 2, 4, 7, 11, 16], 4)',
      'let { movingSampleSkewness } = import(vector);\nmovingSampleSkewness([1, 2, 4, 7, 11, 16], 5)',
    ],
    seeAlso: ['vector.sampleSkewness', 'vector.centeredMovingSampleSkewness', 'vector.runningSampleSkewness'],
  },
  'centeredMovingSampleSkewness': {
    category: 'vector',
    description: 'Calculates the **centered moving sample skewness** of a `vector` with a given window size and padding.',
    returns: {
      type: 'array',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **centered moving sample skewness** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the moving window.',
      },
      leftPadding: {
        type: 'number',
        description: 'Optional value to use for padding. Default is `null`.',
      },
      rightPadding: {
        type: 'number',
        description: 'Optional value to use for right padding. Default is `null`.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
          'rightPadding',
        ],
      },
    ],
    examples: [
      'let { centeredMovingSampleSkewness } = import(vector);\ncenteredMovingSampleSkewness([1, 2, 4, 7, 11, 16], 4)',
      'let { centeredMovingSampleSkewness } = import(vector);\ncenteredMovingSampleSkewness([1, 2, 4, 7, 11, 16], 3, 0, 100)',
    ],
    seeAlso: ['vector.sampleSkewness', 'vector.movingSampleSkewness', 'vector.runningSampleSkewness'],
  },
  'runningSampleSkewness': {
    category: 'vector',
    description: 'Calculates the **running sample skewness** of a `vector` with a given window size. First two element in result is `null` since **running sample skewness** is not defined for less than three elements.',
    returns: {
      type: 'array',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **running sample skewness** of.',
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
      'let { runningSampleSkewness } = import(vector);\nrunningSampleSkewness([1, 2, 4, 7, 11])',
    ],
    seeAlso: ['vector.sampleSkewness', 'vector.movingSampleSkewness', 'vector.centeredMovingSampleSkewness'],
  },
  'excessKurtosis': {
    category: 'vector',
    description: 'Calculates the **excess kurtosis** of a `vector`. Returns the third standardized moment.',
    returns: {
      type: 'number',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **excess kurtosis** of. Minimum length is 3.',
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
      'let { excessKurtosis } = import(vector);\nexcessKurtosis([1, 2, 3, 6, 20])',
      'let { excessKurtosis } = import(vector);\nexcessKurtosis([1, 2, 2, 3])',
    ],
    seeAlso: ['vector.movingExcessKurtosis', 'vector.centeredMovingExcessKurtosis', 'vector.runningExcessKurtosis', 'vector.kurtosis', 'vector.sampleExcessKurtosis', 'vector.skewness'],
  },
  'movingExcessKurtosis': {
    category: 'vector',
    description: 'Calculates the **moving excess kurtosis** of a `vector` with a given window size.',
    returns: {
      type: 'vector',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **moving excess kurtosis** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the moving window.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
    ],
    examples: [
      'let { movingExcessKurtosis } = import(vector);\nmovingExcessKurtosis([1, 2, 4, 7, 11, 16], 4)',
      'let { movingExcessKurtosis } = import(vector);\nmovingExcessKurtosis([1, 2, 4, 7, 11, 16], 5)',
    ],
    seeAlso: ['vector.excessKurtosis', 'vector.centeredMovingExcessKurtosis', 'vector.runningExcessKurtosis'],
  },
  'centeredMovingExcessKurtosis': {
    category: 'vector',
    description: 'Calculates the **centered moving excess kurtosis** of a `vector` with a given window size and padding.',
    returns: {
      type: 'array',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **centered moving excess kurtosis** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the moving window.',
      },
      leftPadding: {
        type: 'number',
        description: 'Optional value to use for padding. Default is `null`.',
      },
      rightPadding: {
        type: 'number',
        description: 'Optional value to use for right padding. Default is `null`.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
          'rightPadding',
        ],
      },
    ],
    examples: [
      'let { centeredMovingExcessKurtosis } = import(vector);\ncenteredMovingExcessKurtosis([1, 2, 4, 7, 11, 16], 4)',
      'let { centeredMovingExcessKurtosis } = import(vector);\ncenteredMovingExcessKurtosis([1, 2, 4, 7, 11, 16], 4, 0, 0)',
    ],
    seeAlso: ['vector.excessKurtosis', 'vector.movingExcessKurtosis', 'vector.runningExcessKurtosis'],
  },
  'runningExcessKurtosis': {
    category: 'vector',
    description: 'Calculates the **running excess kurtosis** of a `vector` with a given window size. First two element in result is `null` since **running excess kurtosis** is not defined for less than three elements.',
    returns: {
      type: 'array',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **running excess kurtosis** of.',
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
      'let { runningExcessKurtosis } = import(vector);\nrunningExcessKurtosis([1, 2, 4, 7, 11])',
    ],
    seeAlso: ['vector.excessKurtosis', 'vector.movingExcessKurtosis', 'vector.centeredMovingExcessKurtosis'],
  },
  'kurtosis': {
    category: 'vector',
    description: 'Calculates the **kurtosis** of a `vector`. Returns the third standardized moment.',
    returns: {
      type: 'number',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **kurtosis** of. Minimum length is 3.',
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
      'let { kurtosis } = import(vector);\nkurtosis([1, 2, 3, 6, 20])',
      'let { kurtosis } = import(vector);\nkurtosis([1, 2, 2, 3])',
    ],
    seeAlso: ['vector.movingKurtosis', 'vector.centeredMovingKurtosis', 'vector.runningKurtosis', 'vector.excessKurtosis', 'vector.sampleKurtosis', 'vector.skewness'],
  },
  'movingKurtosis': {
    category: 'vector',
    description: 'Calculates the **moving kurtosis** of a `vector` with a given window size.',
    returns: {
      type: 'vector',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **moving kurtosis** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the moving window.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
    ],
    examples: [
      'let { movingKurtosis } = import(vector);\nmovingKurtosis([1, 2, 4, 7, 11, 16], 4)',
      'let { movingKurtosis } = import(vector);\nmovingKurtosis([1, 2, 4, 7, 11, 16], 5)',
    ],
    seeAlso: ['vector.kurtosis', 'vector.centeredMovingKurtosis', 'vector.runningKurtosis'],
  },
  'centeredMovingKurtosis': {
    category: 'vector',
    description: 'Calculates the **centered moving kurtosis** of a `vector` with a given window size and padding.',
    returns: {
      type: 'array',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **centered moving kurtosis** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the moving window.',
      },
      leftPadding: {
        type: 'number',
        description: 'Optional value to use for padding. Default is `null`.',
      },
      rightPadding: {
        type: 'number',
        description: 'Optional value to use for right padding. Default is `null`.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
          'rightPadding',
        ],
      },
    ],
    examples: [
      'let { centeredMovingKurtosis } = import(vector);\ncenteredMovingKurtosis([1, 2, 4, 7, 11, 16], 4)',
      'let { centeredMovingKurtosis } = import(vector);\ncenteredMovingKurtosis([1, 2, 4, 7, 11, 16], 4, 0, 0)',
    ],
    seeAlso: ['vector.kurtosis', 'vector.movingKurtosis', 'vector.runningKurtosis'],
  },
  'runningKurtosis': {
    category: 'vector',
    description: 'Calculates the **running kurtosis** of a `vector` with a given window size. First two element in result is `null` since **running kurtosis** is not defined for less than three elements.',
    returns: {
      type: 'array',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **running kurtosis** of.',
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
      'let { runningKurtosis } = import(vector);\nrunningKurtosis([1, 2, 4, 7, 11])',
    ],
    seeAlso: ['vector.kurtosis', 'vector.movingKurtosis', 'vector.centeredMovingKurtosis'],
  },
  'sampleExcessKurtosis': {
    category: 'vector',
    description: 'Calculates the **sample excess kurtosis** of a `vector`. Returns the third standardized moment.',
    returns: {
      type: 'number',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **sample excess kurtosis** of. Minimum length is 3.',
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
      'let { sampleExcessKurtosis } = import(vector);\nsampleExcessKurtosis([1, 2, 3, 6, 20])',
      'let { sampleExcessKurtosis } = import(vector);\nsampleExcessKurtosis([1, 2, 2, 3])',
    ],
    seeAlso: ['vector.movingSampleExcessKurtosis', 'vector.centeredMovingSampleExcessKurtosis', 'vector.runningSampleExcessKurtosis', 'vector.sampleKurtosis', 'vector.excessKurtosis'],
  },
  'movingSampleExcessKurtosis': {
    category: 'vector',
    description: 'Calculates the **moving sample excess kurtosis** of a `vector` with a given window size.',
    returns: {
      type: 'vector',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **moving sample excess kurtosis** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the moving window.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
    ],
    examples: [
      'let { movingSampleExcessKurtosis } = import(vector);\nmovingSampleExcessKurtosis([1, 2, 4, 7, 11, 16], 4)',
      'let { movingSampleExcessKurtosis } = import(vector);\nmovingSampleExcessKurtosis([1, 2, 4, 7, 11, 16], 5)',
    ],
    seeAlso: ['vector.sampleExcessKurtosis', 'vector.centeredMovingSampleExcessKurtosis', 'vector.runningSampleExcessKurtosis'],
  },
  'centeredMovingSampleExcessKurtosis': {
    category: 'vector',
    description: 'Calculates the **centered moving sample excess kurtosis** of a `vector` with a given window size and padding.',
    returns: {
      type: 'array',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **centered moving sample excess kurtosis** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the moving window.',
      },
      leftPadding: {
        type: 'number',
        description: 'Optional value to use for padding. Default is `null`.',
      },
      rightPadding: {
        type: 'number',
        description: 'Optional value to use for right padding. Default is `null`.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
          'rightPadding',
        ],
      },
    ],
    examples: [
      'let { centeredMovingSampleExcessKurtosis } = import(vector);\ncenteredMovingSampleExcessKurtosis([1, 2, 4, 7, 11, 16], 4)',
      'let { centeredMovingSampleExcessKurtosis } = import(vector);\ncenteredMovingSampleExcessKurtosis([1, 2, 4, 7, 11, 16], 4, 0, 100)',
    ],
    seeAlso: ['vector.sampleExcessKurtosis', 'vector.movingSampleExcessKurtosis', 'vector.runningSampleExcessKurtosis'],
  },
  'runningSampleExcessKurtosis': {
    category: 'vector',
    description: 'Calculates the **running sample excess kurtosis** of a `vector` with a given window size. First two element in result is `null` since **running sample excess kurtosis** is not defined for less than three elements.',
    returns: {
      type: 'array',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **running sample excess kurtosis** of.',
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
      'let { runningSampleExcessKurtosis } = import(vector);\nrunningSampleExcessKurtosis([1, 2, 4, 7, 11])',
    ],
    seeAlso: ['vector.sampleExcessKurtosis', 'vector.movingSampleExcessKurtosis', 'vector.centeredMovingSampleExcessKurtosis'],
  },
  'sampleKurtosis': {
    category: 'vector',
    description: 'Calculates the **sample kurtosis** of a `vector`. Returns the third standardized moment.',
    returns: {
      type: 'number',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **sample kurtosis** of. Minimum length is 3.',
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
      'let { sampleKurtosis } = import(vector);\nsampleKurtosis([1, 2, 3, 6, 20])',
      'let { sampleKurtosis } = import(vector);\nsampleKurtosis([1, 2, 2, 3])',
    ],
    seeAlso: ['vector.movingSampleKurtosis', 'vector.centeredMovingSampleKurtosis', 'vector.runningSampleKurtosis', 'vector.sampleExcessKurtosis', 'vector.kurtosis', 'vector.sampleSkewness'],
  },
  'movingSampleKurtosis': {
    category: 'vector',
    description: 'Calculates the **moving sample kurtosis** of a `vector` with a given window size.',
    returns: {
      type: 'vector',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **moving sample kurtosis** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the moving window.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
    ],
    examples: [
      'let { movingSampleKurtosis } = import(vector);\nmovingSampleKurtosis([1, 2, 4, 7, 11, 16], 4)',
      'let { movingSampleKurtosis } = import(vector);\nmovingSampleKurtosis([1, 2, 4, 7, 11, 16], 5)',
    ],
    seeAlso: ['vector.sampleKurtosis', 'vector.centeredMovingSampleKurtosis', 'vector.runningSampleKurtosis'],
  },
  'centeredMovingSampleKurtosis': {
    category: 'vector',
    description: 'Calculates the **centered moving sample kurtosis** of a `vector` with a given window size and padding.',
    returns: {
      type: 'array',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **centered moving sample kurtosis** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the moving window.',
      },
      leftPadding: {
        type: 'number',
        description: 'Optional value to use for padding. Default is `null`.',
      },
      rightPadding: {
        type: 'number',
        description: 'Optional value to use for right padding. Default is `null`.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
          'rightPadding',
        ],
      },
    ],
    examples: [
      'let { centeredMovingSampleKurtosis } = import(vector);\ncenteredMovingSampleKurtosis([1, 2, 4, 7, 11, 16], 4)',
      'let { centeredMovingSampleKurtosis } = import(vector);\ncenteredMovingSampleKurtosis([1, 2, 4, 7, 11, 16], 4, 0, 100)',
    ],
    seeAlso: ['vector.sampleKurtosis', 'vector.movingSampleKurtosis', 'vector.runningSampleKurtosis'],
  },
  'runningSampleKurtosis': {
    category: 'vector',
    description: 'Calculates the **running sample kurtosis** of a `vector` with a given window size. First two element in result is `null` since **running sample kurtosis** is not defined for less than three elements.',
    returns: {
      type: 'array',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **running sample kurtosis** of.',
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
      'let { runningSampleKurtosis } = import(vector);\nrunningSampleKurtosis([1, 2, 4, 7, 11])',
    ],
    seeAlso: ['vector.sampleKurtosis', 'vector.movingSampleKurtosis', 'vector.centeredMovingSampleKurtosis'],
  },
  'rms': {
    category: 'vector',
    description: 'Calculates the **root mean square** of a `vector`. Returns the square root of the average of the squares of the elements.',
    returns: {
      type: 'number',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **root mean square** of. Minimum length is 1.',
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
      'let { rms } = import(vector);\nrms([1, 2, 3, 4])',
      'let { rms } = import(vector);\nrms([5, 4, 3, 2, 1])',
      'let { rms } = import(vector);\nrms(range(1, 1000))',
      'let { rms } = import(vector);\nrms(map(range(1000), -> 1e6 / ($ + 1) ^ 2))',
      'let { rms } = import(vector);\nlet { ln } = import(math);\nrms(map(range(1000), -> ln($ + 1)))',
    ],
    seeAlso: ['vector.movingRms', 'vector.centeredMovingRms', 'vector.runningRms', 'vector.mean', 'vector.stdev'],
  },
  'movingRms': {
    category: 'vector',
    description: 'Calculates the **moving root mean square** of a `vector` with a given window size.',
    returns: {
      type: 'vector',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **moving root mean square** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the moving window.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
    ],
    examples: [
      'let { movingRms } = import(vector);\nmovingRms([1, 2, 4, 7, 11, 16], 4)',
      'let { movingRms } = import(vector);\nmovingRms([1, 2, 4, 7, 11, 16], 5)',
      'let { movingRms } = import(vector);\nmovingRms([1, 2, 4, 7, 11, 16], 6)',
    ],
    seeAlso: ['vector.rms', 'vector.centeredMovingRms', 'vector.runningRms'],
  },
  'centeredMovingRms': {
    category: 'vector',
    description: 'Calculates the **centered moving root mean square** of a `vector` with a given window size and padding value.',
    returns: {
      type: 'number',
      array: true,
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **centered moving root mean square** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the moving window.',
      },
      leftPadding: {
        type: 'number',
        description: 'Optional value to use for padding. Default is `null`.',
      },
      rightPadding: {
        type: 'number',
        description: 'Optional value to use for right padding. Default is `null`.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
          'rightPadding',
        ],
      },
    ],
    examples: [
      'let { centeredMovingRms } = import(vector);\ncenteredMovingRms([1, 2, 4, 7, 11, 16], 4)',
      'let { centeredMovingRms } = import(vector);\ncenteredMovingRms([1, 2, 4, 7, 11, 16], 5, 0)',
      'let { centeredMovingRms } = import(vector);\ncenteredMovingRms([1, 2, 4, 7, 11, 16], 6, 0, 0)',
    ],
    seeAlso: ['vector.rms', 'vector.movingRms', 'vector.runningRms'],
  },
  'runningRms': {
    category: 'vector',
    description: 'Calculates the **running root mean square** of a `vector`.',
    returns: {
      type: 'vector',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **running root mean square** of.',
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
      'let { runningRms } = import(vector);\nrunningRms([1, 2, 3, 4, 5, 6])',
      'let { runningRms } = import(vector);\nrunningRms([1, -3, 2])',
      'let { runningRms } = import(vector);\nrunningRms([-1, -2, -3])',
      'let { runningRms } = import(vector);\nrunningRms([0])',
    ],
    seeAlso: ['vector.rms', 'vector.movingRms', 'vector.centeredMovingRms'],
  },
  'mad': {
    category: 'vector',
    description: 'Returns the **mean absolute deviation** of all elements in the `vector`.',
    returns: {
      type: 'number',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **mean absolute deviation** of.',
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
      'let { mad } = import(vector);\nmad([1, 2, 3])',
      'let { mad } = import(vector);\nmad([1, 2, -3])',
    ],
    seeAlso: ['vector.movingMad', 'vector.centeredMovingMad', 'vector.runningMad', 'vector.medad', 'vector.stdev', 'vector.variance', 'vector.iqr'],
  },
  'movingMad': {
    category: 'vector',
    description: 'Returns the **moving mean absolute deviation** of the `vector` with a given window size.',
    returns: {
      type: 'vector',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **moving mean absolute deviation** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the moving window.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
    ],
    examples: [
      'let { movingMad } = import(vector);\nmovingMad([1, 2, 3, 4, 5], 3)',
      'let { movingMad } = import(vector);\nmovingMad([1, 2, 3, 4, 5], 5)',
    ],
    seeAlso: ['vector.mad', 'vector.centeredMovingMad', 'vector.runningMad'],
  },
  'centeredMovingMad': {
    category: 'vector',
    description: 'Returns the **centered moving mean absolute deviation** of the `vector` with a given window size.',
    returns: {
      type: 'array',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **centered moving mean absolute deviation** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the moving window.',
      },
      leftPadding: {
        type: 'number',
        description: 'Optional value to use for padding. Default is `null`.',
      },
      rightPadding: {
        type: 'number',
        description: 'Optional value to use for right padding. Default is `null`.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
          'rightPadding',
        ],
      },
    ],
    examples: [
      'let { centeredMovingMad } = import(vector);\ncenteredMovingMad([1, 2, 3, 4, 5], 3)',
      'let { centeredMovingMad } = import(vector);\ncenteredMovingMad([1, 2, 3, 4, 5], 5)',
    ],
    seeAlso: ['vector.mad', 'vector.movingMad', 'vector.runningMad'],
  },
  'runningMad': {
    category: 'vector',
    description: 'Returns the **running mean absolute deviation** of the `vector`.',
    returns: {
      type: 'vector',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **running mean absolute deviation** of.',
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
      'let { runningMad } = import(vector);\nrunningMad([1, 2, 3])',
      'let { runningMad } = import(vector);\nrunningMad([1, 2, -3])',
    ],
    seeAlso: ['vector.mad', 'vector.movingMad', 'vector.centeredMovingMad'],
  },
  'medad': {
    category: 'vector',
    description: 'Returns the **median absolute deviation** of all elements in the `vector`.',
    returns: {
      type: 'number',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **median absolute deviation** of.',
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
      'let { medad } = import(vector);\nmedad([1, 2, 3])',
      'let { medad } = import(vector);\nmedad([1, 2, -3])',
    ],
    seeAlso: ['vector.movingMedad', 'vector.centeredMovingMedad', 'vector.runningMedad', 'vector.mad', 'vector.median', 'vector.iqr'],
  },
  'movingMedad': {
    category: 'vector',
    description: 'Returns the **moving median absolute deviation** of the `vector` with a given window size.',
    returns: {
      type: 'vector',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **moving median absolute deviation** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the moving window.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
    ],
    examples: [
      'let { movingMedad } = import(vector);\nmovingMedad([1, 2, 3, 4, 5], 3)',
      'let { movingMedad } = import(vector);\nmovingMedad([1, 2, 3, 4, 5], 5)',
    ],
    seeAlso: ['vector.medad', 'vector.centeredMovingMedad', 'vector.runningMedad'],
  },
  'centeredMovingMedad': {
    category: 'vector',
    description: 'Returns the **centered moving median absolute deviation** of the `vector` with a given window size.',
    returns: {
      type: 'array',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **centered moving median absolute deviation** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the moving window.',
      },
      leftPadding: {
        type: 'number',
        description: 'Optional value to use for padding. Default is `null`.',
      },
      rightPadding: {
        type: 'number',
        description: 'Optional value to use for right padding. Default is `null`.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
          'rightPadding',
        ],
      },
    ],
    examples: [
      'let { centeredMovingMedad } = import(vector);\ncenteredMovingMedad([1, 2, 3, 4, 5], 3)',
      'let { centeredMovingMedad } = import(vector);\ncenteredMovingMedad([1, 2, 3, 4, 5], 5)',
    ],
    seeAlso: ['vector.medad', 'vector.movingMedad', 'vector.runningMedad'],
  },
  'runningMedad': {
    category: 'vector',
    description: 'Returns the **running median absolute deviation** of the `vector`.',
    returns: {
      type: 'vector',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **running median absolute deviation** of.',
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
      'let { runningMedad } = import(vector);\nrunningMedad([1, 2, 3])',
      'let { runningMedad } = import(vector);\nrunningMedad([1, 2, -3])',
    ],
    seeAlso: ['vector.medad', 'vector.movingMedad', 'vector.centeredMovingMedad'],
  },
  'giniCoefficient': {
    category: 'vector',
    description: 'Returns the **gini coefficient** of all elements in the `vector`.',
    returns: {
      type: 'number',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **gini coefficient** of.',
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
      'let { giniCoefficient } = import(vector);\nginiCoefficient([1, 2, 3])',
      'let { giniCoefficient } = import(vector);\nginiCoefficient([1, 1, 3])',
    ],
    seeAlso: ['vector.movingGiniCoefficient', 'vector.centeredMovingGiniCoefficient', 'vector.runningGiniCoefficient', 'vector.entropy'],
  },
  'movingGiniCoefficient': {
    category: 'vector',
    description: 'Returns the **moving gini coefficient** of the `vector` with a given window size.',
    returns: {
      type: 'vector',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **moving gini coefficient** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the moving window.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
    ],
    examples: [
      'let { movingGiniCoefficient } = import(vector);\nmovingGiniCoefficient([1, 2, 3], 2)',
      'let { movingGiniCoefficient } = import(vector);\nmovingGiniCoefficient([1, 1, 3], 2)',
    ],
    seeAlso: ['vector.giniCoefficient', 'vector.centeredMovingGiniCoefficient', 'vector.runningGiniCoefficient'],
  },
  'centeredMovingGiniCoefficient': {
    category: 'vector',
    description: 'Returns the **centered moving gini coefficient** of the `vector` with a given window size.',
    returns: {
      type: 'array',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **centered moving gini coefficient** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the moving window.',
      },
      leftPadding: {
        type: 'number',
        description: 'Optional value to use for padding. Default is `null`.',
      },
      rightPadding: {
        type: 'number',
        description: 'Optional value to use for right padding. Default is `null`.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
          'rightPadding',
        ],
      },
    ],
    examples: [
      'let { centeredMovingGiniCoefficient } = import(vector);\ncenteredMovingGiniCoefficient([1, 2, 3], 2)',
      'let { centeredMovingGiniCoefficient } = import(vector);\ncenteredMovingGiniCoefficient([1, 1, 3], 2)',
    ],
    seeAlso: ['vector.giniCoefficient', 'vector.movingGiniCoefficient', 'vector.runningGiniCoefficient'],
  },
  'runningGiniCoefficient': {
    category: 'vector',
    description: 'Returns the **running gini coefficient** of the `vector`.',
    returns: {
      type: 'array',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **running gini coefficient** of.',
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
      'let { runningGiniCoefficient } = import(vector);\nrunningGiniCoefficient([1, 2, 3])',
      'let { runningGiniCoefficient } = import(vector);\nrunningGiniCoefficient([1, 1, 3])',
    ],
    seeAlso: ['vector.giniCoefficient', 'vector.movingGiniCoefficient', 'vector.centeredMovingGiniCoefficient'],
  },
  'entropy': {
    category: 'vector',
    description: 'Calculates the **entropy** of a `vector`. The entropy is a measure of the uncertainty associated with a random variable.',
    returns: {
      type: 'number',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **entropy** of. Minimum length is 1.',
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
      'let { entropy } = import(vector);\nentropy([1, 1, 2, 3, 3, 3])',
      'let { entropy } = import(vector);\nentropy([1, 2, 3])',
      'let { entropy } = import(vector);\nentropy([1, 2, 2, 3])',
      'let { entropy } = import(vector);\nentropy([0])',
      'let { entropy } = import(vector);\nentropy([1])',
      'let { entropy } = import(vector);\nentropy([1, 2])',
    ],
    seeAlso: ['vector.movingEntropy', 'vector.centeredMovingEntropy', 'vector.runningEntropy', 'vector.giniCoefficient'],
  },
  'movingEntropy': {
    category: 'vector',
    description: 'Calculates the **moving entropy** of a `vector` with a given window size.',
    returns: {
      type: 'vector',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **moving entropy** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the moving window.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
    ],
    examples: [
      'let { movingEntropy } = import(vector);\nmovingEntropy([1, 1, 2, 3, 3, 3], 4)',
      'let { movingEntropy } = import(vector);\nmovingEntropy([1, 1, 2, 3, 3, 3], 3)',
      'let { movingEntropy } = import(vector);\nmovingEntropy([1, 2], 2)',
    ],
    seeAlso: ['vector.entropy', 'vector.centeredMovingEntropy', 'vector.runningEntropy'],
  },
  'centeredMovingEntropy': {
    category: 'vector',
    description: 'Calculates the **centered moving entropy** of a `vector` with a given window size.',
    returns: {
      type: 'number',
      array: true,
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **centered moving entropy** of.',
      },
      windowSize: {
        type: 'integer',
        description: 'The size of the moving window.',
      },
      leftPadding: {
        type: 'number',
        description: 'Optional value to use for padding. Default is `null`.',
      },
      rightPadding: {
        type: 'number',
        description: 'Optional value to use for right padding. Default is `null`.',
      },
      a: {
        type: 'vector',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'windowSize',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
        ],
      },
      {
        argumentNames: [
          'vector',
          'windowSize',
          'leftPadding',
          'rightPadding',
        ],
      },
    ],
    examples: [
      'let { centeredMovingEntropy } = import(vector);\ncenteredMovingEntropy([1, 1, 2, 3, 3, 3], 4)',
      'let { centeredMovingEntropy } = import(vector);\ncenteredMovingEntropy([1, 1, 2, 3, 3, 3], 3)',
      'let { centeredMovingEntropy } = import(vector);\ncenteredMovingEntropy([1, 2], 2)',
    ],
    seeAlso: ['vector.entropy', 'vector.movingEntropy', 'vector.runningEntropy'],
  },
  'runningEntropy': {
    category: 'vector',
    description: 'Calculates the **running entropy** of a `vector`.',
    returns: {
      type: 'vector',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to calculate the **running entropy** of.',
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
      'let { runningEntropy } = import(vector);\nrunningEntropy([1, 1, 2, 3, 3, 3])',
      'let { runningEntropy } = import(vector);\nrunningEntropy([1, 2])',
    ],
    seeAlso: ['vector.entropy', 'vector.movingEntropy', 'vector.centeredMovingEntropy'],
  },
  'isMonotonic': {
    category: 'vector',
    description: 'Checks if a vector is monotonic.',
    returns: {
      type: 'boolean',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The vector to check.',
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
      'let { isMonotonic } = import(vector);\nisMonotonic([1, 2, 3])',
      'let { isMonotonic } = import(vector);\nisMonotonic([1, 2, 2, 3])',
      'let { isMonotonic } = import(vector);\nisMonotonic([3, 2, 1])',
      'let { isMonotonic } = import(vector);\nisMonotonic([3, 2, 1, 1])',
      'let { isMonotonic } = import(vector);\nisMonotonic([3, 2, 1, 2])',
      'let { isMonotonic } = import(vector);\nisMonotonic([1])',
      'let { isMonotonic } = import(vector);\nisMonotonic([])',
    ],
    seeAlso: ['vector.isStrictlyMonotonic', 'vector.isIncreasing', 'vector.isDecreasing'],
  },
  'isStrictlyMonotonic': {
    category: 'vector',
    description: 'Checks if a vector is strictly monotonic.',
    returns: {
      type: 'boolean',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The vector to check.',
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
      'let { isStrictlyMonotonic } = import(vector);\nisStrictlyMonotonic([1, 2, 3])',
      'let { isStrictlyMonotonic } = import(vector);\nisStrictlyMonotonic([1, 2, 2, 3])',
      'let { isStrictlyMonotonic } = import(vector);\nisStrictlyMonotonic([3, 2, 1])',
      'let { isStrictlyMonotonic } = import(vector);\nisStrictlyMonotonic([3, 2, 1, 1])',
      'let { isStrictlyMonotonic } = import(vector);\nisStrictlyMonotonic([3, 2, 1, 2])',
      'let { isStrictlyMonotonic } = import(vector);\nisStrictlyMonotonic([1])',
      'let { isStrictlyMonotonic } = import(vector);\nisStrictlyMonotonic([])',
    ],
    seeAlso: ['vector.isMonotonic', 'vector.isStrictlyIncreasing', 'vector.isStrictlyDecreasing'],
  },
  'isIncreasing': {
    category: 'vector',
    description: 'Checks if a vector is increasing.',
    returns: {
      type: 'boolean',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The vector to check.',
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
      'let { isIncreasing } = import(vector);\nisIncreasing([1, 2, 3])',
      'let { isIncreasing } = import(vector);\nisIncreasing([1, 2, 2, 3])',
      'let { isIncreasing } = import(vector);\nisIncreasing([3, 2, 1])',
      'let { isIncreasing } = import(vector);\nisIncreasing([3, 2, 1, 1])',
      'let { isIncreasing } = import(vector);\nisIncreasing([3, 2, 1, 2])',
      'let { isIncreasing } = import(vector);\nisIncreasing([1])',
      'let { isIncreasing } = import(vector);\nisIncreasing([])',
    ],
    seeAlso: ['vector.isStrictlyIncreasing', 'vector.isDecreasing', 'vector.isStrictlyDecreasing', 'vector.isMonotonic'],
  },
  'isDecreasing': {
    category: 'vector',
    description: 'Checks if a vector is decreasing.',
    returns: {
      type: 'boolean',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The vector to check.',
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
      'let { isDecreasing } = import(vector);\nisDecreasing([1, 2, 3])',
      'let { isDecreasing } = import(vector);\nisDecreasing([1, 2, 2, 3])',
      'let { isDecreasing } = import(vector);\nisDecreasing([3, 2, 1])',
      'let { isDecreasing } = import(vector);\nisDecreasing([3, 2, 1, 1])',
      'let { isDecreasing } = import(vector);\nisDecreasing([3, 2, 1, 2])',
      'let { isDecreasing } = import(vector);\nisDecreasing([1])',
      'let { isDecreasing } = import(vector);\nisDecreasing([])',
    ],
    seeAlso: ['vector.isStrictlyDecreasing', 'vector.isIncreasing', 'vector.isStrictlyIncreasing', 'vector.isMonotonic'],
  },
  'isStrictlyIncreasing': {
    category: 'vector',
    description: 'Checks if a vector is strictly increasing.',
    returns: {
      type: 'boolean',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The vector to check.',
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
      'let { isStrictlyIncreasing } = import(vector);\nisStrictlyIncreasing([1, 2, 3])',
      'let { isStrictlyIncreasing } = import(vector);\nisStrictlyIncreasing([1, 2, 2, 3])',
      'let { isStrictlyIncreasing } = import(vector);\nisStrictlyIncreasing([3, 2, 1])',
      'let { isStrictlyIncreasing } = import(vector);\nisStrictlyIncreasing([3, 2, 1, 1])',
      'let { isStrictlyIncreasing } = import(vector);\nisStrictlyIncreasing([3, 2, 1, 2])',
      'let { isStrictlyIncreasing } = import(vector);\nisStrictlyIncreasing([1])',
      'let { isStrictlyIncreasing } = import(vector);\nisStrictlyIncreasing([])',
    ],
    seeAlso: ['vector.isIncreasing', 'vector.isDecreasing', 'vector.isStrictlyDecreasing', 'vector.isStrictlyMonotonic'],
  },
  'isStrictlyDecreasing': {
    category: 'vector',
    description: 'Checks if a vector is strictly decreasing.',
    returns: {
      type: 'boolean',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The vector to check.',
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
      'let { isStrictlyDecreasing } = import(vector);\nisStrictlyDecreasing([1, 2, 3])',
      'let { isStrictlyDecreasing } = import(vector);\nisStrictlyDecreasing([1, 2, 2, 3])',
      'let { isStrictlyDecreasing } = import(vector);\nisStrictlyDecreasing([3, 2, 1])',
      'let { isStrictlyDecreasing } = import(vector);\nisStrictlyDecreasing([3, 2, 1, 1])',
      'let { isStrictlyDecreasing } = import(vector);\nisStrictlyDecreasing([3, 2, 1, 2])',
      'let { isStrictlyDecreasing } = import(vector);\nisStrictlyDecreasing([1])',
      'let { isStrictlyDecreasing } = import(vector);\nisStrictlyDecreasing([])',
    ],
    seeAlso: ['vector.isIncreasing', 'vector.isStrictlyIncreasing', 'vector.isDecreasing', 'vector.isStrictlyMonotonic'],
  },
  'mode': {
    category: 'vector',
    description: 'Returns the mode of all elements in the vector.',
    returns: {
      type: 'number',
      array: true,
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The vector to calculate the mode of.',
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
      'let { mode } = import(vector);\nmode([1, 2, 3])',
      'let { mode } = import(vector);\nmode([1, 2, -3, 1])',
      'let { mode } = import(vector);\nmode([2, 2, 3, 3, 4])',
      'let { mode } = import(vector);\nmode([2, 2, 3, 3])',
      'let { mode } = import(vector);\nmode([1, 2, 3, 2, 1, 2])',
    ],
    seeAlso: ['vector.mean', 'vector.median'],
  },
  'minIndex': {
    category: 'vector',
    description: 'Returns the index of the minimum value of all elements in the vector.',
    returns: {
      type: 'integer',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'Non emtpy vector to calculate the minimum index of.',
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
      'let { minIndex } = import(vector);\nminIndex([1, 2, 3])',
      'let { minIndex } = import(vector);\nminIndex([1, 1, 2, 3, 3])',
      'let { minIndex } = import(vector);\nminIndex([1, 2, -3])',
      'let { minIndex } = import(vector);\nminIndex([1, 2, 3, 4])',
      'let { minIndex } = import(vector);\nminIndex([1, 2, -3, 4])',
    ],
    seeAlso: ['vector.maxIndex', 'min'],
  },
  'maxIndex': {
    category: 'vector',
    description: 'Returns the index of the maximum value of all elements in the vector.',
    returns: {
      type: 'integer',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'Non emtpy vector to calculate the maximum index of.',
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
      'let { maxIndex } = import(vector);\nmaxIndex([1, 2, 3])',
      'let { maxIndex } = import(vector);\nmaxIndex([1, 1, 2, 3, 3])',
      'let { maxIndex } = import(vector);\nmaxIndex([1, 2, -3])',
      'let { maxIndex } = import(vector);\nmaxIndex([1, 2, 3, 4])',
      'let { maxIndex } = import(vector);\nmaxIndex([1, 2, -3, 4])',
    ],
    seeAlso: ['vector.minIndex', 'max'],
  },
  'sortIndices': {
    category: 'vector',
    description: 'Returns the indices of the elements in the vector sorted in ascending order.',
    returns: {
      type: 'vector',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'Non emtpy vector to calculate the sorted indices of.',
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
      'let { sortIndices } = import(vector);\nsortIndices([1, 2, 3])',
      'let { sortIndices } = import(vector);\nsortIndices([1, 1, 2, 3, 3])',
      'let { sortIndices } = import(vector);\nsortIndices([1, 2, -3])',
      'let { sortIndices } = import(vector);\nsortIndices([1, 2, 3, 4])',
      'let { sortIndices } = import(vector);\nsortIndices([1, 2, -3, 4])',
    ],
    seeAlso: ['sort'],
  },
  'countValues': {
    category: 'vector',
    description: 'Counts the number of occurrences of each value in the vector.',
    returns: {
      type: 'number',
      array: true,
    },
    args: {
      vector: {
        type: 'vector',
        description: 'Vector to count the values of.',
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
      'let { countValues } = import(vector);\ncountValues([1, 2, 3])',
      'let { countValues } = import(vector);\ncountValues([1, 1, 2, 3, 3])',
      'let { countValues } = import(vector);\ncountValues([1, 2, -3])',
      'let { countValues } = import(vector);\ncountValues([1, 2, 2, 1, 3, 2, 4, 2, 1, 2, 2, 1, 3, 2, 4])',
    ],
    seeAlso: ['sequence.frequencies', 'vector.bincount'],
  },
  'linspace': {
    category: 'vector',
    description: 'Generates a vector of evenly spaced numbers between two values.',
    returns: {
      type: 'number',
      array: true,
    },
    args: {
      start: {
        type: 'number',
        description: 'The starting value.',
      },
      stop: {
        type: 'number',
        description: 'The ending value.',
      },
      n: {
        type: 'integer',
        description: 'The number of values to generate.',
      },
    },
    variants: [
      {
        argumentNames: [
          'start',
          'stop',
          'n',
        ],
      },
    ],
    examples: [
      'let { linspace } = import(vector);\nlinspace(0, 10, 6)',
      'let { linspace } = import(vector);\nlinspace(10, 20, 25)',
    ],
    seeAlso: [
      'range',
    ],
  },
  'cumsum': {
    category: 'vector',
    description: 'Calculates the cumulative sum of a vector.',
    returns: {
      type: 'number',
      array: true,
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The vector to calculate the cumulative sum of.',
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
      'let { cumsum } = import(vector);\ncumsum([1, 2, 3])',
      'let { cumsum } = import(vector);\ncumsum([1, 2, -3])',
      'let { cumsum } = import(vector);\ncumsum([])',
    ],
    seeAlso: ['vector.cumprod', 'vector.sum', 'vector.runningSum'],
  },
  'cumprod': {
    category: 'vector',
    description: 'Calculates the cumulative product of a vector.',
    returns: {
      type: 'number',
      array: true,
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The vector to calculate the cumulative product of.',
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
      'let { cumprod } = import(vector);\ncumprod([1, 2, 3])',
      'let { cumprod } = import(vector);\ncumprod([1, 2, -3, 0, 10])',
      'let { cumprod } = import(vector);\ncumprod([])',
    ],
    seeAlso: ['vector.cumsum', 'vector.prod', 'vector.runningProd'],
  },
  'quartiles': {
    category: 'vector',
    description: 'Calculates the quartiles of a vector. Returns an array containing the first, second (median), and third quartiles.',
    returns: {
      type: 'number',
      array: true,
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The vector to calculate the quartiles of. Minimum length is 4.',
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
      'let { quartiles } = import(vector);\nquartiles([1, 2, 3, 4])',
      'let { quartiles } = import(vector);\nquartiles([5, 4, 3, 2, 1, 2, 3, 4, 5])',
      'let { quartiles } = import(vector);\nquartiles(range(1, 1000))',
      'let { quartiles } = import(vector);\nquartiles(map(range(1000), -> 1e6 / ($ + 1) ^ 2))',
      'let { quartiles } = import(vector);\nlet { ln } = import(math);\nquartiles(map(range(1000), -> ln($ + 1)))',
    ],
    seeAlso: ['vector.percentile', 'vector.quantile', 'vector.median', 'vector.iqr'],
  },
  'percentile': {
    category: 'vector',
    description: 'Calculates the percentile of a vector. Returns the value at the specified percentile.',
    returns: {
      type: 'number',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The non empty vector to calculate the percentile of.',
      },
      percentile: {
        type: 'number',
        description: 'The percentile to calculate. Must be between 0 and 1.',
      },
      a: {
        type: 'number',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'percentile',
        ],
      },
    ],
    examples: [
      'let { percentile } = import(vector);\npercentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 35)',
      'let { percentile } = import(vector);\npercentile(range(100) ^ 0.5, 0)',
      'let { percentile } = import(vector);\npercentile(range(100) ^ 0.5, 10)',
      'let { percentile } = import(vector);\npercentile(range(100) ^ 0.5, 20)',
      'let { percentile } = import(vector);\npercentile(range(100) ^ 0.5, 30)',
      'let { percentile } = import(vector);\npercentile(range(100) ^ 0.5, 40)',
      'let { percentile } = import(vector);\npercentile(range(100) ^ 0.5, 50)',
      'let { percentile } = import(vector);\npercentile(range(100) ^ 0.5, 60)',
      'let { percentile } = import(vector);\npercentile(range(100) ^ 0.5, 70)',
      'let { percentile } = import(vector);\npercentile(range(100) ^ 0.5, 80)',
      'let { percentile } = import(vector);\npercentile(range(100) ^ 0.5, 90)',
      'let { percentile } = import(vector);\npercentile(range(100) ^ 0.5, 100)',
    ],
    seeAlso: ['vector.quantile', 'vector.quartiles', 'vector.median', 'vector.ecdf', 'vector.winsorize'],
  },
  'quantile': {
    category: 'vector',
    description: 'Calculates the quantile of a vector. Returns the value at the specified quantile.',
    returns: {
      type: 'number',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The non empty vector to calculate the quantile of.',
      },
      quantile: {
        type: 'number',
        description: 'The quantile to calculate. Must be between 0 and 1.',
      },
      a: {
        type: 'number',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'quantile',
        ],
      },
    ],
    examples: [
      'let { quantile } = import(vector);\nquantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.35)',
      'let { quantile } = import(vector);\nquantile(range(100) ^ 0.5, 0)',
      'let { quantile } = import(vector);\nquantile(range(100) ^ 0.5, 0.1)',
      'let { quantile } = import(vector);\nquantile(range(100) ^ 0.5, 0.2)',
      'let { quantile } = import(vector);\nquantile(range(100) ^ 0.5, 0.3)',
      'let { quantile } = import(vector);\nquantile(range(100) ^ 0.5, 0.4)',
      'let { quantile } = import(vector);\nquantile(range(100) ^ 0.5, 0.5)',
      'let { quantile } = import(vector);\nquantile(range(100) ^ 0.5, 0.6)',
      'let { quantile } = import(vector);\nquantile(range(100) ^ 0.5, 0.7)',
      'let { quantile } = import(vector);\nquantile(range(100) ^ 0.5, 0.8)',
      'let { quantile } = import(vector);\nquantile(range(100) ^ 0.5, 0.9)',
      'let { quantile } = import(vector);\nquantile(range(100) ^ 0.5, 1)',
    ],
    seeAlso: ['vector.percentile', 'vector.quartiles', 'vector.ecdf'],
  },
  'histogram': {
    category: 'vector',
    description: 'Creates a histogram from a numeric `array` by dividing the data range into the specified number of bins. Returns an `array` of `[binStart, binEnd, count]` tuples representing each bin\'s range and the number of values within it. Handles empty arrays, identical values, and properly places maximum values in the last bin.',
    returns: {
      type: 'array',
      array: true,
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The numeric array to create a histogram from.',
      },
      bins: {
        type: 'integer',
        description: 'The number of bins to divide the data range into.',
      },
      a: {
        type: 'number',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'bins',
        ],
      },
    ],
    examples: [
      'let { histogram } = import(vector);\nhistogram([1, 2, 2, 3, 2, 6, 4, 3, 2, 4, 1, 3, 2, 9], 3)',
      'let { histogram } = import(vector);\nhistogram([1, 2, 3, 4, 5], 5)',
      'let { histogram } = import(vector);\nhistogram([1, 2, 3, 4, 5], 10)',
      'let { histogram } = import(vector);\nhistogram([1, 2, 3, 4, 5], 1)',
    ],
    seeAlso: ['vector.bincount', 'vector.ecdf'],
  },
  'ecdf': {
    category: 'vector',
    description: 'Calculates the empirical cumulative distribution function value for a given threshold in a non empty dataset. Returns the proportion of values in the `array` that are less than or equal to the specified threshold.',
    returns: {
      type: 'number',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The numeric array to calculate the ECDF from.',
      },
      threshold: {
        type: 'number',
        description: 'The threshold value to calculate the ECDF for.',
      },
      a: {
        type: 'number',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'threshold',
        ],
      },
    ],
    examples: [
      'let { ecdf } = import(vector);\necdf([1, 2, 2, 3, 2, 6, 4, 3, 2, 4, 1, 3, 2, 9, 10, 12], 5)',
      'let { ecdf } = import(vector);\necdf([1, 2, 3, 4, 5], 3)',
      'let { ecdf } = import(vector);\necdf([1, 2, 3, 4, 5], 0)',
      'let { ecdf } = import(vector);\necdf([1, 2, 3, 4, 5], 10)',
      'let { ecdf } = import(vector);\necdf([1, 2, 3, 4, 5], 2)',
    ],
    seeAlso: ['vector.histogram', 'vector.percentile', 'vector.quantile'],
  },
  'isOutliers': {
    category: 'vector',
    description: 'Checks if the `vector` contains outliers based on the interquartile range (IQR) method. Returns `true` if outliers are present, `false` otherwise.',
    returns: {
      type: 'boolean',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to check for outliers.',
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
      'let { isOutliers } = import(vector);\nisOutliers([1, 2, 3])',
      'let { isOutliers } = import(vector);\nisOutliers([1, 2, -3])',
      'let { isOutliers } = import(vector);\nisOutliers([1, 2, 3, 2, 4, 120])',
    ],
    seeAlso: ['vector.outliers', 'vector.winsorize', 'vector.iqr'],
  },
  'outliers': {
    category: 'vector',
    description: 'Identifies outliers in the `vector` based on the interquartile range (IQR) method. Returns an array of outlier values.',
    returns: {
      type: 'number',
      array: true,
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The `vector` to check for outliers.',
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
      'let { outliers } = import(vector);\noutliers([1, 2, 3])',
      'let { outliers } = import(vector);\noutliers([1, 2, -3])',
      'let { outliers } = import(vector);\noutliers([1, 2, 3, 2, 4, 120])',
    ],
    seeAlso: ['vector.isOutliers', 'vector.winsorize', 'vector.iqr'],
  },
  'bincount': {
    category: 'vector',
    description: 'counts occurrences of each `integer` in a vector, returning an array where index `i` contains the count of value `i`, with optional **minimum size** and **weights parameters**.',
    returns: {
      type: 'vector',
    },
    args: {
      vector: {
        type: 'vector',
        description: 'The vector to count occurrences in.',
      },
      minSize: {
        type: 'integer',
        description: 'Optional minimum size of the output array.',
      },
      weights: {
        type: 'number',
        array: true,
        description: 'Optional weights for each element in the vector.',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
        ],
      },
      {
        argumentNames: [
          'vector',
          'minSize',
        ],
      },
      {
        argumentNames: [
          'vector',
          'minSize',
          'weights',
        ],
      },
    ],
    examples: [
      'let { bincount } = import(vector);\nbincount([1, 2, 3])',
      'let { bincount } = import(vector);\nbincount([1, 2, 2, 3, 3])',
    ],
    seeAlso: ['vector.countValues', 'vector.histogram'],
    hideOperatorForm: true,
  },
  'winsorize': {
    category: 'vector',
    description: 'Limits extreme values in a `vector` by replacing values below the **lower quantile** and above the **upper quantile** with the values at those quantiles. The function takes a `vector` of values and **quantile thresholds** (between 0 and 1), with the upper quantile. Winsorization reduces the influence of outliers while preserving the overall distribution shape, making statistical analyses more robust.',
    returns: {
      type: 'vector',
    },
    args: {
      'vector': {
        type: 'vector',
        description: 'The vector to winsorize.',
      },
      'lowerQuantile': {
        type: 'number',
        description: 'The lower quantile threshold (between 0 and 1).',
      },
      'upperQuantile': {
        type: 'number',
        description: 'Optional Upper quantile threshold (between 0 and 1). Defaults to `(1 - lowerQuantile)` if `lowerQuantile <= 0.5` otherwise `1`.',
      },
    },
    variants: [
      {
        argumentNames: [
          'vector',
          'lowerQuantile',
        ],
      },
      {
        argumentNames: [
          'vector',
          'lowerQuantile',
          'upperQuantile',
        ],
      },
    ],
    examples: [
      'let { winsorize } = import(vector);\nwinsorize([2, 5, 8, 10, 15, 18, 20, 35, 60, 100], 0.25)',
      'let { winsorize } = import(vector);\nwinsorize([2, 5, 8, 10, 15, 18, 20, 35, 60, 100], 0.25, 0.75)',
      'let { winsorize } = import(vector);\nwinsorize([2, 5, 8, 10, 15, 18, 20, 35, 60, 100], 0.25, 0.5)',
    ],
    seeAlso: ['vector.outliers', 'vector.isOutliers', 'vector.percentile'],
    hideOperatorForm: true,
  },
  'mse': {
    category: 'vector',
    description: 'Calculates the **Mean Squared Error (MSE)** between two vectors. Returns the average of the squared differences between corresponding elements.',
    returns: {
      type: 'number',
    },
    args: {
      a: {
        type: 'vector',
        description: 'The first vector.',
      },
      b: {
        type: 'vector',
        description: 'The second vector.',
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
      'let { mse } = import(vector);\nmse([1, 2, 3], [1, 2, 3])',
      'let { mse } = import(vector);\nmse([1, 2, 3], [4, 5, 6])',
      'let { mse } = import(vector);\nmse([1, 2, 3], [2, 2, 2])',
      'let { mse } = import(vector);\nmse([1, 2], [3, 3])',
      'let { mse } = import(vector);\nmse([1], [3])',
    ],
    seeAlso: ['vector.rmse', 'vector.mae', 'vector.smape'],
  },
  'rmse': {
    category: 'vector',
    description: 'Calculates the **Root Mean Squared Error (RMSE)** between two vectors. Returns the square root of the average of the squared differences between corresponding elements.',
    returns: {
      type: 'number',
    },
    args: {
      a: {
        type: 'vector',
        description: 'The first vector.',
      },
      b: {
        type: 'vector',
        description: 'The second vector.',
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
      'let { rmse } = import(vector);\nrmse([1, 2, 3], [1, 2, 3])',
      'let { rmse } = import(vector);\nrmse([1, 2, 3], [4, 5, 6])',
      'let { rmse } = import(vector);\nrmse([1, 2, 3], [2, 2, 2])',
      'let { rmse } = import(vector);\nrmse([1, 2], [3, 3])',
      'let { rmse } = import(vector);\nrmse([1], [3])',
    ],
    seeAlso: ['vector.mse', 'vector.mae', 'vector.smape'],
  },
  'mae': {
    category: 'vector',
    description: 'Calculates the **Mean Absolute Error (MAE)** between two vectors. Returns the average of the absolute differences between corresponding elements.',
    returns: {
      type: 'number',
    },
    args: {
      a: {
        type: 'vector',
        description: 'The first vector.',
      },
      b: {
        type: 'vector',
        description: 'The second vector.',
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
      'let { mae } = import(vector);\nmae([1, 2, 3], [1, 2, 3])',
      'let { mae } = import(vector);\nmae([1, 2, 3], [4, 5, 6])',
      'let { mae } = import(vector);\nmae([1, 2, 3], [2, 2, 2])',
      'let { mae } = import(vector);\nmae([1, 2], [3, 3])',
      'let { mae } = import(vector);\nmae([1], [3])',
    ],
    seeAlso: ['vector.mse', 'vector.rmse', 'vector.smape'],
  },
  'smape': {
    category: 'vector',
    description: 'Calculates the **Symmetric Mean Absolute Percentage Error (SMAPE)** between two vectors. Returns the average of the absolute percentage differences between corresponding elements.',
    returns: {
      type: 'number',
    },
    args: {
      a: {
        type: 'vector',
        description: 'The first vector.',
      },
      b: {
        type: 'vector',
        description: 'The second vector.',
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
      'let { smape } = import(vector);\nsmape([1, 2, 3], [1, 2, 3])',
      'let { smape } = import(vector);\nsmape([1, 2, 3], [4, 5, 6])',
      'let { smape } = import(vector);\nsmape([1, 2, 3], [2, 2, 2])',
      'let { smape } = import(vector);\nsmape([1, 2], [3, 3])',
      'let { smape } = import(vector);\nsmape([1], [3])',
    ],
    seeAlso: ['vector.mse', 'vector.rmse', 'vector.mae'],
  },
}
