# Dvala Syntax Review — Friction Points & Improvement Plan

## Priority 1 — Correctness Hazard

### 1. Error on non-tail `recur`

**Problem:** `recur` in non-tail position silently produces wrong results.

```dvala
let sum = (n) -> if n == 0 then 0 else n + recur(n - 1) end;
sum(5) // => 0  (should be 15)
```

No error, no warning — just a wrong answer. The docs even show `n + recur(n - 1)` as an example.

**Fix:** Emit a compile-time error when `recur` appears in non-tail position (same approach as Clojure). Users should use `self` for non-tail recursion.

**Scope:** Parser/compiler change + doc update for `recur` examples.

---

## Priority 2 — Quick Doc/Consistency Fixes

### 2. Fix `where` vs `when` in `for` docs

**Problem:** The `for` doc mentions `where` as a keyword, but only `when` works at runtime. `where` throws "Undefined symbol".

**Fix:** Update the `for` documentation to use `when` consistently.

**Scope:** Doc-only change.

### 3. Clarify `self` vs `recur` in docs

**Problem:** Both enable recursion but with very different semantics. Names don't signal the distinction. A newcomer picks one arbitrarily and may hit issue #1.

- `self` = general recursion (works in any position, like calling the function by name)
- `recur` = tail-call optimized jump (only correct in tail position)

**Fix:** Add a prominent section in the docs explaining the difference, with a comparison table and guidance on when to use which. Consider whether `tailcall` would be a clearer name than `recur`.

**Scope:** Doc change, possibly a rename.

### 4. Document infix notation limitations

**Problem:** Infix (method-style) calls only work for 2-argument calls. `arr reduce (+, 0)` fails with a confusing parser error. Users discover this by trial and error.

```dvala
[1,2,3] map (-> $ * 2)       // works (2 args)
[1,2,3] reduce (+, 0)        // fails
reduce([1,2,3], +, 0)        // works (prefix)
[1,2,3] |> reduce(_, +, 0)   // works (pipe)
```

**Fix:** Document the 2-arg constraint clearly, with guidance to use `|>` + `_` placeholder for 3+ arg functions. Consider whether infix could accept a tuple RHS in the future.

**Scope:** Doc change. Optional future syntax extension.

---

## Priority 3 — Ergonomic Improvements

### 5. Add `assocIn` / `updateIn` for deep state updates

**Problem:** Updating nested immutable state requires painful nesting:

```dvala
assoc(assoc(assoc(state, "x", 10), "y", 20), "z", 30)
```

Shallow multi-key updates can use `merge`, but deep path updates (e.g., `state.nested.field`) have no ergonomic solution. This is the #1 pain point in the adventure game example.

**Fix:** Add Clojure-style helpers:
- `assocIn(obj, ["a", "b"], value)` — set at path
- `updateIn(obj, ["a", "b"], fn)` — apply function at path

**Scope:** New core functions + docs.

### 6. Shorter I/O for common effects

**Problem:** `perform(@dvala.io.print, "hello")` is 35 characters to print a string. This pattern dominates every example program, adding visual noise.

**Options to consider:**
- (a) A `print` convenience function that wraps the perform call
- (b) Syntactic sugar that desugars to perform
- (c) Accept the verbosity — it makes the effect system explicit

**Scope:** Depends on chosen approach. (a) is simplest.

### 7. `do...end` verbosity in lambdas

**Problem:** Multi-expression lambdas always need `do...end`:

```dvala
let f = (x) -> do
  let y = x * 2;
  y + 1
end;
```

Single-expression lambdas are elegant. The `do...end` wrapper adds noise for the common case of "a few lets then a return expression."

**Options to consider:**
- (a) Make `->` implicitly start a block until the enclosing delimiter
- (b) Accept current design — explicitness has value
- (c) Allow `let` inside `->` without `do...end` (just needing `;` separation)

**Scope:** Parser change. High risk of ambiguity — needs careful analysis.

### 8. `end` termination rules

**Problem:** Five different rules for when `end` is needed:

| Construct | Needs `end`? |
|-----------|-------------|
| `if/else if` chains | One `end` for the whole chain |
| `do...end` | Yes |
| `loop` | No (body is single expression) |
| `match` | Yes |
| `handle...with` | Yes |
| `for` | No |

This is non-obvious and the CLAUDE.md itself documents it as special notes.

**Fix:** Better error messages when `end` is misplaced. Possibly a formatter/linter. Long-term: consider whether `loop` and `for` should also use `end` for consistency.

**Scope:** Error message improvements (small). Syntax unification (large, breaking).

---

## Learnability Summary

| Audience | Time to productivity | Main hurdles |
|----------|---------------------|--------------|
| FP programmer (Haskell/Elixir/Clojure) | ~30 min | Just syntax mapping |
| JS/TS developer | ~2 hours | Immutability, `recur`/`self`, effects |
| Python developer | ~3 hours | Expression-based thinking, `end` rules |
| Beginner | Steep | Effects model is abstract, needs tutorials |

## What's Working Well

- **Infix/method-style chaining** — `arr map fn filter pred` reads beautifully
- **`$` shorthand lambdas** — concise for the common case
- **Pipe + `_` placeholder** — powerful composition mechanism
- **Pattern matching** — destructuring, rest, guards all present
- **`for` comprehensions** — `let`, `when`, `while` clauses are expressive
- **Template strings** — arbitrary expressions in `${}`
- **Familiar JS surface** — dot access, `[]` indexing, `//` comments lower barrier
