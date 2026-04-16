# Handler Finally Clause

**Status:** Draft
**Created:** 2026-04-13
**References:** `2026-04-12_type-system.md`

## Goal

Define whether and how Dvala should add a `finally` clause to handlers without blocking the current handler-typing work centered on `perform`, `resume`, and `transform`.

---

## Background

The current type-system write-up already settles the core Phase C handler model:

- effect declarations provide `perform` argument/result types
- `resume` returns the handler answer type
- clause bodies have the handler answer type
- `transform` maps normal body completion into the final answer type

That model is sufficient for the expressive core of algebraic effects. It supports aborting clauses, resumed clauses, and answer-type transformation through `transform`.

What it does not provide is a guaranteed-exit hook for cleanup. This matters for resource management and for expressing "run this no matter how control leaves the handled scope".

The key design pressure is to add cleanup semantics without muddying the already clear role of `transform`.

## Proposal

Add `finally` as a separate, optional handler clause with cleanup semantics only.

### Surface syntax

Preferred syntax:

```dvala
let h = handler
  @my.read() -> resume("value")
  @my.fail(msg) -> { ok: false, error: msg }
transform
  value -> { ok: true, value }
finally
  cleanup()
end;
```

Rationale:

- it matches the existing `handler ... transform ... end` shape
- it keeps effect clauses, normal completion, and cleanup visually distinct
- it avoids making `finally` look like just another handled operation

### Semantics

`finally` is a guaranteed-exit hook.

1. Effect clauses still interpret handled operations.
2. `transform` still runs only on normal completion of the handled body.
3. `finally` runs whenever control exits the handled scope.
4. `finally` runs after `transform` on normal completion.
5. `finally` also runs when an operation clause aborts and does not resume.

This gives a clean semantic split:

- `transform` is for result shaping
- `finally` is for cleanup

### Visibility inside `finally`

Initial design:

- lexical variables remain visible
- handler configuration captured by scope remains visible
- the normal output value is not visible
- `resume` is not visible
- the result of `finally` is ignored

Conceptually, `finally` behaves like:

```dvala
finally
  cleanup()
end
```

not like:

```dvala
finally
  value -> cleanup(value)
end
```

Rationale:

- if `finally` sees the output value, it starts competing with `transform`
- if `finally` can rewrite the output, it becomes a second answer-type hook
- a cleanup-only `finally` can be added later without disturbing the current handler typing story

### Typing

The existing handler typing stays primary:

- `resume : A -> O`
- effect clause bodies have type `O`
- `transform : B -> O`

Add `finally` as a side clause that does not change `O`.

Conceptually:

- `finally : () -> Unit`

or, more precisely, a block checked in the handler scope whose value is ignored.

This means Dvala does not need a fourth handler type parameter just to support `finally`.

Recommended handler shape remains:

- `Handler<B, O, Σ>`

where:

- `B` is the body's normal completion type before `transform`
- `O` is the final outward answer type of the handler
- `Σ` is the handled effect set/signature set

`finally` is orthogonal metadata on the handler, not part of the answer-type transformation.

### Can this be added afterwards?

Yes.

This feature is intentionally designed to be addable after the core Phase C handler typing lands.

Reasons:

1. `finally` does not need to change the meaning of `perform`.
2. `finally` does not need to change the meaning of `resume`.
3. `finally` does not need to change answer-type inference if it cannot rewrite the result.
4. `finally` can be implemented as an evaluator/runtime extension plus one local typing rule.

Recommended staging:

1. finish core handler typing with effect clauses and `transform`
2. stabilize the `Handler<B, O, Σ>` model
3. add `finally` as a focused follow-up feature

This keeps the current type-system write-up moving while preserving a clean upgrade path.

## Deferred Alternatives

These variants are explicitly deferred, not rejected forever.

### `finally` sees the output value

Possible future shape:

```dvala
finally
  value -> observe(value)
end
```

This is useful for logging or metrics, but overlaps with `transform` and weakens the conceptual split.

### `finally` rewrites the output type

Possible future shape:

- `finally : O -> F`
- handler type becomes `Handler<B, O, Σ, F>`

This is more expressive but materially changes the handler type story. It should only be considered if there is a strong use case that cannot be handled by `transform`.

### `finally` sees full exit status

Possible future shape:

```dvala
finally(exit)
  log(exit)
end
```

where `exit` might distinguish normal completion from abort.

This is a reasonable later extension if cleanup code needs to branch on how the handled scope exited.

## Open Questions

- Should `finally` be required to return `Unit`, or should any result be allowed and ignored?
- Should `finally` be allowed to perform handled effects, or should that be rejected to avoid re-entrancy surprises?
- If Dvala ever supports multi-shot resumptions, does `finally` run once per exit path, once per resumed strand, or only on final discharge?
- Do we eventually want `finally(exit)` without exposing the handled output value?

## Implementation Plan

1. Keep `2026-04-12_type-system.md` as the authoritative core type-system document for Phase C.
2. Finish handler typing for effect clauses, `resume`, aborting clauses, and `transform` without blocking on `finally`.
3. Add parser and AST support for an optional `finally` clause using the preferred surface syntax.
4. Define evaluator semantics so `finally` runs on normal completion after `transform`, and also on aborting exits.
5. Add a minimal typing rule: `finally` is checked in handler scope, cannot access `resume`, and does not change the handler answer type.
6. Add tests for normal completion, aborting clauses, nested handlers, and interactions with `transform`.