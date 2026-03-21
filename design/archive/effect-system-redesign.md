# Effect System Redesign

## Overview

Unify error handling and algebraic effects into a single coherent model.
Replace `try`/`catch`/`throw` with `do...with...end` and `perform(effect(...))`.

## Design Decisions

### Naming Convention
Effects use reverse DNS dot-separated names forming a namespace tree:
- `dvala.*` — reserved for all internal Dvala effects
- `dvala.error`, `dvala.random`, etc.
- `com.myapp.io.read` — user/library-defined effects

Convention only — no enforcement by the runtime.

### Effects Are First-Class Values
`effect(X)` creates a value that can be stored, passed, and compared.
The argument is a **dotted symbol** (not a string) — enables static analysis.

```
let e = effect(dvala.error)
perform(e, "something went wrong")
```

### `effect-name` Accessor
Effects are opaque values. Access the name via a dedicated function (not `.name`):

```
effect-name(effect(dvala.log))   ; => "dvala.log"
```

### `with` Clause Matching
Two forms in a `case`:
- `case effect(dvala.log)` — exact match
- `case predicate-fn` — general predicate (escape hatch for dynamic matching)

`match-effect` is a library helper:
```
match-effect("dvala.error")   ; prefix match — catches dvala.error.*
match-effect(#"^dvala\.")     ; regex match
```

**Available operations in in-language handlers:** `resume` and `fail` only.
No `next`, `suspend`, or `serialize` — those are host-only concepts.
Composition is achieved by nesting `do...with` blocks.

**Effect propagation:** if no `case` in the `with` clause matches a performed effect,
the effect bubbles up to the next enclosing `do...with` block, and ultimately to the host.

### Host Handler Registration
Handlers are registered on the host (JavaScript/TypeScript) side using a pattern string:

```typescript
dvala.registerHandler("dvala.error", handler)  // exact match
dvala.registerHandler("dvala.*", handler)      // all internal effects
dvala.registerHandler("*", handler)            // catch-all
```

**Pattern matching rules:**
- No wildcard → exact match only
- `.*` suffix → matches the named effect itself **and** all descendants
- `*` alone → matches everything
- `*` may only appear as the last segment, preceded by `.`, or alone
- `dvala.*` matches `dvala.error` but NOT `dvalaXXX` (dot boundary enforced)

### Host Handler API — Middleware Model
Handlers behave like middleware. Multiple handlers can match the same effect.
Registration order determines the chain. Each handler must call exactly one operation:

```typescript
(args, { effectName, resume, fail, suspend, serialize, next }) => { ... }
```
- `effectName` — full name of the performed effect (useful for wildcard handlers)
- `args` — exactly what was passed to `perform`
- `resume(value)` — continue execution with a value
- `fail(msg?)` — propagate as error (optional string override)
- `suspend(blob)` — serialize continuation, end current `run()` call; resume later via `dvala.resume(blob, value)`
- `serialize()` — capture continuation blob without suspending
- `next()` — pass to the next registered handler that matches this effect name

`next()` advances through all registered handlers in registration order whose pattern
matches the performed effect name. Pattern specificity does not imply priority — order does.

**Handlers may be async.** Operations may be called after an `await`. The handler must
call exactly one operation before its promise resolves.

**Dev-mode enforcement:** A flag on the control object tracks whether an operation was
called. If the handler function returns (or its promise resolves) without calling any
operation, a warning is emitted. Calling two operations throws immediately.

### No Special Fatal Mechanism
Unrecoverable = no handler registered. Host decides default behavior.

### Static Analysis
Collect all `effect(...)` nodes in the AST — the dotted-symbol requirement
guarantees complete enumeration of all effect names the program touches,
including those stored in variables before being performed.

---

## Work Plan

> After completing each step, run `npm run check` (lint + typecheck + test + build)
> and ensure code coverage is maintained.

### Step 1 — Extend `do` with `with` clause
Enable `do...with...end` syntax. A `do` block can optionally have a `with`
section containing `case` handlers.

```
do
  perform(effect(dvala.log), "hello")
with
  case effect(dvala.log) then (args, { resume, fail }) -> ...
end
```

- Parser: parse `with` and `case` inside `do`
- Evaluator: install handlers for the scope of the `do` block
- Handler receives `(args, controlObject)`

### Step 2 — Add `dvala.error` standard effect
All internal runtime errors perform `dvala.error` instead of throwing JS exceptions.

### Step 3 — Test runtime error capture
Verify that runtime errors can be caught and recovered from in `with` clauses:

```
do
  1 / 0
with
  case effect(dvala.error) then (_, { resume }) -> resume(0)
end
```

### Step 4 — Replace existing `try` expressions with `do`
Migrate all existing `try...catch` usage in the standard library and tests
to the new `do...with...end` syntax.

### Step 5 — Remove `try` and `catch`
Remove the `try`/`catch` special expression from the parser, evaluator,
and all related infrastructure.

### Step 6 — Replace `throw` with `perform(effect(dvala.error), ...)`
All `throw "msg"` expressions become `perform(effect(dvala.error), "msg")`.
Update standard library, tests, and documentation.

### Step 7 — Remove `throw`
Remove `throw` as a built-in. A `throw` convenience function could be
added to a library later:
```
let throw = (msg) -> perform(effect(dvala.error), msg)
```

### Step 8 — Keep dot notation as convention only
No runtime enforcement of the reverse DNS naming scheme.
Document the convention. Tooling (linter, analyser) can warn about violations.

### Step 9 — Add `effect-name` accessor
Implement `effect-name(e)` as a built-in function returning the effect's
name string. Effects remain opaque values.

```
effect-name(effect(dvala.log))   ; => "dvala.log"
```

### Step 10 — Extend `with` case semantics
Allow `case` to accept either:
- An effect value: `case effect(dvala.log)` — exact match
- A predicate function: `case my-predicate` — called with the effect, truthy = match

Add `match-effect` as a library helper:
```
let match-effect = (pattern) ->
  if string?(pattern)
    then (e) -> starts-with?(effect-name(e), pattern)
    else (e) -> regexp-test(pattern, effect-name(e))
```

