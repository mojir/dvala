import type { Any, Coll, Obj } from '../interface'
import type { SourceCodeInfo } from '../tokenizer/token'
import { isAtom, isColl, isObj, isRegularExpression } from '../typeGuards/dvala'
import { isNumber } from '../typeGuards/number'
import { asString, assertStringOrNumber } from '../typeGuards/string'
import { isUnknownRecord } from '../typeGuards'
import { TypeError } from '../errors'
import { isPersistentMap, isPersistentVector, PersistentMap } from './persistent'

export function collHasKey(coll: unknown, key: string | number): boolean {
  if (!isColl(coll))
    return false

  if (typeof coll === 'string') {
    if (!isNumber(key, { integer: true }))
      return false
    return key >= 0 && key < coll.length
  }

  if (isPersistentVector(coll)) {
    if (!isNumber(key, { integer: true }))
      return false
    return key >= 0 && key < coll.size
  }

  if (isPersistentMap(coll)) {
    return coll.has(String(key))
  }

  return false
}

export function compare(a: unknown, b: unknown, sourceCodeInfo: SourceCodeInfo | undefined): number {
  // Atoms compare alphabetically by name
  if (isAtom(a) && isAtom(b)) {
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  }

  assertStringOrNumber(a, sourceCodeInfo)
  assertStringOrNumber(b, sourceCodeInfo)

  if (typeof a === 'string' && typeof b === 'string') {
    return a < b ? -1 : a > b ? 1 : 0
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.sign((a) - (b))
  }
  throw new TypeError(`Cannot compare values of different types: ${typeof a} and ${typeof b}`, sourceCodeInfo)
}

export function deepEqual(a: unknown, b: unknown, sourceCodeInfo?: SourceCodeInfo): boolean {
  if (a === b)
    return true

  if (typeof a === 'number' && typeof b === 'number')
    return approxEqual(a, b)

  // Atoms — structural equality by name
  if (isAtom(a) && isAtom(b))
    return a.name === b.name

  // Persistent vectors — structural equality
  if (isPersistentVector(a) && isPersistentVector(b)) {
    if (a.size !== b.size)
      return false
    let i = 0
    for (const item of a) {
      if (!deepEqual(item, b.get(i), sourceCodeInfo))
        return false
      i++
    }
    return true
  }

  // Plain JS arrays — structural equality (used for toJS()-converted run() results)
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length)
      return false
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i], sourceCodeInfo))
        return false
    }
    return true
  }

  // Persistent maps — structural equality
  if (isPersistentMap(a) && isPersistentMap(b)) {
    if (a.size !== b.size)
      return false
    for (const [key, val] of a) {
      if (!b.has(key))
        return false
      if (!deepEqual(val, b.get(key), sourceCodeInfo))
        return false
    }
    return true
  }

  if (isRegularExpression(a) && isRegularExpression(b))
    return a.s === b.s && a.f === b.f

  // Plain JS records (internal frame data, not Dvala values)
  if (isUnknownRecord(a) && isUnknownRecord(b)) {
    const aKeys = Object.keys(a)
    const bKeys = Object.keys(b)
    if (aKeys.length !== bKeys.length)
      return false

    for (let i = 0; i < aKeys.length; i += 1) {
      const key = asString(aKeys[i], sourceCodeInfo)
      if (!deepEqual(a[key], b[key], sourceCodeInfo))
        return false
    }
    return true
  }
  return false
}

export function toNonNegativeInteger(num: number): number {
  return Math.max(0, Math.ceil(num))
}

export function toAny(value: unknown): Any {
  return (value ?? null) as Any
}

function cloneValue<T>(value: T): T {
  if (isPersistentMap(value)) {
    // PersistentMap is already immutable — return as-is (structural sharing)
    return value
  }
  if (isPersistentVector(value)) {
    // PersistentVector is already immutable — return as-is
    return value
  }
  if (isObj(value)) {
    // Internal plain-object clone (should rarely be needed after HAMT migration)
    return Object.entries(value as Obj).reduce((result: Obj, [key, val]) => {
      return result.assoc(key, cloneValue(val))
    }, PersistentMap.empty()) as unknown as T
  }
  return value
}

export function cloneColl<T extends Coll>(value: T): T {
  return cloneValue(value)
}

export function joinSets<T>(...results: Set<T>[]): Set<T> {
  const result = new Set<T>()
  for (const symbols of results)
    symbols.forEach(symbol => result.add(symbol))

  return result
}

export function addToSet<T>(target: Set<T>, source: Set<T>): void {
  source.forEach(symbol => target.add(symbol))
}

export const EPSILON = 1e-10

export function approxEqual(a: number, b: number, epsilon: number = EPSILON): boolean {
  if (a === b) {
    return true
  }

  const diff = Math.abs(a - b)

  if (a === 0 || b === 0 || diff < epsilon) {
    // Use absolute error for values near zero
    return diff < epsilon
  }
  const absA = Math.abs(a)
  const absB = Math.abs(b)

  // Use relative error for larger values
  return diff / (absA + absB) < epsilon
}

export function approxZero(value: number): boolean {
  return Math.abs(value) < EPSILON
}

export function smartTrim(str: string, minIndent = 0): string {
  const lines = str.split('\n')
  while (lines[0]?.match(/^\s*$/)) {
    lines.shift() // Remove leading empty lines
  }
  while (lines[lines.length - 1]?.match(/^\s*$/)) {
    lines.pop() // Remove trailing empty lines
  }
  const indent = lines.reduce((acc, line) => {
    if (line.match(/^\s*$/))
      return acc // Skip empty lines
    const lineIndent = line.match(/^\s*/)![0].length
    return Math.min(acc, lineIndent)
  }, Infinity)
  return lines.map(line => ' '.repeat(minIndent) + line.slice(indent)).join('\n').trimEnd()
}
