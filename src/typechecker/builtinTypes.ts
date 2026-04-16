/**
 * Builtin type registry — parses type annotation strings from builtin docs
 * into Type values, cached for lookup during inference.
 */

import type { Type } from './types'
import { Unknown } from './types'
import { parseFunctionTypeAnnotation, type ParsedFunctionType } from './parseType'
import type { BuiltinNormalExpressions } from '../builtin/interface'

// ---------------------------------------------------------------------------
// Parsed builtin type cache
// ---------------------------------------------------------------------------

export interface BuiltinTypeInfo {
  /** The parsed function type. */
  type: Type
  /** If the function is a type guard, the parameter name being narrowed. */
  guardParam?: string
  /** If the function is a type guard, the type it narrows to. */
  guardType?: Type
}

/** Map from builtin name to its parsed type info. */
const builtinTypeCache = new Map<string, BuiltinTypeInfo>()

/** Whether the cache has been initialized. */
let initialized = false

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialize the builtin type cache from the builtin normal expressions.
 * Call once at startup before inference begins.
 */
export function initBuiltinTypes(normalExpressions: BuiltinNormalExpressions): void {
  if (initialized) return
  initialized = true

  for (const [name, expr] of Object.entries(normalExpressions)) {
    const typeStr = expr.docs?.type
    if (!typeStr) continue

    try {
      const parsed: ParsedFunctionType = parseFunctionTypeAnnotation(typeStr)
      builtinTypeCache.set(name, {
        type: parsed.type,
        guardParam: parsed.guardParam,
        guardType: parsed.guardType,
      })
    } catch {
      // Silently degrade to Unknown — the builtin works at runtime,
      // it just won't have type information for the checker.
    }
  }
}

/**
 * Look up the type of a builtin by name.
 * Returns Unknown if the builtin has no type annotation or wasn't parsed.
 */
export function getBuiltinType(name: string): BuiltinTypeInfo {
  return builtinTypeCache.get(name) ?? { type: Unknown }
}

/**
 * Check if a builtin is a type guard (e.g. isNumber narrows to Number).
 */
export function isTypeGuard(name: string): boolean {
  const info = builtinTypeCache.get(name)
  return info?.guardParam !== undefined
}

// ---------------------------------------------------------------------------
// Module type registry
// ---------------------------------------------------------------------------

/** Map from module name to its export record type. */
const moduleTypeCache = new Map<string, Type>()

/**
 * Register a module's exports as a record type.
 * Called during initialization for each registered module.
 */
export function registerModuleType(moduleName: string, functions: BuiltinNormalExpressions): void {
  const fields = new Map<string, Type>()
  for (const [name, expr] of Object.entries(functions)) {
    const typeStr = expr.docs?.type
    if (typeStr) {
      try {
        const parsed = parseFunctionTypeAnnotation(typeStr)
        fields.set(name, parsed.type)
      } catch {
        fields.set(name, Unknown)
      }
    } else {
      fields.set(name, Unknown)
    }
  }
  // Module type is a closed record of its exports
  moduleTypeCache.set(moduleName, { tag: 'Record', fields, open: false })
}

/**
 * Look up a module's type (record of exports).
 * Returns Unknown if the module is not registered.
 */
export function getModuleType(moduleName: string): Type {
  return moduleTypeCache.get(moduleName) ?? Unknown
}

/**
 * Reset registered module types.
 * Called between typecheck passes so each runner sees only its own modules.
 */
export function resetModuleTypeCache(): void {
  moduleTypeCache.clear()
}

/**
 * Reset the cache (for testing).
 */
export function resetBuiltinTypeCache(): void {
  builtinTypeCache.clear()
  resetModuleTypeCache()
  initialized = false
}
