/**
 * Bounded, effect-intercepting evaluator used by the type checker's
 * constant-folding pass.
 *
 * Runs a subtree of AST with a fresh `ContextStack` seeded with literal
 * values, capped by a step budget. If the evaluator produces a `Perform`
 * step we stop immediately and report the effect name — we never dispatch
 * to handlers, because type-check time has none. Any other error or async
 * surface reports a generic failure and the caller falls back.
 *
 * Future optimizations (not in v1):
 *  - Fast-path for trivial builtins (direct JS dispatch, no trampoline
 *    setup) — shares the same builtin impl to avoid drift.
 *  - Memoize `(calleeId, argValues)` across a single type-check pass.
 */

import type { AstNode } from '../parser/types'
import type { Any } from '../interface'
import type { ContextStack } from './ContextStack'
import type { Step } from './step'
import { DvalaError, MacroError, ReferenceError } from '../errors'
import { tick } from './trampoline-evaluator'

export type FoldResult =
  | { ok: true; value: Any }
  | { ok: false; reason: 'budget' }
  | { ok: false; reason: 'effect'; effectName: string }
  | { ok: false; reason: 'error' }

/** Default step budget per fold attempt (decision #1 in the design doc). */
export const DEFAULT_FOLD_STEP_BUDGET = 10_000

/**
 * Evaluate a single AST node for constant folding. Does NOT dispatch effects
 * to host handlers — if the evaluator surfaces a Perform step, we stop and
 * report the effect name so the caller can emit a warning. Any async surface
 * (unexpected in pure code) is treated as a generic failure.
 */
export function evaluateNodeForFold(
  node: AstNode,
  contextStack: ContextStack,
  maxSteps: number = DEFAULT_FOLD_STEP_BUDGET,
): FoldResult {
  let step: Step | Promise<Step> = { type: 'Eval', node, env: contextStack, k: null }
  let stepsRemaining = maxSteps
  for (;;) {
    if (step instanceof Promise) {
      // Async operation during fold — can't complete synchronously.
      return { ok: false, reason: 'error' }
    }
    if (step.type === 'Value' && step.k === null) {
      return { ok: true, value: step.value }
    }
    if (step.type === 'Perform') {
      // Effect performed before any handler could match. Report the name
      // so the caller can emit a warning (decision #2).
      return { ok: false, reason: 'effect', effectName: step.effect.name }
    }
    if (stepsRemaining-- <= 0) {
      return { ok: false, reason: 'budget' }
    }
    try {
      step = tick(step)
    } catch (error) {
      // ReferenceError means a free variable the fold sandbox couldn't
      // resolve (typically a closure capture the caller didn't
      // reconstruct); MacroError means macro expansion failed in the
      // sandbox context. Both are "fold doesn't apply here" signals, not
      // "your code is broken at runtime" signals — return silent fallback
      // so the caller doesn't emit a spurious warning.
      if (error instanceof ReferenceError || error instanceof MacroError) {
        return { ok: false, reason: 'error' }
      }
      // Other unhandled DvalaErrors (division-by-zero,
      // index-out-of-range, assertion failure) correspond to a
      // `@dvala.error` effect that no `try/with` handler intercepted.
      // Report it so the caller can emit a warning.
      if (error instanceof DvalaError) {
        return { ok: false, reason: 'effect', effectName: 'dvala.error' }
      }
      return { ok: false, reason: 'error' }
    }
  }
}
