import type { SpecialExpressionName } from '../../builtin'
import { specialExpressionTypes } from '../../builtin/specialExpressionTypes'
import { NodeTypes } from '../../constants/constants'
import { DvalaError } from '../../errors'
import { isFunctionOperator } from '../../tokenizer/operators'
import { isA_BinaryOperatorToken, isReservedSymbolToken, isSymbolToken } from '../../tokenizer/token'
import type { TokenStream } from '../../tokenizer/tokenize'
import { isSpecialBuiltinSymbolNode } from '../../typeGuards/astNode'
import { binaryFunctionalOperatorPrecedence, createNamedNormalExpressionNode, exponentiationPrecedence, fromBinaryOperatorToNode, isAtExpressionEnd, withSourceCodeInfo } from '../helpers'
import { ParserContext } from '../ParserContext'
import type { AstNode, SymbolNode } from '../types'
import { getPrecedence } from '../getPrecedence'
import { parseDo } from './parseDo'
import { parseHandle } from './parseHandle'
import { parseForOrDoseq } from './parseForOrDoseq'
import { parseIf } from './parseIf'
import { parseLet } from './parseLet'
import { parseLoop } from './parseLoop'
import { parseOperand } from './parseOperand'
import { parseMatch } from './parseMatch'
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
    }
  } else if (isReservedSymbolToken(token, 'do')) {
    left = parseDo(ctx)
  } else if (isReservedSymbolToken(token, 'handle')) {
    left = parseHandle(ctx)
  }

  left ||= parseOperand(ctx)
  let operator = ctx.tryPeek()

  while (!isAtExpressionEnd(ctx)) {
    if (isA_BinaryOperatorToken(operator)) {
      const name = operator[1]
      const newPrecedece = getPrecedence(name, operator[2])
      if (
        newPrecedece <= precedence
        // ^ (exponentiation) is right associative
        && !(newPrecedece === exponentiationPrecedence && precedence === exponentiationPrecedence)) {
        break
      }
      const symbol: SymbolNode = specialExpressionTypes[name as SpecialExpressionName]
        ? withSourceCodeInfo([NodeTypes.SpecialBuiltinSymbol, specialExpressionTypes[name as SpecialExpressionName]], operator[2])
        : withSourceCodeInfo([NodeTypes.NormalBuiltinSymbol, name], operator[2])
      ctx.advance()
      const right = parseExpression(ctx, newPrecedece)
      left = fromBinaryOperatorToNode(operator, symbol, left, right, operator[2])
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
      if (isSpecialBuiltinSymbolNode(operatorSymbol)) {
        throw new DvalaError('Special expressions are not allowed in binary functional operators', operatorSymbol[2])
      }
      left = createNamedNormalExpressionNode(operatorSymbol, [left, right], operator[2])
    } else {
      break
    }

    operator = ctx.tryPeek()
  }

  return left
}
