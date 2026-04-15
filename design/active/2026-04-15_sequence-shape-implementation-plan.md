# Sequence-Shape Implementation Plan

**Status:** Implemented
**Created:** 2026-04-15

## Goal

Turn the sequence-shape design into a concrete implementation plan for `feat/type-system-step5`, with small enough slices that each stage can be validated independently and reverted safely if needed.

## Outcome

This plan has now been implemented on `feat/type-system-step5`.

Landed slices:

1. `3d8f84ae` — `feat: add sequence type scaffolding`
2. `f391fa1a` — `feat: add sequence subtype support`
3. `76d065de` — `feat: use sequences in array match analysis`
4. `14b395ea` — `feat: preserve rest bindings in destructuring`
5. `361821ad` — `feat: respect builtin shadowing in typechecker`
6. `0b423ee9` — `feat: harden defaulted array match diagnostics`

Validation completed for the shipped implementation:

- `npm run check`
- `npm run test:e2e`

What remains intentionally deferred:

- prettier user-facing rendering for irreducible residual `Sequence` diagnostics
- more precise subtraction through guards on non-symbol destructuring patterns
- extracting sequence analysis into a dedicated helper module if `infer.ts` grows further

---

## Background

The design in [design/active/2026-04-15_sequence-shape-types.md](/Users/albert.mojir/mojir/dvala/design/active/2026-04-15_sequence-shape-types.md) proposes an internal `Sequence` type to model positional constraints, length intervals, and sequence tails.

That design exists because the current type algebra cannot express homogeneous-array residual spaces such as:

- `Number[] \ [1, x]`
- arrays of length `0..1` versus `2..`
- arrays whose first element is not a specific literal

The goal of this plan is not to expose new syntax. It is to land the internal machinery required for correct match subtraction, redundancy warnings, and exhaustiveness checking over array patterns.

## Scope

In scope:

- internal `Sequence` representation in the type algebra
- normalization from `Array` and `Tuple` into `Sequence` for analysis
- sequence-aware subtyping and simplification
- array-pattern to sequence-shape conversion for match analysis
- sequence subtraction for exhaustiveness and redundancy
- tests for rest patterns, defaults, fixed-length, and prefix subtraction

Out of scope:

- user-visible sequence syntax
- full dependent length types
- changing general array inference to always produce `Sequence`
- editor/display polish beyond a debug-friendly representation where necessary

## Recommended Delivery Strategy

Do this as four code slices, not one large rewrite.

1. Add the representation and normalization helpers.
2. Teach subtype and simplify about sequences.
3. Switch match analysis to sequences.
4. Harden with defaults, rest patterns, and diagnostics.

This keeps the risky logic changes late and gives good rollback points.

## Phase 1: Type Algebra and Normalization

**Status:** Implemented

## Goal

Add `Sequence` to the internal type system without changing behavior yet.

## Changes

- Add `Sequence` to [src/typechecker/types.ts](/Users/albert.mojir/mojir/dvala/src/typechecker/types.ts).
- Add constructor helpers, for example `sequence(prefix, rest, minLength, maxLength?)`.
- Add debug-oriented display support in `typeToString`.
- Add structural equality handling for `Sequence` in `typeEquals`.
- Add normalization helpers in `infer.ts` or `types.ts`:
  - `toSequenceType(Array<T>)`
  - `toSequenceType(Tuple<[...])`
  - `normalizeSequenceType(...)`

## Non-goal for Phase 1

- No subtype logic changes yet.
- No match-analysis changes yet.
- No simplification rules beyond keeping the new type structurally well-formed.

## Validation

- New unit tests in [src/typechecker/typechecker.test.ts](/Users/albert.mojir/mojir/dvala/src/typechecker/typechecker.test.ts) or [src/typechecker/parseType.test.ts](/Users/albert.mojir/mojir/dvala/src/typechecker/parseType.test.ts) for equality and display.
- No expected behavioral changes in existing typechecker tests.

## Phase 2: Sequence-Aware Subtyping and Simplification

**Status:** Implemented

## Goal

Make `Sequence` semantically meaningful and interoperable with `Array` and `Tuple`.

## Changes

- Extend [src/typechecker/subtype.ts](/Users/albert.mojir/mojir/dvala/src/typechecker/subtype.ts):
  - sequence-to-sequence subtype checks
  - tuple/array normalization through `Sequence`
  - length interval containment
  - prefix and tail comparison rules
- Extend [src/typechecker/simplify.ts](/Users/albert.mojir/mojir/dvala/src/typechecker/simplify.ts):
  - canonicalize exact sequences back to tuples when possible
  - canonicalize unconstrained sequences back to arrays when possible
  - drop impossible sequence branches
  - merge compatible sequence unions conservatively

## Design guardrails

- Keep `Sequence` internal to subtype and match analysis.
- Preserve current display forms for ordinary tuples and arrays.
- Avoid aggressive branch merging until the subtraction algorithm is stable.

## Validation

- Add direct subtype tests:
  - tuple <: homogeneous array
  - fixed-length sequence <: open-ended homogeneous sequence
  - incompatible length intervals fail
- Add simplify tests:
  - exact `Sequence(..., Never, n, n)` collapses to tuple
  - `Sequence([], Number, 0, undefined)` collapses to `Number[]`

## Phase 3: Match Analysis on Sequences

**Status:** Implemented

## Goal

Switch array-pattern match reasoning from `Array | Tuple` heuristics to proper sequence spaces.

## Changes

- Rework the array side of match analysis in [src/typechecker/infer.ts](/Users/albert.mojir/mojir/dvala/src/typechecker/infer.ts):
  - convert scrutinee array-like types into `Sequence`
  - convert array patterns into `Sequence` constraints
  - use sequence intersection for matched-case narrowing
  - replace tuple-only subtraction with sequence subtraction
- Leave record subtraction untouched unless a helper can be shared cleanly.

## Key supported cases

- `[x]`
- `[x, y]`
- `[x, ...xs]`
- `[1, x]`
- `[1, ...xs]`
- `[x, y = 0]` through explicit union expansion

## Explicitly defer in this phase

- perfect human-readable rendering of sequence residuals
- complicated guards on destructuring patterns beyond current conservative treatment

## Validation

- Extend [src/typechecker/infer.test.ts](/Users/albert.mojir/mojir/dvala/src/typechecker/infer.test.ts):
  - array prefix subtraction
  - rest pattern subtraction
  - exact-length versus 2+ residuals
  - duplicate array prefix branches become redundant
- Extend [src/typechecker/typecheck.test.ts](/Users/albert.mojir/mojir/dvala/src/typechecker/typecheck.test.ts):
  - non-exhaustive `[1, x]` style matches
  - exhaustive prefix coverage without wildcard where representable

## Phase 4: Defaults, Diagnostics, and Hardening

**Status:** Implemented

## Goal

Make the sequence implementation robust enough for general use in Step 4 diagnostics.

## Changes

- Expand defaulted array patterns into explicit sequence unions during match analysis.
- Audit redundancy warnings to ensure impossible-from-the-start cases do not warn.
- Audit non-exhaustive diagnostics to ensure residual sequence output is understandable enough to debug.
- Add targeted guard coverage for destructuring patterns, even if subtraction remains conservative there.

## Validation

- Add regression tests for:
  - `[x, y = 0]`
  - `[1, x]` followed by `[1, y]`
  - `[1, ...xs]` followed by `[1, 2, ...ys]`
  - impossible destructuring against known non-arrays
- Run full validation:
  - `npm run check`
  - `npm run test:e2e`

## Suggested File Touch Order

1. [src/typechecker/types.ts](/Users/albert.mojir/mojir/dvala/src/typechecker/types.ts)
2. [src/typechecker/subtype.ts](/Users/albert.mojir/mojir/dvala/src/typechecker/subtype.ts)
3. [src/typechecker/simplify.ts](/Users/albert.mojir/mojir/dvala/src/typechecker/simplify.ts)
4. [src/typechecker/infer.ts](/Users/albert.mojir/mojir/dvala/src/typechecker/infer.ts)
5. [src/typechecker/infer.test.ts](/Users/albert.mojir/mojir/dvala/src/typechecker/infer.test.ts)
6. [src/typechecker/typecheck.test.ts](/Users/albert.mojir/mojir/dvala/src/typechecker/typecheck.test.ts)

That ordering keeps type representation changes ahead of the more subtle match logic.

## Risk Areas

## 1. Sequence branch explosion

Defaults and prefix subtraction can create large unions quickly.

Mitigation:

- keep subtraction lexicographic and local
- simplify after each subtraction step
- merge only obviously compatible branches at first

## 2. Display degradation

Internal sequence residuals may produce ugly diagnostics.

Mitigation:

- keep debug rendering acceptable but minimal in the first pass
- collapse ordinary cases back to tuples and arrays aggressively

## 3. Subtype regressions outside match analysis

Adding `Sequence` to subtyping can affect existing tuple/array relationships.

Mitigation:

- gate normalization carefully
- add direct subtype regression tests before enabling match changes

## 4. False redundancy from guards

Guards on non-symbol destructuring are still conservative.

Mitigation:

- keep guard subtraction conservative in Step 5
- add tests so the behavior is explicit rather than accidental

## Completion Criteria

Status: met.

This plan is complete when all of the following are true:

- `Sequence` exists as an internal representation
- tuple/array subtyping remains green
- `[1, x]`-style array patterns can produce meaningful residual spaces
- repeated array prefix branches can be reported as redundant when appropriate
- full repo validation passes

## Open Questions

These remain open follow-ups rather than blockers for Step 5.

- Should `Sequence` live permanently in `Type`, or should it be desugared away before the type map is exposed to IDE features?
- Should sequence rendering be hidden entirely from user diagnostics unless no tuple/array form is possible?
- Is it worth introducing a small helper module just for sequence normalization/subtraction to keep `infer.ts` from growing further?

## Implementation Summary

The branch now includes:

1. internal `Sequence` representation and normalization helpers
2. sequence-aware subtype and simplify support
3. sequence-backed array-pattern narrowing and subtraction
4. rest-binding preservation in destructuring and match bodies
5. defaulted array pattern expansion for redundancy/exhaustiveness diagnostics
6. builtin shadowing fixes required to make match-body rest bindings resolve consistently with runtime behavior