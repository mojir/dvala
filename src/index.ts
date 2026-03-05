/* v8 ignore next 1000 */
// Minimal entry point: core Dvala class, types, and type guards.
// No modules or reference data included — import from '@mojir/dvala/full'
// for the complete bundle, or import individual modules separately.
export {
  isBuiltinFunction,
  isDvalaFunction,
  asDvalaFunction,
  assertDvalaFunction,
  isUserDefinedFunction,
  asUserDefinedFunction,
  assertUserDefinedFunction,
} from './typeGuards/dvalaFunction'
export { type Arity } from './builtin/interface'
export { type DvalaFunction } from './parser/types'
export type { Context } from './evaluator/interface'
export type { Ast } from './parser/types'
export type { SourceCodeInfo } from './tokenizer/token'
export type { Token, TokenType } from './tokenizer/token'
export { normalExpressionKeys, specialExpressionKeys } from './builtin'
export { Dvala } from './Dvala/Dvala'
export type { DvalaModule } from './builtin/modules/interface'
export type { DvalaBundle } from './bundler/interface'
export { isDvalaBundle } from './bundler/interface'
export { type DvalaError, isDvalaError } from './errors'
export type { ContextParams, FilePathParams, MinifyParams, PureParams, DvalaRuntimeInfo } from './Dvala/Dvala'
export { isGrid, isMatrix, isVector } from './typeGuards/annotatedCollections'
export type { AutoCompleter } from './AutoCompleter/AutoCompleter'

// Effects — standalone functions and types
export { run, runSync, resume } from './effects'
export type { EffectContext, EffectHandler, Handlers, RunResult, RunOptions, RunSyncOptions, Snapshot, ResumeOptions } from './effects'
