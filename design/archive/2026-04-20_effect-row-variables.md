# Effect Row Variables — Phase 4-A

**Status:** Shipped (Phases A, B, C, D)
**Created:** 2026-04-20
**Archived:** 2026-04-20
**Supersedes scope of:** [2026-04-19_handler-typing.md § Phase 4-A](./2026-04-19_handler-typing.md#L244-L254)
**References:**
- [2026-04-12_type-system.md § Decision #12](../active/2026-04-12_type-system.md#L33) — open effect sets with variable `@{e...}`
- [2026-04-12_type-system.md § Open Q3 (settled)](../active/2026-04-12_type-system.md#L1174-L1182) — biunification over the effect lattice preserves principal types

> **Ship note (2026-04-20):** All four phases shipped. Row-variable effect polymorphism is live: the six `effectHandler/` signatures carry row-polymorphic types (`(() -> @{choose | r} A) -> @{dvala.random.item | r} A` etc.), and thunk extras propagate through `ρ` into the caller's effect set via biunification over the flat effect-name lattice. `HandlerWrapperInfo` retained as a fast-path alongside row-var inference. Book chapter on Effect Polymorphism shipped at [book/05-advanced/02-effects.md § Effect Polymorphism](../../book/05-advanced/02-effects.md).
- [src/typechecker/effectTypes.ts](../../src/typechecker/effectTypes.ts)
- [src/typechecker/types.ts:25-28](../../src/typechecker/types.ts#L25-L28) — current `EffectSet`
- [src/typechecker/types.ts:91](../../src/typechecker/types.ts#L91) — MLsub `Var` (template for effect rows)

---

## Goal

Give effect sets *identity*. Today, `EffectSet = { effects: Set<string>, open: boolean }` — a single openness bit. Two `@{e...}` tails in one signature cannot unify, so a thunk's remainder effects silently disappear across a handler-wrapper call. Phase 4-A introduces MLsub-style row variables for effect sets so that signatures like

```
chooseRandom : (() -> @{choose | ρ} A) -> @{dvala.random.item | ρ} A
timeIt       : (String, () -> @{ρ} A) -> @{ρ, dvala.io.print} A
```

work end-to-end in inference — with `ρ` unified across the signature and discharged against the caller's actual thunk effects. This closes the last open item from the handler-typing track and makes user-defined effect-polymorphic helpers typeable without the `FunctionDocs.wrapper` escape hatch currently used for the six `effectHandler/` builtins.

**Scope note.** The *principality result* is settled: Dolan's algebraic subtyping preserves principal types over any distributive lattice, and the flat effect-name lattice is one such ([type-system doc Q3 settlement](2026-04-12_type-system.md#L1174-L1182)). The *mechanism* — row-variable identity on effect sets, parser syntax, biunification rules over the effect lattice — is not shipped. Decision #12 in the type-system doc ("open sets with set variable `@{e...}`") describes the *intended* design; the actual parser today only produces `{ effects, open: true }` with no variable identity. This doc proposes to build that machinery, not extend it.

---

## Background

### What exists today

- **Effect sets on function types.** `FunctionType.effects : EffectSet = { effects, open }` ([types.ts:47-54](../../src/typechecker/types.ts#L47-L54)).
- **Effect subtyping as subset check.** `isEffectSubset(sub, sup)` at [types.ts:489-493](../../src/typechecker/types.ts#L489-L493) — single openness bit on `sup` means "any remainder is OK".
- **Handler application law.** `(Σ_body \ handled) ∪ introduced` is computed on concrete sets at do-with-h and h(body) call sites ([infer.ts:1318-1400](../../src/typechecker/infer.ts#L1318-L1400) roughly).
- **`HandlerWrapperInfo` shortcut.** Functions that *internally* install a handler (the six `effectHandler/` builtins) carry a `wrapper: { paramIndex, handled, introduced }` record in `FunctionDocs`. At call sites, the handler-wrapper branch runs the application law directly against the thunk argument's effect set — bypassing the need for true row-polymorphic signatures ([types.ts:35-45](../../src/typechecker/types.ts#L35-L45)).
- **`@{e, ...}` parsing.** The parser recognises the open-tail form and produces `EffectSet { effects: {e}, open: true }` ([parseType.ts:460-500](../../src/typechecker/parseType.ts#L460-L500)).
- **`constrain(Unknown, Var)` fix.** Recently added narrow fix so declared-`Unknown` returns land in a Var's lowerBounds instead of being no-op'd ([infer.ts](../../src/typechecker/infer.ts) — PR #57).

### What's missing

1. **No row-variable identity.** Two `@{e...}` tails in the same signature (e.g. the thunk arg's open tail and the return-type's open tail) are represented as two independent `open: true` bits. There is no shared variable they can both reference, so the tail contents don't propagate.
2. **Generic helpers can't be typed.** A user-written `let timeIt = (label, thunk) -> do print(label); thunk() end` cannot express "my effects = thunk's effects ∪ {dvala.io.print}" — there's nothing to name "thunk's effects".
3. **The six `effectHandler/` sigs are only correct because of `HandlerWrapperInfo`.** The declared types (`() -> @{choose | ...} A`) look row-polymorphic, but the machinery that actually propagates the tail lives in the `wrapper` metadata, not in the type. A user-defined handler wrapper in pure Dvala gets no equivalent treatment.
4. **Subtyping between open effect sets is coarse.** `isEffectSubset(sub, sup)` short-circuits to `true` whenever `sup.open` — correct as a *coarse upper bound* but useless for propagating lower-bound info into a row var.
5. **Display / simplification have nothing to simplify against.** Today, `@{foo, bar}` with `open=true` prints as `@{foo, bar, ...}`. With named/anonymous row vars, we'll need to decide how variables print before and after simplification (analogous to value-type `α₀ : A` expansion).

### Why this is warranted now

- Handler typing Phases 0–6 shipped (2026-04-19). `HandlerWrapperInfo` covers the builtin wrappers but is not a solution users can reach — every new effect-polymorphic helper currently leaks through the type system as `Unknown` on its thunk parameter.
- Set-theoretic Phase A work (open-records, Var/biunification) is stable and shipping. Extending the same engine to effect rows is *additive* over what's already there, not a rewrite.
- The immediate payoff: the six `effectHandler/` signatures become type-accurate without `HandlerWrapperInfo`'s direct-subtraction escape hatch. `HandlerWrapperInfo` may stay as an optimisation/fast-path, but it stops being load-bearing.

---

## Proposal

### Data model

Replace the flat `open: boolean` on `EffectSet` with a three-way tail:

```ts
type EffectTail =
  | { tag: 'Closed' }                             // @{e1, e2}      (no remainder)
  | { tag: 'Open' }                               // @{e1, ...}     (anonymous open tail — coarse)
  | { tag: 'RowVar'; id: number; level: number;  // @{e1 | ρ}      (named row var with bounds)
      lowerBounds: Set<string>[]; upperBounds: Set<string>[] }

interface EffectSet {
  effects: Set<string>
  tail: EffectTail
}
```

- `Closed` = exactly these effects; what pure functions use (`effects: ∅, tail: Closed`).
- `Open` = "these plus more" with no identity. Kept as a coarse fallback for back-compat (display, coarse subtype checks) and for annotations that explicitly don't want to share a tail.
- `RowVar` = MLsub-style variable with lower/upper bounds over sets of effect names. `id` gives it identity across the signature so two occurrences can unify.

The `Var` node mirrors the value-type `Var` at [types.ts:91](../../src/typechecker/types.ts#L91) but its bounds are `Set<string>` rather than `Type`, because the effect lattice is a flat free distributive lattice over effect names (union = join, ∅ = bottom, subset = order). This matches the settled principal-types result in the type-system doc.

**Biunification rules** (mechanical, copy-paste of the value-type rules onto the effect lattice):

- `constrain(sub, sup)` when `sup.tail = RowVar(ρ)`:
  `sub.effects ⊆ ρ.lowerBounds` (add `sub.effects` as a lower-bound contribution).
  If `sub.tail = RowVar(σ)`, add `σ ⊆ ρ` as a var-to-var constraint (resolved at expansion).
- `constrain(sub, sup)` when `sub.tail = RowVar(ρ)`:
  `sup.effects ⊇ ρ.upperBounds` (add `sup.effects` as an upper-bound contribution).
- **Positive positions** union lower bounds. **Negative positions** intersect upper bounds. Exactly as MLsub.

**Expansion / display** (for hover / error messages):
- Vars with a single lower bound and no upper bound simplify to that lower bound.
- Vars that remain genuinely polymorphic print as `ρ₀`, `ρ₁`, … and are shown in the printed signature alongside their `A, B` value-type variables.
- At toplevel `let` bindings, generalize free effect-row vars the same way free value-type vars are generalized.

### Surface syntax

**Decided: named row vars with `@{e, ...}` as positional sugar.**

- `@{e | ρ}` — explicit named row var. Users pick `ρ`, `σ`, … (lowercase Greek or single lowercase Latin, to stay distinct from value-type vars `A, B, …`).
- `@{e, ...}` — sugar for a fresh anonymous row var. All `...` tails within one parsed signature share the *same* anonymous var — i.e. positional unification within a signature.

Named form is strictly more expressive; sugar preserves back-compat for every existing annotation. Cross-signature sharing (same name reused across unrelated signatures) is out of scope — scope is one top-level annotation.

### Open tails that *don't* participate in polymorphism

Some call sites produce "open" effect sets that genuinely have no variable identity — most notably, the leaked-effect manifest at program top level, and fallback paths where inference gave up. These stay as `Open` (the anonymous-no-identity tail), distinct from `RowVar`. Phase A introduces `Open` and `RowVar` as distinct tail shapes precisely so we can tell these apart.

### Handler typing changes

- `HandlerType.introduced` already exists and already tracks "effects introduced by clauses". No schema change — but `introduced` becomes an `EffectSet` over the new `EffectTail` (usually `Closed` since handler clauses perform a fixed set of effects, not a row-polymorphic one).
- `HandlerWrapperInfo` stays as a fast-path (and for the `type` + `wrapper` docs idiom that lets builtin modules declare handler wrappers without going through source inference). Once row vars are in place, user-defined handler wrappers in pure Dvala get the same propagation behaviour *without* needing `HandlerWrapperInfo`.
- Application law unchanged in spirit: `(Σ_body \ handled) ∪ introduced`. With row vars, if `Σ_body = {choose} ∪ ρ`, the result is `ρ ∪ introduced` — and `ρ` is a genuine variable that the surrounding context can constrain.

### Interaction with existing plumbing

- **`constrain(Unknown, Var)` fix** carries over as-is. Unknown in the thunk's effect-set position should continue to push `Unknown` to the row-var's bounds; the expansion logic collapses it to `Unknown` (coarse upper approximation) as today.
- **Sequence types / match typing** — no interaction; effect rows are orthogonal.
- **Serialization / AST bundle** — types (including effect sets) are erased before bundling today; [src/bundler/](../../src/bundler) never touches `Type` or `EffectSet`. No wire-format risk from this work. **Invariant for future manifest work:** the leaked-effect manifest (planned, not shipped) must resolve `RowVar` tails to concrete effect sets before emit — row vars are an inference-time construct and don't cross the serialization boundary.

---

## Open Questions

1. **Keep `HandlerWrapperInfo` forever, or retire once row vars work?** Retiring simplifies one mechanism; keeping gives builtin modules a declarative fast path that doesn't depend on inference. Lean: keep, but treat it as an optimisation, not the source of truth. Add a debug assertion in dev mode that the wrapper-based and row-var-based application laws agree.

2. **Subtyping between two `RowVar`s with distinct ids** in the same signature. MLsub resolves via variable-to-variable constraints; verify that the flat effect lattice doesn't introduce extra cases (should be strictly simpler than the value-type case, which has full `Type` bounds).

3. **Simplification ordering** — effect rows vs. value vars during the generalization pass. Confirm no ordering dependency exists; if it does, document it.

4. **Display stability for existing tests.** Many type-inference tests pin exact `@{…}` output. With row vars, some printed sigs will gain `ρ` names. Plan a codemod sweep of `typechecker.test.ts` snapshots before landing.

---

## Implementation Plan

Phased to keep each PR independently reviewable. Runtime unchanged throughout. Release-version assignment deferred — decide once Phase A's scope is confirmed by implementation.

### Phase A — Data model + parser (mechanical, no inference changes)

**Invariant (Phase A):** `RowVar` is a *data shape only*. It is produced exclusively by the `@{e | ρ}` parser path and by structural operations that preserve it (freshening, equality, printing). It must **not** be produced by any inference path — no `infer`, `constrain`, `subtract`, `merge`, `unionEffectSets`, or bounds-expansion call should construct a `RowVar`. Subtyping and constraint-resolution sites (`isEffectSubset`, `constrain`) throw when they encounter a `RowVar` — loudly, not silently — so the invariant is enforced at runtime rather than trusted. Structural sites (`effectSetEquals`, `effectSetToString`, freshening) handle `RowVar` normally because the round-trip tests in A.4 legitimately exercise them. Phase B lifts the throw and replaces it with real biunification.

- A.1 Introduce `EffectTail = Closed | Open | RowVar` in [types.ts](../../src/typechecker/types.ts). Keep `open: boolean` as a deprecated derived getter until call sites migrate.
- A.2 Migrate `PureEffects`, `effectSet()`, `mergeEffects`, `subtractEffects`, `effectSetEquals`, `effectSetToString` to the new tail shape. `isEffectSubset`, `constrain` (for effect sets), and `unionEffectSets` ([infer.ts:2070](../../src/typechecker/infer.ts#L2070)) throw on `RowVar` (see invariant above). Behaviour identical to today when tail ∈ {Closed, Open}. Leave a `// PHASE_4A_REMOVE` marker at each throw site so Phase B can grep-find them.
  - **`RowVar` equality: by id.** `effectSetEquals` dispatches on tail kind; two `RowVar`s are equal iff `a.id === b.id` (bounds ignored, matching value-type `Var` semantics at [types.ts:444](../../src/typechecker/types.ts#L444)). Independent freshened instantiations of the same annotation are *not* equal. Reference equality would also work but breaks silently if a `RowVar` is ever cloned (e.g. `structuredClone`, JSON round-trip). By-id is trivially cheap and resilient.
  - **Delegating callers.** `typeEquals` ([types.ts:392](../../src/typechecker/types.ts#L392)) and `HandlerType` equality ([types.ts:406](../../src/typechecker/types.ts#L406)) delegate to `effectSetEquals` — no direct change needed, but grep-check the `Union`/`Inter` dedup path and function-type intersection for overload selection to confirm zero behavioural drift.
- A.3 Parser: `@{e, ...}` maps to `Open` for back-compat; `@{e | ρ}` introduces a named `RowVar` shared within the signature scope (scope = one top-level annotation).
- A.4 Tests: round-trip parse/print for all three tail forms. Any test that exercises subtyping/constraining against a row var is `.skip`'d with a `// PHASE_4A_ENABLE` marker — enabled when Phase B lands.
- A.5 **Freshening.** Extend `freshenAnnotationVars` / `freshenAllVars` in [infer.ts:1524](../../src/typechecker/infer.ts#L1524) (addresses the existing `// TODO Phase 4-A` comment) to walk `EffectSet.tail`. When tail is `RowVar(id)`, allocate a fresh `RowVar` keyed through a dedicated per-instantiation table `Map<number, RowVar>` — kept *separate* from the value-type `Map<number, TypeVar>` table (bounds differ: `Set<string>[]` vs `Type[]`, so static dispatch by kind is cleaner than a discriminated union). Invariant test: the same annotation instantiated twice produces distinct row-var ids.
- A.6 **`Handler<…>` 4th slot.** Extend the `Handler<B, O, @{caught}>` parser at [parseType.ts:443](../../src/typechecker/parseType.ts#L443) to accept an optional positional 4th slot `@{introduced}`, defaulting to `@{}` (`PureEffects`) when omitted. Three-slot form stays legal. Needed for handler-returning functions (today: `effectHandler.fallback`) to declare their introduced set directly in the `type` string rather than via the `wrapper` metadata escape hatch. For non-handler-returning wrappers, `introduced` will live in the function return-type's effect set via row-var unification (Phase C). Tests: round-trip parse/print for 3-slot and 4-slot; 4-slot with pure-introduced equals 3-slot form.
- A.7 **Display policy for `RowVar`.** `effectSetToString({effects: {foo}, tail: RowVar(ρ₀)})` prints as `@{foo | ρ₀}` (the new named form, matching what was parsed). Snapshot churn during Phase B is expected as simplification collapses single-bound vars — accept this cost now rather than churn twice.

*Expected: full test suite green — no inference path reaches a `RowVar`, so the throws stay dormant. If the suite does throw, that's the invariant catching a bug, and the fix is always upstream of the throw.*

### Phase B — Biunification over effect rows

- B.1 Extend `constrain` in [infer.ts](../../src/typechecker/infer.ts) to dispatch on effect-tail shape. Var-to-concrete, concrete-to-var, var-to-var rules.
- B.2 **`unionEffectSets` becomes row-var-aware.** Aggregating multiple effect sets produces a fresh row var `ρ_new` whose lower bounds include all inputs' row vars and concrete effect sets — textbook MLsub treatment, matching value-type `Union` behaviour. Alternatives considered (canonicalize-to-first-var, fall-back-to-Open) rejected as either having correctness caveats at cross-signature aggregation or defeating row-var propagation entirely. The B.1 biunification engine already needs var-to-var constraint handling for `chooseRandom`-style sigs, so this is additive, not incremental.
- B.3 Expansion / display: walk a signature, pick fresh `ρ₀, ρ₁, …` names, substitute bounds, simplify singletons.
- B.4 Generalization at `let`: any row vars free in a top-level binding's inferred type become universally quantified.
- B.5 **Well-formedness check on wrapper signatures.** At sig-registration time for builtin wrappers (`FunctionDocs.wrapper` + the 4-slot `Handler<…>` annotation) and at inference time for user-defined `handler … end` expressions, reject any sig where a `handled` effect appears *only* inside a row-var's lower bounds rather than on the concrete side of the body's effect set. Rationale: MLsub's principality guarantees row vars are disjoint from explicit slots when sigs are well-formed, which is the invariant that makes `(Σ_body \ handled) ∪ introduced` compute correctly. Malformed sigs (the under-subtraction case) get a clear error at declaration time rather than silent wrong answers at handler-application time. The six builtin `effectHandler/` sigs already satisfy this — the check is a safety rail for user-defined wrappers.
- B.6 Tests: the four row-polymorphic patterns from the Goal section; `map`, `filter`, `reduce` sigs tightened to propagate the callback's effects; cross-signature sharing within a handler wrapper; a rejection test for a deliberately malformed wrapper sig (B.5). Unskip the `// PHASE_4A_ENABLE` tests from A.4.
- B.7 Remove the Phase A throw guards at every `// PHASE_4A_REMOVE` site (grep enforces completeness).

*Expected: existing tests pass (with possible snapshot churn for hover displays). New tests green.*

### Phase C — Apply to `effectHandler/` and retire the escape hatch where safe

- C.1 Rewrite the six `effectHandler/` signatures in pure row-var form, backed by row-var unification rather than `HandlerWrapperInfo.direct-subtract`.
- C.2 Keep `HandlerWrapperInfo` as an optional fast-path; add a dev-mode parity assertion.
- C.3 Add at least two user-defined wrappers (`timeIt`, `withLog`) to the book / tests demonstrating the feature.

*Expected: the Phase A audit follow-up on `chooseRandom` now has a second, independent proof path.*

### Phase D — Docs + examples

- D.1 Type-system chapter in the book: effect polymorphism section rewritten around row vars.
- D.2 `effectHandler/` module docs updated to show the row-var signatures.
- D.3 Archive this design doc.

---

## Risks and Mitigations

- **Snapshot churn.** Every pinned-printed signature that contained `@{…, ...}` may gain a `ρ`. Mitigation: implement display first in Phase A, get the printed form stable, then land B.
- **Principal-types regression.** The settled result ([type-system doc Q3](2026-04-12_type-system.md#L1174-L1182)) covers the flat case; verify empirically with parity tests that `constrain` agrees with the hand-simulated lattice for small cases.
- **Biunification loops.** MLsub has a known cycle case with recursive variable bounds. The effect lattice is simpler (no type constructors under the var), so cycles should be strictly fewer — but add a visited-set guard and a test case before assuming.
- **`HandlerWrapperInfo` drift.** If we keep it as an optimisation, its invariants must stay synced with row-var results. Mitigation: dev-mode parity assertion in Phase C.

---

## Non-goals

- Parameterized effects (`@db.query(Table)`). The settled principality result is caveat'd on flat effect names; parameterized effects are a separate future design.
- Effect intersections / negation in surface syntax. Internally the biunification handles intersections of upper bounds, but users see only unions.
- Runtime evidence passing for effects. The runtime continues to dispatch by name — types stay fully erased.
