# Effect replay determinism — `@dvala.random` / `@dvala.time.now` re-execute on rewind

**Status:** Draft (finding recorded; fix deferred)
**Created:** 2026-06-10

## Goal

Decide whether — and how — to make the runtime's nondeterministic standard effects
(`@dvala.random[.uuid/.int/.item/.shuffle]`, `@dvala.time.now`) **replay
deterministically** across snapshot rewind / resume. Today they re-execute and
produce *different* values, so a replay that crosses one diverges from the original
run. This is a **runtime/snapshot-replay soundness** concern — distinct from the
type-system "if it compiles it runs" inventory
([2026-04-26_compile-implies-run.md](2026-04-26_compile-implies-run.md)), which is
about compile-time catching of runtime failures.

---

## Background

### The gap (confirmed)

The nondeterministic standard effects resolve **inline** with a fresh host value and
are **not recorded**:

- `@dvala.random`, `.uuid`, `.int`, `.item`, `.shuffle` → `Math.random()`
  ([standardEffects.ts:436](../../packages/dvala-engine/src/evaluator/standardEffects.ts#L436) and nearby)
- `@dvala.time.now` → `Date.now()`
  ([standardEffects.ts:582](../../packages/dvala-engine/src/evaluator/standardEffects.ts#L582))

The auto-checkpoint the snapshot design relies on
([trampoline-evaluator.ts:3560](../../packages/dvala-engine/src/evaluator/trampoline-evaluator.ts#L3560),
commented *"snapshot after… so the effect result is baked in — re-execution from here
is pure and needs no effect-result replay"*) fires **only on the host-handler
`ctx.resume` path**. Standard sync effects bypass it — they return a `Value`
directly — so there is **no post-effect checkpoint** baking their value in. The
nearest checkpoint sits *before* them, and a rewind re-rolls. The design's
"re-execution is pure" assumption holds for host effects but silently breaks for
these built-ins.

### Repro

A program performs `@dvala.random`, then an effect handler rewinds to a checkpoint
*before* the random via `resumeFrom(...)` and re-runs:

```
perform(@dvala.checkpoint, "before-random");
let r = perform(@dvala.random);
perform(@probe, r);   // handler rewinds to "before-random" once, then resumes
r
```

Observed: the two passes saw **different** values (`0.60…` then `0.78…`). The same
applies to all `@dvala.random.*` and `@dvala.time.now`.

### Severity / scope

- **Durable resume-from-latest: sound.** A random/time value produced *before* a
  suspension is baked into the continuation captured at the next post-(host-)effect
  checkpoint; resuming forward never re-performs it.
- **Rewind / retry / parallel re-run that crosses a random/time effect: diverges.**
  This is the classic durable-execution hazard — a retry re-rolls a generated ID or
  re-reads the clock, so the resumed timeline differs from the one already
  observed/persisted. For a time-travel *debugger* it's merely surprising; for
  durable/retry *correctness* it's a genuine bug.

### Why "mocking" does **not** fix it

- **Constant stub** (`@dvala.random -> 0.5`): re-execution matches, but the feature
  is destroyed — real programs need real randomness/time.
- **Ambient seeded PRNG** (replace `Math.random` with a module-level generator):
  still diverges. The generator's cursor lives *outside* the snapshot, so on rewind
  the continuation rewinds but the cursor does not — re-performing pulls the *next*
  number, not the original.
- **Seeded PRNG whose state is captured in the snapshot**: this works — but the
  generator state is now part of the program/continuation, i.e. you've built
  effect-result recording. That's journaling, not mocking.

So the only correct mitigation records the result and replays it on rewind. A
post-effect checkpoint does **not** help either: the divergence is on rewind to
*before* the effect, which no checkpoint-after can fix.

## Proposal

Two viable directions (not yet chosen):

### A. Effect-result journaling (the principled durable fix)

Record each nondeterministic effect's result in the snapshot, keyed by invocation
order/position. On replay, return the recorded result instead of re-performing. The
effect stays "real" on first execution; replay is deterministic. This is the
durable-execution standard (cf. Temporal "side effects"). Cost: snapshot
format/serialization change + a replay-time lookup path; needs a key that's stable
across rewind (invocation index within the execution).

### B. Lean on algebraic effects (workaround available today, no engine change)

Because these *are* effects, a caller who needs deterministic replay can install
their own handler that draws from journaled/seeded-from-state values:

```
do with handler @dvala.random(_) -> resume(nextSeeded()) end; …
```

The default stays nondeterministic, so default replay still diverges — this is
opt-in determinism, not a global fix. Worth **documenting** in the effects reference
regardless of whether A is built.

**Recommendation:** keep the gap deferred. It only bites durable/retry/time-travel
that *crosses* a random/time effect *and* cares about the value. When durable-replay
semantics are prioritized, do **A** properly. In the meantime, document **B** so the
lever is discoverable.

## Open Questions

- **Is durable/exactly-once replay an intended Dvala guarantee**, or is snapshot/resume
  scoped to suspend-resume-from-latest (where the gap doesn't bite) + best-effort
  time-travel debugging (where re-roll is tolerable)? This decides whether A is
  needed at all.
- **Journaling key:** invocation index per execution is the obvious key — does it stay
  stable across `parallel(...)` branch re-runs and nested resumes?
- **Scope of journaling:** only the built-in nondeterministic effects, or any host
  effect flagged "impure/record-on-replay"? (Generalizes to external I/O.)
- **Serialization size / retention** of journaled values under `maxSnapshots`.

## Implementation Plan

1. Decide the replay-guarantee question above (gates everything).
2. If A: design the journal — per-execution invocation counter, recorded
   `(effectName, index) -> value`, captured in the snapshot; replay path in
   `dispatchPerform` consults the journal before invoking the standard handler.
3. Mark the built-in nondeterministic effects as "journaled" so only they take the
   recording path (host/user effects unaffected).
4. Tests: the repro above must produce the **same** value across a `resumeFrom`
   rewind; `parallel(...)` re-run determinism; `maxSnapshots` eviction correctness.
5. Regardless of A: document the rewind-re-execution behavior + the option-B handler
   lever in the effects reference.

## Out of scope

- Making tests deterministic — separate concern; the suite's `@dvala.random`/`.time`
  tests already assert invariants, and the recent test flakiness was the typechecker
  effect-*registry*, not these effects.
- Type-system "if it compiles it runs" soundness — see
  [2026-04-26_compile-implies-run.md](2026-04-26_compile-implies-run.md) §D (cross-referenced there).
