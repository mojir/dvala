import type { SpecialExpressionName } from '../../builtin'
import { specialExpressionTypes } from '../../builtin/specialExpressionTypes'
import { NodeTypes } from '../../constants/constants'
import type { CstBuilder } from '../../cst/builder'
import { ParseError } from '../../errors'
import { isFunctionOperator } from '../../tokenizer/operators'
import { isA_BinaryOperatorToken, isEffectNameToken, isLParenToken, isReservedSymbolToken, isRParenToken, isSymbolToken } from '../../tokenizer/token'
import type { TokenStream } from '../../tokenizer/tokenize'
import { isSpecialSymbolNode } from '../../typeGuards/astNode'
import { binaryFunctionalOperatorPrecedence, createNamedNormalExpressionNode, exponentiationPrecedence, fromBinaryOperatorToNode, isAtExpressionEnd, withSourceCodeInfo } from '../helpers'
import { getPrecedence } from '../getPrecedence'
import { ParserContext } from '../ParserContext'
import type { AstNode, SymbolNode } from '../types'
import { parseDo } from './parseDo'
import { parseForOrDoseq } from './parseForOrDoseq'
import { parseHandler } from './parseHandler'
import { parseIf } from './parseIf'
import { parseLet } from './parseLet'
import { parseLoop } from './parseLoop'
import { parseMacro } from './parseMacro'
import { parseMatch } from './parseMatch'
import { parseOperand } from './parseOperand'
import { parseQuote } from './parseQuote'
import { parseSymbol } from './parseSymbol'

export function createParserContext(tokenStream: TokenStream, allocateId: () => number): ParserContext {
  const ctx = new ParserContext(tokenStream, allocateId)
  ctx.parseExpression = (precedence = 0) => parseExpression(ctx, precedence)
  return ctx
}

export function createCstParserContext(tokenStream: TokenStream, allocateId: () => number, builder: CstBuilder): ParserContext {
  const ctx = new ParserContext(tokenStream, allocateId, builder)
  ctx.parseExpression = (precedence = 0) => parseExpression(ctx, precedence)
  return ctx
}

export function parseExpression(ctx: ParserContext, precedence = 0): AstNode {
  // Save checkpoint before left operand — used by startNodeAt if a binary
  // operator or infix call follows.
  const checkpoint = ctx.builder?.checkpoint()
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
      case 'shallow':
        // `shallow handler ...` — shallow handler expression.
        // Contextual: only triggers when followed by `handler` + a handler start token.
        if (isShallowHandlerStart(ctx)) {
          ctx.builder?.startNode('Handler')
          ctx.advance() // consume 'shallow'
          left = parseHandler(ctx, true)
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
      ctx.builder?.startNodeAt(checkpoint!, 'BinaryOp')
      const symbol: SymbolNode = specialExpressionTypes[name as SpecialExpressionName]
        ? withSourceCodeInfo([NodeTypes.Special, specialExpressionTypes[name as SpecialExpressionName], 0], operator[2], ctx)
        : withSourceCodeInfo([NodeTypes.Builtin, name, 0], operator[2], ctx)
      ctx.advance()
      const right = parseExpression(ctx, newPrecedece)
      left = fromBinaryOperatorToNode(operator, symbol, left, right, operator[2], ctx)
      ctx.builder?.endNode()
    } else if (isSymbolToken(operator)) {
      if (!isFunctionOperator(operator[1])) {
        break
      }
      const newPrecedence = binaryFunctionalOperatorPrecedence
      if (newPrecedence <= precedence) {
        break
      }
      ctx.builder?.startNodeAt(checkpoint!, 'BinaryOp')
      const operatorSymbol = parseSymbol(ctx)
      const right = parseExpression(ctx, newPrecedence)
      if (isSpecialSymbolNode(operatorSymbol)) {
        throw new ParseError('Special expressions are not allowed in binary functional operators', ctx.resolveTokenDebugInfo(operator[2]))
      }
      left = createNamedNormalExpressionNode(operatorSymbol, [left, right], operator[2], ctx, { isInfix: true })
      ctx.builder?.endNode()
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
/**
 * Check if `shallow handler` starts a shallow handler expression.
 * Requires: current token = `shallow`, next = `handler`, token after = handler start.
 */
function isShallowHandlerStart(ctx: ParserContext): boolean {
  // peekAhead(1) is the token after `shallow` (should be `handler`)
  if (!isSymbolToken(ctx.peekAhead(1), 'handler')) return false
  // peekAhead(2) is the token after `handler` (should be @effect or `transform`)
  const afterHandler = ctx.peekAhead(2)
  if (!afterHandler) return false
  if (isEffectNameToken(afterHandler)) return true
  if (isSymbolToken(afterHandler, 'transform')) return true
  return false
}

function isHandlerStart(ctx: ParserContext): boolean {
  const next = ctx.peekAhead(1)
  if (!next) return false
  // handler @effect... — starts with an effect name token
  if (isEffectNameToken(next)) return true
  // handler transform... — transform-only handler
  if (isSymbolToken(next, 'transform')) return true
  // Note: `handler end` is NOT treated as a handler expression because it
  // conflicts with existing code using `handler` as a variable name.
  // Empty handlers can be created as `handler transform x -> x end` if needed.
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
  ctx.builder?.startNode('Resume')
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
    ctx.builder?.endNode()
    return node
  }

  // Bare resume — reference to the resume function value
  const node = withSourceCodeInfo([NodeTypes.Resume, 'ref', 0], token[2], ctx)
  ctx.setNodeEnd(node[2])
  ctx.builder?.endNode()
  return node
}
