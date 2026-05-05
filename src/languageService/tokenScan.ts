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
  const meaningful = tokens.filter(
    t => t[0] !== 'Whitespace' && t[0] !== 'SingleLineComment' && t[0] !== 'MultiLineComment' && t[0] !== 'Shebang',
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
    const params = kind === 'function' ? scanFunctionParams(meaningful, i + 3) : undefined

    defs.push({
      name,
      kind,
      nodeId: -1, // no AST node for token-scanned definitions
      location: { file: filePath, line, column },
      scope: 0, // token scan only finds top-level bindings
      ...(params ? { params } : {}),
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
  // Check for shallow / linear handler (modifier keyword precedes `handler`).
  // Both modifiers are recognised here regardless of order; the parser
  // accepts `shallow linear handler` and `linear shallow handler`.
  if (rhs[0] === 'Symbol' && rhs[1] === 'shallow') return 'handler'
  if (rhs[0] === 'Symbol' && rhs[1] === 'linear') return 'handler'
  // Check for function literal: `(` or `() ->`
  if (rhs[0] === 'LParen') return 'function'
  // Check for import
  if (rhs[0] === 'Symbol' && rhs[1] === 'import') return 'import'

  return 'variable'
}

function scanFunctionParams(tokens: Token[], startIndex: number): string[] | undefined {
  const first = tokens[startIndex]
  if (!first || first[0] !== 'LParen') return undefined

  const params: string[] = []
  let depth = 0

  for (let i = startIndex; i < tokens.length; i++) {
    const token = tokens[i]!
    if (token[0] === 'LParen') {
      depth++
      continue
    }
    if (token[0] === 'RParen') {
      depth--
      if (depth === 0) return params
      continue
    }
    if (depth !== 1) continue
    if (token[0] === 'Symbol') {
      params.push(token[1])
      continue
    }
    if (token[0] === 'Operator' && token[1] === ',') continue
    return undefined
  }

  return undefined
}
