/**
 * Parse an effect declaration: effect @name(ArgType) -> RetType
 *
 * Effect declarations are type-only — they tell the typechecker what
 * types flow through perform() and resume() for a given effect.
 * They produce a null AST node at runtime (erased).
 *
 * Syntax: effect @name(ArgType) -> RetType
 * Example: effect @log(String) -> Null
 */

import { NodeTypes } from '../../constants/constants'
import { ParseError } from '../../errors'
import type { AstNode } from '../types'
import { assertOperatorToken, isEffectNameToken, isLParenToken, isRParenToken } from '../../tokenizer/token'
import { withSourceCodeInfo } from '../helpers'
import type { ParserContext } from '../ParserContext'
import { collectTypeAnnotation } from './parseTypeAnnotationTokens'

export function parseEffectDeclaration(ctx: ParserContext): AstNode {
  const token = ctx.peek() // 'effect'
  ctx.advance() // consume 'effect'

  // Expect @name
  const effectToken = ctx.peek()
  if (!isEffectNameToken(effectToken)) {
    throw new ParseError('Expected effect name after "effect"', ctx.peekSourceCodeInfo())
  }
  const effectName = effectToken[1]
  ctx.advance() // consume @name

  // Expect (ArgType)
  if (!isLParenToken(ctx.peek())) {
    throw new ParseError('Expected "(" after effect name', ctx.peekSourceCodeInfo())
  }
  ctx.advance() // consume '('

  const argType = collectTypeAnnotation(ctx)
  if (!argType) {
    throw new ParseError('Expected argument type in effect declaration', ctx.peekSourceCodeInfo())
  }

  if (!isRParenToken(ctx.peek())) {
    throw new ParseError('Expected ")" after argument type', ctx.peekSourceCodeInfo())
  }
  ctx.advance() // consume ')'

  // Expect -> RetType
  assertOperatorToken(ctx.peek(), '->')
  ctx.advance() // consume '->'

  const retType = collectTypeAnnotation(ctx)
  if (!retType) {
    throw new ParseError('Expected return type in effect declaration', ctx.peekSourceCodeInfo())
  }

  // Store in the parser's effect declaration side-table
  ctx.effectDeclarations.set(effectName, { argType, retType })

  // Return a null node — effect declarations are erased at runtime
  return withSourceCodeInfo([NodeTypes.Reserved, 'null', 0], token[2], ctx)
}
