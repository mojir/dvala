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
} from '@mojir/dvala-types'
export { type BuiltinNormalExpressions } from './builtin/interface'
export { type Arity } from '@mojir/dvala-types'
export { type DvalaFunction } from '@mojir/dvala-types'
export type { Context } from './evaluator/interface'
export type { Ast } from '@mojir/dvala-types'
export type { SourceCodeInfo } from '@mojir/dvala-types'
export type { Token, TokenType } from './tokenizer/token'
export { normalExpressionKeys, specialExpressionKeys } from './builtin'
export type { DvalaModule } from './builtin/modules/interface'
export type { Any } from '@mojir/dvala-types'
export { fromJS, toJS } from './utils/interop'
export type { DvalaBundle } from './bundler/interface'
export { isDvalaBundle } from './bundler/interface'
export { type DvalaError, isDvalaError, type DvalaErrorJSON } from '@mojir/dvala-types'
export { isGrid, isMatrix, isVector } from '@mojir/dvala-types'
export { isAtom, isEffect, isRegularExpression } from '@mojir/dvala-types'
export { asUnknownRecord } from '@mojir/dvala-types'
export type { UnknownRecord } from '@mojir/dvala-types'
export type { ExampleEntry } from './builtin/interface'
export { prettyPrint } from './prettyPrint'
export type { AutoCompleter, AutoCompleterParams } from './AutoCompleter/AutoCompleter'

// Effects — standalone resume/retrigger functions and types
export { resume } from './resume'
export type { ResumeOptions } from './resume'
export { retrigger } from './retrigger'
export type { RetriggerOptions } from './retrigger'
export { hostHandler } from './evaluator/effectTypes'
export { extractCheckpointSnapshots } from './evaluator/suspension'
export type {
  EffectContext,
  EffectHandler,
  HandlerRegistration,
  Handlers,
  RunResult,
  Snapshot,
} from './evaluator/effectTypes'
export { standardEffectNames } from './evaluator/standardEffects'

// Factory API
export { createDvala } from './createDvala'
export type { CreateDvalaOptions, DvalaRunOptions, DvalaRunAsyncOptions, DvalaRunner } from './createDvala'
export type { FileResolver } from './evaluator/ContextStack'
export { createPackageRuntimeBridge } from './runtime/createPackageRuntimeBridge'
export type { CreatePackageRuntimeBridgeOptions, RuntimeArtifactBridge } from './runtime/createPackageRuntimeBridge'

// Standalone tooling
export {
  tokenizeSource,
  parseTokenStream,
  untokenize,
  getUndefinedSymbols,
  getAutoCompleter,
  formatSource,
} from './standaloneTooling'
export type { TokenStream } from './standaloneTooling'
