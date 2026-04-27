import { NodeTypes } from '../constants/constants'
import type {
  AstNode,
  ExpressionNode,
  BuiltinSymbolNode,
  NormalExpressionNode,
  NormalExpressionNodeWithName,
  SpecialSymbolNode,
  SpreadNode,
  SymbolNode,
  UserDefinedSymbolNode,
} from '../parser/types'
import type { SourceCodeInfo } from '../tokenizer/token'
import { getAssertionError } from '../utils/getAssertionError'

export function isSymbolNode(node: AstNode): node is SymbolNode {
  const nodeType = node[0]
  return NodeTypes.Sym === nodeType || NodeTypes.Builtin === nodeType || NodeTypes.Special === nodeType
}
export function asSymbolNode(node: AstNode, sourceCodeInfo?: SourceCodeInfo): SymbolNode {
  assertSymbolNode(node, sourceCodeInfo)
  return node
}
export function assertSymbolNode(node: AstNode, sourceCodeInfo?: SourceCodeInfo): asserts node is SymbolNode {
  if (!isSymbolNode(node)) throw getAssertionError('SymbolNode', node, sourceCodeInfo)
}

export function isUserDefinedSymbolNode(node: AstNode): node is UserDefinedSymbolNode {
  return NodeTypes.Sym === node[0]
}
export function asUserDefinedSymbolNode(node: AstNode, sourceCodeInfo?: SourceCodeInfo): UserDefinedSymbolNode {
  assertUserDefinedSymbolNode(node, sourceCodeInfo)
  return node
}
function assertUserDefinedSymbolNode(
  node: AstNode,
  sourceCodeInfo?: SourceCodeInfo,
): asserts node is UserDefinedSymbolNode {
  if (!isUserDefinedSymbolNode(node)) throw getAssertionError('SymNode', node, sourceCodeInfo)
}

export function isBuiltinSymbolNode(node: AstNode): node is BuiltinSymbolNode {
  return NodeTypes.Builtin === node[0]
}

export function isSpecialSymbolNode(node: AstNode): node is SpecialSymbolNode {
  return NodeTypes.Special === node[0]
}

export function isNormalExpressionNode(node: AstNode): node is NormalExpressionNode {
  return node[0] === NodeTypes.Call
}
export function asNormalExpressionNode(node: AstNode, sourceCodeInfo?: SourceCodeInfo): NormalExpressionNode {
  assertNormalExpressionNode(node, sourceCodeInfo)
  return node
}
export function assertNormalExpressionNode(
  node: AstNode,
  sourceCodeInfo?: SourceCodeInfo,
): asserts node is NormalExpressionNode {
  if (!isNormalExpressionNode(node)) throw getAssertionError('NormalExpressionNode', node, sourceCodeInfo)
}

export function isNormalExpressionNodeWithName(node: AstNode): node is NormalExpressionNodeWithName {
  if (!isNormalExpressionNode(node)) {
    return false
  }
  return isSymbolNode(node[1][0])
}
export function asNormalExpressionNodeWithName(
  node: AstNode,
  sourceCodeInfo?: SourceCodeInfo,
): NormalExpressionNodeWithName {
  assertNormalExpressionNodeWithName(node, sourceCodeInfo)
  return node
}
export function assertNormalExpressionNodeWithName(
  node: AstNode,
  sourceCodeInfo?: SourceCodeInfo,
): asserts node is NormalExpressionNodeWithName {
  if (!isNormalExpressionNodeWithName(node))
    throw getAssertionError('NormalExpressionNodeWithName', node, sourceCodeInfo)
}

export function isExpressionNode(node: AstNode): node is ExpressionNode {
  return (
    isNormalExpressionNode(node) ||
    node[0] === NodeTypes.SpecialExpression ||
    node[0] === NodeTypes.Num ||
    node[0] === NodeTypes.Str ||
    node[0] === NodeTypes.TmplStr
  )
}
export function asExpressionNode(node: AstNode, sourceCodeInfo?: SourceCodeInfo): ExpressionNode {
  assertExpressionNode(node, sourceCodeInfo)
  return node
}
export function assertExpressionNode(node: AstNode, sourceCodeInfo?: SourceCodeInfo): asserts node is ExpressionNode {
  if (!isExpressionNode(node)) throw getAssertionError('ExpressionNode', node, sourceCodeInfo)
}

export function isSpreadNode(node: AstNode): node is SpreadNode {
  return node[0] === NodeTypes.Spread
}
