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
  // Wrap the entire type declaration in a CST `TypeAlias` node so the
  // formatter can find and emit it as a unit. Without this, the
  // declaration's tokens flow into the parent CST node as a flat
  // sequence and the formatter has no way to recognize them as a
  // type-decl. The AST is unaffected (still a null Reserved node).
  //
  // Defensive try/finally: if any of the nested `throw new ParseError`
  // paths fire, we still close the node so the builder's stack stays
  // balanced. In practice the whole CST is discarded on parse error
  // (see `format()` in formatter), but balancing the stack pre-empts
  // any future code path that might inspect a partial tree.
  ctx.builder?.startNode('TypeAlias')
  try {
    return parseTypeDeclarationBody(ctx)
  } finally {
    ctx.builder?.endNode()
  }
}

function parseTypeDeclarationBody(ctx: ParserContext): AstNode {
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
  const seenNames = new Set<string>()
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
      if (seenNames.has(paramName)) {
        throw new ParseError(`Duplicate type parameter '${paramName}' in generic parameter list`, ctx.peekSourceCodeInfo())
      }
      seenNames.add(paramName)
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

  // Return a null node — type declarations are erased at runtime.
  // The CST `TypeAlias` node is closed by the surrounding finally.
  return withSourceCodeInfo([NodeTypes.Reserved, 'null', 0], token[2], ctx)
}
