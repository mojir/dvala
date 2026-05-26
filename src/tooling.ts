/**
 * Standalone tooling functions for tokenizing, parsing, and analysis.
 *
 * These are thin wrappers around internal utilities that do not require
 * a Dvala instance.
 */

import { builtin } from './builtin'
import { AutoCompleter } from './AutoCompleter/AutoCompleter'
import type { AutoCompleterParams } from './AutoCompleter/AutoCompleter'
import { standardEffectNames } from './evaluator/standardEffects'
import { createContextStack } from './evaluator/ContextStack'
import { getUndefinedSymbols as getUndefinedSymbolsInternal } from './getUndefinedSymbols'
import type { DvalaModule } from './builtin/modules/interface'
import { tokenize } from './tokenizer/tokenize'
import type { TokenStream } from './tokenizer/tokenize'
import { minifyTokenStream } from './tokenizer/minifyTokenStream'
import { parseRecoverable, parseToAst } from './parser'
import type { RecoverableParseResult } from './parser'
import type { Ast } from './parser/types'
import { untokenize } from './untokenizer'

export type { TokenStream }

/**
 * Tokenize a Dvala source string into a token stream.
 * Pass `debug: true` to capture source positions (needed for the debugger).
 */
export function tokenizeSource(source: string, debug = false, filePath?: string): TokenStream {
  return tokenize(source, debug, filePath)
}

/**
 * Parse a token stream into an AST.
 * The stream is automatically minified (whitespace removed) before parsing.
 */
export function parseTokenStream(tokenStream: TokenStream): Ast {
  const minified = minifyTokenStream(tokenStream, { removeWhiteSpace: true })
  return parseToAst(minified)
}

/**
 * Parse a token stream with error recovery.
 * Returns a partial AST (successfully parsed statements) and a list of errors.
 * Useful for language service features that need to work on broken files.
 */
export function parseTokenStreamRecoverable(tokenStream: TokenStream): RecoverableParseResult {
  const minified = minifyTokenStream(tokenStream, { removeWhiteSpace: true })
  return parseRecoverable(minified)
}

/**
 * Convert a token stream back to source code.
 */
export { untokenize }

/**
 * Get all undefined symbols in a Dvala program.
 *
 * @param source - Dvala source code
 * @param options - optional context
 * @param options.scope - host bindings to treat as defined
 * @param options.modules - modules to treat as available
 */
export function getUndefinedSymbols(
  source: string,
  options?: { scope?: Record<string, unknown>; modules?: DvalaModule[] },
): Set<string> {
  const modulesMap = options?.modules ? new Map(options.modules.map(m => [m.name, m])) : undefined
  // Build a globalContext from the scope so those symbols are treated as defined.
  const globalContext = options?.scope
    ? Object.fromEntries(Object.keys(options.scope).map(k => [k, { value: null }]))
    : undefined
  const contextStack = createContextStack({ globalContext }, modulesMap)
  const tokenStream = tokenize(source, false, undefined)
  const minified = minifyTokenStream(tokenStream, { removeWhiteSpace: true })
  const ast: Ast = parseToAst(minified)
  return getUndefinedSymbolsInternal(ast, contextStack, builtin)
}

/**
 * Create an auto-completer for the given program at the given cursor position.
 *
 * @param program - Full Dvala source code
 * @param position - Cursor position (character offset)
 * @param params - Optional params (bindings to include as suggestions)
 */
export function getAutoCompleter(program: string, position: number, params: AutoCompleterParams = {}): AutoCompleter {
  const effectNames = params.effectNames ? [...standardEffectNames, ...params.effectNames] : [...standardEffectNames]
  return new AutoCompleter(program, position, { ...params, effectNames })
}

export { format as formatSource } from './formatter/format'
export { parseToCst } from './parser'
export { buildDocTree } from './formatter/cstFormat'

// Parser / tokenizer primitives (direct access for tooling consumers)
export { parseToAst } from './parser'
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
export { treeShake } from './ast/treeShake'

// REPL utilities
export { applyReplBinding, executeReplLine } from './shared/replCore'
export type { ReplBinding } from './shared/replCore'
