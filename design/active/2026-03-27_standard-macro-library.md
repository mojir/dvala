# Standard Macro Library

**Status:** Ready to implement (refreshed 2026-04-20)
**Created:** 2026-03-27

## First milestone

Ship `trace`, `unless`, `tap`, `dbg`, `cond` as the initial batch. These exercise three distinct macro patterns (function-wrap, condition-wrap, variadic conditional) and have no external dependencies. `assert`, `curry`, `time`, `lazy` follow in a second commit once the module scaffolding exists.

## Overview

A `macros` module providing ready-to-use macros that showcase the macro system and solve real problems. All macros are implemented in pure Dvala — no new TypeScript primitives needed.

```dvala
let { trace, curry, assert, dbg, cond, unless, tap, time, lazy } = import("macros");
```

## Proposed Macros

### 1. `trace` — log entry/exit via effects

Wraps a function to print arguments on entry and return value on exit.

```dvala
let add = trace((a, b) -> a + b);
add(3, 4)
// prints: ENTER: [3,4]
// prints: EXIT: 7
// returns: 7
```

**Implementation:** Wraps the function body — captures args with rest params, calls `apply`, logs via `@dvala.io.print`.

**Why a macro, not a function?** It *could* be a regular higher-order function. But as a macro it: (a) demonstrates function-wrapping patterns, (b) can validate at expansion time that the argument is a function literal, (c) could later be extended to include the original source in the log.

---

### 2. `curry` — auto-curry a function

Transforms `(a, b, c) -> body` into `(a) -> (b) -> (c) -> body`.

```dvala
let add = curry((a, b, c) -> a + b + c);
add(1)(2)(3)    // 6
let add10 = add(10);
add10(20)(30)   // 60
```

**Implementation:** Inspects the Function AST node's parameter list, builds nested single-param Function nodes from outside-in using `loop/recur`. Body stays untouched.

**Why a macro?** Must rewrite the function's structure — a regular function can only wrap, not restructure parameter lists.

---

### 3. `assert` — assertion with source in error

Evaluates an expression; if falsy, raises an error that includes the original source code.

```dvala
assert(1 + 1 == 2);     // passes
assert(x > 0);          // fails: "Assertion failed: x > 0"
```

**Implementation:** Uses `prettyPrint` from the `ast` module to capture the source text at expansion time, splices it as a string literal into the error message.

**Why a macro?** A regular `assert(expr)` would only see the evaluated `false` — it can't know *what* the expression was. The macro captures the AST before evaluation.

---

### 4. `dbg` — debug print expression + value

Prints `"expr => value"` and returns the value. Transparent — can be inserted anywhere without changing behavior.

```dvala
dbg(1 + 2 * 3)                      // prints: "1 + 2 * 3 => 7", returns 7
dbg(map([1, 2, 3], -> $ * 2))       // prints: "map([1, 2, 3], ($) -> $ * 2) => [2,4,6]"
```

**Implementation:** Like `assert` — pretty-prints AST at expansion time, evaluates at runtime, prints both.

**Why a macro?** Same as `assert` — needs the source text.

---

### 5. `cond` — multi-branch conditional

Scheme/Clojure-style cond. Takes alternating predicate/value pairs with optional default.

```dvala
cond(
  x < 0, "negative",
  x == 0, "zero",
  "positive"              // odd last arg = default
)
// Expands to: if x < 0 then "negative" else if x == 0 then "zero" else "positive" end
```

**Implementation:** Variadic macro (`...clauses`). Detects odd/even argument count for default. Builds nested `If` AST nodes via `loop/recur` from inside-out.

**Why a macro?** Arguments must not be eagerly evaluated — only the matching branch should execute. A function would evaluate all arguments.

---

### 6. `unless` — negated if

Sugar for `if not(cond) then body end`.

```dvala
unless(isLocked, doSomething())
// Expands to: if not(isLocked) then doSomething() end
```

**Implementation:** Single code template with negated condition.

**Why a macro?** The body must not be evaluated when the condition is true.

---

### 7. `tap` — side-effect then return

Evaluates a value, executes a side-effect expression, returns the original value. Useful for inserting logging into pipelines.

```dvala
42 |> tap(_, perform(@dvala.io.print, "checkpoint"))
// prints "checkpoint", returns 42

// Or directly:
tap(computeResult(), perform(@dvala.io.print, "done"))
```

**Implementation:** Binds value to a gensym, evaluates side-effect, returns the bound value.

**Why a macro?** The side-effect must not be evaluated before the value is captured — and both expressions need to be in the right order without the user worrying about sequencing.

---

### 8. `time` — measure execution time

Wraps an expression to measure and print execution time.

```dvala
time(reduce(range(10000), 0, +))
// prints: "Elapsed: 12ms"
// returns: 49995000
```

**Implementation:** Captures `@dvala.time.now` before and after, prints the difference.

**Dependency:** Requires `@dvala.time.now` effect to exist. If not yet available, this macro would be deferred or would use a host-provided timing mechanism.

---

### 9. `lazy` — deferred evaluation

Wraps an expression in a thunk. The expression is not evaluated until the thunk is called.

```dvala
let val = lazy(do perform(@dvala.io.print, "computing!"); expensiveCalc() end);
// nothing printed yet
val()   // prints "computing!", returns result
```

**Implementation:** Simply wraps in `() -> expr`. Since Dvala is immutable, true memoized laziness would require effect-based caching (future work).

**Why a macro?** The expression must not be evaluated at the binding site.

---

## What about `memoize` and `validate`?

These two from the original Phase 8 design are **deferred**:

- **`memoize`** requires mutable cache state. In Dvala's immutable model, this needs a `@dvala.cache.*` effect family that doesn't exist yet. Once added, `memoize` becomes straightforward — the macro wraps the function, the effect handler provides the cache.

- **`validate`** is more interesting as a *runtime function* than a macro — `validate(fn, [isNumber, isString])` works fine as a higher-order function. As a macro it would need a richer syntax for declaring parameter constraints, which could be explored later.

## Implementation Plan

1. Create `src/builtin/modules/macros/index.ts` — register as a module
2. Macros are defined as Dvala source strings, parsed and evaluated at module load time
3. Each macro gets a `docs` property with category, description, examples
4. Tests in `__tests__/macros-module.test.ts`
5. `time` macro depends on `@dvala.time.now` — implement or defer

## Resolved questions (refreshed 2026-04-20)

1. **Named vs. anonymous.** Anonymous. No use case for host-customizable expansion yet. Revisit if one appears.
2. **Module loading.** Use the existing `DvalaModule.source` mechanism — same pattern as `effectHandler.dvala` / `collection.dvala`. Source is evaluated at module-load time; each exported binding becomes a module function. No new registration path needed.
3. **`@dvala.time.now`.** Already exists as a standard effect (`src/evaluator/standardEffects.ts:543`). `time` macro can use it directly without deferral.
