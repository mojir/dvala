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

No mechanism, in any language, fully solves "resource that travels across distributed continuations." The honest design is to *prevent* that combination rather than pretend it works. The restrictions described below make the impossible case a loud runtime error rather than a silent leak.

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

A registered callback is attached to the **nearest enclosing handler frame** at the moment of the effect call. That handler frame becomes "resource-holding."

- When the handler frame exits (normal completion, abort via non-resuming clause, uncaught-effect pass-through), callbacks fire in LIFO.
- Nested scopes nest naturally: inner handlers' cleanups fire before outer handlers' cleanups.
- "The nearest enclosing handler" is unambiguous because effect dispatch already walks the handler stack to find who catches the effect.

### Part 3 — Runtime restrictions

While a handler frame is resource-holding, certain operations are refused at runtime:

| Operation | Behavior when resource-holding |
|---|---|
| Snapshot capture (explicit or via effect) | Runtime error: `cannot snapshot: resource-holding handler 'X' has N live cleanups` |
| Multi-shot resume *across* the resource-holding frame | Runtime error: `cannot resume multiple times: intervening handler 'X' holds live resources` |
| Escape of the continuation (captured, returned) | Runtime error (same class) |
| Abort via non-resuming clause | Allowed — scope exits cleanly, callbacks fire |
| Uncaught effect propagating past the frame | Allowed — the frame still exits, callbacks fire before unwinding further |
| Host effect-handler throwing mid-scope | Allowed — callbacks fire during unwinding, host errors aggregate and surface |

"Across the resource-holding frame" means a resume that would re-enter the frame with callbacks still pending. Multi-shot of a handler *inside* a resource-holding scope is fine as long as each inner resume completes before the outer frame exits.

### Part 4 — Callback execution semantics

1. **Ordering.** LIFO within a frame. Across nested frames, inner frame's callbacks fire before outer frame's — natural from scope nesting.
2. **Errors in callbacks.** A callback that throws does not block subsequent callbacks. Errors are collected and surfaced once cleanup completes, as a single aggregate error associated with the scope exit.
3. **Async callbacks.** Allowed. The runtime awaits each callback sequentially. Ordering is preserved.
4. **Callbacks cannot perform Dvala effects.** We are past the Dvala-execution window by the time cleanup runs. Re-entering would create arbitrarily complex re-entrancy. Cleanups are pure host side-effects.
5. **Idempotency is the host's responsibility.** The runtime guarantees at-most-once execution per registration. It does not guarantee that *a given resource* is cleaned up once if the host registers multiple callbacks for the same handle.

### Part 5 — What happens to `finally`?

The proposed handler `finally` clause is **dropped** for this release. Its motivating use case (resource cleanup) is handled strictly better here. Pure-Dvala-side "run on exit" logic (log-once, restore-ref, emit-metric) can be expressed via library `bracket` patterns that don't need first-class syntax:

```
let bracket = (acquire, release, use) -> do
  let r = acquire();
  let result = use(r);
  release(r);
  result
end;
```

Users who want bullet-proof pure-Dvala side-effects can reach for future mechanisms once a concrete need emerges. For now, one cleanup primitive is enough.

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

### Phase 1 — Runtime bookkeeping

1. Add a `cleanups: Array<() => void | Promise<void>>` field to handler-frame records in the evaluator.
2. Expose `ctx.onScopeExit(cb)` in the effect-handler call interface. Internally: push to the active frame's cleanups.
3. Hook handler-frame exit paths (normal completion, abort, uncaught-effect pass-through) to drain cleanups in LIFO, collecting errors, and surfacing aggregate.

### Phase 2 — Restrictions

1. Add a `resourceHolding: boolean` flag derived from `cleanups.length > 0` (or explicit, if we need independent control).
2. At snapshot-capture sites: walk the handler stack; if any frame has live cleanups, throw a scope-aware error.
3. At multi-shot resume sites (second+ invocation of the same continuation): same check.
4. At continuation-escape sites (storing a continuation in a ref, returning from a handler clause): same check.

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
3. Uncaught effect: pass-through runs cleanups.
4. Callback error: aggregates without blocking.
5. LIFO ordering: verified with a counter.
6. Nested frames: inner cleanups fire before outer.
7. Restriction — snapshot while resource-held: error, with right error message.
8. Restriction — multi-shot across resource-holding frame: error.
9. Restriction — captured continuation escape: error.
10. Async cleanup: sequential awaiting, ordering preserved.

---

## Non-goals

- **Cross-host resource transfer.** Not possible; explicitly restricted.
- **Static "resource" typing.** Deferred to a later type-system phase.
- **Pure-Dvala bracket-like helpers.** Those are library-level and can ship separately using existing primitives.
- **Replacing the effect system.** Host scope callbacks don't change how effects dispatch or how handlers are written — they add one optional API.
