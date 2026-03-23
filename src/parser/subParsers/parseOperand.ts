import type { SpecialExpressionName } from '../../builtin'
import { specialExpressionTypes } from '../../builtin/specialExpressionTypes'
import { NodeTypes } from '../../constants/constants'
import { DvalaError } from '../../errors'
import type { AstNode, BindingTarget, BuiltinSymbolNode, NormalExpressionNodeExpression, SpecialSymbolNode, StringNode, UserDefinedSymbolNode } from '../types'
import { bindingTargetTypes } from '../types'
import { isBinaryOperator } from '../../tokenizer/operators'
import { isNumberReservedSymbol } from '../../tokenizer/reservedNames'
import type { SourceCodeInfo, StringToken, TemplateStringToken, TokenType } from '../../tokenizer/token'
import { isLBraceToken, isLBracketToken, isLParenToken, isOperatorToken, isRBracketToken, isRParenToken, isSymbolToken } from '../../tokenizer/token'
import { withSourceCodeInfo } from '../helpers'
import type { ParserContext } from '../ParserContext'
import { parseRegexpShorthand } from './parseRegexpShorthand'
import { parseReservedSymbol } from './parseReservedSymbol'
import { parseString } from './parseString'
import { parseSymbol } from './parseSymbol'
import { parseArray } from './parseArray'
import { parseLambdaFunction, parseShorthandLambdaFunction } from './parseFunction'
import { parseFunctionCall } from './parseFunctionCall'
import { parseNumber } from './parseNumber'
import { parseObject } from './parseObject'
import { parseTemplateString } from './parseTemplateString'

// All valid dvala.* effect names — standard effects + specially handled ones.
// Hardcoded to avoid circular dependency with the evaluator module.
const validDvalaEffects: ReadonlySet<string> = new Set([
  'dvala.io.print',
  'dvala.io.error',
  'dvala.io.read',
  'dvala.io.readStdin',
  'dvala.io.pick',
  'dvala.io.confirm',
  'dvala.random',
  'dvala.random.uuid',
  'dvala.random.int',
  'dvala.random.item',
  'dvala.random.shuffle',
  'dvala.time.now',
  'dvala.time.zone',
  'dvala.sleep',
  'dvala.error',
  'dvala.checkpoint',
])

export function parseOperand(ctx: ParserContext): AstNode {
  let operand: AstNode = parseOperandPart(ctx)
  let token = ctx.tryPeek()

  while (isOperatorToken(token, '.') || isLBracketToken(token) || isLParenToken(token)) {
    if (token[1] === '.') {
      ctx.advance()
      const symbolToken = ctx.tryPeek()
      if (!isSymbolToken(symbolToken)) {
        throw new DvalaError('Expected symbol', ctx.peekSourceCodeInfo())
      }
      const stringNode: StringNode = withSourceCodeInfo([NodeTypes.String, symbolToken[1]], symbolToken[2])
      operand = createAccessorNode(operand, stringNode, token[2])
      ctx.advance()
      token = ctx.tryPeek()
    } else if (isLBracketToken(token)) {
      ctx.advance()
      const expression = ctx.parseExpression()
      if (!isRBracketToken(ctx.tryPeek())) {
        throw new DvalaError('Expected closing bracket', ctx.peekSourceCodeInfo())
      }
      operand = createAccessorNode(operand, expression, token[2])
      ctx.advance()
      token = ctx.tryPeek()
    // Defensive: function call chaining is always preceded by accessor or direct call
    /* v8 ignore next 3 */
    } else if (isLParenToken(token)) {
      operand = parseFunctionCall(ctx, operand)
      token = ctx.tryPeek()
    }
  }
  return operand
}

function parseOperandPart(ctx: ParserContext): AstNode {
  const token = ctx.peek()

  // Parentheses
  if (isLParenToken(token)) {
    ctx.storePosition()
    const lamdaFunction = parseLambdaFunction(ctx)
    if (lamdaFunction) {
      return lamdaFunction
    }
    ctx.restorePosition()
    ctx.advance()
    const expression = ctx.parseExpression()
    if (!isRParenToken(ctx.peek())) {
      throw new DvalaError('Expected closing parenthesis', ctx.peekSourceCodeInfo())
    }
    ctx.advance()
    return expression
  } else if (isOperatorToken(token)) {
    const operatorName = token[1]

    // Unary minus: -expr → (0 - expr)
    // Only if next token is an operand (not comma, paren, bracket, etc.)
    if (operatorName === '-') {
      const nextToken = ctx.peekAhead(1)
      const nextType = nextToken?.[0]
      // Unary minus triggers on: -x, -3, -PI, -0xFF, -[...], -{...}
      // NOT on -(  which is a prefix function call: -(a, b)
      const isUnary = nextType === 'Number' || nextType === 'Symbol'
        || (nextType === 'ReservedSymbol' && isNumberReservedSymbol(nextToken![1] as string))
        || nextType === 'LBracket' || nextType === 'LBrace'
        || nextType === 'string' || nextType === 'EffectName'
        || nextType === 'BasePrefixedNumber'
      if (isUnary) {
        ctx.advance()
        const operand = parseOperandPart(ctx)
        const zeroNode: AstNode = withSourceCodeInfo([NodeTypes.Number, 0], token[2])
        const minusSymbol: BuiltinSymbolNode = withSourceCodeInfo([NodeTypes.Builtin, '-'], token[2]) as BuiltinSymbolNode
        return withSourceCodeInfo([NodeTypes.NormalExpression, [minusSymbol, [zeroNode, operand]]], token[2]) as NormalExpressionNodeExpression
      }
    }

    if (isBinaryOperator(operatorName)) {
      ctx.advance()
      if (specialExpressionTypes[operatorName as SpecialExpressionName] !== undefined) {
        return withSourceCodeInfo([NodeTypes.Special, specialExpressionTypes[operatorName as SpecialExpressionName]], token[2]) satisfies SpecialSymbolNode
      }
      return withSourceCodeInfo([NodeTypes.Builtin, operatorName], token[2]) satisfies BuiltinSymbolNode
    }

    if (operatorName === '->') {
      return parseShorthandLambdaFunction(ctx)
    } else {
      throw new DvalaError(`Illegal operator: ${operatorName}`, token[2])
    }
  }

  // Object litteral, e.g. {a: 1, b: 2}
  if (isLBraceToken(token)) {
    return parseObject(ctx)
  }

  // Array litteral, e.g. [1, 2]
  if (isLBracketToken(token)) {
    return parseArray(ctx)
  }

  const tokenType = token[0] as Exclude<
    TokenType,
    | 'Operator' // Handled above
    | 'LParen' // Handled above
    | 'LBrace' // Handled above
    | 'LBracket' // Handled above

    | 'RParen' // Illegal token
    | 'RBrace' // Illegal token
    | 'RBracket' // Illegal token

    | 'MultiLineComment' // Should have been removed
    | 'SingleLineComment' // Should have been removed
    | 'Whitespace' // Should have been removed
  >
  switch (tokenType) {
    case 'Number':
    case 'BasePrefixedNumber':
      return parseNumber(ctx)
    case 'string':
      return parseString(ctx, token as StringToken)
    case 'TemplateString':
      return parseTemplateString(ctx, token as TemplateStringToken)
    case 'Symbol': {
      ctx.storePosition()
      const lamdaFunction = parseLambdaFunction(ctx)
      if (lamdaFunction) {
        return lamdaFunction
      }
      ctx.restorePosition()
      return parseSymbol(ctx)
    }
    case 'ReservedSymbol':
      return parseReservedSymbol(ctx)
    case 'RegexpShorthand':
      return parseRegexpShorthand(ctx)
    case 'EffectName': {
      const effectName = token[1]
      // Validate dvala.* effect names — only known standard effects are allowed.
      // Wildcards (containing *) are exempt since they're patterns, not literal names.
      if (effectName.startsWith('dvala.') && !effectName.includes('*') && !validDvalaEffects.has(effectName)) {
        throw new DvalaError(`Unknown dvala effect: '${effectName}'`, token[2])
      }
      ctx.advance()
      // Check for handler shorthand: @effect -> body, @effect(params...) -> body
      if (isHandlerShorthand(ctx)) {
        return parseHandlerShorthand(ctx, effectName, token[2])
      }
      return withSourceCodeInfo([NodeTypes.EffectName, effectName], token[2])
    }

    default:
      throw new DvalaError(`Unknown token type: ${tokenType}`, token[2])
  }
}

function createAccessorNode(left: AstNode, right: AstNode, sourceCodeInfo: SourceCodeInfo | undefined): NormalExpressionNodeExpression {
  return withSourceCodeInfo([NodeTypes.NormalExpression, [[NodeTypes.Builtin, 'get'], [left, right]]], sourceCodeInfo)
}

/**
 * Detect handler shorthand after an EffectName token has been consumed.
 * Matches: @effect -> body, @effect(params...) -> body
 */
function isHandlerShorthand(ctx: ParserContext): boolean {
  // @effect -> body (zero params)
  if (isOperatorToken(ctx.tryPeek(), '->')) return true

  // @effect(params...) -> body (1-3 params)
  if (!isLParenToken(ctx.tryPeek())) return false

  // Scan ahead: ( symbol [, symbol [, symbol]] ) ->
  let ahead = 1
  if (!isSymbolToken(ctx.peekAhead(ahead))) return false
  ahead++
  for (let i = 0; i < 2; i++) {
    if (isRParenToken(ctx.peekAhead(ahead))) {
      return isOperatorToken(ctx.peekAhead(ahead + 1), '->')
    }
    if (!isOperatorToken(ctx.peekAhead(ahead), ',')) return false
    ahead++
    if (!isSymbolToken(ctx.peekAhead(ahead))) return false
    ahead++
  }
  return isRParenToken(ctx.peekAhead(ahead)) && isOperatorToken(ctx.peekAhead(ahead + 1), '->')
}

/**
 * Parse handler shorthand with 0-3 params.
 *
 * Handler signature order: (arg, eff, nxt) — matches the full handler contract.
 *
 * Forms:
 *   @effect -> body                    → ($, $2, $3) -> if $2 == @effect then body else $3($2, $) end
 *   @effect(x) -> body                → (x, eff·, nxt·) -> if eff· == @effect then body else nxt·(eff·, x) end
 *   @effect(x, e) -> body             → (x, e, nxt·) -> if e == @effect then body else nxt·(e, x) end
 *   @effect(x, e, n) -> body          → (x, e, n) -> if e == @effect then body else n(e, x) end
 *
 * For wildcard effects (containing *), uses effectMatcher instead of ==.
 */
function parseHandlerShorthand(ctx: ParserContext, effectName: string, sourceCodeInfo: SourceCodeInfo | undefined): AstNode {
  const mkSymbol = (name: string): UserDefinedSymbolNode => withSourceCodeInfo([NodeTypes.UserDefinedSymbol, name], sourceCodeInfo) as UserDefinedSymbolNode
  const mkBinding = (name: string): BindingTarget => [bindingTargetTypes.symbol, [mkSymbol(name), undefined]]

  // Parse parameter names (0-3)
  let argName: string
  let effName: string
  let nxtName: string

  if (isOperatorToken(ctx.tryPeek(), '->')) {
    // Zero-param form: @effect -> body (uses $, $2, $3)
    argName = '$'
    effName = '$2'
    nxtName = '$3'
    ctx.advance() // skip ->
  } else {
    // Parenthesized form: @effect(arg [, eff [, nxt]]) -> body
    ctx.advance() // skip (
    const params: string[] = []
    while (!isRParenToken(ctx.tryPeek())) {
      params.push(ctx.peek()[1])
      ctx.advance() // skip param
      if (isOperatorToken(ctx.tryPeek(), ',')) ctx.advance() // skip comma
    }
    ctx.advance() // skip )
    ctx.advance() // skip ->

    // Use untypeable names (middle dot) for unspecified params
    argName = params[0]!
    effName = params[1] ?? 'eff·'
    nxtName = params[2] ?? 'nxt·'
  }

  // Parse body expression, stopping at ||> so shorthand chaining works:
  // expr ||> @a(x) -> x * 2 ||> @b(y) -> y + 1
  // parses as: (expr ||> @a(x) -> x * 2) ||> @b(y) -> y + 1
  const effectPipePrecedence = 1
  const body = ctx.parseExpression(effectPipePrecedence)

  const argSym = mkSymbol(argName)
  const effSym = mkSymbol(effName)
  const nxtSym = mkSymbol(nxtName)

  // Build condition: eff == @effect (or effectMatcher("pattern")(eff) for wildcards)
  let condition: AstNode
  if (effectName.includes('*')) {
    const matcherCall: AstNode = withSourceCodeInfo([NodeTypes.NormalExpression, [
      withSourceCodeInfo([NodeTypes.Builtin, 'effectMatcher'], sourceCodeInfo),
      [withSourceCodeInfo([NodeTypes.String, effectName], sourceCodeInfo)],
    ]], sourceCodeInfo)
    condition = withSourceCodeInfo([NodeTypes.NormalExpression, [matcherCall, [effSym]]], sourceCodeInfo)
  } else {
    const effectNode: AstNode = withSourceCodeInfo([NodeTypes.EffectName, effectName], sourceCodeInfo)
    condition = withSourceCodeInfo([NodeTypes.NormalExpression, [
      withSourceCodeInfo([NodeTypes.Builtin, '=='], sourceCodeInfo),
      [effSym, effectNode],
    ]], sourceCodeInfo)
  }

  // Build else: nxt(eff, arg)
  const elseExpr: AstNode = withSourceCodeInfo([NodeTypes.NormalExpression, [nxtSym, [effSym, argSym]]], sourceCodeInfo)

  // Build if: if condition then body else nxt(eff, arg) end
  const ifExpr: AstNode = withSourceCodeInfo([NodeTypes.SpecialExpression, [specialExpressionTypes.if, [condition, body, elseExpr]]], sourceCodeInfo)

  // Build lambda: (arg, eff, nxt) -> ifExpr
  const args: BindingTarget[] = [mkBinding(argName), mkBinding(effName), mkBinding(nxtName)]
  return withSourceCodeInfo([NodeTypes.SpecialExpression, [specialExpressionTypes['function'], [args, [ifExpr]]]], sourceCodeInfo)
}
