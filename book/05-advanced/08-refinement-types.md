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

You can also package a repeated refinement check as a named assertion helper:

```dvala
let assertPositive: (value: Number) -> asserts { value | value > 0 } = (value) -> assert(
  value > 0
);

let usePositive = (value: Positive) -> value;

let f = (x: Number) -> do
  assertPositive(x);
  usePositive(x);
end;
```

The typechecker only trusts user-declared assertion helpers when their body proves the declared predicate on every normal-return path. Today that proof check covers: exact `assert(...)` calls, calls to other verified assertion helpers, and control-flow propagation through `if` / `match`. Match cases narrow on guards that match the target predicate and recognise simple case bindings (`case n then assert(n > 0)` works the same as `assert(x > 0)` when the scrutinee is the asserted parameter).

Current restrictions:

- Assertion helper bodies may not recurse, directly or mutually.
- Assertion helper bodies may not install handlers with `do with ... end`.
- Pattern-binding aliasing only fires for simple symbol bindings (`case n then ...`) when the match's scrutinee is the asserted parameter directly. Destructuring patterns and matches on derived expressions don't substitute.

If the checker cannot prove the helper's contract, the function is rejected rather than treated as an unchecked `assume`.

## Strictness model — "if it compiles it runs"

Refinement subtyping is strict by default. If the solver determines that a source type could carry a value the refinement would exclude, the assignment is rejected at compile time.

```dvala no-run
// Typecheck error: a bare Number could be 0, but Positive excludes 0.
let f = (raw: Number) -> do
  let p: Positive = raw;
  p;
end;
f(5);
```

Three patterns close the gap:

**1. Tighten the upstream type.** Push the refinement back to where the value originates.

```dvala
let toPositive: (n: Number) -> Positive = (n) -> do
  assert(n > 0);
  n;
end;
let p: Positive = toPositive(5);
p;
```

**2. Narrow at the use site with `assert`.**

```dvala
let x: Number = 7;
assert(x > 0);
let p: Positive = x;
p;
```

**3. Pattern-match with a guard.**

```dvala
let usePositive = (p: Positive) -> p;
let x: Number = 7;
match x
  case n when n > 0 then usePositive(n)
  case _ then 0
end;
```

When the solver can't decide a refinement (e.g. disjunctions of intervals like `n > 10 || n < -5`, or relational predicates between two variables), the call is accepted inertly. That conservative fallback is what's left of the older lenience after the strict-by-default switch. As the solver scope expands in later phases, more of those cases will move from "accepted inertly" to "decided".

## Worked examples

### Validation pipeline

A common shape is "untrusted input → checked → typed-positive value":

```dvala
type Score = Integer & {n | 0 <= n && n <= 100};
let validateScore: (raw: Number) -> Score = (raw) -> do
  assert(0 <= raw);
  assert(raw <= 100);
  raw;
end;
let ingest = (name: String, raw: Number) -> { name, score: validateScore(raw) };
ingest("alice", 85);
```

The `assert` calls narrow `raw` to `Number & {n | 0 <= n}` then to `Number & {n | 0 <= n && n <= 100}` — which the solver recognises as a subtype of `Score`.

### Safe arithmetic at API boundaries

```dvala
let safeDiv: (a: Number, b: NonZero) -> Number = (a, b) -> a / b;

let divideIfPositive = (a: Number, b: Number) -> match b
  case n when n != 0 then safeDiv(a, n)
  case _ then 0
end;
```

The guard `n != 0` narrows `n` to `NonZero` for the body. Without the guard the call wouldn't typecheck, because `Number` itself doesn't satisfy `NonZero`.

### Building a non-empty result

```dvala
let firstChar: (s: String & { s | count (s) > 0 }) -> String = (s) -> s[0];
let safeFirst = (s: String) -> match s
  case t when count(t) > 0 then firstChar(t)
  case _ then ""
end;
safeFirst("hello");
```

`count(t) > 0` is in the fragment, so the guard narrows `t` to `String & { s | count(s) > 0 }` and the call is accepted. (The prelude exports `NonEmpty<String>` as an alias for the same shape. The Dvala formatter currently spaces refinement-predicate type annotations differently from other contexts — that quirk is unrelated to refinement semantics.)

## What's enforced today

- Bare primitives (`Number`, `Integer`, `String`, `Boolean`) carry their natural domain — `Number` is `(-∞, ∞)`, `Integer` is `ℤ`, `String` is "count ≥ 0", `Boolean` is `{true, false}`.
- Sequences (`Array<T>`, tuples, `Sequence(min, max)`) carry their statically-known length bounds — `[Number, Number]` against `count > 5` is rejected with witness 2.
- Literal sources fold-discharge: `let x: Positive = 5` succeeds because `5 > 0` reduces to `true`.
- Refined sources compose: `Refined<Number, x, x > 5>` is a subtype of `Refined<Number, n, n > 2>` because `(5, ∞) ⊂ (2, ∞)`.
- Multi-refinement merging collapses `Number & {n | n > 0} & {n | n < 100}` to a single conjunction at the type level.
- Boolean predicates accept the trivial form: `Boolean & {cond | cond}` and `Boolean & {cond | !cond}` are in the fragment.

Out of scope today (deferred to Phase 3+):

- Disjunctions of intervals (`n > 10 || n < -5`) — accepted inertly.
- Multi-variable / relational predicates (`a > b`) — Phase 3.
- Arithmetic on refined variables (`n + 1`, `n * n`) — Phase 3.
- Cross-field record refinements (`{r | r.min <= r.max}`) — Phase 3.
