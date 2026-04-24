/**
 * Collect a type annotation string from the token stream.
 * Reads tokens until a delimiter is found: `=`, `,`, `)`, `->`, `;`, or `end`.
 * Handles balanced parens/brackets/braces so nested types work.
 *
 * Used by parseBindingTarget (for `let x: T = ...` and `(a: T) -> ...`)
 * and parseLambdaFunction (for `(a): T -> ...`).
 */

import { isOperatorToken, isRParenToken, isReservedSymbolToken, isSymbolToken } from '../../tokenizer/token'
import type { ParserContext } from '../ParserContext'

/**
 * Is the token a right-angle-bracket-family operator (`>`, `>>`, `>>>`)?
 * The tokenizer emits `>>` and `>>>` as single tokens for the shift
 * operators, but inside type annotations these characters represent
 * stacked closers for nested generics (`Box<Array<Number>>` → `>>`).
 * The collector splits them back into individual `>` characters so
 * angle-depth tracking and the stopAtGt delimiter behave correctly.
 */
function rightAngleRunLength(token: ReturnType<ParserContext['tryPeek']>): number {
  if (!token) return 0
  if (isOperatorToken(token, '>')) return 1
  if (isOperatorToken(token, '>>')) return 2
  if (isOperatorToken(token, '>>>')) return 3
  return 0
}

export function collectTypeAnnotation(ctx: ParserContext, options?: { stopAtArrow?: boolean; stopAtRParen?: boolean; stopAtGt?: boolean }): string {
  const parts: string[] = []
  let depth = 0 // track balanced parens/brackets/braces
  let angleDepth = 0 // track Handler<...> and future generic type args
  // Stack of brace types. When we enter a `{`, push either 'refinement'
  // (if the following tokens match `IDENT |` — the refinement-predicate
  // disambiguation used by the type parser) or 'other'. While the top
  // of the stack is 'refinement', `<` and `>` are Dvala expression
  // operators, not generic brackets — don't track angleDepth for them.
  // Prevents `{n | 0 < n}` from incrementing angleDepth and eating past
  // the matching `}`.
  const braceStack: ('refinement' | 'other')[] = []
  const stopAtArrow = options?.stopAtArrow ?? false
  const stopAtRParen = options?.stopAtRParen ?? true
  // When set, stop at `>` at the top level (angleDepth === 0). Used when
  // collecting a type-parameter upper-bound inside a `<T: Bound>` list —
  // the closing `>` of the param list must terminate the bound collection.
  const stopAtGt = options?.stopAtGt ?? false

  const inRefinementBrace = (): boolean => braceStack[braceStack.length - 1] === 'refinement'

  while (!ctx.isAtEnd()) {
    const token = ctx.tryPeek()
    if (!token) break

    // Right-angle-bracket run: the tokenizer may have fused multiple `>`
    // into one `>>` or `>>>` token for the shift operators. Inside type
    // annotations these characters are stacked generic closers. Handle
    // them as a run — consume one `>` at a time for angle-depth tracking
    // and stopAtGt, mutating the token in place to "leave behind" any
    // unconsumed `>`s for the outer parser.
    //
    // Exception: while inside a refinement-predicate brace scope, `>`
    // is a Dvala relational operator, not a generic closer. Skip the
    // run-splitting logic and fall through to the default "add token
    // text to parts" path.
    const gtRun = rightAngleRunLength(token)
    if (gtRun > 0 && !inRefinementBrace()) {
      let consumed = 0
      while (consumed < gtRun) {
        if (depth === 0 && angleDepth === 0 && stopAtGt) break
        if (angleDepth > 0) {
          angleDepth--
        }
        parts.push('>')
        consumed++
      }
      if (consumed === gtRun) {
        ctx.advance()
        continue
      }
      // Leave behind (gtRun - consumed) `>`s. Mutate the token's text
      // so the outer parser consumes the residual as a single `>`,
      // `>>`, etc. The token type stays `Operator`; its position info
      // is preserved (harmless — only the text changes).
      const remaining = gtRun - consumed
      ;(token as unknown as [string, string])[1] = '>'.repeat(remaining)
      break
    }

    // Stop at delimiters (only at top level — not inside balanced groups)
    if (depth === 0 && angleDepth === 0) {
      if (isOperatorToken(token, '=')) break
      if (isOperatorToken(token, ',')) break
      if (stopAtArrow && isOperatorToken(token, '->')) break
      if (isOperatorToken(token, ';')) break
      if (stopAtRParen && isRParenToken(token)) break
      if (isReservedSymbolToken(token, 'end')) break
    }

    // Track nesting
    if (token[0] === 'LParen' || token[0] === 'LBracket') depth++
    if (token[0] === 'LBrace') {
      depth++
      // Classify the brace: refinement-predicate `{ IDENT |` vs. anything
      // else. Refinement needs angleDepth suspended for its body.
      const next = ctx.peekAhead(1)
      const after = ctx.peekAhead(2)
      const isRefinement
        = next !== undefined && (isSymbolToken(next) || isReservedSymbolToken(next))
        && after !== undefined && isOperatorToken(after, '|')
      braceStack.push(isRefinement ? 'refinement' : 'other')
    }
    if (token[0] === 'RParen' || token[0] === 'RBracket') depth--
    if (token[0] === 'RBrace') {
      depth--
      braceStack.pop()
    }
    // `<` is a generic opener — but inside a refinement-predicate brace
    // it's a Dvala less-than operator, not an angle bracket.
    if (isOperatorToken(token, '<') && !inRefinementBrace()) angleDepth++

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
