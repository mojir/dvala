# Algebraic Effects

Every side effect in Dvala goes through `perform`. The host decides what happens — resume with a value, suspend, or error. Effects are the **only** way out of the sandbox.

```dvala
perform(@dvala.io.print, "hello")
```

```dvala
perform(@dvala.random)
```

```dvala
perform(@dvala.io.pick, ["Red", "Green", "Blue"])
```

## Effect Handlers

Use `handle...with...end` to intercept effects locally:

```dvala
let { fallback } = import(effectHandler);

handle
  let x = 0 / 0;
  x + 1
with fallback(0) end
```

## Effect Pipe

The `||>` operator is shorthand for handle...with:

```dvala
let { fallback } = import(effectHandler);
(0 / 0) ||> fallback(0)
```

## Custom Effects

Define your own effects with `@name` and handle them:

```dvala
handle
  let x = perform(@my.double, 21);
  x
with @my.double(val) -> val * 2 end
```
