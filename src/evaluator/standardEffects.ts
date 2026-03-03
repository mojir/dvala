/**
 * Standard effects — built-in effects with default implementations.
 *
 * These effects are always available without requiring explicit host handlers.
 * Host handlers can override them (host handlers take priority in the lookup order).
 *
 * Lookup order: local try/with → host handlers → standard effects → unhandled error
 *
 * Standard effects:
 * - `dvala.log`    — sync: console.log(...args), resumes with null
 * - `dvala.now`    — sync: Date.now()
 * - `dvala.random` — sync: Math.random()
 * - `dvala.sleep`  — async: setTimeout(resolve, ms), resumes with null
 *
 * Sync effects work in both `runSync` and `run`.
 * Async effects (`dvala.sleep`) only work in `run` — `runSync` will throw
 * when a Promise surfaces.
 */

import type { Any, Arr } from '../interface'
import { DvalaError } from '../errors'
import type { SourceCodeInfo } from '../tokenizer/token'
import { assertAny } from '../typeGuards/dvala'
import type { ContinuationStack } from './frames'
import type { Step } from './step'

// ---------------------------------------------------------------------------
// Standard effect handler type
// ---------------------------------------------------------------------------

/**
 * A standard effect handler returns the next step directly.
 * Sync effects return `Step`, async effects return `Promise<Step>`.
 */
type StandardEffectHandler = (args: Arr, k: ContinuationStack, sourceCodeInfo?: SourceCodeInfo) => Step | Promise<Step>

// ---------------------------------------------------------------------------
// Standard effect implementations
// ---------------------------------------------------------------------------

const standardEffectHandlers: Record<string, StandardEffectHandler> = {
  /**
   * `dvala.log` — Log arguments to console.
   * Resumes with the logged value.
   */
  'dvala.log': (args: Arr, k: ContinuationStack): Step => {
    if (args.length !== 1) {
      throw new DvalaError(`dvala.log expects exactly 1 argument, got ${args.length}`, undefined)
    }
    const value = args[0]
    assertAny(value, undefined)
    // eslint-disable-next-line no-console
    console.log(value)
    return { type: 'Value', value, k }
  },

  /**
   * `dvala.now` — Current timestamp in milliseconds since epoch.
   * Equivalent to `Date.now()`.
   */
  'dvala.now': (_args: Arr, k: ContinuationStack): Step => {
    return { type: 'Value', value: Date.now(), k }
  },

  /**
   * `dvala.random` — Random float in [0, 1).
   * Equivalent to `Math.random()`.
   */
  'dvala.random': (_args: Arr, k: ContinuationStack): Step => {
    return { type: 'Value', value: Math.random(), k }
  },

  /**
   * `dvala.sleep` — Wait for a specified number of milliseconds.
   * Resumes with null after the delay.
   * Only works in `run()` (async) — `runSync()` will throw.
   */
  'dvala.sleep': (args: Arr, k: ContinuationStack, sourceCodeInfo?: SourceCodeInfo): Promise<Step> => {
    const ms = args[0] as Any
    if (typeof ms !== 'number' || ms < 0) {
      throw new DvalaError(`dvala.sleep requires a non-negative number argument, got ${typeof ms === 'number' ? ms : typeof ms}`, sourceCodeInfo)
    }
    return new Promise<Step>((resolve) => {
      setTimeout(() => resolve({ type: 'Value', value: null, k }), ms)
    })
  },
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** All standard effect names. */
export const standardEffectNames: ReadonlySet<string> = new Set(Object.keys(standardEffectHandlers))

/**
 * Look up a standard effect handler by name.
 * Returns undefined if the effect is not a standard effect.
 */
export function getStandardEffectHandler(effectName: string): StandardEffectHandler | undefined {
  return standardEffectHandlers[effectName]
}
