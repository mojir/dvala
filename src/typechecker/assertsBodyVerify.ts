import { NodeTypes, isNodeType } from '../constants/constants'
import { resolveSourceCodeInfo } from '../parser/types'
import type { Ast, AstNode, BindingTarget } from '../parser/types'
import { bindingTargetTypes } from '../parser/types'
import { parseTypeAnnotation, TypeParseError } from './parseType'
import { simplify } from './simplify'
import type { TypeDiagnostic } from './typecheck'

export function verifyAssertionFunctionBodies(ast: Ast): TypeDiagnostic[] {
  if (!ast.typeAnnotations || ast.typeAnnotations.size === 0) return []

  const diagnostics: TypeDiagnostic[] = []
  for (const node of ast.body) {
    visitNode(node, ast, diagnostics)
  }
  return diagnostics
}

function visitNode(node: AstNode, ast: Ast, diagnostics: TypeDiagnostic[]): void {
  if (node[0] === NodeTypes.Let) {
    inspectAssertionFunctionBinding(node, ast, diagnostics)
  }
  walkAstChildren(node, ast, diagnostics, true)
}

function inspectAssertionFunctionBinding(node: AstNode, ast: Ast, diagnostics: TypeDiagnostic[]): void {
  const [binding, valueNode] = node[1] as [BindingTarget, AstNode]
  if (valueNode[0] !== NodeTypes.Function) return

  const annotation = ast.typeAnnotations?.get(binding[2])
  if (!annotation) return

  try {
    const declaredType = simplify(parseTypeAnnotation(annotation))
    if (declaredType.tag !== 'Function' || !declaredType.asserts) return
  } catch (error) {
    if (error instanceof TypeParseError) return
    throw error
  }

  const [, bodyNodes] = valueNode[1] as [AstNode[], AstNode[]]
  const bindingName = getSymbolBindingName(binding)
  if (bindingName) {
    for (const recursiveCallNode of findDirectRecursiveCalls(bodyNodes, bindingName)) {
      diagnostics.push({
        message: `Assertion function '${bindingName}' may not recurse.`,
        severity: 'error',
        sourceCodeInfo: resolveNodeSourceInfo(recursiveCallNode, ast),
      })
    }
  }
  for (const withHandlerNode of findWithHandlerNodes(bodyNodes)) {
    diagnostics.push({
      message: 'Assertion function bodies may not install handlers with `do with ... end`.',
      severity: 'error',
      sourceCodeInfo: resolveNodeSourceInfo(withHandlerNode, ast),
    })
  }
}

function findWithHandlerNodes(nodes: AstNode[]): AstNode[] {
  const hits: AstNode[] = []
  for (const node of nodes) {
    visitBodyNode(node, hits, true)
  }
  return hits
}

function findDirectRecursiveCalls(nodes: AstNode[], bindingName: string): AstNode[] {
  const hits: AstNode[] = []
  for (const node of nodes) {
    visitBodyNode(node, hits, true, bindingName)
  }
  return hits
}

function visitBodyNode(node: AstNode, hits: AstNode[], allowNestedFunctions: boolean, bindingName?: string): void {
  if (node[0] === NodeTypes.WithHandler) {
    hits.push(node)
  }
  if (bindingName && node[0] === NodeTypes.Call) {
    const [calleeNode] = node[1] as [AstNode, AstNode[]]
    if (calleeNode[0] === NodeTypes.Sym && calleeNode[1] === bindingName) {
      hits.push(node)
    }
  }
  if (node[0] === NodeTypes.Function && !allowNestedFunctions) {
    return
  }
  walkBodyChildren(node[1], hits, node[0] === NodeTypes.Function ? false : allowNestedFunctions, bindingName)
}

function walkAstChildren(node: AstNode, ast: Ast, diagnostics: TypeDiagnostic[], allowNestedFunctions: boolean): void {
  if (node[0] === NodeTypes.Function && !allowNestedFunctions) {
    return
  }
  walkAstValue(node[1], ast, diagnostics, node[0] === NodeTypes.Function ? true : allowNestedFunctions)
}

function walkAstValue(value: unknown, ast: Ast, diagnostics: TypeDiagnostic[], allowNestedFunctions: boolean): void {
  if (isAstNode(value)) {
    visitNodeWithMode(value, ast, diagnostics, allowNestedFunctions)
    return
  }
  if (!Array.isArray(value)) return
  for (const item of value) {
    walkAstValue(item, ast, diagnostics, allowNestedFunctions)
  }
}

function walkBodyChildren(value: unknown, hits: AstNode[], allowNestedFunctions: boolean, bindingName?: string): void {
  if (isAstNode(value)) {
    visitBodyNode(value, hits, allowNestedFunctions, bindingName)
    return
  }
  if (!Array.isArray(value)) return
  for (const item of value) {
    walkBodyChildren(item, hits, allowNestedFunctions, bindingName)
  }
}

function visitNodeWithMode(node: AstNode, ast: Ast, diagnostics: TypeDiagnostic[], allowNestedFunctions: boolean): void {
  if (node[0] === NodeTypes.Let) {
    inspectAssertionFunctionBinding(node, ast, diagnostics)
  }
  walkAstChildren(node, ast, diagnostics, allowNestedFunctions)
}

function isAstNode(value: unknown): value is AstNode {
  return Array.isArray(value) && value.length >= 3 && isNodeType(value[0])
}

function getSymbolBindingName(binding: BindingTarget): string | undefined {
  if (binding[0] !== bindingTargetTypes.symbol) return undefined
  const [nameNode] = binding[1] as [AstNode, AstNode | undefined]
  return nameNode[0] === NodeTypes.Sym ? nameNode[1] as string : undefined
}

function resolveNodeSourceInfo(node: AstNode, ast: Ast) {
  const nodeId = node[2]
  if (!ast.sourceMap || nodeId <= 0) return undefined
  return resolveSourceCodeInfo(nodeId, ast.sourceMap) ?? undefined
}
