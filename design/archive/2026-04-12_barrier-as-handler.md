# Handler Propagation Across Parallel Branches

**Status:** Implemented
**Created:** 2026-04-12
**Revised:** 2026-04-12 — replaced "barrier as handler" with "handler insertion above barrier"
**Revised:** 2026-04-12 — opt-in `propagate` keyword; resolved `settled` interaction; abort semantics documented
**Revised:** 2026-04-12 — `propagate` composable at both creation-site and installation-site (`with propagate h`)
**Revised:** 2026-04-12 — simplified to installation-site only (`with propagate h;`); no creation-site `propagate handler`

## Problem

### User-facing problem

If you install a handler around a `parallel`, `race`, or `settled` block, it has **no effect** on code inside the branches. Effects from branches cannot reach outer handlers. This means there is no way to provide a "safety net" handler for parallel work — every branch must handle its own effects individually, even when you want uniform behavior across all of them.

```dvala
// The user expects the error handler to catch errors from branches.
// It doesn't — the error leaks to the host.
do with handler @dvala.error(e) -> resume(null) end;
  parallel([
    -> 1 + "a",   // runtime error — but handler never sees it
    -> 42,
  ]);
end
```

This forces users to duplicate handler logic inside every branch:

```dvala
let safe = handler @dvala.error(e) -> resume(null) end;
parallel([
  -> safe(-> 1 + "a"),   // must wrap each branch individually
  -> safe(-> 42),
]);
```

For custom effects (logging, configuration, state), the problem is worse — every branch needs its own handler installation, even when the intent is "all branches share this handler."

### Why the barrier exists

The `ParallelBranchBarrierFrame` in the evaluator blocks effect dispatch at branch boundaries (`dispatchPerform` stops walking `k` when it hits a barrier frame):

```typescript
// trampoline-evaluator.ts, line ~2923
if (frame.type === 'ParallelBranchBarrier' || frame.type === 'ReRunParallel' || frame.type === 'ResumeParallel') break
```

The barrier is **correct and necessary**. Without it, an outer handler's `resume` would apply the outer continuation, bypassing the parallel orchestrator entirely. The branch result would flow into `outerK` instead of back to the orchestrator via `BranchComplete`. The parallel would never see the branch finish.

The barrier solves a real problem — but the consequence is that there is no way to install a Dvala-level "catch all" for effects inside branches.

## Failed approach: barrier as handler

The initial idea was to make the barrier itself handle effects by harvesting clauses from outer handlers into a `fallbackClauses` field on the `BarrierFrame`. When an effect reached the barrier, it would handle it using those clauses.

**This doesn't work.** The barrier has two roles:

1. **Effect boundary** — blocks `dispatchPerform`
2. **Completion sentinel** — catches the branch result and signals `BranchComplete`

When resume strips the "handler frame" from `performK` (line 1089 of `trampoline-evaluator.ts`), it strips the barrier:

```typescript
const innerFrames = listTake(performK, listSize(performK) - 1)
```

The resumed continuation loses the barrier. The branch result flows directly into `outerK`, bypassing `BranchComplete`. The parallel orchestrator never sees the branch finish. This breaks both deep and shallow handlers.

## Proposal: Opt-in handler propagation via `propagate`

Instead of making the barrier a handler, **insert real `AlgebraicHandleFrame` frames above the barrier** at fork time — but only for handlers explicitly marked with the `propagate` keyword. The barrier stays unchanged — dumb sentinel, effect boundary. The harvested handlers are standard handler frames that dispatch catches before effects ever reach the barrier.

### The `propagate` keyword

Only handlers marked `propagate` are harvested into parallel branches. There are two ways to mark a handler as propagating:

**1. At creation time** — bake `propagate` into the handler value:

```dvala
let safe = propagate handler @dvala.error(e) -> resume(null) end;
do with safe;
  parallel([
    -> 1 + "a",   // error → caught by propagated handler → resumes with null
    -> 42,
  ]);
end
// => [null, 42]
```

**2. At installation site** — propagate any handler with `with propagate`:

```dvala
let safe = handler @dvala.error(e) -> resume(null) end;
do with propagate safe;
  parallel([
    -> 1 + "a",   // error → caught by propagated handler → resumes with null
    -> 42,
  ]);
end
// => [null, 42]
```

Both forms produce the same result. The installation-site form enables composability — you can propagate a library handler you didn't write, without wrapping it.

| Creation | Installation | Frame propagates? |
|---|---|---|
| `handler` | `with h` | no |
| `propagate handler` | `with h` | **yes** (handler default) |
| `handler` | `with propagate h` | **yes** (site override) |
| `propagate handler` | `with propagate h` | yes (redundant, harmless) |

Without `propagate` at either site, the handler behaves exactly as today — effects from branches do not reach it:

```dvala
do with handler @dvala.error(e) -> resume(null) end;
  parallel([
    -> 1 + "a",   // error → hits barrier → leaks to host (current behavior)
    -> 42,
  ]);
end
```

This is a **non-breaking change**. Existing code keeps its current behavior. Users opt in explicitly when they want handler propagation across branch boundaries.

### Why both sites?

**Handler-value `propagate`** is for handlers designed to propagate — the author knows the handler is safe across barriers. Example: a shallow state handler that threads independent state per branch.

**Installation-site `with propagate`** is for composability — the user at the `with` site decides where propagation applies, regardless of how the handler was created. This separates concerns: the handler author decides *what* to handle; the user decides *where* it applies.

### Before

```
Branch k:  [branch frames] → BarrierFrame → outerK
```

Effects from the branch hit the barrier → blocked → leak to host.

### After

```
Branch k:  [branch frames] → AlgebraicHandle(harvested) → BarrierFrame → outerK
```

Effects from the branch hit the harvested handler → caught → standard algebraic handling. The barrier is never reached. Resume strips the `AlgebraicHandleFrame` (standard). The barrier remains. `BranchComplete` works.

---

## Implementation

### Step 0: Parser and frame changes for `propagate`

Add `propagate` as a modifier keyword in two positions:

**A. Before `handler`** — creates a handler value with `propagate: true`:

```typescript
// In HandlerFunction type:
interface HandlerFunction {
  // ... existing fields ...
  propagate?: boolean  // true when declared with `propagate handler`
}
```

The keyword is only valid before `handler` (and `shallow handler`). `propagate` on its own is a parse error.

**B. Before a handler expression in `with` position** — sets `propagate` on the installed frame:

```dvala
do with propagate h; body end
```

The parser recognizes `with propagate <expr>` as a variant of `with <expr>`.

**Frame-level flag:** The `propagate` flag lives on the `AlgebraicHandleFrame`, not only on the handler value. This is what harvesting checks:

```typescript
interface AlgebraicHandleFrame {
  type: 'AlgebraicHandle'
  handler: HandlerFunction
  env: Environment
  sourceCodeInfo: SourceCodeInfo
  propagate: boolean  // set at installation time from handler value OR with-site override
}
```

When installing a handler via `with`:

```typescript
// In evaluateWithHandler:
const propagate = withSiteHasPropagate || handler.propagate || false
frame = { type: 'AlgebraicHandle', handler, env, sourceCodeInfo, propagate }
```

When installing via function-call form `h(-> body)`:

```typescript
// Inherits from handler value — no installation site to annotate
const propagate = handler.propagate || false
frame = { type: 'AlgebraicHandle', handler, env, sourceCodeInfo, propagate }
```

### Step 1: Harvest outer handlers at fork time

In `runBranch` (line ~3296), walk `outerK` to collect `AlgebraicHandleFrame` frames **that have `propagate: true` on the frame**, then insert copies above the barrier:

```typescript
function harvestOuterHandlers(outerK: ContinuationStack): AlgebraicHandleFrame[] {
  const handlers: AlgebraicHandleFrame[] = []
  let node = outerK
  while (node !== null) {
    const frame = node.head
    // Stop at next barrier — don't harvest across nested parallel boundaries
    if (frame.type === 'ParallelBranchBarrier' ||
        frame.type === 'ReRunParallel' ||
        frame.type === 'ResumeParallel') break
    if (frame.type === 'AlgebraicHandle' && frame.propagate) {
      // INVARIANT: Strip the transform clause from harvested handlers.
      // The transform belongs to the handler's own scope (what value the `do with`
      // block produces). If kept, the transform would apply twice: once inside the
      // branch (harvested handler) and again outside (original handler).
      // This invariant must hold for all harvested handlers — if a future change
      // adds transform-like behavior, verify it is stripped here.
      const harvestedHandler: HandlerFunction = {
        ...frame.handler,
        transform: undefined,
      }
      assert(harvestedHandler.transform === undefined,
        'Harvested handler must not carry a transform clause')
      handlers.push({
        type: 'AlgebraicHandle',
        handler: harvestedHandler,
        env: frame.env,
        sourceCodeInfo: frame.sourceCodeInfo,
      })
    }
    node = node.tail
  }
  return handlers
}
```

### Step 2: Build the branch continuation with inserted handlers

```typescript
// In runBranch:
const barrierFrame: ParallelBranchBarrierFrame = { type: 'ParallelBranchBarrier', branchCtx }

// Start with barrier + outerK
let branchTailK: ContinuationStack = cons<Frame>(barrierFrame, outerK)

// Insert harvested handlers above the barrier (outermost first, so innermost is on top)
const outerHandlers = harvestOuterHandlers(outerK)
for (const handlerFrame of outerHandlers) {
  branchTailK = cons<Frame>(handlerFrame, branchTailK)
}

// Branch k: [branch frames] → harvested handlers → barrier → outerK
const initial = dispatchFunction(branchFn, PersistentVector.empty(), [], env, undefined, branchTailK)
```

The harvested handlers are inserted in the same order as in `outerK` — innermost (nearest to the parallel call) on top, outermost at the bottom. This preserves shadowing: if multiple outer handlers have clauses for the same effect, the nearest one wins.

### Step 3: No changes to `dispatchPerform`

`dispatchPerform` walks `k` as before. It finds the harvested `AlgebraicHandleFrame` before reaching the barrier. Standard `dispatchAlgebraicHandler` handles it. The barrier is never reached for handled effects.

**No changes to `dispatchPerform`, `dispatchAlgebraicHandler`, `buildResumeFunction`, or `tryDispatchDvalaError`.**

### Step 4: `tryDispatchDvalaError` — no changes needed

`tryDispatchDvalaError` walks `k` looking for `AlgebraicHandle` frames with a `dvala.error` clause. It now finds the harvested handler before reaching the barrier. Works automatically.

### Step 5: Serialization

The `BarrierFrame` is never serialized directly — it's replaced with `ReRunParallelFrame` or `ResumeParallelFrame` before serialization. The harvested handler frames above the barrier are part of the branch's `k` and are serialized normally (they're standard `AlgebraicHandleFrame`s).

On resume:
- **Re-run siblings from scratch:** `runBranch` is called again, which re-creates the barrier and re-harvests handlers from `outerK`. The outer handlers are in the deserialized continuation. Works.
- **Resume siblings from abort point:** Sibling continuations were truncated at the barrier. When reconstructing, the barrier is re-created and handlers are re-harvested from `outerK`. Works.
- **Primary branch continuation:** The harvested handler frames are in the serialized continuation (above where the barrier was). On deserialization, they're standard `AlgebraicHandleFrame`s. Works.

**No new serialization surface.** Everything uses existing frame types.

### Step 6: Shallow handler support

Shallow handlers work correctly with no special handling, as long as they are marked `propagate`:

```dvala
let state = (s) -> propagate shallow handler
  @get() -> do with state(s); resume(s) end
  @set(v) -> do with state(v); resume(null) end
end;

do with state(0);
  parallel([-> do
    perform(@set, 1);
    perform(@get);
  end]);
end
// => [1]
```

Trace:
1. Fork: `state(0)` handler has `propagate: true` → harvested, inserted above barrier
2. Branch k: `[branch frames] → AlgebraicHandle(state(0), shallow, propagate) → Barrier → outerK`
3. `perform(@set, 1)` → caught by harvested `state(0)` handler
4. Shallow: `resume` does NOT reinstall `state(0)`
5. Clause body installs NEW `state(1)` → `resume(null)` continues branch
6. `perform(@get)` → caught by the new `state(1)` handler (inside the branch, above the harvested handler position)
7. Returns `1`

The harvested handler is a standard `AlgebraicHandleFrame` with `shallow: true`. Resume strips it (standard shallow behavior). The barrier remains. No special shallow handling needed.

Handlers are immutable values. Each branch gets its own handler frame that evolves independently through the shallow state-threading pattern. No shared mutable state between branches.

Note: the `state` function returns a `propagate shallow handler`. The `propagate` modifier is part of the handler value — it travels with the handler wherever it's used. This means `state(0)` produces a handler that will always be harvested into branches.

### Step 7: Tests

1. **Basic error recovery across barrier:**
   ```dvala
   do with propagate handler @dvala.error(e) -> resume(null) end;
     parallel([-> 1 + "a", -> 42]);
   end
   // => [null, 42]
   ```

2. **Abort across barrier (branch-scoped):**
   ```dvala
   do with propagate handler @dvala.error(e) -> "failed" end;
     parallel([-> 1 + "a", -> 42]);
   end
   // => ["failed", 42]  (abort replaces branch result only, not entire parallel)
   ```

3. **Non-propagate handler does NOT reach branches (backward compat):**
   ```dvala
   do with handler @dvala.error(e) -> resume(null) end;
     parallel([-> 1 + "a", -> 42]);
   end
   // => error leaks to host (current behavior preserved)
   ```

4. **Custom effects across barrier:**
   ```dvala
   do with propagate handler @log(msg) -> resume(null) end;
     parallel([-> do perform(@log, "hello"); 42 end]);
   end
   // => [42]
   ```

5. **Inner handler shadows propagated:**
   ```dvala
   do with propagate handler @dvala.error(e) -> resume("outer") end;
     parallel([
       -> do with handler @dvala.error(e) -> resume("inner") end;
         1 + "a";
       end
     ]);
   end
   // => ["inner"]  (inner handler catches first, propagated handler not reached)
   ```

6. **Nested parallel — transitive propagation:**
   ```dvala
   do with propagate handler @dvala.error(e) -> resume("outer") end;
     parallel([
       -> parallel([-> 1 + "a"])
     ]);
   end
   // Outer parallel harvests "outer" handler into Branch A.
   // Branch A runs inner parallel. Inner parallel harvests from Branch A's k,
   // which includes the propagated "outer" handler.
   // Inner branch's error is caught.
   // => [["outer"]]
   ```

7. **Shallow handler state across barrier:**
   ```dvala
   let state = (s) -> propagate shallow handler
     @get() -> do with state(s); resume(s) end
     @set(v) -> do with state(v); resume(null) end
   end;
   do with state(0);
     parallel([-> do perform(@set, 1); perform(@get) end]);
   end
   // => [1]
   ```

8. **Independent state per branch:**
   ```dvala
   let state = (s) -> propagate shallow handler
     @get() -> do with state(s); resume(s) end
     @set(v) -> do with state(v); resume(null) end
   end;
   do with state(0);
     parallel([
       -> do perform(@set, 1); perform(@get) end,
       -> do perform(@set, 2); perform(@get) end,
     ]);
   end
   // => [1, 2]  (each branch evolves independently)
   ```

9. **Installation-site propagation (`with propagate`):**
   ```dvala
   let safe = handler @dvala.error(e) -> resume(null) end;
   do with propagate safe;
     parallel([-> 1 + "a", -> 42]);
   end
   // => [null, 42]  (handler doesn't have propagate, but with-site adds it)
   ```

10. **Installation-site propagation with library handler:**
    ```dvala
    let { fallback } = import("effectHandler");
    do with propagate fallback(0);
      parallel([-> 0 / 0, -> 42]);
    end
    // => [0, 42]  (library handler propagated without modification)
    ```

11. **Snapshot + resume with propagated handler:**
    - Take a checkpoint inside a branch that uses a propagated handler
    - Resume from checkpoint
    - Verify the handler is present in the deserialized continuation and still works

12. **Settled without propagate — errors collected normally:**
    ```dvala
    do with handler @dvala.error(e) -> resume(null) end;
      settled([-> 1 + "a"]);
    end
    // => [[:error, {...}]]  (no propagate → handler doesn't reach branch → settled collects error)
    ```

13. **Settled WITH propagate — user's explicit choice:**
    ```dvala
    do with propagate handler @dvala.error(e) -> resume(null) end;
      settled([-> 1 + "a"]);
    end
    // => [[:ok, null]]  (propagated handler catches error → branch completes normally → settled sees :ok)
    // This is intentional — user explicitly chose propagate with settled.
    ```

14. **Transform clause NOT applied inside branch:**
    ```dvala
    do with propagate handler
      @dvala.error(e) -> resume(null)
      transform result -> result * 2
    end;
      parallel([-> 21]);
    end
    // => [42]  (transform applies once to parallel result [21] * 2 = 42,
    //          NOT twice — propagated handler has transform stripped inside branch)
    ```

15. **Race mode with propagated handler:**
    ```dvala
    do with propagate handler @dvala.error(e) -> resume(null) end;
      race([
        -> 1 + "a",
        -> 42,
      ]);
    end
    // => 42  (Branch 2 wins the race. Branch 1's error is caught and resumes with null,
    //         but Branch 2 already completed.)
    ```

---

## Abort Semantics Are Branch-Scoped

When a propagated handler aborts (does not call `resume`), the abort replaces the **branch** result — not the entire `parallel` expression. This differs from non-parallel behavior where abort replaces the entire `do with` block result.

```dvala
// Non-parallel: abort replaces entire block
do with handler @dvala.error(e) -> "failed" end;
  1 + "a";   // error → handler aborts → block returns "failed"
  42;         // never reached
end
// => "failed"
```

```dvala
// Parallel: abort replaces only the erroring branch
do with propagate handler @dvala.error(e) -> "failed" end;
  parallel([
    -> 1 + "a",   // error → handler aborts → branch returns "failed"
    -> 42,         // runs independently, unaffected
  ]);
end
// => ["failed", 42]
```

This is the **correct** behavior — one branch's abort cannot cancel other branches that are running independently. But it is a semantic difference from non-parallel code that users may not expect. The handler's abort scope is the branch, not the enclosing `do with` block.

This should be documented clearly in the book's concurrency chapter and in handler documentation.

---

## Concurrency Safety

Effects never leave the branch. The harvested handler catches them inside the branch's `k`:

1. The `AlgebraicHandleFrame` is **inside** the branch, between branch frames and the barrier
2. `resume` applies the branch-local continuation — the barrier and `outerK` are untouched
3. Other branches are unaffected — they run independently with their own handler copies
4. Handlers are immutable values — sharing the initial handler between branches is safe

Semantically equivalent to the user wrapping each branch with the handler manually. The runtime automates the insertion.

---

## Why Opt-in (`propagate`) Instead of Automatic

The initial draft recommended automatic propagation (all outer handlers harvested into branches). Review identified two problems that make automatic propagation unacceptable:

### 1. `settled` interaction breaks error collection

`settled` exists specifically to observe branch errors as `[:error, payload]` values. With automatic propagation, a `@dvala.error` handler installed for unrelated purposes would silently intercept errors before `settled` sees them:

```dvala
// User intent: settled collects errors, outer handler catches errors elsewhere
do with handler @dvala.error(e) -> resume(null) end;
  settled([
    -> failingWork(),
    -> succeedingWork(),
  ]);
end
// Automatic: [[:ok, null], [:ok, result]]  — error silently swallowed!
// Opt-in (no propagate): [[:error, {...}], [:ok, result]]  — correct
```

The user installed both constructs for different purposes. Automatic propagation collapses two distinct intents into one.

With `propagate`, this only happens when the user explicitly asks for it — a conscious, visible decision:

```dvala
do with propagate handler @dvala.error(e) -> resume(null) end;
  settled([...])   // user explicitly chose both — they know what they're doing
end
```

### 2. Action at a distance

A handler installed 5 levels up the call stack would silently change error semantics inside branches. This is the kind of implicit behavior that makes debugging miserable. With `propagate`, the decision is local and visible at the handler declaration site.

### Decision: **Opt-in via `propagate`**

- Non-breaking change — existing behavior preserved
- Requires parser change for the `propagate` keyword
- Users make a conscious choice to propagate handlers across branch boundaries
- `settled` works correctly by default; propagation only happens when requested

---

## Interaction with Type System

### Phase B (Effect Row Inference)

The typechecker computes effect rows for parallel branches. With handler propagation, outer handlers remove effects from the branch's row:

```dvala
do with handler @dvala.error(e) -> resume(null) end
  // @dvala.error is handled — removed from the leaked row
  parallel([fn () -> 1 + "a" end])
end
```

Without this feature, the typechecker would report `@dvala.error` as unhandled inside the branch (because the barrier blocks it). With this feature, the typechecker correctly sees it as handled.

### Evidence Passing

Evidence passing can optimize dispatch: at compile time, the typechecker knows which effects will be caught by harvested handlers. It can annotate `perform` nodes with evidence pointing to the harvested handler, enabling O(1) dispatch.

---

## Advantages over alternative approaches

This approach was chosen over several alternatives:

| | `propagate` insertion (this) | Barrier as handler | Runners (`run`) | Transparent barrier |
|---|---|---|---|---|
| Runtime changes | small (fork logic + frame flag) | medium (barrier + dispatch) | large (new dispatch path) | medium (resume adaptation) |
| Dispatch changes | none | dispatchPerform, tryDispatchDvalaError | new dispatch chain | dispatchPerform |
| Parser changes | `propagate` keyword (2 positions) | none | `run` keyword | none |
| Composability | full (creation-site + with-site) | N/A (broken) | limited | none |
| Algebraic power | full | broken (strips barrier) | limited (stateless) | degraded (fire-and-forget resume) |
| Shallow handlers | work | break BranchComplete | N/A | degenerate |
| Serialization | automatic (standard frames) | N/A (broken) | explicit (side-table) | automatic |
| Breaking change | no (opt-in) | yes | yes | yes |
| `settled` safety | preserved by default | breaks settled | N/A | breaks settled |

---

## Design Review

The following were verified against the evaluator source:

- **Multi-shot:** `performK` is immutable (PersistentList). `freshenContinuationEnvs` creates independent env copies per fork. Harvested handler frames are freshened too. Multi-shot works.
- **Serialization:** Harvested frames are standard `AlgebraicHandleFrame`s. The `HandlerFunction`'s `closureEnv` captures the outer scope (immutable). Serialized/deserialized with existing machinery. The `propagate` flag is a simple boolean on both `HandlerFunction` and `AlgebraicHandleFrame` — serializes trivially.
- **Re-run siblings:** `runBranch` receives `outerK` containing outer handlers. Re-harvests on every call (only frames with `propagate: true`). Works for both `ReRunParallelFrame` and `ResumeParallelFrame`.
- **Race:** Uses the same `runBranch`. Harvesting applies identically.
- **Shallow handlers:** Standard frame with `shallow: true`. Resume doesn't reinstall. State threading works independently per branch. No shared mutable state.
- **BranchComplete:** Harvested handler (with transform stripped) is above the barrier. Branch result flows through handler untransformed → barrier → BranchComplete. Correct.
- **Transform clause:** Identified as a flaw in initial design — transform would apply twice (inside branch + outside on parallel result). Fixed by stripping `transform` from harvested handlers. Only effect clauses propagate. An assertion guards this invariant.
- **`settled` interaction:** Resolved by opt-in design. Without `propagate`, `settled` works as today. With `propagate`, the user explicitly chose both — the propagated handler wins (closer to branch), which is the user's conscious decision.
- **Abort scope:** Abort from a propagated handler replaces the branch result only, not the entire parallel expression. This is correct (branches are independent) but differs from non-parallel abort semantics. Documented in "Abort Semantics Are Branch-Scoped" section.
- **Dual-site propagate:** The `propagate` flag on the frame is set from either the handler value or the `with propagate` syntax. Harvesting checks `frame.propagate`, not `frame.handler.propagate`, so both sources work identically. The `with propagate` form copies the handler into a frame with `propagate: true` — the handler value itself is not modified. No aliasing concerns.

---

## Open Questions

### 1. Harvesting depth / transitive propagation

Should harvesting cross multiple parallel levels? Current approach: each `parallel` harvests from its immediate outer `k`. Since the outer `k` already includes handlers harvested by parent parallels, transitive propagation happens naturally — a handler at any outer level reaches all nested branches.

Verify this works correctly in test 5 (nested parallel).

### 2. ~~Interaction with `settled` mode~~ — RESOLVED

**Resolved by opt-in design.** With `propagate`, the `settled` interaction is no longer a problem by default:

- Without `propagate`: `settled` works as today — errors are captured as `[:error, payload]`. No outer handler interferes.
- With `propagate`: the user explicitly chose both `propagate handler` and `settled`. The propagated handler catches errors before `settled` sees them. This is the user's conscious decision — they opted in.

If a user writes `propagate handler @dvala.error(e) -> resume(null)` around a `settled`, the handler wins (it's closer to the branch). The user knows this because they wrote `propagate`. No silent swallowing.

### 3. Handler ordering

Multiple outer handlers are harvested in the same order as in `outerK`. Inner (nearest) handlers are inserted first (closest to the branch frames), outer handlers below them. This preserves the shadowing order from the original scope.

Verify with a test using multiple handlers for the same effect at different nesting levels.
