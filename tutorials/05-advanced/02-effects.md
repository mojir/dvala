# Effects

## Background: Algebraic Effects

Dvala's effect system is rooted in **Handlers of Algebraic Effects** ([Plotkin & Pretnar, 2009](https://homepages.inf.ed.ac.uk/gdp/publications/Effect_Handlers.pdf)). The core idea: side effects are **operations** declared by the program, and **handlers** give them meaning — much like exception handlers, but more general. A `perform` is like a `throw` that **returns a value**.

Dvala preserves the essential P&P model:

* Effects as algebraic operations — `perform(eff, arg)`
* First-class handlers — `handler @eff(arg) -> resume(value) end`
* Lexically scoped, deep handlers — innermost handler wins; effects inside handlers propagate outward

Two deliberate deviations:

* **Explicit resume** — handlers must call `resume(value)` to continue the body; without `resume`, the handler return value replaces the entire block result (abort semantics).
* **No multi-shot continuations** — P&P allows a handler to resume the same continuation multiple times. Dvala restricts to single-shot because multi-shot is fundamentally incompatible with serializable continuations — the key feature that enables suspend/resume across processes and time.

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

### handler...end

The `handler` expression creates a first-class handler value with effect clauses:

```dvala
let h = handler @my.double(x) -> resume(x * 2) end;
h(-> perform(@my.double, 21))
```

Each clause matches an effect by name, binds the payload to a parameter, and runs the body.

* `resume(value)` — continues the body computation with `value` as the result of `perform`
* No `resume` — the handler return value **replaces the entire block result** (abort semantics)

### do...with...end

Use `with handler;` inside a `do...end` block to install a handler for the rest of the block:

```dvala
do
  with handler @my.double(x) -> resume(x * 2) end;
  let x = perform(@my.double, 21);
  x + 1
end
```

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

### Handler as function

Handlers can be called as functions with `h(-> body)`:

```dvala
let safeDiv = handler @dvala.error(err) -> 0 end;
safeDiv(-> 10 / 0)
```

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

Runtime errors — like calling a function with invalid arguments — are automatically routed through `dvala.error`. This means `handler @dvala.error(err) -> ...` is the universal error-handling mechanism:

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

## Transform

A handler can include a `transform` clause that wraps the block's final value:

```dvala
let h = handler
  @my.eff(x) -> resume(x * 2)
  transform result -> "result: " ++ str(result)
end;
h(-> perform(@my.eff, 21))
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

The `effectHandler` module provides reusable, parameterized handlers for common patterns.

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
| Install handler | `do with h; body end` |
| Handler as function | `h(-> body)` |
| Multiple clauses | `handler @a(x) -> ... @b(x) -> ... end` |
| Error catching | `handler @dvala.error(err) -> default end` |
| Transform | `handler @eff(x) -> ... transform r -> ... end` |
| Fallback | `fallback(value)(-> body)` |
| Retry | `retry(n, -> body)` |
