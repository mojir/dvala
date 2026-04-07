/**
 * Host interop: deep conversion between Dvala's internal persistent
 * representations and plain JS arrays/objects.
 *
 * Used at all four boundaries where Dvala values cross into host code:
 *   1. dvala.run() return value        — persistent → JS
 *   2. Effect handler arguments        — persistent → JS before handler call
 *   3. Effect handler return values    — JS → persistent when resuming
 *   4. bindings on entry               — JS → persistent
 *
 * Also used at module boundaries for modules that will eventually be
 * rewritten in Dvala but currently operate on plain JS internally.
 *
 * Conversion is deep and recursive — nested arrays/objects are fully converted.
 */

import type { Any } from '../interface'
import { isPersistentMap, isPersistentVector, PersistentMap, PersistentVector } from './persistent'
import { isEffect, isRegularExpression } from '../typeGuards/dvala'
import { isDvalaFunction } from '../typeGuards/dvalaFunction'

/** Convert a Dvala runtime value to a plain JS value (deep). */
export function toJS(value: Any): unknown {
  if (value === null || typeof value !== 'object')
    return value

  if (isRegularExpression(value) || isEffect(value) || isDvalaFunction(value))
    return value

  if (isPersistentVector(value)) {
    const result: unknown[] = []
    for (const item of value) result.push(toJS(item as Any))
    return result
  }

  if (isPersistentMap(value)) {
    const result: Record<string, unknown> = {}
    for (const [k, v] of value) result[k] = toJS(v as Any)
    return result
  }

  // Plain JS value (e.g. RegExp, already-converted value) — pass through
  return value
}

/** Convert a plain JS value to a Dvala runtime value (deep). */
export function fromJS(value: unknown): Any {
  if (value === null || typeof value !== 'object')
    return value as Any

  if (isRegularExpression(value) || isEffect(value) || isDvalaFunction(value))
    return value as Any

  // Already persistent — pass through
  if (isPersistentVector(value) || isPersistentMap(value))
    return value as Any

  if (Array.isArray(value)) {
    let vec = PersistentVector.empty<Any>()
    for (const item of value) vec = vec.append(fromJS(item))
    return vec
  }

  // typeof value === 'object' is guaranteed by the early return above
  let map = PersistentMap.empty<Any>()
  for (const [k, v] of Object.entries(value as Record<string, unknown>))
    map = map.assoc(k, fromJS(v))
  return map
}
