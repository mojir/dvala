import type { SpecialExpression } from '@mojir/dvala-engine'
import type { SpecialExpressionType } from '@mojir/dvala-types'
import { builtin } from '@mojir/dvala-engine'
import type { AndNode } from '@mojir/dvala-engine'
import type { ArrayNode } from '@mojir/dvala-engine'
import type { EffectNode } from '@mojir/dvala-engine'
import type { ObjectEntry, ObjectNode } from '@mojir/dvala-engine'
import type { OrNode } from '@mojir/dvala-engine'
import type { PerformNode } from '@mojir/dvala-engine'
import type { QqNode } from '@mojir/dvala-engine'
import type { RecurNode } from '@mojir/dvala-engine'
import { specialExpressionTypes } from '@mojir/dvala-types'
import { NodeTypes } from '@mojir/dvala-types'
import { ParseError } from '@mojir/dvala-types'
import type { AstNode, NormalExpressionNodeExpression } from '@mojir/dvala-types'
import { resolveSourceCodeInfo } from '@mojir/dvala-types'
import type { TokenDebugInfo } from '../../tokenizer/token'
import { isOperatorToken, isRParenToken, isSymbolToken, sourceCodeInfoToDebugInfo } from '../../tokenizer/token'
import { isBuiltinSymbolNode, isSpecialSymbolNode, isSpreadNode, isUserDefinedSymbolNode } from '@mojir/dvala-types'
import { assertNumberOfParams } from '@mojir/dvala-types'
import { createNamedNormalExpressionNode, withSourceCodeInfo } from '../helpers'
import type { ParserContext } from '../ParserContext'

// Note: The CST `Call` node is opened/closed by the caller in parseOperand.ts
// (via startNodeAt/endNode), not here, because the call-site has access to the
// checkpoint marking where the callee expression started.
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
      ctx.builder?.startNode('Spread')
      ctx.advance()
      params.push(withSourceCodeInfo([NodeTypes.Spread, ctx.parseExpression(), 0], ctx.peekDebugInfo(), ctx))
      ctx.builder?.endNode()
    } else {
      params.push(ctx.parseExpression())
    }
    const nextToken = ctx.tryPeek()
    if (!isOperatorToken(nextToken, ',') && !isRParenToken(nextToken)) {
      throw new ParseError('Expected comma or closing parenthesis', ctx.peekSourceCodeInfo())
    }
    if (isOperatorToken(nextToken, ',')) {
      ctx.advance()
    }
  }
  if (!isRParenToken(ctx.tryPeek())) {
    throw new ParseError('Expected closing parenthesis', ctx.peekSourceCodeInfo())
  }
  ctx.advance()

  if (isSpecialSymbolNode(symbol)) {
    // Named function
    const specialExpressionType = symbol[1]

    // Handle import specially — extract module name from a string literal argument
    if (specialExpressionType === specialExpressionTypes.import) {
      if (params.length !== 1) {
        throw new ParseError(`import expects exactly 1 argument, got ${params.length}`, symbolSci)
      }
      const param = params[0]!
      if (param[0] !== NodeTypes.Str) {
        throw new ParseError(
          'import expects a string argument, e.g. import("math")',
          resolveSourceCodeInfo(param[2], ctx.sourceMap) ?? symbolSci,
        )
      }
      const moduleName = param[1] as string
      // The path Str node is discarded — the Import node carries moduleName directly.
      // Flag its source-map position structuralLeaf so coverage doesn't count it as a
      // found-but-unhit expression. See ParserContext.markStructuralLeaf.
      ctx.markStructuralLeaf(param[2])
      const node = withSourceCodeInfo([NodeTypes.Import, moduleName, 0], symbolDebugInfo, ctx)
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
      assertNumberOfParams({ min: 1, max: 1 }, params.length, symbolSci)
      const node = withSourceCodeInfo([NodeTypes.Parallel, params[0], 0], symbolDebugInfo, ctx) as unknown as AstNode
      ctx.setNodeEnd(node[2])
      return node
    }
    if (specialExpressionType === specialExpressionTypes.race) {
      assertNumberOfParams({ min: 1, max: 1 }, params.length, symbolSci)
      const node = withSourceCodeInfo([NodeTypes.Race, params[0], 0], symbolDebugInfo, ctx) as unknown as AstNode
      ctx.setNodeEnd(node[2])
      return node
    }
    if (specialExpressionType === specialExpressionTypes.settled) {
      assertNumberOfParams({ min: 1, max: 1 }, params.length, symbolSci)
      const node = withSourceCodeInfo([NodeTypes.Settled, params[0], 0], symbolDebugInfo, ctx) as unknown as AstNode
      ctx.setNodeEnd(node[2])
      return node
    }
    if (specialExpressionType === specialExpressionTypes.perform) {
      assertNumberOfParams({ min: 1, max: 2 }, params.length, symbolSci)
      const [effectExpr, payloadExpr] = params
      const node = withSourceCodeInfo(
        [NodeTypes.Perform, [effectExpr!, payloadExpr], 0],
        symbolDebugInfo,
        ctx,
      ) as PerformNode
      ctx.setNodeEnd(node[2])
      return node
    }
    if (specialExpressionType === specialExpressionTypes.object) {
      // Pair up flat alternating key/value params into ObjectEntry pairs
      // Spread nodes stay as-is
      const entries: ObjectEntry[] = []
      let i = 0
      while (i < params.length) {
        const param = params[i]!
        if (isSpreadNode(param)) {
          entries.push(param)
          i += 1
        } else {
          const valueParam = params[i + 1]
          if (valueParam === undefined) {
            throw new ParseError(
              'object() requires an even number of non-spread arguments (key-value pairs)',
              symbolSci,
            )
          }
          entries.push([param, valueParam])
          i += 2
        }
      }
      const node = withSourceCodeInfo([NodeTypes.Object, entries, 0], symbolDebugInfo, ctx) as ObjectNode
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
      | typeof specialExpressionTypes.recur
      | typeof specialExpressionTypes.array
      | typeof specialExpressionTypes.perform
      | typeof specialExpressionTypes.object
      | typeof specialExpressionTypes.parallel
      | typeof specialExpressionTypes.race
      | typeof specialExpressionTypes.settled
    >
    const specialExpression: SpecialExpression = builtin.specialExpressions[type]
    assertNumberOfParams(specialExpression.arity, params.length, symbolSci)
    switch (type) {
      // Operands beyond the first run conditionally (short-circuit) — make bare-leaf
      // ones coverable units so they show hit only when reached.
      case specialExpressionTypes['||']: {
        const node = withSourceCodeInfo([NodeTypes.Or, params, 0], symbolDebugInfo, ctx) as OrNode
        for (let i = 1; i < params.length; i++) ctx.clearStructuralLeaf(params[i]![2])
        ctx.setNodeEnd(node[2])
        return node
      }
      case specialExpressionTypes['&&']: {
        const node = withSourceCodeInfo([NodeTypes.And, params, 0], symbolDebugInfo, ctx) as AndNode
        for (let i = 1; i < params.length; i++) ctx.clearStructuralLeaf(params[i]![2])
        ctx.setNodeEnd(node[2])
        return node
      }
      case specialExpressionTypes['??']: {
        const node = withSourceCodeInfo([NodeTypes.Qq, params, 0], symbolDebugInfo, ctx) as QqNode
        for (let i = 1; i < params.length; i++) ctx.clearStructuralLeaf(params[i]![2])
        ctx.setNodeEnd(node[2])
        return node
      }
      case specialExpressionTypes['function']:
        throw new ParseError(`${type} is not allowed`, symbolSci)
      /* v8 ignore next 2 */
      default:
        throw new ParseError(`Unknown special expression: ${type satisfies never}`, symbolSci)
    }
  } else if (isBuiltinSymbolNode(symbol) || isUserDefinedSymbolNode(symbol)) {
    const node = createNamedNormalExpressionNode(symbol, params, symbolDebugInfo, ctx)
    ctx.setNodeEnd(node[2])
    return node
  } else {
    const node = withSourceCodeInfo(
      [NodeTypes.Call, [symbol, params], 0],
      symbolDebugInfo,
      ctx,
    ) as NormalExpressionNodeExpression
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
    throw new ParseError('effect expects a dotted name identifier', ctx.resolveTokenDebugInfo(firstToken[2]))
  }
  let name = firstToken[1]
  ctx.advance()
  while (isOperatorToken(ctx.tryPeek(), '.')) {
    ctx.advance() // skip dot
    const nextToken = ctx.peek()
    if (!isSymbolToken(nextToken)) {
      throw new ParseError('Expected identifier after dot in effect name', ctx.resolveTokenDebugInfo(nextToken[2]))
    }
    name += `.${nextToken[1]}`
    ctx.advance()
  }
  if (!isRParenToken(ctx.tryPeek())) {
    throw new ParseError('Expected closing parenthesis after effect name', ctx.peekSourceCodeInfo())
  }
  ctx.advance()
  const node = withSourceCodeInfo([NodeTypes.Effect, name, 0], symbolDebugInfo, ctx)
  ctx.setNodeEnd(node[2])
  return node
}
