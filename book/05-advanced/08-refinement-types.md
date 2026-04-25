# Refinement types

A refinement type narrows a base type with a predicate. `Number & {n | n > 0}` is "any number `n` such that `n > 0`" — strictly positive.

The standard prelude ships four common refinements that are auto-loaded into every typecheck session, like core builtins. You can use them anywhere without `import`.

## The four prelude aliases

### `Positive` — strictly positive numbers

```dvala
type Positive = Number & {n | n > 0};
```

Use when zero would be meaningless. The classic case is division-safety preconditions for any function that scales or divides.

### `NonNegative` — zero-or-positive numbers

```dvala
type NonNegative = Number & {n | n >= 0};
```

Use for array-indexing preconditions or "natural numbers" in the CS sense. Different from `Positive` because zero is allowed.

### `NonZero` — anything except zero

```dvala
type NonZero = Number & {n | n != 0};
```

The minimum precondition for division. `Positive` is stricter than necessary if negatives are also fine.

### `NonEmpty<T>` — non-empty sequences

```dvala
type NonEmpty<T: Sequence> = T & {xs | count(xs) > 0};
```

Generic over both arrays and strings via the `T: Sequence` bound. Use it for functions like `head` or `firstChar` that have no sensible result on empty input. Annotation forms include `NonEmpty<Number[]>` for non-empty arrays of numbers and `NonEmpty<String>` for non-empty strings.

## Using a prelude alias

Prelude aliases are just type names — use them like any other annotation:

```dvala
let x: Positive = 5;
x;
```

```dvala
let y: NonNegative = 0;
y;
```

```dvala
let n: NonZero = -3;
n;
```

The typechecker fold-discharges literal values against refinement targets. `let x: Positive = -5` is rejected at compile time because `-5 > 0` folds to `false`.

## Writing your own

Prelude aliases are just regular type aliases — you can define additional refinement types in your own source:

```dvala
type Score = Integer & {n | 0 <= n && n <= 100};
let s: Score = 85;
s;
```

User-declared aliases shadow prelude aliases of the same name, so you can override `Positive` (or any other) with a stricter or different definition if needed.

## Narrowing with `assert` and guards

For non-literal sources (function parameters, expression results), use `assert` to narrow inside a `do` block — see the assertions and pattern-matching chapters for details. `if` and `match` guards also narrow when the condition is in the refinement fragment (single-symbol relations like `x > 0`, type guards, equality).

## What's enforced today

The static analysis is intentionally conservative: when the solver can't decide a refinement holds, the call is accepted to avoid false positives. As the solver matures, refinement violations will become more strictly enforced at call sites.
