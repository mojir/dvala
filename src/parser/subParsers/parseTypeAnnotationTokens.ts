/**
 * Collect a type annotation string from the token stream.
 * Reads tokens until a delimiter is found: `=`, `,`, `)`, `->`, `;`, or `end`.
 * Handles balanced parens/brackets/braces so nested types work.
 *
 * Used by parseBindingTarget (for `let x: T = ...` and `(a: T) -> ...`)
 * and parseLambdaFunction (for `(a): T -> ...`).
 */

import { isOperatorToken, isRParenToken, isReservedSymbolToken } from '../../tokenizer/token'
import type { ParserContext } from '../ParserContext'

export function collectTypeAnnotation(ctx: ParserContext): string {
  const parts: string[] = []
  let depth = 0 // track balanced parens/brackets/braces

  while (!ctx.isAtEnd()) {
    const token = ctx.tryPeek()
    if (!token) break

    // Stop at delimiters (only at top level — not inside balanced groups)
    if (depth === 0) {
      if (isOperatorToken(token, '=')) break
      if (isOperatorToken(token, ',')) break
      if (isOperatorToken(token, '->')) break
      if (isOperatorToken(token, ';')) break
      if (isRParenToken(token)) break
      if (isReservedSymbolToken(token, 'end')) break
    }

    // Track nesting
    if (token[0] === 'LParen' || token[0] === 'LBracket' || token[0] === 'LBrace') depth++
    if (token[0] === 'RParen' || token[0] === 'RBracket' || token[0] === 'RBrace') depth--

    // Reconstruct the token text
    if (token[0] === 'Atom') parts.push(`:${token[1]}`)
    else if (token[0] === 'EffectName') parts.push(`@${token[1]}`)
    else parts.push(token[1])

    ctx.advance()
  }

  return parts.join(' ').trim()
}

/**
 * Check if the current token is `:` indicating a type annotation.
 * Only valid in the symbol binding case (not inside object patterns,
 * where `:` means nested destructuring — that's handled separately).
 */
export function isTypeAnnotationColon(ctx: ParserContext): boolean {
  return isOperatorToken(ctx.tryPeek(), ':')
}
