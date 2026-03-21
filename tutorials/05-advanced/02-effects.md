# Effects

## Background: Algebraic Effects

Dvala's effect system is rooted in **Handlers of Algebraic Effects** ([Plotkin & Pretnar, 2009](https://homepages.inf.ed.ac.uk/gdp/publications/Effect_Handlers.pdf)). The core idea: side effects are **operations** declared by the program, and **handlers** give them meaning — much like exception handlers, but more general. A `perform` is like a `throw` that **returns a value**.

Dvala preserves the essential P&P model:

* Effects as algebraic operations — `perform(eff, arg)`
* Handlers as first-class effect interpreters — `handle...with...end`
* Lexically scoped, deep handlers — innermost handler wins; effects inside handlers propagate outward

Two deliberate deviations:

* **No return clause** — P&P handlers have a **return** clause that transforms the body's final value. Dvala omits this; the same transformation can be expressed by wrapping the `handle...with` block.
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
* `dvala.io.print` — writes a string to stdout with newline, resumes with the string
* `dvala.io.error` — writes a string to stderr with newline, resumes with the string
* `dvala.io.read` — reads one line of user input, resumes with the input string or `null`
* `dvala.io.read-stdin` — reads all of stdin until EOF (Node.js only), resumes with the string

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

### handle...with...end

`handle...with...end` establishes a scope with effect handlers. When `perform` is called inside the body, the handler function intercepts it. The handler's return value becomes the result of `perform`:

```dvala
handle
  let x = perform(@my.double, 21);
  x + 1
with (arg, eff, nxt) ->
  if eff == @my.double then arg * 2
  else nxt(eff, arg)
  end
end
```

When there are multiple handlers, wrap them in an array `[...]` (covered below). For a single handler, brackets are optional.

A handler function receives three arguments in order:

| Parameter | Description |
|---|---|
| `arg` | The payload from `perform` |
| `eff` | The effect reference that was performed |
| `nxt` | A function to propagate the effect to the next handler |

The handler checks which effect was performed, handles it if it matches, or calls `nxt(eff, arg)` to pass it along.

### Handler Shorthand

Writing `(arg, eff, nxt) -> if eff == @name then ... else nxt(eff, arg) end` is verbose. The **handler shorthand** eliminates the boilerplate:

```
@effect(param) -> body
```

This desugars to:

```
(param, eff, nxt) -> if eff == @effect then body else nxt(eff, param) end
```

**Example — these are equivalent:**

```dvala
handle
  perform(@my.double, 21)
with (arg, eff, nxt) ->
  if eff == @my.double then arg * 2
  else nxt(eff, arg)
  end
end
```

```dvala
handle
  perform(@my.double, 21)
with @my.double(x) -> x * 2
end
```

The shorthand supports **1 to 3 parameters**, binding them to `arg`, `eff`, and `nxt` in order:

| Form | Binds |
|---|---|
| `@eff(x) -> body` | `x` = arg |
| `@eff(x, e) -> body` | `x` = arg, `e` = eff |
| `@eff(x, e, n) -> body` | `x` = arg, `e` = eff, `n` = nxt |

The **2-param form** is useful with wildcards to inspect which specific effect matched:

```dvala
handle
  perform(@my.action, "data")
with @my.*(x, e) -> effect-name(e) ++ ": " ++ x
end
```

The **3-param form** gives access to `nxt` for middleware patterns:

```dvala
handle
  perform(@my.eff, 10)
with [
  @my.eff(x, e, n) -> x + n(e, x),
  @my.eff(x) -> x * 3
]
end
```

A **zero-param** form uses `$`, `$2`, `$3` (consistent with shorthand lambdas):

```dvala
handle perform(@my.eff, 21)
with @my.eff -> $ * 2
end
```

### Single handler without brackets

When there's only one handler, the array brackets are optional:

```dvala
handle perform(@my.eff, 21)
with @my.eff(x) -> x * 2
end
```

### Multiple handlers

Multiple handlers form a chain. Each handler can match specific effects and call `nxt` to pass unmatched effects along:

```dvala
handle
  perform(@a, 10) + perform(@b, 20)
with [
  @a(x) -> x * 2,
  @b(x) -> x * 3
]
end
```

Handler shorthand and full handlers can be mixed freely:

```dvala
handle
  perform(@a, 10) + perform(@b, 20)
with [
  @a(x) -> x * 2,
  (arg, eff, nxt) -> if eff == @b then arg * 3 else nxt(eff, arg) end
]
end
```

### Handler shorthand as first-class values

Handler shorthands produce regular functions. They can be stored, passed, and composed:

```dvala
let double-handler = @my.double(x) -> x * 2;
handle perform(@my.double, 21) with double-handler end
```

```dvala
let run-with = (body-fn, handler) ->
  handle body-fn() with handler end;
run-with(-> perform(@my.eff, 10), @my.eff(x) -> x * 5)
```

---

## Effect Pipe `||>`

The effect pipe is a lightweight alternative to `handle...with...end`:

```
expr ||> handler
```

is **pure sugar** for:

```
handle expr with handler end
```

**Error catching — the simplest case:**

```dvala
(0 / 0) ||> @dvala.error(msg) -> 0
```

**With a stored handler:**

```dvala
let safe-div = @dvala.error(msg) -> 0;
(0 / 0) ||> safe-div
```

**With a list of handlers:**

```dvala
(perform(@a, 10) + perform(@b, 20)) ||> [@a(x) -> x * 2, @b(x) -> x * 3]
```

### Chaining

Multiple `||>` operators chain left-to-right. Each creates a nested handler scope:

```dvala
let auth = @auth.check(x) -> "user1";
let db = @db.get(x) -> "data:" ++ x;
perform(@db.get, "key") ||> auth ||> db
```

Inline shorthand handlers chain naturally — the shorthand body stops at `||>`:

```dvala
perform(@a, 10) ||> @a(x) -> x + perform(@b, x) ||> @b(x) -> x * 3
```

### When to use `||>` vs `handle...with...end`

| | `||>` | `handle...with...end` |
|---|---|---|
| Single-expression body | Clean | Verbose |
| Multi-line body | Needs `do...end` on left | Natural |
| Chaining handlers | Left-to-right pipe | Nesting blocks |
| Multiple handlers | Use list: `||> [h1, h2]` | Use list: `with [h1, h2]` |

---

## Wildcard Handlers

Effect names with `*` match a group of effects:

```dvala
handle
  perform(@dvala.io.print, "hi")
with @dvala.io.*(x) -> null
end
```

Three wildcard forms:

| Pattern | Matches |
|---|---|
| `@dvala.io.*` | `dvala.io.print`, `dvala.io.read`, etc. (dot-boundary enforced) |
| `@dvala.*` | Everything under `dvala.` including `dvala.error`, `dvala.io.print`, etc. |
| `@*` | Every effect |

Wildcards work with the pipe too:

```dvala
perform(@anything, "data") ||> @*(x) -> "caught: " ++ x
```

The 2-param form lets you inspect which specific effect matched a wildcard:

```dvala
handle
  perform(@my.custom.action, "data")
with @my.*(x, e) -> effect-name(e) ++ "=" ++ x
end
```

---

## Errors

In Dvala, there is no `throw` or `try/catch`. Errors are effects.

To raise an error, perform `dvala.error`:

```dvala
handle
  perform(@dvala.error, "oops")
with @dvala.error(msg) -> "caught: " ++ msg
end
```

Runtime errors — like calling a function with invalid arguments — are automatically routed through `dvala.error`. This means `handle...with` (and `||>`) is the universal error-handling mechanism:

```dvala
(0 / 0) ||> @dvala.error(msg) -> "caught: " ++ msg
```

```dvala
handle
  sqrt(-1)
with @dvala.error(msg) -> "caught: " ++ msg
end
```

You can mix error handling with other effect handlers:

```dvala
handle
  let x = perform(@my.read);
  sqrt(x * -1)
with (arg, eff, nxt) ->
  if eff == @my.read then 42
  else if eff == @dvala.error then "error: " ++ arg
  else nxt(eff, arg)
  end
end
```

Or using shorthand with separate handlers:

```dvala
handle
  let x = perform(@my.read);
  sqrt(x * -1)
with [
  @my.read(x) -> 42,
  @dvala.error(msg) -> "error: " ++ msg
]
end
```

An unhandled `dvala.error` propagates like any other unhandled effect — up through nested handlers until it reaches the host.

---

## Nested Handlers

Handlers are scoped. Inner handlers take precedence. Unmatched effects propagate outward via `nxt`:

```dvala
handle
  handle
    perform(@my.inner, "hi")
  with @my.inner(x) -> upper-case(x)
  end
with @my.outer(x) -> x
end
```

With the pipe operator, nesting reads left-to-right:

```dvala
perform(@my.inner, "hi") ||> @my.inner(x) -> upper-case(x) ||> @my.outer(x) -> x
```

---

## Middleware Patterns

The `nxt` function enables middleware — handlers that observe, transform, or wrap effects before passing them along.

### Logging middleware

Using the 3-param shorthand to access `nxt`:

```dvala
let logger = @*(x, e, n) -> do
  perform(@dvala.io.print, "effect: " ++ effect-name(e));
  n(e, x)
end;
perform(@my.eff, 42) ||> logger ||> @my.eff(x) -> x * 2
```

### Transform and propagate

A handler can modify the payload before forwarding:

```dvala
let aliaser = (arg, eff, nxt) ->
  if eff == @old.name then nxt(@new.name, arg)
  else nxt(eff, arg)
  end;
let handler = @new.name(x) -> "new:" ++ x;
handle perform(@old.name, "x") with [aliaser, handler] end
```

### Wrap downstream result

A handler can call `nxt`, get the result, and transform it:

```dvala
let wrapper = (arg, eff, nxt) -> do
  let result = nxt(eff, arg);
  "wrapped:" ++ str(result)
end;
let handler = @my.eff(x) -> x * 2;
handle perform(@my.eff, 21) with [wrapper, handler] end
```

---

## Effect Matchers

`effect-matcher` creates a predicate function that matches effects by name pattern. This is the function behind wildcard shorthand handlers:

```dvala
let pred = effect-matcher("dvala.*");
pred(@dvala.error)
```

```dvala
let pred = effect-matcher("dvala.*");
pred(@custom.foo)
```

```dvala
let pred = effect-matcher("*");
pred(@anything)
```

You can use `effect-matcher` with regexp for more complex patterns:

```dvala
let pred = effect-matcher(#"^my\.(read|write)$");
handle perform(@my.read, null) with (arg, eff, nxt) ->
  if pred(eff) then "matched"
  else nxt(eff, arg)
  end
end
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
  handle
    perform(@my.risky)
  with @dvala.error(msg) -> "recovered: " ++ msg
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
| Handle block | `handle body with handler end` |
| Effect pipe | `expr \|\|> handler` |
| Handler shorthand | `@eff(x) -> body` |
| Wildcard handler | `@dvala.*(x) -> body` |
| Full handler | `(arg, eff, nxt) -> ...` |
| Error catching | `expr \|\|> @dvala.error(msg) -> default` |
| Middleware | `expr \|\|> h1 \|\|> h2 \|\|> h3` |
