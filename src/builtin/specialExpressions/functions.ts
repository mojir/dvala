import type { ContextStack } from '../../evaluator/ContextStack'
import type { NodeTypes } from '../../constants/constants'
import type { Context } from '../../evaluator/interface'
import type { GetUndefinedSymbols, UndefinedSymbols } from '../../getUndefinedSymbols'
import type {
  DvalaFunction,
} from '../../parser/types'
import { addToSet } from '../../utils'
import { getAllBindingTargetNames, walkDefaults } from '../bindingNode'
import type { Builtin, BuiltinSpecialExpression } from '../interface'
import type { Function } from '../utils'

export type LambdaNode = [typeof NodeTypes.Function, Function, number]

export const lambdaSpecialExpression: BuiltinSpecialExpression<DvalaFunction, LambdaNode> = {
  arity: {},
  getUndefinedSymbols: (node, contextStack, { getUndefinedSymbols, builtin }) => {
    const fn = node[1]
    return getFunctionUnresolvedSymbols(fn, contextStack, getUndefinedSymbols, builtin)
  },

}

export function getFunctionUnresolvedSymbols(
  fn: Function,
  contextStack: ContextStack,
  getUndefinedSymbols: GetUndefinedSymbols,
  builtin: Builtin,
): UndefinedSymbols {
  const result = new Set<string>()
  const newContext: Context = { self: { value: null } }

  fn[0].forEach(arg => {
    Object.assign(newContext, getAllBindingTargetNames(arg))

    walkDefaults(arg, defaultNode => {
      addToSet(result, getUndefinedSymbols([defaultNode], contextStack, builtin))
    })
  })

  const newContextStack = contextStack.create(newContext)
  const overloadResult = getUndefinedSymbols(fn[1], newContextStack, builtin)
  addToSet(result, overloadResult)
  return result
}
