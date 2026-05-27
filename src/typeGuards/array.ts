import type { Arr } from '../interface'
import type { SourceCodeInfo } from '@mojir/dvala-types'
import { isPersistentVector } from '@mojir/dvala-types'
import { getAssertionError } from '../utils/getAssertionError'

/** Assert that `value` is a Dvala array (PersistentVector). */
export function asArray(value: unknown, sourceCodeInfo?: SourceCodeInfo): Arr {
  assertArray(value, sourceCodeInfo)
  return value
}
export function assertArray(value: unknown, sourceCodeInfo?: SourceCodeInfo): asserts value is Arr {
  if (!isPersistentVector(value)) throw getAssertionError('array', value, sourceCodeInfo)
}

export function isStringArray(value: unknown): value is Arr {
  if (!isPersistentVector(value)) return false
  for (const item of value) {
    if (typeof item !== 'string') return false
  }
  return true
}
export function asStringArray(value: unknown, sourceCodeInfo?: SourceCodeInfo): Arr {
  assertStringArray(value, sourceCodeInfo)
  return value
}
export function assertStringArray(value: unknown, sourceCodeInfo?: SourceCodeInfo): asserts value is Arr {
  if (!isStringArray(value)) throw getAssertionError('array of strings', value, sourceCodeInfo)
}

export function isCharArray(value: unknown): value is Arr {
  if (!isPersistentVector(value)) return false
  for (const item of value) {
    if (typeof item !== 'string' || item.length !== 1) return false
  }
  return true
}
export function asCharArray(value: unknown, sourceCodeInfo?: SourceCodeInfo): Arr {
  assertCharArray(value, sourceCodeInfo)
  return value
}
export function assertCharArray(value: unknown, sourceCodeInfo?: SourceCodeInfo): asserts value is Arr {
  if (!isCharArray(value)) throw getAssertionError('array of strings', value, sourceCodeInfo)
}
