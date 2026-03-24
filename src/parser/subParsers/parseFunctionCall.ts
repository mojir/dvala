import type { SpecialExpression, SpecialExpressionType } from '../../builtin'
import { builtin } from '../../builtin'
import type { AndNode } from '../../builtin/specialExpressions/and'
import type { ArrayNode } from '../../builtin/specialExpressions/array'
import type { EffectNode } from '../../builtin/specialExpressions/effect'
import type { ImportNode } from '../../builtin/specialExpressions/import'
import type { ObjectNode } from '../../builtin/specialExpressions/object'
import type { OrNode } from '../../builtin/specialExpressions/or'
import type { PerformNode } from '../../builtin/specialExpressions/perform'
import type { QqNode } from '../../builtin/specialExpressions/qq'
import type { RecurNode } from '../../builtin/specialExpressions/recur'
import { specialExpressionTypes } from '../../builtin/specialExpressionTypes'
import { NodeTypes } from '../../constants/constants'
import { DvalaError } from '../../errors'
import type { AstNode, NormalExpressionNodeExpression } from '../types'
import { resolveSourceCodeInfo } from '../types'
import type { TokenDebugInfo } from '../../tokenizer/token'
import { isOperatorToken, isRParenToken, isSymbolToken, sourceCodeInfoToDebugInfo } from '../../tokenizer/token'
import { isBuiltinSymbolNode, isSpecialSymbolNode, isUserDefinedSymbolNode } from '../../typeGuards/astNode'
import { assertNumberOfParams } from '../../utils/arity'
import { createNamedNormalExpressionNode, withSourceCodeInfo } from '../helpers'
import type { ParserContext } from '../ParserContext'

export function parseFunctionCall(ctx: ParserContext, symbol: AstNode): AstNode {
  ctx.advance()

  // Resolve source code info from the symbol's node ID for error messages
  const symbolSci = resolveSourceCodeInfo(symbol[2], ctx.sourceMap)
  // Extract debug info for node construction (withSourceCodeInfo, createNamedNormalExpressionNode)
  const symbolDebugInfo = sourceCodeInfoToDebugInfo(symbolSci)

  // Handle @dotted.name — custom parsing for dotted identifier argument
  if (isSpecialSymbolNode(symbol) && symbol[1] === specialExpressionTypes.effect) {
    const node = parseEffectArgs(ctx, symbolDebugInfo)
    ctx.setNodeEnd(node[2])
    return node
  }

  const params: AstNode[] = []
  while (!ctx.isAtEnd() && !isRParenToken(ctx.tryPeek())) {
    if (isOperatorToken(ctx.tryPeek(), '...')) {
      ctx.advance()
      params.push(withSourceCodeInfo([NodeTypes.Spread, ctx.parseExpression(), 0], ctx.peekDebugInfo(), ctx))
    } else {
      params.push(ctx.parseExpression())
    }
    const nextToken = ctx.tryPeek()
    if (!isOperatorToken(nextToken, ',') && !isRParenToken(nextToken)) {
      throw new DvalaError('Expected comma or closing parenthesis', ctx.peekSourceCodeInfo())
    }
    if (isOperatorToken(nextToken, ',')) {
      ctx.advance()
    }
  }
  if (!isRParenToken(ctx.tryPeek())) {
    throw new DvalaError('Expected closing parenthesis', ctx.peekSourceCodeInfo())
  }
  ctx.advance()

  if (isSpecialSymbolNode(symbol)) { // Named function
    const specialExpressionType = symbol[1]

    // Handle import specially — extract module name as a string from the symbol argument
    if (specialExpressionType === specialExpressionTypes.import) {
      if (params.length !== 1) {
        throw new DvalaError(`import expects exactly 1 argument, got ${params.length}`, symbolSci)
      }
      const param = params[0]!
      if (!isUserDefinedSymbolNode(param)) {
        throw new DvalaError('import expects a module name (symbol), got a non-symbol argument', resolveSourceCodeInfo(param[2], ctx.sourceMap) ?? symbolSci)
      }
      const moduleName = param[1]
      const node = withSourceCodeInfo([NodeTypes.Import, moduleName, 0], symbolDebugInfo, ctx) as ImportNode
      ctx.setNodeEnd(node[2])
      return node
    }

    // --- Direct node types (migrated from SpecialExpression) ---
    if (specialExpressionType === specialExpressionTypes.recur) {
      const node = withSourceCodeInfo([NodeTypes.Recur, params, 0], symbolDebugInfo, ctx) as RecurNode
      ctx.setNodeEnd(node[2])
      return node
    }
    if (specialExpressionType === specialExpressionTypes.array) {
      const node = withSourceCodeInfo([NodeTypes.Array, params, 0], symbolDebugInfo, ctx) as ArrayNode
      ctx.setNodeEnd(node[2])
      return node
    }
    if (specialExpressionType === specialExpressionTypes.parallel) {
      assertNumberOfParams({ min: 1 }, params.length, symbolSci)
      const node = withSourceCodeInfo([NodeTypes.Parallel, params, 0], symbolDebugInfo, ctx) as unknown as AstNode
      ctx.setNodeEnd(node[2])
      return node
    }
    if (specialExpressionType === specialExpressionTypes.race) {
      assertNumberOfParams({ min: 1 }, params.length, symbolSci)
      const node = withSourceCodeInfo([NodeTypes.Race, params, 0], symbolDebugInfo, ctx) as unknown as AstNode
      ctx.setNodeEnd(node[2])
      return node
    }
    if (specialExpressionType === specialExpressionTypes.perform) {
      assertNumberOfParams({ min: 1, max: 2 }, params.length, symbolSci)
      const [effectExpr, payloadExpr] = params
      const node = withSourceCodeInfo([NodeTypes.Perform, [effectExpr!, payloadExpr], 0], symbolDebugInfo, ctx) as PerformNode
      ctx.setNodeEnd(node[2])
      return node
    }
    if (specialExpressionType === specialExpressionTypes.object) {
      const node = withSourceCodeInfo([NodeTypes.Object, params, 0], symbolDebugInfo, ctx) as ObjectNode
      ctx.setNodeEnd(node[2])
      return node
    }

    const type = specialExpressionType as Exclude<
      SpecialExpressionType,
      | typeof specialExpressionTypes.for
      | typeof specialExpressionTypes.match
      | typeof specialExpressionTypes.let
      | typeof specialExpressionTypes.loop
      | typeof specialExpressionTypes.import
      | typeof specialExpressionTypes.effect
      | typeof specialExpressionTypes.handle
      | typeof specialExpressionTypes.recur
      | typeof specialExpressionTypes.array
      | typeof specialExpressionTypes.perform
      | typeof specialExpressionTypes.object
      | typeof specialExpressionTypes.parallel
      | typeof specialExpressionTypes.race
    >
    const specialExpression: SpecialExpression = builtin.specialExpressions[type]
    assertNumberOfParams(specialExpression.arity, params.length, symbolSci)
    switch (type) {
      case specialExpressionTypes['||']: {
        const node = withSourceCodeInfo([NodeTypes.Or, params, 0], symbolDebugInfo, ctx) as OrNode
        ctx.setNodeEnd(node[2])
        return node
      }
      case specialExpressionTypes['&&']: {
        const node = withSourceCodeInfo([NodeTypes.And, params, 0], symbolDebugInfo, ctx) as AndNode
        ctx.setNodeEnd(node[2])
        return node
      }
      case specialExpressionTypes['??']: {
        const node = withSourceCodeInfo([NodeTypes.Qq, params, 0], symbolDebugInfo, ctx) as QqNode
        ctx.setNodeEnd(node[2])
        return node
      }
      case specialExpressionTypes['function']:
        throw new DvalaError(`${type} is not allowed`, symbolSci)
      /* v8 ignore next 2 */
      default:
        throw new DvalaError(`Unknown special expression: ${type satisfies never}`, symbolSci)
    }
  } else if (isBuiltinSymbolNode(symbol) || isUserDefinedSymbolNode(symbol)) {
    const node = createNamedNormalExpressionNode(symbol, params, symbolDebugInfo, ctx)
    ctx.setNodeEnd(node[2])
    return node
  } else {
    const node = withSourceCodeInfo([NodeTypes.NormalExpression, [symbol, params], 0], symbolDebugInfo, ctx) as NormalExpressionNodeExpression
    ctx.setNodeEnd(node[2])
    return node
  }
}

/**
 * Parse the argument to `effect(...)` — a dotted identifier like `llm.complete`
 * or `com.myco.human.approve`. Consumes symbol tokens separated by `.` and
 * builds the full name string.
 */
function parseEffectArgs(ctx: ParserContext, symbolDebugInfo: TokenDebugInfo | undefined): EffectNode {
  const firstToken = ctx.peek()
  if (!isSymbolToken(firstToken)) {
    throw new DvalaError('effect expects a dotted name identifier', ctx.resolveTokenDebugInfo(firstToken[2] as TokenDebugInfo))
  }
  let name = firstToken[1]
  ctx.advance()
  while (isOperatorToken(ctx.tryPeek(), '.')) {
    ctx.advance() // skip dot
    const nextToken = ctx.peek()
    if (!isSymbolToken(nextToken)) {
      throw new DvalaError('Expected identifier after dot in effect name', ctx.resolveTokenDebugInfo(nextToken[2] as TokenDebugInfo))
    }
    name += `.${nextToken[1]}`
    ctx.advance()
  }
  if (!isRParenToken(ctx.tryPeek())) {
    throw new DvalaError('Expected closing parenthesis after effect name', ctx.peekSourceCodeInfo())
  }
  ctx.advance()
  const node = withSourceCodeInfo([NodeTypes.Effect, name, 0], symbolDebugInfo, ctx) as EffectNode
  ctx.setNodeEnd(node[2])
  return node
}
