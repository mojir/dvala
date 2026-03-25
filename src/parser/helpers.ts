import type { SpecialExpressionName } from '../builtin'
import { normalExpressions, normalExpressionTypes } from '../builtin/normalExpressions'
import type { AndNode } from '../builtin/specialExpressions/and'
import type { HandleNode } from '../builtin/specialExpressions/handle'
import { specialExpressionTypes } from '../builtin/specialExpressionTypes'
import { NodeTypes } from '../constants/constants'
import { DvalaError } from '../errors'
import type { OperatorToken, TokenDebugInfo } from '../tokenizer/token'
import { isOperatorToken, isReservedSymbolToken } from '../tokenizer/token'
import { isBuiltinSymbolNode } from '../typeGuards/astNode'
import { assertNumberOfParams } from '../utils/arity'
import type { AstNode, BindingTarget, BuiltinSymbolNode, NormalExpressionNodeExpression, NormalExpressionNodeWithName, SymbolNode, UserDefinedSymbolNode } from './types'
import type { ParserContext } from './ParserContext'

export const exponentiationPrecedence = 12
export const binaryFunctionalOperatorPrecedence = 3

/**
 * Assign a node ID from the parser context. When debug mode is active,
 * the source position is recorded in the source map.
 */
export function withSourceCodeInfo<T extends AstNode | BindingTarget>(node: T, debugInfo: TokenDebugInfo | undefined, ctx: ParserContext): T {
  node[2] = ctx.allocateNodeId(debugInfo)
  return node
}

export function stringToSymbolNode(value: string, debugInfo: TokenDebugInfo | undefined, ctx: ParserContext): SymbolNode {
  if (specialExpressionTypes[value as SpecialExpressionName] !== undefined && value !== 'fn' && value !== 'defn') {
    const node = withSourceCodeInfo([NodeTypes.Special, specialExpressionTypes[value as SpecialExpressionName], 0], debugInfo, ctx) satisfies SymbolNode
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
  return value.substring(1, value.length - 1)
    .replace(
      /(\\{2})|(\\')|\\(.)/g,
      (
        _,
        backslash: string,
        singleQuote: string,
        normalChar: string,
      ) => {
        if (backslash) {
          return '\\'
        }
        if (singleQuote) {
          return '\''
        }
        return `\\${normalChar}`
      },
    )
}

/**
 * Extract the symbol name from any symbol node type.
 * All symbol node types now store the string name directly.
 */
export function getSymbolName(symbol: SymbolNode): string {
  return symbol[1]
}

export function createNamedNormalExpressionNode(symbolNode: BuiltinSymbolNode | UserDefinedSymbolNode, params: AstNode[], debugInfo: TokenDebugInfo | undefined, ctx: ParserContext): NormalExpressionNodeWithName {
  const node: NormalExpressionNodeWithName = withSourceCodeInfo([NodeTypes.Call, [symbolNode, params], 0], debugInfo, ctx)

  if (isBuiltinSymbolNode(symbolNode)) {
    assertNumberOfParams(normalExpressions[symbolNode[1]]!.arity, node[1][1].length, ctx.resolveTokenDebugInfo(debugInfo))
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

export function fromBinaryOperatorToNode(operator: OperatorToken, symbolNode: SymbolNode, left: AstNode, right: AstNode, debugInfo: TokenDebugInfo | undefined, ctx: ParserContext): AstNode {
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
      // Value pipe: a |> b  →  b(a) — desugared at parse time so macros on the right see AST
      const node = withSourceCodeInfo([NodeTypes.Call, [right, [left]], 0], debugInfo, ctx) as NormalExpressionNodeExpression
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
    case '||>': {
      // Effect pipe: expr ||> handler  →  handle expr with handler end
      const node = withSourceCodeInfo([NodeTypes.Handle, [[left], right], 0], debugInfo, ctx) as HandleNode
      ctx.setNodeEnd(node[2])
      return node
    }
    /* v8 ignore next 11 */
    case '.':
    case ';':
    case ':':
    case '=':
    case ',':
    case '->':
    case '...':
      throw new DvalaError(`Unknown binary operator: ${operatorName}`, ctx.resolveTokenDebugInfo(debugInfo))
    // Exhaustive check: all operator cases are handled above
    /* v8 ignore next 2 */
    default:
      throw new DvalaError(`Unknown binary operator: ${operatorName satisfies never}`, ctx.resolveTokenDebugInfo(debugInfo))
  }
}
