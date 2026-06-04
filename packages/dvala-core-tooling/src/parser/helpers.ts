import type { SpecialExpressionName } from '@mojir/dvala-types'
import { normalExpressions, normalExpressionTypes } from '@mojir/dvala-engine'
import type { AndNode } from '@mojir/dvala-engine'
import { specialExpressionTypes } from '@mojir/dvala-types'
import { NodeTypes } from '@mojir/dvala-types'
import { ParseError } from '@mojir/dvala-types'
import type { OperatorToken, TokenDebugInfo } from '../tokenizer/token'
import { isOperatorToken, isReservedSymbolToken } from '../tokenizer/token'
import { isBuiltinSymbolNode } from '@mojir/dvala-types'
import { assertNumberOfParams } from '@mojir/dvala-types'
import type {
  AstNode,
  BindingTarget,
  BuiltinSymbolNode,
  CallHints,
  NormalExpressionNodeExpression,
  NormalExpressionNodeWithName,
  SymbolNode,
  UserDefinedSymbolNode,
} from '@mojir/dvala-types'
import type { ParserContext } from './ParserContext'

export const exponentiationPrecedence = 12
export const binaryFunctionalOperatorPrecedence = 3

/**
 * Assign a node ID from the parser context. When debug mode is active,
 * the source position is recorded in the source map.
 */
// Node types the evaluator never fires onNodeEval for — excluding them gives accurate expr coverage.
// Includes AST structural leaves (Sym, Builtin, etc.) and binding target types (symbol, literal, etc.).
const structuralLeafTypes = new Set<string>([
  NodeTypes.Sym,
  NodeTypes.Builtin,
  NodeTypes.Special,
  NodeTypes.Reserved,
  NodeTypes.Effect,
  NodeTypes.Binding,
  'symbol',
  'rest',
  'object',
  'array',
  'literal',
  'wildcard',
])

export function withSourceCodeInfo<T extends AstNode | BindingTarget>(
  node: T,
  debugInfo: TokenDebugInfo | undefined,
  ctx: ParserContext,
): T {
  const isLeaf = structuralLeafTypes.has(node[0])
  node[2] = ctx.allocateNodeId(debugInfo, isLeaf || undefined)
  return node
}

export function stringToSymbolNode(
  value: string,
  debugInfo: TokenDebugInfo | undefined,
  ctx: ParserContext,
): SymbolNode {
  if (specialExpressionTypes[value as SpecialExpressionName] !== undefined && value !== 'fn' && value !== 'defn') {
    const node = withSourceCodeInfo(
      [NodeTypes.Special, specialExpressionTypes[value as SpecialExpressionName], 0],
      debugInfo,
      ctx,
    ) satisfies SymbolNode
    ctx.setNodeEnd(node[2])
    return node
  }
  if (normalExpressionTypes.has(value)) {
    const node = withSourceCodeInfo([NodeTypes.Builtin, value, 0], debugInfo, ctx) satisfies SymbolNode
    ctx.setNodeEnd(node[2])
    return node
  }
  const node = withSourceCodeInfo([NodeTypes.Sym, value, 0], debugInfo, ctx) satisfies SymbolNode
  ctx.setNodeEnd(node[2])
  return node
}

export function stringFromQuotedSymbol(value: string): string {
  return value
    .substring(1, value.length - 1)
    .replace(/(\\{2})|(\\')|\\(.)/g, (_, backslash: string, singleQuote: string, normalChar: string) => {
      if (backslash) {
        return '\\'
      }
      if (singleQuote) {
        return "'"
      }
      return `\\${normalChar}`
    })
}

/**
 * Extract the symbol name from any symbol node type.
 * All symbol node types now store the string name directly.
 */
export function getSymbolName(symbol: SymbolNode): string {
  return symbol[1]
}

/**
 * Get the start position of an already-parsed AstNode as TokenDebugInfo,
 * by looking it up in the source map. Used by binary-op parsing so the
 * wrapping `Call` / `And` / `Or` / `Qq` node's range starts at the LEFT
 * operand's first token rather than the operator (which would skew the
 * range and break LS features that rely on full-expression spans).
 * Returns undefined if the node isn't in the source map (typecheck-only
 * or no-source-map parse).
 */
export function nodeStartDebugInfo(node: AstNode, ctx: ParserContext): TokenDebugInfo | undefined {
  const sourceMap = ctx.sourceMap
  if (!sourceMap) return undefined
  const nodeId = node[node.length - 1] as number
  const pos = sourceMap.positions.get(nodeId)
  if (!pos) return undefined
  return [pos.start[0], pos.start[1]]
}

export function createNamedNormalExpressionNode(
  symbolNode: BuiltinSymbolNode | UserDefinedSymbolNode,
  params: AstNode[],
  debugInfo: TokenDebugInfo | undefined,
  ctx: ParserContext,
  hints?: CallHints,
): NormalExpressionNodeWithName {
  const node: NormalExpressionNodeWithName = withSourceCodeInfo(
    [NodeTypes.Call, [symbolNode, params, hints], 0],
    debugInfo,
    ctx,
  )

  if (isBuiltinSymbolNode(symbolNode)) {
    assertNumberOfParams(
      normalExpressions[symbolNode[1]]!.arity,
      node[1][1].length,
      ctx.resolveTokenDebugInfo(debugInfo),
    )
  }

  ctx.setNodeEnd(node[2])
  return node
}

export function isAtExpressionEnd(ctx: ParserContext): boolean {
  if (ctx.isAtEnd()) {
    return true
  }
  const token = ctx.tryPeek()
  if (isOperatorToken(token)) {
    return [';', ',', ':'].includes(token[1])
  }
  if (isReservedSymbolToken(token)) {
    return ['else', 'when', 'while', 'case', 'let', 'then', 'end', 'do'].includes(token[1])
  }
  return false
}

export function fromBinaryOperatorToNode(
  operator: OperatorToken,
  symbolNode: SymbolNode,
  left: AstNode,
  right: AstNode,
  debugInfo: TokenDebugInfo | undefined,
  ctx: ParserContext,
): AstNode {
  const operatorName = operator[1]

  switch (operatorName) {
    case '^': // exponentiation
    case '*':
    case '/':
    case '%':
    case '+':
    case '-':
    case '<<':
    case '>>':
    case '>>>':
    case '++':
    case '<':
    case '<=':
    case '≤':
    case '>':
    case '>=':
    case '≥':
    case '==':
    case '!=':
    case '&':
    case 'xor':
    case '|':
      return createNamedNormalExpressionNode(symbolNode as BuiltinSymbolNode, [left, right], debugInfo, ctx)
    case '|>': {
      // Value pipe: a |> b  →  b(a) — desugared at parse time so macros on the right see AST.
      // isPipe hint lets the formatter reproduce |> rather than nested call form.
      const node = withSourceCodeInfo(
        [NodeTypes.Call, [right, [left], { isPipe: true }], 0],
        debugInfo,
        ctx,
      ) as NormalExpressionNodeExpression
      ctx.setNodeEnd(node[2])
      return node
    }
    case '&&': {
      const node = withSourceCodeInfo([NodeTypes.And, [left, right], 0] as AndNode, debugInfo, ctx)
      ctx.setNodeEnd(node[2])
      return node
    }
    case '||': {
      const node = withSourceCodeInfo([NodeTypes.Or, [left, right], 0], debugInfo, ctx)
      ctx.setNodeEnd(node[2])
      return node
    }
    case '??': {
      const node = withSourceCodeInfo([NodeTypes.Qq, [left, right], 0], debugInfo, ctx)
      ctx.setNodeEnd(node[2])
      return node
    }
    /* v8 ignore next 12 */
    case '.':
    case '?.':
    case '?':
    case ';':
    case ':':
    case '@':
    case '=':
    case ',':
    case '->':
    case '...':
    case '!': // unary prefix, handled in parseOperand — never reaches binary path
      throw new ParseError(`Unknown binary operator: ${operatorName}`, ctx.resolveTokenDebugInfo(debugInfo))
    // Exhaustive check: all operator cases are handled above
    /* v8 ignore next 2 */
    default:
      throw new ParseError(
        `Unknown binary operator: ${operatorName satisfies never}`,
        ctx.resolveTokenDebugInfo(debugInfo),
      )
  }
}
