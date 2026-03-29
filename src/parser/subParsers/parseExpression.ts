import type { SpecialExpressionName } from '../../builtin'
import { specialExpressionTypes } from '../../builtin/specialExpressionTypes'
import { NodeTypes } from '../../constants/constants'
import { ParseError } from '../../errors'
import { isFunctionOperator } from '../../tokenizer/operators'
import { isA_BinaryOperatorToken, isEffectNameToken, isLParenToken, isMacroQualifiedToken, isReservedSymbolToken, isRParenToken, isSymbolToken } from '../../tokenizer/token'
import type { TokenStream } from '../../tokenizer/tokenize'
import { isSpecialSymbolNode } from '../../typeGuards/astNode'
import { binaryFunctionalOperatorPrecedence, createNamedNormalExpressionNode, exponentiationPrecedence, fromBinaryOperatorToNode, isAtExpressionEnd, withSourceCodeInfo } from '../helpers'
import { ParserContext } from '../ParserContext'
import type { AstNode, SymbolNode } from '../types'
import { getPrecedence } from '../getPrecedence'
import { parseDo } from './parseDo'
import { parseHandler } from './parseHandler'
import { parseForOrDoseq } from './parseForOrDoseq'
import { parseIf } from './parseIf'
import { parseLet } from './parseLet'
import { parseLoop } from './parseLoop'
import { parseMacro } from './parseMacro'
import { parseMatch } from './parseMatch'
import { parseOperand } from './parseOperand'
import { parseQuote } from './parseQuote'
import { parseSymbol } from './parseSymbol'

export function createParserContext(tokenStream: TokenStream): ParserContext {
  const ctx = new ParserContext(tokenStream)
  ctx.parseExpression = (precedence = 0) => parseExpression(ctx, precedence)
  return ctx
}

export function parseExpression(ctx: ParserContext, precedence = 0): AstNode {
  const token = ctx.tryPeek()

  let left: AstNode

  if (isSymbolToken(token)) {
    switch (token[1]) {
      case 'let':
        return parseLet(ctx, token)
      case 'if':
        left = parseIf(ctx, token)
        break
      case 'match':
        left = parseMatch(ctx, token)
        break
      case 'for':
        left = parseForOrDoseq(ctx, token)
        break
      case 'loop':
        left = parseLoop(ctx, token)
        break
      case 'macro':
        left = parseMacro(ctx)
        break
      case 'handler':
        // Contextual keyword: only parse as handler expression if followed by
        // @effect, `transform`, or `end` (otherwise it's a regular variable).
        if (isHandlerStart(ctx)) {
          left = parseHandler(ctx)
        }
        break
      case 'resume':
        // Contextual keyword: parse as resume if followed by `(` or at expression end.
        // When used as a variable binding, the normal symbol path handles it.
        if (isResumeStart(ctx)) {
          left = parseResume(ctx)
        }
        break
    }
  } else if (isMacroQualifiedToken(token)) {
    // macro@qualified.name — pass the qualified name to parseMacro
    left = parseMacro(ctx)
  } else if (isReservedSymbolToken(token, 'do')) {
    left = parseDo(ctx)
  } else if (isReservedSymbolToken(token, 'quote')) {
    left = parseQuote(ctx)
  }

  left ||= parseOperand(ctx)
  let operator = ctx.tryPeek()

  while (!isAtExpressionEnd(ctx)) {
    if (isA_BinaryOperatorToken(operator)) {
      const name = operator[1]
      const newPrecedece = getPrecedence(name, ctx.resolveTokenDebugInfo(operator[2]))
      if (
        newPrecedece <= precedence
        // ^ (exponentiation) is right associative
        && !(newPrecedece === exponentiationPrecedence && precedence === exponentiationPrecedence)) {
        break
      }
      const symbol: SymbolNode = specialExpressionTypes[name as SpecialExpressionName]
        ? withSourceCodeInfo([NodeTypes.Special, specialExpressionTypes[name as SpecialExpressionName], 0], operator[2], ctx)
        : withSourceCodeInfo([NodeTypes.Builtin, name, 0], operator[2], ctx)
      ctx.advance()
      const right = parseExpression(ctx, newPrecedece)
      left = fromBinaryOperatorToNode(operator, symbol, left, right, operator[2], ctx)
    } else if (isSymbolToken(operator)) {
      if (!isFunctionOperator(operator[1])) {
        break
      }
      const newPrecedence = binaryFunctionalOperatorPrecedence
      if (newPrecedence <= precedence) {
        break
      }
      const operatorSymbol = parseSymbol(ctx)
      const right = parseExpression(ctx, newPrecedence)
      if (isSpecialSymbolNode(operatorSymbol)) {
        throw new ParseError('Special expressions are not allowed in binary functional operators', ctx.resolveTokenDebugInfo(operator[2]))
      }
      left = createNamedNormalExpressionNode(operatorSymbol, [left, right], operator[2], ctx)
    } else {
      break
    }

    operator = ctx.tryPeek()
  }

  ctx.setNodeEnd(left[2])
  return left
}

/**
 * Check if `handler` token starts a handler expression (not a variable reference).
 * Handler expression: `handler @effect... end` or `handler transform... end` or `handler end`.
 * The lookahead checks the token after `handler`.
 */
function isHandlerStart(ctx: ParserContext): boolean {
  const next = ctx.peekAhead(1)
  if (!next) return false
  // handler @effect... — starts with an effect name token
  if (isEffectNameToken(next)) return true
  // handler transform... — transform-only handler
  if (isSymbolToken(next, 'transform')) return true
  // Note: `handler end` is NOT treated as a handler expression because it
  // conflicts with existing code using `handler` as a variable name (e.g.
  // `handle body with handler end`). Empty handlers can be created as
  // `handler transform x -> x end` if needed.
  return false
}

/**
 * Check if `resume` token starts a resume expression (not a variable reference).
 * Resume expression: `resume(...)` or bare `resume` at expression end.
 * When `resume` is followed by `(`, it's always a resume call (not a variable call).
 * When at expression end, it's a bare resume reference.
 */
function isResumeStart(ctx: ParserContext): boolean {
  const next = ctx.peekAhead(1)
  // resume( — always a resume call
  if (isLParenToken(next)) return true
  // Bare resume — at expression boundary or end of input
  if (!next) return true
  if (isReservedSymbolToken(next)) return true
  // resume followed by an operator (;, ,, etc.) — bare resume
  if (isA_BinaryOperatorToken(next)) return true
  return false
}

/**
 * Parse `resume`, `resume()`, or `resume(value)`.
 *
 * ResumeNode payload encoding:
 * - `resume(value)`: the argument AstNode
 * - `resume()`: a Null literal node (call with no arg → resume with null)
 * - bare `resume`: special string 'ref' (reference to resume function)
 */
function parseResume(ctx: ParserContext): AstNode {
  const token = ctx.tryPeek()!
  ctx.advance() // consume 'resume'

  // Check if followed by ( — call form: resume(...) or resume()
  if (isLParenToken(ctx.tryPeek())) {
    ctx.advance() // consume (
    let argNode: AstNode
    if (!isRParenToken(ctx.tryPeek())) {
      argNode = ctx.parseExpression()
    } else {
      // resume() — no arg, equivalent to resume(null)
      argNode = withSourceCodeInfo([NodeTypes.Reserved, 'null' as const, 0], token[2], ctx) as AstNode
    }
    if (!isRParenToken(ctx.tryPeek())) {
      throw new ParseError('Expected ")" after resume argument', ctx.peekSourceCodeInfo())
    }
    ctx.advance() // consume )
    const node = withSourceCodeInfo([NodeTypes.Resume, argNode, 0], token[2], ctx)
    ctx.setNodeEnd(node[2])
    return node
  }

  // Bare resume — reference to the resume function value
  const node = withSourceCodeInfo([NodeTypes.Resume, 'ref', 0], token[2], ctx)
  ctx.setNodeEnd(node[2])
  return node
}
