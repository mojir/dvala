import type { DvalaFunction, NativeJsFunction, NormalBuiltinFunction, UserDefinedFunction } from '../parser/types'
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
    throw getAssertionError('NativeJsFunction', value, sourceCodeInfo)
}

export function isNativeJsFunction(value: unknown): value is NativeJsFunction {
  return isDvalaFunction(value) && value.functionType === 'NativeJsFunction'
}
export function asNativeJsFunction(value: unknown, sourceCodeInfo?: SourceCodeInfo): NativeJsFunction {
  assertNativeJsFunction(value, sourceCodeInfo)
  return value
}
export function assertNativeJsFunction(
  value: unknown,
  sourceCodeInfo?: SourceCodeInfo,
): asserts value is NativeJsFunction {
  if (!isNativeJsFunction(value))
    throw getAssertionError('NativeJsFunction', value, sourceCodeInfo)
}

export function isBuiltinFunction(value: unknown): value is NormalBuiltinFunction {
  return isUnknownRecord(value) && value.functionType === 'Builtin'
}
