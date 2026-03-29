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

Use `handler...end` to create handlers, and `with` to install them:

```dvala
let { fallback } = import(effectHandler);

do
  with fallback(0);
  let x = 0 / 0;
  x + 1
end
```

## Handler as Function

Handlers can also be called directly with `h(-> body)`:

```dvala
let { fallback } = import(effectHandler);
fallback(0)(-> 0 / 0)
```

## Custom Effects

Define your own effects with `@name` and handle them:

```dvala
do
  with handler @my.double(val) -> resume(val * 2) end;
  let x = perform(@my.double, 21);
  x
end
```
