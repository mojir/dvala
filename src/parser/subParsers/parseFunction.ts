import type { LambdaNode } from '../../builtin/specialExpressions/functions'
import { NodeTypes } from '../../constants/constants'
import { ParseError } from '../../errors'
import type { AstNode, BindingTarget, UserDefinedSymbolNode } from '../types'
import { bindingTargetTypes } from '../types'
import type { TokenDebugInfo } from '../../tokenizer/token'
import { assertLParenToken, isOperatorToken, isRParenToken, isReservedSymbolToken, isSymbolToken } from '../../tokenizer/token'
import { withSourceCodeInfo } from '../helpers'
import type { ParserContext } from '../ParserContext'
import { parseBindingTarget } from './parseBindingTarget'
import { parseDo } from './parseDo'
import { collectTypeAnnotation } from './parseTypeAnnotationTokens'
import { parseSymbol } from './parseSymbol'

const placeholderRegexp = /^\$([1-9]\d?)?$/
const maxShorthandLambdaArity = 20

/**
 * Reserved symbols that can NEVER start an expression — they are
 * purely syntactic block-terminators or continuation keywords
 * (`end` closes do/if/match/handler, `else`/`then` continue an `if`,
 * `case` opens a match arm, etc.).
 *
 * Any of these appearing immediately after `->` means the user wrote
 * an empty function body (the most common scenario is forgetting
 * to supply a body before closing the enclosing construct). Runtime
 * strictness Step 0a: reject this at parse time with a clear message
 * rather than a later TypeError about "Reserved symbol cannot be
 * evaluated." See `design/active/2026-04-12_type-system.md` § Step 0.
 */
// Note: `quote`, `do`, `when`, `while`, `with` start their own block
// expressions and ARE valid as body starters. The list below is only the
// reserved symbols that are purely terminators or mid-construct
// continuations.
const nonExpressionReservedSymbols = new Set([
  'end', 'else', 'then', 'case', 'in', 'as', '_',
])

function assertNonEmptyFunctionBody(ctx: ParserContext): void {
  const token = ctx.peek()
  if (isReservedSymbolToken(token) && nonExpressionReservedSymbols.has(token[1])) {
    throw new ParseError(
      `Empty function body — '${token[1]}' cannot start an expression. `
      + 'Provide a body expression or use `do ... end` for an explicit block.',
      ctx.peekSourceCodeInfo(),
    )
  }
}

// Called after lookahead has confirmed a `->` follows the parameter list.
export function parseLambdaFunction(ctx: ParserContext): LambdaNode {
  ctx.builder?.startNode('Function')
  const firstToken = ctx.peek()
  const functionArguments = parseFunctionArguments(ctx)

  // Return type annotation: (params): ReturnType ->
  let returnTypeAnnotation: string | undefined
  if (isOperatorToken(ctx.peek(), ':')) {
    ctx.advance() // consume ':'
    returnTypeAnnotation = collectTypeAnnotation(ctx, { stopAtArrow: true, stopAtRParen: false })
  }

  if (!isOperatorToken(ctx.peek(), '->')) {
    throw new ParseError('Expected ->', ctx.peekSourceCodeInfo())
  }
  ctx.advance()

  assertNonEmptyFunctionBody(ctx)

  let nodes: AstNode[] | undefined
  if (isReservedSymbolToken(ctx.peek(), 'do')) {
    const doNode = parseDo(ctx)
    // Plain do...end: unwrap body expressions for multi-statement lambdas.
    nodes = doNode[1] as AstNode[]
  } else {
    nodes = [ctx.parseExpression()]
  }

  const node = withSourceCodeInfo([
    NodeTypes.Function,
    [
      functionArguments,
      nodes,
    ],
    0,
  ], firstToken[2], ctx) as LambdaNode
  ctx.setNodeEnd(node[2])

  // Store return type annotation keyed by the function node's ID
  if (returnTypeAnnotation) {
    ctx.typeAnnotations.set(node[2], `return:${returnTypeAnnotation}`)
  }

  ctx.builder?.endNode()
  return node
}

export function parseFunctionArguments(ctx: ParserContext): BindingTarget[] {
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
      throw new ParseError('Rest argument must be last', ctx.peekSourceCodeInfo())
    }
    const bindingTarget = parseBindingTarget(ctx, { stopTypeAnnotationAtRParen: true })
    if (bindingTarget[1][1] !== undefined) {
      defaults = true
    }
    if (bindingTarget[0] === bindingTargetTypes.rest) {
      rest = true
    }
    if (defaults && !bindingTarget[1][1]) {
      throw new ParseError('Default arguments must be last', ctx.peekSourceCodeInfo())
    }
    functionArguments.push(bindingTarget)

    if (!isOperatorToken(ctx.peek(), ',') && !isRParenToken(ctx.peek()) && !isSymbolToken(ctx.peek(), 'let')) {
      throw new ParseError('Expected comma or closing parenthesis', ctx.peekSourceCodeInfo())
    }
    if (isOperatorToken(ctx.peek(), ',')) {
      ctx.advance()
    }
  }

  if (!isRParenToken(ctx.peek())) {
    throw new ParseError('Expected closing parenthesis', ctx.peekSourceCodeInfo())
  }

  ctx.advance()

  return functionArguments
}
export function parseShorthandLambdaFunction(ctx: ParserContext): LambdaNode {
  ctx.builder?.startNode('Function')
  const firstToken = ctx.peek()
  ctx.advance()
  // TODO, do not like this...
  const startPos = ctx.getPosition()

  assertNonEmptyFunctionBody(ctx)

  let nodes: AstNode[] | undefined
  if (isReservedSymbolToken(ctx.peek(), 'do')) {
    const doNode = parseDo(ctx)
    // Plain do...end: unwrap body expressions.
    nodes = doNode[1] as AstNode[]
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
          throw new ParseError('Use $ instead of $1 for the first argument', ctx.resolveTokenDebugInfo(firstToken[2] as TokenDebugInfo))
        }
        arity = Math.max(arity, Number(number))
        if (arity > maxShorthandLambdaArity)
          throw new ParseError('Can\'t specify more than 20 arguments', ctx.resolveTokenDebugInfo(firstToken[2] as TokenDebugInfo))
      }
    }
  }

  // Build parameter bindings: $, $2, $3, ...
  const functionArguments: BindingTarget[] = []
  for (let i = 1; i <= arity; i += 1) {
    const name = i === 1 ? '$' : `$${i}`
    functionArguments.push(withSourceCodeInfo([bindingTargetTypes.symbol, [[NodeTypes.Sym, name, 0] as UserDefinedSymbolNode, undefined], 0], firstToken[2], ctx))
  }

  const node: LambdaNode = withSourceCodeInfo([NodeTypes.Function, [
    functionArguments,
    nodes,
    { isShorthand: true },
  ], 0], firstToken[2], ctx) as LambdaNode

  ctx.setNodeEnd(node[2])
  ctx.builder?.endNode()
  return node
}
