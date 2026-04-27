import type { SpecialExpressionName } from '.'
import { RuntimeError } from '../errors'
import type { ContextStack } from '../evaluator/ContextStack'
import type { AstNode, BindingTarget } from '../parser/types'
import { isReservedSymbol } from '../tokenizer/reservedNames'
import type { SourceCodeInfo } from '../tokenizer/token'
import type { Builtin } from './interface'
import { specialExpressionTypes } from './specialExpressionTypes'

/**
 * Formatting hint stored in Function node payloads.
 * Set at parse time to preserve the shorthand lambda form through formatting.
 */
interface FunctionHints {
  /** True when authored as shorthand: `-> $ + 1` rather than `($) -> $ + 1`. */
  isShorthand?: boolean
}

export type Function = [BindingTarget[], AstNode[], FunctionHints?]

export function assertNameNotDefined<T>(
  name: T,
  contextStack: ContextStack,
  builtin: Builtin,
  sourceCodeInfo?: SourceCodeInfo,
): asserts name is T {
  if (typeof name !== 'string')
    return

  // TODO only subset of special expressions are necessary to check (CommonSpecialExpressionType)
  if (specialExpressionTypes[name as SpecialExpressionName])
    throw new RuntimeError(`Cannot define variable ${name}, it's a special expression.`, sourceCodeInfo)

  if (builtin.normalExpressions[name])
    throw new RuntimeError(`Cannot define variable ${name}, it's a builtin function.`, sourceCodeInfo)

  if (isReservedSymbol(name))
    throw new RuntimeError(`Cannot define variable ${name}, it's a reserved name.`, sourceCodeInfo)

  if (contextStack.globalContext[name])
    throw new RuntimeError(`Name already defined "${name}".`, sourceCodeInfo)
}
