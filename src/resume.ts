/**
 * Standalone `resume()` function for resuming suspended continuations.
 *
 * The primary API for running Dvala programs is `createDvala()` from `./createDvala`.
 */

import { DvalaError } from './errors'
import type { DvalaModule } from './builtin/modules/interface'
import { continueWithEffects, resumeWithEffects } from './evaluator/trampoline-evaluator'
import { deserializeFromObject } from './evaluator/suspension'
import { fromJS, toJS } from './utils/interop'
import type { Any } from './interface'
import type { Context } from './evaluator/interface'

import type { Handlers, RunResult, Snapshot } from './evaluator/effectTypes'

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/**
 * Options for `resume()` — resume a suspended continuation.
 * All host interaction goes through `handlers`.
 * `modules` must be provided again (they are not in the blob).
 */
export interface ResumeOptions {
  handlers?: Handlers
  modules?: DvalaModule[]
  maxSnapshots?: number
  disableAutoCheckpoint?: boolean
  terminalSnapshot?: boolean
  /** New scope values to inject into the computation's globalContext before resuming. */
  scope?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// resume()
// ---------------------------------------------------------------------------

/**
 * Resume a suspended continuation.
 *
 * Takes a `Snapshot` from a previous `RunResult` of type `'suspended'`, a
 * resume value, and optional handlers. Re-enters the trampoline at
 * the point of suspension with the provided value.
 *
 * `modules` must be provided again if the Dvala program uses `import`.
 *
 * Always resolves — never rejects. May return `completed`, `suspended`
 * (if another suspend is hit), or `error`.
 *
 * ```typescript
 * const { snapshot } = suspendedResult
 * const next = await resume(snapshot, humanDecision, { handlers })
 * ```
 */
export async function resume(snapshot: Snapshot, value: unknown, options?: ResumeOptions): Promise<RunResult> {
  try {
    const modules = options?.modules
      ? new Map(options.modules.map(m => [m.name, m]))
      : undefined

    // Convert a plain scope record to a Context for injection into globalContexts.
    // fromJS converts plain JS arrays/objects to PersistentVector/PersistentMap.
    let scopeContext: Context | undefined
    if (options?.scope) {
      scopeContext = {}
      for (const [k, v] of Object.entries(options.scope)) {
        scopeContext[k] = { value: fromJS(v) }
      }
    }

    // Extract the opaque continuation from the snapshot and deserialize it.
    const deserialized = deserializeFromObject(snapshot.continuation, {
      modules,
      scope: scopeContext,
    })

    const deserializeOptions = {
      modules,
    }

    const initialSnapshotState = {
      snapshots: deserialized.snapshots,
      nextSnapshotIndex: deserialized.nextSnapshotIndex,
      maxSnapshots: options?.maxSnapshots,
      autoCheckpoint: !options?.disableAutoCheckpoint,
      ...(options?.terminalSnapshot ? { terminalSnapshot: true } : {}),
    }

    const result = deserialized.initialStep
      ? await continueWithEffects(
        deserialized.initialStep,
        options?.handlers,
        initialSnapshotState,
        deserializeOptions,
        options?.terminalSnapshot,
      )
      : await resumeWithEffects(deserialized.k, fromJS(value), options?.handlers, initialSnapshotState, deserializeOptions)
    // Apply toJS to convert PV/PM to plain JS arrays/objects, matching run() semantics
    if (result.type === 'completed') {
      return { ...result, value: toJS(result.value as Any) }
    }
    return result
  } catch (error) {
    if (error instanceof DvalaError) {
      return { type: 'error', error }
    }
    return { type: 'error', error: new DvalaError(`${error}`, undefined) }
  }
}
