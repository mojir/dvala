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
// Snapshot — captured continuation point
// ---------------------------------------------------------------------------

/**
 * A captured continuation point. Created by `suspend()` or `checkpoint()`.
 * The `continuation` field is opaque — hosts should not inspect or modify it.
 */
export interface Snapshot {
  /** Opaque serialized continuation. Do not inspect or modify. */
  readonly continuation: unknown

  /** Wall-clock timestamp (Date.now()) when snapshot was taken. */
  readonly timestamp: number

  /** Stable sequence number (0-based, never reused within an execution lineage). */
  readonly index: number

  /** UUID identifying the run() or resume() call that created this snapshot. */
  readonly runId: string

  /** Optional domain metadata from the perform call or suspend call. */
  readonly meta?: Any

  /**
   * The name of the effect that was being handled when the program suspended.
   * Undefined when suspension occurred outside of an effect handler (e.g. in parallel/race branches).
   */
  readonly effectName?: string

  /**
   * The arguments passed to the suspended effect's perform call.
   * Undefined when suspension occurred outside of an effect handler.
   */
  readonly effectArgs?: Any[]
}

// ---------------------------------------------------------------------------
// Run ID generation
// ---------------------------------------------------------------------------

/**
 * Generate a UUID for identifying a run() or resume() call.
 * Uses crypto.randomUUID() when available, falls back to a simple generator.
 */
export function generateRunId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

// ---------------------------------------------------------------------------
// Snapshot state — mutable state owned by a single run()/resume() call
// ---------------------------------------------------------------------------

/**
 * Mutable snapshot state that lives for the duration of a single
 * `runEffectLoop` invocation. Threaded through tick → dispatchPerform →
 * dispatchHostHandler so that host handlers can access and create snapshots.
 */
export interface SnapshotState {
  /** Accumulated snapshots, oldest first. */
  readonly snapshots: Snapshot[]

  /** High-water mark counter for snapshot indices (never reused, even across rollbacks). */
  nextSnapshotIndex: number

  /** UUID identifying this run()/resume() call. */
  readonly runId: string

  /** Maximum number of snapshots to retain. Oldest are evicted when exceeded. */
  readonly maxSnapshots?: number
}

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
   * in `RunResult` as `{ type: 'suspended', snapshot }`.
   * `meta` is passed through to `Snapshot.meta` for domain context
   * (e.g., assignee, deadline, priority).
   */
  suspend: (meta?: Any) => void

  /**
   * Pass to the next registered handler whose pattern matches this effect.
   * If no further handler matches, the effect is unhandled.
   */
  next: () => void

  /** All snapshots taken so far, oldest first. Read-only view. */
  snapshots: readonly Snapshot[]

  /**
   * Explicitly capture a snapshot at the current continuation point.
   * Returns the new Snapshot. This is the host-side equivalent of
   * `perform(effect(dvala.checkpoint))`.
   */
  checkpoint: (meta?: Any) => Snapshot

  /**
   * Abandon current execution and resume from a previous snapshot.
   * All snapshots after the target are discarded.
   */
  resumeFrom: (snapshot: Snapshot, value: Any) => void
}

/** A function that handles an effect by calling `resume`, `suspend`, `fail`, or `next`. */
export type EffectHandler = (ctx: EffectContext) => void | Promise<void>

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
 * Find all matching async handlers for an effect name, in registration order.
 * Returns an array of `[pattern, handler]` pairs.
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
  | { type: 'completed', value: Any, definedBindings?: Record<string, unknown> }
  | { type: 'suspended', snapshot: Snapshot }
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
    /** Accumulated snapshots at the point of suspension. */
    public readonly snapshots: Snapshot[],
    /** High-water mark for snapshot indices at the point of suspension. */
    public readonly nextSnapshotIndex: number,
    /** Optional domain metadata passed through to RunResult. */
    public readonly meta?: Any,
    /** The effect name being handled when suspend() was called. */
    public readonly effectName?: string,
    /** The effect arguments being handled when suspend() was called. */
    public readonly effectArgs?: Any[],
  ) {}
}

export function isSuspensionSignal(value: unknown): value is SuspensionSignal {
  return value instanceof SuspensionSignal
}

// ---------------------------------------------------------------------------
// ResumeFrom signal — used internally by the trampoline
// ---------------------------------------------------------------------------

/**
 * Thrown (as a promise rejection) by `resumeFrom()` inside a host handler.
 * Caught by the effect trampoline loop — NOT by Dvala-level try/catch.
 * Carries the serialized continuation from the target snapshot, the value
 * to resume with, and the snapshot index for trimming.
 */
export class ResumeFromSignal {
  public readonly _brand = 'ResumeFromSignal' as const
  constructor(
    /** The serialized continuation from the target snapshot. */
    public readonly continuation: unknown,
    /** The value to feed into the restored continuation. */
    public readonly value: Any,
    /** Snapshots with index > trimToIndex will be discarded. */
    public readonly trimToIndex: number,
  ) {}
}

export function isResumeFromSignal(value: unknown): value is ResumeFromSignal {
  return value instanceof ResumeFromSignal
}
