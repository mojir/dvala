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

- **Effect sets on function types.** `(A) -> @{e1, e2} B` parses, prints, and participates in subtyping. See [src/typechecker/effectTypes.ts](../../src/typechecker/effectTypes.ts).
- **Effect inference from `perform`.** A body containing `perform(@e, x)` infers with `@{e}` in its effect set (Step 6 of the type-system plan, already landed).
- **Effect subtraction on `do with handler; …`.** Applying a handler in a `do` block subtracts the caught effect from the body's effect set at the AST level — but only for hand-rolled cases, and the handler itself has no dedicated type.
- **`handler … end` expressions.** Parsed and evaluated. In the typechecker they most likely flow through as a generic function type, losing the "this catches `@choose`, resumes with an int, and transforms into an array" structure. (TODO during Phase 1 of the impl plan: verify exactly what the typechecker currently produces for `handler @choose(opts) -> resume(first(opts)) end`.)
- **Open effect-set variables `@{e...}`.** Designed (decision #12) but not yet exercised for handler polymorphism. Uses the same subtyping engine as open records.

### What's missing

1. **A handler type.** There is no `Handler<…>` type node. Handlers appear in source, flow through evaluation correctly, but are typed as plain functions.
2. **Inference for `handler … end`.** Given handler clauses and an optional `transform` clause, we need a rule that produces the handler type from the clause bodies.
3. **Application rule for `do with h; body`.** Once a handler has a type, applying it to a body must compute the resulting effect set per the subtraction/introduction formula.
4. **Polymorphic signatures for the `effectHandler/` builtins.** Currently they're all `((() -> Unknown)) -> Unknown` — no effect structure. The four items above collectively unlock correct signatures for: `retry`, `fallback`, `chooseAll`, `chooseFirst`, `chooseRandom`, `chooseTake`. **`chooseRandom`** is the tracked follow-up; the others are free wins from the same machinery.

### Why this is hard (and why a design doc is warranted)

- Handlers are **second-order**: they take a computation (a thunk of effectful code) and produce another computation. A correct type must track both "what effects does my body tolerate" and "what effects does my clause body introduce", separately.
- **`resume` changes the shape**: inside a clause, `resume(x)` re-enters the body's continuation. Its type is `(ClauseArg) -> BodyResult` where `BodyResult` already has the *remaining* effects. Mistyping `resume` is a common effect-system pitfall.
- **`transform result -> …`** further modifies the output type. A handler that catches `@choose`, resumes multiple times, and transforms each result by wrapping in a list (e.g. `chooseAll`) has a fundamentally different shape from one that resumes once and returns whatever the body returns (e.g. `chooseFirst`).
- **Multi-shot continuations** (`chooseAll`, `chooseTake`) resume `resume(x)` multiple times. The type must allow this without claiming the result type changes between calls.
- **Effect polymorphism (row variables)** is the bit that makes these signatures *useful*. Without it, a handler's type could only describe body-effect-sets that are exactly `{caught}`, which is useless — bodies in practice have lots of unrelated effects the handler doesn't care about.

---

## Proposal

### The handler type

Introduce a new type node `Handler`:

```ts
interface HandlerType {
  kind: 'Handler'
  caught: EffectSet         // set of effects this handler matches
  introduced: EffectSet     // effects the clause bodies perform (may be open)
  bodyIn: Type              // the type the body is expected to produce
  bodyOut: Type             // the type the handler produces after transform
}
```

The corresponding application law (informal):

```
if  h : Handler<caught=Σc, introduced=Σi, bodyIn=BIn, bodyOut=BOut>
and f : () -> Σ_body Result
then  do with h; f() end : (Σ_body \ Σc) ∪ Σi  BOut
```

with the constraints `Σc ⊆ Σ_body` and `Result <: BIn`. (Strict subset not required — a handler may be installed over a body that performs none of its caught effects; those clauses are simply dead.)

### Syntax for handler types

Two options:

**Option A — explicit form with a new keyword:**
```
handler<@{choose}, @{dvala.random.item}> (A) -> A
```
where the two angle-brackets sets are `caught` and `introduced`.

**Option B — compound arrow form reusing existing syntax:**
```
@{choose} => @{dvala.random.item} (A) -> A
```
where `=>` reads as "handler transforming from left-effect-set to right-effect-set".

**Recommendation: Option A.** New keyword is clearer for the reader, harder to misparse, and `handler` already exists as a keyword in term position so lifting it to type position is a clean analogue. Option B risks confusion with function type `(A) -> B` and bigger parser changes.

### Inference for `handler … end`

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

1. Let `Σ_clauses` = union of effect sets inferred from each `clauseBody_i`, **minus** `@{e1, e2, …}` (the handler can't catch its own clause effects unless reinstalled recursively — decision TBD).
2. Let `BIn` = the unified type of expressions flowing into `resume`:
   - If `resume(x)` appears with `x : T`, then `BIn = T`.
   - If a clause aborts (doesn't call `resume`), that clause contributes nothing to `BIn`.
3. Let `BOut` = the unified result type of all clauses + `transformBody`:
   - With no transform: `BOut = lub(clauseBody_i.type ∪ BIn)` (bodies that resume return the body-result type; bodies that abort return their own type).
   - With transform: `BOut = transformBody.type` where `result : BIn` in the transform's scope.
4. `caught = {e1, e2, …}` (closed set — syntactically listed).
5. `introduced = Σ_clauses` (may be open if any clauseBody is polymorphic).

### Inference for `do with h; body end`

Given:

```
do with h; body end
```

1. Infer `h : Handler<caught=Σc, introduced=Σi, bodyIn=BIn, bodyOut=BOut>`.
2. Infer `body : Σb Result`.
3. Constrain `Result <: BIn`.
4. Produce `(Σb \ Σc) ∪ Σi  BOut`.

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

Organized so that each phase is independently reviewable and ships something useful.

### Phase 1 — Verify current state

- **1.1** Write a test that typechecks `handler @choose(opts) -> resume(first(opts)) end` and print the inferred type. Document what the typechecker currently produces (likely a generic function type or `Unknown`). This calibrates the delta.
- **1.2** Same for `do with (handler @choose(opts) -> resume(first(opts)) end); perform(@choose, [1,2]) end`. Observe the inferred effect set and result type.
- **1.3** Add `HandlerType` to [src/typechecker/types.ts](../../src/typechecker/types.ts) but don't wire it up yet. Stub constructors and printers. Land as a scaffolding commit.

### Phase 2 — Handler type inference

- **2.1** Parse handler types in annotations (Option A syntax). Parser update in [src/typechecker/parseType.ts](../../src/typechecker/parseType.ts).
- **2.2** Infer `handler … end` expressions per the rule above. Produce `HandlerType`.
- **2.3** Printer + `typeToString` for handler types.
- **2.4** Subtyping rules for `HandlerType` in [src/typechecker/subtype.ts](../../src/typechecker/subtype.ts).
- **2.5** Tests: every shape from the `effectHandler.dvala` source. Expected types must be exactly the polymorphic signatures in the proposal.

### Phase 3 — Handler application

- **3.1** Update `do with h; body end` inference in [src/typechecker/infer.ts](../../src/typechecker/infer.ts) to consume `HandlerType` and apply the subtraction/introduction law.
- **3.2** Same for `h(body)` direct-call form.
- **3.3** Tests: body/handler effect-set arithmetic, including the polymorphic case (`chooseRandom(-> perform(@choose, [1,2]))` should infer `@{dvala.random.item}`).

### Phase 4 — Wire `effectHandler/` signatures

- **4.1** Update the six `effectHandler/` docs to use the new signatures.
- **4.2** Update [src/builtin/modules/effectHandler/effectHandler.test.ts](../../src/builtin/modules/effectHandler/effectHandler.test.ts) to assert the new signatures end-to-end.
- **4.3** Re-run `npm run check` under both `DVALA_FOLD=0` and `DVALA_FOLD=1`. Fold should now correctly reject `chooseRandom` as effectful.
- **4.4** Close the Phase A audit follow-up.

### Phase 5 — Measurement and docs

- **5.1** User-facing docs: a handler-types chapter / section in the book.
- **5.2** Verify no runtime-semantics change (the typechecker is the only thing that shifted).

---

## Non-goals

- **Row-polymorphic record types** — a related feature but scoped separately.
- **Algebraic-effect inference from scratch** — we're typing existing, working handlers, not redesigning the runtime.
- **Named handler types** — `type MyHandler = handler<…>` aliases can wait until post-implementation.
- **Handler composition operators** — Dvala doesn't have these today; out of scope.
