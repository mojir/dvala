import type { Builtin } from '../builtin/interface'
import type { DoNode } from '../builtin/specialExpressions/block'
import { getAllBindingTargetNames, walkDefaults } from '../builtin/bindingNode'
import { getFunctionUnresolvedSymbols } from '../builtin/specialExpressions/functions'
import type { IfNode } from '../builtin/specialExpressions/if'
import type { Function as DvalaFunctionTuple } from '../builtin/utils'
import { NodeTypes } from '../constants/constants'
import { DvalaError } from '../errors'
import { joinSets } from '../utils'
import type { ContextStack } from '../evaluator/ContextStack'
import type { Ast, AstNode, BindingNode, NormalExpressionNode, SpecialExpressionNode, SpreadNode, TemplateStringNode, UserDefinedSymbolNode } from '../parser/types'
import { addToSet } from '../utils'
import { isNormalExpressionNodeWithName, isUserDefinedSymbolNode } from '../typeGuards/astNode'

export type UndefinedSymbols = Set<string>

export const getUndefinedSymbols: GetUndefinedSymbols = (ast, contextStack, builtin) => {
  const nodes: AstNode[] = Array.isArray(ast)
    ? ast
    : [[NodeTypes.Block, ast.body, 0] satisfies DoNode]

  const unresolvedSymbols = new Set<string>()

  for (const subNode of nodes) {
    findUnresolvedSymbolsInNode(subNode, contextStack, builtin)
      ?.forEach(symbol => unresolvedSymbols.add(symbol))
  }
  return unresolvedSymbols
}

export type GetUndefinedSymbols = (ast: Ast | AstNode[], contextStack: ContextStack, builtin: Builtin) => UndefinedSymbols

function findUnresolvedSymbolsInNode(node: AstNode, contextStack: ContextStack, builtin: Builtin): UndefinedSymbols | null {
  const nodeType = node[0]
  switch (nodeType) {
    case NodeTypes.Sym: {
      const symbolNode = node as UserDefinedSymbolNode
      const lookUpResult = contextStack.lookUp(symbolNode)
      if (lookUpResult === null)
        return new Set([symbolNode[1]])

      return null
    }
    case NodeTypes.Builtin:
    case NodeTypes.Special:
    case NodeTypes.Str:
    case NodeTypes.Num:
    case NodeTypes.Reserved:
    case NodeTypes.Binding:
      return null
    case NodeTypes.Call: {
      const normalExpressionNode = node as NormalExpressionNode
      const unresolvedSymbols = new Set<string>()
      if (isNormalExpressionNodeWithName(normalExpressionNode)) {
        const [, [symbolNode]] = normalExpressionNode
        if (isUserDefinedSymbolNode(symbolNode)) {
          const lookUpResult = contextStack.lookUp(symbolNode)
          if (lookUpResult === null)
            unresolvedSymbols.add(symbolNode[1])
        }
      } else {
        const [, [expressionNode]] = normalExpressionNode
        findUnresolvedSymbolsInNode(expressionNode, contextStack, builtin)?.forEach(symbol => unresolvedSymbols.add(symbol))
      }
      for (const subNode of normalExpressionNode[1][1]) {
        findUnresolvedSymbolsInNode(subNode, contextStack, builtin)?.forEach(symbol => unresolvedSymbols.add(symbol))
      }
      return unresolvedSymbols
    }
    case NodeTypes.SpecialExpression: {
      const specialExpressionNode = node as SpecialExpressionNode
      const specialExpressionType = specialExpressionNode[1][0]
      const specialExpression = builtin.specialExpressions[specialExpressionType]

      const castedGetUndefinedSymbols = specialExpression.getUndefinedSymbols as Function

      return castedGetUndefinedSymbols(specialExpressionNode, contextStack, {
        getUndefinedSymbols,
        builtin,
      }) as UndefinedSymbols
    }
    case NodeTypes.Spread:
      return findUnresolvedSymbolsInNode((node as SpreadNode)[1], contextStack, builtin)
    case NodeTypes.TmplStr: {
      const unresolvedSymbols = new Set<string>()
      for (const segment of (node as TemplateStringNode)[1]) {
        findUnresolvedSymbolsInNode(segment, contextStack, builtin)
          ?.forEach(symbol => unresolvedSymbols.add(symbol))
      }
      return unresolvedSymbols
    }
    case NodeTypes.If: {
      const ifNode = node as IfNode
      const unresolvedSymbols = new Set<string>()
      for (const subNode of (ifNode[1] as AstNode[]).filter(n => !!n)) {
        findUnresolvedSymbolsInNode(subNode, contextStack, builtin)?.forEach(symbol => unresolvedSymbols.add(symbol))
      }
      return unresolvedSymbols
    }
    case NodeTypes.Block: {
      return getUndefinedSymbols(node[1] as AstNode[], contextStack.create({}), builtin)
    }
    case NodeTypes.Effect:
      return null // Effect names are always valid (resolved at runtime)
    case NodeTypes.Recur:
    case NodeTypes.Array: {
      return getUndefinedSymbols(node[1] as AstNode[], contextStack, builtin)
    }
    case NodeTypes.Parallel:
    case NodeTypes.Race: {
      const branches = node[1] as AstNode[]
      const unresolvedSymbols = new Set<string>()
      for (const branch of branches) {
        getUndefinedSymbols([branch], contextStack, builtin)
          ?.forEach(symbol => unresolvedSymbols.add(symbol))
      }
      return unresolvedSymbols
    }
    case NodeTypes.Perform: {
      const [effectExpr, payloadExpr] = node[1] as [AstNode, AstNode | undefined]
      const unresolvedSymbols = new Set<string>()
      getUndefinedSymbols([effectExpr], contextStack, builtin)?.forEach(s => unresolvedSymbols.add(s))
      if (payloadExpr) {
        getUndefinedSymbols([payloadExpr], contextStack, builtin)?.forEach(s => unresolvedSymbols.add(s))
      }
      return unresolvedSymbols
    }
    case NodeTypes.Handle: {
      const [bodyExprs, handlersExpr] = node[1] as [AstNode[], AstNode]
      return joinSets(
        getUndefinedSymbols(bodyExprs, contextStack, builtin),
        getUndefinedSymbols([handlersExpr], contextStack, builtin),
      )
    }
    case NodeTypes.Object:
      return getUndefinedSymbols(node[1] as AstNode[], contextStack, builtin)
    case NodeTypes.And:
    case NodeTypes.Or:
    case NodeTypes.Qq:
      return getUndefinedSymbols(node[1] as AstNode[], contextStack, builtin)
    case NodeTypes.Match: {
      const matchSpecialExpression = builtin.specialExpressions.match
      return matchSpecialExpression.getUndefinedSymbols(node as unknown as Parameters<typeof matchSpecialExpression.getUndefinedSymbols>[0], contextStack, {
        getUndefinedSymbols,
        builtin,
      })
    }
    case NodeTypes.Loop: {
      const loopSpecialExpression = builtin.specialExpressions.loop
      return loopSpecialExpression.getUndefinedSymbols(node as unknown as Parameters<typeof loopSpecialExpression.getUndefinedSymbols>[0], contextStack, {
        getUndefinedSymbols,
        builtin,
      })
    }
    case NodeTypes.For: {
      const forSpecialExpression = builtin.specialExpressions.for
      return forSpecialExpression.getUndefinedSymbols(node as unknown as Parameters<typeof forSpecialExpression.getUndefinedSymbols>[0], contextStack, {
        getUndefinedSymbols,
        builtin,
      })
    }
    case NodeTypes.Import:
      return new Set()
    case NodeTypes.Function: {
      const fn = node[1] as DvalaFunctionTuple
      return getFunctionUnresolvedSymbols(fn, contextStack, getUndefinedSymbols, builtin)
    }
    case NodeTypes.Let: {
      const bindingNode = node[1] as BindingNode
      const target = bindingNode[1][0]
      const value = bindingNode[1][1]
      const bindingResult = getUndefinedSymbols([value as AstNode], contextStack, builtin)
      walkDefaults(target, defaultNode => {
        addToSet(bindingResult, getUndefinedSymbols([defaultNode], contextStack, builtin))
      })
      contextStack.addValues(getAllBindingTargetNames(target), contextStack.resolve(target[2]))
      return bindingResult
    }

    /* v8 ignore next 2 */
    default:
      throw new DvalaError(`Unhandled node type: ${nodeType satisfies never}`, undefined)
  }
}
