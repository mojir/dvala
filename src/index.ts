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
export { type BuiltinNormalExpressions } from '@mojir/dvala-engine'
export { type Arity } from '@mojir/dvala-types'
export { type DvalaFunction } from '@mojir/dvala-types'
export type { Context } from '@mojir/dvala-engine'
export type { Ast } from '@mojir/dvala-types'
export type { SourceCodeInfo } from '@mojir/dvala-types'
export type { Token, TokenType } from '@mojir/dvala-core-tooling'
export { normalExpressionKeys, specialExpressionKeys } from '@mojir/dvala-engine'
export type { DvalaModule } from '@mojir/dvala-engine'
export type { Any } from '@mojir/dvala-types'
export { fromJS, toJS } from '@mojir/dvala-engine'
export type { DvalaBundle } from './bundler/interface'
export { isDvalaBundle } from './bundler/interface'
export { type DvalaError, isDvalaError, type DvalaErrorJSON } from '@mojir/dvala-types'
export { isGrid, isMatrix, isVector } from '@mojir/dvala-types'
export { isAtom, isEffect, isRegularExpression } from '@mojir/dvala-types'
export { asUnknownRecord } from '@mojir/dvala-types'
export type { UnknownRecord } from '@mojir/dvala-types'
export type { ExampleEntry } from '@mojir/dvala-engine'
export { prettyPrint } from '@mojir/dvala-core-tooling'
export type { AutoCompleter, AutoCompleterParams } from '@mojir/dvala-core-tooling'

// Effects — standalone resume/retrigger functions and types
export { resume } from '@mojir/dvala-engine'
export type { ResumeOptions } from '@mojir/dvala-engine'
export { retrigger } from '@mojir/dvala-engine'
export type { RetriggerOptions } from '@mojir/dvala-engine'
export { hostHandler } from '@mojir/dvala-engine'
export { extractCheckpointSnapshots } from '@mojir/dvala-engine'
export type {
  EffectContext,
  EffectHandler,
  HandlerRegistration,
  Handlers,
  RunResult,
  Snapshot,
} from '@mojir/dvala-engine'
export { standardEffectNames } from '@mojir/dvala-engine'

// Factory API
export { createDvala } from './createDvala'
export type { CreateDvalaOptions, DvalaRunOptions, DvalaRunAsyncOptions, DvalaRunner } from './createDvala'
export type { FileResolver } from '@mojir/dvala-engine'
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
} from '@mojir/dvala-core-tooling'
export type { TokenStream } from '@mojir/dvala-core-tooling'
