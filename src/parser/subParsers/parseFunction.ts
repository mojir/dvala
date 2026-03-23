import type { LambdaNode } from '../../builtin/specialExpressions/functions'
import { specialExpressionTypes } from '../../builtin/specialExpressionTypes'
import { NodeTypes } from '../../constants/constants'
import { DvalaError } from '../../errors'
import type { AstNode, BindingTarget, UserDefinedSymbolNode } from '../types'
import { bindingTargetTypes } from '../types'
import type { TokenDebugInfo } from '../../tokenizer/token'
import { assertLParenToken, isLParenToken, isOperatorToken, isRParenToken, isReservedSymbolToken, isSymbolToken } from '../../tokenizer/token'
import { withSourceCodeInfo } from '../helpers'
import type { ParserContext } from '../ParserContext'
import { parseBindingTarget } from './parseBindingTarget'
import { parseDo } from './parseDo'
import { parseSymbol } from './parseSymbol'

const placeholderRegexp = /^\$([1-9]\d?)?$/
const maxShorthandLambdaArity = 20

export function parseLambdaFunction(ctx: ParserContext): LambdaNode | null {
  const firstToken = ctx.peek()

  if (isLParenToken(firstToken)
    && isSymbolToken(ctx.peekAhead(1))
    && isOperatorToken(ctx.peekAhead(2), '->')) {
    return null
  }

  try {
    const functionArguments = parseFunctionArguments(ctx)

    if (!isOperatorToken(ctx.peek(), '->')) {
      return null
    }
    ctx.advance()
    let nodes: AstNode[] | undefined
    if (isReservedSymbolToken(ctx.peek(), 'do')) {
      const doNode = parseDo(ctx)
      // Plain do...end: unwrap body expressions for multi-statement lambdas.
      nodes = doNode[1][1]
    } else {
      nodes = [ctx.parseExpression()]
    }

    return withSourceCodeInfo([
      NodeTypes.SpecialExpression,
      [
        specialExpressionTypes['function'],
        [
          functionArguments,
          nodes,
        ],
      ],
      0,
    ], firstToken[2], ctx) as LambdaNode
  } catch {
    return null
  }
}

function parseFunctionArguments(ctx: ParserContext): BindingTarget[] {
  const firstToken = ctx.peek()
  if (isSymbolToken(firstToken)) {
    return [withSourceCodeInfo([bindingTargetTypes.symbol, [parseSymbol(ctx), undefined], 0], firstToken[2], ctx)]
  }

  assertLParenToken(firstToken)
  ctx.advance()

  let rest = false
  let defaults = false
  const functionArguments: BindingTarget[] = []
  while (!ctx.isAtEnd() && !isRParenToken(ctx.peek()) && !isSymbolToken(ctx.peek(), 'let')) {
    if (rest) {
      throw new DvalaError('Rest argument must be last', ctx.peekSourceCodeInfo())
    }
    const bindingTarget = parseBindingTarget(ctx)
    if (bindingTarget[1][1] !== undefined) {
      defaults = true
    }
    if (bindingTarget[0] === bindingTargetTypes.rest) {
      rest = true
    }
    if (defaults && !bindingTarget[1][1]) {
      throw new DvalaError('Default arguments must be last', ctx.peekSourceCodeInfo())
    }
    functionArguments.push(bindingTarget)

    if (!isOperatorToken(ctx.peek(), ',') && !isRParenToken(ctx.peek()) && !isSymbolToken(ctx.peek(), 'let')) {
      throw new DvalaError('Expected comma or closing parenthesis', ctx.peekSourceCodeInfo())
    }
    if (isOperatorToken(ctx.peek(), ',')) {
      ctx.advance()
    }
  }

  if (!isRParenToken(ctx.peek())) {
    throw new DvalaError('Expected closing parenthesis', ctx.peekSourceCodeInfo())
  }

  ctx.advance()

  return functionArguments
}
export function parseShorthandLambdaFunction(ctx: ParserContext): LambdaNode {
  const firstToken = ctx.peek()
  ctx.advance()
  // TODO, do not like this...
  const startPos = ctx.getPosition()

  let nodes: AstNode[] | undefined
  if (isReservedSymbolToken(ctx.peek(), 'do')) {
    const doNode = parseDo(ctx)
    // Plain do...end: unwrap body expressions.
    nodes = doNode[1][1]
  } else {
    nodes = [ctx.parseExpression()]
  }

  const endPos = ctx.getPosition() - 1

  // Scan body for $ placeholders: $ = first arg, $2 = second, $3 = third, etc.
  // $1 is not valid — use $ for the first argument.
  let arity = 0
  for (let pos = startPos; pos <= endPos; pos += 1) {
    const token = ctx.getTokenAt(pos)!
    if (isSymbolToken(token)) {
      const match = placeholderRegexp.exec(token[1])
      if (match) {
        const number = match[1] ?? '1'
        if (match[1] === '1') {
          throw new DvalaError('Use $ instead of $1 for the first argument', ctx.resolveTokenDebugInfo(firstToken[2] as TokenDebugInfo))
        }
        arity = Math.max(arity, Number(number))
        if (arity > maxShorthandLambdaArity)
          throw new DvalaError('Can\'t specify more than 20 arguments', ctx.resolveTokenDebugInfo(firstToken[2] as TokenDebugInfo))
      }
    }
  }

  // Build parameter bindings: $, $2, $3, ...
  const functionArguments: BindingTarget[] = []
  for (let i = 1; i <= arity; i += 1) {
    const name = i === 1 ? '$' : `$${i}`
    functionArguments.push(withSourceCodeInfo([bindingTargetTypes.symbol, [[NodeTypes.UserDefinedSymbol, name, 0] as UserDefinedSymbolNode, undefined], 0], firstToken[2], ctx))
  }

  const node: LambdaNode = withSourceCodeInfo([NodeTypes.SpecialExpression, [specialExpressionTypes['function'], [
    functionArguments,
    nodes,
  ]], 0], firstToken[2], ctx) as LambdaNode

  return node
}
