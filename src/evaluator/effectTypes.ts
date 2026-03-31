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
import type { AstNode } from '../parser/types'
import type { ContextStack } from './ContextStack'
import { toJS } from '../utils/interop'

// ---------------------------------------------------------------------------
// Snapshot — captured continuation point
// ---------------------------------------------------------------------------

export const SUSPENDED_MESSAGE = 'Program suspended'

/**
 * A captured continuation point. Created by `suspend()` or `checkpoint()`.
 * The `continuation` field is opaque — hosts should not inspect or modify it.
 */
export interface Snapshot {
  /** Unique ID for this snapshot, generated at creation time. */
  readonly id: string

  /** Opaque serialized continuation. Do not inspect or modify. */
  readonly continuation: unknown

  /** Wall-clock timestamp (Date.now()) when snapshot was taken. */
  readonly timestamp: number

  /** Stable sequence number (0-based, never reused within an execution lineage). */
  readonly index: number

  /** UUID identifying the run() or resume() call that created this snapshot. */
  readonly executionId: string

  /** Human-readable label from the checkpoint perform call. */
  readonly message: string

  /**
   * True when this snapshot represents the terminal state of a run (completed or failed).
   * False/absent for mid-execution checkpoints that can be resumed.
   */
  readonly terminal?: boolean

  /** Optional domain metadata from the perform call or suspend call. */
  readonly meta?: unknown

  /**
   * The name of the effect that was being handled when the program suspended.
   * Undefined when suspension occurred outside of an effect handler (e.g. in parallel/race branches).
   */
  readonly effectName?: string

  /**
   * The payload passed to the suspended effect's perform call.
   * Undefined when suspension occurred outside of an effect handler.
   */
  readonly effectArg?: unknown
}

// ---------------------------------------------------------------------------
// Run ID generation
// ---------------------------------------------------------------------------

/**
 * Generate a UUID for identifying a run() or resume() call.
 * Uses crypto.randomUUID() when available, falls back to a simple generator.
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

/**
 * Create a Snapshot with a freshly generated unique `id`.
 * effectArg is converted to plain JS so it serializes cleanly via JSON
 * and compares correctly in tests without PV/PM internals leaking out.
 */
export function createSnapshot(fields: Omit<Snapshot, 'id'>): Snapshot {
  const effectArg = fields.effectArg !== undefined ? toJS(fields.effectArg as Any) : undefined
  return { id: generateUUID(), ...fields, effectArg }
}

// ---------------------------------------------------------------------------
// Snapshot state — mutable state owned by a single run()/resume() call
// ---------------------------------------------------------------------------

/**
 * Lazy accessor for the current execution context at a node evaluation point.
 * Only allocated when the caller actually invokes `getContinuation()` — the
 * coverage path never calls it, so there is no allocation on the hot path.
 */
export interface Continuation {
  /** Current lexical environment — read variable bindings from here. */
  env: ContextStack
  /** Continuation stack — use to reconstruct the call stack for display. */
  k: ContinuationStack
  /** Resume execution from this point (for debugger "continue" / "step"). */
  resume: () => void
  /** All post-effect snapshots taken so far — enables time travel. */
  getSnapshots: () => Snapshot[]
}

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
  readonly executionId: string

  /** Maximum number of snapshots to retain. Oldest are evicted when exceeded. */
  readonly maxSnapshots?: number

  /** When true, automatically capture a checkpoint at program start and after every non-checkpoint effect. */
  readonly autoCheckpoint?: boolean

  /** When true, always create a terminal snapshot on completion/error/halt even if autoCheckpoint is false. */
  readonly terminalSnapshot?: boolean

  /**
   * Optional hook called on every AST node evaluation. Used for coverage tracking and debugging.
   * `getContinuation` is lazy — only call it when you need env/k/resume (e.g. on a breakpoint hit).
   * For coverage, record `node[2]` (the node ID) and return without calling `getContinuation()`.
   */
  onNodeEval?: (node: AstNode, getContinuation: () => Continuation) => void | Promise<void>
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

  /** The single payload from the Dvala `perform(eff, payload)` call. */
  arg: unknown

  /**
   * Aborted when: `race()` branch loses, runtime is disposed, or host cancels.
   * Combine with timeout: `AbortSignal.any([signal, AbortSignal.timeout(ms)])`
   */
  signal: AbortSignal

  /**
   * Resume the program with the given value (or a Promise that resolves to one).
   * The value becomes the result of the `perform(...)` expression in Dvala.
   */
  resume: (value: unknown) => void

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
  suspend: (meta?: unknown) => void

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
   * `perform(@dvala.checkpoint)`.
   */
  checkpoint: (message: string, meta?: unknown) => Snapshot

  /**
   * Abandon current execution and resume from a previous snapshot.
   * All snapshots after the target are discarded.
   */
  resumeFrom: (snapshot: Snapshot, value: unknown) => void

  /**
   * Halt the program immediately. Returns a `{ type: 'halted', value }` result.
   * Unlike `fail()`, this does not trigger error handlers — it's a clean termination.
   * If `value` is omitted, defaults to `null`.
   */
  halt: (value?: unknown) => void
}

/** A function that handles an effect by calling `resume`, `suspend`, `fail`, `halt`, or `next`. */
export type EffectHandler = (ctx: EffectContext) => void | Promise<void>

/** A single handler registration: a pattern (e.g. `'llm.complete'`, `'dvala.*'`, `'*'`) paired with its handler. */
export interface HandlerRegistration {
  pattern: string
  handler: EffectHandler
}

/** An ordered list of effect handler registrations. Earlier entries are checked first. */
export type Handlers = HandlerRegistration[]

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
export function qualifiedNameMatchesPattern(name: string, pattern: string): boolean {
  if (pattern === '*') {
    return true
  }
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -2) // e.g. "dvala.*" → "dvala"
    return name === prefix || name.startsWith(`${prefix}.`)
  }
  return name === pattern
}

/**
 * Find all matching async handlers for an effect name, in registration order.
 * Returns an array of `[pattern, handler]` pairs.
 */
export function findMatchingHandlers(
  effectName: string,
  handlers: Handlers | undefined,
): [string, EffectHandler][] {
  if (!handlers || handlers.length === 0) {
    return []
  }
  const result: [string, EffectHandler][] = []
  for (const { pattern, handler } of handlers) {
    if (qualifiedNameMatchesPattern(effectName, pattern)) {
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
 *
 * When time travel is enabled, `completed` and `error` results include a
 * terminal snapshot containing the checkpoint history for debugging/replay.
 */
export type RunResult =
  | { type: 'completed'; value: unknown; definedBindings?: Record<string, unknown>; snapshot?: Snapshot }
  | { type: 'suspended'; snapshot: Snapshot }
  | { type: 'error'; error: DvalaError; snapshot?: Snapshot }
  | { type: 'halted'; value: unknown; snapshot?: Snapshot }

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
    public readonly meta?: unknown,
    /** The effect name being handled when suspend() was called. */
    public readonly effectName?: string,
    /** The effect payload being handled when suspend() was called. */
    public readonly effectArg?: Any,
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

// ---------------------------------------------------------------------------
// HaltSignal — used internally by the trampoline
// ---------------------------------------------------------------------------

/**
 * Thrown (as a promise rejection) by `halt()` inside a host handler.
 * Caught by the effect trampoline loop — NOT by Dvala-level try/catch.
 * Terminates execution immediately and returns a halted result.
 */
export class HaltSignal {
  public readonly _brand = 'HaltSignal' as const
  constructor(
    /** The value to return as the halted result. */
    public readonly value: Any,
    /** Accumulated snapshots at the point of halt. */
    public readonly snapshots: Snapshot[],
    /** High-water mark for snapshot indices at the point of halt. */
    public readonly nextSnapshotIndex: number,
  ) {}
}

export function isHaltSignal(value: unknown): value is HaltSignal {
  return value instanceof HaltSignal
}
