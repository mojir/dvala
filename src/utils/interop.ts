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

/**
 * Recursively validate that a host value can be represented in Dvala.
 * Throws TypeError for invalid types (undefined, functions, symbols, bigint,
 * Date, Map, Set, class instances, circular references).
 *
 * @param value   The value to validate
 * @param context Human-readable description of the boundary (e.g. 'resume() in handler for "fetch"')
 * @param seen    Set for circular reference detection
 * @param path    Dot-path to current position for error messages (e.g. '.user.tags[0]')
 */
export function assertValidHostValue(value: unknown, context: string, seen = new Set<unknown>(), path: string = ''): void {
  // Primitives
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return

  if (value === undefined)
    throw new TypeError(`${context}: undefined${path ? ` at ${path}` : ''} is not a valid Dvala value. Use null instead.`)

  if (typeof value === 'function')
    throw new TypeError(`${context}: JS functions${path ? ` at ${path}` : ''} cannot enter the Dvala runtime.`)

  if (typeof value === 'symbol')
    throw new TypeError(`${context}: Symbols${path ? ` at ${path}` : ''} are not valid Dvala values.`)

  if (typeof value === 'bigint')
    throw new TypeError(`${context}: BigInt${path ? ` at ${path}` : ''} is not supported. Convert to number first.`)

  // Already a Dvala value — no further validation needed
  if (isRegularExpression(value) || isEffect(value) || isDvalaFunction(value))
    return
  if (isPersistentVector(value) || isPersistentMap(value))
    return

  // Must be an object at this point
  if (typeof value !== 'object')
    return

  // Circular reference detection
  if (seen.has(value))
    throw new TypeError(`${context}: Circular reference${path ? ` at ${path}` : ''} is not supported.`)
  seen.add(value)

  // Reject known non-serializable object types
  if (value instanceof Date)
    throw new TypeError(`${context}: Date objects${path ? ` at ${path}` : ''} are not valid Dvala values. Use date.toISOString() or date.getTime().`)
  if (value instanceof Map)
    throw new TypeError(`${context}: Map${path ? ` at ${path}` : ''} is not a valid Dvala value. Convert to a plain object first.`)
  if (value instanceof Set)
    throw new TypeError(`${context}: Set${path ? ` at ${path}` : ''} is not a valid Dvala value. Convert to an array first.`)
  if (value instanceof RegExp)
    throw new TypeError(`${context}: RegExp${path ? ` at ${path}` : ''} is not a valid Dvala value. Use regex("pattern") in Dvala instead.`)

  // Reject class instances (non-plain objects)
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++)
      assertValidHostValue(value[i], context, seen, `${path}[${i}]`)
    return
  }

  // Reject non-plain objects (class instances with a non-Object prototype)
  const proto = Object.getPrototypeOf(value)
  if (proto !== null && proto !== Object.prototype)
    throw new TypeError(`${context}: Class instance (${(value).constructor?.name ?? 'unknown'})${path ? ` at ${path}` : ''} is not a valid Dvala value. Spread to a plain object first: { ...instance }`)

  // Plain object — validate all values
  for (const [k, v] of Object.entries(value as Record<string, unknown>))
    assertValidHostValue(v, context, seen, path ? `${path}.${k}` : `.${k}`)
}

/**
 * Convert a plain JS value to a Dvala runtime value, with validation.
 * Throws TypeError for values that cannot be represented in Dvala.
 *
 * Used at all host boundaries where external values enter the runtime.
 */
export function validateFromJS(value: unknown, context: string): Any {
  assertValidHostValue(value, context)
  return fromJS(value)
}

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
