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

1. All argument types are `Literal` (or literal-composites: tuples/records of literals).
2. The callee's inferred effect set is empty (pure).
3. The callee is foldable: either a whitelisted pure builtin, or a user-defined function whose body contains no effects.

If all three hold, evaluate the subtree with the trampoline evaluator, bounded by a step budget. On clean termination, return `literal(result)`. On timeout, thrown error, or evaluator failure: fall back to the existing typed result.

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

---

## Implementation Plan

1. **Foldability predicate.** `canFoldCall(callNode, calleeType, argTypes)` → true iff:
   - All arg types are reconstructible (Literal, closed Tuple of reconstructible, closed Record of reconstructible).
   - Callee's effect set is empty.
   - Callee is foldable: a whitelisted pure builtin, or a user-defined function whose body has an empty effect set.
   - For closures: every captured binding has a reconstructible type (decision 5).

2. **Arg-to-value reconstruction.** `typeToValue(t: Type): unknown | NOT_RECONSTRUCTIBLE` handling `Literal`, closed `Tuple`, closed `Record`.

3. **Sandboxed evaluator entry point.** `foldCall(callee, argValues, capturedEnv, stepBudget)` helper in the evaluator:
   - Creates a fresh evaluator state.
   - Seeds the environment with reconstructed captures (decision 5).
   - Runs with `stepBudget = 10_000` (decision 1).
   - Returns `{ ok: true, value } | { ok: false, reason: 'budget' | 'effect' | 'error', effectName? }`.
   - Place a comment at the entry point documenting future fast-path (decision 7) and memoization (decision 8) optimizations.

4. **Wire folding into `inferExpr` Call case.** After normal inference, if `canFoldCall`, call `foldCall`:
   - On success → replace `result` with `valueToLiteralType(value)` (handles primitives + composites).
   - On `{ ok: false, reason: 'effect', effectName }` → keep inferred type, attach `severity: 'warning'` TypeInferenceError: *"this expression may perform `@${effectName}` at runtime"* (decision 2).
   - On `budget` or other errors → silent fall-back to inferred type.

5. **`If` literal narrowing.** Still infer both branches (so errors in dead code surface). If `condType` expands to `literal(true)` → `result = thenType`; `literal(false)` → `result = elseType ?? NullType`; otherwise current `union` behavior.

6. **Match guard-literal pruning.** Inside the `NodeTypes.Match` case loop, after `inferExpr(guard)`: if `guardType` expands to `literal(false)`, skip this case (do not add to `branchTypes`, do not subtract from `remainingType`). Also emit redundant-guard warning for consistency with existing redundant-pattern warning (decision 6). Scrutinee narrowing is already handled by existing code.

7. **Builtin whitelist.** `Set<string>` of pure builtin names: `+`, `-`, `*`, `/`, `%`, `==`, `!=`, `<`, `>`, `<=`, `>=`, `&&`, `||`, `!`, `count`, core string ops, `nth` (even though partial — partialness surfaces as `@error`, handled by decision 2), record/tuple access. User-defined functions are eligible whenever their inferred effect set is empty.

8. **Closure capture reconstruction** (decision 5). When the callee is a user function, enumerate its captured bindings (plumb from the evaluator's closure representation). If all captures are reconstructible, rebuild the env; otherwise bail.

9. **Testing.** Golden tests:
   - Each arithmetic op with literal args → literal result.
   - Each comparison op → literal bool.
   - Logical ops including short-circuit (`false && expensive()` shouldn't run the RHS).
   - `count` on literal collections.
   - Record/tuple field access on closed literals.
   - `if literal(true)/literal(false) then ... else ... end` → live branch only.
   - `match literal(5) case 5 then A case _ then B` → A only (verifies existing behavior).
   - `match X case _ when 1==2 then A case _ then B` → B only (guard-literal pruning).
   - User-defined pure function called with all-literal args → folded.
   - Closure capturing a literal constant → folded.
   - Closure capturing a non-literal variable → not folded.
   - Recursive pure function within budget → folded.
   - Recursive function exceeding budget → not folded, no warning.
   - `1/0` → fallback with warning on `@error`.
   - `a/b` with unknown operands → no warning.
   - `perform(@foo, 1)` (or any effectful call) → not folded, no warning.

10. **Measure compile-time impact.** Run the existing test corpus and a large example program with folding enabled/disabled. Record the delta. If >5% regression, revisit decisions 7 and 8 (add fast-path and/or memoization).

11. **Documentation.** Add a section to [2026-04-12_type-system.md](2026-04-12_type-system.md) or a dedicated page describing the folding boundary: what is/isn't folded, the effect-performed warning, the budget, and the guarantee that fold results are sound approximations (a folded `literal(v)` means "this expression will always produce `v` at runtime, given the handler resumes identically").

## Non-goals

- Speculative evaluation of branches inside effectful expressions.
- Folding across I/O (storage, network, etc.) — always blocked by effect check.
- Exposing fold results as *runtime* constants (that's evaluator-level constant folding, a separate optimization).
