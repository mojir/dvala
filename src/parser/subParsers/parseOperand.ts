import type { SpecialExpressionName } from '../../builtin'
import { specialExpressionTypes } from '../../builtin/specialExpressionTypes'
import { NodeTypes } from '../../constants/constants'
import { ParseError } from '../../errors'
import type { AstNode, BuiltinSymbolNode, NormalExpressionNodeExpression, SpecialSymbolNode, StringNode } from '../types'
import { isBinaryOperator } from '../../tokenizer/operators'
import { isNumberReservedSymbol } from '../../tokenizer/reservedNames'
import type { StringToken, TemplateStringToken, TokenDebugInfo, TokenType } from '../../tokenizer/token'
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
  'dvala.macro.expand',
  'dvala.host',
  'dvala.env',
  'dvala.args',
])

export function parseOperand(ctx: ParserContext): AstNode {
  // Save checkpoint before parsing the operand — needed if it turns out to
  // be the object of a property access, index access, or function call.
  const checkpoint = ctx.builder?.checkpoint()

  let operand: AstNode = parseOperandPart(ctx)
  let token = ctx.tryPeek()

  while (isOperatorToken(token, '.') || isLBracketToken(token) || isLParenToken(token)) {
    if (token[1] === '.') {
      ctx.builder?.startNodeAt(checkpoint!, 'PropertyAccess')
      ctx.advance()
      const symbolToken = ctx.tryPeek()
      if (!isSymbolToken(symbolToken)) {
        throw new ParseError('Expected symbol', ctx.peekSourceCodeInfo())
      }
      const stringNode: StringNode = withSourceCodeInfo([NodeTypes.Str, symbolToken[1], 0], symbolToken[2], ctx) as StringNode
      operand = createAccessorNode(ctx, operand, stringNode, token[2])
      ctx.advance()
      ctx.builder?.endNode()
      token = ctx.tryPeek()
    } else if (isLBracketToken(token)) {
      ctx.builder?.startNodeAt(checkpoint!, 'IndexAccess')
      ctx.advance()
      const expression = ctx.parseExpression()
      if (!isRBracketToken(ctx.tryPeek())) {
        throw new ParseError('Expected closing bracket', ctx.peekSourceCodeInfo())
      }
      operand = createAccessorNode(ctx, operand, expression, token[2])
      ctx.advance()
      ctx.builder?.endNode()
      token = ctx.tryPeek()
    // Defensive: function call chaining is always preceded by accessor or direct call
    /* v8 ignore next 3 */
    } else if (isLParenToken(token)) {
      ctx.builder?.startNodeAt(checkpoint!, 'Call')
      operand = parseFunctionCall(ctx, operand)
      ctx.builder?.endNode()
      token = ctx.tryPeek()
    }
  }
  ctx.setNodeEnd(operand[2])
  return operand
}

function parseOperandPart(ctx: ParserContext): AstNode {
  const token = ctx.peek()

  // Parentheses
  if (isLParenToken(token)) {
    if (looksLikeLambda(ctx)) {
      return parseLambdaFunction(ctx)
    }
    ctx.builder?.startNode('Parenthesized')
    ctx.advance()
    const expression = ctx.parseExpression()
    if (!isRParenToken(ctx.peek())) {
      throw new ParseError('Expected closing parenthesis', ctx.peekSourceCodeInfo())
    }
    ctx.advance()
    ctx.setNodeEnd(expression[2])
    ctx.builder?.endNode()
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
        ctx.builder?.startNode('PrefixOp')
        ctx.advance()
        const operand = parseOperandPart(ctx)
        const zeroNode: AstNode = withSourceCodeInfo([NodeTypes.Num, 0, 0], token[2], ctx)
        const minusSymbol: BuiltinSymbolNode = withSourceCodeInfo([NodeTypes.Builtin, '-', 0], token[2], ctx) as BuiltinSymbolNode
        const node = withSourceCodeInfo([NodeTypes.Call, [minusSymbol, [zeroNode, operand]], 0], token[2], ctx) as NormalExpressionNodeExpression
        ctx.setNodeEnd(node[2])
        ctx.builder?.endNode()
        return node
      }
    }

    if (isBinaryOperator(operatorName)) {
      // Operator used as a value (e.g. passing `+` as a function argument)
      ctx.builder?.startNode('Symbol')
      ctx.advance()
      if (specialExpressionTypes[operatorName as SpecialExpressionName] !== undefined) {
        const node = withSourceCodeInfo([NodeTypes.Special, specialExpressionTypes[operatorName as SpecialExpressionName], 0], token[2], ctx) as SpecialSymbolNode
        ctx.setNodeEnd(node[2])
        ctx.builder?.endNode()
        return node
      }
      const node = withSourceCodeInfo([NodeTypes.Builtin, operatorName, 0], token[2], ctx) as BuiltinSymbolNode
      ctx.setNodeEnd(node[2])
      ctx.builder?.endNode()
      return node
    }

    if (operatorName === '->') {
      return parseShorthandLambdaFunction(ctx)
    } else {
      throw new ParseError(`Illegal operator: ${operatorName}`, ctx.resolveTokenDebugInfo(token[2] as TokenDebugInfo))
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

  // #name expr — prefix macro call, consumes a full expression
  if (token[0] === 'MacroPrefix') {
    ctx.builder?.startNode('MacroCall')
    const debugInfo = token[2]
    const nodeId = ctx.allocateNodeId(debugInfo)
    ctx.advance()
    const operand = ctx.parseExpression()
    const symNode = withSourceCodeInfo([NodeTypes.Sym, token[1], 0], debugInfo, ctx)
    const node: AstNode = [NodeTypes.MacroCall, [symNode, [operand]], nodeId]
    ctx.setNodeEnd(nodeId)
    ctx.builder?.endNode()
    return node
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
    | 'MacroQualified' // Handled in parseExpression
    | 'MacroPrefix' // Handled above
  >
  switch (tokenType) {
    case 'Atom': {
      ctx.builder?.startNode('AtomLiteral')
      ctx.advance()
      const atomNode = withSourceCodeInfo([NodeTypes.Atom, token[1], 0], token[2], ctx)
      ctx.setNodeEnd(atomNode[2])
      ctx.builder?.endNode()
      return atomNode
    }
    case 'Number':
    case 'BasePrefixedNumber':
      return parseNumber(ctx)
    case 'string':
      return parseString(ctx, token as StringToken)
    case 'TemplateString':
      return parseTemplateString(ctx, token as TemplateStringToken)
    case 'Symbol': {
      if (looksLikeLambda(ctx)) {
        return parseLambdaFunction(ctx)
      }
      return parseSymbol(ctx)
    }
    case 'ReservedSymbol':
      return parseReservedSymbol(ctx)
    case 'RegexpShorthand':
      return parseRegexpShorthand(ctx)
    case 'EffectName': {
      ctx.builder?.startNode('EffectName')
      const effectName = token[1]
      // Validate dvala.* effect names — only known standard effects are allowed.
      // Wildcards (containing *) are exempt since they're patterns, not literal names.
      if (effectName.startsWith('dvala.') && !effectName.includes('*') && !validDvalaEffects.has(effectName)) {
        throw new ParseError(`Unknown dvala effect: '${effectName}'`, ctx.resolveTokenDebugInfo(token[2] as TokenDebugInfo))
      }
      ctx.advance()
      const node = withSourceCodeInfo([NodeTypes.Effect, effectName, 0], token[2], ctx)
      ctx.setNodeEnd(node[2])
      ctx.builder?.endNode()
      return node
    }

    default:
      throw new ParseError(`Unknown token type: ${tokenType}`, ctx.resolveTokenDebugInfo(token[2] as TokenDebugInfo))
  }
}

// Lookahead to determine if the current position starts a lambda.
// For `(...)`: scan to find the matching `)`, then check for `->`.
// For a bare symbol: check if the next token is `->`.
function looksLikeLambda(ctx: ParserContext): boolean {
  const token = ctx.tryPeek()
  if (!token) return false

  if (isSymbolToken(token)) {
    return isOperatorToken(ctx.peekAhead(1), '->')
  }

  if (isLParenToken(token)) {
    let depth = 1
    let offset = 1
    while (depth > 0) {
      const t = ctx.peekAhead(offset)
      if (!t) return false
      if (isLParenToken(t)) depth++
      else if (isRParenToken(t)) depth--
      offset++
    }
    return isOperatorToken(ctx.peekAhead(offset), '->')
  }

  return false
}

function createAccessorNode(ctx: ParserContext, left: AstNode, right: AstNode, debugInfo: TokenDebugInfo | undefined): NormalExpressionNodeExpression {
  const node = withSourceCodeInfo([NodeTypes.Call, [withSourceCodeInfo([NodeTypes.Builtin, 'get', 0], debugInfo, ctx), [left, right]], 0], debugInfo, ctx) as NormalExpressionNodeExpression
  ctx.setNodeEnd(node[2])
  return node
}

