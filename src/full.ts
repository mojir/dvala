/* v8 ignore next 1000 */
// Full entry point: re-exports everything from the minimal entry plus
// all modules, reference data, and API helpers.

// Re-export everything from the minimal entry point
// Wire up reference data for the `doc` builtin function.
// In the minimal entry point (src/index.ts), this is not called,
// so `doc` gracefully returns empty strings for built-in functions.
import './initReferenceData'

export * from './index'

// All built-in modules (convenience re-export)
export { allBuiltinModules } from './allModules'

// Individual module re-exports
export { assertModule } from './builtin/modules/assertion'
export { gridModule } from './builtin/modules/grid'
export { vectorModule } from './builtin/modules/vector'
export { linearAlgebraModule } from './builtin/modules/linear-algebra'
export { matrixModule } from './builtin/modules/matrix'
export { numberTheoryModule } from './builtin/modules/number-theory'
export { mathUtilsModule } from './builtin/modules/math'
export { functionalUtilsModule } from './builtin/modules/functional'
export { bitwiseUtilsModule } from './builtin/modules/bitwise'
export { jsonModule } from './builtin/modules/json'
export { macrosModule } from './builtin/modules/macros'
export { timeModule } from './builtin/modules/time'

// Reference data and types
export { apiReference, isCustomReference, isDatatypeReference, isFunctionReference, isPreludeReference, isShorthandReference } from '../reference'
export type { Argument, CommonReference, CustomReference, DatatypeReference, FunctionReference, PreludeReference, Reference, ShorthandReference } from '../reference'
export type { ApiName, DatatypeName, FunctionName, PreludeName, ShorthandName } from '../reference/api'
export { isApiName, isDataType } from '../reference/api'
