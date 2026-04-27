import { TypeError } from '../errors'
import type { UnknownRecord } from '../interface'
import type { SourceCodeInfo } from '../tokenizer/token'
import { isPersistentMap, isPersistentVector } from '../utils/persistent'
import { valueToString } from '../utils/debug/debugTools'
import { getSourceCodeInfo } from '../utils/debug/getSourceCodeInfo'

function isNonUndefined<T>(value: T | undefined): value is T {
  return value !== undefined
}

export function asNonUndefined<T>(value: T | undefined, sourceCodeInfo?: SourceCodeInfo): T {
  assertNonUndefined(value, sourceCodeInfo)
  return value
}

export function assertNonUndefined<T>(value: T | undefined, sourceCodeInfo?: SourceCodeInfo): asserts value is T {
  if (!isNonUndefined(value)) throw new TypeError('Unexpected undefined', getSourceCodeInfo(value, sourceCodeInfo))
}

/**
 * Returns true if `value` is a plain JS record (not a Dvala PersistentVector,
 * PersistentMap, RegExp, or other special object). Used for internal frame
 * data, not for Dvala value checks (use `isObj` for Dvala objects).
 */
export function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !isPersistentVector(value) &&
    !isPersistentMap(value)
  )
}

export function assertUnknownRecord(value: unknown, sourceCodeInfo?: SourceCodeInfo): asserts value is UnknownRecord {
  if (!isUnknownRecord(value)) {
    throw new TypeError(
      `Expected ${'UnknownRecord'}, got ${valueToString(value)}.`,
      getSourceCodeInfo(value, sourceCodeInfo),
    )
  }
}

export function asUnknownRecord(value: unknown, sourceCodeInfo?: SourceCodeInfo): UnknownRecord {
  assertUnknownRecord(value, sourceCodeInfo)
  return value
}
