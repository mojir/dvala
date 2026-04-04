# Stateful Handlers

**Status:** Implemented (core feature; stdlib deferred to createState)
**Created:** 2026-03-30

## Goal

Enable state threading via algebraic effects — `@get`/`@set` — so that a handler can maintain evolving state across multiple effect invocations in the same computation.

---

## Background

### The problem with deep handlers

Dvala's current handler semantics are **deep**: when `resume` is called, the handler is automatically reinstalled around the continuation with its original closure. This is great for most patterns (logging, error recovery, nondeterminism) but breaks state threading.

```dvala
-- Attempt: parameterize handler on current state s
let run = (s) ->
  handler
    @get()     -> resume(s)
    @set(newVal) -> do with run(newVal); resume(null) end
  end
end;
run(0)(-> do perform(@set, 1); perform(@get) end)
-- Expected: 1
-- Actual:   0  ← wrong
```

**Why it fails:**

When `@set(1)` fires, we install `run(1)` around `resume(null)`. But `resume(null)` reinstalls the original `run(0)` _inside_ the continuation — closer to the `@get` effect than `run(1)`. The stack looks like:

```
[@get perform site, ..., AlgebraicHandle(run(0)), AlgebraicHandle(run(1)), outerK]
```

`run(0)` is inner and catches `@get` first, returning `0`.

This is the fundamental tension: **deep reinstallation resets the handler's closure on every resume**, making it impossible to accumulate state across resumes via closure variables.

---

## Proposal

### Option A — Shallow handlers (recommended)

Add an opt-in `shallow` modifier. A shallow handler handles **exactly one** effect occurrence and then is gone — the continuation runs without the handler reinstalled.

```dvala
-- State handler: works because run(newVal) is installed BEFORE resume,
-- and there is no competing reinstallation.
let run = (s) ->
  shallow handler
    @get()       -> resume(s)
    @set(newVal) -> do with run(newVal); resume(null) end
  end
end;
run(0)(-> do perform(@set, 1); perform(@get) end)
-- → 1 ✓
```

Execution trace:
1. `run(0)(body)` installs `shallow run(0)`, runs body
2. `@set(1)` fires → `do with run(1); resume(null) end`
   - installs `shallow run(1)` on the stack
   - calls `resume(null)` — shallow, so `run(0)` is **not** reinstalled
   - stack: `[@get site, ..., AlgebraicHandle(shallow run(1)), outerK]`
3. `@get` fires → caught by `run(1)` → `resume(1)` → returns `1` ✓

**User-facing syntax:** just add `shallow` before `handler`:

```dvala
shallow handler
  @choose(options) -> resume(first(options))   -- one-shot, no reinstall
end
```

**Deep handlers stay the default.** `handler ... end` is unchanged. `shallow handler ... end` is opt-in.

#### Other patterns shallow handlers unlock

**Iterators / generators:**

```dvala
-- Yield values lazily, process one at a time
let take = (n, gen) ->
  loop (remaining = n, acc = []) ->
    if remaining == 0 then acc
    else
      shallow handler
        @yield(v) -> recur(remaining - 1, append(acc, v))
        transform _ -> acc
      end(gen)
    end
  end
end
```

**Probabilistic search with early exit:**

```dvala
-- Find first solution without exploring all branches
let findFirst = (body) ->
  shallow handler
    @choose(options) ->
      loop (i = 0) ->
        if i >= count(options) then null
        else
          let result = resume(nth(options, i));
          if result != null then result else recur(i + 1) end
        end
      end
  end(body)
end
```

**Trampoline/step-wise execution:**

```dvala
-- Run a computation one step at a time
shallow handler
  @step() -> { done: false, continue: resume }
  transform result -> { done: true, value: result }
end
```

---

### Option B — Parameterized handlers

Extend handler syntax to declare a state variable that can be updated when calling `resume`:

```dvala
handler[s = 0]
  @get()       -> resume(s, s)      -- resume(value, newState)
  @set(newVal) -> resume(null, newVal)
  transform result -> result
end
```

`resume(value, newState)` passes `value` to the `perform` site and reinstalls the handler with `newState` instead of the original `s`.

#### Comparison

| | Shallow handlers | Parameterized handlers |
|---|---|---|
| Existing code | Unchanged | Unchanged |
| New syntax | `shallow handler` keyword | `handler[s = init]`, `resume(v, newS)` |
| State threading | Natural via closure | Explicit state param |
| Iterators | Yes | Awkward |
| Early termination | Yes | No (reinstall still happens) |
| Principled model | Yes — well-studied (Eff, Koka, Frank) | Ad-hoc extension |
| Implementation complexity | Medium (new frame type, no reinstall path) | Low (intercept reinstall, swap state) |

---

## Recommendation

**Option A — shallow handlers.**

Shallow handlers are the principled solution studied in the algebraic effects literature (Eff, Koka, Frank all have them). They unlock a whole class of patterns — not just state, but iterators, step-wise execution, and early-termination search. Parameterized handlers solve only the state case and introduce an awkward two-argument `resume` that only makes sense for stateful handlers.

Adding `shallow` as an opt-in keyword is a minimal, non-breaking change. Existing code is unaffected. The implementation adds a flag on the handler frame to skip reinstallation.

---

## Open Questions

- Should `shallow handler` allow `resume` to be called more than once (multi-shot shallow)? In standard shallow semantics, `resume` is one-shot — multi-shot shallow would require copying the continuation.
- Should `shallow handler` support `transform`? If `resume` is never called (abort), `transform` is naturally skipped. If called, the continuation result flows directly — no handler wrap. Transform would apply only to the direct-call path (`h(-> body)`).
- Syntax alternatives: `handler once ... end`, `handler! ... end`, `shallow handler ... end`. The `shallow` keyword reads most clearly.
- Interaction with `do with h;` statement: `with (shallow h);` installs a shallow handler for the rest of the block — after the first matching effect, the handler is consumed.

## Implementation Plan

1. ~~Add `shallow: boolean` flag to `AlgebraicHandleFrame`~~ ✅
2. ~~In the `Resume` case, skip reinstallation when `shallow === true`~~ ✅
3. ~~Parser: recognize `shallow` before `handler` keyword, set flag on the `Handler` AST node~~ ✅
4. ~~Evaluator: when installing a handler from a `shallow handler` value, set `shallow: true` on the frame~~ ✅
5. Tests: expand coverage — iterator, early-termination, nested shallow+deep, `do with` syntax ← **in progress**
6. ~~Stdlib: add `withState` to `effectHandler` module~~ → Deferred to `createState` primitive (see [parameterized effects design](2026-04-04_parameterized-effects-createState.md))
