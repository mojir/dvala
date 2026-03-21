# Effect Handler Chaining — From Dispatch to Middleware

## Status: Discussion / Exploration

## Context

Dvala's host handler chain currently works as **dispatch** — find the first handler that doesn't call `next()`, and let it settle the effect. This came out of a broader discussion about algebraic effects, monads, and what properties Dvala actually exploits.

## Current Behavior

When a host handler calls `next()`:
- It sets `outcome = { kind: 'next' }` and exits
- The next matching handler gets the **same** `EffectContext` (same args, same effectName)
- The handler that called `next()` never sees the result

This means:
1. **No inbound transformation** — a handler can't modify `args` or `effectName` before passing to the next handler
2. **No outbound transformation** — a handler can't observe or wrap the resume value chosen by a downstream handler

The chain is linear dispatch, not a wrapping middleware stack.

## Two Gaps Identified

### Gap 1: Transform args before forwarding

A handler might want to enrich, validate, or rewrite the effect before the next handler sees it:

```typescript
// Hypothetical: logging middleware that annotates args
{
  pattern: 'db.*',
  handler: (ctx) => {
    ctx.next({ args: [...ctx.args, { timestamp: Date.now() }] })
  }
}
```

### Gap 2: Transform the resume value on the way back

A handler might want to wrap, cache, or validate what a downstream handler decided:

```typescript
// Hypothetical: caching middleware
{
  pattern: 'db.query',
  handler: async (ctx) => {
    const cached = cache.get(ctx.args[0])
    if (cached) {
      ctx.resume(cached)
    } else {
      const result = await ctx.next()  // get downstream's answer
      cache.set(ctx.args[0], result)
      ctx.resume(result)               // pass it back up, transformed
    }
  }
}
```

## What True Middleware Would Look Like

In Express/Koa style, each handler wraps the next:

```
Handler A  →  Handler B  →  Handler C  →  Standard handler
   ↓              ↓              ↓
transform    transform      settle
  args         args         (resume)
   ↓              ↓              ↑
  get            get          value
 result        result           ↑
   ↓              ↓
transform    transform
 result       result
   ↓
 final
 resume
```

Each layer can:
- Modify what goes **down** (args, effectName)
- Observe and modify what comes **back up** (resume value)
- Short-circuit at any point (resume/fail/suspend directly)

## Assessment: Inbound Yes, Outbound No

### Inbound transformation — clear win

`next({ args, effectName })` is simple to implement, the semantics are obvious, and the use cases are real: enrichment, normalization, logging context injection. Low risk, high value.

### Outbound transformation — rejected for host handlers

The fundamental problem is **suspension**. If handler A calls `const result = await ctx.next()` and handler B downstream calls `ctx.suspend()`, handler A's JavaScript closure (local variables, cache references, partially-built state) is lost. Dvala snapshots capture the continuation stack, not arbitrary JS closures. The options are all bad:

- **Lose middleware state on suspend/resume** — broken semantics
- **Forbid suspension when middleware is on the stack** — surprising restriction that undermines Dvala's core capability
- **Serialize JS closures** — not feasible

This is where Dvala differs fundamentally from Express/Koa. HTTP middleware completes in one shot. Dvala effects can suspend indefinitely and resume later, possibly in a different process.

The caching example from Gap 2 looks compelling but doesn't actually require outbound wrapping:

```typescript
{
  pattern: 'db.query',
  handler: (ctx) => {
    const cached = cache.get(ctx.args[0])
    if (cached) ctx.resume(cached)
    else ctx.next()  // let the real handler do it, cache on the Dvala side
  }
}
```

The cache-write can happen via a separate effect or in Dvala code.

### Where composition belongs: in-language `do...with`

If we want richer composition (wrapping, transforming results, re-performing effects), the natural place is in-language handlers. The Dvala evaluator already manages the continuation stack, so handler composition at that level doesn't have the serialization problem — everything lives in the continuation stack that snapshots capture cleanly.

**Recommendation:** invest the composition story in making `do...with` more expressive, not in making host handlers more complex.

### Summary

| Capability | Host handlers | In-language `do...with` |
|---|---|---|
| Inbound transformation | **Yes — implement** | N/A (handler sees original args) |
| Outbound transformation | **No — suspension kills it** | **Yes — natural fit** |
| Short-circuit (resume/fail) | Already works | Already works |
| Dispatch / pattern matching | Already works | Case matching already works |

Each layer plays to its strengths: host handlers for dispatch and integration, in-language handlers for composition and transformation.

## Open Questions

1. **What `do...with` improvements would enable the composition patterns we want?** Candidates:
   - Handler access to a `resume-with` that takes a value (currently implicit via return value)
   - Ability to re-perform effects from within a handler and use the result before resuming
   - Handler chaining / delegation within `do...with`

2. **Exact API for inbound transformation** — should `next()` accept `{ args }`, `{ args, effectName }`, or a full context override?

3. **Should `next()` with no args remain as-is** (pass through unchanged) for backwards compatibility?

## Other Algebraic Effect Properties

Survey of AF properties beyond multi-shot continuations (which Dvala has intentionally opted out of):

### Shallow vs Deep handlers

Dvala's `do...with` is **deep** — the handler stays installed for the entire block. **Shallow** handlers handle one occurrence, then must be explicitly re-installed. This enables stateful evolution across performs. Powerful but niche — most use cases are covered by threading state through effect arguments.

### First-class handlers

Currently handlers exist only as syntax inside `do...with`. If handlers were **values** (passable, composable, selectable at runtime), it would enable handler libraries and runtime handler selection. This is the in-language equivalent of what host handlers already get via the registration array. **Worth exploring.**

### Parameterized / named handler instances — NOT A GAP

In theory, you need handler instances when two independent uses of the same effect (e.g., two state cells both using `@state.get`) must be distinguished. But Dvala handles this through two existing mechanisms:

1. **Arguments**: `perform(@state.get, "a")` vs `perform(@state.get, "b")` — the handler dispatches on the argument
2. **Reverse domain naming**: third-party effects use reverse DNS convention (e.g., `@com.myorg.state.get`), giving guaranteed global uniqueness. `dvala.*` is reserved for built-ins. Host handlers can use `@com.myorg.*` wildcards to catch everything from an org.

These combine to solve the identity problem that parameterized handlers solve in systems like Eff or Multicore OCaml. The naming convention handles what other systems need runtime handler identity for.

### Tail-resumptive optimization

When a handler just transforms and resumes (`case @foo then ([x]) -> x + 1`), the continuation doesn't need to be captured. This is a **performance** concern, not semantic — but matters for high-frequency effects (logging, tracing, state reads).

### Effect tunneling / masking

No way to say "this block uses `@log` internally but outer scopes should never see it." Effects always propagate if unhandled. Matters for **abstraction boundaries** — library functions that use effects internally shouldn't force callers to handle them.

### Priority assessment

| Property | Status | Impact |
|---|---|---|
| Multi-shot continuations | Opted out (intentional) | — |
| First-class handlers | Not implemented | **High** — composability |
| Shallow handlers | Not implemented | Medium — niche but powerful |
| Parameterized instances | Not needed (args + naming) | — |
| Tail-resumptive optimization | Not implemented | Medium — performance |
| Effect tunneling | Not implemented | Medium — abstraction |

## First-Class Handlers — Design Evolution

### Unified signature: `perform` and `next`

**Key decision:** `perform` and `next` have the exact same signature — one effect, one payload:

```
perform(@effect, payload)
next(@effect, payload)
```

- No variadic args, no arrays, no spread
- If an effect needs multiple values, the user structures them (object or array)
- `next` is just "perform, but to the next handler in the chain"
- `next` returns the downstream resume value (outbound transformation)

This unifies the whole system:

| | Signature | Returns |
|---|---|---|
| `perform` | `(effect, payload)` | Resume value from handler |
| `next` | `(effect, payload)` | Resume value from downstream |

```
;; Single value payload
perform(@log, "hello")

;; Structured payload when multiple values needed
perform(@db.put, { key: "k", value: "v" })

;; No payload
perform(@dvala.random, null)
```

### Handlers as functions

A handler is just a function with the signature `(eff, arg, next) -> value`:

- **Return value** = resume value (no `resume()` callback needed — simpler, no double-call bugs)
- **`next(eff, arg)`** = pass to next handler, returns downstream's resume value — same signature as `perform`
- **`next` returning a value** enables outbound transformation (middleware pattern) — safe in-language because handler state lives on the Dvala continuation stack, not in JS closures

```
let log-all-effects = (eff, arg, next) ->
  println("[EFFECT] " ++ effect-name(eff) ++ " " ++ str(arg))
  let result = next(eff, arg)
  println("[RESULT] " ++ effect-name(eff) ++ " -> " ++ str(result))
  result

let logging = (eff, arg, next) ->
  if eff == @log then println(arg)
  else next(eff, arg)
  end

let db = (eff, arg, next) ->
  if eff == @db.get then lookup(arg)
  else next(eff, arg)
  end
```

### Composition patterns

**Wrapping (higher-order handler):**
```
let with-retry = (inner) -> (eff, arg, next) ->
  if eff == @db.get then
    let result = inner(eff, arg, next)
    if result == null then inner(eff, arg, next)
    else result
    end
  else inner(eff, arg, next)
  end
```

**Test mocking:**
```
let mock-db = (eff, arg, next) ->
  if eff == @db.get then "mock-value"
  else next(eff, arg)
  end

;; Production
handle app() with [production-handlers] end

;; Test — mock-db intercepts @db.get, rest falls through
handle app() with [mock-db, production-handlers] end
```

### Syntax Proposal A: `handle...with...end`

Replaces `do...with...end` for effect handling. `do...end` reverts to being purely a sequencing block.

| Keyword | Purpose |
|---|---|
| `do...end` | Sequencing block |
| `handle...with...end` | Effect handling scope |

**Basic usage:**
```
handle
  perform(@log, "hello")
  perform(@db.get, "key")
with [logging, db]
end
```

**Mixing external and inline handlers:**
```
handle
  perform(@log, "hello")
  perform(@db.get, "key")
with
  [log-all-effects,
   (eff, arg, next) ->
     if eff == @db.get then lookup(arg)
     else next(eff, arg)
     end]
end
```

**Nesting:**
```
handle
  handle
    perform(@log, "hello")
    perform(@db.get, "key")
  with [db]
  end
with [log-all-effects]
end
```

**Inline `case` syntax as sugar (optional):** The old `case @effect then` form could remain as syntactic sugar for anonymous handler functions, but this needs further discussion.

### Syntax Proposal B: Effect pipe operator

An alternative using a pipe-like operator to avoid the block syntax entirely.

**Operator:** `||>` — the **effect pipe** (other candidates considered and rejected: `@>`, `!>`, `~>`)

**Basic usage:**
```
app() ||> log-all ||> auth ||> db
```

**With inline expression:**
```
let data = perform(@db.get, "key") ||> db-handler
```

**With block on the left:**
```
let result = do
  perform(@log, "starting")
  perform(@db.get, "key")
end ||> log-all ||> logging ||> db
```

**Chaining = nesting:** each `||>` wraps the expression to its left in a handler scope. So `expr ||> h1 ||> h2` means h2 is the outermost handler — effects hit h1 first, then h1's `next()` reaches h2.

**Advantages over Proposal A (`handle...with...end`):**
- No block syntax needed for single-expression cases
- Composes naturally — just keep piping
- Handlers are visually ordered left-to-right (innermost first)
- Lighter syntax for the common case

**Disadvantages:**
- Multi-line computations still need `do...end` on the left side
- Operator choice is bikesheddable
- Less familiar — `handle...with...end` reads more like natural language

**Associativity:** `||>` is **left-associative**. `expr ||> h1 ||> h2` parses as `(expr ||> h1) ||> h2` — each `||>` wraps the expression to its left in a handler scope. Right-associativity was considered (`h1 ||> h2` as handler composition) but rejected — since handlers are just functions, the operator can't distinguish "expression to handle" from "handler to compose" without a distinct Handler type.

**Open:** Could both proposals coexist? `handle...with...end` for multi-handler blocks, `||>` for lightweight chaining? Or pick one.

### Handler shorthand syntax (deferred)

The effect pipe / `handle...with` requires functions conforming to `(eff, arg, next) -> value`. Writing full lambda handlers inline is verbose, so a shorthand is proposed but **deferred until needed**:

**`->` terminal handler**: matches one effect, return value is the resume value, non-matches call `next(eff, arg)` implicitly.

```
@effect(arg) -> body
```

Desugars to:
```
(eff, arg, next) ->
  if eff == @effect then body
  else next(eff, arg)
  end
```

**`=>` passthrough handler (deferred)**: observe-and-propagate. Also deferred — when users write the verbose passthrough pattern enough, add it.

**Single payload** — mirrors `perform`. `perform(@log, "hello")` is handled by `@log(msg) -> println(msg)`.

**Wildcards supported:**
```
@dvala.io.*(arg) -> null            ;; silence all io (terminal)
@*(arg) -> println(str(arg))        ;; catch everything
```

**Design principle:** the shorthand covers the common terminal case. For anything more complex (middleware, `next`, conditional handling), use the full function form `(eff, arg, next) -> ...`.

### List form: `||> [a, b]` is sugar for `||> a ||> b`

The effect pipe accepts either a single handler function or a list of handlers. The list form desugars to chained pipes:

```
app() ||> [a, b, c]
;; is equivalent to
app() ||> a ||> b ||> c
```

This means each handler in the list creates a nested scope. This matters when a handler itself performs effects:

```
let a = (eff, arg, next) ->
  if eff == @db.get then
    perform(@log, "db access: " ++ arg)   ;; a performs an effect
    lookup(arg)
  else next(eff, arg)
  end

let b = (eff, arg, next) ->
  if eff == @log then println(arg)
  else next(eff, arg)
  end

;; Both are equivalent — b wraps a, so b catches a's @log perform
app() ||> [a, b]
app() ||> a ||> b
```

The alternative would be treating the list as peers in a single scope, where `a`'s own performs would bypass `b` entirely. This was rejected — it's subtle and surprising. A user expects `[a, b]` to mean the same as `a ||> b`.

**Dynamic handler lists** work naturally with this rule:
```
let handlers = if test-mode
  then [mock-db, mock-auth]
  else [real-db, real-auth]
  end

app() ||> handlers
```

This expands into nested scopes, same as manual chaining.

## Comparison: Existing vs Proposal A vs Proposal B

### Side-by-side examples

**Simple effect handling:**
```
;; Existing (do...with...end)
do
  perform(@log, "hello")
  perform(@db.get, "key")
with
  case @log then ([msg]) -> println(msg)
  case @db.get then ([k]) -> lookup(k)
end

;; Proposal A (handle...with...end)
handle
  perform(@log, "hello")
  perform(@db.get, "key")
with [logging, db]
end

;; Proposal B (effect pipe)
do
  perform(@log, "hello")
  perform(@db.get, "key")
end ||> logging ||> db
```

**Inline handler for a single effect:**
```
;; Existing
do perform(@db.get, "key") with case @db.get then ([k]) -> lookup(k) end

;; Proposal A
handle perform(@db.get, "key") with [db] end

;; Proposal B
perform(@db.get, "key") ||> @db.get(k) -> lookup(k)
```

**Observe-and-propagate (middleware):**
```
;; Existing — not possible without re-performing
;; (and re-perform can't capture downstream's result)

;; Proposal A
handle app() with [log-all-effects, logging, db] end

;; Proposal B
app() ||> @*(args) => println(str(args)) ||> logging ||> db
```

**Composing handlers from different sources:**
```
;; Existing — not possible, handlers are syntax not values

;; Proposal A
handle app() with [mock-db, production-handlers] end

;; Proposal B
app() ||> mock-db ||> production-handlers
```

### Feature comparison

| Feature | Existing `do...with` | Proposal A `handle...with` | Proposal B `||>` |
|---|---|---|---|
| Handlers are first-class values | No — syntax only | Yes — functions | Yes — functions |
| Handler composition | Not possible | List concatenation | Chaining |
| Outbound transformation (wrap `next()` result) | Not possible | Yes — `next()` returns value | Yes — `next()` returns value |
| Observe-and-propagate | Awkward (re-perform) | Yes — `=>` passthrough or full form | Yes — `=>` shorthand |
| Inline handler ergonomics | Good — `case` syntax is clean | Verbose — full lambda in list | Good — `@effect(args) ->` shorthand |
| Multi-line computation | Natural — block body | Natural — block body | Needs `do...end` on left side |
| Multiple handlers | Single block, multiple cases | Single list | Chain of `||>` |
| Nesting handlers | Nest `do...with` blocks | Nest `handle` blocks | Chain reads left-to-right |
| Passing handlers to functions | Not possible | Pass list | Pass function |
| Test mocking | Not possible | Swap list entries | Swap pipe entries |
| Learning curve | Low — familiar block syntax | Medium — handler function contract | Medium — new operator + shorthand |
| New syntax required | None (exists today) | `handle` keyword replaces `do...with` | `||>` operator, `@effect() ->` / `=>` shorthand |

### Honest assessment

**Existing `do...with`** works well for simple, local effect handling with known effects. Its main limitation is that handlers aren't values — you can't compose, pass, or reuse them. The `case` syntax is ergonomic for inline use but doesn't scale to composition patterns.

**Proposal A (`handle...with`)** is the most conservative upgrade. It makes handlers first-class (functions in a list) and enables all the composition patterns. The syntax is familiar and readable. The downside is that inline handlers become more verbose — you lose the clean `case` syntax unless you keep it as sugar.

**Proposal B (`||>`)** is the most expressive for chaining. Single-effect handlers are concise with the shorthand syntax. The pipe reads naturally left-to-right. The downside is it requires `do...end` for multi-line computations and introduces a new operator.

**The proposals are not mutually exclusive.** `handle...with...end` could serve as the block form (multiple handlers, multi-line body), while `||>` serves as the expression form (lightweight chaining). Both use the same handler function contract `(eff, arg, next) -> value`.

## Relationship to Algebraic Effects Theory

This discussion originated from examining whether Dvala fully exploits algebraic effect properties:

- **Dvala's effects are one-shot** — handlers settle once. Multi-shot is intentionally not supported.
- **Handlers don't receive first-class continuations** — `resume` is a callback, not a reified continuation the handler can store/invoke multiple times.
- **The current chain is dispatch, not composition** — true algebraic effect handlers compose by wrapping continuations. Dvala's host handlers compose by linear fallthrough.

The assessment is that host handlers should stay as dispatch (with inbound transformation added), while the composition story should be built out at the `do...with` level where it aligns with how algebraic effects actually work — through continuation manipulation managed by the evaluator.

## Do Monads Have a Place in Dvala?

**No.** Monads and algebraic effects are two answers to the same question: how to sequence computations with context (failure, state, side effects, async) in a pure functional language. Dvala picked effects.

| Monad | Purpose | Dvala equivalent |
|---|---|---|
| IO | Side effects | `perform(@dvala.io.*)` |
| Maybe/Option | Nullable chaining | `?.` operator or short-circuit pattern |
| Either/Result | Error propagation | `perform(@dvala.error, msg)` |
| State | Mutable state | Effects with state handlers |
| Async/Promise | Async sequencing | Async effects + `@dvala.sleep` |
| Reader | Dependency injection | Effect handlers (exactly what `||>` does) |

Additionally, monads shine in typed languages where the compiler enforces the contract (`Maybe<User>` in the type tells you the computation can fail). Dvala has no type system — the formal monad structure (typeclass, laws) can't be enforced, so you'd get the ceremony without the safety guarantees.

Specific patterns that happen to be monadic — like optional chaining — are better implemented as targeted features than as a general monad abstraction. Adding monads would be a second mechanism for problems effects already solve.

## Conclusions

### What Dvala gets right today
- Effects are first-class values (`@name` syntax)
- Clean separation of operation (perform) from interpretation (handler)
- Host handler middleware with pattern matching and `next()`
- Serializable continuations (snapshots) for time-travel and suspension
- One-shot semantics — intentional simplicity, not a limitation

### What should change

**Host handlers:** add inbound transformation (`next({ args })`) but not outbound. JS closures can't survive suspension, so host handlers should stay as dispatch. Composition belongs in-language.

**In-language handlers:** the big upgrade. Replace `do...with...end` with:
- **Handlers as functions** with contract `(eff, arg, next) -> value`
- **Unified signature**: `perform(eff, payload)` and `next(eff, payload)` have the same shape — one effect, one payload. No variadic args.
- **`next(eff, arg)` returns downstream's resume value** — enables middleware/wrapping patterns, safe because handler state lives on the Dvala continuation stack
- **Effect pipe `||>`** as the primary syntax for applying handlers
- **Shorthand `@effect(args) ->`** (terminal) and **`@effect(args) =>`** (passthrough) for concise inline handlers
- **`||>` accepts lists** — `||> [a, b]` desugars to `||> a ||> b`

**`handle...with...end`** is not needed if `||>` supports lists for the dynamic handler case.

**Monads** are not needed — effects cover the same ground with better composability and no transformer stacking.

### Language surface vs library code

The handler function contract `(eff, arg, next) -> value` is expressive enough that many "features" are just handler functions in modules rather than language keywords:

```
;; effect-utils module could provide:
let { pure-handler } = import("effect-utils")   ;; blocks all effects
let { log-all } = import("effect-utils")         ;; observe-and-propagate
let { silence } = import("effect-utils")         ;; swallow all effects
let { mock } = import("effect-utils")            ;; test mocking helpers

handle my-computation() with [pure-handler] end
```

A `pure` keyword was considered — it would guarantee no effects are performed in a block. But it's just a catch-all handler that throws on any effect, easily provided as a library function. Same for observe-and-propagate, silencing, and other common patterns.

**Design principle:** keep the language surface small (`handle...with`, handler functions, `perform`). Let the ecosystem grow through modules.

### What was intentionally left out
- Multi-shot continuations — opted out, complexity not justified
- Parameterized handler instances — solved by args + reverse DNS naming
- Formal effect typing — no type system, rely on naming conventions
- Outbound transformation in host handlers — suspension makes it untenable
