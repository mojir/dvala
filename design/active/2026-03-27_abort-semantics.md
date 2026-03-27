# Effect Handler Redesign: Abort, Resume, Return Clause

**Status:** Draft
**Created:** 2026-03-27

## Goal

Align Dvala's effect handler model with established algebraic effects conventions (Koka, Eff, OCaml 5):
- Handler's return value = **abort** (exit handle block)
- `resume(value)` = explicit function call, **returns** the continuation's result
- `return(x) -> expr` clause = transforms normal completion
- Handler shorthand unchanged = auto-resume (ergonomic sugar)
- Single context object instead of positional params

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
2. **No return clause** — can't transform the block's result without wrapping after.
3. **No state threading** — pure accumulation patterns (logging, tracing) are impossible without mutation.
4. **Positional params** — `(arg, eff, nxt)` doesn't scale.

### Why follow the established convention

The return clause + resume-returns-value + abort-by-default form a coherent system refined over years of PL research. The return clause enables pure state threading, which is the canonical motivation for it. Dvala is one-shot (no multi-shot continuations), which simplifies the model — `resume` can only be called once per effect.

---

## Proposal

### Two handler forms

**Handler shorthand** (common case) — auto-resumes, unchanged syntax:
```dvala
@dvala.error(msg) -> 0                    // resume with 0
@log(msg) -> null                          // resume with null
```

**Full handler** (power case) — abort by default, explicit resume:
```dvala
({ arg, eff, nxt, resume }) ->
  if eff == @dvala.error then "caught"     // abort: return = exit handle block
  else nxt(eff, arg)                        // delegate
  end
```

The shorthand is sugar — it desugars to a full handler that calls `resume(value)`:
```dvala
// @dvala.error(msg) -> 0  desugars to:
({ arg, eff, nxt, resume }) ->
  if eff == @dvala.error then resume(0)
  else nxt(eff, arg)
  end
```

### Context object fields

| Field | Description |
|---|---|
| `arg` | Payload passed to `perform(@effect, arg)` |
| `eff` | The effect reference (e.g., `@dvala.error`) |
| `nxt(eff, arg)` | Delegate to next handler in chain, returns its result |
| `resume(value)` | Continue at perform site, **returns** the continuation's eventual result |

### Handler exit paths

| Expression | Behavior |
|---|---|
| `return value` | **Abort**: exit handle block, `value` is the block result |
| `resume(value)` | Continue at perform site, returns continuation's result |
| `nxt(eff, arg)` | Delegate to next handler; returns its result, or propagates out |

### `resume(value)` is a function call that returns

This is the key design choice. `resume` runs the continuation and returns whatever the handle block would have produced (after the return clause, if any):

```dvala
({ arg, eff, nxt, resume }) ->
  if eff == @dvala.error then do
    let result = resume(0);     // continue with x = 0, get final result back
    result * 100                 // transform and abort with modified result
  end
  else nxt(eff, arg)
  end
```

### One-shot constraint

`resume` can only be called **once** per effect. Calling it a second time is a runtime error. This is inherent to Dvala's one-shot continuation model — the continuation is consumed on first use.

```dvala
({ arg, eff, nxt, resume }) ->
  let a = resume(1);    // ok
  let b = resume(2);    // runtime error: continuation already consumed
  a + b
```

### Return clause

`return(x) -> expr` transforms the block's **normal completion** value. Placed in the `with` clause alongside handlers.

```dvala
handle
  1 + 2
with
  return(x) -> x * 10
end
// → 30
```

**Return clause does NOT apply to abort values.** When a handler aborts, the abort value becomes the handle block result directly, bypassing the return clause:

```dvala
handle
  raise("bad")
with
  return(x) -> { ok: true, value: x }                              // only on normal completion
  ({ arg, eff, nxt, resume }) ->
    if eff == @dvala.error then { ok: false, error: arg.message }   // abort — bypasses return clause
    else nxt(eff, arg)
    end
end
// raise → abort with { ok: false, error: "bad" }
// return clause never runs
```

**Return clause applies inside `resume`.** When a handler calls `resume(value)`, the continuation runs, the return clause transforms its result, and that transformed result is what `resume` returns:

```dvala
handle
  42
with
  return(x) -> x * 10
  @my.eff(x) -> resume(x)      // shorthand, but to illustrate:
                                 // resume runs continuation (42),
                                 // return clause gives 420,
                                 // resume returns 420
end
```

**Without a return clause**, the default is identity: `return(x) -> x`.

### `nxt` delegation

`nxt(eff, arg)` delegates to the next handler in the chain.

**When a handler in the chain handles it:** `nxt` returns that handler's result. The continuation may have already run inside that handler's `resume` call. Returning `nxt`'s result aborts with the fully-resolved value — correct, because there's nothing left to do:

```dvala
handle
  let x = perform(@my.eff, 10);
  x + 1
with [
  ({ arg, eff, nxt, resume }) -> nxt(eff, arg),   // delegate
  @my.eff(x) -> x * 2                              // resume with 20
] end
// Handler B resumes with 20 → x = 20, x + 1 = 21
// resume returns 21 to handler B → handler B returns 21
// nxt returns 21 to handler A → handler A returns 21 (abort)
// → 21 ✓
```

**When no handler in the chain handles it:** `nxt` re-performs the effect past the HandleWithFrame. It does not return — control propagates outward to enclosing handlers or the host.

### Pure state threading (no mutation)

The return clause + resume-returns-value enables pure accumulation:

```dvala
handle
  perform(@log, "starting");
  let x = 42;
  perform(@log, "computed: " ++ str(x));
  x
with
  return(x) -> [x, []]
  ({ arg, eff, nxt, resume }) ->
    if eff == @log then do
      let [result, logs] = resume(null);
      [result, [arg, ...logs]]
    end
    else nxt(eff, arg)
    end
end
// → [42, ["starting", "computed: 42"]]
```

Trace:
1. `perform(@log, "starting")` → handler calls `resume(null)`
2. Inside: `perform(@log, "computed: 42")` → handler calls `resume(null)`
3. Inside: `42` → return clause: `[42, []]`
4. Step 2's `resume` returns `[42, []]` → handler returns `[42, ["computed: 42"]]`
5. Step 1's `resume` returns `[42, ["computed: 42"]]` → handler returns `[42, ["starting", "computed: 42"]]`

No mutation. Each handler invocation wraps the result on the way out, like unwinding a call stack.

### Updated `fallback`

```dvala
// Before (resumes — surprising):
fallback: (value) -> @dvala.error(msg) -> value

// After (aborts — matches user expectation):
fallback: (value) -> ({ arg, eff, nxt, resume }) ->
  if eff == @dvala.error then value       // abort with fallback value
  else nxt(eff, arg)
  end
```

### Summary of handler forms

```dvala
handle
  body
with
  // Return clause (optional) — transforms normal completion, applies inside resume
  return(x) -> transform(x)

  // Shorthand — matches one effect, auto-resumes (ergonomic, common case)
  @dvala.error(msg) -> 0

  // Full handler — abort by default, explicit resume (powerful)
  ({ arg, eff, nxt, resume }) ->
    if eff == @my.eff then do
      let result = resume(processedArg);    // resume + get result
      wrapResult(result)                     // transform + abort
    end
    else nxt(eff, arg)
    end
end
```

### Migration

| Before | After |
|---|---|
| `(arg, eff, nxt) -> value` (resume) | `({ arg, eff, nxt, resume }) -> resume(value)` |
| `(arg, eff, nxt) -> value` (intended abort) | `({ arg, eff, nxt }) -> value` |
| `nxt(eff, arg)` as last expr | `nxt(eff, arg)` (unchanged — still works) |
| `@effect(x) -> value` | `@effect(x) -> value` (unchanged) |
| No return clause | `return(x) -> expr` available |
| `fallback(v)` resumes | `fallback(v)` aborts |

---

## Comparison with Established Models

### Koka

Koka has two clause types in handlers:
- **`fun` clause** — tail-resumptive: return value automatically resumes (like Dvala's handler shorthand)
- **`ctl` clause** — control: receives continuation, must explicitly call `resume` to continue (like Dvala's full handler)

```koka
handler
  return(x) -> x                              // return clause
  fun get()  -> resume(state)                 // tail-resumptive (auto-resume)
  ctl throw(msg) -> Left(msg)                 // control (abort if no resume)
```

**Dvala equivalent:**
```dvala
handle ... with
  return(x) -> x
  @state.get(x) -> state                       // shorthand = Koka's fun
  ({ arg, eff, nxt, resume }) ->               // full handler = Koka's ctl
    if eff == @error then ["Left", arg.message]
    else nxt(eff, arg)
    end
end
```

**Alignment:** Dvala's two forms map directly to Koka's `fun`/`ctl` split. The key semantic is identical: `fun`/shorthand auto-resumes, `ctl`/full gives explicit control with abort-by-default.

### OCaml 5

OCaml uses a handler record with three fields:
- **`retc`** — return clause (normal completion)
- **`exnc`** — exception clause
- **`effc`** — effect clause (receives continuation `k`)

```ocaml
match_with computation arg {
  retc = (fun x -> x);                        (* return clause *)
  exnc = (fun e -> raise e);                  (* exception clause *)
  effc = (fun (type a) (eff: a t) ->          (* effect clause *)
    match eff with
    | Get -> Some (fun (k: (a,_) continuation) ->
        continue k state)                      (* resume *)
    | Throw -> Some (fun k ->
        42)                                    (* abort — don't call continue *)
    | _ -> None)                               (* propagate *)
}
```

**Key differences:**
| | OCaml 5 | Dvala (proposed) |
|---|---|---|
| Resume | `continue k value` | `resume(value)` |
| Abort | Don't call `continue`, return value | Don't call `resume`, return value |
| Resume returns? | No — `continue` is a jump | **Yes** — `resume` returns continuation result |
| Propagate | Return `None` from effc | `nxt(eff, arg)` |
| Return clause | `retc` field | `return(x) -> expr` |
| Exception clause | `exnc` field | Not needed — errors are effects (`@dvala.error`) |
| Handler chains | Stack nested `match_with` | Array `[handler1, handler2]` + `nxt` |

**Dvala's `resume` returning a value is a departure from OCaml 5** (where `continue` is a jump). This follows Koka's model instead, where resuming returns the continuation's result and enables pure state threading.

### Eff (academic reference language)

```eff
handler
| val x -> (x, [])                             (* return clause *)
| #log msg k ->                                 (* effect clause *)
    let (result, logs) = k () in                (* resume, get result *)
    (result, msg :: logs)                        (* transform + abort *)
```

This is almost identical to Dvala's proposed state threading pattern:
```dvala
return(x) -> [x, []]
({ arg, eff, nxt, resume }) ->
  if eff == @log then do
    let [result, logs] = resume(null);
    [result, [arg, ...logs]]
  end
  else nxt(eff, arg)
  end
```

**Alignment is direct.** Eff's `k ()` = Dvala's `resume(null)`. Both return the continuation result for transformation.

### Summary: what Dvala takes from each

| Feature | Source | Dvala |
|---|---|---|
| `fun`/`ctl` split (auto-resume vs explicit) | Koka | Shorthand vs full handler |
| `resume` returns continuation result | Koka, Eff | `resume(value)` returns result |
| Abort = don't call resume | Koka, OCaml, Eff | Return value = abort |
| Return clause | Koka, OCaml (`retc`), Eff (`val`) | `return(x) -> expr` |
| One-shot continuations | OCaml 5 | `resume` can be called once |
| Handler chains with delegation | **Dvala-specific** | `nxt(eff, arg)` — not in Koka/OCaml/Eff |
| Context object | **Dvala-specific** | `{ arg, eff, nxt, resume }` |
| No exception clause | **Dvala-specific** | Errors are effects, not a separate mechanism |

### What Dvala intentionally omits

| Feature | Why omitted |
|---|---|
| Multi-shot resume | Dvala is one-shot by design — simpler semantics, no cloning |
| `finally`/`initially` clauses | Can be added later; current focus is core semantics |
| `mask`/`override` | Advanced composition — defer until needed |
| Named/scoped handlers | Complex dispatch — defer until needed |
| Shallow handlers | Deep handlers cover all use cases for now |
| `discontinue` (OCaml) | Dvala has no exceptions — errors are effects |

---

## Open Questions

- **Return clause syntax**: `return(x) -> expr` in the `with` clause, mixed with handlers? Or a separate keyword/position?
- **Shorthand abort**: Should there be a shorthand for abort? e.g., `@dvala.error(msg) => value` (fat arrow = abort)?
- **Breaking change strategy**: All existing full-form handlers need migration. Phased rollout?
- **`retry` handler**: Should it use abort on final failure, or keep re-performing `@dvala.error`?
- **Handler shorthand desugaring**: Currently the shorthand expands at parse time into a function with 3 params. Needs to change to context-object destructuring with `resume` call.

---

## Implementation Plan

1. **Make `resume` a callable that returns** — the continuation result (after return clause) flows back to the handler
2. **Flip default** — handler return value becomes abort (skip to after HandleWithFrame)
3. **Context object** — pass `{ arg, eff, nxt, resume }` as single argument to handler functions
4. **One-shot guard** — `resume` throws if called twice
5. **Return clause** — parse `return(x) -> expr` in handle block, apply on normal completion and inside resume
6. **Update handler shorthand desugaring** — `@effect(x) -> value` becomes `resume(value)` internally
7. **Update `fallback`** — just return the value (abort)
8. **Migrate all handlers** — tests, tutorials, examples, effectHandler module
9. **Add tests** — abort, resume-returns-value, return clause, state threading, one-shot guard, nxt delegation, fallback abort
10. **Update docs** — tutorials, skill docs, reference
