/**
 * Step types for the trampoline evaluator.
 *
 * The trampoline loop processes one `Step` per tick. Each tick produces a new
 * `Step`, transforming the evaluation incrementally until a final `Value` step
 * with an empty continuation stack signals completion.
 *
 * Step variants:
 * - **Value**: A sub-expression produced a value. If `k` is empty, the program
 *   is done. Otherwise, pop the top frame and apply it with `applyFrame`.
 * - **Eval**: Evaluate an AST node in the given environment. `stepNode` maps
 *   the node to the next step (either a `Value` for leaves or an `Eval`/`Apply`
 *   with a new frame pushed onto `k`).
 * - **Apply**: A frame has received a value and needs to determine the next step.
 *   Dispatches to `applyFrame(frame, value, k)`.
 * - **Perform**: An effect was invoked via `perform`. The trampoline searches `k`
 *   for a matching `AlgebraicHandleFrame` (local handler) or dispatches to a host handler.
 *
 * All step types are plain serializable objects (when `ContextStack` is replaced
 * with a serializable representation in Phase 4).
 */

import type { DvalaError } from '../errors'
import type { Any } from '../interface'
import type { AstNode, EffectRef } from '../parser/types'
import type { SourceCodeInfo } from '../tokenizer/token'
import type { ContinuationStack, Frame, ParallelBranchContext, ReRunParallelFrame, ResumeParallelFrame } from './frames'
import type { ContextStack } from './ContextStack'
import type { Snapshot } from './effectTypes'

// ---------------------------------------------------------------------------
// Step variants
// ---------------------------------------------------------------------------

/**
 * A sub-expression has been fully evaluated to a value.
 *
 * The trampoline checks `k`:
 * - If empty → the program is complete; `value` is the final result.
 * - If non-empty → pop the top frame and call `applyFrame(frame, value, rest)`.
 */
export interface ValueStep {
  type: 'Value'
  value: Any
  k: ContinuationStack
}

/**
 * An AST node needs to be evaluated in the given environment.
 *
 * The trampoline calls `stepNode(node, env, k)` which inspects the node type
 * and returns the next step:
 * - Leaf nodes (number, string, symbol lookup) → `ValueStep`
 * - Compound nodes → push a frame onto `k` and return `EvalStep` for the
 *   first sub-expression.
 */
export interface EvalStep {
  type: 'Eval'
  node: AstNode
  env: ContextStack
  k: ContinuationStack
}

/**
 * A frame needs to process a completed sub-result.
 *
 * The trampoline calls `applyFrame(frame, value, k)` to determine the next
 * step. For example, an `IfBranchFrame` receiving a truthy value returns an
 * `EvalStep` for the then-branch.
 */
export interface ApplyStep {
  type: 'Apply'
  frame: Frame
  value: Any
  k: ContinuationStack
}

/**
 * An effect was invoked via `perform(effect, arg)`.
 *
 * The trampoline searches the continuation stack `k` from top to bottom for
 * a matching `AlgebraicHandleFrame`. If found, the handler is dispatched locally.
 * If not found, the effect is dispatched to the host handler registered
 * in `run()` options, or to a standard effect default implementation.
 *
 * `arg` is the single payload value (null when no payload was provided).
 */
export interface PerformStep {
  type: 'Perform'
  effect: EffectRef
  arg: Any
  k: ContinuationStack
  sourceCodeInfo?: SourceCodeInfo
}

/**
 * A `parallel(...)` expression was encountered.
 *
 * The trampoline runs all branch expressions concurrently as independent
 * trampoline invocations using `Promise.allSettled`. Each branch gets the
 * same handlers and signal. Results are collected in order.
 *
 * If any branch suspends, a composite blob is created with completed values
 * and suspended branch blobs, and a `SuspensionSignal` is thrown.
 *
 * Only available in async mode (`run()`). In `runSync()`, this step causes
 * a "Unexpected async operation" error because it returns `Promise<Step>`.
 */
export interface ParallelStep {
  type: 'Parallel'
  branches: AstNode[]
  env: ContextStack
  k: ContinuationStack
}

/**
 * A `race(...)` expression was encountered.
 *
 * The trampoline runs all branch expressions concurrently. The first branch
 * to complete wins — its value becomes the result. Losers are cancelled via
 * per-branch AbortControllers. Errored branches are silently dropped.
 *
 * If all branches error, throws an aggregate error. If no branch completes
 * but some suspend, the race suspends with only the outer continuation.
 * On resume, the host provides the winner value directly.
 *
 * Only available in async mode (`run()`).
 */
export interface RaceStep {
  type: 'Race'
  branches: AstNode[]
  env: ContextStack
  k: ContinuationStack
}

/**
 * Settled: run all branches concurrently, wrap each result as [:ok, value] or [:error, error].
 * Never throws — all errors are captured as tagged results.
 */
export interface SettledStep {
  type: 'Settled'
  branches: AstNode[]
  env: ContextStack
  k: ContinuationStack
}

/**
 * A parallel resumption is in progress.
 *
 * Created when a `ParallelResumeFrame` receives a value (the resume result
 * of the first suspended branch). The trampoline resumes that branch's
 * trampoline and processes the result.
 *
 * This step type is handled by `tick()` which has access to `handlers` and
 * `signal` needed to run the branch trampoline.
 */
export interface ParallelResumeStep {
  type: 'ParallelResume'
  value: unknown
  branchCount: number
  completedBranches: { index: number; value: unknown }[]
  suspendedBranches: { index: number; snapshot: Snapshot }[]
  k: ContinuationStack
}

/**
 * A parallel branch has completed — its value reached the BarrierFrame.
 *
 * This step is returned by `applyFrame` when a `ParallelBranchBarrierFrame`
 * receives a value. The trampoline loop (`runEffectLoop`) recognizes this
 * step type and returns it as a branch result, exiting the branch's
 * trampoline without flowing into outerK.
 */
export interface BranchCompleteStep {
  type: 'BranchComplete'
  value: Any
  branchCtx: ParallelBranchContext
}

/**
 * A `ReRunParallelFrame` received a value (the resumed branch completed).
 *
 * The trampoline needs to re-run sibling branches from their original AST
 * concurrently, collect results, and continue with the outer program.
 * Handled by `tick()` which has access to `handlers` and `signal`.
 */
export interface ReRunParallelExecStep {
  type: 'ReRunParallelExec'
  resumedBranchValue: Any
  frame: ReRunParallelFrame
  k: ContinuationStack
}

/**
 * A `ResumeParallelFrame` received a value (the resumed branch completed).
 *
 * The trampoline needs to resume suspended siblings concurrently, collect
 * results, and continue with the outer program. Handled by `tick()` which
 * has access to `handlers` and `signal`.
 */
export interface ResumeParallelExecStep {
  type: 'ResumeParallelExec'
  /** The completed value from the resumed branch */
  resumedBranchValue: Any
  /** The ResumeParallelFrame with sibling state */
  frame: ResumeParallelFrame
  /** Outer continuation (after the frame) */
  k: ContinuationStack
}

/**
 * An async operation produced an error that needs to be routed through the
 * effect system.
 *
 * Produced by async error paths (host handler rejection) so that `tick()` can
 * attempt `dvala.error` dispatch with
 * access to the registered `handlers` and `signal`.
 */
export interface ErrorStep {
  type: 'Error'
  error: DvalaError
  k: ContinuationStack
}

// ---------------------------------------------------------------------------
// Step union type
// ---------------------------------------------------------------------------

/**
 * Discriminated union of all step types.
 *
 * The trampoline loop processes one `Step` per iteration:
 *
 * ```
 * while (true) {
 *   step = tick(step)
 *   if (step.type === 'Value' && step.k.length === 0) return step.value
 * }
 * ```
 *
 * The `type` field serves as the discriminant for exhaustive switching.
 */
export type Step =
  | ValueStep
  | EvalStep
  | ApplyStep
  | PerformStep
  | ParallelStep
  | RaceStep
  | SettledStep
  | ParallelResumeStep
  | ReRunParallelExecStep
  | ResumeParallelExecStep
  | BranchCompleteStep
  | ErrorStep
