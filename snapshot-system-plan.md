# Snapshot System — Implementation Plan

## Overview

Extend the effect handler system with **in-memory snapshots** and **crash recovery**.
Programs mark checkpoint boundaries via `dvala.checkpoint`. The runtime serializes
the continuation stack and stores it in a managed snapshot list. Host handlers gain
access to the snapshot history, a `checkpoint()` method for explicit capture, and a
`resumeFrom` operation for rollback.

---

## Design Summary

### Unified `Snapshot` type

All captured continuations — whether from `dvala.checkpoint` or `suspend()` — use
the same `Snapshot` type. This replaces the current `SuspensionBlob` + `meta` pair in
`RunResult`.

```typescript
interface Snapshot {
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
}
```

### Snapshot index semantics

Snapshot indices are monotonically increasing and never reused, even across rollbacks:

```
Run 1:  snap 0 → snap 1 → ... → snap 10 → suspend (snap 11)
Resume: restore snap 5, discard 6–11
Run 2:  snap 12 → snap 13 → ...    ← indices continue from high-water mark
```

A `nextSnapshotIndex` counter is stored in the suspension blob to survive across
suspend/resume boundaries.

### Run ID

Each `run()` and `resume()` call generates a UUID (`runId`). Every snapshot created
during that call carries the same `runId`. This enables external systems to distinguish
snapshots from different execution lineages when the same snapshot is resumed by
multiple hosts.

```typescript
function generateRunId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}
```

### `Snapshot.continuation` — opaque, not a string

The `continuation` field holds the serialized continuation as a plain JSON-compatible
object tree (not a JSON string). This avoids double-encoding when the host calls
`JSON.stringify(snapshot)` for persistence:

- `serializeSuspension` produces the plain object (stops before `JSON.stringify`)
- `deserializeSuspension` accepts the plain object (skips `JSON.parse`)
- The host serializes/deserializes the entire `Snapshot` in one `JSON.stringify`/`JSON.parse` pass

The field is typed as `unknown` and marked `readonly` — hosts should not inspect or
modify it. A future `inspectSnapshot` debug utility can expose structured typed data
for tooling.

### `dvala.checkpoint` standard effect

```dvala
perform(effect(dvala.checkpoint))                              // no metadata
perform(effect(dvala.checkpoint), { step: "analysis-done" })   // with metadata
```

- **Unconditional capture:** The runtime always serializes the current continuation
  stack into a `Snapshot` before any handler dispatch. This is runtime infrastructure
  — handlers cannot accidentally suppress the snapshot.
- Snapshot stored in an in-memory `Snapshot[]` managed by the trampoline
- **Then dispatches normally** through the standard handler chain (local `do...with` →
  host handlers → standard fallback). Handlers can observe, persist to disk/DB, or
  change the resume value.
- If no handler intercepts it, the standard fallback resumes with `null`
- This makes `dvala.checkpoint` unique among standard effects: it has a guaranteed
  side effect before handler dispatch. This is a documented exception, not a precedent.

### Updated `RunResult`

```typescript
type RunResult =
  | { type: 'completed', value: Any }
  | { type: 'suspended', snapshot: Snapshot }    // was: blob + meta
  | { type: 'error', error: DvalaError }
```

### Updated `resume()` API

```typescript
export async function resume(
  snapshot: Snapshot,
  value: Any,
  options?: ResumeOptions
): Promise<RunResult>
```

### Extended `EffectContext`

```typescript
interface EffectContext {
  // Existing:
  effectName: string
  args: Any[]
  signal: AbortSignal
  resume: (value: Any | Promise<Any>) => void
  fail: (msg?: string) => void
  suspend: (meta?: Any) => void
  next: () => void

  // New:
  /** All snapshots taken so far, oldest first. Read-only view. */
  snapshots: readonly Snapshot[]

  /** Explicitly capture a snapshot at the current continuation point.
   *  Returns the new Snapshot. This is the host-side equivalent of
   *  `perform(effect(dvala.checkpoint))`. */
  checkpoint: (meta?: Any) => Snapshot

  /** Abandon current execution and resume from a previous snapshot.
   *  All snapshots after the target are discarded. */
  resumeFrom: (snapshot: Snapshot, value: Any) => void
}
```

### Snapshots in suspension blobs

When `suspend()` is called, the accumulated `Snapshot[]` and `nextSnapshotIndex` are
included in the blob. On `resume()`, they're restored — full snapshot history and
index counter survive across processes.

### `resumeFrom` semantics

- Deserializes the target snapshot's continuation into a `ContinuationStack`
- Discards all snapshots with `index > snapshot.index`
- Replaces the current continuation stack with the restored one
- Resumes with the provided value
- The target snapshot itself is retained

---

## Rules

* Do one step at a time
* Explain changes made — the codebase should be understood as we go
* If any decision is needed, ask first
* Before a step is completed:
  1. `npm run check` must pass
  2. Test coverage should be at 100%
* When a step is completed, update this plan with progress

---

## Step 1 — Define `Snapshot` type, update `RunResult`, extend `EffectContext` ✅

**Completed.**

Add the `Snapshot` interface to `src/evaluator/effectTypes.ts`. Update `RunResult` to
use `Snapshot` instead of `blob` + `meta`. Extend `EffectContext` with `snapshots`
and `resumeFrom`. Add `generateRunId()` utility.

Remove `SuspensionBlob` type alias — no longer needed in the public API.

**Files:**
- `src/evaluator/effectTypes.ts` — Add `Snapshot`, `generateRunId()`, update `RunResult`, extend `EffectContext`
- `src/effects.ts` — Update `resume()` signature to accept `Snapshot` instead of `blob: string`

**Tests:**
- Type-level only (no runtime behavior yet)
- Existing tests must still pass

---

## Step 2 — Refactor serialization to produce plain objects ✅

**Completed.**

Split `serializeSuspension` into two layers:
1. `serializeToObject(k, meta?)` → returns plain `SuspensionBlobData` object (the `continuation`)
2. `serializeSuspension` wrapper removed (dead code after migration)

Similarly for deserialization:
1. `deserializeFromObject(obj, options?)` → accepts plain object
2. `deserializeSuspension` wrapper removed (dead code after migration)

All callers updated:
- `trampoline.ts` uses `serializeToObject` → `Snapshot.continuation` is now a plain object
- `effects.ts` and `debug.ts` use `deserializeFromObject` → accept the plain object directly

**Files:**
- `src/evaluator/suspension.ts` — Split into object layer; removed unused string wrappers
- `src/evaluator/trampoline.ts` — Import `serializeToObject` instead of `serializeSuspension`
- `src/effects.ts` — Import `deserializeFromObject` instead of `deserializeSuspension`
- `src/debug.ts` — Import `deserializeFromObject` instead of `deserializeSuspension`
- `__tests__/effects.test.ts` — Updated tests for plain-object continuation format; added round-trip and error tests
- `__tests__/debugger.test.ts` — Updated test for plain-object continuation format

---

## Step 3 — Thread snapshot state through the trampoline ✅

**Completed.**

The trampoline needs a mutable snapshot state that lives for the duration of a `run()` call:
- `snapshots: Snapshot[]` — accumulated snapshots
- `nextSnapshotIndex: number` — high-water mark counter (never reused)
- `runId: string` — generated once per `run()` / `resume()` call

`runEffectLoop` creates and owns this state. It is passed into `tick()` and down to
`dispatchHostHandler` / `dispatchPerform`. `dispatchHostHandler` includes `snapshots`,
`checkpoint`, and `resumeFrom` in the `EffectContext`.

Added `SnapshotState` interface to `effectTypes.ts`. Threaded `snapshotState` (optional)
through `tick` → `dispatchPerform` → `dispatchHostHandler` → `tryDispatchDvalaError`.
`checkpoint` now creates real snapshots via `serializeToObject`. `resumeFrom` remains
a stub (Step 5). Suspension snapshots use `snapshotState.nextSnapshotIndex++` instead
of hardcoded `0`.

**Files:**
- `src/evaluator/effectTypes.ts` — Added `SnapshotState` interface
- `src/evaluator/trampoline.ts` — Threaded `SnapshotState` through `runEffectLoop` → `tick` → `dispatchPerform` → `dispatchHostHandler` / `tryDispatchDvalaError`; wired real `snapshots` and `checkpoint` in `EffectContext`
- `__tests__/effects.test.ts` — Added tests: empty snapshots, checkpoint type, resumeFrom type, checkpoint creates snapshot, snapshots accumulate, monotonic indices

---

## Step 4 — Implement `dvala.checkpoint` standard effect ✅

**Completed.**

Implemented option (b): `dvala.checkpoint` is special-cased in `dispatchPerform`
for unconditional snapshot capture before normal dispatch, with a docs/arity entry
in `standardEffects` whose fallback handler resumes with `null`.

**Files:**
- `src/evaluator/trampoline.ts` — Special-case `dvala.checkpoint` in `dispatchPerform` (unconditional capture before normal dispatch)
- `src/evaluator/standardEffects.ts` — Added `StandardEffectDefinition` entry with handler (resumes `null`), arity `{0,1}`, and co-located docs
- `src/evaluator/standardEffects.test.ts` — Added `dvala.checkpoint` to standard effect names set
- `__tests__/effects.test.ts` — Added 10 tests: resumes null, snapshot captured with/without handlers, host handler override, local do...with handler, wildcard handler, metadata, no meta, multiple snapshots, alongside ctx.checkpoint

---

## Step 5 — Implement `resumeFrom` on `EffectContext` ✅

When a host handler calls `resumeFrom(snapshot, value)`:
1. Validate the snapshot came from the current run's snapshot list
2. Deserialize the snapshot's continuation via `deserializeFromObject`
3. Discard all snapshots with `index > snapshot.index`
4. Resume the trampoline with the new continuation stack and provided value
(Note: `nextSnapshotIndex` is NOT reset — indices are never reused)

**Implementation approach:**
The trampoline loop catches `SuspensionSignal` — we can introduce a similar signal
for `resumeFrom`:

```typescript
class ResumeFromSignal {
  constructor(
    public readonly continuation: unknown,
    public readonly value: Any,
    public readonly trimToIndex: number,
  ) {}
}
```

The `runEffectLoop` catch block handles `ResumeFromSignal` by:
1. Deserializing the continuation via `deserializeFromObject`
2. Trimming the snapshot list
3. Re-entering the loop with `{ type: 'Value', value, k: restoredK }`

**Files:**
- `src/evaluator/effectTypes.ts` — Add `ResumeFromSignal` class
- `src/evaluator/trampoline.ts` — Wire `resumeFrom` into `dispatchHostHandler`, handle signal in `runEffectLoop`

**Tests:**
- `resumeFrom` resumes execution from a previous checkpoint
- Snapshots after the target are discarded
- `resumeFrom` with the most recent snapshot replays from that point
- Error if snapshot is invalid
- `resumeFrom` + `resume` on same context throws (exactly-one-operation rule)

---

## Step 6 — Include snapshots in suspension blobs ✅

When `suspend()` is called, the accumulated `Snapshot[]` and `nextSnapshotIndex` must
be serialized into the suspension blob alongside the continuation stack. On `resume()`,
they're restored. A new `runId` is generated on each `resume()` call.

The suspended continuation itself also becomes a `Snapshot` in the `RunResult`:
the trampoline creates a `Snapshot` with the serialized continuation, current timestamp,
`nextSnapshotIndex` as index, current `runId`, and the handler-provided `meta`.

**Files:**
- `src/evaluator/suspension.ts` — Extend blob data with `snapshots` and `nextSnapshotIndex`
- `src/evaluator/effectTypes.ts` — Extend `SuspensionSignal` to carry `Snapshot[]` and `nextSnapshotIndex`
- `src/evaluator/trampoline.ts` — Pass snapshot state into `SuspensionSignal`, create `Snapshot` for `RunResult`, restore on resume
- `src/effects.ts` — `resume()` accepts `Snapshot`, passes restored state into `resumeWithEffects`, generates new `runId`

**Tests:**
- Suspend → resume preserves snapshot history
- After resume, `ctx.snapshots` contains snapshots from before suspension
- New snapshots after resume are appended with correct indices
- `resumeFrom` after resume works with pre-suspension snapshots

---

## Step 7 — Reference data and documentation ✅

> **Note (updated after `df6f55c`):** The last commit (`feat: enhance effect handling
> and documentation`) deleted `reference/effect.ts` and moved effect docs to
> co-located `FunctionDocs` objects inside `src/evaluator/standardEffects.ts`.
> Effect references are now auto-derived in `reference/index.ts` via
> `deriveEffectReference()` which reads `allStandardEffectDefinitions`.
> The `StandardEffectDefinition` interface now has `handler`, `arity`, and `docs`.
>
> This means `dvala.checkpoint` docs go directly in its
> `StandardEffectDefinition` in Step 4 (co-located with the handler), and
> Step 7 only needs to verify reference generation and update prose docs.

Add `dvala.checkpoint` to:
- `src/evaluator/standardEffects.ts` — Co-located docs in the `StandardEffectDefinition` (done as part of Step 4)
- `dvala-effects-intro.md` — Standard effects table
- Tutorial pages if applicable

**Tests:**
- Reference snapshot test updated
- `npm run check` passes

---

## Step 8 — `maxSnapshots` configuration

Start by asking if user wants to implement this as described or if any additions are needed.

Add a configurable limit on the number of snapshots retained in memory.

```typescript
interface RunOptions {
  bindings?: Record<string, Any>
  handlers?: Handlers
  modules?: DvalaModule[]
  maxSnapshots?: number    // default: unlimited
}
```

When the limit is reached, the oldest snapshot is discarded (ring buffer).

**Files:**
- `src/effects.ts` — Add `maxSnapshots` to `RunOptions` and `ResumeOptions`
- `src/evaluator/trampoline.ts` — Enforce limit when adding snapshots

**Tests:**
- Default: unlimited snapshots
- With `maxSnapshots: 3`, oldest snapshot is evicted when 4th is taken
- `resumeFrom` with an evicted snapshot fails gracefully

---

## Excluded

### `dvala.emit`
Dropped — no meaningful difference from a custom effect with a no-op default handler.
Host can establish naming conventions (e.g., `*.event.*`) without runtime support.

### `dvala.suspend`
Not adding — host decides when to suspend, not the program.

### `spawn` / `fork` on `EffectContext`
Not adding — `spawn` is a thin wrapper around `run()` the host can do itself.
`fork` conflicts with single-shot continuation semantics.

### `takeSnapshot()` / `recordSnapshot()` on `EffectContext`
Superseded by `ctx.checkpoint(meta?)` — explicit host-side snapshot capture.
The Dvala program uses `perform(effect(dvala.checkpoint))`, the host handler
uses `ctx.checkpoint()`. Same word, same concept, both sides covered.

### `inspectSnapshot` debug utility
Out of scope for this plan. A future `inspectSnapshot` function in `@mojir/dvala/debug`
could take a `Snapshot` and return structured typed data (frame types, bindings, call
stack, source locations) for debugger tooling — without exposing the internal
serialization format.
