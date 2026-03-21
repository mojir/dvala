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

## Creating and Performing Effects

Use `@name` to create an effect reference. The name is a dotted identifier. Effect references are first-class values:

```dvala
let log = @dvala.io.println;
log
```

`perform` invokes an effect with arguments. When there is no local `handle...with` handler, the effect propagates outward. For custom effects that have no standard or host handler, the program fails with an unhandled effect error. In the CLI or when embedding Dvala in JavaScript, you can register your own host handlers (covered below).

## Standard Effects

Dvala provides built-in effects that are always available without explicit handlers:

**I/O:**
* `dvala.io.print` — writes a string to stdout (no newline), resumes with the string
* `dvala.io.println` — writes a string to stdout with newline, resumes with the string
* `dvala.io.error` — writes a string to stderr with newline, resumes with the string
* `dvala.io.read-line` — reads one line of user input, resumes with the input string or `null`
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

```dvala
perform(@dvala.random)
```

Here's an example using `read-line` with a local handler to simulate user input:

```dvala
handle
  let name = perform(@dvala.io.read-line);
  "Hello, " ++ name ++ "!"
with [(eff, arg, nxt) ->
  if eff == @dvala.io.read-line then "Alice"
  else nxt(eff, arg)
  end
]
end
```

Without a local handler, effects like `read-line` propagate to the host environment (no output shown in documentation examples):

```dvala
let name = perform(@dvala.io.read-line);
"Hello, " ++ name ++ "!"
```

## Handle / With Handlers

`handle...with...end` establishes local effect handlers. The handler function receives three arguments: the effect reference (`eff`), the payload (`arg`), and a propagation function (`nxt`). The handler's return value becomes the result of the `perform` call:

```dvala
handle
  let x = perform(@my.double, 21);
  x + 1
with [(eff, arg, nxt) ->
  if eff == @my.double then arg * 2
  else nxt(eff, arg)
  end
]
end
```

Multiple effects can be handled with an `if`/`else if` chain inside the handler:

```dvala
handle
  let a = perform(@my.add, [10, 20]);
  let b = perform(@my.mul, [3, 4]);
  [a, b]
with [(eff, arg, nxt) ->
  if eff == @my.add then arg(0) + arg(1)
  else if eff == @my.mul then arg(0) * arg(1)
  else nxt(eff, arg)
  end end
]
end
```

## Errors

In Dvala, there is no `throw` or `try/catch`. Errors are effects.

To raise an error, perform `dvala.error`:

```dvala
handle
  perform(@dvala.error, "oops")
with [(eff, arg, nxt) ->
  if eff == @dvala.error then "caught: " ++ arg
  else nxt(eff, arg)
  end
]
end
```

Runtime errors — like calling a function with invalid arguments — are automatically routed through `dvala.error`. This means `handle...with` is the universal error-handling mechanism:

```dvala
handle
  sqrt(-1)
with [(eff, arg, nxt) ->
  if eff == @dvala.error then "caught: " ++ arg
  else nxt(eff, arg)
  end
]
end
```

You can mix error handling with other effect handlers in the same block:

```dvala
handle
  let x = perform(@my.read);
  sqrt(x * -1)
with [(eff, arg, nxt) ->
  if eff == @my.read then 42
  else if eff == @dvala.error then "error: " ++ arg
  else nxt(eff, arg)
  end end
]
end
```

An unhandled `dvala.error` propagates like any other unhandled effect — up through nested handlers until it reaches the host.

## Nested Handlers

Handlers are scoped. Inner handlers take precedence. Unmatched effects propagate outward via `nxt`:

```dvala
handle
  handle
    perform(@my.inner, "hi")
  with [(eff, arg, nxt) ->
    if eff == @my.inner then upper-case(arg)
    else nxt(eff, arg)
    end
  ]
  end
with [(eff, arg, nxt) ->
  if eff == @my.outer then arg
  else nxt(eff, arg)
  end
]
end
```

## Effect Matchers

`effect-matcher` creates a predicate function that matches effects by name pattern. Use it with `handle...with` for wildcard matching:

```dvala
handle
  perform(@dvala.io.println, "test")
with [(eff, arg, nxt) ->
  if effect-matcher("dvala.*")(eff) then "intercepted: " ++ arg
  else nxt(eff, arg)
  end
]
end
```

## Host Handlers (JavaScript)

When running Dvala from JavaScript/TypeScript, you register **host handlers** via `runAsync()`. Host handlers are async functions that receive a context object with four actions: `resume`, `fail`, `suspend`, and `next`.

### Resume

The most common pattern — handle the effect and resume the program with a value:

```typescript
import { createDvala } from '@mojir/dvala/full'

const dvala = createDvala()
const result = await dvala.runAsync('perform(@my.greet, "World")', {
  effectHandlers: [
    { pattern: 'my.greet', handler: async ({ args, resume }) => {
      resume(`Hello, ${args[0]}!`)
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
  with [(eff, arg, nxt) ->
    if eff == @dvala.error then "recovered: " ++ arg
    else nxt(eff, arg)
    end
  ]
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
    { pattern: 'human.approve', handler: async ({ args, suspend }) => {
      suspend({ question: args[0] })
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
    { pattern: 'app.save', handler: async ({ args, resume }) => {
      resume(`saved: ${args[0]}`)
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
    { pattern: 'my.*', handler: async ({ args, resume }) => {
      resume(`handled: ${args[0]}`)
    } },
  ],
})
// result = { type: 'completed', value: 'handled: go' }
```
