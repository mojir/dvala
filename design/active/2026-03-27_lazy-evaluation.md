# Lazy Evaluation with Handler-Controlled Effect Semantics

**Status:** Draft
**Created:** 2026-03-27

## Goal

Introduce lazy-by-default evaluation to Dvala, where **handlers control when effects execute** — not the call site. This combines lazy evaluation with algebraic effects in a way no production language has done, while staying principled: effects are descriptions of what to do, handlers are interpreters that decide when and how.

---

## Background

### The landscape

- **Haskell**: lazy-by-default, but no algebraic effects (uses monads to sequence effects)
- **Koka/Eff/OCaml 5**: algebraic effects, but eager evaluation
- **Nobody**: lazy-by-default + algebraic effects + serializable continuations

The two communities (lazy FP and algebraic effects) didn't overlap. Dvala can bridge them.

### Why laziness?

Eager Dvala evaluates everything whether needed or not:

```dvala
let users = perform(@fetch, "/users");
let posts = perform(@fetch, "/posts");
if onlyNeedUsers then users else merge(users, posts)
```

Both fetches fire, even if `onlyNeedUsers` is true. The programmer must manually guard:

```dvala
let users = perform(@fetch, "/users");
if onlyNeedUsers then users else
  let posts = perform(@fetch, "/posts");
  merge(users, posts)
end
```

With lazy evaluation, the first version just works — `posts` is only forced if needed.

### Why handler-controlled?

Lazy effects create an ordering problem:

```dvala
let a = perform(@debit, 100);
let b = perform(@credit, 100);
if condition then a else b
```

With naive lazy evaluation, only one side fires. For financial operations, that's catastrophic — both must happen.

But the call site can't know whether an effect is **obligatory** (must happen) or a **resource** (use if needed). Only the handler knows, because the handler defines the effect's semantics.

This leads to the core insight: **the handler should decide whether its effects are forced eagerly or stay lazy.** This is a natural extension of algebraic effects — the performer says "I need X", the handler controls everything else, including *when*.

### Why eager-by-default for effects

An earlier draft of this design proposed lazy-by-default for everything, including effects. Analysis of failure modes showed this is unsafe:

- Forgetting `eager` on an obligatory effect (logging, state mutation, financial operations) produces **silent bugs** — the effect simply doesn't fire, with no error or warning
- Effect ordering becomes consumer-dependent, which is correct for resource-like effects but catastrophic for stateful ones
- The programmer must remember to annotate every obligatory handler, and forgetting is the common case

Flipping the default solves this: effects are eager (safe, predictable, matches current Dvala behavior) unless the handler explicitly opts into laziness. The handler author must actively choose `lazy`, which means they've considered whether their effects are safe to defer.

---

## Proposal

### Lazy-by-default evaluation (for pure expressions)

Pure expressions are lazy — nothing evaluates until forced:

- `let` bindings store thunks (AST + environment)
- Function arguments are passed as thunks (call-by-need)
- Collection elements stay lazy until accessed
- Once forced, the result is memoized — always (call-by-need). One `perform` used in three places = one effect fired. Two separate `perform` calls = two thunks = two effects. This is consistent: a binding is a value, not a re-evaluation.

### What forces evaluation

- Pattern matching / conditionals (must inspect the value)
- Arithmetic and comparison operators (need concrete values)
- Host boundary (`dvala.run()` returns a concrete value)
- `perform` on an eager handler (default) — see below

### Handler-controlled effect semantics

Effects are **eager by default** — `perform` forces immediately, just like current Dvala. Handlers opt into laziness with the `lazy` keyword:

```dvala
// Default — eager, works like today
handle
  let a = perform(@debit, 100);   // forced immediately (default)
  let b = perform(@credit, 100);  // forced immediately
  if condition then a else b      // both already happened, safe
with
  @debit(amount) -> ...
  @credit(amount) -> ...
end

// Opt-in lazy — handler explicitly says "my effects are safe to defer"
handle
  let users = perform(@fetch, "/users");   // thunk — not yet
  let posts = perform(@fetch, "/posts");   // thunk — not yet
  if onlyNeedUsers then users              // only /users fires
  else merge(users, posts)                 // both fire
  end
with
  lazy                                     // explicit opt-in
  @fetch(url) -> httpGet(url)
end
```

### The `lazy` keyword

Handlers can declare `lazy` to defer their effects until the value is needed:

- No `lazy` (default) — `perform` forces immediately at the call site. The `let` binding gets a value, not a thunk. **This preserves current Dvala behavior.**
- `lazy` — `perform` creates a thunk. The effect fires when the value is forced.

This could also be per-effect:

```dvala
handle
  ...
with
  @debit(amount) -> ...            // eager (default) — forces immediately
  lazy @fetch(url) -> httpGet(url) // lazy — deferred until needed
end
```

### `lazy` expression

For cases where the programmer wants to defer evaluation regardless of handler:

```dvala
let a = lazy perform(@fetch, "/users");
```

This is an escape hatch at the call site. Ideally rare — if you need it often, the handler should be `lazy`.

### How forcing works

Laziness is only about *when* evaluation starts, not *how* it proceeds. A thunk is created when an expression is in a non-forcing context (e.g. `let x = ...`). When forced, the expression evaluates **normally — eagerly — until it produces a value**. This is standard call-by-need.

This means nested handlers and `nxt` forwarding work without special rules:

```dvala
handle
  handle
    let x = perform(@fetch, "/data");   // lazy handler → thunk
    process(x)                          // forces x
  with
    @fetch(url) ->                      // inner handler runs
      if cached(url) then getCached(url)
      else nxt(@fetch, url)             // forwards to outer handler
      end
  end
with
  lazy                                  // also lazy, but we're already
  @fetch(url) -> httpGet(url)           // inside a force — runs normally
end
```

The sequence when `process(x)` forces `x`:

1. Thunk evaluates → hits inner handler for `@fetch`
2. Inner handler checks cache → miss → calls `nxt(@fetch, url)`
3. Outer handler runs `httpGet(url)` → returns value
4. Value flows back through inner handler → back to `process(x)`

No thunks-inside-thunks. Once a force starts, evaluation proceeds eagerly until a value is produced. The default (eager) handler simply never creates a thunk — `perform` forces at the call site. The `lazy` keyword on a handler changes this: `perform` creates a thunk, which evaluates eagerly when eventually forced.

### Interaction with serializable continuations

A lazy thunk is just **AST + lexical environment** — both already serializable in Dvala. Serializing a suspended computation with unforced thunks is no different from serializing any other frame. The thunks serialize as frozen frames, waiting to be forced after deserialization.

This means you could:
1. Define a computation with lazy effects
2. Partially evaluate it (some effects fire, some don't)
3. Serialize the state (forced values + remaining thunks)
4. Ship it elsewhere
5. Resume with different handlers — different effects fire differently

### Interaction with persistent data structures

Lazy values compose naturally with persistent collections. A lazy list is a persistent structure where the tail is a thunk:

```dvala
let fibs = lazy_cons(0, lazy_cons(1, zipWith(+, fibs, tail(fibs))));
take(10, fibs)  // only forces 10 elements
```

With HAMTs, structural sharing means forcing one element doesn't copy the rest.

---

## Examples

### Demand-driven effects

```dvala
handle
  let config = perform(@readFile, "config.json");
  let defaults = perform(@readFile, "defaults.json");
  merge(defaults, config)    // both forced, defaults first
with
  lazy                       // opt-in: file reads are safe to defer
  @readFile(path) -> parseJson(readFile(path))
end
```

If we change the body:

```dvala
  if fileExists("config.json") then config else defaults
```

Only one file is read — whichever is needed.

### Inspectable computations (dry run)

```dvala
handle
  let users = perform(@fetch, "/users");
  let posts = perform(@fetch, "/posts");
  merge(users, posts)
with
  lazy
  // Dry run — collect effects without executing them
  ({ eff, arg }) -> { effect: eff, arg: arg }
end
```

### Batching

```dvala
handle
  let a = perform(@query, "SELECT * FROM users");
  let b = perform(@query, "SELECT * FROM posts");
  join(a, b)  // forces both — handler sees both queries, can batch
with
  lazy
  // handler collects queries and executes as batch
  ...
end
```

### Infinite structures

```dvala
let nats = iterate((n) -> n + 1, 0);
take(5, nats)                    // [0, 1, 2, 3, 4]
take(3, filter(even?, nats))     // [0, 2, 4]
```

---

## Open Questions

- ~~**Memoization**~~: **Decided — always memoize.** Call-by-need: a thunk evaluates once, result is cached. One `perform` referenced three times = one effect. Two separate `perform` calls = two thunks = two effects. Consistent with "a binding is a value."
- **Debugging**: A value could be a thunk or a forced result — hard to tell at a glance. The playground could show thunk state visually (unfired vs forced vs error). Stepping through lazy code is non-linear — execution jumps to wherever forcing happens, not where the code was written. A "force graph" (which thunk forced which) could help. Haskell devs lean heavily on profiling tools for this — Dvala would need something equivalent.

- **Performance**: `let x = 1 + 2` creates a thunk for a trivial computation. The thunk allocation + later force overhead exceeds just computing `3`. Possible fixes: (a) literals and primitive ops are always strict (no thunk for `1 + 2`, `"hello"`, `true`), (b) compiler inlines trivial expressions, (c) accept the overhead — thunks are cheap, only matters in tight loops. Option (a) is simple and covers the common case.

- ~~**`do` blocks**~~: **Decided — no special treatment.** `do` is just a scope, laziness flows through naturally. The block's value is its last expression; when that's forced, it forces whatever it depends on. Effects inside `do` are eager by default anyway, so sequencing is preserved for effectful code. No need for `do` to be an "eager zone" — that would create confusing asymmetry (`let x = f()` is lazy, but `do let x = f() end` is eager?).

- **Per-effect vs per-handler `lazy`**: Per-handler (`lazy` on the whole handler) is simpler — one keyword, all effects deferred. Per-effect (`lazy @fetch(url) -> ...`) is more granular — a handler could have some eager and some lazy effects. The question is whether mixed eager/lazy handlers are a real use case or theoretical. Start with per-handler, add per-effect later if needed.

- **Existing code**: Effects are eager by default, so effectful code is safe — no behavior change. The risk is pure code that depends on evaluation order for performance. Example: `let big = buildExpensiveThing(); let small = if condition then big else cheap()` — today `big` is always built, with laziness it's only built if `condition` is true. That's usually a *win*, but code that relied on eager allocation for predictable memory patterns might behave differently. Needs an audit of existing tests, but the blast radius should be small.
- **Space leaks**: Lazy evaluation builds thunk chains that hold memory until forced. Classic example: `foldl((acc, x) -> acc + x, 0, range(1000000))` creates a million nested thunks instead of computing incrementally. Dvala's trampoline handles stack depth, but memory is the concern. Possible mitigations: (1) strict builtins for reductions (`foldl`, `reduce`, `sum` force accumulator at each step), (2) compiler strictness analysis (detect thunks that will definitely be forced), (3) thunk depth limit (pragmatic but unprincipled), (4) just document it (Haskell survived 30 years this way). Option 1 is likely sufficient — needs investigation.

---

## Implementation Plan

1. **Design validation**: Write concrete examples that stress the lazy + effects interaction. Identify any fundamental unsoundness.
2. **Thunk representation**: Define thunk as `{ ast: ASTNode, env: Environment, forced: boolean, value?: any }` — fits existing serialization model.
3. **Evaluator changes**: Modify trampoline evaluator to return thunks instead of evaluating eagerly. Add force points.
4. **Handler `lazy` keyword**: Parser + evaluator support for lazy handlers.
5. **Memoization**: Implement thunk caching.
6. **Persistent data structures** (dependency): Lazy collections benefit from structural sharing.
7. **Playground tooling**: Thunk visualization — show what's forced, what's pending.
8. **Migration**: Audit existing tests and examples for semantic changes.
