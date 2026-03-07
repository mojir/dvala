/**
 * Standalone tooling functions for tokenizing, parsing, and analysis.
 *
 * These are thin wrappers around internal utilities that do not require
 * a Dvala instance.
 */

import { builtin } from './builtin'
import { AutoCompleter } from './AutoCompleter/AutoCompleter'
import type { AutoCompleterParams } from './AutoCompleter/AutoCompleter'
import { createContextStack } from './evaluator/ContextStack'
import { evaluateNode } from './evaluator/trampoline'
import { getUndefinedSymbols as getUndefinedSymbolsInternal } from './getUndefinedSymbols'
import type { DvalaModule } from './builtin/modules/interface'
import { tokenize } from './tokenizer/tokenize'
import type { TokenStream } from './tokenizer/tokenize'
import { minifyTokenStream } from './tokenizer/minifyTokenStream'
import { parse } from './parser'
import type { Ast } from './parser/types'
import { transformSymbolTokens } from './transformer'
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
  return { body: parse(minified), hasDebugData: tokenStream.hasDebugData }
}

/**
 * Convert a token stream back to source code.
 */
export { untokenize }

/**
 * Transform all symbol tokens in a token stream using the provided function.
 */
export function transformSymbols(tokenStream: TokenStream, transformer: (symbol: string) => string): TokenStream {
  return transformSymbolTokens(tokenStream, transformer)
}

/**
 * Get all undefined symbols in a Dvala program.
 *
 * @param source - Dvala source code
 * @param options - optional context to treat as defined
 * @param options.bindings - host bindings to treat as defined
 * @param options.modules - modules to treat as available
 */
export function getUndefinedSymbols(
  source: string,
  options?: { bindings?: Record<string, unknown>, modules?: DvalaModule[] },
): Set<string> {
  const modulesMap = options?.modules
    ? new Map(options.modules.map(m => [m.name, m]))
    : undefined
  const contextStack = createContextStack({ bindings: options?.bindings }, modulesMap)
  const tokenStream = tokenize(source, false, undefined)
  const minified = minifyTokenStream(tokenStream, { removeWhiteSpace: true })
  const ast: Ast = { body: parse(minified), hasDebugData: false }
  return getUndefinedSymbolsInternal(ast, contextStack, builtin, evaluateNode)
}

/**
 * Create an auto-completer for the given program at the given cursor position.
 *
 * @param program - Full Dvala source code
 * @param position - Cursor position (character offset)
 * @param params - Optional params (bindings to include as suggestions)
 */
export function getAutoCompleter(program: string, position: number, params: AutoCompleterParams = {}): AutoCompleter {
  return new AutoCompleter(program, position, params)
}
