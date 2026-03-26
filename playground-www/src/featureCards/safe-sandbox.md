# Safe Sandbox

Dvala code runs in a complete sandbox — **no file system, no network, no global state** — unless the host explicitly grants access through effect handlers.

This makes Dvala safe for:
- **User-submitted scripts** — run untrusted code without risk
- **Plugin systems** — let users extend your app safely
- **Untrusted code** — let users write and run scripts without risking host access

## The Host Controls Everything

Every side effect goes through `perform`, and every effect needs a handler. No handler = no access:

```dvala
// This prints because the playground provides a handler for @dvala.io.print
perform(@dvala.io.print, "I can print!")
```

```dvala
// Random numbers come from the host too
perform(@dvala.random)
```

## Pure by Default

Without effect handlers, Dvala code can only compute — it cannot observe or modify the outside world:

```dvala
// Pure computation — no effects needed
let data = [3, 1, 4, 1, 5, 9, 2, 6];
let sorted = sort(data);
let unique = reduce(sorted, (acc, x) ->
  if isEmpty(acc) || last(acc) != x then push(acc, x) else acc end,
  []
);
unique
```
