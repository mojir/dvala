import { calcSampleVariance, calcVariance } from '../calcVariance'
import type { ReductionFunctionDefinition } from '.'

export const varianceReductionFunction: ReductionFunctionDefinition<'variance'> = {
  variance: vector => calcVariance(vector),
}

export const sampleVarianceReductionFunction: ReductionFunctionDefinition<'sampleVariance'> = {
  'sampleVariance': vector => calcSampleVariance(vector),
  'minLength': 2,
}
