/**
 * Standalone `resume()` function for resuming suspended continuations.
 *
 * The primary API for running Dvala programs is `createDvala()` from `./createDvala`.
 */

import type { Any } from './interface'
import { DvalaError } from './errors'
import type { DvalaModule } from './builtin/modules/interface'
import { resumeWithEffects } from './evaluator/trampoline-evaluator'
import { deserializeFromObject } from './evaluator/suspension'

import type { Handlers, RunResult, Snapshot } from './evaluator/effectTypes'

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/**
 * Options for `resume()` — resume a suspended continuation.
 * `bindings` are plain values only (no JS functions).
 * All host interaction goes through `handlers`.
 * `modules` must be provided again (they are not in the blob).
 */
export interface ResumeOptions {
  bindings?: Record<string, Any>
  handlers?: Handlers
  modules?: DvalaModule[]
  maxSnapshots?: number
  autoCheckpoint?: boolean
}

// ---------------------------------------------------------------------------
// resume()
// ---------------------------------------------------------------------------

/**
 * Resume a suspended continuation.
 *
 * Takes a `Snapshot` from a previous `RunResult` of type `'suspended'`, a
 * resume value, and optional handlers/bindings. Re-enters the trampoline at
 * the point of suspension with the provided value.
 *
 * `bindings` are plain values only (no JS functions). They are re-injected
 * into the deserialized ContextStacks so that host-bound values remain
 * accessible after resume. `modules` must be provided again if the Dvala
 * program uses `import`.
 *
 * Always resolves — never rejects. May return `completed`, `suspended`
 * (if another suspend is hit), or `error`.
 *
 * ```typescript
 * const { snapshot } = suspendedResult
 * const next = await resume(snapshot, humanDecision, { handlers })
 * ```
 */
export async function resume(snapshot: Snapshot, value: Any, options?: ResumeOptions): Promise<RunResult> {
  try {
    const modules = options?.modules
      ? new Map(options.modules.map(m => [m.name, m]))
      : undefined

    // Extract the opaque continuation from the snapshot and deserialize it.
    const deserialized = deserializeFromObject(snapshot.continuation, {
      values: options?.bindings as Record<string, unknown> | undefined,
      modules,
    })

    const deserializeOptions = {
      values: options?.bindings as Record<string, unknown> | undefined,
      modules,
    }

    return await resumeWithEffects(deserialized.k, value, options?.handlers, {
      snapshots: deserialized.snapshots,
      nextSnapshotIndex: deserialized.nextSnapshotIndex,
      maxSnapshots: options?.maxSnapshots,
      autoCheckpoint: options?.autoCheckpoint,
    }, deserializeOptions)
  } catch (error) {
    if (error instanceof DvalaError) {
      return { type: 'error', error }
    }
    return { type: 'error', error: new DvalaError(`${error}`, undefined) }
  }
}
