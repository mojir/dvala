/**
 * Effect type registry — maps effect names to their argument and return types.
 *
 * Effect declarations like `effect @llm.complete(String) -> String` register
 * here. During inference, `perform(@llm.complete, prompt)` checks the arg
 * type and returns the declared return type (instead of Unknown).
 *
 * For Phase C (Step 7), this also informs handler clause typing:
 * - The handler parameter gets the effect's arg type
 * - `resume` gets the effect's return type as its parameter type
 */

import type { Type } from './types'
import { Unknown } from './types'

// ---------------------------------------------------------------------------
// Effect declaration
// ---------------------------------------------------------------------------

export interface EffectDeclaration {
  /** The argument type passed to perform. */
  argType: Type
  /** The return type — what perform() returns, what resume() accepts. */
  retType: Type
}

export interface EffectRegistrySnapshot {
  entries: [string, EffectDeclaration][]
  builtinNames: string[]
}

/** Map from effect name to its type declaration. */
const effectRegistry = new Map<string, EffectDeclaration>()
/** Set of builtin effect names (not cleared between typechecks). */
const builtinEffectNames = new Set<string>()

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Register an effect's type declaration. */
export function declareEffect(name: string, argType: Type, retType: Type): void {
  effectRegistry.set(name, { argType, retType })
}

/** Look up an effect's declaration. Returns undefined if not declared. */
export function getEffectDeclaration(name: string): EffectDeclaration | undefined {
  return effectRegistry.get(name)
}

/** Get the return type of a declared effect, or Unknown if not declared. */
export function getEffectReturnType(name: string): Type {
  return effectRegistry.get(name)?.retType ?? Unknown
}

/** Get the argument type of a declared effect, or Unknown if not declared. */
export function getEffectArgType(name: string): Type {
  return effectRegistry.get(name)?.argType ?? Unknown
}

/** Snapshot the current registry so nested import typechecking can restore it. */
export function snapshotEffectRegistry(): EffectRegistrySnapshot {
  return {
    entries: [...effectRegistry.entries()].map(([name, decl]) => [name, { ...decl }]),
    builtinNames: [...builtinEffectNames],
  }
}

/** Restore a previously captured registry snapshot. */
export function restoreEffectRegistry(snapshot: EffectRegistrySnapshot): void {
  effectRegistry.clear()
  builtinEffectNames.clear()
  for (const [name, decl] of snapshot.entries) {
    effectRegistry.set(name, decl)
  }
  for (const name of snapshot.builtinNames) {
    builtinEffectNames.add(name)
  }
}

/** Reset user-declared effects (called at the start of each typecheck pass).
 * Builtin effects are preserved. */
export function resetUserEffects(): void {
  for (const name of effectRegistry.keys()) {
    if (!builtinEffectNames.has(name)) effectRegistry.delete(name)
  }
}

/** Reset the entire registry (for testing). */
export function resetEffectRegistry(): void {
  effectRegistry.clear()
  builtinEffectNames.clear()
}

/** Register built-in Dvala effects with known types. */
export function initBuiltinEffects(): void {
  // These are the core Dvala effects with known signatures.
  // User effects will be registered via `effect @name(T) -> U` declarations.
  const builtins: [string, Type, Type][] = [
    ['dvala.error', Unknown, Unknown], // error: any arg, aborts (never resumes normally)
    ['dvala.io.print', Unknown, Unknown], // print: any arg, returns null-ish
    ['dvala.io.read', Unknown, Unknown], // read: prompt, returns string
    // Used by effectHandler's chooseAll/chooseFirst/chooseRandom/chooseTake
    // to model nondeterministic choice. `@choose` takes a list of options
    // and resumes with one of them. Registered here so users who import
    // these functions don't have to redeclare the effect themselves.
    ['choose', Unknown, Unknown],
    // Used by chooseRandom to pick a random element from the options list.
    // Declared here so chooseRandom's declared signature can reference it.
    ['dvala.random.item', Unknown, Unknown],
  ]
  for (const [name, arg, ret] of builtins) {
    declareEffect(name, arg, ret)
    builtinEffectNames.add(name)
  }
}
