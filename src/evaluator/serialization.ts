/**
 * DvalaValue Serialization Contract
 *
 * Defines which runtime value types can be serialized to JSON and restored.
 * Used at suspension time to produce clear errors when non-serializable
 * values are found in the continuation stack.
 *
 * Serializable value types:
 *   - Primitives: number, string, boolean, null
 *   - Containers: array, object (if all contents are serializable)
 *   - RegularExpression: stored as {s, f} string data
 *   - UserDefinedFunction: {params, body, capturedEnv} — all plain data
 *   - NormalBuiltinFunction: identified by normalBuiltinSymbolType (number)
 *   - SpecialBuiltinFunction: identified by specialBuiltinSymbolType (number)
 *   - ModuleFunction: identified by {moduleName, functionName}
 *   - PartialFunction, CompFunction, ConstantlyFunction, JuxtFunction,
 *     ComplementFunction, EveryPredFunction, SomePredFunction, FNullFunction:
 *     serializable only if all inner values/functions are serializable
 *   - EffectRef: stored as just the name string
 */

import type { Any } from '../interface'
import { isDvalaFunction } from '../typeGuards/dvalaFunction'
import { isArr, isEffect, isObj, isRegularExpression } from '../typeGuards/dvala'
import type {
  DvalaFunction,
} from '../parser/types'

/**
 * Checks whether a Dvala runtime value is fully JSON-serializable.
 *
 * Returns `true` if the value can be serialized and later restored.
 * Returns `false` if any part of the value contains a non-serializable reference.
 *
 * Uses a `Set` to track visited objects and avoid infinite loops from
 * circular references (which are themselves not serializable).
 */
export function isSerializable(value: Any, visited = new Set<object>()): boolean {
  // Primitives are always serializable
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true
  }

  // Guard against circular references
  if (typeof value === 'object') {
    if (visited.has(value)) {
      return false
    }
    visited.add(value)
  }

  // RegularExpression — just string data {s, f}
  if (isRegularExpression(value)) {
    return true
  }

  // EffectRef — just a name string
  if (isEffect(value)) {
    return true
  }

  // DvalaFunction — check by functionType
  if (isDvalaFunction(value)) {
    return isDvalaFunctionSerializable(value, visited)
  }

  // PersistentVector (Dvala array) — serializable if all elements are
  if (isArr(value)) {
    for (const item of value)
      if (!isSerializable(item as Any, visited))
        return false
    return true
  }

  // PersistentMap (Dvala object) — serializable if all values are
  if (isObj(value)) {
    for (const [, v] of value)
      if (!isSerializable(v as Any, visited))
        return false
    return true
  }

  // Anything else (plain JS arrays/objects from circular reference tests, or unexpected types)
  if (typeof value === 'object') {
    const obj = value as unknown as Record<string, unknown>
    for (const v of Object.values(obj))
      if (!isSerializable(v as Any, visited))
        return false
    return true
  }

  // Anything else (shouldn't happen in well-typed code) is not serializable
  return false
}

function isDvalaFunctionSerializable(fn: DvalaFunction, visited: Set<object>): boolean {
  switch (fn.functionType) {
    // Always serializable — contain only primitive/index data
    case 'UserDefined':
    case 'Builtin':
    case 'SpecialBuiltin':
    case 'Module':
    case 'QualifiedMatcher':
    case 'Handler': // clauseMap (Map) is rebuilt from clauses during deserialization
    case 'Resume': // continuation state rebuilt during deserialization
      return true

    // Conditionally serializable — check inner values/functions
    case 'Partial': {
      const partial = fn
      return isSerializable(partial.function as Any, visited)
        && [...partial.params].every(p => isSerializable(p as Any, visited))
    }

    case 'Comp': {
      const comp = fn
      return [...comp.params].every(p => isSerializable(p as Any, visited))
    }

    case 'Constantly': {
      const constantly = fn
      return isSerializable(constantly.value, visited)
    }

    case 'Juxt': {
      const juxt = fn
      return [...juxt.params].every(p => isSerializable(p as Any, visited))
    }

    case 'Complement': {
      const complement = fn
      return isSerializable(complement.function as Any, visited)
    }

    case 'EveryPred': {
      const everyPred = fn
      return [...everyPred.params].every(p => isSerializable(p as Any, visited))
    }

    case 'SomePred': {
      const somePred = fn
      return [...somePred.params].every(p => isSerializable(p as Any, visited))
    }

    case 'Fnull': {
      const fnull = fn
      return isSerializable(fnull.function as Any, visited)
        && [...fnull.params].every(p => isSerializable(p as Any, visited))
    }

    /* v8 ignore next 2 */
    default:
      return false
  }
}

/**
 * Describes why a value is not serializable.
 * Returns `null` if the value is serializable.
 * Returns a human-readable string describing the first non-serializable
 * component found.
 */
export function describeSerializationIssue(value: Any, path: string = 'value'): string | null {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return null
  }

  if (isRegularExpression(value)) {
    return null
  }

  if (isEffect(value)) {
    return null
  }

  if (isDvalaFunction(value)) {
    if (value.functionType === 'UserDefined' || value.functionType === 'Builtin' || value.functionType === 'SpecialBuiltin' || value.functionType === 'Module' || value.functionType === 'QualifiedMatcher' || value.functionType === 'Handler' || value.functionType === 'Resume') {
      return null
    }

    // Check inner functions for compound function types
    if (value.functionType === 'Partial') {
      const partial = value
      const fnIssue = describeSerializationIssue(partial.function as Any, `${path}.function`)
      if (fnIssue)
        return fnIssue
      for (let i = 0; i < partial.params.size; i++) {
        const paramIssue = describeSerializationIssue(partial.params.get(i) as Any, `${path}.params[${i}]`)
        if (paramIssue)
          return paramIssue
      }
      return null
    }

    if (value.functionType === 'Comp') {
      const comp = value
      for (let i = 0; i < comp.params.size; i++) {
        const paramIssue = describeSerializationIssue(comp.params.get(i) as Any, `${path}.params[${i}]`)
        if (paramIssue)
          return paramIssue
      }
      return null
    }

    if (value.functionType === 'Complement') {
      const complement = value
      return describeSerializationIssue(complement.function as Any, `${path}.function`)
    }

    if (value.functionType === 'Constantly') {
      const constantly = value
      return describeSerializationIssue(constantly.value, `${path}.value`)
    }

    if (value.functionType === 'Juxt') {
      const juxt = value
      for (let i = 0; i < juxt.params.size; i++) {
        const paramIssue = describeSerializationIssue(juxt.params.get(i) as Any, `${path}.params[${i}]`)
        if (paramIssue)
          return paramIssue
      }
      return null
    }

    if (value.functionType === 'EveryPred') {
      const everyPred = value
      for (let i = 0; i < everyPred.params.size; i++) {
        const paramIssue = describeSerializationIssue(everyPred.params.get(i) as Any, `${path}.params[${i}]`)
        if (paramIssue)
          return paramIssue
      }
      return null
    }

    if (value.functionType === 'SomePred') {
      const somePred = value
      for (let i = 0; i < somePred.params.size; i++) {
        const paramIssue = describeSerializationIssue(somePred.params.get(i) as Any, `${path}.params[${i}]`)
        if (paramIssue)
          return paramIssue
      }
      return null
    }

    if (value.functionType === 'Fnull') {
      const fnull = value
      const fnIssue = describeSerializationIssue(fnull.function as Any, `${path}.function`)
      if (fnIssue)
        return fnIssue
      for (let i = 0; i < fnull.params.size; i++) {
        const paramIssue = describeSerializationIssue(fnull.params.get(i) as Any, `${path}.params[${i}]`)
        if (paramIssue)
          return paramIssue
      }
      return null
    }

    return `${path} has unknown function type ${value}`
  }

  // PersistentVector (Dvala array) — check each element
  if (isArr(value)) {
    let i = 0
    for (const item of value) {
      const issue = describeSerializationIssue(item as Any, `${path}[${i}]`)
      if (issue)
        return issue
      i++
    }
    return null
  }

  // PersistentMap (Dvala object) — check each value
  if (isObj(value)) {
    for (const [key, v] of value) {
      const issue = describeSerializationIssue(v as Any, `${path}.${key}`)
      if (issue)
        return issue
    }
    return null
  }

  // Fallback for plain objects (unexpected in normal usage, but handled for robustness)
  if (typeof value === 'object') {
    const obj = value as unknown as Record<string, unknown>
    for (const [key, v] of Object.entries(obj)) {
      const issue = describeSerializationIssue(v as Any, `${path}.${key}`)
      if (issue)
        return issue
    }
    return null
  }

  return `${path} has unexpected type ${typeof value}`
}
