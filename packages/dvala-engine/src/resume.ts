/**
 * Standalone `resume()` function for resuming suspended continuations.
 *
 * The primary API for running Dvala programs is `createDvala()` from `./createDvala`.
 */

import { DvalaError } from '@mojir/dvala-types'
import type { DvalaModule } from './builtin/modules/interface'
import type { RuntimeResumeOptions, RuntimeRunResult, RuntimeSnapshot } from '@mojir/dvala-runtime'
import { continueWithEffects, resumeWithEffects } from './evaluator/trampoline-evaluator'
import { deserializeFromObject } from './evaluator/suspension'
import { toJS, validateFromJS } from './interop'
import type { Any } from '@mojir/dvala-types'
import { scopeToGlobalContext } from './scopeToGlobalContext'

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/**
 * Options for `resume()` — resume a suspended continuation.
 * All host interaction goes through `handlers`.
 * `modules` must be provided again (they are not in the blob).
 */
export interface ResumeOptions extends RuntimeResumeOptions {
  modules?: DvalaModule[]
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
export async function resume(
  snapshot: RuntimeSnapshot,
  value: unknown,
  options?: ResumeOptions,
): Promise<RuntimeRunResult> {
  try {
    const modules = options?.modules ? new Map(options.modules.map(m => [m.name, m])) : undefined

    const scopeContext = scopeToGlobalContext(options?.scope)

    // Extract the opaque continuation from the snapshot and deserialize it.
    const deserialized = deserializeFromObject(snapshot.continuation, {
      modules,
      scope: scopeContext,
    })

    // scope is deliberately excluded here — it was already applied to globalContexts
    // during deserializeFromObject above. This object is only used for re-deserialization
    // of nested blobs during parallel execution.
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
      : await resumeWithEffects(
          deserialized.k,
          validateFromJS(value, 'resume() value'),
          options?.handlers,
          initialSnapshotState,
          deserializeOptions,
        )
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
