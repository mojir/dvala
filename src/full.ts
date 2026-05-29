/* v8 ignore next 1000 */
// Full entry point: re-exports everything from the minimal entry plus
// all modules, reference data, and API helpers.

import { initReferenceData } from '@mojir/dvala-core-tooling'

export * from './index'

initReferenceData()

// All built-in modules (convenience re-export)
export { allBuiltinModules } from '@mojir/dvala-core-tooling'

// Individual module re-exports
export { assertModule } from '@mojir/dvala-engine'
export { gridModule } from '@mojir/dvala-engine'
export { vectorModule } from '@mojir/dvala-engine'
export { linearAlgebraModule } from '@mojir/dvala-engine'
export { matrixModule } from '@mojir/dvala-engine'
export { numberTheoryModule } from '@mojir/dvala-engine'
export { mathUtilsModule } from '@mojir/dvala-engine'
export { functionalUtilsModule } from '@mojir/dvala-engine'
export { bitwiseUtilsModule } from '@mojir/dvala-engine'
export { jsonModule } from '@mojir/dvala-engine'
export { macrosModule } from '@mojir/dvala-engine'
export { timeModule } from '@mojir/dvala-engine'

// Reference data and types
export {
  apiReference,
  isCustomReference,
  isDatatypeReference,
  isFunctionReference,
  isPreludeReference,
  isShorthandReference,
} from '../reference'
export type {
  Argument,
  CommonReference,
  CustomReference,
  DatatypeReference,
  FunctionReference,
  PreludeReference,
  Reference,
  ShorthandReference,
} from '../reference'
export type { ApiName, DatatypeName, FunctionName, PreludeName, ShorthandName } from '../reference/api'
export { isApiName, isDataType } from '../reference/api'
