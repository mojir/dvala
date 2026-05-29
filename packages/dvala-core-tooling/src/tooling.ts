/**
 * Full tooling bundle entry — language service, typechecker, analysis helpers,
 * and completion-builder utilities for IDE/LS packages.
 *
 * This file is the rolldown input for `dist/tooling.js` / `dist/tooling.esm.js`
 * and is the target of the `@mojir/dvala/tooling` subpath export.
 *
 * The standalone functions shared with the minimal bundle live in
 * `./standaloneTooling` to keep `reference/index.ts` out of the minimal bundle
 * entry (`src/index.ts`).
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
export { polishSymbolCharacterClass, polishSymbolFirstCharacterClass } from './symbolPatterns'
export { splitSegments } from './parser/subParsers/parseTemplateString'

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
export { expandMacros } from './ast/expandMacros'
export type { MacroEvalDvalaFactory, MacroEvalRunner, MacroExpandOptions } from './ast/expandMacros'
export { treeShake } from './ast/treeShake'

// REPL utilities
export { applyReplBinding, executeReplLine } from './shared/replCore'
export type { ReplBinding } from './shared/replCore'
