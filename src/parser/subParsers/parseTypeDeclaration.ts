/**
 * Parse a type alias declaration: type Name = TypeExpr
 * Or with type parameters: type Name<A, B> = TypeExpr
 *
 * Type declarations are type-only — they tell the typechecker about
 * named type aliases. They produce a null AST node at runtime (erased).
 *
 * Syntax:
 *   type Nullable = Number | Null
 *   type Pair = [Number, Number]
 *   type Result<T, E> = {tag: :ok, value: T} | {tag: :error, error: E}
 */

import { NodeTypes } from '../../constants/constants'
import { ParseError } from '../../errors'
import type { AliasParam, AstNode } from '../types'
import { isOperatorToken, isReservedSymbolToken, isSymbolToken } from '../../tokenizer/token'
import { withSourceCodeInfo } from '../helpers'
import type { ParserContext } from '../ParserContext'
import { collectTypeAnnotation } from './parseTypeAnnotationTokens'

function skipWhitespace(ctx: ParserContext): void {
  while (!ctx.isAtEnd()) {
    const token = ctx.peek()
    if (token[0] !== 'Whitespace') break
    ctx.advance()
  }
}

export function parseTypeDeclaration(ctx: ParserContext): AstNode {
  const token = ctx.peek() // 'type'
  ctx.advance() // consume 'type'

  // Expect a name (uppercase identifier by convention, but not enforced)
  const nameToken = ctx.peek()
  if (!isSymbolToken(nameToken)) {
    throw new ParseError('Expected type name after "type"', ctx.peekSourceCodeInfo())
  }
  const name = nameToken[1]
  ctx.advance() // consume name

  // Optional type parameters: <A, B, C> or with bounds <A: Bound1, B: Bound2>
  const params: AliasParam[] = []
  skipWhitespace(ctx)
  if (isOperatorToken(ctx.tryPeek(), '<')) {
    ctx.advance() // consume '<'
    while (!ctx.isAtEnd()) {
      skipWhitespace(ctx)
      const paramToken = ctx.peek()
      if (!isSymbolToken(paramToken) && !isReservedSymbolToken(paramToken)) {
        throw new ParseError('Expected type parameter name', ctx.peekSourceCodeInfo())
      }
      const paramName = paramToken[1]
      ctx.advance()
      skipWhitespace(ctx)
      // Optional upper bound: `: BoundType`
      // The bound is stored as source text; parsed lazily on alias expansion.
      // `stopAtGt` ensures the closing `>` of the param list terminates the
      // bound collection even when the bound itself is a simple type expression.
      let bound: string | undefined
      if (isOperatorToken(ctx.tryPeek(), ':')) {
        ctx.advance() // consume ':'
        const boundExpr = collectTypeAnnotation(ctx, { stopAtGt: true })
        if (!boundExpr) {
          throw new ParseError(`Expected bound type after ":" for parameter "${paramName}"`, ctx.peekSourceCodeInfo())
        }
        bound = boundExpr
        skipWhitespace(ctx)
      }
      params.push(bound === undefined ? { name: paramName } : { name: paramName, bound })
      if (isOperatorToken(ctx.tryPeek(), ',')) {
        ctx.advance() // consume ','
      } else {
        break
      }
    }
    skipWhitespace(ctx)
    if (!isOperatorToken(ctx.tryPeek(), '>')) {
      throw new ParseError('Expected ">" after type parameters', ctx.peekSourceCodeInfo())
    }
    ctx.advance() // consume '>'
  }

  // Expect '='
  skipWhitespace(ctx)
  if (!isOperatorToken(ctx.tryPeek(), '=')) {
    throw new ParseError('Expected "=" after type name', ctx.peekSourceCodeInfo())
  }
  ctx.advance() // consume '='

  // Collect the type expression
  const typeExpr = collectTypeAnnotation(ctx)
  if (!typeExpr) {
    throw new ParseError('Expected type expression after "="', ctx.peekSourceCodeInfo())
  }

  // Store in the parser's type declaration registry
  ctx.typeAliases.set(name, { params, body: typeExpr })

  // Return a null node — type declarations are erased at runtime
  return withSourceCodeInfo([NodeTypes.Reserved, 'null', 0], token[2], ctx)
}
