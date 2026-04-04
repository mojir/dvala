# Parameterized Effects via createState Primitive

**Status:** Draft
**Created:** 2026-04-04

## Goal

Provide a type-system-friendly built-in primitive for creating isolated, parameterized state effects — enabling multiple independent state cells without effect name collisions, while preserving the ability to statically verify effect handling in a future type system.

---

## Background

### Shallow handlers enable state threading

Dvala's shallow handler feature (implemented) allows state threading via recursive re-application:

```dvala
let withState = (s) ->
  shallow handler
    @state.get() -> do let k = resume; withState(s)(-> k(s)) end
    @state.set(v) -> do let k = resume; withState(v)(-> k(null)) end
  end;

withState(0)(-> do
  perform(@state.set, 10);
  perform(@state.get)  // → 10
end)
```

### The problem: hardcoded effect names

This pattern uses fixed effect names (`@state.get`, `@state.set`). Multiple independent state cells collide:

```dvala
// Both use @state.get/@state.set — inner handler shadows outer
withState(0)(-> do
  withState("hello")(-> do
    perform(@state.set, 42);     // sets inner state
    // No way to access outer state — same effect name!
  end)
end)
```

### Why not general dynamic handler clauses?

We considered allowing expressions in handler clause positions (`@(expr)`), but this breaks static effect typing:

- A type checker can't know which effects a handler handles if the name is a runtime expression
- Serialization of dynamic handlers during suspend/resume requires re-evaluating closure-captured expressions
- Adds complexity to parser, evaluator, and dispatch for a rarely-needed general feature

### The insight: typed primitives over general syntax

Languages like Koka solve this with *parameterized effect types* — the type system tracks effect identity statically even though the runtime uses dynamic names. We can achieve the same by making `createState` a **built-in primitive** with a known type signature, rather than a general-purpose language extension.

The type checker reasons about the primitive's signature, not about arbitrary expressions. The dynamic dispatch is an implementation detail.

## Proposal

### API

```dvala
let { createState } = import("effectHandler");

let counter = createState(0);
let name = createState("anonymous");

// Each state cell has its own isolated effects
counter.run(-> do
  name.run(-> do
    counter.set(42);
    name.set("Alice");
    [counter.get(), name.get()]  // → [42, "Alice"]
  end)
end)
```

### Interface

`createState(initialValue)` returns an object with three functions:

| Method | Description |
|---|---|
| `cell.get()` | Returns the current state value. Shorthand for `perform(cell.getEffect)`. |
| `cell.set(value)` | Updates the state. Returns null. Shorthand for `perform(cell.setEffect, value)`. |
| `cell.run(body)` | Runs `body()` under a shallow handler that handles `cell.get()` and `cell.set(v)`. |

### Implementation strategy

Each `createState` call generates a unique effect name pair using a UUID:

```
@state.<uuid>.get
@state.<uuid>.set
```

Under the hood, `cell.get()` calls `perform(@state.<uuid>.get)` and the handler installed by `cell.run` matches that specific UUID. Since the effect names are unique per cell, multiple cells never collide.

The `get()` and `set()` methods are regular Dvala functions — users never see the internal `@state.<uuid>.*` effect names.

### Built-in vs Dvala-implemented

`createState` is implemented in **TypeScript** as a special expression or module function, not in Dvala source. This is necessary because:

1. It needs to generate dynamic effect names (UUID-based)
2. It needs to create a shallow handler with those dynamic names
3. The type system needs to recognize it as a known primitive with a fixed signature

The handler creation happens in TypeScript by directly constructing `HandlerFunction` objects with the dynamically-generated `clauseMap` entries — bypassing the parser entirely.

### Future type signature

For a polymorphic row type system:

```
createState : ∀a. (a) → State a

State a = {
  get  : () → a | {self.get}
  set  : (a) → null | {self.set}
  run  : ∀b ρ. (() → b | {self.get, self.set} ∪ ρ) → b | ρ
}
```

Each `createState` call produces a fresh effect row, so `counter.get` and `name.get` are distinct in the type system. The type checker can verify:
- All state effects are handled (each `get`/`set` is consumed by its `run`)
- No state effects leak to the host
- Nested state cells don't interfere

### Suspend/resume

**Initial implementation:** Suspending a computation that has an active `createState` handler throws a clear error: "Cannot suspend inside createState.run — dynamic handlers are not serializable."

**Future:** Support serialization by storing the UUID + current state value in the snapshot. On resume, reconstruct the handler with the same UUID and restored state.

## Open Questions

- Should `cell.run(body)` return just the body's result, or `{ result, state }` (giving access to final state)?
- Should there be a `cell.update(fn)` method for atomic read-modify-write (`fn(currentState) → newState`)?
- Should the effect names be inspectable (e.g. `cell.getEffect`, `cell.setEffect`) for advanced use cases like handler composition?
- Naming: `createState` vs `state` vs `newState` vs `cell`?
- Should this be in the `effectHandler` module or a new `state` module?

## Implementation Plan

1. **Implement `createState` in TypeScript** — generate UUID-based effects, construct `HandlerFunction` directly, return `{ get, set, run }` object
2. **Add to `effectHandler` module** with docs
3. **Tests** — isolated cells, nesting, sequential independence, error on suspend
4. **Example** — add a playground example demonstrating the pattern
5. **Future** — serialization support, `update(fn)`, type system integration
