/**
 * Standalone tooling functions re-exported from the minimal bundle entry (`src/index.ts`).
 *
 * These are thin wrappers around internal utilities that do not require a
 * Dvala instance and have no dependency on the built-in reference catalogue
 * (`reference/index.ts`).  Keeping them here — rather than in `src/tooling.ts`
 * — is what prevents `reference/index.ts` (and its eager `docsToReference()`
 * calls) from being dragged into the minimal bundle by rolldown.
 *
 * `src/tooling.ts` re-exports everything from this file so that consumers of
 * `@mojir/dvala/tooling` continue to receive these symbols unchanged.
 */

import { builtin } from '@mojir/dvala-engine'
import { AutoCompleter } from './AutoCompleter/AutoCompleter'
import type { AutoCompleterParams } from './AutoCompleter/AutoCompleter'
import { standardEffectNames } from '@mojir/dvala-engine'
import { createContextStack } from '@mojir/dvala-engine'
import { getUndefinedSymbols as getUndefinedSymbolsInternal } from '@mojir/dvala-engine'
import type { DvalaModule } from '@mojir/dvala-engine'
import { tokenize } from './tokenizer/tokenize'
import type { TokenStream } from './tokenizer/tokenize'
import { minifyTokenStream } from './tokenizer/minifyTokenStream'
import { parseToAst } from './parser'
import type { Ast } from '@mojir/dvala-types'

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
 * Convert a token stream back to source code.
 */
export { untokenize } from './untokenizer'

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
  const contextStack = createContextStack({ globalContext, modules: modulesMap })
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
