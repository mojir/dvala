# Effects and Handlers

## Background

### The problem with side effects

Every useful program performs side effects — reading input, writing output, accessing the network, generating random numbers. Traditional approaches embed effects directly in the language (like `console.log` in JavaScript or `print` in Python). This creates two problems:

1. **Testing is hard** — you can't run code that does I/O without actually doing I/O
2. **Composition is fragile** — error handling, logging, and retries get tangled with business logic

Algebraic effects solve both problems by separating the *declaration* of an effect from its *implementation*. A program says "I need to read a file" (the effect), and a handler decides what that means (the implementation).

### Algebraic effects: the theory

The theoretical foundation comes from **Plotkin and Pretnar's "Handlers of Algebraic Effects"** (2009). The key insight: side effects can be modeled as **algebraic operations** with a well-defined interface, and **handlers** give these operations meaning — like exception handlers, but far more general.

In the formal model:
- An **effect operation** is like a function call that doesn't return immediately — instead, it captures a **delimited continuation** (everything that would happen after the call)
- A **handler** receives the operation and the continuation, and decides what to do: run the continuation with a value (resume), return a different value (abort), or transform the result

This is closely related to **free monads** in category theory — effects form a free algebra, and handlers provide the interpretation. But unlike monads, algebraic effects compose naturally without monad transformers.

### Dvala's effect model

Dvala's implementation follows the established conventions from three mature algebraic effect systems:

| Feature | [Koka](https://koka-lang.github.io/) | [Eff](https://www.eff-lang.org/) | [OCaml 5](https://v2.ocaml.org/manual/effects.html) | Dvala |
|---|---|---|---|---|
| Perform effect | `op(args)` | `#op args` | `perform (Op args)` | `perform(@op, arg)` |
| Resume | `resume(val)` | `k val` | `continue k val` | `resume(val)` |
| Abort | don't resume | don't call `k` | don't `continue` | don't call `resume` |
| Transform | `return(x)` clause | `val x ->` clause | `retc` field | `transform x ->` clause |
| Handler scope | `with handler` | `handle expr with` | `match_with` | `with h;` or `h(-> body)` |
| Deep/shallow | both | deep | shallow | deep |
| Multi-shot | yes | yes | no | no (one-shot) |

**Key design decisions:**

- **Explicit resume** — Koka's `fun` clauses auto-resume, `ctl` clauses don't. Dvala unifies: `resume` is always available, you choose whether to call it.
- **One-shot continuations** — like OCaml 5, each `resume` can only be called once. This enables serializable continuations (suspend/resume across processes).
- **Effects are values** — effect references like `@my.eff` are first-class, can be stored and compared. Handlers are also first-class values.
- **Errors are effects** — no separate exception mechanism. `@dvala.error` is just an effect.

---

## Effect References

Use `@name` to create an effect reference. The name is a dotted identifier:

```dvala
@dvala.io.print
```

Effect references are first-class values — you can store them, pass them, and compare them:

```dvala
let log = @dvala.io.print;
log
```

```dvala
==(@my.eff, @my.eff)
```

```dvala
==(@my.eff, @other.eff)
```

## Performing Effects

`perform` invokes an effect with a single payload argument:

```dvala
perform(@dvala.random)
```

```dvala
perform(@dvala.io.print, "hello")
```

When there is no local handler, the effect propagates outward to the host environment.

---

## Standard Effects

Dvala provides built-in effects that are always available without explicit handlers:

**I/O:**
* `dvala.io.print` — writes a string to stdout (no newline), resumes with the string
* `dvala.io.error` — writes a string to stderr with newline, resumes with the string
* `dvala.io.read` — reads one line of user input, resumes with the input string or `null`
* `dvala.io.readStdin` — reads all of stdin until EOF (Node.js only), resumes with the string

**Random:**
* `dvala.random` — resumes with a random number in [0, 1)
* `dvala.random.uuid` — resumes with a UUID v4 string
* `dvala.random.int` — resumes with a random integer in [min, max)
* `dvala.random.item` — resumes with a random element from an array
* `dvala.random.shuffle` — resumes with a new shuffled copy of an array

**Time:**
* `dvala.time.now` — resumes with the current timestamp (milliseconds since epoch)
* `dvala.time.zone` — resumes with the IANA timezone string

**Async:**
* `dvala.sleep` — waits for a given number of milliseconds, resumes with `null`

**Error:**
* `dvala.error` — raises an error (covered in the Errors section below)

---

## Handling Effects

### Creating handlers with `handler...end`

The `handler` expression creates a first-class handler value with named effect clauses:

```dvala
let h = handler @my.double(x) -> resume(x * 2) end;
h(-> perform(@my.double, 21))
```

Each clause matches an effect by name, binds the payload to a parameter, and runs the body. Two paths are possible:

- **Resume** — calling `resume(value)` continues the body computation with `value` as the result of `perform`
- **Abort** — not calling `resume` makes the handler's return value replace the entire block result

```dvala
// Resume: handler provides a value, body continues
let h = handler @dvala.error(err) -> resume(0) end;
do
  with h;
  let x = 0 / 0;   // error → handler resumes with 0
  x + 1             // continues: 0 + 1 = 1
end
```

```dvala
// Abort: handler returns a value, body is abandoned
let h = handler @dvala.error(err) -> "caught" end;
do
  with h;
  let x = 0 / 0;   // error → handler aborts with "caught"
  x + 1             // never reached
end
```

### Installing handlers with `with h;`

Use `with handler;` inside a `do...end` block to install a handler for the rest of the block:

```dvala
do
  with handler @my.double(x) -> resume(x * 2) end;
  let x = perform(@my.double, 21);
  x + 1
end
```

The handler is active from the `with` statement to the `end` of the block — like `let` scoping. No function boundary is created, so `recur` works normally inside `with` blocks.

### Installing handlers with `h(-> body)`

Handlers can also be called as functions with a thunk argument:

```dvala
let safeDiv = handler @dvala.error(err) -> 0 end;
safeDiv(-> 10 / (5 - 5))
```

This creates a function boundary (unlike `with h;`), which means `recur` inside the thunk targets the thunk, not an enclosing loop.

### Multiple effect clauses

A single handler can match multiple effects:

```dvala
do
  with handler
    @a(x) -> resume(x * 2)
    @b(x) -> resume(x * 3)
  end;
  perform(@a, 10) + perform(@b, 20)
end
```

### Stacked handlers

Multiple `with` statements install handlers in layers. Inner handlers take precedence:

```dvala
do
  with handler @outer(x) -> resume("outer: " ++ x) end;
  with handler @inner(x) -> resume("inner: " ++ x) end;
  perform(@inner, "hi") ++ " " ++ perform(@outer, "there")
end
```

Unmatched effects propagate automatically to outer handlers — no explicit forwarding needed.

---

## Transform Clause

A handler can include a `transform` clause that transforms the block's **normal completion** value. This is equivalent to Koka's `return` clause, OCaml 5's `retc`, and Eff's `val` clause.

### Transform-only handler

A handler with no effect clauses — just a transform:

```dvala
let double = handler transform x -> x * 2 end;
do with double; 21 end
```

### Transform with effect clauses

```dvala
let h = handler
  @dvala.error(err) -> { ok: false, error: err.message }
transform
  x -> { ok: true, data: x }
end;

// Normal completion → transform applies
h(-> 42)
```

```dvala
let h = handler
  @dvala.error(err) -> { ok: false, error: err.message }
transform
  x -> { ok: true, data: x }
end;

// Abort → transform is bypassed
h(-> 0 / 0)
```

Transform and abort are **mutually exclusive paths** per the formal operational semantics:
- **Path 1 (normal completion):** body evaluates to a value → transform applies
- **Path 2 (abort):** handler returns without calling `resume` → transform is bypassed

### Stacked transforms compose inside-out

```dvala
let double = handler transform x -> x * 2 end;
let addTen = handler transform x -> x + 10 end;

do
  with double;   // outer: applies second
  with addTen;   // inner: applies first
  5              // → 5+10=15 → 15*2=30
end
```

---

## Resume Returns a Value

When a handler calls `resume(value)`, the continuation runs to completion, and `resume` **returns** the continuation's eventual result (after transform). This is a powerful feature shared with Koka and Eff.

```dvala
let h = handler
  @my.eff(x) -> do
    let result = resume(x);   // result = what the body evaluates to
    result + 100
  end
end;

h(-> perform(@my.eff, 5) * 2)
```

The trace:
1. `perform(@my.eff, 5)` → clause runs, calls `resume(5)`
2. Body continues: `5 * 2 = 10`
3. `resume` returns `10`
4. Clause returns `10 + 100 = 110` (abort — no second resume)

This enables patterns like wrapping, logging, and pure state accumulation.

---

## Deep Handler Reinstallation

When `resume` is called, the handler is **reinstalled around the continuation** (deep handler semantics, following Koka/Eff/OCaml 5). This means effects performed during the resumed continuation are handled by the same handler.

```dvala
let counter = handler
  @inc() -> do
    let result = resume(null);
    result + 1
  end
end;

counter(-> do
  perform(@inc);
  perform(@inc);
  perform(@inc);
  0
end)
```

Each `perform(@inc)` hits the reinstalled handler. The result builds up: `0+1+1+1 = 3`.

---

## One-Shot Constraint

`resume` can only be called **once** per effect. Calling it a second time is a runtime error:

```dvala
do
  with handler @dvala.error(err) -> "caught" end;
  let h = handler
    @my.eff(x) -> do
      let a = resume(1);
      resume(2)
    end
  end;
  h(-> perform(@my.eff, 0))
end
```

This constraint is inherent to Dvala's continuation model — continuations are consumed on first use, enabling serialization for suspend/resume.

---

## Pure State Threading

The combination of `resume`-returns-value + transform enables **pure state accumulation** without mutation. This is the canonical motivation for the transform clause in the algebraic effects literature.

```dvala
let logger = handler
  @log(msg) -> do
    let [result, logs] = resume(null);
    [result, [msg, ...logs]]
  end
transform
  x -> [x, []]
end;

do
  with logger;
  perform(@log, "start");
  let x = 42;
  perform(@log, "computed: " ++ str(x));
  x
end
```

Trace:
1. `perform(@log, "start")` → clause calls `resume(null)`
2. Inside: `perform(@log, "computed: 42")` → clause calls `resume(null)`
3. Inside: body completes with `42` → transform: `[42, []]`
4. Step 2's `resume` returns `[42, []]` → clause returns `[42, ["computed: 42"]]`
5. Step 1's `resume` returns `[42, ["computed: 42"]]` → clause returns `[42, ["start", "computed: 42"]]`

No mutation. Each handler invocation wraps the result on the way out, like unwinding a call stack.

---

## Intercept-and-Forward

Handler clause bodies run **outside** the handler scope (the handler frame is popped before the clause executes). This means `perform` inside a clause propagates to the outer handler — standard algebraic effects behavior.

This enables middleware-style handlers that intercept, transform, and forward effects:

```dvala
let addAuth = handler
  @fetch(url) -> do
    let result = perform(@fetch, url ++ "?auth=token");
    resume(result)
  end
end;

let fetcher = handler
  @fetch(url) -> resume("data from " ++ url)
end;

do
  with fetcher;
  with addAuth;
  perform(@fetch, "/users")
end
```

The `addAuth` handler intercepts `@fetch`, re-performs it with authentication (propagates to `fetcher`), and resumes the body with the result.

---

## Errors

In Dvala, there is no `throw` or `try/catch`. Errors are effects.

To raise an error, perform `dvala.error`:

```dvala
do
  with handler @dvala.error(err) -> resume("caught: " ++ err.message) end;
  perform(@dvala.error, { message: "oops" })
end
```

Runtime errors — like division by zero or calling a function with invalid arguments — are automatically routed through `dvala.error`:

```dvala
do
  with handler @dvala.error(err) -> resume("caught: " ++ err.message) end;
  0 / 0
end
```

```dvala
do
  with handler @dvala.error(err) -> resume("caught: " ++ err.message) end;
  sqrt(-1)
end
```

You can mix error handling with other effect handlers:

```dvala
do
  with handler
    @my.read(x) -> resume(42)
    @dvala.error(err) -> resume("error: " ++ err.message)
  end;
  let x = perform(@my.read);
  sqrt(x * -1)
end
```

An unhandled `dvala.error` propagates like any other unhandled effect — up through nested handlers until it reaches the host.

---

## First-Class Handlers

Handlers are values. You can store them, return them from functions, pass them as arguments:

```dvala
let makeFallback = (v) -> handler @dvala.error(msg) -> v end;
let h = makeFallback(42);
h(-> 0 / 0)
```

```dvala
let applyHandler = (h, bodyFn) -> h(-> bodyFn());
let h = handler @dvala.error(msg) -> "safe" end;
applyHandler(h, -> 0 / 0)
```

---

## Effect Matchers

`effectMatcher` creates a predicate function that matches effects by name pattern:

```dvala
let pred = effectMatcher("dvala.*");
pred(@dvala.error)
```

```dvala
let pred = effectMatcher("dvala.*");
pred(@custom.foo)
```

```dvala
let pred = effectMatcher("*");
pred(@anything)
```

You can use `effectMatcher` with regexp for more complex patterns:

```dvala
let pred = effectMatcher(#"^my\.(read|write)$");
pred(@my.read)
```

---

## Handler Module

The `effectHandler` module provides reusable handlers for common patterns.

```dvala
let { retry, fallback } = import(effectHandler)
```

### `fallback(value)`

Returns a handler that catches `@dvala.error` and aborts with `value`:

```dvala
let { fallback } = import(effectHandler);
do with fallback(0); 0 / 0 end
```

Or using the function call form:

```dvala
let { fallback } = import(effectHandler);
fallback(0)(-> 0 / 0)
```

### `retry(n, bodyFn)`

Retries `bodyFn()` up to `n` times on `@dvala.error`. On final failure, propagates the error:

```dvala
let { retry, fallback } = import(effectHandler);
do with (handler @dvala.error(msg) -> "gave up" end); retry(3, -> 0 / 0) end
```

---

## Host Handlers (JavaScript)

When running Dvala from JavaScript/TypeScript, you register **host handlers** via `runAsync()`. Host handlers are async functions that receive a context object with four actions: `resume`, `fail`, `suspend`, and `next`.

### Resume

The most common pattern — handle the effect and resume the program with a value:

```typescript
import { createDvala } from '@mojir/dvala/full'

const dvala = createDvala()
const result = await dvala.runAsync('perform(@my.greet, "World")', {
  effectHandlers: [
    { pattern: 'my.greet', handler: async ({ arg, resume }) => {
      resume(`Hello, ${arg}!`)
    } },
  ],
})
// result = { type: 'completed', value: 'Hello, World!' }
```

### Fail

Call `fail(msg?)` to raise a Dvala-level error from a host handler. The error flows through `dvala.error` handlers:

```typescript
const result = await dvala.runAsync(`
  do
    with handler @dvala.error(err) -> resume("recovered: " ++ err.message) end;
    perform(@my.risky)
  end
`, {
  effectHandlers: [
    { pattern: 'my.risky', handler: async ({ fail }) => {
      fail('something went wrong')
    } },
  ],
})
// result = { type: 'completed', value: 'recovered: something went wrong' }
```

### Suspend

Call `suspend(meta?)` to pause the entire program. The execution state is captured as a serializable JSON blob that can be stored and resumed later — across processes, machines, or time:

```typescript
const result = await dvala.runAsync(`
  let answer = perform(@human.approve, "Draft report");
  "Approved: " ++ answer
`, {
  effectHandlers: [
    { pattern: 'human.approve', handler: async ({ arg, suspend }) => {
      suspend({ question: arg })
    } },
  ],
})
// result = { type: 'suspended', snapshot: { continuation: ..., meta: { question: 'Draft report' }, ... } }

// Later, resume with the human's response:
import { resume } from '@mojir/dvala/full'
const final = await resume(result.snapshot, 'Yes')
// final = { type: 'completed', value: 'Approved: Yes' }
```

### Next (Middleware Chaining)

Call `next()` to pass the effect to the next matching handler. Combined with wildcard patterns, this enables middleware-style logging, telemetry, or access control:

```typescript
const log: string[] = []
const result = await dvala.runAsync('perform(@app.save, "data")', {
  effectHandlers: [
    { pattern: '*', handler: async ({ effectName, next }) => {
      log.push(`[audit] ${effectName}`)
      next()
    } },
    { pattern: 'app.*', handler: async ({ effectName, next }) => {
      log.push(`[app] ${effectName}`)
      next()
    } },
    { pattern: 'app.save', handler: async ({ arg, resume }) => {
      resume(`saved: ${arg}`)
    } },
  ],
})
// result = { type: 'completed', value: 'saved: data' }
// log = ['[audit] app.save', '[app] app.save']
```

### Wildcard Patterns

Host handler keys support three matching modes:

* **Exact**: `'my.effect'` — matches only `my.effect`
* **Prefix wildcard**: `'my.*'` — matches `my.effect`, `my.sub.deep`, and `my` itself
* **Catch-all**: `'*'` — matches everything

```typescript
const result = await dvala.runAsync('perform(@my.sub.action, "go")', {
  effectHandlers: [
    { pattern: 'my.*', handler: async ({ arg, resume }) => {
      resume(`handled: ${arg}`)
    } },
  ],
})
// result = { type: 'completed', value: 'handled: go' }
```

---

## Summary

| Concept | Syntax |
|---|---|
| Effect reference | `@name` |
| Perform effect | `perform(@eff, arg)` |
| Handler expression | `handler @eff(x) -> resume(val) end` |
| Install handler (block scope) | `do with h; body end` |
| Install handler (thunk) | `h(-> body)` |
| Multiple clauses | `handler @a(x) -> ... @b(x) -> ... end` |
| Resume (continue body) | `resume(value)` in clause |
| Abort (replace block result) | don't call `resume` in clause |
| Transform clause | `handler ... transform r -> expr end` |
| Error catching | `handler @dvala.error(err) -> default end` |
| First-class handlers | `let h = handler ... end; h(-> body)` |
| Fallback | `do with fallback(value); body end` |
| Retry | `retry(n, -> body)` |

### Further reading

- Plotkin & Pretnar, [Handlers of Algebraic Effects](https://homepages.inf.ed.ac.uk/gdp/publications/Effect_Handlers.pdf) (2009) — the foundational paper
- Daan Leijen, [Algebraic Effects for Functional Programming](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/08/algeff-tr-2016-v3.pdf) (2016) — Koka's effect system
- Matija Pretnar, [An Introduction to Algebraic Effects and Handlers](https://www.eff-lang.org/handlers-tutorial.pdf) (2015) — tutorial with Eff
- KC Sivaramakrishnan et al., [Retrofitting Effect Handlers onto OCaml](https://arxiv.org/abs/2104.00250) (2021) — OCaml 5's design
