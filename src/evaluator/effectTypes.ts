/**
 * Shared types for the algebraic effects system.
 *
 * This module exists to break the circular dependency between `effects.ts`
 * (standalone functions) and `evaluator/trampoline.ts` (trampoline loop).
 * Both modules import types from here without creating a cycle.
 */

import type { Any } from '../interface'
import type { DvalaError } from '../errors'
import type { ContinuationStack } from './frames'

// ---------------------------------------------------------------------------
// Suspension blob — opaque serialized continuation
// ---------------------------------------------------------------------------

/**
 * Opaque string containing the serialized continuation stack.
 * Created by `suspend()`, consumed by `resume()`.
 * Internally it's JSON, but hosts should treat it as opaque.
 */
export type SuspensionBlob = string

// ---------------------------------------------------------------------------
// Effect handler types
// ---------------------------------------------------------------------------

/**
 * Context passed to a host effect handler.
 *
 * The handler must call exactly one of `resume`, `suspend`, `fail`, or `next`,
 * exactly once. Calling more than one, or calling any more than once, is a
 * programming error.
 */
export interface EffectContext {
  /** Full dotted name of the performed effect (useful for wildcard handlers). */
  effectName: string

  /** Arguments from the Dvala `perform(eff, arg1, arg2, ...)` call. */
  args: Any[]

  /**
   * Aborted when: `race()` branch loses, runtime is disposed, or host cancels.
   * Combine with timeout: `AbortSignal.any([signal, AbortSignal.timeout(ms)])`
   */
  signal: AbortSignal

  /**
   * Resume the program with the given value (or a Promise that resolves to one).
   * The value becomes the result of the `perform(...)` expression in Dvala.
   */
  resume: (value: Any | Promise<Any>) => void

  /**
   * Propagate as a Dvala-level error. If `msg` is provided it overrides the
   * default error message. The error flows through `dvala.error` handlers.
   */
  fail: (msg?: string) => void

  /**
   * Suspend the program. The entire execution state is captured and returned
   * in `RunResult` as `{ type: 'suspended', continuation, meta }`.
   * `meta` is passed through to `RunResult.meta` for domain context
   * (e.g., assignee, deadline, priority).
   */
  suspend: (meta?: Any) => void

  /**
   * Pass to the next registered handler whose pattern matches this effect.
   * If no further handler matches, the effect is unhandled.
   */
  next: () => void
}

/** An async function that handles an effect by calling `resume`, `suspend`, `fail`, or `next`. */
export type EffectHandler = (ctx: EffectContext) => Promise<void>

/** Map from effect pattern (e.g. `'llm.complete'`, `'dvala.*'`, `'*'`) to its handler. */
export type Handlers = Record<string, EffectHandler>

// ---------------------------------------------------------------------------
// Pattern matching utilities for wildcard host handlers
// ---------------------------------------------------------------------------

/**
 * Test whether a handler pattern key matches a given effect name.
 *
 * Rules:
 * - No wildcard → exact match only
 * - `.*` suffix → matches the named effect itself AND all descendants
 *   (dot boundary enforced: `dvala.*` matches `dvala.error` but NOT `dvalaXXX`)
 * - `*` alone → matches everything
 */
export function effectNameMatchesPattern(effectName: string, pattern: string): boolean {
  if (pattern === '*') {
    return true
  }
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -2) // e.g. "dvala.*" → "dvala"
    return effectName === prefix || effectName.startsWith(`${prefix}.`)
  }
  return effectName === pattern
}

/**
 * Find all matching handlers for an effect name, in registration order.
 * Returns an array of `[pattern, handler]` pairs — the first entry is
 * the "most specific" by registration order, not by pattern specificity.
 */
export function findMatchingHandlers(
  effectName: string,
  handlers: Handlers | undefined,
): Array<[string, EffectHandler]> {
  if (!handlers) {
    return []
  }
  const result: Array<[string, EffectHandler]> = []
  for (const [pattern, handler] of Object.entries(handlers)) {
    if (effectNameMatchesPattern(effectName, pattern)) {
      result.push([pattern, handler])
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Run result types
// ---------------------------------------------------------------------------

/**
 * The result of `run()` — always resolves, never rejects.
 * Errors are captured in the `error` variant.
 */
export type RunResult =
  | { type: 'completed', value: Any }
  | { type: 'suspended', blob: SuspensionBlob, meta?: Any }
  | { type: 'error', error: DvalaError }

// ---------------------------------------------------------------------------
// Suspension signal — used internally by the trampoline
// ---------------------------------------------------------------------------

/**
 * Thrown (as a promise rejection) by `suspend()` inside a host handler.
 * Caught by the effect trampoline loop — NOT by Dvala-level try/catch.
 */
export class SuspensionSignal {
  public readonly _brand = 'SuspensionSignal' as const
  constructor(
    /** The captured continuation stack at the point of suspension. */
    public readonly k: ContinuationStack,
    /** Optional domain metadata passed through to RunResult. */
    public readonly meta?: Any,
  ) {}
}

export function isSuspensionSignal(value: unknown): value is SuspensionSignal {
  return value instanceof SuspensionSignal
}
