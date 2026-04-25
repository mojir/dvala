# Phase 2.5c — Sound User-Declared `asserts P` Assertion Functions

**Status:** Approved — ready for implementation
**Created:** 2026-04-25
**Last updated:** 2026-04-25 (open questions resolved; see Decisions section)
**Tracks:** Continuation of `2026-04-23_refinement-types.md` (Phase 2.5 — Narrowing + assert(P) wiring)
**Supersedes-decision:** v1's "no user-declared `asserts P`" rule — Phase 3 reconsideration moment described in the parent doc.

## Goal

Let users write sound named assertion helpers like `assertPositive` so calling them narrows the argument the same way `assert(x > 0)` does today — without opening an `assume P` soundness hole.

```dvala
let assertPositive: (x: Number) -> asserts {x | x > 0} = (x) -> assert(x > 0);

let safeDiv = (a: Number, b: Number) -> {
  assertPositive(b);   // narrows b to {n | n > 0} for the rest of the body
  a / b                // ✓ b is provably non-zero
}
```

The unsound shortcut — accept the annotation without checking the body proves it — is not on the table. v1 of refinement types explicitly rejected this on the same soundness grounds that ruled out `assume P` and unsafe casts.

---

## Background

### What's already shipped on the refinement-types track

- **Phase 1** (PR #95) — predicate parsing + fragment check, predicates erased.
- **Phase 2.1–2.4** (PR #96) — `Refined` type node, walker updates, multi-refinement merging, fold-discharge, finite-domain + interval solver.
- **Phase 2.5a** (PR #98) — block-level `assert(P)` narrowing.
- **Phase 2.5b** (PR #99) — `if`/`match` flow narrowing on refinement predicates.
- **Phase 2.5c metadata cut** (PR #100) — `BuiltinTypeInfo.assertsParam` field; generic dispatch (no hardcoded `'assert'` name). Builtins can claim "param N is asserted on success" via metadata.
- **Standard prelude** (PR #101) + book chapter (PR #102) + `dvala doc` integration (PR #104) — `Positive`, `NonNegative`, `NonZero`, `NonEmpty<T>` with full doc surface.

### What this phase delivers

The metadata cut got the dispatch path right (`assert` is no longer hardcoded), but the parser surface — the `asserts P` keyword in real Dvala syntax — and **the soundness machinery to support user code** are still missing.

The parent design doc anticipated this exact reconsideration moment:

> **Reconsider before implementing v1.** The body-verified form (sound user-declared assertion functions) should be re-evaluated once at the start of Phase 3 with fresh information.

We're past v1 implementation now. This is that reconsideration. Choosing to ship sound user-declared assertion functions adds two pieces:

1. **Parser surface for `asserts P` return-type annotations** (also useful for builtin signatures going forward — they could move from metadata into dvala syntax, though that's not required for soundness).
2. **A body-verification pass** that proves every normal-return path of the function actually establishes the annotated predicate. Without this, the annotation is `assume P` wearing a function-shaped hat.

---

## Proposal

### Surface syntax

`asserts {binder | body}` lives in the same return-type slot as `is T` (type guards) and `T -> U` (ordinary returns). The predicate inside the braces is the **same shape used everywhere else in the refinement-type system** — `Number & {n | n > 0}`, `Sequence & {xs | count(xs) > 0}`, etc. — so users learn one predicate form and apply it across all surfaces (type alias body, intersection refinement, assertion return).

```dvala
let assertPositive: (x: Number) -> asserts {x | x > 0} = (x) -> assert(x > 0);
let assertNonEmpty: (xs: Array<Number>) -> asserts {xs | count(xs) > 0} = (xs) -> assert(count(xs) > 0);
```

Two constraints, both checked at parse/type-check time:

- **Binder name must equal a parameter name in the surrounding function signature.** This identifies which parameter is being asserted, unambiguously even for multi-parameter functions:
  ```dvala
  // Asserts the second parameter:
  let foo: (a: Number, b: Number) -> asserts {b | b > 0} = ...
  // Rejected — `n` is not a parameter:
  let bad: (x: Number) -> asserts {n | n > 0} = ...
  ```
- **Predicate body satisfies the existing fragment check.** Same fragment-eligible single-binder predicates accepted by `Number & {n | n > 0}` are accepted here. Multi-parameter assertions (`asserts {a, b | a > b}`) are out of scope for this phase — they need relational refinements the current solver can't handle.

The binder name being equal to the parameter name is mildly redundant (the binder serves as a syntactic marker more than independent information), but it's the cost of reusing the existing predicate parser and fragment-checker without any wrapper code.

### Body verification pass

A new pass runs after type inference completes. For each function declared with `(...) -> asserts P` returning normally:

1. Walk every reachable normal-return path through the body.
2. Accumulate the predicate facts each path establishes (from `assert(...)` calls, `if`/`match` narrowing, fold-discharge, propagation through bindings).
3. At each return point, query the existing solver: "given the accumulated assumptions, is `P` proved?"
4. If any normal-return path fails to prove `P`, emit an `error`-severity diagnostic pinpointing the path.
5. Throwing paths (paths that always `perform(@dvala.error, ...)` or call other always-throwing functions) are exempt — they don't return normally, so they can't violate the assertion. Throw-vs-return is decided from the existing effect-set analysis; we don't reinvent it for this pass.

**Reuses existing infrastructure.** Phases 2.5a (block-level narrowing) and 2.5b (if/match flow narrowing) already implement the path-sensitive assumption-accumulation machinery. Body verification is the same machinery aimed in reverse — instead of "what's narrowed at this program point", it's "do the accumulated assumptions prove `P` at this return?". Estimated cost ~400–700 LOC, not the ~500–1000 LOC the parent doc projected.

**Restrictions on the body** (see Decisions 4 and 5):

- No recursion — direct or mutual.
- No `do with h ... end` handler-install blocks.

These restrictions are enforced as part of the verification pass: any violation emits an `error`-severity diagnostic before the proof check runs. The body may freely perform effects, call other functions (including other verified assertion functions), use `if`/`match`/early returns, and use the full predicate fragment.

### Call-site narrowing

Once a user-declared assertion function is verified, its call sites narrow exactly like the builtin `assert`: the metadata pipeline already wired in PR #100 dispatches by signature, so the parser-surface annotation feeds the same narrowing path.

### Ordering against other refinement work

This phase is **independent** of the inert solver pass-through fix (memory's "load-bearing gotcha") and Phase 3's multi-variable linear-arithmetic solver. Ship it standalone.

---

## Decisions

The five open questions raised during design review have been resolved. Recording the choice and rationale here so future readers (and future-me) can reconstruct *why*, not just *what*.

### 1. Body-verification fragment scope — **(c) full control flow**

Body may include `if`/`match`/early-return; every reachable normal-return path must prove `P`; throwing paths are exempt.

**Why:** Phases 2.5a and 2.5b already built the path-sensitive assumption-accumulation machinery, so (c) reuses it rather than building from scratch — real cost is ~400–700 LOC, not 10× (b). And (b) is annoyingly restrictive in practice: users can't write the natural form

```dvala
let assertScore: (n: Number) -> asserts {n | 0 <= n && n <= 100} = (n) -> {
  if n < 0 -> perform(@dvala.error, "negative")
  else if n > 100 -> perform(@dvala.error, "too big")
  else -> {}   // nothing to assert; the if-chain narrowed n
}
```

…which is exactly the kind of "compiler made me write it weird" friction that pushes users toward unsound escape hatches. (c) accepts this naturally; (b) rejects it.

### 2. Treatment of unproven paths — **`error`-severity**

Match the rest of the typechecker. Users advertising soundness in a signature should pay the cost of proving it; warning-with-no-narrowing decouples the diagnostic from the feature loss in a way that's mildly confusing.

### 3. Migrate builtin `assert` from metadata to parser-surface annotation — **yes (follow-up commit)**

After the parser surface lands, change `assert`'s `docs.type` from `'(cond: Boolean) -> Boolean'` (with `asserts: { paramIndex: 0 }` metadata) to `'(cond: Boolean) -> asserts {cond | cond}'`. Cosmetic; removes the parallel metadata field and gives one canonical encoding for the feature. The trivial-`assert` form is mildly weird (`{cond | cond}` is the degenerate "assert this Boolean is truthy" predicate), but only this one builtin has the shape — real user assertions always use the binder meaningfully.

### 4. Recursion in assertion bodies — **reject (direct and mutual)**

**Why:** Allowing recursion admits induction-without-a-base-case "proofs":

```dvala
let bogus: (n: Number) -> asserts {n | n > 0} = (n) -> { bogus(n) }
```

The body's only path is a recursive call. By induction "`bogus(n)` returns ⇒ `n > 0`", so the body type-checks vacuously — but the recursive call never terminates and the proof is circular. To allow recursion soundly we'd need a totality check (prove every recursion path eventually hits a base case via a well-founded measure). Totality checking is undecidable in general; the practical compromise (structural-recursion detection) is weeks of compiler work.

**Cost-benefit:** real-world assertion helpers are flat. `assertPositive`, `assertNonEmpty`, `assertInRange` — none recursive. Reject costs near zero in user benefit; allow costs weeks. Easy call.

**Enforcement:** the verification pass walks the body's call graph; any cycle through the function being verified (or another asserts-bearing function in the same SCC) is rejected with a diagnostic.

### 5. Handler-install blocks in assertion bodies — **reject `do with h ... end` blocks**

Performing effects in the body is *fine* — they're throwing paths, naturally exempt. The soundness hole is narrower: a handler **inside the body** that catches the effect can turn a throwing path into a returning path that didn't prove `P`:

```dvala
let bogus: (x: Number) -> asserts {x | x > 0} = (x) -> {
  do with handler @dvala.error(_) -> resume(:caught) end;
    assert(x > 0)   // x <= 0: throws → handler resumes → function returns
                    //         but x > 0 was NEVER established
  end
}
```

So the rule is precisely: **no `do with h ... end` handler-install blocks inside the body**. The body may perform effects, call other functions that perform, call other verified assertion functions, use `if`/`match`/early returns, use the full predicate fragment.

(Whether the *caller* wraps `assertPositive(x)` in a handler that catches `@dvala.error` is the same soundness gap that already exists for the builtin `assert` — out of scope for this phase. If we ever close it for builtin `assert`, the same fix applies to user-declared.)

---

## Implementation Plan

Tracked as separate commits inside the same PR (or sequential PRs if it grows). All steps gated on `npm run check` passing.

Tracked as separate commits inside the same PR (or sequential PRs if it grows). All steps gated on `npm run check` passing.

1. **Parser surface for `asserts {binder | body}` return-type annotations.** Extend `parseType.ts` (`tryParseTypeGuard` neighbor, around line 1011) — new keyword `asserts`, predicate parsing reuses `consumeAndCheckRefinementPredicate` directly (the same call used by `Type & {binder | body}`). After parsing, validate the binder name equals a parameter name in the signature; reject otherwise. Carry the result through `ParsedFunctionType` (new fields `assertsParam` + `assertsPredicate` parallel to `guardParam`/`guardType`). Round-trip: parse → format → parse stable.
2. **Walker updates.** Every function-type walker in the codebase (substitution, simplification, formatting, doc generation, untokenizer) needs a case for the new variant. ~14 touchpoints per memory.
3. **Inference integration.** Asserts-bearing function types flow through inference like ordinary function types — the assertion metadata is read at call sites by the existing PR #100 dispatch. At this point, **builtin-only** call sites already work; user-declared functions parse and infer but the body isn't verified yet (so they're treated as untrusted, no narrowing — same as today).
4. **Body-verification pass — fragment scope (c).** New file `src/typechecker/assertsBodyVerify.ts`.
   - Walk function declarations with `asserts P` returns.
   - For each: traverse the body's control-flow graph, accumulating per-path assumption sets (reuse Phase 2.5a/b machinery). Existing effect-set analysis decides throw-vs-return per path.
   - Pre-flight: reject recursion (call-graph SCC containing this function) and reject any `do with h ... end` block in the body. Both emit `error` diagnostics distinct from the proof-failure diagnostic.
   - Per normal-return path: query the existing solver against `P` under that path's assumption set. Unproven paths emit `error`-severity diagnostic with the path's source span.
5. **Call-site narrowing — user-declared.** Once the body verifies, the same dispatch path that handles builtin `assert` (PR #100) narrows the asserted argument at call sites. No new code expected here — verify the existing dispatch works for user-declared signatures.
6. **Builtin migration.** Move `assert` from `assertsParam` metadata to `asserts cond` parser-surface annotation in its `docs.type` string. Verify the metadata-pipeline path still produces identical narrowing (no behavior change; cosmetic only). The metadata field stays in code as a parsed representation.
7. **Tests.**
   - Round-trip: body verifies, narrowing works at call sites.
   - Round-trip with control flow: `if`/`match`/early-return bodies (the `assertScore` example above).
   - Negative: body fails to prove → diagnostic with exact unproven-path span.
   - Negative: recursion rejected (direct + mutual).
   - Negative: handler-install in body rejected.
   - Negative: free-variable mismatch (predicate's free var doesn't match a parameter name).
   - Negative: predicate not fragment-eligible.
   - Round-trip on the migrated builtin `assert` — narrowing identical before/after.
8. **Documentation.** Extend `book/05-advanced/08-refinement-types.md` with a "User-declared assertion functions" section. Cover the soundness story (why no `assume P`), the body restrictions (no recursion, no handler-install), and the natural control-flow form.
9. **Memory + design-doc updates.** Mark this phase shipped in `project_refinement_types.md`. Move this design doc to `design/shipped/` once landed.

---

## What this phase does NOT do

Out of scope, called out so they don't quietly creep in:

- Multi-variable / relational assertions (`asserts a > b`) — needs Phase 3 solver.
- Recursion in assertion bodies — see Decision 4.
- Handler-install blocks (`do with h ... end`) inside assertion bodies — see Decision 5.
- Caller-side handler-soundness gap (caller wraps `assertPositive(x)` in a `@dvala.error`-catching handler) — same gap exists for builtin `assert`; closing it is a parent-design problem, not Phase 2.5c.
- The "narrowing inert pass-through" fix from `project_refinement_types.md` memory — independent, separately scoped.
