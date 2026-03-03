# Effects

Dvala uses algebraic effects to handle interactions with the outside world. Any operation that isn't pure computation — logging, fetching data, waiting for a human — is an **effect**.

## Creating Effects

Use `effect(name)` to create an effect reference. The name is a dotted identifier:

```
effect(dvala.log)
```

Effect references are first-class values — you can store them, compare them, and pass them around:

```
let log = effect(dvala.log);
==(log, effect(dvala.log))
```

## Performing Effects

`perform` invokes an effect. The nearest matching handler intercepts it:

```
do
  perform(effect(dvala.log), "hello")
with
  case effect(dvala.log) then ([msg]) -> msg
end
```

## Do / With Handlers

`do...with...end` establishes local effect handlers. The handler receives the effect's arguments as an array:

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

## Error Handling

Errors in Dvala are effects too. `perform(effect(dvala.error), msg)` raises an error, and `do...with` catches it:

```
do
  perform(effect(dvala.error), "oops")
with
  case effect(dvala.error) then ([msg]) -> "caught: " ++ msg
end
```

Runtime errors (like dividing by zero) are automatically routed through `dvala.error`:

```
do
  1 / 0
with
  case effect(dvala.error) then (args) -> "division error"
end
```

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

When running Dvala from JavaScript/TypeScript, you register **host handlers** via the `run()` function. Host handlers are async functions that receive a context object.

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

- **Exact**: `'my.effect'` — matches only `my.effect`
- **Prefix wildcard**: `'my.*'` — matches `my.effect`, `my.sub.deep`, and `my` itself
- **Catch-all**: `'*'` — matches everything

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
