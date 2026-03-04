# Effects

## Background: Algebraic Effects

Dvala's effect system is rooted in **Handlers of Algebraic Effects** ([Plotkin & Pretnar, 2009](https://homepages.inf.ed.ac.uk/gdp/publications/Effect_Handlers.pdf)). The core idea: side effects are **operations** declared by the program, and **handlers** give them meaning — much like exception handlers, but more general. A `perform` is like a `throw` that **returns a value**.

Dvala preserves the essential P&P model:

* Effects as algebraic operations — `perform(eff, ...args)`
* Handlers as first-class effect interpreters — `do...with...end`
* Lexically scoped, deep handlers — innermost handler wins; effects inside handlers propagate outward

Two deliberate deviations:

* **No return clause** — P&P handlers have a **return** clause that transforms the body's final value. Dvala omits this; the same transformation can be expressed by wrapping the `do...with` block.
* **No multi-shot continuations** — P&P allows a handler to resume the same continuation multiple times. Dvala restricts to single-shot because multi-shot is fundamentally incompatible with serializable continuations — the key feature that enables suspend/resume across processes and time.

## Creating and Performing Effects

Use `effect(name)` to create an effect reference. The name is a dotted identifier. Effect references are first-class values:

```
let log = effect(dvala.log);
log
```

`perform` invokes an effect with arguments. When there is no local `do...with` handler, the effect propagates outward. For custom effects that have no standard or host handler, the program fails with an unhandled effect error. In the CLI or when embedding Dvala in JavaScript, you can register your own host handlers (covered below).

## Standard Effects

Dvala provides a set of built-in effects that are always available without explicit handlers:

* `dvala.log` — logs a value to the console, resumes with `null`
* `dvala.random` — resumes with a random number in [0, 1)
* `dvala.now` — resumes with the current timestamp (milliseconds since epoch)
* `dvala.sleep` — waits for a given number of milliseconds, resumes with `null`
* `dvala.error` — raises an error (covered in the Errors section below)

```
perform(effect(dvala.random))
```

## Do / With Handlers

`do...with...end` establishes local effect handlers. The handler receives the effect's arguments as an array and its return value becomes the result of the `perform` call:

```
do
  let x = perform(effect(my.double), 21);
  x + 1
with
  case effect(my.double) then ([n]) -> n * 2
end
```

Multiple handlers can be defined in a single `with` block:

```
do
  let a = perform(effect(my.add), 10, 20);
  let b = perform(effect(my.mul), 3, 4);
  [a, b]
with
  case effect(my.add) then ([a, b]) -> a + b
  case effect(my.mul) then ([a, b]) -> a * b
end
```

## Errors

In Dvala, there is no `throw` or `try/catch`. Errors are effects.

To raise an error, perform `dvala.error`:

```
do
  perform(effect(dvala.error), "oops")
with
  case effect(dvala.error) then ([msg]) -> "caught: " ++ msg
end
```

Runtime errors — like calling a function with invalid arguments — are automatically routed through `dvala.error`. This means `do...with` is the universal error-handling mechanism:

```
do
  sqrt(-1)
with
  case effect(dvala.error) then ([msg]) -> "caught: " ++ msg
end
```

You can mix error handling with other effect handlers in the same block:

```
do
  let x = perform(effect(my.read));
  sqrt(x * -1)
with
  case effect(my.read) then () -> 42
  case effect(dvala.error) then ([msg]) -> "error: " ++ msg
end
```

An unhandled `dvala.error` propagates like any other unhandled effect — up through nested handlers until it reaches the host.

## Nested Handlers

Handlers are scoped. Inner handlers take precedence. Unmatched effects propagate outward:

```
do
  do
    perform(effect(my.inner), "hi")
  with
    case effect(my.inner) then ([msg]) -> upper-case(msg)
  end
with
  case effect(my.outer) then ([msg]) -> msg
end
```

## Effect Matchers

`effect-matcher` creates a predicate function that matches effects by name pattern. Use it with `do...with` for wildcard matching:

```
do
  perform(effect(dvala.log), "test")
with
  case effect-matcher("dvala.*")
    then ([msg]) -> "intercepted: " ++ msg
end
```

## Host Handlers (JavaScript)

When running Dvala from JavaScript/TypeScript, you register **host handlers** via the `run()` function. Host handlers are async functions that receive a context object with four actions: `resume`, `fail`, `suspend`, and `next`.

### Resume

The most common pattern — handle the effect and resume the program with a value:

```typescript
import { run } from '@mojir/dvala/full'

const result = await run('perform(effect(my.greet), "World")', {
  handlers: {
    'my.greet': async ({ args, resume }) => {
      resume(`Hello, ${args[0]}!`)
    },
  },
})
// result = { type: 'completed', value: 'Hello, World!' }
```

### Fail

Call `fail(msg?)` to raise a Dvala-level error from a host handler. The error flows through `dvala.error` handlers:

```typescript
const result = await run(`
  do
    perform(effect(my.risky))
  with
    case effect(dvala.error) then ([msg]) -> "recovered: " ++ msg
  end
`, {
  handlers: {
    'my.risky': async ({ fail }) => {
      fail('something went wrong')
    },
  },
})
// result = { type: 'completed', value: 'recovered: something went wrong' }
```

### Suspend

Call `suspend(meta?)` to pause the entire program. The execution state is captured as a serializable JSON blob that can be stored and resumed later — across processes, machines, or time:

```typescript
const result = await run(`
  let answer = perform(effect(human.approve), "Draft report");
  "Approved: " ++ answer
`, {
  handlers: {
    'human.approve': async ({ args, suspend }) => {
      suspend({ question: args[0] })
    },
  },
})
// result = { type: 'suspended', continuation: '...', meta: { question: 'Draft report' } }

// Later, resume with the human's response:
import { resume } from '@mojir/dvala/full'
const final = await resume(result.continuation, 'Yes')
// final = { type: 'completed', value: 'Approved: Yes' }
```

### Next (Middleware Chaining)

Call `next()` to pass the effect to the next matching handler. Combined with wildcard patterns, this enables middleware-style logging, telemetry, or access control:

```typescript
const log: string[] = []
const result = await run('perform(effect(app.save), "data")', {
  handlers: {
    '*': async ({ effectName, next }) => {
      log.push(`[audit] ${effectName}`)
      next()
    },
    'app.*': async ({ effectName, next }) => {
      log.push(`[app] ${effectName}`)
      next()
    },
    'app.save': async ({ args, resume }) => {
      resume(`saved: ${args[0]}`)
    },
  },
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
const result = await run('perform(effect(my.sub.action), "go")', {
  handlers: {
    'my.*': async ({ args, resume }) => {
      resume(`handled: ${args[0]}`)
    },
  },
})
// result = { type: 'completed', value: 'handled: go' }
```
