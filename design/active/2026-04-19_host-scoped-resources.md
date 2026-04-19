# Host-scoped resources — `onScopeExit` callbacks

**Status:** Decisions resolved — ready to implement
**Created:** 2026-04-19
**Decisions resolved:** 2026-04-19
**Supersedes:** [2026-04-13_handler-finally.md](2026-04-13_handler-finally.md) (proposes dropping `finally` as a handler clause in favor of this mechanism).

## Goal

Give Dvala a resource-cleanup story that is:

- **Host-aligned.** Resources live in the host (files, sockets, DB connections); Dvala code only sees opaque tokens. Cleanup should live where the resources do.
- **Bullet-proof for the common case.** Single-host, non-serialized executions must reliably close what they open, across normal completion, aborts, uncaught effects, and host-side exceptions.
- **Honest about the hard case.** Dvala supports serialized continuations resumable on a different host. Resources don't travel across that boundary; the design should *prevent* the impossible case rather than fake it.
- **Simple to adopt.** Pure-Dvala code shouldn't need new syntax. Host effect-handler authors should opt in via a small, local API.

---

## Background

### The resource model in Dvala

Dvala is a suspendable runtime with algebraic effects. "Resources" in the systems sense (file handles, DB connections, memory mappings, subprocesses, timers) never exist as Dvala values — they exist in the host. Dvala code accesses them through effects that return opaque tokens:

```
let fd = perform(@file.open, "data.txt");
let line = perform(@file.read, fd);
perform(@file.close, fd);
```

The host's effect-handler implementation owns the real handle; Dvala only sees `fd`. This is already the idiomatic pattern.

### Why not `finally`?

The prior design ([2026-04-13_handler-finally.md](2026-04-13_handler-finally.md)) proposed a `finally` handler clause for cleanup. That design is adequate for pure-execution scenarios but has two fundamental mismatches with Dvala's model:

1. **Serialization.** A snapshot can capture a Dvala scope that contains a `finally` clause. If the snapshot is serialized and resumed on a different host, the original host never reaches the `finally` — the cleanup never runs, the original resource leaks. Even without serialization, a discarded (never-resumed) snapshot leaks every `finally` it captured.
2. **Asymmetric ownership.** Dvala's `finally` would describe cleanup logic in Dvala source, but the resource it's cleaning up lives in the host. The layer of abstraction is inverted: user Dvala code takes responsibility for a host concern.

### Why host callbacks?

A mechanism where the host registers cleanup at the moment of acquisition (not in Dvala source) puts cleanup where the resource is. It also survives the serialization problem cleanly: when a snapshot is discarded or serialized, the host still holds the callback; when the host process ends or the scope dissolves in this runtime, cleanup runs. A resumed snapshot on a different host was never going to share the resource anyway — that case is forbidden (see "Runtime restrictions" below).

### What's unresolved in the general problem

There is no general mechanism that solves "resource that travels across distributed continuations." Related systems — Orleans actor lifetimes, Erlang/OTP supervision trees — handle adjacent problems (per-activation teardown, supervised process death) but none of them address the exact case of a serialized continuation holding live host-side resources and being resumed on a different host. The honest design is to *prevent* that combination rather than pretend it works. The restrictions described below make the impossible case a loud runtime error rather than a silent leak.

---

## Proposal

### Part 1 — Host API

Host effect-handler implementations gain a small per-call `ctx` object exposing a cleanup-registration hook:

```ts
createDvala({
  effectHandlers: {
    'file.open': (path, ctx) => {
      const handle = fs.openSync(path);
      ctx.onScopeExit(() => handle.close());
      return handle.fd;
    },
    'db.connect': async (url, ctx) => {
      const conn = await pg.connect(url);
      ctx.onScopeExit(async () => await conn.end());
      return conn.id;
    },
  },
});
```

The exact shape of `ctx` is TBD (see open questions) but minimally offers:

```ts
interface EffectHandlerContext {
  /**
   * Register a callback to fire when the enclosing Dvala handler frame
   * exits. Callbacks fire in LIFO order (last-registered first, matching
   * stack-discipline for nested resource acquisition).
   */
  onScopeExit(callback: () => void | Promise<void>): void;
}
```

### Part 2 — Scope attribution

A registered callback is attached to the **nearest enclosing handler frame instance** at the moment of the effect call. That handler frame becomes "resource-holding." Frame identity is per-instance: each `do with h; … end` execution creates a fresh frame-instance; the restriction semantics below reason about frame instances, not source locations.

Callbacks fire when the frame instance terminally exits. A terminal exit is one of:
- **Normal completion** — the handled body returns a value.
- **Abort via a non-resuming clause** — a handler clause returns without calling `resume`.
- **Snapshot discard** — a snapshot holding the frame is garbage-collected or explicitly discarded.

**Non-terminal events (frame stays alive, cleanups do NOT fire):**
- **Uncaught-effect pass-through.** An effect the frame doesn't catch propagates to an outer handler. The frame is logically still alive — it's suspended waiting for the `perform` to return. If the outer handler resumes, execution continues inside this frame; cleanups fire later when the frame reaches a true terminal exit.
- **Async effect boundary.** An `await` inside a host effect handler keeps the frame alive across the suspension.

- Nested scopes nest naturally: inner handlers' cleanups fire before outer handlers' cleanups.
- "The nearest enclosing handler" is unambiguous because effect dispatch already walks the handler stack to find who catches the effect.

### Part 3 — Runtime restrictions

While a handler frame-instance is resource-holding, certain operations are refused at runtime:

| Operation | Behavior when resource-holding |
|---|---|
| Snapshot capture (explicit or via effect) | Runtime error: `cannot snapshot: handler 'X' at <source loc> holds N live cleanups (2 × file.open, 1 × db.connect)` |
| Continuation invocation that would re-enter a discharged frame | Runtime error: `cannot resume: continuation refers to a resource-holding handler 'X' that has already exited` |
| Abort via non-resuming clause | Allowed — frame exits, callbacks fire |
| Uncaught effect propagating past the frame | Allowed — frame stays alive (Part 2); callbacks fire later on terminal exit |
| Host effect-handler throwing mid-scope | Allowed — callbacks fire during unwinding, host errors aggregate and surface |

**Continuation tracking for the multi-shot restriction.** When a continuation is captured (during an effect that may be resumed multiple times), the runtime records the set of resource-holding frame instances currently live. When that continuation is invoked, the runtime checks: are all of those frame instances still alive (not yet discharged)? If any has already had its cleanups fire, the invocation is refused. This makes "multi-shot across a resource-holding frame" precise: the second, third, … Nth invocation is refused once the frame has discharged after an earlier invocation.

Multi-shot of a handler *inside* a resource-holding scope — where the multi-shot handler is nested below the resource-holding one — is fine, because each resume is contained within the outer frame's single lifetime.

### Part 4 — Callback execution semantics

1. **Ordering.** LIFO within a frame — each `onScopeExit` registration goes on top of that frame's cleanup stack and fires first. Across nested frames, inner frame's callbacks fire before outer frame's, which is just the natural consequence of inner frames terminally exiting first. "Sibling handlers at the same nesting depth" can never share a cleanup stack: scope attribution is always the single nearest frame, so each registration lands on exactly one frame's stack.
2. **Errors in callbacks.** A callback that throws does not block subsequent callbacks. Errors are collected and surfaced once cleanup completes, as a single aggregate error associated with the scope exit.
3. **Async callbacks.** Allowed. The runtime awaits each callback sequentially. Ordering is preserved.
4. **No cleanup timeout.** Async callbacks run to completion; hosts writing async cleanup are responsible for bounding their own operations. A hung cleanup hangs the enclosing Dvala computation — same as any unbounded host operation. If this becomes a real problem in practice, add `{ timeoutMs }` as a follow-up with actual evidence of the right defaults and failure mode.
5. **Callbacks cannot perform Dvala effects.** We are past the Dvala-execution window by the time cleanup runs. Re-entering would create arbitrarily complex re-entrancy. Cleanups are pure host side-effects.
6. **Idempotency is the host's responsibility.** The runtime guarantees at-most-once execution per registration. It does not guarantee that *a given resource* is cleaned up once if the host registers multiple callbacks for the same handle.

### Part 5 — What happens to `finally`?

The proposed handler `finally` clause is **dropped** for this release. Its motivating use case (resource cleanup) is handled strictly better here. Pure-Dvala-side "run on exit" logic (log-once, restore-ref, emit-metric) is *less* covered; it can be partially expressed via library `bracket` patterns:

```
let bracket = (acquire, release, use) -> do
  let r = acquire();
  let result = use(r);
  release(r);
  result
end;
```

**Caveat:** this naive `bracket` is abort-safe only on the normal return path. If `use(r)` performs an uncaught effect and an outer handler aborts, `release(r)` is never reached. Writing an abort-safe `bracket` in pure Dvala requires either a `finally`-like primitive (which we've dropped) or an `onScopeExit`-based handler wrapper, which exists only host-side. For now, Dvala has no bullet-proof pure-Dvala-side exit hook; that's an acknowledged gap. If a real use case appears that can't be solved by moving the cleanup into a host-side effect, we can design a purpose-built primitive at that point — but not before then.

### Part 6 — Resource-type registry (optional)

For debugging and introspection, the host may name the resources it registers:

```ts
ctx.onScopeExit(() => handle.close(), { name: 'file', token: handle.fd });
```

This lets the runtime's error messages be specific: `cannot snapshot: 3 resources held (2 × file, 1 × db.connection)`. The `name` field is advisory only.

---

## Resolved decisions

(These are direction calls we made during the design conversation; confirm or revisit.)

1. **Drop `finally` entirely.** Replaced by host callbacks. Documented in [2026-04-13_handler-finally.md](2026-04-13_handler-finally.md) follow-up.
2. **Scope = nearest enclosing handler frame.** Not the whole top-level, not user-specified. Matches the dispatch model.
3. **LIFO cleanup ordering.** Stack discipline, matches nested resource patterns.
4. **Runtime checks are dynamic, not static.** Shipping with dynamic checks today; static enforcement (effect-type extension marking "resource" effects) is a future item in the type-system track, plausibly 0.6.0 or later.
5. **Restrict multi-shot and snapshot while resource-held.** Clean semantics over expressiveness. Users who need to snapshot around a long-lived resource close-and-reopen explicitly.
6. **Cleanup callbacks cannot perform Dvala effects.** Side-effect only.
7. **Callback errors aggregate; do not block each other.** All cleanups run; errors surface as an aggregate.

## Resolved decisions (continued)

(Design review 2026-04-19 settled the originally-open questions.)

8. **`EffectHandlerContext` is minimal.** Exactly one method: `{ onScopeExit(cb): void }`. No grouping under `ctx.cleanup.*` or other subspaces. Speculative shape invites speculative APIs; we add methods only when concrete use cases appear.
9. **No escape hatch.** Every `onScopeExit` registration marks the enclosing handler frame resource-holding. Users who want non-blocking side-effects (idempotent logging, debounced metric flushes) handle those outside the Dvala runtime via their own scheduling — those aren't resources and shouldn't use this mechanism. Starting strict has a clean upgrade path; starting permissive doesn't.
10. **Error messages include effect-name breakdown.** Minimum required detail: "cannot snapshot: handler at line X holds N live resources (2 × file.open, 1 × db.connect)". Effect names are free (the runtime already knows which handler-call registered the cleanup). Host-side TS stack traces and user-supplied resource labels deferred — can be opt-in via a debug flag if demand appears.
11. **Async effect boundaries are transparent.** An `await` inside a host effect handler is NOT a scope exit. The Dvala handler frame remains alive through the await; cleanups fire only on genuine frame exit (normal completion, abort, uncaught-effect pass-through). Users can hold a file handle across `perform(@http.get, …)` naturally, like in any other async language.
12. **Snapshot-during-cleanup is refused.** Runtime tracks a "currently running cleanups" flag; any snapshot API called during that window throws. Snapshotting mid-teardown is semantically incoherent, and the check is cheap.
13. **Cleanups are strictly per-instance.** Multiple `createDvala()` instances in the same process have independent cleanup stacks. One instance's snapshot is never blocked by another instance's pending cleanups.
14. **Cross-host resume is made impossible by the other restrictions.** Snapshot-while-resource-held is refused, so a resource-holding computation cannot be serialized. Documented with a single paragraph in the "Background" section.

## Implementation plan

**Phases 1 and 2 ship as one bundle.** The phase split is an engineering convenience for structured review, not two separately-shippable products: `onScopeExit` without the restrictions leaves a footgun where snapshots silently drop cleanup callbacks. Treat the bundle as the minimum viable first release.

### Phase 1 — Runtime bookkeeping

1. Add a `cleanups: Array<() => void | Promise<void>>` field to handler-frame records in the evaluator.
2. Expose `ctx.onScopeExit(cb)` in the effect-handler call interface. Internally: push to the active frame's cleanups.
3. Hook handler-frame **terminal exit** paths (normal completion, abort via non-resuming clause, snapshot discard) to drain cleanups in LIFO, collecting errors, and surfacing aggregate. Note: uncaught-effect pass-through is NOT a terminal exit — the frame stays alive and cleanups fire only on the eventual terminal exit (see Part 2).

### Phase 2 — Restrictions

1. Add a `resourceHolding: boolean` flag derived from `cleanups.length > 0` (or explicit, if we need independent control).
2. At snapshot-capture sites: walk the handler stack; if any frame has live cleanups, throw a scope-aware error.
3. At continuation capture: record the set of resource-holding frame instances live at that moment.
4. At continuation invocation: check that all recorded frame instances are still alive. If any has discharged, refuse the invocation with the "cannot resume …" error.
5. At continuation-escape sites (storing a continuation in a ref, returning from a handler clause): same check as invocation — the escape itself is fine, but invocation after a tracked frame has discharged is refused.

### Phase 3 — Error messages

1. Each cleanup-holding frame tracks a debug string (handler name + effect-type label) for error messages.
2. Restriction violations report which frame is holding and a summary of registered cleanups.
3. Cleanup errors surface in a single aggregate that points at the scope they belonged to.

### Phase 4 — Documentation

1. Update the effect-handler writing guide with the `onScopeExit` pattern and examples (`file.open`, `db.connect`).
2. Add a dedicated section on "Resources and Dvala" covering the restrictions, the reasoning, and the escape valves (close-and-reopen around snapshots).
3. Archive [2026-04-13_handler-finally.md](2026-04-13_handler-finally.md) with a pointer to this doc.

### Phase 5 — Tests

1. Happy path: normal completion runs cleanups.
2. Abort path: aborting clause runs cleanups.
3. Uncaught-effect pass-through: frame STAYS alive; cleanups do NOT fire until the frame terminally exits. Round-trip through an outer handler's `resume` keeps the same frame instance.
4. Callback error: aggregates without blocking.
5. LIFO ordering: verified with a counter.
6. Nested frames: inner cleanups fire before outer.
7. Restriction — snapshot while resource-held: error, with effect-name breakdown in the message.
8. Restriction — continuation invoked after its tracked resource-holding frame has discharged: error.
9. Restriction — snapshot during active cleanup: error.
10. Per-instance isolation: two `createDvala` instances' cleanup stacks don't interact.
11. Async cleanup: sequential awaiting, ordering preserved.
12. Multi-shot *inside* a resource-holding scope (allowed): each inner resume returns to the same outer frame; cleanups fire once when outer frame terminally exits.

---

## Non-goals

- **Cross-host resource transfer.** Not possible; explicitly restricted.
- **Static "resource" typing.** Deferred to a later type-system phase.
- **Pure-Dvala bracket-like helpers.** Those are library-level and can ship separately using existing primitives.
- **Replacing the effect system.** Host scope callbacks don't change how effects dispatch or how handlers are written — they add one optional API.
