/**
 * Standalone `retrigger()` function for resuming suspended continuations
 * by re-firing the original effect to the host handlers.
 *
 * The primary API for running Dvala programs is `createDvala()` from `./createDvala`.
 */

import type { Any } from './interface'
import { DvalaError, RuntimeError } from './errors'
import type { DvalaModule } from './builtin/modules/interface'
import { retriggerWithEffects } from './evaluator/trampoline-evaluator'
import { deserializeFromObject } from './evaluator/suspension'
import { toJS } from './utils/interop'

import type { Handlers, RunResult, Snapshot } from './evaluator/effectTypes'

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/**
 * Options for `retrigger()` — resume a suspended continuation by re-firing
 * the original effect to the host handlers.
 * Time travel (auto-checkpointing) is enabled by default. Set `disableAutoCheckpoint: true` to opt out.
 */
export interface RetriggerOptions {
  handlers?: Handlers
  modules?: DvalaModule[]
  maxSnapshots?: number
  disableAutoCheckpoint?: boolean
  terminalSnapshot?: boolean
}

// ---------------------------------------------------------------------------
// retrigger()
// ---------------------------------------------------------------------------

/**
 * Resume a suspended continuation by re-triggering the original effect.
 *
 * Takes a `Snapshot` from a previous `RunResult` of type `'suspended'` and
 * re-dispatches the original effect (captured in `snapshot.effectName` /
 * `snapshot.effectArg`) to the registered host handlers. The handler then
 * calls `resume(value)`, `fail()`, or `suspend()` as normal.
 *
 * Throws if the snapshot has no captured effect (i.e. suspension occurred
 * outside of an effect handler, such as in a parallel/race branch).
 *
 * Always resolves — never rejects. May return `completed`, `suspended`
 * (if the handler suspends again), or `error`.
 *
 * ```typescript
 * const { snapshot } = suspendedResult
 * const next = await retrigger(snapshot, { handlers })
 * ```
 */
export async function retrigger(snapshot: Snapshot, options?: RetriggerOptions): Promise<RunResult> {
  if (!snapshot.effectName || snapshot.effectArg === undefined) {
    return {
      type: 'error',
      error: new RuntimeError(
        'Cannot retrigger: snapshot has no captured effect (suspended outside of an effect handler)',
        undefined,
      ),
    }
  }

  try {
    const modules = options?.modules ? new Map(options.modules.map(m => [m.name, m])) : undefined

    const deserializeOptions = {
      modules,
    }

    const deserialized = deserializeFromObject(snapshot.continuation, deserializeOptions)

    const result = await retriggerWithEffects(
      deserialized.k,
      snapshot.effectName,
      snapshot.effectArg,
      options?.handlers,
      {
        snapshots: deserialized.snapshots,
        nextSnapshotIndex: deserialized.nextSnapshotIndex,
        maxSnapshots: options?.maxSnapshots,
        autoCheckpoint: !options?.disableAutoCheckpoint,
        ...(options?.terminalSnapshot ? { terminalSnapshot: true } : {}),
      },
      deserializeOptions,
    )
    // Apply toJS to convert PV/PM to plain JS arrays/objects, matching dvala.runAsync() semantics
    if (result.type === 'completed') return { ...result, value: toJS(result.value as Any) }
    return result
  } catch (error) {
    if (error instanceof DvalaError) {
      return { type: 'error', error }
    }
    return { type: 'error', error: new DvalaError(`${error}`, undefined) }
  }
}
