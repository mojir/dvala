import { calcMean } from '../calcMean'
import type { ReductionFunctionDefinition } from '.'

export const meanReductionFunction: ReductionFunctionDefinition<'mean'> = {
  mean: vector => calcMean(vector),
}

export const geometricMeanReductionFunction: ReductionFunctionDefinition<'geometricMean'> = {
  'geometricMean': vector => {
    if (vector.some(val => val < 0)) {
      throw new Error('Geometric mean is not defined for non-positive numbers')
    }
    return Math.exp(vector.reduce((acc, val) => acc + Math.log(val), 0) / vector.length)
  },
}

export const harmonicMeanReductionFunction: ReductionFunctionDefinition<'harmonicMean'> = {
  'harmonicMean': vector => vector.length / vector.reduce((acc, val) => acc + 1 / val, 0),
}
