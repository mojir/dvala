# Composite Snapshots — Design Plan

## 1. Overview

The existing snapshot system captures the **full program continuation** at a checkpoint. This works correctly when a `dvala.checkpoint` is performed at the top level or inside a linear call stack. However, when a branch inside `parallel(...)` or `race(...)` hits a checkpoint, the serialized `k` only contains `k_branch` — the branch's local continuation. Resuming that snapshot would re-run only that branch in isolation, ignoring the outer program entirely.

A **composite snapshot** captures:

1. `k_branch` — the local continuation of the branch that checkpointed
2. A synthetic `ParallelCheckpointResumeFrame` that records which other branches are already done and what the remaining branches' AST nodes are (so they can be re-run from scratch)
3. `k_outer` — the continuation after the entire `parallel` or `race` expression

On resume the program behaves as if the `parallel` were re-entering with branch A resuming from its checkpoint and branches B, C, … being re-run fresh from their original AST nodes.

This is consistent with checkpoint semantics — a checkpoint means "from this point forward the program is repeatable." Side effects from sibling branches that already ran before the snapshot are considered committed history; re-running them is the intended behavior.

---

## 2. The Composite Continuation Structure

When branch A inside `parallel(b0, b1, b2)` performs `dvala.checkpoint`, the composite snapshot's continuation encodes:

```
k_composite = k_branch_A ++ [ParallelCheckpointResumeFrame, ...k_outer]
```

Where `ParallelCheckpointResumeFrame` holds:

```typescript
interface ParallelCheckpointResumeFrame {
  type: 'ParallelCheckpointResume'

  // Total number of branches in the original parallel/race call
  branchCount: number

  // Branches that finished before the snapshot was taken
  completedBranches: { index: number; value: Any }[]

  // Branches that were still running or not yet started — re-run from scratch on resume
  pendingBranches: { index: number; node: AstNode; env: ContextStack }[]

  // 'parallel' or 'race' — determines how to aggregate the re-run results
  kind: 'parallel' | 'race'
}
```

When this frame is deserialized and resumed:

1. The restored `k_branch_A` runs to completion (the resume value feeds into it).
2. `ParallelCheckpointResumeFrame` fires: each `pendingBranches` entry is re-run from scratch using its `node` and `env`.
3. Completed results are merged with `completedBranches` and reduced according to `kind`.
4. Control passes to `k_outer`.

For `race`, only the first branch to complete wins; all others are cancelled. For `parallel`, all must complete.

---

## 3. New / Modified Frame Types

### 3.1 New: `ParallelCheckpointResumeFrame`

Add to `src/evaluator/frames.ts`:

```typescript
export interface ParallelCheckpointResumeFrame {
  type: 'ParallelCheckpointResume'
  branchCount: number
  completedBranches: { index: number; value: Any }[]
  pendingBranches: { index: number; node: AstNode; env: ContextStack }[]
  kind: 'parallel' | 'race'
}
```

Add to the `Frame` union type and to `ContinuationStack`.

### 3.2 No changes to `ParallelResumeFrame`

The existing `ParallelResumeFrame` handles the `suspend()` path (where branches hold real suspension blobs). Composite snapshots use the new `ParallelCheckpointResumeFrame` exclusively. The two paths stay independent.

---

## 4. Changes to `runBranch` / `executeParallelBranches` / `executeRaceBranches`

### 4.1 Passing outer context into branches

Add a `BranchCheckpointContext` that carries what a branch needs to build a composite snapshot:

```typescript
export interface BranchCheckpointContext {
  branchIndex: number
  allBranchNodes: AstNode[]
  groupEnv: ContextStack       // the env passed to executeParallelBranches — same for all branches
  outerK: ContinuationStack
  kind: 'parallel' | 'race'

  /** Shared mutable array — branches push their result here when they complete. */
  completedBranches: { index: number; value: Any }[]
}
```

Extend `SnapshotState` with an optional field:

```typescript
export interface SnapshotState {
  // ... existing fields ...
  branchContext?: BranchCheckpointContext
}
```

### 4.2 Modified `executeParallelBranches`

1. Create one shared `completedBranches: { index, value }[]` array.
2. For each branch, build a per-branch `SnapshotState` inheriting outer config plus `branchContext`.
3. Pass it to `runBranch`.
4. When a branch completes, push `{ index, value }` onto the shared array.

The suspension path (`ParallelResumeFrame`) is unchanged.

### 4.3 Modified `executeRaceBranches`

Same pattern, `kind: 'race'`. The `completedBranches` shared array will contain at most one entry (the winner) — but at checkpoint time it is likely empty.

### 4.4 Modified `runBranch`

```typescript
async function runBranch(
  node: AstNode,
  env: ContextStack,
  handlers: Handlers | undefined,
  signal: AbortSignal,
  branchSnapshotState?: SnapshotState,  // NEW
): Promise<RunResult>
```

When `branchSnapshotState` is provided, pass it to `runEffectLoop` instead of creating a fresh one.

---

## 5. How `dispatchPerform` Constructs the Composite Snapshot

In the `dvala.checkpoint` block of `dispatchPerform`:

```typescript
if (effect.name === 'dvala.checkpoint' && snapshotState) {
  const bctx = snapshotState.branchContext
  let continuation: unknown

  if (bctx) {
    // Composite snapshot: k = k_branch ++ [PCRF, ...k_outer]
    const pendingBranches = bctx.allBranchNodes
      .map((node, i) => ({ index: i, node, env: bctx.groupEnv }))
      .filter(b =>
        b.index !== bctx.branchIndex &&
        !bctx.completedBranches.some(c => c.index === b.index)
      )

    const pcrf: ParallelCheckpointResumeFrame = {
      type: 'ParallelCheckpointResume',
      branchCount: bctx.allBranchNodes.length,
      completedBranches: [...bctx.completedBranches],  // snapshot, not live ref
      pendingBranches,
      kind: bctx.kind,
    }

    continuation = serializeToObject([...k, pcrf, ...bctx.outerK])
  } else {
    continuation = serializeToObject(k)
  }

  const snapshot = createSnapshot({ continuation, ... })
  snapshotState.snapshots.push(snapshot)
}
```

---

## 6. Resume Semantics

When `resumeFrom(compositeSnapshot, value)` is called, deserialization produces a `ContinuationStack` of:

```
[...k_branch_frames, ParallelCheckpointResumeFrame, ...k_outer_frames]
```

The trampoline runs `k_branch` normally until branch A completes, producing a value. Then `applyFrame` encounters `ParallelCheckpointResumeFrame` and dispatches a `ParallelCheckpointResumeStep`.

### New `ParallelCheckpointResumeStep`

```typescript
export interface ParallelCheckpointResumeStep {
  type: 'ParallelCheckpointResume'
  resumedBranchValue: Any
  completedBranches: { index: number; value: Any }[]
  pendingBranches: { index: number; node: AstNode; env: ContextStack }[]
  branchCount: number
  kind: 'parallel' | 'race'
  k: ContinuationStack   // = k_outer
}
```

### `handleParallelCheckpointResume`

1. Determine the checkpoint branch's index (the one not in `completedBranches` or `pendingBranches`).
2. Merge `resumedBranchValue` into `completedBranches`.
3. If no pending branches: assemble the result array and continue with `k_outer`.
4. If pending branches exist: re-run them via `runBranch` (no `branchContext` — fresh runs).
5. If `kind === 'parallel'`: collect all results and return the array.
6. If `kind === 'race'`: take the first to complete, cancel the rest.
7. If any re-run branch suspends: construct a normal `ParallelResumeFrame` with `k_outer` and throw `SuspensionSignal`.

---

## 7. Serialization

`ParallelCheckpointResumeFrame` is a plain object in the continuation array. `serializeToObject` handles it automatically via the existing frame serialization machinery:

- `completedBranches` — plain `Any` values: already serializable.
- `pendingBranches.node` — `AstNode` JSON tuples: no closures, already serializable.
- `pendingBranches.env` — `ContextStack`: handled by the existing `collectContextStacks` pipeline.

No changes to `suspension.ts` required, but this should be verified by round-trip tests.

---

## 8. Edge Cases

### Nested `parallel` inside `parallel`

Each level composes its own `PCRF` targeting its own `k_outer`. Stacking is correct automatically — the inner composite snapshot's continuation includes the outer `PCRF` in `k_outer`.

### Race — sibling cancellation

At checkpoint time inside a race branch, `completedBranches` is always empty (no winner yet). On composite resume, all siblings are re-run and the race plays out again. Non-determinism across re-runs is acceptable — this is inherent to `race`.

### `autoCheckpoint` inside branches

`AutoCheckpointFrame` is part of `k_branch` and is included in the composite continuation. On resume it re-dispatches the original effect correctly. No special handling needed.

### `retriggerParallelGroup` — out of scope

Composite snapshots during suspension retrigger are not handled in this plan. `retriggerParallelGroup` does not pass `branchContext` to re-run branches. A follow-up can extend this.

---

## Implementation Steps

### Step 1 — Define `BranchCheckpointContext` and extend `SnapshotState`

**Files:**
- `src/evaluator/effectTypes.ts` — add `BranchCheckpointContext`, add `branchContext?` to `SnapshotState`

**Tests:** type-only, existing tests must pass.

---

### Step 2 — Add `ParallelCheckpointResumeFrame` and `ParallelCheckpointResumeStep`

**Files:**
- `src/evaluator/frames.ts` — add `ParallelCheckpointResumeFrame`, add to `Frame` union
- `src/evaluator/step.ts` — add `ParallelCheckpointResumeStep`, add to `Step` union

**Tests:** type-only, existing tests must pass.

---

### Step 3 — Thread `branchContext` through `executeParallelBranches` and `executeRaceBranches`

**Files:**
- `src/evaluator/trampoline-evaluator.ts`
  - `runBranch`: accept optional `branchSnapshotState?: SnapshotState`
  - `executeParallelBranches`: create shared `completedBranches[]`, build per-branch `SnapshotState` with `branchContext`, pass to `runBranch`; push completed results to shared array
  - `executeRaceBranches`: same pattern with `kind: 'race'`

**Tests:** no composite snapshots built yet — all existing tests must pass.

---

### Step 4 — Build composite continuation in `dispatchPerform` for `dvala.checkpoint`

**Files:**
- `src/evaluator/trampoline-evaluator.ts` — composite `k` construction in the `dvala.checkpoint` block

**Tests** (new `__tests__/composite-snapshots.test.ts`):
- `parallel(perform(checkpoint), 42)` — snapshot, resume, verify result `[resumeValue, 42]`
- Checkpoint inside nested function call inside a branch
- `completedBranches` populated correctly for branches that finished before checkpoint

---

### Step 5 — Add `applyParallelCheckpointResume` and `handleParallelCheckpointResume`

**Files:**
- `src/evaluator/trampoline-evaluator.ts`
  - `applyParallelCheckpointResume(frame, value, k)` → `ParallelCheckpointResumeStep`
  - Wire into `applyFrame` switch
  - `handleParallelCheckpointResume(step, handlers, signal, snapshotState)`
  - Wire into `tick()` switch

**Tests:**
- Resume composite snapshot where branch A checkpointed, branch B had not started
- Resume composite snapshot where branch A checkpointed, branch B already completed
- `resumeFrom` rollback — snapshot history trimmed correctly

---

### Step 6 — Handle `race` in `handleParallelCheckpointResume`

**Files:**
- `src/evaluator/trampoline-evaluator.ts` — `rerunRacePending` helper, wire via `kind === 'race'` branch

**Tests:**
- `race(perform(checkpoint), branch2)` — resume, verify winner value
- All pending branches error on re-run — aggregate error propagates

---

### Step 7 — Handle suspension of pending branches during composite resume

When a re-run pending branch calls `suspend()`, construct a `ParallelResumeFrame` with `k_outer` as today.

**Files:**
- `src/evaluator/trampoline-evaluator.ts` — ensure `rerunParallelPending` / `rerunRacePending` throw `SuspensionSignal` with correct `k_outer`

**Tests:**
- Pending branch suspends during composite resume → `RunResult.suspended` can be resumed via existing `ParallelResumeFrame` path

---

### Step 8 — Round-trip serialization tests and documentation

**Files:**
- `__tests__/composite-snapshots.test.ts` — add serialization round-trip test for `ParallelCheckpointResumeFrame`
- Update this plan with completion status per step
