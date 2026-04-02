/**
 * Token-level definition scanner — extracts top-level `let <name>` bindings
 * from the token stream without requiring a valid AST.
 *
 * This always succeeds (even on broken files) and provides a fallback for
 * completions and basic Go to Definition when the parser fails.
 */

import type { Token, TokenDebugInfo } from '../tokenizer/token'
import type { SymbolDef } from './types'

/**
 * Scan a token array for top-level let bindings.
 * Extracts simple `let <name>` patterns — does not handle destructuring.
 */
export function scanTokensForDefinitions(tokens: Token[], filePath: string): SymbolDef[] {
  // Filter to meaningful tokens (skip whitespace, comments, shebangs)
  const meaningful = tokens.filter(t =>
    t[0] !== 'Whitespace' && t[0] !== 'SingleLineComment' && t[0] !== 'MultiLineComment' && t[0] !== 'Shebang',
  )

  const defs: SymbolDef[] = []

  for (let i = 0; i < meaningful.length; i++) {
    const token = meaningful[i]!
    // Look for `let` keyword followed by a symbol
    if (token[0] !== 'Symbol' || token[1] !== 'let') continue

    const next = meaningful[i + 1]
    if (!next || next[0] !== 'Symbol') continue

    const name = next[1]
    const debugInfo: TokenDebugInfo | undefined = next[2]
    const line = debugInfo ? debugInfo[0] + 1 : 0 // token debugInfo is 0-based, we store 1-based
    const column = debugInfo ? debugInfo[1] + 1 : 0

    // Determine kind by looking ahead past `=` for function/macro/handler keywords
    const kind = classifyLetBinding(meaningful, i + 2)

    defs.push({
      name,
      kind,
      nodeId: -1, // no AST node for token-scanned definitions
      location: { file: filePath, line, column },
      scope: 0, // token scan only finds top-level bindings
    })
  }

  return defs
}

/**
 * Look at tokens after `let <name>` to classify the binding kind.
 * Starts at the token index after the name (should be `=`).
 */
function classifyLetBinding(tokens: Token[], startIndex: number): SymbolDef['kind'] {
  // Skip past `=`
  const eq = tokens[startIndex]
  if (!eq || eq[0] !== 'Operator' || eq[1] !== '=') return 'variable'

  const rhs = tokens[startIndex + 1]
  if (!rhs) return 'variable'

  // Check for macro keyword
  if (rhs[0] === 'Symbol' && rhs[1] === 'macro') return 'macro'
  // Check for handler keyword
  if (rhs[0] === 'Symbol' && rhs[1] === 'handler') return 'handler'
  // Check for shallow handler
  if (rhs[0] === 'Symbol' && rhs[1] === 'shallow') return 'handler'
  // Check for function literal: `(` or `() ->`
  if (rhs[0] === 'LParen') return 'function'
  // Check for import
  if (rhs[0] === 'Symbol' && rhs[1] === 'import') return 'import'

  return 'variable'
}
