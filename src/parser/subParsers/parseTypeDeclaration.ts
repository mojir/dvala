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
import type { AstNode } from '../types'
import { isOperatorToken, isSymbolToken } from '../../tokenizer/token'
import { withSourceCodeInfo } from '../helpers'
import type { ParserContext } from '../ParserContext'
import { collectTypeAnnotation } from './parseTypeAnnotationTokens'

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

  // Optional type parameters: <A, B, C>
  const params: string[] = []
  if (isOperatorToken(ctx.tryPeek(), '<')) {
    ctx.advance() // consume '<'
    while (!ctx.isAtEnd()) {
      const paramToken = ctx.peek()
      if (!isSymbolToken(paramToken)) {
        throw new ParseError('Expected type parameter name', ctx.peekSourceCodeInfo())
      }
      params.push(paramToken[1])
      ctx.advance()
      if (isOperatorToken(ctx.tryPeek(), ',')) {
        ctx.advance() // consume ','
      } else {
        break
      }
    }
    if (!isOperatorToken(ctx.tryPeek(), '>')) {
      throw new ParseError('Expected ">" after type parameters', ctx.peekSourceCodeInfo())
    }
    ctx.advance() // consume '>'
  }

  // Expect '='
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
