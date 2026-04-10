# Parallel and Race: Snapshots, Resume, and Multi-Shot

**Status:** Complete ✅
**Created:** 2026-04-02
**Revised:** 2026-04-03 — addresses review findings (factual fixes, design gaps, missing considerations)
**Revised:** 2026-04-10 — finalized design decisions, started implementation
**Completed:** 2026-04-10 — all phases implemented on branch `feat/parallel-snapshot-resume`

## Goal

Make snapshots fully functional inside `parallel` and `race` — a snapshot taken inside a branch should capture the entire program state, and resuming from it should complete the full program.

---

## The Model

### One rule

**Every snapshot is a full-program continuation.** Resuming from any snapshot — whether taken before, during, or after a parallel/race — runs the program to completion.

### How snapshots compose with parallel

A snapshot inside a parallel branch must answer: "if I resume here, what happens to the rest of the parallel, and what happens after it?"

There are two situations where snapshots are created inside a branch, and they differ in what we know about sibling branches:

#### 1. Mid-execution checkpoint (host calls `checkpoint()` during an effect)

Siblings are still running concurrently. We can't snapshot them. So the checkpoint says:

> "Resume this branch from here. Re-run all other branches from scratch. Collect results. Continue with the outer program."

The continuation is: `branchK → ReRunFrame(originalAST, env, mode) → outerK`

#### 2. Final suspension (all branches have settled)

By this point, siblings have either completed or been force-suspended at their abort point (via the abort signal). We know their state. So the snapshot says:

> "Resume this branch from here. Resume suspended siblings from their abort points. Use completed siblings' cached values. Collect results. Continue with the outer program."

The continuation is: `branchK → ResumeFrame(completedValues, siblingContinuations) → outerK`

### Under this proposal, race becomes parallel with `completedBranches: []`

Race only suspends when no branch completed (if one had, it would have won). The same two frame types apply — just with race-style result collection (first wins) instead of parallel-style (array of all).

**Note:** This is a semantic change from today's race suspension model. Currently, `executeRaceBranches` suspends with `throwSuspension(k, raceMeta)` using the outer `k` directly — no `ParallelResumeFrame`, no branch continuations at all. The `raceMeta` contains only metadata about suspended branches (not their `k`s), and the host provides the winner value directly on resume. Under this proposal, the frame orchestrates re-running/resuming branches and picks the first to complete — the host no longer chooses the winner. This makes the unification with parallel a larger change than the `mode` field alone suggests — see the dedicated Phase 5 below.

### Nested parallel composes recursively

`parallel(parallel(a, b), c)` — inner parallel is just a branch of the outer parallel. The inner branch's snapshots are composed with the inner parallel context first, then the outer parallel context wraps them again. Each level adds its own frame + outerK. The composition is the same operation applied at each nesting level.

### Snapshot ordering

Branches inherit the outer `snapshotState` (including `nextSnapshotIndex`), so branch checkpoints naturally continue the outer index sequence — no renumbering needed. If the outer has indices 0..N-1 with `nextSnapshotIndex = N`, the branch creates checkpoints at N, N+1, etc. Sibling branches' intermediate checkpoints are discarded (siblings will re-run or resume from abort points). Only the suspending branch's checkpoints survive into the composed timeline. Result: a clean, monotonic timeline by construction.

Note: `maxSnapshots` eviction may `shift()` older snapshots from the array, creating gaps in the stored indices. This is fine — `resumeFrom` looks up by index value, not array position.

### Multi-shot

Safe, but requires the `BarrierFrame` to act as an **effect boundary**. Without this, algebraic effects from inside a branch would propagate into outer handlers through the outerK, breaking multi-shot semantics (and changing current effect isolation behavior). See the in-depth section for the full analysis.

---

## In Depth: Suspensions, Checkpoints, and Parallel

This section explains the full mechanics — what happens today, why it's insufficient, and exactly how the proposed model fixes it.

### How checkpoints and suspensions work today

There are three ways a snapshot is created during execution:

1. **Explicit `dvala.checkpoint` effect** — Dvala code calls `perform(@dvala.checkpoint, "message")`. The evaluator serializes the current continuation `k` immediately and pushes it onto `snapshotState.snapshots`. The program continues normally. (search: `effect.name === 'dvala.checkpoint'` in `trampoline-evaluator.ts`)

2. **Host `checkpoint()`** — A host effect handler calls `ctx.checkpoint(message)` on the `EffectContext`. Same mechanics: serializes `k`, pushes to `snapshotState.snapshots`. Returns the snapshot to the host. (search: `checkpoint:` in `dispatchHostHandler`)

3. **Auto-checkpoint** — When `autoCheckpoint: true`, after every effect where the host calls `ctx.resume(value)`, a snapshot is automatically captured. This happens inside the `resume()` callback before the value flows back to the continuation. (search: `autoCheckpoint` in `dispatchHostHandler`)

In all three cases, the snapshot stores a **serialized continuation** — the full `k` at that point, turned into an opaque blob via `serializeToObject(k)`.

**Suspension** is different, and there are two distinct paths:

1. **`ctx.suspend(meta)`** — a host handler explicitly suspends. Throws a `SuspensionSignal` carrying the raw `k`, the accumulated `snapshotState.snapshots`, `nextSnapshotIndex`, and metadata. This signal propagates up to `runEffectLoop()`, which serializes it into the final `RunResult { type: 'suspended', snapshot }` via `serializeSuspensionBlob`.

2. **`throwSuspension(k, meta)`** — used by abort-triggered auto-suspension in parallel branches (when `effectSignal.aborted` is true at `dispatchHostHandler` entry). This creates a `SuspensionSignal` with `snapshots: []` and `nextSnapshotIndex: 0` — **no snapshot history**. The branch's accumulated snapshots from its `runEffectLoop` are captured separately in the branch's `RunResult.snapshot`, not in the `throwSuspension` call.

This distinction matters for the proposed design: when composing the final suspension, we must recover snapshots from the branch's `RunResult`, not from the `SuspensionSignal` thrown by `throwSuspension`.

**`resumeFrom(snapshot)`** is time travel: it deserializes a checkpoint's continuation and re-enters the trampoline at that point, discarding any snapshots taken after it.

### Why this breaks inside parallel

Parallel branches run as independent trampolines:

```
executeParallelBranches(branches, env, outerK, handlers, signal)
  → runBranch(branch[0], env, handlers, signal)  // k: null, independent snapshotState
  → runBranch(branch[1], env, handlers, signal)  // k: null, independent snapshotState
  → runBranch(branch[2], env, handlers, signal)  // k: null, independent snapshotState
```

Each `runBranch()` calls `runEffectLoop()` with no initial snapshot state and `k: null`. This means:

- **Checkpoints inside a branch serialize `k` that bottoms out at `null`** — the branch's continuation has no knowledge of the outer program. Resuming from such a checkpoint only replays the branch, not the full program.

- **The outer `snapshotState` (including pre-parallel checkpoints) is invisible to branches** — branches create their own fresh `SnapshotState`. Pre-parallel checkpoints aren't threaded in.

- **The `outerK` (continuation after the parallel) is only attached after branches finish** — `executeParallelBranches()` builds a `ParallelResumeFrame` on `outerK` at the end, but this is too late for checkpoints taken during branch execution.

The result: any checkpoint or suspension inside a parallel branch produces a branch-local snapshot that cannot complete the full program on resume. The host sees a suspension with the outer context (because `executeParallelBranches()` composes it after the fact), but all intermediate checkpoints are orphaned.

### The fundamental constraint

At checkpoint time inside a branch, we need to build a full-program continuation. This requires three things:

1. **The branch's own `k`** — available, it's what we'd normally serialize.
2. **The parallel context** — which branch am I? What are the other branches? What comes after the parallel?
3. **Sibling branch state** — what happened to the other branches?

Item 3 is the crux. At checkpoint time, siblings are running concurrently. We have no way to atomically snapshot them. Their state is indeterminate.

### The two-tier solution

We handle this by recognizing that there are exactly two moments when snapshots are created inside a parallel, and they differ in what we know about siblings:

#### Tier 1: Mid-execution checkpoints

Triggered by `dvala.checkpoint`, `ctx.checkpoint()`, or auto-checkpoint — while the branch is actively executing and siblings are still running.

**What we know**: the branch's `k`, the original parallel branches (AST), the env at the parallel call site, the outer `k`.

**What we don't know**: sibling state (still running concurrently).

**Solution**: build a `ReRunParallelFrame` that re-runs all siblings from scratch on resume.

```
Continuation = branchK → ReRunParallelFrame → outerK

ReRunParallelFrame contains:
  - branchIndex: which branch this checkpoint is for
  - branches: AstNode[]  (original AST for ALL branches)
  - env: ContextStack     (env at the parallel call site)
  - mode: 'parallel' | 'race'
```

On resume: the branch continues from `branchK`. When it completes and hits the `ReRunParallelFrame`, the frame re-evaluates all other branches from their original AST, collects results (parallel: array in order, race: first wins), and continues with `outerK`.

**Why re-run from scratch?** Because we have no other choice. Siblings were running concurrently and might have been in any state — mid-computation, mid-effect, anywhere. We can't snapshot them, so we re-run them. This is correct because branches should be pure-ish (their effects will re-trigger to the host, which can handle them again).

**Why not wait and compose later?** Because the host expects checkpoints to be immediately usable. A checkpoint returned by `ctx.checkpoint()` must be a valid, resumable snapshot right now — not something that gets "completed" later when the parallel finishes.

#### Tier 2: Final suspension

Triggered when a branch calls `ctx.suspend()` or when the abort signal forces suspension — after all branches have settled (completed, errored, or force-suspended).

**What we know**: everything. The branch's `k`, which siblings completed (and their values), which siblings were force-suspended (and their continuations at the abort point), the outer `k`.

**What we don't know**: nothing — all branches have settled.

**Solution**: build a `ResumeParallelFrame` that resumes suspended siblings from their abort points.

```
Continuation = branchK → ResumeParallelFrame → outerK

ResumeParallelFrame contains:
  - branchIndex: which branch this is
  - branchCount: total branches
  - completedBranches: { index, value }[]
  - suspendedBranches: { index, k: ContinuationStack }[]  // k truncated at BarrierFrame (no barrier or outerK tail)
  - mode: 'parallel' | 'race'
```

On resume: the branch continues from `branchK`. When it completes and hits the `ResumeParallelFrame`, the frame resumes all suspended siblings from their stored continuations (concurrently), uses completed siblings' cached values, collects results, and continues with `outerK`.

**Why is this better than Tier 1?** Because it avoids re-running siblings that already made progress. Suspended siblings resume from where they were force-stopped, saving all computation they'd already done. Completed siblings don't re-run at all — their values are cached.

**When does force-suspension happen?** When `parallelAbort.abort()` fires (because one branch suspended), sibling branches that are currently in `dispatchHostHandler` see `effectSignal.aborted` and auto-suspend via `throwSuspension(k, ...)` (line 2804–2805). This produces a clean continuation at the effect boundary. Siblings doing pure computation (no effect calls) simply run to completion and end up in `completedBranches`.

### How this threads through the code

Today, branches start with `k: null` — a bare continuation with no outer context:

```typescript
// Current
async function runBranch(node, env, handlers, signal): Promise<RunResult> {
  const initial = { type: 'Eval', node, env, k: null }
  return runEffectLoop(initial, handlers, signal)
}
```

The proposed change passes the outer continuation into branches via a `ParallelBranchBarrierFrame`:

```typescript
// Proposed
async function runBranch(node, env, handlers, signal, outerK, branchCtx?): Promise<RawBranchResult> {
  // The barrier frame sits between the branch and the outer continuation.
  // When the branch completes and its value reaches this frame, it signals
  // "branch done" instead of continuing into outerK.
  const barrierK = cons(ParallelBranchBarrierFrame({ branchCtx }), outerK)
  const initial = { type: 'Eval', node, env, k: barrierK }
  return runEffectLoopRaw(initial, handlers, signal)
}
```

**Branch execution**: the branch runs normally. Its continuation stack is `[branchFrames... → BarrierFrame → outerK]`. When the branch finishes, the trampoline hits the `BarrierFrame` and returns the value as a branch result (not flowing into `outerK`).

**Checkpoint creation**: every checkpoint site serializes `k` as-is. Since `k` already includes `BarrierFrame → outerK`, the serialized continuation is a full-program continuation by construction. No post-hoc composition needed for the continuation itself.

But the checkpoint also needs a `ReRunParallelFrame` — to tell the resume logic how to handle siblings. The `BarrierFrame` carries the `branchCtx` (branch index, original ASTs, env, mode), which is used to build the `ReRunParallelFrame` when the checkpoint is serialized. The `ReRunParallelFrame` replaces the `BarrierFrame` in the serialized continuation:

```
In memory:    branchK → BarrierFrame(branchCtx) → outerK
Serialized:   branchK → ReRunParallelFrame(branches, env, mode) → outerK
```

This way, branch execution uses the lightweight `BarrierFrame` (just a marker), but serialized checkpoints contain the full `ReRunParallelFrame` with sibling re-run info.

**Final suspension**: `executeParallelBranches()` collects raw results. For the suspending branch, it replaces the `BarrierFrame` with a `ResumeParallelFrame` (which has completed values + sibling continuations) before serializing.

**Note on current asymmetry**: today's `executeParallelBranches` treats the first suspended branch specially — its continuation becomes the `SuspensionSignal`'s `k` (surfaced to the host), while remaining suspended branches go into `ParallelResumeFrame.suspendedBranches` via `slice(1)`. The proposed design should decide whether to preserve this asymmetry or normalize it so that the suspending branch is identified by `branchIndex` and all suspended siblings (including the "primary" one) are tracked uniformly in the frame.

```
In memory:    branchK → BarrierFrame(branchCtx) → outerK
Composed:     branchK → ResumeParallelFrame(completed, suspended) → outerK
```

**Nested parallel**: works naturally. Inner branches get `outerK = [innerBranchFrames → BarrierFrame(outerCtx) → outerProgramK]`. Checkpoints at any depth include the full chain — no concatenation needed.

**Snapshot history**: branches receive the outer `snapshotState.snapshots` as prefix. When a branch creates a checkpoint, the snapshot array already contains pre-parallel checkpoints.

### The BarrierFrame as effect boundary — why multi-shot requires it

With the outerK approach, the branch's continuation is `[branchFrames → BarrierFrame → outerK]`. This introduces a subtle problem: when `dispatchPerform` walks up `k` looking for an `AlgebraicHandleFrame`, it would walk **through** the BarrierFrame and into `outerK`, finding handlers from the outer scope.

Today (with `k: null`), parallel branches are **effect-isolated** — algebraic effects that aren't caught within the branch fall through to host handlers. This is the correct semantics: parallel branches run independently, and their effects shouldn't interact with Dvala-level handlers from the outer scope.

If effects propagated through the BarrierFrame, it would break in two ways:

#### Problem 1: Semantic change

```dvala
do with handler @foo(x) -> resume(x * 2) end
  parallel(perform(@foo, 5), 10)
end
```

Today: `@foo` inside the branch isn't caught by the outer handler (effect-isolated). It falls through to host handlers.

With naive outerK: `@foo` propagates through the BarrierFrame, finds the outer handler. The handler resumes with `10`. The value flows back into the branch. **Different behavior from today** — this is an unintended semantic change.

#### Problem 2: Multi-shot breaks the parallel collector

```dvala
do with handler
  @choose(options) -> reduce(options, (acc, x) -> acc ++ resume(x), [])
end
  parallel(perform(@choose, [1, 2]), perform(@choose, [3, 4]))
end
```

If `@choose` propagates to the outer handler, the handler calls `resume()` multiple times (multi-shot). Each resume pushes a value back through the branch's continuation, which eventually hits the BarrierFrame. But we're inside the handler clause now, not inside `executeParallelBranches()` — there is no parallel collector waiting for branch results. The BarrierFrame would fire in a context where it can't deliver its result. **Broken.**

#### The fix: BarrierFrame blocks effect propagation

The `BarrierFrame` must act as an effect boundary. When `dispatchPerform` walks up `k` looking for handlers, it **stops** at the BarrierFrame. Today, effect isolation is achieved by branches starting with `k: null` — the search simply runs out of stack. With the proposed `outerK` threading, `k` no longer terminates at `null`, so the BarrierFrame must explicitly re-implement this boundary.

This gives the BarrierFrame three roles:

1. **Completion sentinel** — catches branch result, signals "branch done" to the parallel collector (replaces `k: null` as the branch terminator)
2. **Effect boundary** — blocks algebraic effect propagation to outer handlers (preserves current effect-isolation semantics)
3. **Context carrier** — holds `branchCtx` for checkpoint composition (new functionality)

In the trampoline, both `dispatchPerform` and `tryDispatchDvalaError` need the same barrier check — `tryDispatchDvalaError` also walks `k` looking for an `AlgebraicHandle` with a `dvala.error` clause, and must stop at the barrier for the same reasons:

```typescript
while (searchNode !== null) {
  const frame = searchNode.head
  // BarrierFrame stops effect propagation — same as reaching k: null
  if (frame.type === 'ParallelBranchBarrier') break
  if (frame.type === 'AlgebraicHandle') { ... }
  searchNode = searchNode.tail
}
```

#### Multi-shot scenarios with the barrier in place

**Multi-shot within a branch** — a handler defined inside the branch catches an effect from within the same branch. The handler and the effect are both in `branchK`, above the BarrierFrame. Standard multi-shot mechanics apply: `resume()` forks the continuation via `freshenContinuationEnvs()`. Each fork runs within the branch's trampoline. **Works, same as today.** ✓

**Multi-shot on composed snapshots** (host API) — the host calls `resume(snapshot, value)` multiple times on the same snapshot. Each call deserializes the continuation independently (fresh frames, fresh envs). Each processes the `ReRunParallelFrame` or `ResumeParallelFrame` independently — re-running or resuming siblings in isolation. No shared mutable state. **Safe by construction.** ✓

**Multi-shot from outside the parallel** — an outer algebraic handler catches an effect from inside a branch. **This case doesn't arise** — effects don't propagate through the BarrierFrame. The barrier preserves the current effect-isolation guarantee. ✓

**Time travel (`resumeFrom`) to a prior checkpoint** — the host resumes from snapshot C, then time-travels to snapshot B. B's continuation is deserialized fresh. If B is a Tier 1 checkpoint (inside a branch), its `ReRunParallelFrame` re-runs siblings from scratch. If B is pre-parallel, the entire `parallel(...)` re-evaluates. Each time-travel is a fresh execution from that point. **Safe.** ✓

### Why two frame types instead of one

A single frame type that stores "either AST for re-run or continuations for resume" would work mechanically, but the separation is cleaner:

- `ReRunParallelFrame` is self-contained — it has everything needed to re-run branches (AST + env). It doesn't depend on ephemeral state from the parallel execution.
- `ResumeParallelFrame` carries continuations — heavier, but more efficient on resume.
- The distinction makes the resume logic's intent clear: "am I re-running from scratch, or picking up where things left off?"
- Serialization differs: `ReRunParallelFrame` serializes AST nodes (already serializable), while `ResumeParallelFrame` must serialize continuation stacks for each sibling.

### Snapshot history is a linear chain

**Invariant: when you resume from a snapshot, all earlier snapshots on that execution path must be present and time-travelable.**

If snapshots A, B, C were created in order (A before B before C), resuming from C must allow time travel back to B or A. This is the existing contract — `resumeFrom()` looks up a snapshot by index in the accumulated `snapshots` array.

With parallel composition, this means the composed snapshot timeline must preserve the full history:

```
Snapshot A (before parallel)                    — outerK, no parallel context
  → enter parallel(branch1, branch2)
    → branch1: Snapshot B (mid-execution)       — branchK + ReRunFrame + outerK
    → branch1: Snapshot C (final suspension)    — branchK + ResumeFrame + outerK
```

The composed timeline is `[A, B, C]`. Each has a different continuation:
- **Resume A** → pre-parallel continuation, re-evaluates the entire `parallel(...)` from scratch
- **Resume B** → Tier 1 continuation, re-runs siblings from scratch (mid-execution checkpoint)
- **Resume C** → Tier 2 continuation, resumes siblings from abort points (final suspension)

All three are full-program continuations — they just differ in how much work gets re-done.

**Implementation requirement**: branches must receive the outer `snapshotState.snapshots` as a prefix. When a branch creates checkpoint B, the composed `snapshots` array must already contain A. When the final suspension C is composed, the array is `[A, B]` with C appended.

This means `runBranch()` (or `runEffectLoop()` inside it) must be initialized with the outer snapshot history — either by passing it directly, or by including it during composition. The current code creates a fresh `SnapshotState` per branch with no history, which loses the pre-parallel checkpoints.

### Concurrent snapshot accumulation strategy

Branches run concurrently via `Promise.allSettled`. If they share a single `snapshotState.snapshots` array, concurrent `.push()` calls from different branches create a race condition.

**Decision: each branch gets its own snapshot array, composed after settlement.**

- Each branch receives a **copy** of the outer `snapshotState.snapshots` as its prefix (not a reference to the same array).
- Each branch also receives the outer `nextSnapshotIndex` as its starting counter — but since branches run concurrently, their indices may interleave or collide.
- **Resolution**: after all branches settle, only the suspending branch's snapshots survive. Sibling branches' intermediate snapshots are discarded (siblings will be re-run or resumed, generating fresh snapshots). The suspending branch's snapshots are appended to the outer prefix to form the composed timeline.
- To avoid index collisions, `nextSnapshotIndex` must be allocated per-branch in a non-overlapping way. **Simplest approach**: since only one branch's snapshots survive, we can let branches share the same starting index and renumber is unnecessary — collisions don't matter because sibling snapshots are discarded. The surviving branch's indices are monotonically increasing from the outer `nextSnapshotIndex` by construction (single-threaded within a branch).

### Race: same mechanism, different collection

Under this proposal, race and parallel share all of this machinery. The only difference is the `mode` field:

**Note on current differences**: today's implementations differ structurally beyond just result collection. `executeParallelBranches` uses a single shared `AbortController` (aborted when any branch suspends), while `executeRaceBranches` uses per-branch `AbortController`s (losers are cancelled individually when a winner completes). Unification will need to reconcile these — likely per-branch controllers for both, since race needs individual cancellation and parallel can treat "abort all" as aborting each one.

- **`mode: 'parallel'`**: on resume, run all branches, wait for all to complete, return array of results in order.
- **`mode: 'race'`**: on resume, run all branches, return the first to complete, abort the rest.

Race never has `completedBranches` in its frames — if any branch had completed during the original execution, it would have won the race and there'd be no suspension. So race frames always have `completedBranches: []`.

### Error semantics on resume

When resuming from a composed snapshot, the `ReRunParallelFrame` or `ResumeParallelFrame` re-runs or resumes sibling branches. Those siblings can error — either because they errored originally (and we're re-running from scratch), or because conditions changed on resume. Error handling follows the same rules as the original execution, determined by `mode`:

- **`mode: 'parallel'`**: if any sibling errors, the entire parallel fails — throw the first error. Matches current `executeParallelBranches` behavior.
- **`mode: 'race'`**: errored siblings are silently dropped. The race continues with remaining branches. Only if all siblings error (and the resumed branch also errors) does the race fail. Matches current `executeRaceBranches` behavior.

Note that `@dvala.error` handlers defined *inside* a sibling branch still catch errors within that branch normally — the error only escapes to the frame-level collection if unhandled within the branch. The `BarrierFrame` ensures errors don't propagate to outer algebraic handlers (same boundary as for other effects).

### JavaScript exceptions and the BarrierFrame

With `k: null`, a JS exception thrown inside a branch simply fails that branch's `runEffectLoop` — it can't propagate into outer continuations because there are none. With outerK threaded in, we must ensure JS exceptions don't escape the branch's trampoline into the outer continuation.

This is safe because `runEffectLoop` wraps the entire trampoline in a try/catch. The `BarrierFrame` lives *inside* `k` — it's a frame, not a call boundary. JS exceptions are caught by the trampoline's try/catch in `tick()`, which converts them to `DvalaError` or re-throws. Either way, the exception is handled within the branch's `runEffectLoop` invocation before the BarrierFrame or outerK are ever reached. The BarrierFrame only processes *values* flowing through the continuation — not JS exceptions thrown across the call stack.

### Nested parallel: recursive composition

**Decision: pass true `outerK` into branches** (not `k: null`). This avoids continuation concatenation entirely.

`parallel(parallel(a, b), c)` — the continuation stacks look like this:

```
Outer parallel sets up:
  outerK = [rest of program]
  branch 0 gets: k = [BarrierFrame(outerCtx) → outerK]
  branch 1 (c) gets: k = [BarrierFrame(outerCtx) → outerK]

Inner parallel (inside branch 0) sets up:
  innerOuterK = [outerBranch0Frames → BarrierFrame(outerCtx) → outerK]
  sub-branch a gets: k = [BarrierFrame(innerCtx) → innerOuterK]
  sub-branch b gets: k = [BarrierFrame(innerCtx) → innerOuterK]
```

When `a` takes a checkpoint, its `k` is:
```
a_k → BarrierFrame(innerCtx) → outerBranch0Frames → BarrierFrame(outerCtx) → outerK
```

This is already a full-program continuation. No concatenation needed. The serialized form replaces barrier frames with `ReRunParallelFrame`s:
```
a_k → ReRunFrame(inner parallel) → outerBranch0Frames → ReRunFrame(outer parallel) → outerK
```

Each nesting level naturally composes because the inner branch's `outerK` includes the outer barrier + outer program continuation. The PersistentList shares the outer tail — all inner branches reference the same cons cells for the outer portion.

**Serialization cost**: checkpoint serialization replaces each `BarrierFrame` with a `ReRunParallelFrame` by walking the continuation and building a new spine from the barrier upward (the tail after the barrier is shared). This is O(depth from top of branch stack to barrier), not O(1). For nested parallel with D levels, D barriers are replaced — but since D is typically 1–2 and the walk is bounded by the branch's local stack depth, this is marginal compared to the full serialization that already happens.

---

## What Changes

### Threading parallel context into branches

Branches receive the outer continuation (`outerK`) and a `ParallelBranchContext` describing the parallel they belong to:

```typescript
interface ParallelBranchContext {
  branchIndex: number
  branchCount: number
  branches: AstNode[]          // original AST for all branches
  env: ContextStack            // env at parallel/race call site
  mode: 'parallel' | 'race'   // result collection strategy
}
```

The branch starts with `k = cons(BarrierFrame(branchCtx), outerK)` instead of `k = null`. The `BarrierFrame` serves as both a terminator (catches branch completion) and a carrier for the parallel context (used during checkpoint serialization).

### SnapshotState initialization for branches

Each branch's `runEffectLoop` creates a new `SnapshotState`. The following fields must be carefully initialized:

| Field | Value | Rationale |
|-------|-------|-----------|
| `snapshots` | **Copy** of outer `snapshotState.snapshots` | Pre-parallel checkpoints must be in the branch's timeline. Copy (not reference) to avoid concurrent mutation. |
| `nextSnapshotIndex` | Outer `snapshotState.nextSnapshotIndex` | Branch checkpoints continue the outer sequence. Sibling collisions are harmless (only one branch's snapshots survive). |
| `executionId` | Outer `snapshotState.executionId` | `resumeFrom()` looks up snapshots by `executionId` — a fresh UUID would make pre-parallel snapshots unfindable from within a branch. |
| `autoCheckpoint` | Outer `snapshotState.autoCheckpoint` | Inherit the user's setting. |
| `maxSnapshots` | Outer `snapshotState.maxSnapshots` | Inherit the eviction cap. |

This requires passing an `initialSnapshotState` to `runEffectLoop` from `runBranch`, and modifying `runEffectLoop` to reuse the provided `executionId` instead of always generating a fresh UUID.

### Three new frame types

**`ParallelBranchBarrierFrame`** — lives in the branch continuation during execution:
- Lightweight marker: just carries `branchCtx`
- Three roles:
  1. **Completion sentinel**: when the trampoline hits it with a value, branch is complete — return the value as a branch result (don't flow into outerK)
  2. **Effect boundary**: `dispatchPerform` stops walking at the barrier, preserving effect isolation between branches and the outer scope — critical for multi-shot correctness (see in-depth section)
  3. **Context carrier**: holds `branchCtx` for checkpoint composition
- Never serialized directly — replaced by `ReRunParallelFrame` or `ResumeParallelFrame` during serialization

**`ReRunParallelFrame`** — replaces the barrier in serialized mid-execution checkpoints:
- Stores original branch AST nodes + env + branchIndex + branchCount + mode
- On resume: re-runs sibling branches from original AST (concurrently), collects results

**`ResumeParallelFrame`** — replaces the barrier in the serialized final suspension:
- Stores completedBranches (values) + suspendedBranches (raw continuations) + branchIndex + branchCount + mode
- On resume: resumes suspended siblings from their continuations (concurrently), uses cached completed values, collects results

### Raw branch results

`runBranch()` currently serializes suspended results into opaque blobs. The composition step for the final suspension needs raw continuation stacks. Either expose the raw `SuspensionSignal` or add a branch-execution variant that skips serialization.

### Relationship to `retriggerParallelGroup`

The existing `retriggerParallelGroup` / `retriggerWithEffects` mechanism already does something similar to what the new frame handlers propose — it re-runs branches after a parallel group is resumed, using a shared `snapshotState` across concurrent branch re-execution.

**Key differences from the proposed design:**

- `retriggerParallelGroup` operates at the host API level (outside the trampoline) — it's called when the host resumes a suspended parallel. The proposed `ReRunParallelFrame`/`ResumeParallelFrame` operate inside the trampoline as frame handlers.
- The retrigger path rebuilds the parallel orchestration from scratch. The proposed frames encode the orchestration in the continuation itself.

**Decision: `retriggerParallelGroup` is superseded by the new frame handlers.** Once `ReRunParallelFrame` and `ResumeParallelFrame` are implemented, the retrigger path for parallel groups becomes unnecessary — resuming a composed snapshot naturally re-enters the trampoline, which hits the parallel frame and orchestrates siblings. The retrigger code should be removed or simplified in Phase 3.

### Backward compatibility for serialized snapshots

**Decision: break backward compatibility.** This is a pre-1.0 project. Serialized snapshots are ephemeral runtime artifacts, not long-lived data. The old `ParallelResumeFrame` format will be removed entirely. Old snapshots will fail to deserialize with a clear error. No migration path.

---

## Design Decisions

### Finalized decisions summary (2026-04-10)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Phase ordering | Interleaved — tests written per phase |
| 2 | BarrierFrame completion signaling | New `BranchComplete` trampoline step type |
| 3 | Effect boundary implementation | Explicit `frame.type === 'ParallelBranchBarrier'` checks in `dispatchPerform` and `tryDispatchDvalaError` |
| 4 | Checkpoint serialization | `composeCheckpointContinuation(k)` helper called at all 3 checkpoint sites |
| 5 | Sibling continuation storage | Truncated at BarrierFrame (strip barrier + outerK tail) |
| 6 | Orchestration logic sharing | Shared `orchestrateBranches` helper used by `executeParallelBranches` and frame handlers |
| 7 | Race unification timing | Phase 5, after parallel is fully validated |
| 8 | Backward compatibility | Break it — remove old `ParallelResumeFrame`, no migration |

### Nested parallel — pass true outerK

**Decision: pass true `outerK` into branches.** Branches start with `k = cons(BarrierFrame, outerK)` instead of `k = null`. Checkpoints naturally include the full outer context. No concatenation needed, even for deeply nested parallel. See "Nested parallel: recursive composition" above.

### Auto-checkpoint inside branches — acceptable

The concern was: with `autoCheckpoint: true` and N branches × M effects each, we'd create N×M composed checkpoints, each requiring barrier-to-ReRunFrame replacement + full serialization.

This is acceptable for three reasons:

1. **Only one branch's checkpoints survive.** Each branch has its own independent `SnapshotState`. When the parallel resolves, only the suspending branch's checkpoints are included in the composed timeline. Sibling branches' checkpoints are discarded — those siblings will be re-run or resumed from abort points, generating fresh checkpoints. So the composed timeline contains `outer checkpoints + one branch's checkpoints`, not N×M.

2. **The new per-checkpoint cost is marginal.** Today, every auto-checkpoint already serializes the full continuation — O(stack depth). The new cost adds a walk-and-replace step to swap `BarrierFrame` → `ReRunParallelFrame` before serialization. This is also O(stack depth) — same order as the serialization that already happens. For nested parallel with depth D, there are D barriers to replace, but D is typically 1–2.

3. **`maxSnapshots` already caps retention.** The circular buffer eviction (`snapshotState.snapshots.shift()`) bounds memory regardless of how many checkpoints are created.

No need to disable auto-checkpoint inside branches.

### Effect handler scope on resume — correct by construction

The concern was: when resuming from a composed snapshot, do effect handlers apply correctly? There are two kinds of handlers, and both work correctly with the outerK approach:

**Host handlers** (passed to `run()`/`resume()`) are provided fresh on each resume call and threaded through `tick()` to all branches. They're not part of the continuation — the host re-supplies them. All branches (the resumed one, re-run siblings from `ReRunParallelFrame`, and resumed siblings from `ResumeParallelFrame`) receive the same host handlers. ✓

**Algebraic handlers** (`AlgebraicHandleFrame` entries in the continuation) are part of `k` and survive serialization. Important distinction:
- **During live branch execution**: the `BarrierFrame` blocks effect propagation — outer algebraic handlers are NOT visible to branch code (effect isolation preserved, same as today). ✓
- **In serialized checkpoints**: the `BarrierFrame` is replaced by `ReRunParallelFrame`/`ResumeParallelFrame`. Outer `AlgebraicHandleFrame`s are present in `outerK` after the parallel frame. On resume, the resumed branch runs independently (behind its own barrier), and siblings (re-run or resumed) also get their own barriers with the same `outerK`. ✓

**Re-run siblings** started from a `ReRunParallelFrame` get `outerK` (the continuation after the frame) as their outer context. This `outerK` carries the outer algebraic handler frames. Host handlers are threaded through. Each sibling gets its own `BarrierFrame` maintaining effect isolation. ✓

**Branch-local handlers** (defined inside one branch, e.g., `do with h; ... end` within branch code) are part of that branch's local `k`, not shared with siblings. When re-running a sibling from AST, it re-evaluates its own local handlers naturally. One branch's internal handlers never leak to siblings. ✓

No special handling needed.

### Concurrent snapshot accumulation — per-branch copy, compose after settlement

See "Concurrent snapshot accumulation strategy" in the In Depth section. Each branch gets a copy of the outer snapshot array. Only the suspending branch's snapshots survive into the composed timeline. No shared mutable state between concurrent branches.

### Re-suspension during frame handler execution — reuse orchestration logic

When a `ReRunParallelFrame` or `ResumeParallelFrame` handler re-runs/resumes siblings, those siblings may suspend again. The frame handler must handle this the same way `executeParallelBranches` does: abort remaining siblings, classify results, and compose a new `ResumeParallelFrame` if needed. To avoid duplicating this logic, extract a shared `orchestrateBranches` helper. See steps 7–8 in the Implementation Plan.

### `retriggerParallelGroup` — superseded by frame handlers

See "Relationship to `retriggerParallelGroup`" in the What Changes section. The retrigger path is superseded once the new frames are implemented. Cleanup in Phase 6.

### Backward compatibility — break it, clean slate

See "Backward compatibility for serialized snapshots" in the What Changes section. Old `ParallelResumeFrame` format is removed. Pre-1.0 project, no migration needed.

---

## Implementation Plan

### Phase 1: Infrastructure ✅ (2026-04-10)

**Implementation note**: Threading `outerK` into branches introduced a serialization opacity issue — nested `SuspensionBlobData` objects (branch snapshots inside `ParallelResumeFrame.suspendedBranches`) were corrupted by the outer serializer/deserializer/dedup walking into them. Fixed by adding a `__suspensionBlob` brand marker and opaque checks in `suspension.ts` (`collectContextStacks`, `serializeValue`, `resolveValue`) and `dedupSubTrees.ts` (`walkAndCollect`, `expandPoolRefs`, `deepClone`). Race branches still use legacy `runBranchLegacy` (no outerK) until Phase 5.

1. **Add `ParallelBranchBarrierFrame`**
   - New frame type in `frames.ts` — lightweight marker carrying `ParallelBranchContext`
   - Three roles:
     - **Completion sentinel**: trampoline handler in `applyFrame` — when a value reaches the barrier, return a new `{ type: 'BranchComplete', value, branchCtx }` trampoline step. `runEffectLoop` recognizes this step type and returns it as a branch result (no exception-based signaling).
     - **Effect boundary**: `dispatchPerform` and `tryDispatchDvalaError` must stop walking `k` at the barrier with an explicit `if (frame.type === 'ParallelBranchBarrier') break` check — same effect as reaching `null`. This preserves current effect-isolation semantics and prevents multi-shot breakage (see in-depth section).
     - **Context carrier**: holds `branchCtx` for checkpoint composition
   - Serialization: barrier frames are never serialized directly (replaced during checkpoint serialization)

2. **Add `ReRunParallelFrame` and `ResumeParallelFrame`**
   - `ReRunParallelFrame`: branchIndex, branchCount, branches (AST), env, mode
   - `ResumeParallelFrame`: branchIndex, branchCount, completedBranches, suspendedBranches (raw k), mode
   - Add serialization/deserialization support in `suspension.ts`
   - Files: `frames.ts`, `suspension.ts`

3. **Modify `runBranch()` to pass outerK + barrier**
   - Change: `k: null` → `k: cons(BarrierFrame(branchCtx), outerK)`
   - `executeParallelBranches()` constructs `ParallelBranchContext` and passes `outerK`
   - Return raw `SuspensionSignal` instead of serialized `RunResult` (for final suspension composition)
   - Files: `trampoline-evaluator.ts`

4. **Thread outer snapshot history into branches**
   - Pass `initialSnapshotState` to branch `runEffectLoop()` with fields as specified in "SnapshotState initialization for branches" table above
   - Key: `snapshots` is a **copy** (not reference), `executionId` is **inherited** (not fresh UUID), `nextSnapshotIndex` is inherited
   - Modify `runEffectLoop` to accept and reuse a provided `executionId` instead of always calling `generateUUID()`
   - Branch checkpoints include pre-parallel snapshots in their timeline
   - Files: `trampoline-evaluator.ts`

### Phase 2: Checkpoint Composition ✅ (2026-04-10)

5. **Checkpoint serialization: replace barrier with ReRunFrame**
   - Extract a `composeCheckpointContinuation(k)` helper that walks the continuation, finds `ParallelBranchBarrierFrame`(s), and replaces each with a `ReRunParallelFrame` built from its `branchCtx`
   - All three checkpoint creation sites (`dvala.checkpoint`, `ctx.checkpoint()`, auto-checkpoint) call this helper before serializing: `serializeToObject(composeCheckpointContinuation(k))`
   - Nested parallel: multiple barriers in the stack, each replaced independently
   - Files: `trampoline-evaluator.ts` (all three checkpoint creation sites in `dispatchPerform` and `dispatchHostHandler`)

6. **Final suspension: replace barrier with ResumeFrame**
   - In `executeParallelBranches()`, when branches have settled:
     - In the suspending branch's raw `k`, find the `BarrierFrame` and replace with `ResumeParallelFrame` (carrying completed values + sibling abort-point continuations)
     - Discard sibling branches' intermediate checkpoints — only the suspending branch's checkpoints (which already have correct indices from the shared `nextSnapshotIndex`) are kept
   - Files: `trampoline-evaluator.ts`

### Phase 3: Resume Logic ✅ (2026-04-10)

7. **Implement `ReRunParallelFrame` handler in trampoline**
   - When the trampoline hits this frame with a value (branch completed):
     - Value becomes this branch's result
     - Extract `outerK` from the continuation tail after the frame
     - For each sibling: construct `branchCtx` from the frame's fields (`branches`, `env`, `mode`, `branchCount`) + sibling index, create a `BarrierFrame`, and call `runBranch()` with `k = cons(BarrierFrame(branchCtx), outerK)`
     - Collect results: parallel → array in order, race → first wins
     - Thread `handlers` and `signal` from the trampoline context into sibling branches
     - Return `{ type: 'Value', value: results, k: outerK }` to continue with outer program
   - **Re-suspension handling**: siblings re-run from scratch may suspend again (host calls `ctx.suspend()`, or abort signal fires). The frame handler must replicate the `executeParallelBranches` orchestration logic:
     - Use an `AbortController` group so that when any sibling suspends, remaining siblings are force-suspended
     - After all siblings settle, classify results into completed/suspended/errored
     - If any sibling suspended: compose a new `ResumeParallelFrame` with the current branch's completed value + sibling states, and throw a `SuspensionSignal` with the composed continuation. This effectively "upgrades" the Tier 1 checkpoint into a Tier 2 continuation on re-suspension.
     - If all siblings completed: collect results and continue with outerK
   - **Implementation approach**: extract the orchestration logic from `executeParallelBranches` into a shared helper (e.g., `orchestrateBranches(branches, outerK, handlers, signal, mode)`) that both the original `executeParallelBranches` and the frame handlers can call. This avoids duplicating the abort/collect/compose logic.
   - Files: `trampoline-evaluator.ts`

8. **Implement `ResumeParallelFrame` handler in trampoline**
   - Same orchestration as step 7, but instead of re-running from AST:
     - Resume suspended siblings from stored continuations (concurrently)
     - Use completed siblings' cached values
   - Sibling continuations are stored **truncated at the BarrierFrame** — without the barrier or outerK tail. The outerK is redundant (same as the continuation after the `ResumeParallelFrame` itself). On resume, the handler wraps each stored continuation with a fresh `BarrierFrame(branchCtx)` + `outerK`, same as step 7.
   - This means **step 6 must strip the BarrierFrame + outerK tail** from sibling continuations before storing them in the `ResumeParallelFrame`. Stripping must find the **first** `ParallelBranchBarrierFrame` in each sibling's `k` and truncate there (preserving any branch-local frames like `do with handler ... end` above the barrier).
   - **Re-suspension handling**: same as step 7. Resumed siblings may re-suspend. The orchestration helper handles this identically — classify results, compose a new `ResumeParallelFrame` if any sibling re-suspends.
   - Files: `trampoline-evaluator.ts`

### Testing Strategy: Interleaved (per-phase)

Tests are written alongside each phase, not in a separate phase. High-level integration tests (host API: `run` → checkpoint → `resume`) can be written before internal types exist.

9. **Phase 1 tests** ✅ (10 tests in `__tests__/parallel-snapshot.test.ts`)
    - BarrierFrame blocks effect propagation: verify `dispatchPerform` stops at the barrier ✅
    - Effect isolation: algebraic handler wrapping `parallel(perform(@eff, x), ...)` — effect must NOT propagate to outer handler, must fall through to host handlers ✅
    - dvala.error boundary: outer/inner handler isolation ✅
    - Pure-computation branches complete correctly ✅
    - Host effect branches, mixed completion/suspension, all suspended ✅
    - ExecutionId and snapshot state inheritance ✅

10. **Phase 2 tests** (after checkpoint composition)
    - Host checkpoint inside parallel branch → resume completes full program
    - Nested `parallel(parallel(...), ...)` checkpoint composition
    - Auto-checkpoint + parallel (verify composed checkpoints)
    - Snapshot index ordering verification (monotonic, no gaps)
    - Time travel: resume C, then `resumeFrom(A)` where A is pre-parallel

11. **Phase 3 tests** (after resume logic)
    - Re-suspension: sibling re-suspends during `ReRunParallelFrame` handling → produces new composed suspension
    - Multi-shot within a branch (handler inside branch, resume called multiple times) — should work as before
    - Multi-shot on composed snapshot (host calls `resume(snapshot, value)` twice on same snapshot) — each runs independently
    - Effect handlers inside branches → checkpoint → resume → correct handler scope
    - `resumeFrom()` (time travel) across parallel boundaries

### Phase 5: Race Unification ✅ (2026-04-10)

Race unification is separated from parallel because it involves a semantic change and structural reconciliation that should be validated independently after parallel is proven correct.

12. **Unify race with parallel**
    - Both frame types carry `mode` field
    - `mode: 'parallel'` → collect all results as array
    - `mode: 'race'` → first to complete wins, abort rest
    - **Semantic change**: today race suspension lets the host pick the winner (`throwSuspension(k, raceMeta)` with no frame). Under this design, the frame re-runs/resumes branches and the first to complete wins automatically.
    - **Abort controller reconciliation**: parallel currently uses a single shared `AbortController` (aborted when any branch suspends); race uses per-branch `AbortController`s (losers cancelled individually when a winner completes). Unified approach: per-branch controllers for both — parallel can treat "abort all" as aborting each one individually, and race needs individual cancellation.
    - Remove separate `executeRaceBranches()` suspension path — share with parallel via the `orchestrateBranches` helper from step 7
    - Files: `trampoline-evaluator.ts`

13. **Race-specific tests**
    - Race branch checkpoint → resume completes race (first to finish wins)
    - Race re-suspension: all branches re-suspend → new composed suspension
    - Race with one branch completing on resume → wins immediately, others aborted
    - Verify host no longer picks winner (semantic change from old race model)

### Phase 6: Cleanup ✅ (2026-04-10)

14. **Remove superseded code**
    - Remove or simplify `retriggerParallelGroup` / `retriggerWithEffects` — the frame handlers now handle parallel resume
    - Remove old `ParallelResumeFrame` type and its serialization/deserialization code entirely (no backward compat)
    - Remove the asymmetric "first suspended branch is special" pattern — all branches tracked uniformly by `branchIndex`
