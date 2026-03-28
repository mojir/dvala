# Effect Handler Redesign: Abort, Resume, Transform

**Status:** Draft
**Created:** 2026-03-27
**Updated:** 2026-03-28

## Goal

Align Dvala's effect handler model with established algebraic effects conventions (Koka, Eff, OCaml 5):
- Named effect clauses with exact match dispatch
- `resume` keyword available in every handler clause
- Not calling `resume` = **abort** (exit handle block)
- `resume` is a function call that **returns** the continuation's result
- `transform` clause for transforming normal completion
- `perform` supports multiple arguments
- Unmatched effects propagate implicitly to outer handlers
- No handler chains, no catch-all, no `nxt`

---

## Background

### Current model

Handlers receive `(arg, eff, nxt)`. Return value always **resumes**:

```dvala
handle
  let x = 0 / 0;    // raises @dvala.error
  x + 1
with [(arg, eff, nxt) ->
  if eff == @dvala.error then 0    // resume: x = 0, x + 1 = 1
  else nxt(eff, arg)
  end
] end
// → 1
```

### Problems

1. **No abort** — can't exit the handle block early. `fallback("caught")` resumes instead of aborting.
2. **No transform clause** — can't transform the block's result without wrapping after.
3. **No state threading** — pure accumulation patterns (logging, tracing) are impossible without mutation.
4. **Single arg** — `perform(@eff, arg)` packs multiple values into one object.
5. **Catch-all dispatch** — single function handles all effects, branches on `eff`. Verbose and error-prone.
6. **Explicit forwarding** — must write `nxt(eff, arg)` for every unhandled effect.

### Why follow the established convention

The transform clause + resume-returns-value + abort-by-default form a coherent system refined over years of PL research. The transform clause enables pure state threading, which is the canonical motivation for it.

---

## Proposal

### Syntax

```dvala
handle
  body
with
  @effect1(args...) -> expr
  @effect2(args...) -> expr
transform
  x -> expr
end
```

Three sections:
- **`handle`** — the body (what to do)
- **`with`** — named effect clauses (how to handle effects)
- **`transform`** — optional, transforms normal completion value

### Named effect clauses

Every clause names its effect explicitly. No catch-all, no wildcards. `resume` is a keyword available in every clause.

```dvala
handle
  let users = perform(@fetch, "/users");
  process(users)
with
  @fetch(url) -> resume(httpGet(url))           // call resume = continue
  @dvala.error(msg) -> { error: msg }           // no resume = abort
end
```

**Dispatch:** when an effect fires, the handler looks up the effect name. If a matching clause exists, it runs. If not, the effect propagates implicitly to the enclosing handler. No ordering, no priority — exact name match.

**Duplicate clauses** for the same effect name are a parse error.

### `perform` with multiple arguments

`perform` passes multiple arguments directly to the handler clause:

```dvala
perform(@fetch, "/users", 5000);

// Handler clause receives them positionally:
@fetch(url, timeout) -> resume(httpGet(url, timeout))
```

No need to pack arguments into an object.

### `resume` keyword

`resume` is available in every handler clause. It is a function call that:
1. Continues execution at the `perform` site with the given value
2. **Returns** the continuation's eventual result (after transform clause)

```dvala
@log(msg) -> do
  let [result, logs] = resume(null);     // continue, get result back
  [result, [msg, ...logs]]               // transform and abort
end
```

Not calling `resume` = abort. The clause's return value becomes the handle block's result.

### One-shot constraint

`resume` can only be called **once** per effect. Calling it a second time is a runtime error. This is inherent to Dvala's one-shot continuation model — the continuation is consumed on first use.

```dvala
@eff(x) -> do
  let a = resume(1);    // ok
  let b = resume(2);    // runtime error: continuation already consumed
  a + b
end
```

### `transform` clause

Optional. Transforms the block's **normal completion** value. Placed in its own section after `with`:

```dvala
handle
  1 + 2
with
  @dvala.error(msg) -> 0
transform
  x -> x * 10
end
// → 30 (normal completion: 3, transformed to 30)
```

**Transform does NOT apply to abort values.** These are mutually exclusive paths, per the formal operational semantics:
- **Path 1 (normal completion):** body evaluates to a value → transform applies
- **Path 2 (effect handled, no resume):** handler returns a value → transform is bypassed

```dvala
handle
  raise("bad")
with
  @dvala.error(msg) -> { ok: false, error: msg }   // abort — bypasses transform
transform
  x -> { ok: true, data: x }                        // only on normal completion
end
// → { ok: false, error: "bad" }
```

**Transform applies inside `resume`.** When a handler calls `resume(value)`, the continuation runs. If it completes normally, the transform clause transforms the result, and that transformed result is what `resume` returns:

```dvala
handle
  42
with
  @my.eff(x) -> resume(x)     // resume runs continuation (42),
                                // transform gives 420,
                                // resume returns 420
transform
  x -> x * 10
end
```

**Without a transform clause**, the default is identity: `x -> x`.

### Implicit propagation

Effects not matched by any clause in the handler propagate implicitly to the enclosing handler. No `nxt` needed:

```dvala
handle
  handle
    perform(@inner, 10);
    perform(@outer, 20)       // no clause in inner handler → propagates
  with
    @inner(v) -> resume(v)
  end
with
  @outer(v) -> resume(v * 3)
end
```

This replaces the old `nxt(eff, arg)` pattern and the catch-all `({ arg, eff, nxt, resume }) -> ...` form. Composition is via nesting, not chains.

### Deep handler reinstallation

When `resume(value)` is called, the handler is **reinstalled around the continuation**. This is critical for correctness — it means effects performed during the resumed continuation are handled by the same handler (deep semantics, following Koka/Eff/OCaml 5).

```dvala
handle
  let x = perform(@eff, 10);
  let y = perform(@eff, 20);    // hits the REINSTALLED handler, not the original
  x + y
with
  @eff(v) -> do
    let result = resume(v);
    result + 1
  end
transform
  x -> x * 100
end
```

Trace:
1. `perform(@eff, 10)` → clause calls `resume(10)`
2. Handler is reinstalled around the continuation: `handle (let y = perform(@eff, 20); 10 + y) with same_handler`
3. `perform(@eff, 20)` fires → hits the reinstalled handler → calls `resume(20)`
4. Handler reinstalled again: `handle (10 + 20) with same_handler`
5. Body completes normally: 30 → transform: 30 * 100 = 3000
6. Inner `resume(20)` returns 3000 → clause returns `3000 + 1` = 3001 (abort)
7. Abort bypasses transform → reinstalled handle result is 3001
8. Outer `resume(10)` returns 3001 → clause returns `3001 + 1` = 3002 (abort)
9. Abort bypasses transform → **result: 3002**

Key rules:
- **Transform applies only on normal body completion** (Path 1) — never on abort (Path 2). These are mutually exclusive, per the formal operational semantics.
- **Abort inside a resume becomes resume's return value** — the reinstalled handle block resolved via the abort path, that value is what resume returns.
- **Deep reinstallation means re-entrant effects are well-defined** — each `resume` creates a fresh handler scope around the continuation.

### Nested handle blocks

When an effect propagates from an inner handle block to an outer handler, the behavior follows naturally from delimited continuations. No special rules are needed.

```dvala
handle
  handle
    let x = perform(@inner, 10);
    let y = perform(@outer, 20);   // propagates to outer handler
    x + y
  with
    @inner(v) -> resume(v)
  transform
    x -> x * 100
  end
with
  @outer(v) -> resume(v * 3)      // resume with 60
end
```

Trace:
1. `perform(@inner, 10)` → inner handler resumes with 10, x = 10
2. `perform(@outer, 20)` → no clause in inner handler → propagates to outer handler
3. Outer handler's continuation is everything from the perform site to the outer handler's delimiter — **including the inner handler's frame**
4. Outer handler resumes with 60 → inner handler is automatically reinstalled (it's part of the captured continuation)
5. y = 60, x + y = 70 → inner handle block completes normally
6. Inner transform applies: 70 * 100 = 7000
7. 7000 flows up to the outer handler's delimiter → outer `resume` returns 7000
8. Outer handler returns 7000 (called resume, so this is the handle block result)
9. **Result: 7000**

Key principles (aligned with Koka/Eff):
- **Outer continuation includes inner handler frames** — the captured continuation is everything between the perform site and the outer handler's delimiter
- **Inner handler is reinstalled on outer resume** — not a special mechanism, just part of the captured continuation stack
- **Inner transform applies** — when the inner block completes normally, its transform clause transforms the value before it reaches the outer handler's resume
- **Inner abort propagates as a value** — if the inner handler aborts instead of completing normally, the abort value becomes the inner handle block's result (transform skipped), and the outer handler's resume returns that value

### Intercept-and-forward pattern

Handler clause bodies run **outside** the handler scope (the HandleWithFrame is popped before the clause executes). This means `perform` inside a clause propagates to the outer handler — standard algebraic effects behavior, not a special feature.

This enables middleware-style handlers that intercept, transform, and forward effects:

```dvala
handle
  handle
    perform(@fetch, "/users")
  with
    // Logging middleware — intercepts @fetch, logs, forwards, logs result
    @fetch(url) -> do
      perform(@log, "fetching: " ++ url);
      let result = perform(@fetch, url);      // re-perform → propagates to outer
      perform(@log, "got: " ++ str(result));
      resume(result)
    end
  end
with
  @fetch(url) -> resume(httpGet(url))
  @log(msg) -> resume(print(msg))
end
```

Other examples of intercept-and-forward:
- **Auth wrapper**: `@fetch(url) -> do let r = perform(@fetch, addAuth(url)); resume(r) end`
- **Caching**: `@fetch(url) -> if cached(url) then resume(getCache(url)) else do let r = perform(@fetch, url); setCache(url, r); resume(r) end end`
- **Effect translation**: `@legacyRead(path) -> do let r = perform(@fs.read, path); resume(r) end`

No `forward` keyword needed. `perform` in a clause body propagates outward by the standard algebraic effects semantics.

### Pure state threading (no mutation)

The transform clause + resume-returns-value enables pure accumulation:

```dvala
handle
  perform(@log, "starting");
  let x = 42;
  perform(@log, "computed: " ++ str(x));
  x
with
  @log(msg) -> do
    let [result, logs] = resume(null);
    [result, [msg, ...logs]]
  end
transform
  x -> [x, []]
end
// → [42, ["starting", "computed: 42"]]
```

Trace:
1. `perform(@log, "starting")` → clause calls `resume(null)`
2. Inside: `perform(@log, "computed: 42")` → clause calls `resume(null)`
3. Inside: `42` → transform: `[42, []]`
4. Step 2's `resume` returns `[42, []]` → clause returns `[42, ["computed: 42"]]`
5. Step 1's `resume` returns `[42, ["computed: 42"]]` → clause returns `[42, ["starting", "computed: 42"]]`

No mutation. Each handler invocation wraps the result on the way out, like unwinding a call stack.

### Updated `fallback`

```dvala
// Before (resumes — surprising):
fallback: (value) -> @dvala.error(msg) -> value

// After (aborts — matches user expectation):
fallback: (value) -> @dvala.error(msg) -> value   // no resume = abort
```

### Summary

```dvala
handle
  body
with
  // Named clauses — exact match, resume available as keyword
  @fetch(url, timeout) -> resume(httpGet(url, timeout))  // resume
  @dvala.error(msg) -> "caught"                           // abort (no resume)
  @log(msg) -> do                                         // resume + transform
    let [result, logs] = resume(null);
    [result, [msg, ...logs]]
  end
transform
  // Optional — transforms normal completion, applies inside resume
  x -> [x, []]
end
```

### Migration

| Before | After |
|---|---|
| `(arg, eff, nxt) -> value` (resume) | `@effect(arg) -> resume(value)` |
| `(arg, eff, nxt) -> value` (intended abort) | `@effect(arg) -> value` |
| `nxt(eff, arg)` | Remove — unmatched effects propagate implicitly |
| `@effect(x) -> value` (shorthand) | `@effect(x) -> resume(value)` |
| `[handler1, handler2]` chain | Nest handle blocks instead |
| No return clause | `transform x -> expr` available |
| `fallback(v)` resumes | `fallback(v)` aborts |

---

## Comparison with Established Models

### Koka

Koka has two clause types in handlers:
- **`fun` clause** — tail-resumptive: return value automatically resumes
- **`ctl` clause** — control: receives continuation, must explicitly call `resume` to continue

```koka
handler
  return(x) -> x
  fun get()    -> state
  ctl throw(msg) -> Left(msg)
```

**Dvala equivalent:**
```dvala
handle ... with
  @state.get() -> resume(state)
  @error.throw(msg) -> ["Left", msg]
transform
  x -> x
end
```

**Alignment:** Dvala unifies Koka's `fun`/`ctl` into one form — `resume` is always available, you choose whether to call it. No syntactic split needed.

### OCaml 5

| | OCaml 5 | Dvala (proposed) |
|---|---|---|
| Resume | `continue k value` | `resume(value)` |
| Abort | Don't call `continue`, return value | Don't call `resume`, return value |
| Resume returns? | No — `continue` is a jump | **Yes** — `resume` returns continuation result |
| Propagate | Return `None` from effc | Implicit — no matching clause |
| Transform clause | `retc` field | `transform x -> expr` |
| Exception clause | `exnc` field | Not needed — errors are effects |
| Handler composition | Nested `match_with` | Nested `handle` blocks |

### Eff

```eff
handler
| val x -> (x, [])
| #log msg k ->
    let (result, logs) = k () in
    (result, msg :: logs)
```

Dvala equivalent:
```dvala
handle ... with
  @log(msg) -> do
    let [result, logs] = resume(null);
    [result, [msg, ...logs]]
  end
transform
  x -> [x, []]
end
```

**Alignment is direct.** Eff's `k ()` = Dvala's `resume(null)`.

### Summary: what Dvala takes from each

| Feature | Source | Dvala |
|---|---|---|
| Named clauses per effect | Koka, Eff | `@effect(args) -> expr` |
| `resume` returns continuation result | Koka, Eff | `resume(value)` returns result |
| Abort = don't call resume | Koka, OCaml, Eff | Return value = abort |
| Transform clause | Koka (`return`), OCaml (`retc`), Eff (`val`) | `transform x -> expr` |
| One-shot continuations | OCaml 5 | `resume` can be called once |
| Implicit propagation | Koka, Eff | Unmatched effects propagate automatically |
| No exception clause | **Dvala-specific** | Errors are effects, not a separate mechanism |
| Multiple perform args | **Dvala-specific** | `perform(@eff, a, b, c)` → `@eff(a, b, c)` |

### What Dvala intentionally omits

| Feature | Why omitted |
|---|---|
| Handler chains / `nxt` | Nesting replaces chains; keeps surface area small |
| Catch-all / wildcard clauses | Named clauses only; implicit propagation for the rest |
| Shorthand (auto-resume) form | One form with explicit `resume` is clearer |
| Multi-shot resume | One-shot by design — simpler semantics, no cloning (for now) |
| `finally`/`initially` clauses | Can be added later; current focus is core semantics |
| `mask`/`override` | Advanced composition — defer until needed |
| Named/scoped handlers | Complex dispatch — defer until needed |
| Shallow handlers | Deep handlers cover all use cases for now |
| `discontinue` (OCaml) | Dvala has no exceptions — errors are effects |

---

## Open Questions

- ~~**Breaking change strategy**~~: **Decided — not a concern.** Handler redesign ships with KMP migration (Phase 0), which is a clean break anyway.
- ~~**`retry` handler**~~: **Decided — retry is a pattern, not a handler primitive.** A recursive function wrapping a handle block handles retries naturally. The final failure can re-perform the error (propagates out since handler clause runs outside the handler scope).
- **Transform clause exactly-once**: Clarify in implementation that transform fires exactly once on normal body completion, never re-applied on subsequent resume returns. (The deep reinstallation model handles this naturally — each reinstalled handler has its own transform scope.)
- **`fallback` desugaring**: With the new syntax, `fallback(v)` desugars to `@dvala.error(msg) -> v`. Verify this works with no catch-all.
- **`perform` with zero args**: `perform(@getState)` with no args — clause is `@getState() -> resume(currentState)`. Confirm parser handles this.
- **Handler clause scope**: Confirm that handler clause bodies run outside the handler scope (like Koka's `ctl`), so `perform` inside a clause propagates outward, not to the same handler.

### ~~First-class handlers and the transform boundary problem~~

**Status:** Resolved.

#### Requirements

1. **Algebraic effects principles** — no compromises on: `resume`, abort-by-default, transform clause, deep handlers, implicit propagation, named clauses.
2. **Inline handlers** — always possible by substituting `h` with `(handler...end)`.
3. **Declared handlers** — create first-class handler values, pass them around, store and reuse them.
4. **Same construct** (preferred, not hard) — use the same syntax for inline and declared forms.
5. **Transform belongs to the handler** — clauses and transform are a coupled contract (consequence of #1, stated explicitly because it's the source of the friction).

#### Decision: `handler...end` + `with h;` (G-style, Koka-aligned)

Two constructs:

**`handler...end`** — creates a first-class handler value:
```dvala
let h = handler
  @eff(x) -> resume(x)
  @dvala.error(msg) -> "caught"
transform
  x -> x * 10
end
```

**`with h;`** — installs a handler for the rest of the current block (like `let` scoping):
```dvala
do
  with h;
  body
end
```

Inline is always possible by substituting `h` with `(handler...end)`:
```dvala
do
  with (handler @dvala.error(msg) -> 0 end);
  1 / 0
end
```

**Why this design:**

- **No transform ambiguity.** Transform is always inside `handler...end`. There is no "handle block" with its own transform — `with h;` just installs, it doesn't define anything.
- **`with h;` follows `let` scoping.** Handler is active for the rest of the block, just like a `let` binding. Not a new concept — reuses Dvala's existing scoping model.
- **Flat stacking.** Multiple handlers don't nest:
  ```dvala
  do
    with h1;
    with h2;
    with h3;
    body
  end
  ```
- **Interleaving with computation.** Handlers can depend on values computed earlier in the block:
  ```dvala
  do
    let config = loadConfig();
    with makeErrorHandler(config);
    let db = connect();
    with makeDbHandler(db);
    query(db)
  end
  ```
- **First-class.** Handlers are values — pass them, store them, return them from functions:
  ```dvala
  let fallback = (v) -> handler @dvala.error(msg) -> v end
  ```
- **Koka-aligned.** Koka uses `with h` for handler installation with block scoping. Familiar to the algebraic effects community.

**What was considered and rejected:**

- **`handle body with <clauses> [transform ...] end`** (original design) — transform looks like it belongs to the handle block, not the handler. Ambiguity when combining inline clauses with a declared handler that already has a transform.
- **`handle body with handler ... end end`** (explicit handler keyword) — double `end`.
- **`handle body with h end`** (H-style) — nesting required for multiple handlers. No interleaving.
- **`h(-> body)`** (F-style callable) — clean model but thunk wrapping (`->`) everywhere. Could be added later as sugar since handlers are values.
- **`||>` operator** — dropped. Handler chains and effect pipe don't fit the new clause-based model.

#### Remaining syntax questions

1. **Clause syntax inside `handler...end`** — separators between clauses? Semicolons? Newlines only?
2. **Transform syntax inside `handler...end`** — `transform x -> expr`? Where exactly does it go relative to clauses?
3. **`with h;` details** — is the semicolon required? Or could `with h do ... end` also work as a block form?
4. **One-liner forms** — `with h; expr` on a single line vs always needing `do...end`?
5. **`resume` binding** — keyword always available in clause bodies? Implicit binding (like `self`)? Or explicit parameter?
6. **Multiple perform args** — `perform(@eff, a, b)` maps to `@eff(a, b) -> ...`. How does the parser handle variadic clauses?
7. **Error messages and edge cases** — duplicate clauses, calling `resume` outside a clause, handler with no clauses, etc.

---

## Implementation Plan

### Phase 1a: Resolve remaining syntax questions
1. Finalize clause syntax inside `handler...end`
2. Finalize `with h;` details and one-liner forms
3. Finalize `resume` binding model
4. Finalize multiple perform args

### Phase 1b: Core implementation
1. **`handler...end` expression** — new reserved keyword, parser, handler value type
2. **`with h;` statement** — parser support, installs handler on continuation stack for rest of block
3. **Named clause dispatch** — dispatch by effect name in handler's clause map
4. **`resume` keyword** — available in every handler clause, captures continuation
5. **Abort by default** — clause return value without `resume` = abort (exits handle scope)
6. **Transform clause** — apply on normal body completion and inside resume
7. **Deep reinstallation** — reinstall handler around continuation on resume
8. **Implicit propagation** — unmatched effects propagate to enclosing handler automatically
9. **One-shot guard** — `resume` throws if called twice
10. **Multiple perform args** — extend `perform` to pass variadic args to handler clauses

### Phase 1c: Migration and cleanup
1. **Drop old handler system** — remove handler chains `[h1, h2]`, `nxt`, `HandleNextFunction`, `||>` operator, handler shorthand-to-lambda desugaring
2. **Update `fallback`/`retry`** — rewrite as functions returning handler values
3. **Migrate all handlers** — tests, tutorials, examples, effectHandler module
4. **Add tests** — abort, resume-returns-value, transform clause, state threading, one-shot guard, nested handlers, implicit propagation, multiple args, flat stacking, interleaving
5. **Update docs** — tutorials, skill docs, reference
