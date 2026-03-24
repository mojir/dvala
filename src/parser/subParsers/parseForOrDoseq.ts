import { getAllBindingTargetNames } from '../../builtin/bindingNode'
import type { ForNode, LoopBindingNode } from '../../builtin/specialExpressions/loops'
import { NodeTypes } from '../../constants/constants'
import { DvalaError } from '../../errors'
import type { AstNode, BindingNode } from '../types'
import { bindingTargetTypes } from '../types'
import type { SourceCodeInfo, SymbolToken, Token } from '../../tokenizer/token'
import { asSymbolToken, assertLParenToken, assertOperatorToken, assertRParenToken, assertReservedSymbolToken, isOperatorToken, isRParenToken, isReservedSymbolToken, isSymbolToken } from '../../tokenizer/token'
import { asUserDefinedSymbolNode } from '../../typeGuards/astNode'
import { withSourceCodeInfo } from '../helpers'
import type { ParserContext } from '../ParserContext'
import { parseLet } from './parseLet'
import { parseSymbol } from './parseSymbol'

type InternalLoopBindingDelimiter = 'let' | 'when' | 'while'

export function parseForOrDoseq(ctx: ParserContext, firstToken: SymbolToken): ForNode {
  ctx.advance()

  assertLParenToken(ctx.tryPeek())
  ctx.advance()

  const forLoopBindings: LoopBindingNode[] = []

  while (!ctx.isAtEnd() && !isRParenToken(ctx.tryPeek())) {
    const loopBinding = parseForLoopBinding(ctx)
    const existingBoundNames = forLoopBindings.flatMap(b => Object.keys(getAllBindingTargetNames(b[0][1][0])))
    const newBoundNames = getAllBindingTargetNames(loopBinding[0][1][0])
    if (Object.keys(newBoundNames).some(n => existingBoundNames.includes(n))) {
      throw new DvalaError('Duplicate binding', undefined)
    }
    forLoopBindings.push(loopBinding)
    if (isOperatorToken(ctx.tryPeek(), ',')) {
      ctx.advance()
    }
  }

  assertRParenToken(ctx.tryPeek())
  ctx.advance()

  assertOperatorToken(ctx.tryPeek(), '->')
  ctx.advance()

  const expression = ctx.parseExpression()

  const node = withSourceCodeInfo([NodeTypes.For, [forLoopBindings, expression], 0], firstToken[2], ctx) as ForNode
  ctx.setNodeEnd(node[2])
  return node
}

function parseForLoopBinding(ctx: ParserContext): LoopBindingNode {
  const bindingNode = parseBinding(ctx)

  const modifiers: ('&let' | '&when' | '&while')[] = []
  let token = ctx.peek()

  assertInternalLoopBindingDelimiter(token, ['let', 'when', 'while'], ctx.peekSourceCodeInfo())

  const letBindings: BindingNode[] = []
  if (token[1] === 'let') {
    modifiers.push('&let')
    while (isSymbolToken(token, 'let')) {
      const letNode = parseLet(ctx, token)
      const existingBoundNames = letBindings.flatMap(b => Object.keys(getAllBindingTargetNames(b[1][0])))
      const letBinding = letNode[1]
      const newBoundNames = Object.keys(getAllBindingTargetNames(letBinding[1][0]))
      if (newBoundNames.some(n => existingBoundNames.includes(n))) {
        throw new DvalaError('Duplicate binding', undefined)
      }

      letBindings.push(letBinding)
      token = ctx.peek()
      assertInternalLoopBindingDelimiter(token, ['let', 'when', 'while'], ctx.peekSourceCodeInfo())
      token = ctx.peek()
    }
  }

  let whenNode: AstNode | undefined
  let whileNode: AstNode | undefined
  while (
    isReservedSymbolToken(token, 'when')
    || isReservedSymbolToken(token, 'while')
  ) {
    ctx.advance()

    if (token[1] === 'when') {
      modifiers.push('&when')
      whenNode = ctx.parseExpression()
    } else {
      modifiers.push('&while')
      whileNode = ctx.parseExpression()
    }
    token = ctx.peek()

    const symbols: ('when' | 'while')[] = modifiers.includes('&when') && modifiers.includes('&while')
      ? []
      : modifiers.includes('&when')
        ? ['while']
        : ['when']

    assertInternalLoopBindingDelimiter(token, symbols, ctx.peekSourceCodeInfo())
    token = ctx.peek()
  }

  assertInternalLoopBindingDelimiter(token, [], ctx.peekSourceCodeInfo())

  return [bindingNode, letBindings, whenNode, whileNode] satisfies LoopBindingNode
}

function parseBinding(ctx: ParserContext): BindingNode {
  const firstToken = asSymbolToken(ctx.tryPeek())
  const name = asUserDefinedSymbolNode(parseSymbol(ctx))

  assertReservedSymbolToken(ctx.tryPeek(), 'in')
  ctx.advance()

  const value = ctx.parseExpression()

  const node: BindingNode = withSourceCodeInfo(
    [
      NodeTypes.Binding,
      [
        withSourceCodeInfo([bindingTargetTypes.symbol, [name, undefined], 0], firstToken[2], ctx),
        value,
      ],
      0,
    ],
    firstToken[2],
    ctx,
  )
  ctx.setNodeEnd(node[2])
  return node
}

function assertInternalLoopBindingDelimiter(token: Token, symbols: InternalLoopBindingDelimiter[], sourceCodeInfo?: SourceCodeInfo): void {
  if (!isInternalLoopBindingDelimiter(token, symbols)) {
    const symbolsString = `${[...symbols, ','].map(symbol => `"${symbol}"`).join(', ')} or ")"`
    throw new DvalaError(`Expected symbol ${symbolsString}`, sourceCodeInfo)
  }
}

function isInternalLoopBindingDelimiter(token: Token, symbols: InternalLoopBindingDelimiter[]): boolean {
  // end of loop binding
  if (isOperatorToken(token, ',') || isRParenToken(token)) {
    return true
  }
  for (const symbol of symbols) {
    if (symbol === 'let' && isSymbolToken(token, 'let')) {
      return true
    }
    if (['when', 'while'].includes(symbol) && isReservedSymbolToken(token, symbol as 'when' | 'while')) {
      return true
    }
  }
  return false
}
