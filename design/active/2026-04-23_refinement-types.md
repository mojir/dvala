# Bounded Refinement Types — Implementation Plan

**Status:** Proposed — implementation plan. Tier B (bounded refinements) is the chosen scope.
**Created:** 2026-04-23
**Last updated:** 2026-04-24 (readiness-pass interview: Phase 1 narrowed to parse + reject only; predicate AST reuses Dvala `AstNode`; `count(var)` validation uses subtype query; tagged `RefinementError` with `kind` field; Phase 1 rejection-fixture list locked)
**Supersedes design-time decision:** Type-system plan decision #15 parked refinement types as "Phase D+, don't do now". This doc reopens the question and picks a concrete direction.
**Requires (Phase 0):** Generic upper-bound syntax (`T: U`) — **Phase 0a shipped 2026-04-24** (type-alias bounds + annotation-scoped function bounds). Phase 0b (let-binding-scoped `<T>`) remains deferred. See `2026-04-24_upper-bounds.md`. Phase 1 of refinements can now start; the declaration-time fragment check for `count(var)` on sequence-bounded generics is supported.
**References:** `2026-04-12_type-system.md` (set-theoretic foundation, decision #15), `2026-04-13_bundle-type-metadata.md` (manifest / host boundary validation), `2026-04-23_type-level-computation.md` (sibling Phase D track)

---

## Decision

**Ship Tier B: bounded refinement types.** Custom decision procedure, no external SMT. Scope is chosen so the checker **always terminates with a clear verdict** — "proved", "disproved with counter-example", or "outside my fragment, please rewrite".

No "solver timed out" errors. No Z3 dependency. No WASM bloat in the playground. KMP runtime unaffected.

---

## What are refinement types?

A refinement type is a base type plus a predicate. Instead of just `Number`, you get `Number where n > 0`. The type system carries the predicate and proves it holds at every use of the value.

```dvala
type Positive = Number & {n | n > 0}
type NonEmpty<T> = T[] & {xs | count(xs) > 0}
type Score = Integer & {n | 0 <= n && n <= 100}
```

The type checker then has to prove:

- `42 : Positive` → OK (`42 > 0` is true).
- `x + y : Positive` where `x: Positive`, `y: Positive` → provable (positive + positive = positive).
- `x - y : Positive` where both positive → **UNPROVABLE** (x - y could be negative).

The canonical pain points refinement types solve — array bounds, division by zero, state machines with impossible transitions, validated-vs-raw strings — become statically checked.

```dvala
let head = (xs: T[]) -> xs[0]           // today: fails at runtime if xs is empty

let head = (xs: NonEmpty<T>) -> xs[0]   // with refinements: checker rejects empty at call sites
```

---

## Why Tier B (and not A or C)

Three tiers are possible:

| Tier | Scope | Solver | Verdict |
|---|---|---|---|
| A | Today's Dvala. Unions, intersections, negations, literal types. | None | 90% coverage. No refinement story. |
| **B** | **Literal tags, finite domains, intervals on integers, linear arithmetic.** | **Custom decision procedure (~2–3k LOC TS)** | **Covers array bounds, state-machine states, non-zero, interval constraints.** |
| C | Arbitrary predicates. | External SMT (Z3) | Liquid Haskell territory. Multi-year research project. |

**Tier B is the sweet spot** because everything it covers is **decidable in polynomial time**. The scary Tier C timeouts come from two sources, both excluded from B:

- Nonlinear arithmetic (`x * y < N`) — undecidable in general.
- Quantifiers (`forall x. ...`) — semi-decidable at best.

Neither is writeable in B, so neither can hang the checker. Worst-case cost is bounded and knowable. Error mode on an unsupported predicate is **"we don't handle this — please rewrite"**, not **"we gave up"**.

### What Tier B delivers

- `Number & !0` for division safety.
- `Integer & {i | 0 <= i && i < N}` for array-index safety, when `N` is a concrete literal or expression over literals.
- `Atom & (:a | :b)` type refinements (already exists as atom unions).
- Interval / range types over integers.
- Finite-domain refinements (e.g. `Color & (:red | :green | :blue)`).
- Linear equality and inequality between refined variables (`x < y`, `a + b == c`).

### What Tier B does NOT deliver

- Dependent relations across function args outside linear arithmetic (`f(x, y)` where `y == square(x)`).
- Recursive predicates.
- Quantified predicates.
- Arbitrary-expression refinements.

These are explicitly rejected at parse time with a structured "outside the bounded fragment" error.

---

## Scope

Refinement predicates are classified by **one accepted static fragment** plus an **explicit runtime-validation path**:

- **Solver fragment** — predicates the decision procedure reasons about. Proofs, narrowing, disproofs, counterexamples all apply here. This is the fragment accepted in written refinement annotations.
- **Runtime validation** — arbitrary pure Boolean checks remain useful, but they are expressed explicitly with `assert(...)` (or APIs built on the same assertion mechanism), not as opaque refinement annotations.

This replaces the earlier "boundary fragment" idea. Opaque predicates (e.g. `contains(s, "@")` for an email-ish check, or `sequence.startsWith(s, "http")`) are still valid runtime checks, but they are not part of the refinement-annotation language unless and until the typechecker can reason about them.

### Universal requirements

Every refinement predicate accepted in annotations, and every Boolean used for explicit runtime validation, must be:

- **Boolean-typed.** The expression must have type `Boolean`. No implicit truthy-coercion; `{s | s}` is a type error. Users write `count(s) > 0`, `n != 0`, `r != null` explicitly. Matches Dvala's strict-null direction (Decision #14): types are what they are, conversions are explicit.
- **Pure.** No `perform`, no handler invocation, no function with a non-empty effect set. Enforced by the fragment-checker via effect-set analysis. Refinements describe **values**, not behaviors — effectful predicates are a category error.

These requirements are mandatory; a predicate failing either is rejected at declaration time with a clear error.

### Solver fragment (Tier B)

Forms the decision procedure reasons about directly:

```
p ::= true | false
    | lit                    -- literal equality
    | atom                   -- atom equality
    | e REL e                -- relational: ==, !=, <, <=, >, >=
    | e in TYPE              -- set-theoretic membership
    | guardCall(var)         -- type-guard builtin (e.g. isNumber, isString, isInteger)
    | p && p | p || p | !p   -- boolean algebra

e ::= var | lit
    | e + e | e - e          -- linear arithmetic
    | k * e                  -- scalar multiplication (k is integer literal)
    | count(var)             -- special: sequence length (treated as refined non-negative integer)
```

Type-tag checks are expressed as calls to existing Dvala type-guard builtins — `isNumber(x)`, `isInteger(x)`, `isString(x)`, `isSequence(x)`, `isAtom(x)`, etc. These already carry type-guard signatures (`(x) -> x is T`) in the builtin type registry; the fragment-checker recognizes them as narrowing-eligible calls and treats them as fragment-atomic. No new `is?` infix operator is added — the builtins already cover the need and users already know the names.

`count(var)` is allowed when `var` has sequence type (Array or String in Dvala's `isSequence` sense). Records excluded from `count` in v1 — no compelling refinement use case (no one constrains "record with N fields" when they can enumerate fields). Additive if demand emerges.

(Note: "sequence" here means the user-facing Array-or-String grouping from `isSequence`, not the typechecker's internal `Sequence` tag used for match-narrowing shape inference.)

### Explicit runtime validation

Any **pure Boolean-typed** expression still qualifies as a runtime check, but it is written explicitly with `assert(...)` rather than embedded as an opaque refinement annotation.

```dvala
assert(contains(email, "@"))
assert(sequence.startsWith(url, "http"))
assert(isPositiveEven(n))
```

This keeps the type-level story simple:

- written refinement annotations are statically checkable claims
- dynamic validation is opt-in and explicit at the call site or boundary
- `assert(...)` can still feed flow narrowing when its predicate is in the supported fragment

### Opacity classification

Predicates carrying any non-solver-fragment term are **opaque** as a whole. Under this plan, opaque predicates are runtime-validation-only; they are not accepted as written refinement annotations. Rules for compound forms:

| Predicate shape | Classification | Solver behavior |
|---|---|---|
| All subterms solver-fragment | **fragment** | direct reasoning |
| Conjunction `P && Q` where each conjunct is fragment OR opaque | **opaque** in written refinements; split manually into static refinement + explicit `assert(Q)` if both are wanted |
| Disjunction `P \|\| Q` with all disjuncts solver-fragment | **fragment** | native handling by solver |
| Disjunction with any opaque disjunct | **opaque** | runtime-only |
| `!P` where P solver-fragment | **fragment** | negation is in Tier B boolean algebra |
| `!P` where P opaque | **opaque** | |
| Named predicate call `f(v)` | **opaque** (body not inlined) | runtime-only; inline the body if solver reasoning is desired |
| Effectful predicate | **rejected at declaration** | not a valid refinement |

**Consequence for named vs. inlined predicates:**

```dvala
let isNonBlankHttp = (s: String) -> count(s) > 0 && sequence.startsWith(s, "http")

// Runtime validation path — explicit and fully allowed:
assert(isNonBlankHttp(url))

// Static refinement path — keep only the solver-fragment part in the type:
type NonBlank = String & {s | count(s) > 0}
assert(sequence.startsWith(url, "http"))
```

Semantically, both styles can enforce the same runtime property. The difference is explicitness: solver-fragment facts live in types; opaque checks live in `assert(...)`. Users learn the idiom: **put statically-provable facts in the refinement, keep domain-specific validation explicit at runtime**.

### Out of scope (would require Tier C)

Concrete examples of what Tier B's decidable fragment cannot express:

```dvala
// Variable × variable (non-linear) — parametric-size types fall here:
type Matrix<N, M> = Integer[] & {xs | count(xs) == N * M}           // OUT
let index: (row, col, N, M) -> Integer & {i | i < N * M}            // OUT

// Division / modulo — not in linear arithmetic:
let half: (n: Integer) -> Integer & {h | h == n / 2}                // OUT
let parity: (n: Integer) -> Integer & {p | p == n % 2}              // OUT

// Polynomial — var × var:
type Square = Integer & {n | n * n < 100}                           // OUT

// Quantifiers:
type Sorted = Integer[] & {xs | forall i. xs[i] <= xs[i+1]}         // OUT
type AllPositive = Integer[] & {xs | all(xs, (x) -> x > 0)}         // OUT

// Arbitrary string-content theory:
type Email = String & {s | matches(s, /^[^@]+@[^@]+$/)}
  // Accepted as OPAQUE (boundary-validated, solver treats as black box).
  // Solver cannot decompose or reason about the regex structure.
```

Summarized:

- **Variable × variable** — non-linear, outside the solver fragment. Parametric-size types (`Matrix<N,M>`, `FixedBuffer<Size>`) fall here. Predicate is accepted as opaque if wrapped in a Boolean-returning call, but the solver gives no insight.
- **Division / modulo** — not in the linear fragment. Users rewrite with bounds (`2 * h == n`) or fall back to opaque predicates.
- **Polynomial / `x * x` etc.** — same variable-times-variable problem.
- **`forall` / `exists` quantifiers** — rejected at declaration. No practical runtime evaluation semantics for quantification over unbounded domains at a boundary either.
- **Regex / string-content theory inside the solver** — rejected for reasoning; allowed as opaque (boundary-validated).
- **Recursion in predicates** — rejected at declaration; would risk boundary non-termination.

### Out of scope (syntactic sugar, not capability)

- Higher-kinded refinement abstraction (refinement as a first-class value).
- Refinement inference (inferring `Positive` without the user writing it).
- `transparent` / `inline` modifier for user-defined predicates (exposing bodies to the solver) — potential v2+ feature, see Open questions.

---

## Predicate syntax

**Decision:** Set-builder notation with an explicit binder — `Base & {binder | predicate}`.

```dvala
type Positive = Number & {n | n > 0}
type Score = Integer & {n | 0 <= n && n <= 100}
type NonEmpty<T: Sequence> = T & {xs | count(xs) > 0}
type Range = {min: Number, max: Number} & {r | r.min <= r.max}
```

**Parser disambiguation from record literals.** After `&`, the parser looks ahead for `{ IDENT |`. Record literal `{a: 1}` has `:` after the first token; refinement predicate `{n | …}` has `|`. One-token lookahead, no ambiguity.

**Why this form (considered alternatives):**

- **`where` keyword** (`Number where n > 0`) — reads naturally but needs a convention for the implicit binder (`self`? the type name?). Gets awkward for compound refinements (`Range where self.min <= self.max` vs. `{r | r.min <= r.max}`).
- **Postfix brackets** (`Number[n > 0]`) — visually clashes with indexed-access `T[K]` (shipped) and literal-length `Number[4]` (future). Same-symbol-different-meaning creates parsing edge cases and reader confusion.

The set-builder form with explicit binder is the only option without either ambiguity or special cases. It matches mathematical set-builder notation (familiar to users from Haskell, Python comprehensions, or math background).

---

## Example refinement types (library patterns)

Concrete library patterns Tier B Level 3 enables. Each shows a motivating use case, the predicate form, and which solver capability it exercises. These are the "ship gate" examples for Phase 3.

### 1. Scaling conversions — `Percent → Permille`

```dvala
type Percent  = Integer & {n | 0 <= n && n <= 100}
type Permille = Integer & {n | 0 <= n && n <= 1000}

let toPermille: (p: Percent) -> Permille = (p) -> p * 10
```

Solver obligation: prove `0 <= p*10 <= 1000` from `0 <= p <= 100`.

Single variable, scalar multiplication by literal coefficient 10. General case: integer scaling conversions — basis-points-from-percent, microseconds-from-milliseconds, cents-from-dollars.

### 2. Multi-field unit conversions — `TimeOfDay → seconds`

```dvala
type TimeOfDay = {
  hours:   Integer & {h | 0 <= h && h < 24},
  minutes: Integer & {m | 0 <= m && m < 60},
  seconds: Integer & {s | 0 <= s && s < 60}
}

let toSeconds: (t: TimeOfDay) -> Integer & {n | 0 <= n && n < 86400}
  = (t) -> t.hours * 3600 + t.minutes * 60 + t.seconds
```

Solver obligation: prove `0 <= h*3600 + m*60 + s < 86400` from the field bounds.

Multi-field, weighted sum with large literal coefficients (3600, 60). General case: any library converting between units in multi-field records — bytes/KB/MB, degrees/radians, pixels/points.

### 3. Byte packing — `RGB → 24-bit integer`

```dvala
type Byte = Integer & {n | 0 <= n && n < 256}
type RGB  = {r: Byte, g: Byte, b: Byte}

let pack: (c: RGB) -> Integer & {n | 0 <= n && n < 16777216}
  = (c) -> c.r * 65536 + c.g * 256 + c.b
```

Solver obligation: prove the packed result stays within 24-bit range.

Multi-field weighted sum with power-of-two coefficients. General case: byte-packing, bit-field manipulation, network-protocol serialization.

### 4. Sum-to-constant invariants — `BudgetAllocation`

```dvala
type BudgetAllocation = {
  payroll:    Integer & {n | n >= 0},
  operations: Integer & {n | n >= 0},
  savings:    Integer & {n | n >= 0}
} & {b | b.payroll + b.operations + b.savings == 100}

let rebalance: (b: BudgetAllocation, delta: Integer) -> BudgetAllocation
  = (b, delta) -> {
      payroll: b.payroll + delta,
      operations: b.operations - delta,
      savings: b.savings
    }
```

Solver obligation: prove the output still sums to 100.

Three-variable sum equality with ±1 coefficients. General case: budget splits, probability distributions summing to 1, resource quotas, RGB-sum balance.

### 5. Weighted business-rule constraints — `ValidShipment`

```dvala
type ValidShipment = {weight: Integer, volume: Integer}
  & {s | 3 * s.weight + 2 * s.volume <= 1000}
```

Solver obligation: enforce the weighted-sum inequality at construction and mutation sites.

Two-variable weighted linear inequality. General case: pricing/discount rules, physics constraints, linear-optimization inputs.

### 6. Cross-field ordering — `Range`

```dvala
type Range = {min: Number, max: Number} & {r | r.min <= r.max}
type Interval = {start: Integer, end: Integer} & {i | i.start < i.end}
```

Solver obligation: prove the ordering invariant at every construction site and after any mutation.

Two-variable relational constraint. General case: interval types, temporal ranges, bounded regions, `start < end` invariants.

### Plus the small cases already implicit in the design

- `type Positive = Number & {n | n > 0}` — single-variable, simple bound. Phase 2 interval solver.
- `type NonEmpty<T: Sequence> = T & {xs | count(xs) > 0}` — collection-length refinement. Phase 2.
- `type Score = Integer & {n | 0 <= n && n <= 100}` — bounded-range integer. Phase 2.
- `type NonBlank = String & {s | count(s) > 0}` — non-empty string. Phase 2.

### Number vs Integer refinements — float-rounding caveat

Dvala's `Number` is IEEE 754 float64. The solver reasons symbolically over **exact rationals**, not over float-with-rounding. For inclusive bounds and reasonable value ranges, float behavior matches the symbolic claim exactly:

```dvala
type Percent = Number & {n | 0 <= n && n <= 100}      // works fine
// Float behavior agrees with symbolic reasoning for every representable Percent value.
```

At the strict edges, float rounding can nominally violate what the checker proved (1-ULP margin):

```dvala
type StrictPercent  = Number & {n | 0 < n && n < 100}
type StrictPermille = Number & {n | 0 < n && n < 1000}
let toPermille: (p: StrictPercent) -> StrictPermille = (p) -> p * 10
// Symbolically: p < 100 ⇒ p*10 < 1000. Proved.
// Runtime edge case: p = 99.99999999999999 (largest double < 100).
//   p * 10 in float64 may round to exactly 1000.0, violating "< 1000".
```

**The contract Dvala accepts:**

- **Internal code trusts the solver's symbolic proof.** Refinements describe the mathematical claim; 1-ULP edge cases are accepted as out-of-scope for the type system.
- **Boundary validation catches actual violations.** When a value crosses a trust boundary (host handler return, snapshot load), the validator runs the predicate on the float value. If float rounding pushed it over the bound, the boundary check fails — with a clear error at the boundary, not silent corruption.
- **Users who need exact behavior use `Integer`.** Integer refinements have no rounding at all; the solver's symbolic reasoning and runtime behavior always agree. For most unit-conversion and packing use cases (examples 1-4 above), Integer is the natural domain anyway.

This is the same contract Liquid Haskell and similar systems use. Option 2 alternatives (restrict Number refinements to no-arithmetic, or build an IEEE-aware solver) were explicitly rejected — the first is too restrictive, the second is a research project.

---

## Decision procedure — high-level design

A single function:

```typescript
type Verdict =
  | { tag: 'Proved' }
  | { tag: 'Disproved'; counterexample: Map<string, Value> }
  | { tag: 'OutOfFragment'; reason: string }
```

```typescript
function decide(
  assumptions: Predicate[],   // facts already known
  goal: Predicate,            // the claim to prove
): Verdict
```

### Internal structure

Three sub-solvers, composed:

1. **Finite-domain solver.** Atom/literal/tag refinements. Reduces to set membership. Trivial — already exists in the set-theoretic algebra.
2. **Interval solver.** Integer intervals with open/closed bounds. `n > 0 && n < 10` → `n ∈ [1, 9]`. Standard interval arithmetic + narrowing.
3. **Linear-arithmetic solver.** Presburger-fragment decision procedure (Omega test or Simplex-like). Handles `a + b == c`, `x < y + k`, etc. ~1–2k LOC, well-documented algorithms.

The dispatcher picks the smallest solver that handles the goal. Fragment-check runs first — if the predicate references anything outside the fragment, we return `OutOfFragment` before any solving.

### Termination contract

- The Phase 2.3/2.4 solver as shipped is **non-iterative**: it computes domain intersections and unions algebraically over a closed family of `interval` / `set` / `excludedSet` / `intervalExclusion` shapes. Every operation runs in time bounded by the size of its inputs. There is no fixpoint loop, so no iteration cap is needed.
- The 10,000-iteration cap only applies once the **Phase 3 linear-arithmetic solver** (Fourier-Motzkin / simplex) lands. That solver iterates over constraint variables, and pathological inputs there could grow the constraint graph past a useful bound. Hitting the cap will return `OutOfFragment` with reason "constraint graph too large".
- No wall-clock timeout at any phase. Caps (when they apply) are deterministic — same input always gives same verdict.
- Predicate ASTs are immutable; no fixpoint can oscillate.
- Pathological inputs to the Phase 2.3/2.4 algebra (e.g. `n != 1 && n != 2 && ... && n != 5000` — an `excludedSet` with thousands of values) hit O(n²) merging cost. Real refinement annotations have ≤2 such conjuncts in practice; if generated/LLM-authored annotations start producing chains in the hundreds, introduce a `MAX_EXCLUDED_SET_SIZE` cap analogous to `MAX_FINITE_INTEGER_DOMAIN_SIZE`.

### What we do NOT build

- SMT solver. Not Z3, not a subset. The custom procedure handles exactly the Tier B fragment.
- Proof-object generation. We return "Proved" without a certificate. (Revisit if users want to debug why the checker accepted something.)
- Incremental solving. Each decide call is standalone. Caching happens at the subtype-check level, not inside the solver.

---

## Integration with set-theoretic subtyping

Refinement types plug into the existing `Type` union:

```typescript
| { tag: 'Refined'; base: Type; binder: string; predicate: Predicate; source?: string }
```

The optional `source` field preserves the user-written predicate text for error messages (per the Error UX contract — source text, not canonical form).

### Subtyping rule

For two refined types `S = Refined(B_S, bs, P_S)` and `T = Refined(B_T, bt, P_T)`:

```
S <: T iff
  - B_S <: B_T                                          [existing base check]
  - decide(assumptions: [P_S], goal: P_T[bt := bs])     [invoke decision procedure,
                                                         substituting T's binder for S's]
```

Binder substitution is critical: `S`'s predicate uses binder `bs`; `T`'s predicate uses binder `bt`. Both binders denote "the value of the refined type", but their names differ. Before invoking `decide`, substitute `T`'s binder name with `S`'s in `T`'s predicate, so the solver sees one shared binder referring to the same underlying value.

When the base check fails, the refinement is irrelevant. When it succeeds, the decision procedure runs against the assumption (`S`'s predicate) and goal (`T`'s predicate, alpha-renamed).

### Walker updates required

Adding `Refined` to the `Type` union requires new cases in every structural walker in the typechecker. Checklist (verified against `src/typechecker/` as of 2026-04-24):

- `freshenAllVars`, `freshenInner` (let-polymorphism freshening).
- `containsVars`, `containsVarsAboveLevel`, `generalizeInner` (level-based generalization — see PR #89 for the lesson from missing `Keyof`/`Index` cases).
- `expandType`, `expandTypeForDisplay`, `expandTypeForMatchAnalysis`.
- `simplify` + its per-shape helpers: `simplifyUnion`, `simplifyIntersection`, `simplifyNeg`, `simplifySequence`.
  (The earlier draft named `simplifyInner` — no such function exists.)
- `typeToString`, `typeId` (rendering + cache keys).
- `typeEquals` (in `types.ts`) — **load-bearing**: the `union()` and `inter()` constructors call it for deduplication. Missing a `Refined` case means two equivalent refined types silently dedup as distinct, breaking simplify rules.
- `substituteVar` (inside `subtype.ts`).
- Any future walker added between now and Phase 2 implementation.

These are mechanical extensions of switch statements. Each is a few lines. Together they're the bulk of **Phase 2's** integration work — Phase 1 deliberately does not add the `Refined` node, so walker updates are deferred.

### Simplification

Post-inference, refined types collapse. Key rules:

- **Trivial predicate.** `Number & {n | true}` → `Number`. `Number & {n | false}` → `Never`.
- **Redundant with base.** `Integer & {n | isInteger(n)}` → `Integer` (the predicate is implied by the base).
- **Interval tightening** (Phase 2+). `Number & {n | n > 0} & {n | n > 5}` → `Number & {n | n > 5}`.
- **Disjoint predicates** → `Never`. `Number & {n | n > 0} & {n | n < 0}` → `Never`.
- **Multi-refinement merging.** When multiple `Refined` nodes share the same base, merge into a single `Refined` with the conjoined predicate:

```
Input:  String & {s | P} & {x | Q}
  (two Refined nodes on the same String base, different binder names)

Stored: Refined(
  base: String,
  binder: "s",                            // canonical binder chosen from first operand
  predicate: P && Q[x := s]               // Q's binder alpha-renamed to match
)
```

This normalization happens in the simplification pass. It ensures `Refined` never nests and that surface forms `Base & {s|P} & {s|Q}` and `Base & {s | P && Q}` have the same internal representation — so Q7's conjunctive decomposition applies uniformly regardless of which syntax the user wrote. Source text for the original predicates is preserved in the `source` field for error rendering.

---

## Narrowing and the `assert` function

Refinement types participate in Dvala's existing flow-sensitive narrowing (PRs #78/#79) through the same mechanism as type guards.

### Conditional narrowing

When `if P then ... else ...` or a `match` guard evaluates a fragment-eligible predicate, the assumption `P` flows into the then-branch and `¬P` into the else-branch. The refinement solver uses these assumptions to discharge goals encountered in the branch body. `&&` / `||` / `not` compose via the existing flow-narrowing machinery. (Detailed scope of what counts as "fragment-eligible" and how propagation flows through let-bindings is still under design — see Open questions.)

### Runtime-checked assertions via the builtin `assert`

When the checker can't derive a needed fact from flow analysis alone, the user reaches for the existing `assert(P)` builtin:

```dvala
let f = (x: Integer) ->
  assert(x > 0)              // runtime: throws if x <= 0
  // from here, {n | n > 0} is in assumptions for x
  process(x: Positive)       // ok
```

The builtin `assert` is extended with an `asserts P` return annotation — analogous to `x is T` for type guards — meaning "the first argument is asserted true after return":

```
assert(cond: Boolean) -> asserts cond
assert(cond: Boolean, message: String) -> asserts cond
```

Typechecker recognizes `assert(P)` calls, fragment-checks `P`, and adds `P` to the assumption set for code following the call. Runtime enforcement is unchanged (`assert` already throws on falsy). If `P` is not fragment-eligible, the runtime check still happens but no compile-time narrowing is added — clean fallback.

### Why not `assume P`?

An `assume P` construct — trust `P` without runtime check — is structurally equivalent to an unsafe typecast (TypeScript's `as` / `!`). Dvala decision #6 rejected unsafe escape hatches on soundness grounds; `assume` would be the predicate-shaped back-door to the same hole.

Every fact the solver uses must be earned by exactly one of three sound mechanisms:

- **Proved** by the decision procedure (fragment-eligible claims in typechecked code).
- **Checked by `assert(P)`** at a local site (runtime-enforced; narrowing takes effect after the check succeeds).
- **Verified at a trust boundary** via manifest validation (always-on; see Runtime story).

No opt-outs. No `assume`, no `unvalidated`, no cast operator. Users who want compile-time refinement without paying the boundary check can't have one — if the refinement matters enough to write, it matters enough to verify. If the cost truly can't be paid, the refinement didn't belong at that boundary; use the base type.

### User-declared assertion functions

User-defined functions with `asserts {binder | predicate}` in their return type are now supported, but only in the **body-verified** form. The typechecker proves that every normal-return path in the helper establishes the declared predicate before the function is trusted at call sites.

```dvala
let assertInRange: (score: Number, lo: Number, hi: Number) -> asserts {score | lo <= score && score <= hi} =
  (score, lo, hi) -> assert(lo <= score && score <= hi)

let useScore = (score: Number) -> do
  assertInRange(score, 0, 100)
  score   // narrowed after the verified helper call
end
```

Soundness boundary:

- **Unchecked `asserts P` annotations are still rejected in spirit.** Trusting a user-declared assertion helper without checking its body would still be structurally equivalent to `assume P`.
- **The implementation therefore verifies the body** — every reachable normal-return path must establish the predicate, while throwing paths are exempt.
- **Current restrictions:** no direct or mutual recursion, and no `do with ... end` handler-install blocks inside assertion helper bodies.
- **Call-site effect:** once verified, the helper narrows its asserted argument through the same post-statement narrowing pipeline used by builtin `assert`.

This keeps the original soundness argument intact while removing the ergonomics penalty of forcing users to inline repeated `assert(P)` checks at each narrowing site.

### Forward refinement propagation

When a narrowed value is used as the RHS of a new binding, the checker computes the bound name's refinement **eagerly** and stores it on the variable's type. The solver is not re-invoked at every use site; instead, refinements flow forward through bindings as they're introduced.

**Phase-scoping of propagation:**

- **Phase 2 (interval + FD solver)** handles forward propagation through destructuring, match patterns, and *constant-evaluable* arithmetic RHS (fold reduces the RHS to a literal → propagation is just carrying the literal's refinement forward).
- **Phase 3 (linear arithmetic solver)** adds propagation through symbolic linear arithmetic RHS. `let y = x + 1` with `x : Positive` inferring `y : Integer & {n | n > 1}` requires the linear solver to derive `y > 1` from `x > 0` — this is Phase 3 capability.

The capability surfaces progressively: Phase 2 users get "propagation through structure" (destructuring, match); Phase 3 users additionally get "propagation through symbolic computation."

**What propagates:**

- **`let` bindings over fragment-eligible expressions.** `let y = x + 1` where `x : Integer & {n | n > 0}` produces `y : Integer & {n | n > 1}` (Phase 3 solver derives the new bound). If the RHS isn't fragment-eligible, `y` gets the base type only; solver can still be queried on demand.
- **Destructuring bindings.** `let [a, b] = pair` with `pair : [Positive, Negative]` produces `a : Positive`, `b : Negative`. Walks the pattern, distributes the scrutinee's refinement into each bound name. Available from Phase 2.
- **Match pattern bindings.** `case [x, y] when x < y -> ...` binds `x` and `y` with any pattern-induced refinement (from the shape of the pattern) combined with the guard assumption (`x < y`). Available from Phase 2 for simple patterns; richer relational narrowing arrives with Phase 3.

**Compound-value handling:**

- **Tuples propagate deeply.** `let arr = [x, x + 1]` with `x : Positive` produces `arr : [Integer & {n | n > 0}, Integer & {n | n > 1}]` — each element's refinement preserved positionally. Tuple types already carry positional types, so positional refinements fit naturally (same shape as the existing indexed-access primitives from PR #80).
- **Arrays propagate shallowly.** `let arr = [x, x, x]` with `x : Positive` produces `arr : (Integer & {n | n > 0})[]` only when the element type has a single uniform refinement. Mixed element refinements are widened to the base element type; arrays are homogeneous and can't store per-element refinements.

**What does NOT propagate in v1:**

- **Function return types are not inferred from the body.** A function `let double = (x: Integer) -> assert(x > 0); x + x` gets return type `Integer` (no auto-inferred refinement). To publish a refined return, the user writes it: `let double: (Integer) -> Integer & {n | n > 0} = (x) -> ...`.

  Rationale: auto-inferring return-type refinements is tempting but creates backwards-compatibility risk (a small body edit silently changes the public return type and breaks callers). Explicit return annotations are the audit-friendly way. The body walker that would enable this is ~the same machinery as let-propagation, so adding it later (v2) is low-cost — deferral is a policy choice, not a capability gap.

- **Function parameter refinements are not inferred from call-site arguments.** Consistent with "no narrowing across function boundaries" — this is firmly Tier C+ (dependent function types).

---

## Runtime story

Unchanged from Dvala's erased-types model. Refinements are **compile-time only** except at trust boundaries.

### Compile-time-only (95% of predicates)

- The decision procedure. Lives in the TS typechecker. Never ships in the KMP runtime.
- Proof obligations inside typechecked code. `let y: Positive = x + 1` where `x: Positive` is discharged at compile time; the bundle carries nothing.
- The predicate AST itself, internally. Once a value is proven to satisfy a refinement, the runtime sees just the underlying value.

### Runtime-evaluable — only at trust boundaries, always-on

The bundle manifest already carries type signatures (decision #6 in the type-system plan). Refinement signatures are added the same way — the predicate is compiled to a tiny Dvala expression AST that the evaluator runs at validation time.

**Validation is always-on. There is no `unvalidated` keyword, no `unsafe` boundary, no opt-out.** If a refinement type appears in a manifest signature, inbound values are checked against it. Full stop. Rationale: Tier B predicates are bounded-cost (O(1) arithmetic checks — quantifiers and collection iteration are outside the fragment by design), so "the validation is too expensive" is structurally not a problem Tier B creates. Adding an opt-out would be the boundary-scoped equivalent of `assume P` — compile-time-trusted, runtime-unverified. Same unsound hole, rejected for the same reason.

Three concrete boundaries:

- Host-provided effect handlers returning a value of refinement type.
- `.load`-style deserialization (snapshots, JSON imports).
- Cross-bundle imports from an un-typechecked exporter.

```
Manifest signature:   @getScore : () -> Integer & {n | 0 <= n && n <= 100}

Evaluator at the handler boundary:
  value = host_handler()
  if not (isInteger(value) && 0 <= value && value <= 100):
    throw HostBoundaryError("refinement violation: @getScore")
```

This works because **the predicate language is a subset of Dvala itself**. No new runtime machinery — the evaluator already knows how to run `0 <= n && n <= 100`.

### Trade-offs

- **Pros:** Zero internal-code cost (refinements erased after typechecking). Bounded boundary cost (Tier B predicates are O(1) arithmetic — no quantifiers, no collection traversal in-fragment). SMT-free runtime. KMP port untouched. Clean soundness story: every fact is proved, `assert`-checked, or boundary-validated; no escape hatches.
- **Cons:** Bundle size grows by predicate ASTs for refinement-typed boundary signatures (small in practice — a typical predicate is 10-30 AST nodes). Per-value validation cost is non-zero even for tiny predicates (~nanoseconds for integer range checks). Hot-path effect handlers that return refined values pay this on every call.
- **Users who can't pay the boundary cost** should not refine that boundary's type. A `@tick() -> Integer` effect that fires millions of times per second can't afford validation — but it also doesn't need a refinement, since the host is providing raw integers into a hot loop where the refinement wouldn't pull its weight anyway. The rule: refinement types go at boundaries where correctness matters more than the handful-of-nanoseconds cost.
- **Snapshot resumption:** a continuation carrying a refined value and resuming in a different process re-validates against the manifest on the new side. Cross-process resume is a trust-break; validation applies.

---

## Implementation roadmap

**Phase 0 (prerequisite, separate doc):** Generic upper bounds (`T: U`). Must ship before Phase 1 begins — the declaration-time fragment check for `count(var)` on sequence-bounded generics depends on it. See the forthcoming `2026-04-24_upper-bounds.md` plan.

Five phases of refinement-types work. Each delivers something shippable.

### Phase 1 — Parse + reject (no `Refined` node yet)

Deliberately narrow. The Phase 1 compiler accepts the refinement *syntax*, enforces the fragment grammar, and emits structured errors. **Nothing else.** No `Refined` node is added to the `Type` union. No walker updates. No classification stored. No fold-discharge. Those all move to Phase 2, where they compose with the actual solver.

**Scope:**

- **Parser.** Accept `{ binder | predicate }` after `&` in type annotations. Disambiguation from record literals is one-token lookahead (`{ IDENT |` vs. `{ IDENT :`). The parsed predicate body is a plain **Dvala `AstNode`** — the same shape the expression parser already produces. No separate "predicate IR".
  - *Rationale (decision Q2):* reusing Dvala AST gives us free fold integration, free `typeToString`, and a ~50 LOC fragment-checker walker. A parallel IR would force us to duplicate literals, calls, field access, and atoms in a second evaluator.
- **Fragment-checker.** A walker over the predicate `AstNode` that either returns success or throws a tagged `RefinementError`. Phase 1 accepts the shapes in the [fixture list](#phase-1-ship-gate--rejection-fixtures) below and rejects everything else. Classification of accepted shapes (opaque vs. solver-fragment) is **deferred to Phase 2** — Phase 1 doesn't store anything; it only decides accept/reject.
- **`count(var)` well-formedness.** Phase 1 accepts `count(binder)` as a structural shape — the predicate string `count(s) > 0` parses and the fragment-check succeeds irrespective of `s`'s base type. The stronger check — "does `T`'s upper bound satisfy `Array<Unknown> | String | Collection`?" via the subtype machinery — is **deferred to Phase 1.x / Phase 2**, because the fragment-checker in Phase 1 doesn't receive the surrounding type context (it gets only the predicate AST + binder name, not the base type or its parameter bounds). Plumbing the context through is a signature change worth doing alongside the `Refined`-node work in Phase 2.1 rather than bolting on to Phase 1.
  - *Rationale (decision Q3, refined during implementation):* the subtype-query approach is still the intended mechanism; it's purely a scheduling change. Users writing `String & {s | count(s) > 0}` today get the Phase 1 structural accept (correct by inspection — `count` on `String` is well-defined). Users writing `<T> (xs: T & {x | count(x) > 0})` (the only case where the check matters) will get the deferred validation in Phase 2.
- **Error taxonomy.** A single `RefinementError` class extending `TypeInferenceError` with a discriminator:
  ```typescript
  class RefinementError extends TypeInferenceError {
    kind: 'fragment' | 'predicate-type' | 'obligation'
  }
  ```
  Phase 1 emits `fragment` (shape rejected) and `predicate-type` (body isn't Boolean-typed). `obligation` is reserved for Phase 2's solver.
  - *Rationale (decision Q4):* structured kind lets tests assert on category without coupling to message wording; one class keeps the import surface flat; future kinds add one union branch.

#### Phase 1 ship gate — rejection fixtures

The fragment-checker in Phase 1 accepts these shapes (all other shapes reject):

```dvala
// Accepted
{x | isNumber(x)}                    // guard on var
{n | n > 0}                          // relation, var vs. literal RHS
{s | s == "ok"}                      // literal equality
{x | isNumber(x) && isInteger(x)}    // Boolean AND
{x | isString(x) || isNumber(x)}     // Boolean OR
{x | !isBoolean(x)}                  // Boolean NOT
{xs | count(xs) > 0}                 // count(var) + relation (on sequence-bounded var)
```

Rejected (each with a distinct error phrasing):

```dvala
{x | x}                              // non-Boolean body           [kind: predicate-type]
{x | x * x > 0}                      // arithmetic not in fragment [kind: fragment]
{x | someUserFn(x)}                  // unknown / non-guard call   [kind: fragment]
{x | perform(@foo)}                  // effect                     [kind: fragment]
{x | if isX(x) then true else false end}   // control flow         [kind: fragment]
{r | isNumber(r.field)}              // field access — DEFERRED-BY-DESIGN
                                     //   to Phase 1.x; not a permanent rejection
{n | 0 < n && n < 100}               // compound bounds — DEFERRED-BY-DESIGN
                                     //   to Phase 2 (needs solver)
```

Every rejection above becomes a vitest fixture asserting `error.kind === 'fragment'` (or `'predicate-type'`) plus a substring match on the reason. "Deferred-by-design" markers in the fixture file call out which rejections are permanent-for-now vs. planned-for-later, so future extension work can locate them.

**No `Refined` node. No walker updates. No fold-discharge. No narrowing. No `assert(P)` wiring.**

**What works at the end of Phase 1:**

- `type Positive = Number & {n | n > 0}` is parsed and the predicate is fragment-checked — but the resulting type is **still just `Number`** (the `& {...}` is syntactically accepted but semantically dropped). Callers of `Positive` see the unrefined base. This is intentional: Phase 1 validates the surface grammar and the fragment rules without committing to the `Refined` representation.
- Every non-fragment predicate produces a structured `RefinementError` with a testable `kind`.
- The Phase-2 team (likely the same author) starts from a parser + checker they trust and adds the `Refined` node on top.

**Ship gate:** the fixture suite above passes in `typecheck.test.ts` (or a new `refinement.test.ts`); no existing test regresses; the doc-examples in this file parse without errors.

### Phase 2 — `Refined` node, walker updates, fold-discharge, finite-domain + interval solver, narrowing, `assert(P)` wiring

This phase is large. It's split into sub-steps so each one lands as its own PR.

**Phase 2.1 — `Refined` node + walker updates. ✓ shipped (PR #96).** Added the `Refined` tag to the `Type` union and updated every structural walker. Phase 1's parser now produces `Refined` nodes instead of dropping the predicate; otherwise no behavioral change.

**Phase 2.2 — Multi-refinement merging. ✓ shipped (PR #96).** Multi-refinement merging collapses `Base & {s|P} & {x|Q}` → `Base & {s | P && Q[x:=s]}` in the simplify pass, with AST-based alpha-renaming and `prettyPrint`-based source reconstruction. `&&` chains flatten to a single variadic `And` node. Opacity classification (the second half of the original 2.2 scope) was deferred — Phase 1's accept list is solver-fragment-only, so every stored predicate is implicitly `'fragment'` and there's nothing yet to classify.

**Phase 2.3 + 2.4 — Fold-discharge + finite-domain / interval solver. ✓ shipped (PR #96).** Originally split into two sub-phases; landed together because the solver's `solveRefinedSubtype` and the literal-fold path naturally interleave at the same call site in `subtype.ts`. The shipped behaviour:

- **Literal fold-discharge.** When the source is a concrete literal AST and the target is `Refined`, substitute the literal for the binder, fold the predicate, and discharge / reject based on the fold result. Bails to the solver if fold can't reduce.
- **Domain-based solver** (`refinementSolver.ts`, ~860 LOC). Non-iterative; computes domain operations algebraically over four shapes: `interval`, `set`, `excludedSet`, `intervalExclusion`. Returns `Proved` / `Disproved` (with witness) / `OutOfFragment`. Handles single-variable intervals (`n > 0`, `0 <= n && n <= 100`), atom/literal sets (`x == :ok || x == :error`), `count(var)` intervals, swapped operands (`0 < n` normalised to `n > 0`), and conjunctions/disjunctions of those shapes — except `interval || interval`, which is deferred-by-design (would need non-convex domain representation; Phase 2.5+ work).
- **Trivial-collapse** in simplify: `simplifyRefinedType` handles base-tautology → base (target's domain contains the base's), and disjoint-with-base → Never (target's domain is empty under the base's constraints). Wired into `simplify.ts`'s `Refined` case after the merge step. The `{x|true}` / `{x|false}` literal-predicate forms aren't reachable today — the fragment-checker rejects bare `Reserved(true)` / `Reserved(false)` as top-level predicate bodies; literal predicates would need a `NodeTypes.Reserved` case in `checkBooleanExpr` first.
- **Counter-example synthesis.** Disproofs return a `witness` Type that demonstrates the source admits a value the target rejects.

**Phase 2.5 — Narrowing + `assert(P)` wiring.**
- **Block-level narrowing walker.** Walks statements in a `do` block; recognizes `assert(P)` calls with fragment-eligible `P`; threads `P` into the assumption set for subsequent statements in the block.
- **`if`/`match` narrowing for refinement predicates** (extension of the existing flow-narrowing machinery from PR #78/#79).
- **`asserts cond` return annotation on the builtin `assert` function.** This is a real parser change, not a trivial builtin-annotation extension — it requires new grammar in `parseType.ts` (no existing `asserts` keyword; only `is` from type-guards at around line 882), a new field on `BuiltinTypeInfo` parallel to `guardParam` / `guardType`, and narrowing logic in `infer.ts` that reads the field and threads the assertion into the assumption set. Budget for it accordingly.

**Phase 2.7 — Make the static/runtime boundary explicit.**
- **Written refinement annotations remain solver-fragment-only.** No opaque/user-defined/module-qualified Boolean predicates in `{x | ...}` annotations.
- **Dynamic validation goes through `assert(...)`.** Any pure Boolean check that the solver cannot reason about is still valid, but it is expressed explicitly at runtime rather than hidden inside a type.
- **Mixed invariants split cleanly.** Example: `type NonEmpty = String & {s | count(s) > 0}` plus `assert(sequence.startsWith(url, "http"))`, rather than one annotation containing both parts.
- **Plan/documentation cleanup.** Remove any remaining wording that implies an automatic opaque-predicate boundary validator separate from `assert`.

**Ship gate:** The plan, docs, and implementation all agree on the contract: `{x | ...}` means solver-fragment refinement; `assert(...)` is the explicit mechanism for runtime-only Boolean validation.

**Ship gate for Phase 2 (across all five sub-steps):** `Number & !0` for division safety. Non-empty sequence refinement `{xs | count(xs) > 0}` for `head`. `assert(x > 0)` narrows `x` to `Positive` in subsequent statements. Array indexing where the bound is a literal.

### Phase 3 — Multi-variable linear arithmetic

- General linear-arithmetic solver (Fourier-Motzkin or simplex variant, per Option G from the 2026-04-24 interview).
- Solver runs over rationals uniformly; integer refinements add integrality side-constraints that tighten bounds.
- Counter-example synthesis for disproofs involving multiple variables.
- **Forward refinement propagation** (bullet 3 of Q4's narrowing contract): `let y = x + 1` with `x: Positive` infers `y: Integer & {n | n > 1}` using the solver.
- Cross-field refinements (`{r | r.min <= r.max}`) and tuple-indexed predicates (`{t | t[0] < t[1]}`).

**Ship gate:** All six patterns from the "Example refinement types (library patterns)" section typecheck — `Percent → Permille`, `TimeOfDay → seconds`, `RGB packing`, `BudgetAllocation`, `ValidShipment`, `Range`. Plus array indexing with `i` bounded by `count(xs)` and state-machine refinements where state depends on prior effect-free outcomes.

### Phase 4 — Runtime boundary validation

- Bundle manifest: refinement signatures serialized as predicate ASTs. Cross-reference [`2026-04-13_bundle-type-metadata.md`](2026-04-13_bundle-type-metadata.md) for the serialization schema.
- Evaluator: validate inbound values at host boundaries against manifest predicates for solver-fragment refinements, and run any additional domain-specific runtime checks explicitly through `assert(...)`-style validation hooks. Always-on, no opt-out (per Q5 of the 2026-04-23 interview).
- `HostBoundaryError` / `RefinementViolationError` with the same shape as today's type-shape validation errors.

**Ship gate:** A host-provided handler returning `Integer & {n | 0 <= n && n <= 100}` fails with a clear error when the host returns `150`.

### Phase 5 — Inference, developer UX, docs

- Inference: infer refinements in obvious cases (the `let x = 5` case is already handled via existing literal types + fold; Phase 5 extends to more predicate-flavored inference).
- Hover / LSP: show the refinement in inferred types, with a one-line predicate summary.
- Error-UX examples: a hover/error demo for the common "I annotated the return but caller doesn't see it" failure shape.
- Documentation: tutorial chapter, predicate-syntax reference, "when Tier B fails" guide.

**Ship gate:** A user can write `Positive`, `NonEmpty`, `Score` in their own code and get typed errors for violations without reading compiler internals.

---

## Non-goals

- **Proof of full soundness.** The decision procedure will be formally documented but not machine-verified.
- **Inference of non-trivial refinements.** Users write refinements where they want them. The checker doesn't try to guess that `xs[1:]` is non-empty when `count(xs) >= 2`.
- **Runtime reflection on refinements.** `isRefined(x, Positive)` is not a runtime operation. Tag checks go through pattern matching, same as today.
- **Tier C promotion.** Graceful path to Tier C is not blocked (the `Type` union stays extensible), but this plan does not design for it.

---

## Error UX contract

Three failure modes, one verdict each. No "timed out", no "might be true" — every failure is an actionable rejection.

### Disproved

Solver found a counterexample — a concrete value that satisfies all assumptions but violates the required refinement. Show it.

```
Error at line 42: cannot prove that `x` satisfies `Positive`
  Required refinement: {n | n > 0}
  Known facts:
    x: Integer
    count(xs) > 0
    x <= count(xs) - 1
  Counter-example: x = 0 (satisfies all known facts, violates required refinement)
```

Rules:

- **Counterexample always shown.** Up to 5 variables; truncate the rest with a `…` marker.
- **Assumption set shown.** Only for Disproved (not for Outside-fragment — the fragment issue isn't about assumptions).
- **Predicate uses source text**, not the solver's canonical form. `{n | 0 <= n && n <= 100}` stays as written; the solver's internal normalization is a debug detail, not a user-facing one.

### Outside fragment

Predicate uses a form Tier B's decision procedure doesn't handle. Name the specific form.

```
Error at line 17: predicate cannot be checked by the bounded fragment
  Predicate: {n | n * n > 10}
  Unsupported form: multiplication of non-literal expressions (`n * n`)
```

Rules:

- **Specific form named.** Not vague "predicate too complex". Users need to know exactly which operator or construct is out.
- **No auto-suggested rewrite.** "Consider rewriting as `n > 4 || n < -4`" is tempting but a foot-gun — it only works if that's what the user meant. Wrong suggestions are worse than none.
- **Source-text predicate.** Same rule as Disproved.

### Iteration cap

Solver exhausted its iteration budget. Predicate was in-fragment but the constraint graph grew past the cap.

```
Error at line 88: refinement check too complex to decide
  Constraint graph exceeded 10000 iterations
  Try: simplifying the predicate, splitting into smaller claims, or using assert()
```

Rules:

- **Iteration count shown.** Users need to know whether they're marginally over or massively over — it determines whether a small rewrite or a fundamental restructure is the right fix.

### IDE presentation

IDE hover shows the **full** error message — verdict, predicate source, assumptions, counterexample — not a truncated headline. Refinement-type errors are dense, and users need all the information at the point of failure to debug effectively. The full message is already compact enough to fit in a hover tooltip; no need to make users open a panel to see the counterexample.

---

## Open questions

- **Generalizing `count` to other projections.** v1 hardcodes `count(var)` on sequences (Array, String). A future generalization — user-declared "measure functions" (monotone projections from values to non-negative integers) — would let users express richer refinements (e.g. `type ShallowTree = Tree & {t | depth(t) <= 10}`). Open questions: how is monotonicity verified, how do measures compose, can they reference effects. Defer until concrete demand appears in Phase 3+ usage.
- **`transparent` / `inline` modifier for user-declared predicates.** v1 keeps named predicate functions opaque — the solver doesn't inline their bodies. Users who need solver reasoning must inline the predicate at the refinement site. If users routinely duplicate logic between named validators and inlined predicates, a `transparent` modifier (analogous to Liquid Haskell's `INLINE` or F\*'s `reflect`) could fuse the two — mark a function whose body is fragment-eligible; the solver inlines it when it appears in a refinement. Requires body inspection, termination checks, interaction with generics. Potential v2 feature. Reconsider when usage data shows the duplication pain.
- **Interaction with constant folding.** Fold already evaluates pure expressions at type time. Can fold discharge some Phase-2 obligations without invoking the decision procedure at all? Feels like a natural synergy — "refinement over a literal is a fold check", not a solver call.
- **Laziness of the fragment-checker and decision procedure.** If refinement types are present but the user writes no refinements, cost should be zero. The checker and solver must be invoked only when a refinement appears in a constraint.
- **Decision-procedure library choice.** Implement Omega test from the original paper, or crib a simpler simplex variant? Or pull in a small, audited TS library? Defer until Phase 3 — Phase 2 only needs intervals.
