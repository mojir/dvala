# Non-exhaustive match → compile error

**Status:** Implemented (PR #231, pending merge — moves to `design/shipped/` after merge)
**Created:** 2026-06-04

## Goal

Reject every `match` expression that the typechecker cannot prove exhaustive, so a successful compile guarantees no `MatchError` at runtime. Closes the largest non-refinement gap in the "if it compiles it runs" inventory (see `project_compile_implies_run.md`, section B).

The user opts out of the constraint by writing an explicit catchall (`case _ then ...` or `case name then ...`) — the same way they opt out of total functions by raising via `perform(@dvala.error, ...)`.

---

## Background

### Current behavior (2026-06-04)

`infer.ts` already implements exhaustiveness checking, but only for a subset of match spaces. The relevant code is at [infer.ts:1985-2080](packages/dvala-core-tooling/src/typechecker/infer.ts#L1985):

1. Compute `matchSpace = normalizeTrackableMatchSpace(matchType)`.
2. `checkExhaustiveness = isTrackableMatchRemainder(remainingType)` — true only for **finite-domain or fully-structural** types: literals, atoms, `Null`, finite tuples/records/sequences (no rest), and unions thereof.
3. After all cases subtract their consumed types from `remainingType`, if `checkExhaustiveness` was true AND `remainingType.tag !== 'Never'`, throw `Non-exhaustive match — unhandled: <type>`.

The gap is when `isTrackableMatchRemainder` returns **false**:

- Bare primitives — `Number`, `Integer`, `String`, `Boolean` (after normalization Boolean is OK because it expands to `true | false`, both of which are literals).
- Array (`Array<T>` — has rest).
- Open records.
- Sequence with rest.
- `Refined<...>` — currently not modeled in the exhaustiveness pass.
- Generic type variables.

In those cases, a non-exhaustive `match` silently typechecks and may throw `MatchError` at runtime:

```dvala
let classify = (n: Number) -> match n
  case 0 then :zero
  case 1 then :one
end;

classify(2)  // → runtime MatchError
```

### Why now

Phase 2 of the refinement-types track closed 2026-06-04 (PR #230). With refinement strict-by-default, the largest remaining "compile but doesn't run" hole is non-exhaustive match. Closing it lets the language honestly claim "if it compiles it runs" for any code that doesn't use the explicit escape hatches (`perform(@dvala.error, ...)`, `assert(...)`).

### Why "require an explicit catchall" instead of "automatic catchall + warning"

The Q5 interview decision (2026-06-03) picked **Option A (strict)**: reject any non-exhaustive match, require explicit catchall to opt out. Reasoning:

- Consistent with the Phase 2 must-decide pick (strict-by-default for refinement subtyping). Same "if it compiles it runs" framing.
- Refinement types haven't shipped widely, neither has any code-base depending on implicit `MatchError` fallthrough. Migration cost is bounded.
- A warning-only mode would carry the same hidden runtime-failure problem the bare-primitive lenience did before Phase 2 closed.

The user picks the alternative (Option C — strict for trackable shapes only) explicitly if they need it later — same Option-3-style warn→error window that was rejected for Phase 2.

---

## Proposal

### Rule

A `match` expression typechecks if and only if one of:

1. **Tracked exhaustiveness** — `isTrackableMatchRemainder(matchSpace)` is true AND `remainingType` reduces to `Never` after all clauses (current behavior, unchanged).
2. **Explicit catchall** — at least one clause is a `case _` or `case <symbol>` (without a guard, or with a guard that the solver can prove always-true). The catchall must appear in a position where it could actually fire — i.e. not after a clause that already established `Never` remainder.

Otherwise → compile error.

### What counts as a catchall

- `case _ then ...` — always catchall.
- `case name then ...` — symbol binding without a guard is a catchall (binds the whole remaining value).
- `case _ when P then ...` / `case name when P then ...` — catchall only if `P` is in the refinement fragment AND the solver proves `P` is always true on the remaining type. In practice this is a narrow case (e.g. `when true` literal, or `when isNumber(n)` where `n: Number`). Conservative default: treat guarded catchalls as **non-catchalls** for the exhaustiveness check. A guarded clause still narrows the remaining type for the next clause, but doesn't itself establish total coverage. The user writes `case _ then perform(@dvala.error, ...)` if they want the explicit "no other case fired" branch.
- Destructuring patterns (`case [a, b]`, `case {x}`) — never catchall by themselves; they constrain shape.
- Literal patterns — never catchall.

### Error message

```
Non-exhaustive match: the typechecker cannot prove every value of <type> is covered.
Add `case _ then ...` to handle the rest, or refine <var> to a finite domain (literals,
atoms, tuples, or `true | false`).
```

The message names the scrutinee type when it's small enough to print, and points to the docs for the catchall workaround.

### Interaction with refinement narrowing

A typical example the user might expect to "just work":

```dvala
let f = (b: Boolean) -> match b
  case true then 1
  case false then 0
end
```

This is already trackable (`Boolean` → `true | false` per `normalizeTrackableMatchSpace`) and works today.

A trickier example:

```dvala
let f = (n: Number) -> match n
  case x when x > 0 then 1
  case x when x <= 0 then -1
end
```

Here the two guarded clauses partition `Number`, but the solver doesn't currently model "`x > 0 || x <= 0` covers `Number`." The refinement Phase 3 (linear arithmetic) would be the natural place to add this, but **Q5 does not depend on Phase 3**. For now the user adds an explicit `case _` (and ideally panics with `error` because they "know" the guard pair is total). Future Phase 3 work can soften this without breaking any code already passing the check.

### What the runtime keeps doing

The runtime `MatchError` path stays. Compile-time rejection is the new gate; the runtime is the safety net for the (now-impossible without escape hatches) case where compile-time analysis is bypassed (interop, JIT, code generated outside the typechecker).

---

## Resolved Questions (2026-06-04 interview)

- **Q1: Should guards that PARTITION the scrutinee count as exhaustive?** **No in v1.** Phase 3 (linear arithmetic) sharpens this uniformly across all partition shapes — not just the symmetric `> / <=` pair. Special-casing one shape in v1 would add a fragile recognition path without buying much.
- **Q2: How does the rule interact with `Unknown` / `Var` scrutinees?** **Treat as non-trackable → require catchall.** "If it compiles it runs" matters most for generics where the author can't see the call sites.
- **Q3: Should a fold-true guard count as a catchall?** **Yes** — boundary is "whatever the fold pass reduces to `Literal(true)`," not literally `when true`. Catches `!false`, `1 == 1`, `1 + 1 == 2`, etc. Mirrors the existing fold-false redundancy check (`expandedGuard.tag === 'Literal' && expandedGuard.value === false`).
- **Q4: Migration tooling — do we ship a code action to insert `case _ then perform(@dvala.error, ...)`?** **Not in v1.** Tracked under "Code actions" in `design/active/2026-04-02_language-service-next.md` as part of the Q4-LS-features track from the 2026-06-03 interview.
- **Q5: Book-chapter examples currently relying on implicit fall-through?** Audit step (not a decision). Run `pnpm run check` after the typechecker change; add catchalls where required.
- **Q6: Generic scrutinees in a function signature?** **Require catchall.** Same as Q2. Bound-aware exhaustiveness (e.g. `T: Atom` enumerated) is deferred to the same Phase-3-shaped follow-up as Q1.
- **Q7: Error wording — unified vs split?** **Unified.** One `Non-exhaustive match` error class, suffix branches on context: `... unhandled: <remaining type>` for trackable, `... cannot prove every value of <scrutinee type> is covered; add 'case _ then ...' to handle the rest` for non-trackable.

## Edge cases (covered by the implementation)

- **Zero-case match** (`match x end` with no cases): handled by the existing `cases.length === 0` short-circuit at the top of the match handler — the inferer treats it as structurally degenerate and rejects. No interaction with the new catchall logic.
- **Catchall with a fold-false guard** (`case _ when false then ...`): the fold-false `continue` path skips the case before the `sawCatchall` flag is set, so the catchall doesn't count. The exhaustiveness error fires correctly (the user gets both the redundant-guard warning and the non-exhaustive error).
- **Catchall whose body has type `Never`** (e.g. `case _ then perform(@dvala.error, "...")`): still counts as a catchall — the rule is about coverage of the scrutinee, not return type.
- **Refined-type scrutinees** (`x: Number & {n | n > 0}`): `isTrackableMatchRemainder` returns false for `Refined`, so the new check fires. The user must add a catchall — the refinement narrows the source domain but doesn't make the domain enumerable.

---

## Implementation Plan

1. **Audit `isTrackableMatchRemainder`** — confirm the trackable set is what we want to keep as "exhaustiveness-via-shape" vs require explicit catchall. Add tests pinning the boundary cases.

2. **Add `hasExplicitCatchall(cases)` helper** — walk the case list, return true if any clause is `_` or unbound-symbol with no guard (or with a fold-true guard).

3. **Extend the match-exhaustiveness check site in [infer.ts:2074](packages/dvala-core-tooling/src/typechecker/infer.ts#L2074)** — when `!checkExhaustiveness && !hasExplicitCatchall(cases)`, throw a new `Non-exhaustive match — no catchall and scrutinee type <type> isn't finite-domain` error. Keep the trackable-but-non-Never path untouched.

4. **Update the error wording for both paths** — consistent phrasing, point to the catchall workaround. Land both in the same PR so users see only one form of the diagnostic.

5. **Migrate the book + examples + reference corpus** — `book/` examples, `dvala examples`, README snippets. Run `pnpm run check` to find the failures, fix each by adding a catchall (preferring `case _ then perform(@dvala.error, "<context>")` for examples that really shouldn't have an off-rule fallthrough).

6. **New refinement-aware exhaustiveness tests** — pin the open questions, especially Q1 (partition guards still require catchall in v1), Q3 (fold-true guard counts), Q6 (generic scrutinees).

7. **Update `project_compile_implies_run.md` memory** — mark gap B (non-exhaustive match) closed.

8. **Update `project_roadmap_1_0.md`** — mark Tier 2 item 5 (non-exhaustive match) done. Note Phase 3 sharpening (Q1) as a possible follow-up.

Estimated scope: ~1 day design pinning + ~3–5 days implementation + ~0.5–1 day migration. Total within the 2026-06-03 interview's 5–7 day estimate.
