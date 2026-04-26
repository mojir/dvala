# Phase 2.6 — Tighten the OutOfFragment Pass-Through

**Status:** Approved — ready for implementation
**Created:** 2026-04-25
**Tracks:** Continuation of the refinement-types implementation. Sibling phase to `2026-04-23_refinement-types.md` (covers Phases 1–4) and `2026-04-25_refinement-phase-2-5c-asserts-functions.md` (paused pending this).
**Reopens:** Phase 2.3's "accept conservatively when the solver can't decide" design choice.

## Goal

Make refinement-type narrowing **observable** end-to-end. Today the work shipped across PRs #95–#102 (Phase 1 → Phase 2.5b + prelude + book chapter) is *almost* invisible: the typechecker carries refinement predicates around but rarely consults them, so `safeDiv(10, n)` where `n: Number` and `safeDiv` expects `NonZero` passes without diagnostic regardless of whether the user asserted `n != 0` or not.

Concretely: at the end of this phase, **a call site that violates a refinement (provably) should be rejected**, and a call site that's been narrowed (via `assert`, `if`/`match` flow) should accept what was previously rejected. The intermediate "we can't tell" cases need a clear, principled policy.

## Background

### The three-layer problem

Memory and code-reading both confirm: the inertness is multi-layered, and fixing only one layer does nothing observable.

**Layer 1 — `subtype.ts:131`**: `solveRefinedSubtype` returns one of `Proved` / `Disproved` / `OutOfFragment`. On `OutOfFragment`, `isSubtype` returns `true`. This is the documented Phase 2.3 design choice ("accept conservatively when the solver can't decide"). The comment block at line 105–108 calls it "inert pass-through" explicitly.

**Layer 2 — `infer.ts:611-618`**: `constrain` strips the `Refined` wrapper before any subtype check runs:
```typescript
if (lhs.tag === 'Refined') {
  constrain(ctx, lhs.base, rhs)   // strip and forget
  return
}
if (rhs.tag === 'Refined') {
  constrain(ctx, lhs, rhs.base)   // same
  return
}
```
The comment frankly says "Phase 2.4 replaces this pass-through with real predicate-aware checking" — that replacement never happened.

**Layer 3 — call sites use `Var`-with-Refined-upper-bound, not `Refined` directly**. At line 1488, `constrain(ctx, calleeType, fn(argTypes, retVar, ...))` decomposes function-vs-function into per-arg constraints. By the time we're checking each arg, the LHS arg type is typically a `Var` (from inference) and the RHS expected param is a `Refined` upper bound. Even if Layer 2 weren't stripping refinements on direct compares, Vars wouldn't trigger the path.

### What previous attempts found (per memory, prior session)

> - Flipping `return true` → `return false` for `OutOfFragment` with non-Refined source: only 2 tests broke. But user-visible behavior didn't change because the call-site path uses `constrain` not `isSubtype`, and `constrain` strips Refined wrappers entirely.
> - Wiring the solver into `constrain`: doesn't fire because call-site arg types are `Var`s with Refined upper bounds, not Refined directly. Solver returns `OutOfFragment`.
>
> The real path forward: expand types to their concrete bounds before consulting the solver, OR make the call-inference path itself solver-aware. **Multi-day architectural work, not a one-liner.**

So the prior session correctly diagnosed the problem but parked the architectural work as out-of-scope. This design doc reopens it.

### Why this is more than a refinement-types issue

The fix lights up:
- Prelude aliases (`Positive`, `NonNegative`, `NonZero`, `NonEmpty<T>`) — PR #101 / #102 / #104
- Builtin `assert` narrowing — PR #98 (`assert(P)` block-level narrowing) and PR #99 (`if`/`match` flow narrowing)
- Anything written using refinement types in user code today

Until this lands, those features are **type-level documentation** — the predicates exist in the AST, walkers preserve them, the solver implementation runs end-to-end on its own — but **none of that observably changes diagnostics for variable-typed call sites**. The shipped feature surface is much larger than its observable benefit.

## Proposal

### Architecture: solver-aware `constrain`, with bounds expansion at the boundary

The fix has three pieces, each addressing one of the layers:

**Piece 1 — bounds expansion at the constraint boundary (Layer 3).** When `constrain(ctx, lhs, rhs)` is called with an LHS that's a `Var`, expand the Var's lower bounds to recover the most-precise concrete type, **including any `Refined` wrappers on the bounds**. This gives the solver something to chew on at call sites where args are inferred-as-Var.

**Piece 2 — solver-aware refinement constraint (Layer 2).** Replace the strip-and-recurse in `constrain` (lines 611–618) with: try the solver first, then fall back to base-only constraint. Concretely, when LHS or RHS is `Refined`:
- If LHS is `Refined` and RHS isn't: recurse on `(LHS.base, RHS)` (LHS is a *narrower* set than its base, base subtyping is sufficient)
- If RHS is `Refined`: call `solveRefinedSubtype(LHS, RHS)`. On `Proved`, no further constraint needed. On `Disproved`, emit a typecheck error (this is the new behavior — currently silent). On `OutOfFragment`, fall back to base-only constraint (Layer 1's lenience preserved here, see Piece 3).

**Piece 3 — `OutOfFragment` policy (Layer 1).** Keep `isSubtype` returning `true` on `OutOfFragment`. The fix isn't about flipping the bail behavior; it's about **making sure the solver gets called in the first place** so the cases it CAN decide flow through. Cases the solver can't decide stay accepted (current behavior).

This split means:
- `let y: Positive = 5` → fold says `5 > 0` → **accepted** (already works)
- `let y: Positive = -5` → fold says `-5 > 0` → **rejected** (already works)
- `let x: Number = ...; let y: Positive = x` → solver: source has no domain info → `OutOfFragment` → **accepted** (current behavior preserved)
- `let x: Number = ...; assert(x > 0); let y: Positive = x` → after assert, x's local type is `Refined<Number, _, x > 0>`; solver: domain `(0, ∞)` ⊆ `(0, ∞)` → `Proved` → **accepted** (NEW — previously also accepted, but for the wrong reason)
- `let x: Number = ...; assert(x < 0); let y: Positive = x` → after assert, x's local type is `Refined<Number, _, x < 0>`; solver: domain `(−∞, 0)` ⊄ `(0, ∞)` → `Disproved` → **REJECTED** (NEW — previously silently accepted)

Net: cases that are objectively wrong start failing; cases that are truly out of fragment continue accepting. No false positives that the solver can't decide are introduced.

### Why this beats other fixes

- **"Just flip `isSubtype` to false on `OutOfFragment`"**: doesn't help (Layers 2 + 3 prevent the solver from running at all on the call-site path).
- **"Just call solver from `constrain`"**: doesn't help (Layer 3 means the LHS is a Var; solver returns `OutOfFragment`).
- **Whole-program inference / abstract interpretation**: massive, not scoped.

This proposal addresses every layer with the minimum work that makes the existing solver useful.

## Decisions

The five open questions raised during design review have been resolved. Recording the choice and rationale here so future readers (and future-me) can reconstruct *why*, not just *what*.

### 1. Disproved severity — **`error`**

Match every other refinement-type error path (literal-fold disproved is already an error). Users who hit one of these *should* fix the call site rather than ignore a warning. Blast radius is narrow — `Disproved` requires the solver to be confident.

### 2. Bounds expansion strategy — **display-grade (reuse `expandTypeForDisplay`)**

Reuse the existing function. Well-tested, polarity-aware, preserves `Refined` wrappers. Cost is bounded by the existing display path's complexity.

**Constraint-grade is parked as a future option.** A purpose-built helper that intersects multiple Refined lowerBounds into a tighter combined predicate could catch precision-tuning cases (e.g. a Var with bounds `Refined<Number, n, n > 0>` AND `Refined<Number, n, n < 10>` could be tightened to `Refined<Number, n, n > 0 && n < 10>` instead of unioned). Build only if real cases prove display-grade is too loose. The implementation should drop a comment at the bounds-expansion call site referencing this future variant so a future maintainer can spot the option.

### 3. Roll-out — **single-pass**

Ship all three pieces in one PR. The pieces are coupled: Piece 2 alone is a no-op for realistic call-site paths (Layer 3 means args are Vars, not Refined), and Piece 1 alone is pure overhead (constrain still strips). Staging would leave a noticeable observable gap between PRs where the typechecker has half-fixed behavior. Single-pass is roughly the size of one focused day of work.

### 4. Bounds expansion scope — **Vars only, with explicit alias-via-bounds test**

Aliases get expanded transparently by `constrain` (lines 597–604) *before* the Refined-handling code runs, so by the time our fix sees an LHS, alias-wrapped Refined types are already unwrapped. Recursive types are rare, not used in refinement contexts, and Phase 3+ territory.

**Required follow-up test:** The bounds-expansion path (Piece 1) operates on `Var.lowerBounds`. If a Var's bounds contain an Alias that wraps a Refined type (e.g. `let x: Positive = ...` then later `x` flows through inference), the alias-unwrap happens on the recursive `constrain` call rather than during expansion. Add a unit test that exercises this exact pattern — bounds containing Aliased-Refined types — to confirm the unwrap chain produces the correct Refined type at the solver call. Failure mode without the test: silent precision loss where alias-wrapped refinements in bounds get dropped.

### 5. Existing-test fallout — **triage individually, expect 5–15 updates**

The change is strictly tightening: cases silently accepted today will be rejected when the solver can disprove them. Two flavors of broken test:

- **Flavor A — pinning the inert behavior.** Test asserted "this typechecks" for a case where the new strict behavior emits an error. Update to match new strict behavior.
- **Flavor B — accidental dependency.** Test about something unrelated that happens to use refinement-typed values. Adjust the test code so it doesn't trip the new rejection.

Both flavors are *expected and desirable* — the point of the fix is that the typechecker catches things it didn't before. Each broken test gets a verdict during implementation (Flavor A vs B vs "real regression in the fix"). No blanket "accept all changes" — every one is read.

## Implementation Plan

Tracked as separate commits inside the same PR.

1. **Helper: `expandLowerBoundsToType`** in `infer.ts`. Walks a Var's `lowerBounds`, returns a single Type that conservatively represents the union (or the bound if there's exactly one). Preserves `Refined` wrappers. Reuses the existing `expandTypeForDisplay` polarity-positive path. Add a comment at the call site referencing the constraint-grade variant as a future option (see Decision 2).
2. **Solver-aware constraint** in `infer.ts:611-618`. Replace the strip-and-recurse with the dispatch logic:
   - LHS Refined, RHS not: `constrain(ctx, lhs.base, rhs)` (no change).
   - RHS Refined: call `solveRefinedSubtype(lhs, rhs)`. On `Proved`: skip. On `Disproved`: emit error. On `OutOfFragment`: `constrain(ctx, lhs, rhs.base)`.
   - LHS Var with Refined-bearing lowerBounds: expand via Step 1 helper before recursing.
3. **Test updates**. Triage any existing tests that fail. Each broken test gets a verdict: kept-with-update (was pinning inert behavior, now strictly rejects) or fixed-differently (something else).
4. **New tests**. Cover:
   - `assert(x > 0); safeDiv(10, x)` now passes (narrowed flow proves the refinement).
   - `assert(x < 0); let y: Positive = x` now rejects (narrowed flow disproves the refinement).
   - `let x: Number = 5; let y: Positive = x` continues to accept (`OutOfFragment` lenience preserved).
   - `let x: Number = -5; let y: Positive = x` continues to reject (literal fold path unchanged).
   - **Alias-via-bounds-expansion test (per Decision 4):** a Var whose `lowerBounds` contain an Alias that wraps a Refined type (e.g. flowing `Positive`-typed values through inference) — confirm the unwrap chain produces the correct Refined type at the solver call.
   - **`Inter`-of-Refined RHS test (concern B from review):** RHS is `Inter<Refined<...>, Refined<...>>` (multiple refinements ANDed at the target). The dispatch only handles direct `Refined`; the existing `Inter` handling in `constrain` should iterate members so each Refined reaches the dispatch on the recursive call. Test confirms this.
5. **Memory + design-doc updates**. Mark Phase 2.6 shipped in `project_refinement_types.md`. Move this design doc to `design/shipped/`. Update `2026-04-23_refinement-types.md` to note Phase 2.3's "accept conservatively" choice was tightened in 2.6.
6. **Resume Phase 2.5c**. Now that narrowing is observable, switch back to `refinement-phase-2-5c-asserts-functions` branch and pick up at step 3.

## What this phase does NOT do

- Multi-variable / relational refinements (`a > b`) — Phase 3 territory (linear arithmetic solver).
- Forward propagation of refinements through arbitrary arithmetic RHS — also Phase 3 (`let y = x + 1` with `x: Positive` inferring `y: {n | n > 1}`).
- A narrower / faster bounds expansion (constraint-grade variant from Decision 2).
- Phase 2.5c step 3+ — still parked on its own branch, resumed after this lands.

### Known coverage gap — `Union<Refined, Refined>` RHS

Surfaced during PR review (after the design was approved). A function parameter typed as `Refined<Number, n, n > 0> | Refined<Number, n, n < -10>` (a Union of refinements) does *not* get rejected at call sites for arguments outside both members. `f(0)` against this parameter type silently passes today even though `0` satisfies neither member.

Root cause is in the simplifier, not in this phase: certain Union-of-Refined types collapse to a wider type (e.g. `Number`) before the constrain-time dispatch runs. The Union-on-right branch in `constrain` tries each member, but if the simplifier widens before that path executes, no Refined member remains.

Why this is acceptable for v1: Union-of-Refined RHS is a rare annotation pattern. Users typically use `Inter` for compound predicates (which IS covered — see test `Inter-of-Refined RHS`) or a single alias. The let-binding annotation site's separate `isSubtype` check does catch the Union case (`let x: R1 | R2 = 0` correctly rejects), so the gap is specifically at function call sites with Union-of-Refined parameters.

If real cases surface, the fix path is in the simplifier (preserve refinement structure when widening Unions of refinements that share a base) — independent of the constrain-time dispatch shipped here.
