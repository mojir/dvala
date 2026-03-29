import type { DvalaFunction, HandlerFunction, MacroFunction, NormalBuiltinFunction, UserDefinedFunction } from '../parser/types'
import type { SourceCodeInfo } from '../tokenizer/token'
import { getAssertionError } from '../utils/getAssertionError'
import { FUNCTION_SYMBOL } from '../utils/symbols'
import { isUnknownRecord } from '.'

export function isDvalaFunction(value: unknown): value is DvalaFunction {
  if (value === null || typeof value !== 'object')
    return false

  return !!(value as DvalaFunction)[FUNCTION_SYMBOL]
}
export function asDvalaFunction(value: unknown, sourceCodeInfo?: SourceCodeInfo): DvalaFunction {
  assertDvalaFunction(value, sourceCodeInfo)
  return value
}
export function assertDvalaFunction(value: unknown, sourceCodeInfo?: SourceCodeInfo): asserts value is DvalaFunction {
  if (!isDvalaFunction(value))
    throw getAssertionError('DvalaFunction', value, sourceCodeInfo)
}

export function isUserDefinedFunction(value: unknown): value is UserDefinedFunction {
  return isDvalaFunction(value) && value.functionType === 'UserDefined'
}
export function asUserDefinedFunction(value: unknown, sourceCodeInfo?: SourceCodeInfo): UserDefinedFunction {
  assertUserDefinedFunction(value, sourceCodeInfo)
  return value
}
export function assertUserDefinedFunction(
  value: unknown,
  sourceCodeInfo?: SourceCodeInfo,
): asserts value is UserDefinedFunction {
  if (!isUserDefinedFunction(value))
    throw getAssertionError('UserDefinedFunction', value, sourceCodeInfo)
}

export function isMacroFunction(value: unknown): value is MacroFunction {
  return isDvalaFunction(value) && value.functionType === 'Macro'
}

export function isBuiltinFunction(value: unknown): value is NormalBuiltinFunction {
  return isUnknownRecord(value) && value.functionType === 'Builtin'
}

export function isHandlerFunction(value: unknown): value is HandlerFunction {
  return isDvalaFunction(value) && value.functionType === 'Handler'
}
