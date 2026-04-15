# Scalar-Only Math Builtins

**Status:** Draft
**Created:** 2026-04-15

## Goal

Redefine Dvala's builtin math functions so they operate on scalar numbers only, and remove implicit vector/matrix broadcasting from the runtime.

---

## Background

Today many core math builtins operate on numbers, vectors, and matrices in the runtime. Examples include `inc([1, 2, 3])`, `[1, 2, 3] + 2`, and `[[1, 2], [3, 4]] * 2`. This behavior is reflected in builtin docs and partially reflected in the type system through explicit overloads in `src/builtin/core/math.ts`.

This creates three problems:

- The language semantics for math are broader than the type system can express cleanly.
- The current overload model scales poorly as broadcasting rules get richer.
- Builtin math semantics overlap with collection-processing semantics (`map`, vector helpers, matrix helpers), which makes the language surface less crisp.

The alternative direction is to make builtin math scalar-only and require explicit lifting when users want element-wise collection behavior.

## Proposal

Builtin math functions in core should accept and return only `Number` values unless a function is explicitly documented as collection-aware for a separate reason.

Decision: keep `min` and `max` collection-aware. All other core math builtins should become scalar-only.

Examples of the intended new semantics:

- `inc(1)` remains valid.
- `inc([1, 2])` becomes a runtime error and a type error.
- `+(1, 2, 3)` remains valid.
- `+(1, [10, 20])` becomes a runtime error and a type error.
- `+([1, 2], [10, 20])` becomes a runtime error and a type error.
- `map([1, 2], inc)` remains the explicit way to lift scalar math over collections.

This change is intentionally semantic, not just type-level. The runtime and the typechecker should agree.

## Non-Goals

- This does not forbid users from defining their own functions that operate on both `Number` and `Number[]`.
- This does not remove higher-level vector or matrix operations from dedicated modules.
- This does not prevent introducing explicit broadcasting helpers later.

## Why This Is Attractive

- Math semantics become simple: core math means scalar math.
- Builtin type signatures become small and predictable.
- The type system no longer needs a dedicated broadcasting feature just to explain existing core runtime behavior.
- Collection lifting becomes explicit in user code, which improves readability and makes failure modes easier to reason about.

## Costs

- This is a breaking language change.
- Existing examples, docs, and user code that rely on implicit element-wise math will need migration.
- Some terse expressions become more verbose because users must write `map(xs, inc)` instead of `inc(xs)`.
- Vector and matrix ergonomics in the core language become less magical.

## Type System Implications

### Immediate simplification

This change removes pressure to model broadcasting in the type system.

The roadmap item `Broadcasting types` in `design/active/2026-04-12_type-system.md` can either be dropped entirely or reframed as an optional future feature for explicit broadcasting helpers rather than builtin scalar math.

Builtin signatures in `src/builtin/core/math.ts` can collapse from overload sets like:

```ts
((Number) -> Number) & ((Number[]) -> Number[]) & ((Number[][]) -> Number[][])
```

to simple scalar forms like:

```ts
(Number) -> Number
```

and from:

```ts
(() -> Number) & ((Number, ...Number[]) -> Number) & ((Number[], ...Number[][]) -> Number[]) ...
```

to:

```ts
(() -> Number) & ((Number, ...Number[]) -> Number)
```

### No loss of expressive power for user-defined functions

Users can still define functions that intentionally support multiple shapes.

Examples:

- A user-defined helper can branch at runtime on `isNumber(x)` vs `isArray(x)`.
- A type annotation can still describe a function as accepting `Number | Number[]`.
- If Dvala continues to support intersection-style overloads for functions, a user-defined helper can still model separate scalar and vector cases.

This means the proposal narrows builtin semantics without narrowing the language's overall type expressiveness.

### Better separation of concerns

After this change:

- Core math builtins express scalar numeric operations.
- Collection builtins express traversal and explicit lifting.
- Vector and matrix modules can provide domain-specific collection math where that is still desirable.

That division is easier for the typechecker to model and easier for users to predict.

## Runtime Implications

The runtime implementation of math builtins will need to stop dispatching across number/vector/matrix shapes for the affected core functions.

Instead, they should:

- accept scalar numbers only,
- raise normal runtime type errors for arrays, matrices, strings, and objects,
- preserve existing scalar variadic behavior where appropriate.

This likely means replacing helpers like `unaryMathOp`, `binaryMathOp`, and `reduceMathOp` with scalar-only variants or adding an explicit strict mode to those helpers.

## Surface Area Likely Affected

### Core math builtins

Planned scalar-only core builtins:

- `inc`
- `dec`
- `+`
- `-`
- `*`
- `/`
- `%`
- `mod`
- `^`
- `abs`
- `sqrt`
- `cbrt`
- `round`
- `trunc`
- `floor`
- `ceil`
- `sign`

Collection-aware exceptions to keep:

- `min`
- `max`

Rationale:

- `min` and `max` are aggregators rather than element-wise arithmetic.
- `min([2, 0, -1])` and `max([2, 0, -1])` remain concise and intuitive.
- Keeping them does not require the type system to model shape-preserving broadcasting semantics.

### Docs and examples

Need updates in:

- `src/builtin/core/math.ts`
- generated reference content
- README / book examples that currently rely on implicit broadcasting
- example programs and example-derived docs that currently rely on implicit broadcasting
- any documentation pages that describe core math as vector/matrix-aware or broadcast-aware

### Tests

Need updates to:

- runtime tests that currently assert vector/matrix math through core builtins
- reference tests derived from builtin examples
- typechecker tests that currently expect lifted math to typecheck

## Migration Strategy

### Option A: hard cut

Make the runtime and type changes in one release.

Pros:

- simplest implementation
- no transitional mismatch between runtime and types

Cons:

- breaking change lands all at once

### Option B: deprecation period

Add warnings or migration notes first, then remove broadcasting later.

Pros:

- easier on users

Cons:

- more implementation complexity
- Dvala currently does not appear to have a builtin deprecation-warning mechanism for this class of semantic change

Recommended approach: Option A unless there is strong evidence of existing user code depending heavily on implicit math broadcasting.

## Recommended Replacement Patterns

Users should write explicit lifting instead of relying on scalar math over collections.

Examples:

- `inc(xs)` -> `map(xs, inc)`
- `xs + ys` -> `map(xs, ys, +)`
- `xs + 2` -> `map(xs, -> $ + 2)`
- `abs(matrix)` -> `map(matrix, -> map($, abs))` or a dedicated matrix helper

If this feels too verbose, that is a signal to add explicit helpers such as:

- `mapScalar`
- `zipWith`
- vector-module arithmetic helpers
- an explicit future `broadcast` helper

Those helpers are easier to document and type than implicit lifting inside scalar math builtins.

## Open Questions

- Should vector and matrix modules gain first-class arithmetic helpers before removing implicit lifting from core math?
- Should explicit broadcasting be introduced later as a library-level helper instead of a builtin semantic rule?
- Do we want a codemod or migration note for the most common rewrites (`inc(xs)` -> `map(xs, inc)`, `xs + ys` -> `map(xs, ys, +)`) ?

## Implementation Plan

1. Audit `src/builtin/core/math.ts` and separate scalar-only builtins from the `min`/`max` exceptions.
2. Change runtime helper implementations so scalar-only builtins reject non-number inputs.
3. Preserve `min` and `max` vector-aware aggregation behavior.
4. Simplify builtin type signatures to scalar-only forms for the affected functions.
5. Update builtin descriptions and examples to remove implicit broadcasting examples from scalar-only functions.
6. Add runtime regression tests proving collection arguments now fail for scalar-only math builtins.
7. Add typechecker regression tests proving collection arguments are rejected for scalar-only math builtins.
8. Keep or refine `min`/`max` tests and docs to document their remaining vector-aggregation behavior.
9. Update all affected documentation to match the new scalar-only semantics, including builtin docs, generated reference content, examples, README material, and the book.
10. Update example programs and user-facing sample code to use explicit `map` or module helpers instead of implicit broadcasting.
11. Revisit `design/active/2026-04-12_type-system.md` and remove or rewrite the `Broadcasting types` item to reflect the new direction.

## Recommendation

If the design goal is conceptual clarity, this is a good change.

The key rule is: do not only simplify the types. Simplify the runtime and the docs at the same time.

If Dvala keeps implicit broadcasting in runtime, the type system should eventually model it. If Dvala does not want that complexity, the clean answer is to remove broadcasting semantics from core math entirely and make lifting explicit.