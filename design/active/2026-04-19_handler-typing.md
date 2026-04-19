# Handler typing — effect-polymorphic handler types

**Status:** Decisions resolved — ready for Phase 1
**Created:** 2026-04-19
**Decisions resolved:** 2026-04-19
**Supersedes scope of:** [2026-04-12_type-system.md](2026-04-12_type-system.md) Step 7 (previously a 6-bullet sketch).

## Goal

Design the handler-typing slice of Dvala's type system so that:

1. `handler … end` expressions get a first-class type that captures which effects they **catch**, which effects they may **introduce** (via `perform` inside clauses), and how they **transform** the result.
2. Handler applications (`do with h; body end` and `h(body)`) compute the resulting effect set as `(Σ_body \ Σ_caught) ∪ Σ_introduced` — mechanically, not by hand annotation.
3. Functions in `effectHandler/` (and any future user-defined handler wrappers) can carry **effect-polymorphic** signatures like:
   ```
   chooseRandom : (() -> @{choose | Σ} A) -> @{dvala.random.item | Σ} A
   chooseAll    : (() -> @{choose | Σ} A) -> @{Σ} A[]
   retry        : (Number, () -> @{dvala.error | Σ} A) -> @{dvala.error | Σ} A
   fallback     : A -> ((() -> @{dvala.error | Σ} A) -> @{Σ} A)
   ```
   where `Σ` is an open effect-set variable (row polymorphism) — the same mechanism already chosen for value-type polymorphism (type-system doc decision #12).

The motivating payoff is closing the final Phase A follow-up from the fold audit (`chooseRandom` misdeclaration). The real payoff is that the effect system becomes a first-class citizen of inference, which unblocks accurate fold gating, better IDE hovers, and correct leaked-effect manifests.

---

## Background

### What exists today

Phase 1 calibration (2026-04-19) found that the scaffolding for handler typing is **already landed**. The earlier draft of this doc assumed otherwise; corrections inline.

- **Effect sets on function types.** `(A) -> @{e1, e2} B` parses, prints, and participates in subtyping. See [src/typechecker/effectTypes.ts](../../src/typechecker/effectTypes.ts).
- **Effect inference from `perform`.** A body containing `perform(@e, x)` infers with `@{e}` in its effect set (Step 6 of the type-system plan, already landed).
- **First-class `HandlerType`.** Defined at [src/typechecker/types.ts:150](../../src/typechecker/types.ts#L150) as `{ tag: 'Handler', body, output, handled }` where `handled : Map<effectName, { argType, retType }>`. Constructable from annotations via `Handler<B, O, @{caught}>` ([src/typechecker/parseType.ts:424](../../src/typechecker/parseType.ts#L424)).
- **Inference for `handler … end`.** Already produces a `HandlerType` with proper `body`/`output`/`handled` fields ([src/typechecker/infer.ts:1258-1311](../../src/typechecker/infer.ts#L1258-L1311)). Clause typing, `resume` typing via `pushResume/popResume`, and the optional `transform` clause are all wired.
- **Application `do with h; body end`.** Consumes the handler type via `getHandlerAlternatives` ([src/typechecker/infer.ts:1318](../../src/typechecker/infer.ts#L1318)), checks that the body's result matches the handler's `body` input, and produces the handler's `output`.
- **Handler subtyping.** Covered by tests in [src/typechecker/typechecker.test.ts:675+](../../src/typechecker/typechecker.test.ts#L675) — variance rules for `body`/`output`/`handled`.
- **Open effect-set variables `@{e...}`.** Designed (decision #12) but not yet exercised for handler polymorphism. Uses the same subtyping engine as open records.

### What's missing

1. **No `introduced` field on `HandlerType`.** The type captures which effects the handler *catches* (`handled`), but not which effects its clause bodies *perform*. This is the exact data needed to say that `chooseRandom`'s handler introduces `@{dvala.random.item}` when it resumes with a random pick.
2. **Handler application law doesn't add back introduced effects.** `do with h; body end` currently produces handler.output with the caught effects subtracted — but doesn't union in the introduced set (because `introduced` doesn't exist yet).
3. **Annotation syntax doesn't carry an introduced set.** `Handler<B, O, @{caught}>` has three slots; extending to `Handler<B, O, @{caught}, @{introduced}>` (or keeping three slots with introduced defaulting to `@{}`) requires a parser update.
4. **`effectHandler/` module signatures still use `((() -> Unknown)) -> Unknown`.** They don't reference `HandlerType` or effect polymorphism at all. This is the tracked Phase A follow-up — `chooseRandom` needs `((() -> @{choose | Σ} A)) -> @{dvala.random.item | Σ} A` and the other five need analogous sigs.
5. **No row-variable identity on effect sets.** `EffectSet` is `{ effects: Set<string>, open: boolean }` — a single openness bit, not a variable with identity. Two `@{e, ...}` tails in the same signature do not unify; body-extras passed through `(() -> @{choose, ...} A) -> @{dvala.random.item, ...} A` silently disappear from the result. The value-type system uses MLsub-style `Var` nodes with `id`/`level`/bounds — the same mechanism needs to extend to effect rows for `effectHandler/` signatures to be sound. (Phase 1 calibration 2026-04-19 confirmed this is genuinely missing.)

### Why this is hard (and why a design doc is warranted)

- Handlers are **second-order**: they take a computation (a thunk of effectful code) and produce another computation. A correct type must track both "what effects does my body tolerate" and "what effects does my clause body introduce", separately.
- **`resume` changes the shape**: inside a clause, `resume(x)` re-enters the body's continuation. Its type is `(ClauseArg) -> BodyResult` where `BodyResult` already has the *remaining* effects. Mistyping `resume` is a common effect-system pitfall.
- **`transform result -> …`** further modifies the output type. A handler that catches `@choose`, resumes multiple times, and transforms each result by wrapping in a list (e.g. `chooseAll`) has a fundamentally different shape from one that resumes once and returns whatever the body returns (e.g. `chooseFirst`).
- **Multi-shot continuations** (`chooseAll`, `chooseTake`) resume `resume(x)` multiple times. The type must allow this without claiming the result type changes between calls.
- **Effect polymorphism (row variables)** is the bit that makes these signatures *useful*. Without it, a handler's type could only describe body-effect-sets that are exactly `{caught}`, which is useless — bodies in practice have lots of unrelated effects the handler doesn't care about.

---

## Proposal

### The handler type

Extend the existing `HandlerType` in [src/typechecker/types.ts:150](../../src/typechecker/types.ts#L150) with one new field, `introduced`:

```ts
// existing (already shipped):
// { tag: 'Handler', body, output, handled: Map<effectName, { argType, retType }> }
// after this change:
{
  tag: 'Handler',
  body,                 // type the body is expected to produce (existing)
  output,               // type the handler produces after transform (existing)
  handled,              // caught effects + their arg/ret sigs (existing)
  introduced: EffectSet // NEW — effects the clause + transform bodies perform
}
```

The application law:

```
if  h : Handler<body=BIn, output=BOut, handled=Σc, introduced=Σi>
and f : () -> Σ_body Result
then  do with h; f() end : (Σ_body \ domain(Σc)) ∪ Σi  BOut
```

with `Result <: BIn` as before. (Strict subset of `Σc ⊆ Σ_body` not required — a handler may be installed over a body that performs none of its caught effects; those clauses are simply dead.)

### Syntax for handler types in annotations

The existing annotation syntax is `Handler<B, O, @{caught}>` (3 slots). Extend to 4 slots:

```
Handler<B, O, @{caught}, @{introduced}>
```

Three-slot form stays legal and means `introduced = @{}` (implicit).

**Alternatives considered but rejected:** a separate keyword (`handler<…>`) or arrow form (`@{caught} => @{introduced} (A) -> A`). Both are bigger changes than extending the existing `Handler<…>` 3-slot syntax by one field, and the 3-slot form is already what the parser, tests, and existing sigs use.

### Inference for `handler … end`

Most of this already works today — see [src/typechecker/infer.ts:1258-1311](../../src/typechecker/infer.ts#L1258-L1311). The only change is accumulating and populating the new `introduced` field.

Given:

```
handler
  @e1(x) -> clauseBody_1
  @e2(y) -> clauseBody_2
  ...
  transform result -> transformBody   -- optional
end
```

Inference rule:

1. `body`, `output`, and `handled` are inferred today — clause typing, `resume` typing via `pushResume/popResume`, and transform are all wired.
2. **NEW:** Let `introduced = union of effect sets inferred from each clauseBody_i and from transformBody`. **No subtraction of `handled`.** Per Decision 2, a clause that performs one of the caught effects is NOT re-caught by the same handler — that perform escapes past this handler to the next outer one. So if the `@choose` clause body itself performs `@choose`, `@choose` belongs in `introduced` (the handler still surfaces it to the caller). Per Decision 4, transform-clause effects contribute to `introduced` too. Constructing a handler value is itself pure — the per-clause `pushEffects`/`popEffects` discipline keeps these recorded clause effects out of the surrounding context where the `handler … end` expression appears.
3. Return `{ tag: 'Handler', body, output, handled, introduced }`.

### Inference for `do with h; body end`

Today the inference at [src/typechecker/infer.ts:1318+](../../src/typechecker/infer.ts#L1318) consumes `HandlerType` and subtracts `handled` from the body's effect set. Extend it to union `introduced` back in:

1. Infer `h : Handler<body=BIn, output=BOut, handled=Σc, introduced=Σi>` (existing).
2. Infer `body : Σb Result` (existing).
3. Constrain `Result <: BIn` (existing).
4. **Adjusted:** produce `(Σb \ domain(Σc)) ∪ Σi  BOut` (currently produces `(Σb \ domain(Σc))  BOut`).

### Effect-polymorphic handler-wrapping functions

With the above in place, `effectHandler/` functions type as:

```
retry : ∀ Σ A. (Number, () -> @{dvala.error | Σ} A) -> @{dvala.error | Σ} A
  -- retry's handler catches dvala.error and re-performs it on final failure,
  -- so the outer effect set still contains it.

fallback : ∀ Σ A. A -> (() -> @{dvala.error | Σ} A) -> @{Σ} A
  -- returns a handler-wrapping function. fallback catches dvala.error fully.

chooseAll    : ∀ Σ A. (() -> @{choose | Σ} A) -> @{Σ} A[]
chooseFirst  : ∀ Σ A. (() -> @{choose | Σ} A) -> @{Σ} A
chooseRandom : ∀ Σ A. (() -> @{choose | Σ} A) -> @{dvala.random.item | Σ} A
chooseTake   : ∀ Σ A. (Number, () -> @{choose | Σ} A) -> @{Σ} A[]
```

**The `chooseRandom` fix is then a signature update in [src/builtin/modules/effectHandler/index.ts](../../src/builtin/modules/effectHandler/index.ts) once the handler-typing machinery is in place.** No runtime change.

### Fold-sandbox interaction

The fold gate checks "is the callee's effect set empty?" Once `chooseRandom` declares `@{dvala.random.item | Σ}`, the gate correctly rejects folding `chooseRandom(-> perform(@choose, [1,2]))`. No changes to the fold sandbox itself.

### Subtyping

- **Handler<Σc, Σi, BIn, BOut>** is contravariant in `Σc` (handler matching more effects can stand in for one matching fewer), covariant in `Σi` and `BOut`, contravariant in `BIn`.
- Open effect set variables use the same subtyping as open records (already implemented).

---

## Resolved Decisions

1. **Handler values are first-class.** A `Handler<caught, introduced, BIn, BOut>` is a normal type: expressible in annotations, can be stored in `let`, passed as function arguments, and returned from functions. This is forced by `fallback : A -> (() -> @{dvala.error | Σ} A) -> @{Σ} A` already returning a handler at runtime — special-casing it would cost more than first-classing it. (Confirmed: runtime already treats handlers as first-class values.)

2. **Handlers do not catch their own clause's `perform`.** If a clause body for `@e` contains `perform(@e, …)`, that inner perform propagates to the *next outer* handler — the same handler instance does not re-catch it. Matches standard algebraic-effects semantics (Eff, Koka, OCaml 5, Frank) and the Dvala runtime's current behavior. Avoids infinite-loop hazards.

3. **No distinct multi-shot handler type.** `resume : (BIn) -> Σi BodyResult` regardless of whether the clause calls `resume` zero times (aborting handler like `fallback`), once (`chooseFirst`), or many times (`chooseAll`, `chooseTake`). Resume-arity is a runtime concern. The extra type-level precision that B would buy us has no current consumer (Dvala has no linearity / single-shot-only contexts).

4. **`transform` clauses may perform effects.** The transform clause's inferred effect set is unioned into `introduced` using the same rule as clause bodies. No special-casing.

5. **Effect polymorphism via unnamed open tail `@{e, ...}`.** Matches the already-shipped type-system doc decision #12. A signature's open tails unify positionally within that signature. Named row variables (`@{e | ρ}`) are deferred — none of the six `effectHandler/` signatures need them. If a future use case demands cross-argument row sharing that positional rules can't express, revisit.

## Remaining questions (non-blocking)

- **`perform` inside `resume` argument.** If a clause body does `resume(perform(@other, …))`, the argument's effect set should flow into `Σi`. Falls out of the proposed rule; add an explicit test case during Phase 2.
- **Error-message wording.** When a handler application mismatches (body performs an uncaught effect, no outer handler, top-level boundary), the message should point at the specific effect and the nearest enclosing `handler` or the module boundary. Scoped to implementation; doesn't affect the type rules.
- **Post-landing audit follow-up.** After Phase 4 ships, verify all six `effectHandler/` builtins (`chooseAll`, `chooseFirst`, `chooseRandom`, `chooseTake`, `retry`, `fallback`) carry correct polymorphic signatures; close the Phase A audit follow-up.

---

## Implementation Plan

Scope corrected after Phase 1 calibration. The task is no longer "build handler typing from scratch" — most of it exists. The delta is adding the **introduced** dimension and the effect-polymorphic wiring that lets `effectHandler/` signatures be expressed.

### Phase 1 — Calibration (✅ done)

Inline findings — see "What exists today" and "What's missing" above. Net: `HandlerType` exists; `handled` (caught) is tracked; `introduced` is not; `effectHandler/` sigs use `Unknown` throughout.

### Phase 2 — Extend `HandlerType` with `introduced`

- **2.1** Add an `introduced: EffectSet` field to `HandlerType` in [src/typechecker/types.ts](../../src/typechecker/types.ts). Default to the empty set in every existing constructor call (6 call sites — no behavior change).
- **2.2** Update `handler … end` inference at [src/typechecker/infer.ts:1258-1311](../../src/typechecker/infer.ts#L1258-L1311) to accumulate the union of effect sets from each clause body (minus the caught effects per Decision 2 / self-non-catching) and from the `transform` clause (per Decision 4). Populate `introduced`.
- **2.3** Printer + `typeToString` for the new field. Only render when non-empty to keep displays clean.
- **2.4** Parser update at [src/typechecker/parseType.ts:424](../../src/typechecker/parseType.ts#L424): accept an optional fourth slot `Handler<B, O, @{caught}, @{introduced}>`. Three-slot form stays legal and implies `@{}` introduced.
- **2.5** Subtyping: contravariant in `handled`, covariant in `introduced` (a handler that introduces fewer effects is a subtype of one that introduces more), plus existing body/output variance.
- **2.6** Tests for each `effectHandler.dvala` handler literal — expected `introduced` for `chooseRandom` is `@{dvala.random.item}`, zero for `chooseFirst`, `@{}` for `chooseAll` (since it just resumes — no perform), etc.

### Phase 3 — Handler application law

- **3.1** Update `do with h; body end` inference so the resulting effect set is `(Σ_body \ handled) ∪ introduced`. The subtraction path already exists; add the union. Location: [src/typechecker/infer.ts:1318+](../../src/typechecker/infer.ts#L1318).
- **3.2** Same for `h(body)` direct-call form (`fallback(v)(-> …)`).
- **3.3** Tests: `do with chooseRandom-handler; perform(@choose, [1,2]) end` → effect set `@{dvala.random.item}`, result type inherited from body.

### Phase 4 — Row-variable effect polymorphism

Phase 1 calibration (2026-04-19) established that the current `EffectSet` representation is `{ effects: Set<string>, open: boolean }` — a flat set plus a single "openness" bit. `isEffectSubset` treats `open: true` as "accepts any extras" structurally ([src/typechecker/types.ts:467-477](../../src/typechecker/types.ts#L467-L477)). **There is no row-variable identity**, so two `@{e, ...}` tails in the same signature do not unify — body-extras passed through a signature like `(() -> @{choose, ...} A) -> @{dvala.random.item, ...} A` silently disappear from the result type.

The value-type system uses MLsub-style bisubtyping with `Var` nodes carrying `id`, `level`, `lowerBounds`, and `upperBounds` ([src/typechecker/types.ts:84](../../src/typechecker/types.ts#L84)). `(A) -> A` already works for value types: fresh `Var` per call-site instantiation propagates information. This step introduces the analogous machinery for effect sets.

- **4.1** Extend `EffectSet` to carry an optional row variable: `{ effects: Set<string>, tail: EffectRowVar | 'closed' | 'open' }`, where `EffectRowVar` has `id`, `level`, `lowerBounds`, `upperBounds` mirroring the value `Var`. The existing `open: boolean` maps to `'open'` (anonymous-wildcard) vs. `'closed'`. `EffectRowVar` is the new case.
- **4.2** At signature-instantiation time, replace each named row variable (e.g. `ρ` or the implicit tail attached to a signature) with a fresh `EffectRowVar`. Mirrors the existing fresh-`Var` mechanism for value types.
- **4.3** Extend `isEffectSubset`, `mergeEffects`, and `subtractEffects` to handle row vars — unify row-var tails across two sides, generate bounds on the row var, etc.
- **4.4** Parse per-signature implicit tail identity: within a single signature, all unnamed `@{..., ...}` tails bind to one shared row variable (the per-signature implicit one). Different signatures get different implicit variables. (Per Q5 Decision 5 — unnamed tails.)
- **4.5** Tests: `(() -> @{choose, ...} A) -> @{dvala.random.item, ...} A` called with a body performing `@{choose, log}` must produce a result type with effect set `@{dvala.random.item, log}`. Explicit row-var test: `log` propagates.
- **4.6** Tests: signatures with two open-tailed positions that should NOT share — verify separation works if we decide to allow it (e.g. via named rows `@{e | ρ}` deferred from Q5; if still out of scope, this is a non-goal).
- **4.7** Subtyping rules for the `EffectRowVar` case in [src/typechecker/subtype.ts](../../src/typechecker/subtype.ts).

**Open sub-decision (defer to implementation):** within a single signature, when there are ≥2 open tails, do they all share one implicit row variable by default? Q5 ("unnamed open tail") implicitly suggested yes — the implementation commits to this interpretation. If a future case needs independent tails, reopen Q5 for named rows (Option B).

### Phase 5 — Wire `effectHandler/` signatures

- **5.1** Update the six `type` strings in [src/builtin/modules/effectHandler/index.ts](../../src/builtin/modules/effectHandler/index.ts):
  - `retry      : (Number, (() -> @{dvala.error, ...} A)) -> @{dvala.error, ...} A`
  - `fallback   : (A) -> ((() -> @{dvala.error, ...} A)) -> @{...} A`
  - `chooseAll  : ((() -> @{choose, ...} A)) -> @{...} A[]`
  - `chooseFirst: ((() -> @{choose, ...} A)) -> @{...} A`
  - `chooseRandom: ((() -> @{choose, ...} A)) -> @{dvala.random.item, ...} A`
  - `chooseTake : (Number, (() -> @{choose, ...} A)) -> @{...} A[]`
- **5.2** Verify via [src/builtin/modules/effectHandler/effectHandler.test.ts](../../src/builtin/modules/effectHandler/effectHandler.test.ts) that the runtime behavior is unchanged and the new types parse + infer correctly.
- **5.3** Run `npm run check` under both `DVALA_FOLD=0` and `DVALA_FOLD=1`. Confirm fold correctly rejects `chooseRandom(-> …)` as effectful.
- **5.4** Close the Phase A audit follow-up in [design/archive/2026-04-16_builtin-effect-audit.md](../archive/2026-04-16_builtin-effect-audit.md).

### Phase 6 — Docs

- **6.1** User-facing: handler-types chapter / section in the book. Focus on the caught/introduced split.
- **6.2** Inline: doc comment on `HandlerType` explaining all four fields and the application law.

---

## Non-goals

- **Row-polymorphic record types** — a related feature but scoped separately.
- **Algebraic-effect inference from scratch** — we're typing existing, working handlers, not redesigning the runtime.
- **Named handler types** — `type MyHandler = handler<…>` aliases can wait until post-implementation.
- **Handler composition operators** — Dvala doesn't have these today; out of scope.
