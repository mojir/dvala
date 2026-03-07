/* v8 ignore next 1000 */
// Minimal entry point: core types, type guards, and factory API.
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
export type { DvalaModule } from './builtin/modules/interface'
export type { DvalaBundle } from './bundler/interface'
export { isDvalaBundle } from './bundler/interface'
export { type DvalaError, isDvalaError } from './errors'
export { isGrid, isMatrix, isVector } from './typeGuards/annotatedCollections'
export type { AutoCompleter, AutoCompleterParams } from './AutoCompleter/AutoCompleter'

// Effects — standalone functions and types
export { run, runSync, resume } from './effects'
export type { EffectContext, EffectHandler, Handlers, RunResult, RunOptions, RunSyncOptions, SyncEffectContext, SyncEffectHandler, SyncHandlers, Snapshot, ResumeOptions } from './effects'

// Factory API
export { createDvala } from './createDvala'
export type { CreateDvalaOptions, DvalaRunOptions, DvalaRunAsyncOptions, DvalaRunner } from './createDvala'

// Standalone tooling
export { tokenizeSource, parseTokenStream, transformSymbols, untokenize, getUndefinedSymbols, getAutoCompleter } from './tooling'
export type { TokenStream } from './tooling'
