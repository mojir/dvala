/**
 * Public surface of `@mojir/dvala-core-tooling`: language service, typechecker,
 * formatter, parser/tokenizer, AutoCompleter, prettyPrint — every primitive
 * an IDE/LS package needs to operate on Dvala source.
 *
 * The standalone subset (no `reference/`-data dependency) lives in
 * `./standaloneTooling` so test-framework consumers can pull it without
 * dragging the reference catalogue.
 */

import type { TokenStream } from './tokenizer/tokenize'
import { minifyTokenStream } from './tokenizer/minifyTokenStream'
import { parseRecoverable } from './parser'
import type { RecoverableParseResult } from './parser'

export * from './standaloneTooling'

/**
 * Parse a token stream with error recovery.
 * Returns a partial AST (successfully parsed statements) and a list of errors.
 * Useful for language service features that need to work on broken files.
 */
export function parseTokenStreamRecoverable(tokenStream: TokenStream): RecoverableParseResult {
  const minified = minifyTokenStream(tokenStream, { removeWhiteSpace: true })
  return parseRecoverable(minified)
}

export { parseToCst } from './parser'
export { buildDocTree } from './formatter/cstFormat'

// Parser / tokenizer primitives (direct access for tooling consumers)
export { parse, parseToAst } from './parser'
export { tokenize } from './tokenizer/tokenize'
export { minifyTokenStream } from './tokenizer/minifyTokenStream'
export { isDvalaIdentifierName } from './tokenizer/identifierName'
export { polishSymbolCharacterClass, polishSymbolFirstCharacterClass } from './symbolPatterns'
export { splitSegments } from './parser/subParsers/parseTemplateString'
export { isSymbolicOperator } from './tokenizer/operators'

// Language service
export { WorkspaceIndex } from './languageService/WorkspaceIndex'
export type { ResolveImport } from './languageService/WorkspaceIndex'
export type { FileSymbols, SymbolDef, SymbolRef, ScopeRange } from './languageService/types'

// Shared analysis helpers
export type { Position, Range, Diagnostic } from './shared/types'
export type { CompletionItem } from './shared/completionBuilder'
export { buildBuiltinCompletions, symbolDefToCompletion, referenceToCompletion } from './shared/completionBuilder'
export { findCallContext } from './shared/callContext'
export { buildParseDiagnostics, buildSymbolDiagnostics, buildTypeDiagnostics } from './shared/diagnosticBuilder'
export { findTypeAtPosition, findTypeAtDefinition, formatHoverType } from './shared/typeDisplay'

// Typechecker
export { typecheck, typecheckExpr } from './typechecker/typecheck'
export type { TypeDiagnostic, TypecheckResult } from './typechecker/typecheck'

// Modules + AST utilities
export { allBuiltinModules } from './allModules'
export { initReferenceData } from './initReferenceData'
export { expandMacros } from './ast/expandMacros'
export type { MacroEvalDvalaFactory, MacroEvalRunner, MacroExpandOptions } from './ast/expandMacros'
export { treeShake } from './ast/treeShake'

// AutoCompleter (class + types for IDE consumers)
export { AutoCompleter } from './AutoCompleter/AutoCompleter'
export type { AutoCompleterParams } from './AutoCompleter/AutoCompleter'

// Debugger (used by the host orchestrator + the vscode debug adapter)
export { Debugger } from './debugger/Debugger'
export type { DebugStoppedEvent } from './debugger/Debugger'
export { findNodeIdForLine, getNodeEndLine, getNodeFile, getNodeLine } from './debugger/SourceMapUtils'

// NOTE: nodeWorkspaceIndexer (loadFile, nodeResolveImport) is intentionally
// NOT re-exported here — it imports `node:fs`/`node:path` and would poison
// every browser-target consumer's bundle (Vite worker, playground iife) with
// unresolved node-built-ins that kill the worker at load time. Node-side
// consumers (vscode-dvala) import it directly from the file.

// Pretty printer (used by the host as a ContextStack capability, and by tools)
export { prettyPrint } from './prettyPrint'

// Token types + assertion helpers (host re-exports, bundlers, test inspectors)
export type { Token, TokenType } from './tokenizer/token'
export {
  assertEffectNameToken,
  asEffectNameToken,
  assertTemplateStringToken,
  asTemplateStringToken,
} from './tokenizer/token'

// REPL utilities
export { applyReplBinding, executeReplLine } from './shared/replCore'
export type { ReplBinding } from './shared/replCore'

// Host orchestrator — the public createDvala factory and the package-runtime
// bridge (`@mojir/dvala-runtime`-shape wrapper). These are the entry points
// for anyone running Dvala source through the TS implementation.
export { createDvala } from './host/createDvala'
export type {
  CreateDvalaOptions,
  DvalaCoverage,
  DvalaRunAsyncOptions,
  DvalaRunOptions,
  DvalaRunner,
} from './host/createDvala'
// `.dvala` union-coverage baseline (DVALA_COVERAGE=1) — read by the vitest dump hook + report.
export {
  dvalaSpanKey,
  getGlobalDvalaHits,
  isBuiltinDvalaPath,
  isGlobalDvalaCoverageEnabled,
} from './host/dvalaCoverage'
export { createPackageRuntimeBridge } from './host/runtime/createPackageRuntimeBridge'
export type {
  CreatePackageRuntimeBridgeOptions,
  RuntimeArtifactBridge,
} from './host/runtime/createPackageRuntimeBridge'

// Bundle artifact types + serializers (browser-safe). The `bundle()` file
// walker in ./bundler/index.ts imports `node:fs`/`node:path` and is NOT
// re-exported — Node-side consumers (CLI) import it directly from the file.
export { isDvalaBundle } from './bundler/interface'
export type { DvalaBundle } from './bundler/interface'
export { serializeBundle, deserializeBundle } from './bundler/serialize'
