# Sequence-Shape Types for Match Analysis

**Status:** Adopted and implemented
**Created:** 2026-04-15

## Goal

Introduce an internal type representation for sequence shapes that can express positional constraints, length constraints, and residual array spaces well enough to support true homogeneous-array subtraction during match exhaustiveness and redundancy analysis.

## Implementation Result

This design has been adopted for the Step 5 array-match work.

Implemented outcomes:

- `Sequence` now exists as an internal type representation in the type algebra
- tuple/array/sequence subtyping and simplification normalize through the sequence model
- array-pattern narrowing and subtraction in match analysis run through `Sequence`
- rest bindings preserve tail shapes in destructuring and match cases
- defaulted array patterns are expanded into explicit length variants for redundancy and exhaustiveness diagnostics

Still intentionally deferred:

- user-facing rendering polish for residual sequence diagnostics that cannot collapse back to tuple/array forms
- stronger subtraction through guards on non-symbol destructuring patterns

---

## Background

The current type algebra distinguishes only two sequence forms:

- `Array<T>` for homogeneous arrays of arbitrary length
- `Tuple<[T0, T1, ...]>` for fixed-length heterogeneous sequences

That is enough for basic element typing and tuple destructuring, but it is not expressive enough for true pattern subtraction over homogeneous arrays.

Examples that the current model cannot represent precisely:

- `Number[] \ [1, x]`
- `String[] \ ["ok", ...xs]`
- arrays of length at least 2 whose first element is not `1`
- arrays of exact length 1 versus arrays of length 2+ when analyzing `[x]` and `[x, y]`

The recent Step 4 work solved the record side by introducing product-style subtraction over finite field spaces, but homogeneous arrays remain blocked by representation, not by subtraction logic.

The problem is structural:

- `Array<T>` says every position has type `T`
- it says nothing about prefix constraints
- it says nothing about minimum or exact length
- it cannot represent the complement of a prefix pattern

So any attempt to do true subtraction with only `Array<T>` either becomes unsound or immediately collapses back to the original type.

## Proposal

Implemented as described below.

Add an internal `Sequence` type that generalizes both tuples and arrays.

```typescript
type SequenceType = {
  tag: 'Sequence'
  prefix: Type[]
  rest: Type
  minLength: number
  maxLength?: number
}
```

Meaning:

- `prefix[i]` constrains the type at position `i`
- `rest` constrains any positions after the prefix
- `minLength` is the minimum allowed length
- `maxLength` when present is the maximum allowed length

This is an internal normalization form for match analysis and subtyping. It does not need new surface syntax in this phase.

## Examples

### Existing types as sequences

```text
Number[]
=> Sequence(prefix: [], rest: Number, minLength: 0, maxLength: undefined)

[Number, String]
=> Sequence(prefix: [Number, String], rest: Never, minLength: 2, maxLength: 2)

[Number, ...Number[]]
=> Sequence(prefix: [Number], rest: Number, minLength: 1, maxLength: undefined)
```

### Pattern spaces as sequences

```text
case [1, x]
=> Sequence(prefix: [1, Number], rest: Never, minLength: 2, maxLength: 2)

case [1, ...xs]
=> Sequence(prefix: [1], rest: Number, minLength: 1, maxLength: undefined)

case [x, y, ...zs]
=> Sequence(prefix: [T, T], rest: T, minLength: 2, maxLength: undefined)
```

### Residual spaces after subtraction

```text
Number[] \ [1, x]
=>
  []
  |
  Sequence(prefix: [!1], rest: Number, minLength: 1, maxLength: 1)
  |
  Sequence(prefix: [!1], rest: Number, minLength: 2, maxLength: undefined)
  |
  Sequence(prefix: [1], rest: Number, minLength: 1, maxLength: 1)
```

That example is intentionally verbose to show the information required. In practice simplification should fold compatible branches.

## Why This Representation

This representation is the smallest useful step beyond `Array<T>` and `Tuple[...]`.

It gives the typechecker four things it currently lacks:

1. Positional information for the first `n` elements.
2. Length intervals instead of only exact tuple length or arbitrary array length.
3. A uniform way to represent both tuples and arrays in one subtraction algorithm.
4. A place to carry complements such as `!1` in a particular position.

It also avoids several more expensive alternatives:

- It does not require full dependent length types.
- It does not require new user-visible syntax.
- It does not require a separate pattern-space side structure disconnected from the type algebra.
- It does not require inferring every array literal as a tuple forever.

## Core Semantics

## Sequence invariants

A `Sequence` value must satisfy all of these:

- length is between `minLength` and `maxLength` if `maxLength` exists
- for each `i < prefix.length`, element `i` is in `prefix[i]`
- for each `i >= prefix.length`, element `i` is in `rest`

Canonical forms:

- exact tuple: `rest = Never`, `minLength = prefix.length`, `maxLength = prefix.length`
- homogeneous array: `prefix = []`, `rest = T`, `minLength = 0`, no `maxLength`
- non-empty homogeneous array: `prefix = []`, `rest = T`, `minLength = 1`, no `maxLength`

## Normalization rules

The typechecker should normalize into `Sequence` only for internal reasoning.

Suggested conversions:

- `Array<T>` -> `Sequence([], T, 0, undefined)`
- `Tuple<[A, B, C]>` -> `Sequence([A, B, C], Never, 3, 3)`
- `Sequence` stays `Sequence`

For display and user-facing errors:

- exact `Sequence(..., Never, n, n)` can render back to tuple syntax
- unconstrained `Sequence([], T, 0, undefined)` can render back to `T[]`
- other shapes can render in an internal debug-oriented format until nicer surface rendering is designed

Example debug rendering:

```text
Sequence<[1, Number], ...Number[], len=2..>
```

## Subtyping Rules

Subtyping should become sequence-aware.

`S <: T` for sequences if:

- `S`'s length interval is contained in `T`'s length interval
- each constrained prefix position in `T` is accepted by the corresponding position in `S`
- `S.rest <: T.rest` for positions beyond `T.prefix.length`

Operationally, the simplest approach is:

1. Normalize both sides to `Sequence` where possible.
2. Compare length intervals.
3. Compare each position up to the longer relevant prefix.
4. Fall back to `rest` after the prefix.

Important subtype relationships:

- `[A, B] <: A | B []` is not the right formulation; instead tuple normalization should make `[A, B] <: Sequence([], A | B, 0, undefined)` succeed elementwise.
- exact tuples are subtypes of sufficiently general arrays.
- prefix-constrained sequences are subtypes of the same sequence with weaker prefix constraints.

## Simplification Rules

Without simplification, subtraction will explode into noisy unions.

Minimum useful simplifications:

1. Merge adjacent sequence branches with identical length intervals and compatible position types.
2. Collapse `Sequence([], T, 0, undefined)` back to `Array<T>`.
3. Collapse exact fixed-length sequences with `rest = Never` back to tuples.
4. Eliminate impossible positions where a prefix element becomes `Never`.
5. Eliminate impossible length intervals where `minLength > maxLength`.

## Match Subtraction Model

Subtraction should be lexicographic over length and then position.

For `from \ subtract` where both are sequences:

1. Split by length interval first.
2. Within overlapping lengths, walk positions from left to right.
3. At each position, emit a branch where all previous positions match exactly and the current position is outside the subtracted pattern.
4. Continue until all constrained positions are accounted for.
5. If the pattern also constrains the length exactly, subtract that exact-length bucket only.

That is the sequence analogue of the record product subtraction already implemented.

## Worked Example

```text
from     = Sequence([], Number, 0, undefined)          // Number[]
subtract = Sequence([1, Number], Never, 2, 2)          // [1, x]
```

Residual branches:

- length `0..1`
- length `2..` with first element `!1`

This is the key capability the current model lacks: subtraction must be able to preserve the fact that the first position was constrained while the tail remains homogeneous.

## Interaction with Existing Pattern Forms

### Plain array pattern

`[a, b]`

- exact length 2
- first two positions constrained by `a` and `b`
- no tail

### Rest pattern

`[a, ...rest]`

- minimum length 1
- first position constrained by `a`
- tail represented by `rest`

### Defaults

`[a, b = 0]`

Should be represented as a union of sequence shapes:

- exact length 1
- exact length 2 with second position constrained by `b`

Defaults therefore become explicit unions over length buckets.

## Open Records vs Sequences

Open-record subtraction worked because a record can preserve unknown extra fields while refining known named fields. `Sequence` is the exact analogue for arrays:

- record unknown extra fields -> sequence tail `rest`
- record known named fields -> sequence prefix positions
- record openness -> sequence length interval plus tail

This symmetry is a strong argument for making `Sequence` a real internal type instead of building a one-off array-pattern remainder structure.

## Alternatives Considered

### 1. Keep `Array<T>` and bolt on a separate remainder structure

Rejected.

This would split match reasoning away from the type algebra and duplicate normalization, subtraction, and display logic.

### 2. Infer all array literals as tuples and rely on union subtraction

Rejected.

Helpful for some examples, but it does not solve subtraction over genuinely homogeneous arrays or annotated `T[]` values.

### 3. Add fixed-length array syntax first (`T[4]`, `T[2..]`)

Deferred.

Potentially useful later, but not required for the internal representation needed now.

### 4. Full refinement types for indices and lengths

Rejected for this phase.

Too large a jump. The sequence-shape problem can be solved with a much simpler structural representation.

## Recommendation

Add `Sequence` as an internal type now, but limit its first use to:

- match-space normalization
- sequence-aware subtyping
- match subtraction / redundancy / exhaustiveness

Do not expose it in user syntax yet.

That keeps the change local, solves the actual blocker, and gives a clean path toward future fixed-size array features.

## Open Questions

- Should `Sequence` be a first-class member of `Type`, or an internal normalized form used only inside subtype/simplify/match analysis?
- Should homogeneous array literals continue to infer as `Array<T>` first and normalize later, or should array literals infer as `Sequence` directly?
- How aggressively should the simplifier merge sequence branches before user-facing diagnostics?
- Should defaults in sequence patterns be expanded immediately to unions, or preserved in a lighter intermediate pattern-space form until subtraction?
- Do we want a debug-only sequence renderer before designing a user-facing representation?

## Implementation Plan

1. Add `Sequence` to the internal type algebra with `prefix`, `rest`, `minLength`, and optional `maxLength`.
2. Add normalization helpers from `Array` and `Tuple` into `Sequence`.
3. Extend subtyping with sequence-aware rules and tuple/array interop through sequence normalization.
4. Extend simplification with sequence canonicalization and branch merging.
5. Rework array-pattern match analysis to produce sequence shapes instead of tuple-or-array fallbacks.
6. Replace tuple-only product subtraction with sequence subtraction over length intervals and constrained prefixes.
7. Add tests for exact-length, minimum-length, rest-pattern, and default-pattern subtraction.
8. Revisit match diagnostics to ensure repeated array prefix patterns become redundant when earlier clauses already consumed their sequence space.
9. Only after the internal model is stable, decide whether any user-visible sequence or fixed-length array syntax should be exposed.