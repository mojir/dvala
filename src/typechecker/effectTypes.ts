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

/** Map from effect name to its type declaration. */
const effectRegistry = new Map<string, EffectDeclaration>()

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

/** Reset the registry (for testing). */
export function resetEffectRegistry(): void {
  effectRegistry.clear()
}

/** Register built-in Dvala effects with known types. */
export function initBuiltinEffects(): void {
  // These are the core Dvala effects with known signatures.
  // User effects will be registered via `effect @name(T) -> U` declarations.
  declareEffect('dvala.error', Unknown, Unknown) // error: any arg, aborts (never resumes normally)
  declareEffect('dvala.io.print', Unknown, Unknown) // print: any arg, returns null-ish
  declareEffect('dvala.io.read', Unknown, Unknown) // read: prompt, returns string
}
