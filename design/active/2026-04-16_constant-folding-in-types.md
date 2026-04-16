# Constant folding in type inference via evaluator reuse

**Status:** Ready to implement
**Created:** 2026-04-16
**Decisions resolved:** 2026-04-16

## Goal

Narrow inferred types through pure literal computations so that statically-known values become `Literal` types instead of their widened forms. The motivating example:

```dvala
let event =
  if 1 == 2 then
    { type: "click", x: 3, y: 4 }
  else
    { type: "keydown", key: "Enter" }
  end;
```

Today, `event` infers to a union of both record shapes. With this design, `1 == 2` folds to `literal(false)`, the `if` narrows to its else branch, and `event` infers to `{ type: "keydown", key: "Enter" }` with each field as a literal.

Success criteria: any expression whose result is determined by its literal inputs and pure callees should fold to a `Literal` (or literal-composite) type at type-check time.

---

## Background

### Where we are today

The inference engine already tracks literal types for number, string, boolean, and (after the recent tuple change) tuples of literals and records of literals. What's missing is: when a builtin or user-defined function is called with all-literal arguments, we drop back to the function's declared return type, losing the literal information.

### Why evaluator reuse

Dvala already has a trampoline evaluator in [trampoline-evaluator.ts](src/evaluator/trampoline-evaluator.ts) that implements the runtime semantics of every builtin and every user-defined function. Hardcoding constant-folding rules for each op in the inference engine duplicates that semantics and creates drift risk.

Instead: for any `Call` node where the args are all literal-typed and the callee is pure (no effects), execute the subtree with the existing evaluator in a sandboxed, bounded context. Lift the result back into the type system as a `Literal` (or literal-composite).

This gives us **one extension point** that handles arithmetic, comparison, logical ops, string ops, record/tuple access, `count` on literal collections, and user-defined pure functions — all at once.

### Related

- [project_roadmap_1_0.md](../../memory/project_roadmap_1_0.md): set-theoretic types phase (0.6.0). Constant folding complements narrowing but is orthogonal to the core set-theoretic work.
- [2026-04-12_type-system.md](2026-04-12_type-system.md): the broader type-system design.

---

## Proposal

### Core rule

In `inferExpr` for `NodeTypes.Call` (and `NodeTypes.If`, and anywhere a union would otherwise lose a known branch): after inferring the callee and argument types, check:

1. All argument types are reconstructible literals (`Literal`, `Atom`, closed `Tuple` of reconstructible, closed `Record` of reconstructible). Open records, `Unknown`, `Array` element types, and function values bail.
2. The callee's inferred effect set is empty (pure). This is the **single gate** — it applies uniformly to builtins and user-defined functions. There is no whitelist.
3. For closures: every captured binding has a reconstructible literal type (decision #5).

If all three hold, evaluate the subtree with the trampoline evaluator, bounded by a step budget. On clean termination, return `literal(result)`. On timeout, thrown error, or evaluator failure: fall back to the existing typed result.

The absence of a whitelist depends on every pure-declared builtin being *actually* pure — see Phase A (audit) and Phase B (differential testing) in the Implementation Plan.

### `If` narrowing

After `inferExpr(cond)` returns a `Literal` of `true` or `false`, skip inferring the dead branch entirely? No — still infer both branches to surface type errors in dead code. But for the *result* type, use only the live branch.

### Folding pipeline

```
Call node
  ├─ infer callee and args as usual
  ├─ are all args Literal / literal-composite? ──┐
  │                                               │ yes
  ├─ is effect set of callee empty? ─────────────┤
  │                                               │ yes
  ├─ can we reconstruct a runtime value from      │
  │  the arg types? ──────────────────────────────┤
  │                                               │ yes
  ├─ run evaluator(callee, args) with step budget│
  │                                               │
  │   ├─ success: return literal(result) ─────────┘
  │   ├─ error: fall back to inferred return type
  │   └─ timeout: fall back to inferred return type
```

### Step budget

A hard cap (configurable, default ~10,000 evaluator steps) prevents non-terminating user functions from hanging the type checker. On budget exhaustion: silent fall-back to the inferred type. No error, because the code may still be valid at runtime.

### Effect boundary

If the callee's effect set is non-empty, do not fold. This single check handles `perform(@x)`, handler calls, and anything that reads external state. No special-casing needed.

### Literal-composite support

Arg values can be reconstructed from types when the type is:
- `Literal` (number, string, boolean, null)
- `Tuple` of reconstructible types
- `Record` (closed) with all fields reconstructible

Open records, unions, and unknown types block folding for that arg.

### User-defined function folding

When the callee is a `Function` type representing a user-defined function:
- If the function's body typed with empty effect set → eligible.
- Call it through the evaluator with the reconstructed arg values.
- Trust the step budget to handle non-termination.

### Error handling

Evaluator errors during folding (divide-by-zero, index-out-of-range, etc.) are **not** reported as type errors. They fall back silently — the code *might* still be reachable at runtime. Optionally: attach a warning hint to the node ("this branch will fail at runtime"). Defer warnings to a follow-up.

---

## Resolved Decisions

1. **Step budget: 10,000 steps per-call** (not a shared total). One expensive fold shouldn't starve unrelated ones; per-call keeps the cost local.

2. **Warnings on effect-performed-during-fold.** When a fold runs and the evaluator actually performs any effect (typically `@error` from divide-by-zero, out-of-bounds `nth`, etc.), emit a `severity: 'warning'` `TypeInferenceError` attached to the node. The warning **only** fires when (a) the args are all literal, (b) the fold was attempted, and (c) the fold surfaced an effect — so general `a / b` with unknown operands never warns. Intent: catch statically-provable runtime errors while staying quiet on general code.

3. **Recursion depth: covered by step budget alone.** The trampoline evaluator doesn't use the JS stack, and each step costs one budget unit — so deep recursion burns the budget naturally. No separate depth counter. A single fall-back story ("fold didn't apply: too much work").

4. **Polymorphic functions: fold at the call site using instantiated types.** `inferExpr` already sees instantiated callee types at each Call node, so polymorphism needs no special plumbing — `id(42)` and `twice(inc, 40)` fold indistinguishably from any other pure call.

5. **Closures capturing non-literal state: fold only when all captures are literal-valued.** At call time, walk the captured environment; if every captured binding has a reconstructible literal type, rebuild the env and evaluate. Otherwise fall back. This supports the real "pure helper that closes over a literal constant" pattern without leaking unknowns into folds.

6. **Match: existing narrowing already handles literal scrutinees.** Verified at [infer.ts:1001-1068](../../src/typechecker/infer.ts#L1001-L1068): `analyzeMatchCase` + `subtractType` produce `Never` for cases disjoint from the scrutinee's literal type, and unreachable cases are skipped (and warned as redundant). **Additional work needed for match *guards*:** inside the match case loop, if a guard's inferred type is `literal(false)`, skip the case body — symmetric to `if false then ...`. ~2 lines.

7. **Evaluator setup cost: always use the full evaluator in v1.** Don't preoptimize. Leave a comment at the fold entry point documenting the fast-path optimization (direct JS dispatch for trivial builtins with ≤2 literal args, sharing the same builtin impl to avoid drift) for a future pass if profiling shows setup cost dominates.

8. **Memoization: none in v1.** Same reasoning — don't preoptimize. Hit rate of `(calleeId, argValues)` caching is probably low in realistic code. Leave a comment at the fold entry point noting "Future optimization: memoize `(calleeId, argValues)` if profiling shows repeated folds."

9. **`&&` / `||` folding via special-expression wiring, not a whitelist entry.** `&&` and `||` are special expressions (short-circuit evaluation), not ordinary builtins. Fold them directly in `inferExpr`'s And/Or cases, mirroring the `if`-literal pruning path: if LHS folds to `literal(true)`, result = RHS type; if `literal(false)`, result = `literal(false)`. Symmetric for `||`. No evaluator involvement — semantics are trivial at the type level.

10. **Literal-composite reconstruction scope.** Atoms (e.g. `:ok`) are reconstructible — they're singleton types with a trivial AST form. Nesting has no depth cap — the step budget already bounds total reconstruction work. Bail on: open records, `Unknown` fields, `Array` element types (arrays-as-types don't carry enough information to reconstruct a value; literal arrays surface as tuples of literals and go through the Tuple path), and function values.

11. **Keep literal types in both inference and display.** When folding succeeds, the inferred type *is* the literal type — `let x = 2 + 3` gives `x: literal(5)`, and hover shows `5`. Annotations are the widening escape hatch (`let x: Number = 2 + 3` widens to `Number` via the binding's declared type). No separate display-widening heuristic; rationale: Dvala's type system is set-theoretic with literal types as first-class (type-system doc decision #4), and showing the literal gives genuinely useful information. Error messages benefit too: `literal(5) is not a subtype of literal(7)` is more informative than `Number is not a subtype of literal(7)`.

12. **No suppression mechanism in v1.** Effect-during-fold warnings are advisory. Dvala has no comment pragmas today; introducing them for one feature is out of proportion. Users hitting false-positive warnings on intentional test fixtures can either rewrite to make intent obvious (`let _expectedDivByZero = 1 / 0`) or wait for a suppression feature once usage data justifies it. Preserves the "folding is additive and advisory — no user code needs to change to adopt it" property.

13. **Single effect-set gate — no builtin whitelist.** Fold eligibility for builtins and user-defined functions uses the same check: the callee's inferred effect set is empty. This eliminates `PURE_BUILTIN_WHITELIST` as a concept and removes drift risk between the whitelist and the actual set of pure builtins. **Prerequisites:** every pure-declared builtin must be audited (Phase A) and covered by the differential test matrix (Phase B) before the folding implementation lands.

14. **Audit + differential testing are in-scope prerequisites, not follow-ups.** Decisions #2 and #13 rely on builtin effect declarations being accurate and the fold sandbox being observationally equivalent to the normal evaluator for pure code. These properties must be established and CI-enforced before folding is wired into `inferExpr`. See Phase A and Phase B in the Implementation Plan.

---

## Implementation Plan

Organized in four phases. **Phases A and B are prerequisites** — the folding implementation in Phase C depends on their guarantees (decision #14). Ship order: A → B → C → D.

### Phase A — Effect-declaration audit

Goal: every builtin's declared effect set accurately reflects its TS implementation. This is the invariant the folding gate relies on (decision #13).

- **A1.** Enumerate every builtin and its declared effect set. List all `effects: PureEffects` builtins.
- **A2.** Review each pure-declared builtin's TS implementation. Flag any that:
  - Read `Date.now()`, `performance.now()`, or any clock source → needs `@clock` effect declaration.
  - Call `Math.random()` or any RNG → needs `@random` effect declaration.
  - Touch `console.*`, `process.*`, host state, or the filesystem → needs appropriate effect declaration.
  - Return `Promise` or invoke async primitives → the sandbox already bails on `Promise`, but these should have an explicit effect signature.
  - Mutate shared state (closures over module-level data, etc.).
- **A3.** Introduce new effect types as needed (`@clock`, `@random`, etc.) — this may itself be a sub-project requiring changes to the effect-type registry.
- **A4.** Land misdeclaration fixes as independent commits ahead of Phase C, since they're bugs regardless of folding.

### Phase B — Differential test infrastructure

Goal: mechanically enforce that folding is observationally equivalent to normal evaluation for pure code (decision #14).

- **B1.** Add a `DVALA_FOLD` env toggle (or equivalent typechecker option) that skips the fold path entirely when set to `0`. Default `1`.
- **B2.** Table-driven test: for every pure-declared builtin, run the same call through the fold sandbox and the normal evaluator, assert results match. Cover representative literal inputs (including edge cases: zero, negative, empty collections, numeric limits).
- **B3.** CI gate: run the full existing test corpus twice — once with `DVALA_FOLD=0`, once with `DVALA_FOLD=1`. Both runs must pass identically. Any test that passes only under one reveals a bug (either in folding or in a test that depended on non-folded behavior).

### Phase C — Folding implementation

Goal: wire the fold into `inferExpr` using a single effect-set gate (decision #13).

- **C1. Foldability predicate.** `canFoldCall(calleeType, argTypes, capturedEnv?)` → true iff:
  - All arg types are reconstructible (Literal, Atom, closed Tuple of reconstructible, closed Record of reconstructible — decision #10).
  - Callee's inferred effect set is empty (no whitelist — decision #13).
  - For closures: every captured binding has a reconstructible literal type (decision #5).

- **C2. Arg-to-value reconstruction.** `typeToValue(t: Type): unknown | NOT_RECONSTRUCTIBLE` handling `Literal`, `Atom`, closed `Tuple`, closed `Record` with arbitrary nesting (decision #10).

- **C3. Value-to-type lifting.** `valueToLiteralType(value: unknown): Type | null` — the inverse. Produces `Literal` for primitives, `Atom` for atoms, closed `Tuple` / closed `Record` for composites. Bails on functions and anything non-reconstructible.

- **C4. Sandboxed evaluator entry point.** `foldCall(callee, argValues, capturedEnv, stepBudget)` helper in the evaluator:
  - Creates a fresh evaluator state.
  - Seeds the environment with reconstructed captures (decision #5).
  - Runs with `stepBudget = 10_000` (decision #1).
  - Returns `{ ok: true, value } | { ok: false, reason: 'budget' | 'effect' | 'error', effectName? }`.
  - Comment at the entry point documenting future fast-path (decision #7) and memoization (decision #8) optimizations.

- **C5. Wire folding into `inferExpr` Call case.** After normal inference, if `canFoldCall`, call `foldCall`:
  - On success → replace `result` with `valueToLiteralType(value)`.
  - On `{ ok: false, reason: 'effect', effectName }` → keep inferred type, attach `severity: 'warning'` `TypeInferenceError`: *"This expression will perform `@${effectName}` at runtime"* (decision #2).
  - On `budget` or other errors → silent fall-back to inferred type.
  - Applies uniformly to builtins and user-defined functions — same code path, single gate.

- **C6. Closure capture reconstruction** (decision #5). When the callee is a user function, enumerate its captured bindings (plumb from the evaluator's closure representation). If all captures are reconstructible, rebuild the env; otherwise `canFoldCall` returns false.

- **C7. `&&` / `||` special-expression wiring** (decision #9). In `inferExpr`'s And/Or cases: if LHS type expands to `literal(true)`, result = RHS type (for `&&`) or `literal(true)` (for `||`); if `literal(false)`, result = `literal(false)` (for `&&`) or RHS type (for `||`); otherwise current behavior. No evaluator involvement.

- **C8. `If` literal narrowing.** Still infer both branches (so errors in dead code surface). If `condType` expands to `literal(true)` → `result = thenType`; `literal(false)` → `result = elseType ?? NullType`; otherwise current `union` behavior.

- **C9. Match guard-literal pruning.** Inside the `NodeTypes.Match` case loop, after `inferExpr(guard)`: if `guardType` expands to `literal(false)`, skip this case (do not add to `branchTypes`, do not subtract from `remainingType`). Emit redundant-guard warning for consistency with existing redundant-pattern warning (decision #6). Scrutinee narrowing is already handled by existing code.

- **C10. Folding-specific golden tests.** Beyond the differential tests in Phase B, add targeted tests for the fold-integration behavior:
  - Each arithmetic op with literal args → literal result.
  - Each comparison op → literal bool.
  - `&&` / `||` short-circuit (`false && expensive()` shouldn't run the RHS — asserted by step-budget measurement).
  - `count` on literal collections.
  - Record/tuple field access on closed literals, including nested records / atoms.
  - `if literal(true)/literal(false) then ... else ... end` → live branch only; errors in dead branch still surface.
  - `match literal(5) case 5 then A case _ then B` → A only (redundant warning on the second).
  - `match X case _ when 1==2 then A case _ then B` → B only (redundant-guard warning on the first).
  - User-defined pure function called with all-literal args → folded.
  - User-defined function with a non-empty effect set → NOT folded, no warning.
  - Closure capturing a literal constant → folded.
  - Closure capturing a non-literal variable → not folded.
  - Recursive pure function within budget → folded.
  - Recursive function exceeding budget → not folded, no warning.
  - `1/0` → fallback with warning on `@dvala.error`.
  - `a/b` with unknown operands → no warning.
  - `perform(@foo, 1)` (or any effectful call) → not folded, no warning.

### Phase D — Measurement and documentation

- **D1. Compile-time impact measurement.** Run the existing test corpus and a large example program with `DVALA_FOLD=0` and `DVALA_FOLD=1`. Record the delta. If >5% regression, revisit decisions #7 and #8 (add fast-path and/or memoization). The `DVALA_FOLD` toggle from Phase B doubles as the measurement tool.

- **D2. User-facing documentation.** Add a section to [2026-04-12_type-system.md](2026-04-12_type-system.md) or a dedicated page describing the folding boundary: what is/isn't folded, the effect-performed warning, the budget, and the guarantee that fold results are sound approximations (a folded `literal(v)` means "this expression will always produce `v` at runtime, given the handler resumes identically"). Note the absence of a suppression mechanism (decision #12) and the annotation-based widening escape hatch (decision #11).

## Non-goals

- Speculative evaluation of branches inside effectful expressions.
- Folding across I/O (storage, network, etc.) — always blocked by effect check.
- Exposing fold results as *runtime* constants (that's evaluator-level constant folding, a separate optimization).
