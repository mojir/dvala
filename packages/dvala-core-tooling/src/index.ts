// Internal-first scaffold: keep behavior in root sources and expose a thin boundary shim.
export * from '../../../src/tooling'

// Parser / tokenizer primitives
export { parseToAst } from '../../../src/parser'
export { minifyTokenStream } from '../../../src/tokenizer/minifyTokenStream'

// Language service
export { WorkspaceIndex } from '../../../src/languageService/WorkspaceIndex'
export type { ResolveImport } from '../../../src/languageService/WorkspaceIndex'
export type { FileSymbols, SymbolDef, SymbolRef, ScopeRange } from '../../../src/languageService/types'

// Shared analysis helpers
export type { Position, Range, Diagnostic } from '../../../src/shared/types'
export type { CompletionItem } from '../../../src/shared/completionBuilder'
export {
  buildBuiltinCompletions,
  symbolDefToCompletion,
  referenceToCompletion,
} from '../../../src/shared/completionBuilder'
export { findCallContext } from '../../../src/shared/callContext'
export {
  buildParseDiagnostics,
  buildSymbolDiagnostics,
  buildTypeDiagnostics,
} from '../../../src/shared/diagnosticBuilder'
export { findTypeAtPosition, findTypeAtDefinition, formatHoverType } from '../../../src/shared/typeDisplay'

// Typechecker
export { typecheck, typecheckExpr } from '../../../src/typechecker/typecheck'
export type { TypeDiagnostic, TypecheckResult } from '../../../src/typechecker/typecheck'

// Modules
export { allBuiltinModules } from '../../../src/allModules'
