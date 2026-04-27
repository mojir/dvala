/**
 * Builtin type registry — parses type annotation strings from builtin docs
 * into Type values, cached for lookup during inference.
 */

import type { BuiltinNormalExpressions, FunctionDocs } from '../builtin/interface'
import { getEffectDeclaration } from './effectTypes'
import { parseFunctionTypeAnnotation, type ParsedFunctionType } from './parseType'
import type { HandlerEffectSignature, HandlerWrapperInfo, Type } from './types'
import { PureEffects, Unknown, effectSet } from './types'

// ---------------------------------------------------------------------------
// Parsed builtin type cache
// ---------------------------------------------------------------------------

interface BuiltinTypeInfo {
  /** The parsed function type. */
  type: Type
  /** If the function is a type guard, the parameter name being narrowed. */
  guardParam?: string
  /** If the function is a type guard, the type it narrows to. */
  guardType?: Type
  /**
   * Phase 2.5c — zero-based index of the parameter that, when supplied
   * as a fragment-eligible single-symbol predicate, gets threaded into
   * the assumption set after the call (see `extractAssertNarrowings`).
   * Populated from each builtin's `docs.asserts.paramIndex`.
   */
  assertsParam?: number
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
        assertsParam: parsed.assertsParam !== undefined
          ? parsed.type.tag === 'Function' && parsed.type.asserts
            ? parsed.type.asserts.paramIndex
            : expr.docs?.asserts?.paramIndex
          : extractAssertParamFromType(parsed.type) ?? expr.docs?.asserts?.paramIndex,
      })
    } catch {
      // Silently degrade to Unknown — the builtin works at runtime,
      // it just won't have type information for the checker.
    }
  }
}

function extractAssertParamFromType(type: Type): number | undefined {
  if (type.tag === 'Function') return type.asserts?.paramIndex
  if (type.tag !== 'Inter') return undefined

  const assertParams = type.members
    .filter((member): member is Extract<Type, { tag: 'Function' }> => member.tag === 'Function' && member.asserts !== undefined)
    .map(member => member.asserts!.paramIndex)

  if (assertParams.length === 0) return undefined
  const [first] = assertParams
  return assertParams.every(paramIndex => paramIndex === first) ? first : undefined
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
 *
 * `functions` covers TS-implemented entries with inline `docs`. `docs` covers
 * source-implemented entries (where the `.dvala` source provides the impl and
 * the docs map provides the declared type) and overrides anything in
 * `functions` for the same name. Without the second argument, source-impl
 * module functions are invisible to the typechecker — `import("effectHandler")`
 * would yield a record with no `chooseRandom` etc.
 */
export function registerModuleType(
  moduleName: string,
  functions: BuiltinNormalExpressions,
  docs?: Record<string, FunctionDocs>,
): void {
  const fields = new Map<string, Type>()
  const setFromDocs = (name: string, doc: FunctionDocs | undefined): void => {
    const typeStr = doc?.type
    let parsedType: Type
    if (typeStr) {
      try {
        const parsed = parseFunctionTypeAnnotation(typeStr)
        parsedType = parsed.type
      } catch {
        // Intentional: a malformed type string degrades to Unknown rather
        // than failing module registration. The function still works at
        // runtime; the typechecker just loses precision for it. Audit
        // parsing failures by watching for widening inference across
        // callers of the affected module function.
        parsedType = Unknown
      }
    } else {
      // Intentional: entries without a declared type are Unknown. Common
      // for docs entries that haven't been annotated yet; callers should
      // audit via the `type` field on each FunctionDocs to see gaps.
      parsedType = Unknown
    }
    // Attach HandlerWrapperInfo when the docs declare `wrapper` metadata.
    // Resolves each handled effect's argType/retType via the effect
    // registry. Effects that aren't registered fall back to Unknown —
    // the wrapper still functions; the typechecker just can't prove
    // the resume arg/ret types.
    if (doc?.wrapper && parsedType.tag === 'Function') {
      // Phase 4-A Phase B B.5: well-formedness check. Each handled effect
      // must appear on the concrete side of the thunk param's effect set.
      // If it only appeared in a row-var's tail, subtraction at the call
      // site would silently under-subtract (the row-var's bounds aren't
      // touched by `subtractEffects`). Reject malformed sigs loudly rather
      // than produce wrong answers.
      //
      // Handles both plain Function thunks and Union of Function thunks
      // (overloaded wrappers). Every alternative must declare the handled
      // effect explicitly.
      const thunkParam = parsedType.params[doc.wrapper.paramIndex]
      const thunkAlternatives = thunkParam
        ? thunkParam.tag === 'Function'
          ? [thunkParam]
          : thunkParam.tag === 'Union'
            ? thunkParam.members.filter((m): m is Extract<Type, { tag: 'Function' }> => m.tag === 'Function')
            : []
        : []
      if (thunkAlternatives.length > 0) {
        for (const alt of thunkAlternatives) {
          for (const effectName of doc.wrapper.handled) {
            if (!alt.effects.effects.has(effectName)) {
              throw new Error(
                `Malformed wrapper signature for ${moduleName}.${name}: handled effect '${effectName}' does not appear on the concrete side of the thunk parameter's effect set (${[...alt.effects.effects].sort().join(', ') || '∅'}). Each handled effect must be declared explicitly in the thunk's \`@{...}\` — hiding it inside a row-var tail causes under-subtraction at call sites.`,
              )
            }
          }
        }
      }
      const handled = new Map<string, HandlerEffectSignature>()
      for (const effectName of doc.wrapper.handled) {
        const decl = getEffectDeclaration(effectName)
        handled.set(effectName, {
          argType: decl?.argType ?? Unknown,
          retType: decl?.retType ?? Unknown,
        })
      }
      const introduced = doc.wrapper.introduced.length > 0
        ? effectSet(doc.wrapper.introduced)
        : PureEffects
      const handlerWrapper: HandlerWrapperInfo = {
        paramIndex: doc.wrapper.paramIndex,
        handled,
        introduced,
      }
      parsedType = { ...parsedType, handlerWrapper }
    }
    fields.set(name, parsedType)
  }
  for (const [name, expr] of Object.entries(functions)) {
    setFromDocs(name, expr.docs)
  }
  if (docs) {
    for (const [name, doc] of Object.entries(docs)) {
      // Skip names already covered by `functions` — those took their type
      // from the inline docs, which is canonical for TS-impls.
      if (fields.has(name)) continue
      setFromDocs(name, doc)
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
