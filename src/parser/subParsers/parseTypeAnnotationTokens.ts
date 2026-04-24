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

export function collectTypeAnnotation(ctx: ParserContext, options?: { stopAtArrow?: boolean; stopAtRParen?: boolean; stopAtGt?: boolean }): string {
  const parts: string[] = []
  let depth = 0 // track balanced parens/brackets/braces
  let angleDepth = 0 // track Handler<...> and future generic type args
  const stopAtArrow = options?.stopAtArrow ?? false
  const stopAtRParen = options?.stopAtRParen ?? true
  // When set, stop at `>` at the top level (angleDepth === 0). Used when
  // collecting a type-parameter upper-bound inside a `<T: Bound>` list —
  // the closing `>` of the param list must terminate the bound collection.
  const stopAtGt = options?.stopAtGt ?? false

  while (!ctx.isAtEnd()) {
    const token = ctx.tryPeek()
    if (!token) break

    // Stop at delimiters (only at top level — not inside balanced groups)
    if (depth === 0 && angleDepth === 0) {
      if (isOperatorToken(token, '=')) break
      if (isOperatorToken(token, ',')) break
      if (stopAtArrow && isOperatorToken(token, '->')) break
      if (isOperatorToken(token, ';')) break
      if (stopAtRParen && isRParenToken(token)) break
      if (stopAtGt && isOperatorToken(token, '>')) break
      if (isReservedSymbolToken(token, 'end')) break
    }

    // Track nesting
    if (token[0] === 'LParen' || token[0] === 'LBracket' || token[0] === 'LBrace') depth++
    if (token[0] === 'RParen' || token[0] === 'RBracket' || token[0] === 'RBrace') depth--
    if (isOperatorToken(token, '<')) angleDepth++
    if (isOperatorToken(token, '>') && angleDepth > 0) angleDepth--

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
