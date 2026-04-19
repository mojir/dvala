# Phase B — `DVALA_FOLD` toggle and differential test matrix

**Status:** Shipped (PR #53, 2026-04-17)
**Created:** 2026-04-16
**Depends on:** [2026-04-16_constant-folding-in-types.md](2026-04-16_constant-folding-in-types.md), [2026-04-16_builtin-effect-audit.md](2026-04-16_builtin-effect-audit.md) (Phase A)

> **Ship note (2026-04-19):** Implemented. Toggle lives at [src/typechecker/foldToggle.ts](../../src/typechecker/foldToggle.ts) (env default is **on** — opt out with `DVALA_FOLD=0`). Integration tests in [src/typechecker/fold.test.ts](../../src/typechecker/fold.test.ts); differential matrix against the normal evaluator in [src/evaluator/foldEvaluate.test.ts](../../src/evaluator/foldEvaluate.test.ts) (805 lines). CI runs the full check pipeline as a matrix over `DVALA_FOLD=0` / `DVALA_FOLD=1`.

## Goal

Mechanically enforce that **constant folding is observationally equivalent to normal evaluation for pure code**. The Phase A audit established that every pure-declared builtin is actually pure; Phase B turns that trust into a CI-enforced property so we can ship Phase C (folding implementation) without a whitelist.

Two deliverables:

1. **`DVALA_FOLD` env toggle** — gate the fold path so it can be enabled/disabled at typecheck time, with no other code change.
2. **Differential test matrix** — for every pure builtin and every literal-arg call, assert `fold(call) == eval(call)`.

After Phase B lands, flipping `DVALA_FOLD=1` should be observationally invisible for any passing Dvala program.

---

## Part 1 — The `DVALA_FOLD` toggle

### Behavior

- `DVALA_FOLD=0` (or unset): folding is disabled. `inferExpr` skips the fold path entirely. The typechecker behaves as if Phase C doesn't exist.
- `DVALA_FOLD=1`: folding is enabled. `inferExpr` calls `tryFoldCall` after normal inference for every `Call` node whose callee has an empty effect set.

### Where it lives

Single flag read at the top of `src/typechecker/infer.ts` (or a small utility module):

```ts
// src/typechecker/foldToggle.ts
export const FOLD_ENABLED = process.env.DVALA_FOLD === '1'
```

Rationale for a module-scope const rather than a per-call lookup:
- Fold is a hot path — one `process.env` read per typecheck run instead of per Call node.
- Test harnesses that want to control the flag per-test can re-import the module with Vitest's `vi.doMock` or set the env before module load.

### Alternative: typecheck option

Instead of (or in addition to) an env var, accept it as an option on `dvala.typecheck(source, options)`:

```ts
interface TypecheckOptions {
  // ... existing options
  fold?: boolean  // default: false in v1, true once Phase C stabilizes
}
```

**Recommendation:** ship both. Env var for CLI and CI ergonomics; option for programmatic callers (LSP, playground) that want fine-grained control. Option takes precedence over env.

### Default

Default = `false` throughout Phase B and early Phase C. This means:
- Users on `main` never experience folding until we flip the default.
- All Phase B tests explicitly set `DVALA_FOLD=1` (or the option).
- The existing test corpus must continue to pass with `DVALA_FOLD=0` (guaranteed, since folding is a no-op).

Flip the default to `true` in a later, dedicated commit after Phase C's tests are green under both settings.

### Runtime semantics

The toggle only affects the **typechecker's fold path**. It must not affect the evaluator. Any runtime observable difference between `DVALA_FOLD=0` and `DVALA_FOLD=1` indicates a bug in folding (either in the sandbox or in how results propagate into inferred types that later influence evaluation — which shouldn't happen because types are erased).

---

## Part 2 — The differential test matrix

### Invariant

> For every builtin declared pure (Phase A), and every literal-arg call producing a reconstructible result, the fold sandbox's output equals the normal evaluator's output.

### Structure

A single test file `src/typechecker/foldDifferential.test.ts` (or similar). Table-driven:

```ts
interface DifferentialCase {
  builtin: string           // e.g. '+'
  args: Any[]              // literal values (pre-reconstructed)
  expected?: Any            // optional ground truth; otherwise just check fold == eval
  expectedEffect?: string   // if the call is expected to surface an effect (e.g. @dvala.error)
}

const CASES: DifferentialCase[] = [
  { builtin: '+', args: [1, 2] },
  { builtin: '+', args: [1, 2, 3, 4] },
  { builtin: '/', args: [10, 2] },
  { builtin: '/', args: [1, 0], expectedEffect: 'dvala.error' },
  { builtin: 'sqrt', args: [-1], expectedEffect: 'dvala.error' },
  { builtin: 'count', args: ['hello'] },
  { builtin: 'isNumber', args: [42] },
  { builtin: 'isNumber', args: ['hi'] },
  // ... one row per (builtin, representative args)
]

for (const { builtin, args, expected, expectedEffect } of CASES) {
  it(`${builtin}(${args.map(JSON.stringify).join(', ')})`, () => {
    const normalResult = runNormalEval(builtin, args)
    const foldResult = runFoldSandbox(builtin, args)

    if (expectedEffect) {
      expect(foldResult).toEqual({ ok: false, reason: 'effect', effectName: expectedEffect })
      // Normal eval throws; assert the throw matches.
      expect(() => runNormalEval(builtin, args)).toThrow(DvalaError)
    } else {
      expect(foldResult).toEqual({ ok: true, value: normalResult })
      if (expected !== undefined) expect(normalResult).toEqual(expected)
    }
  })
}
```

### Coverage targets

One `DifferentialCase` row per **(builtin, equivalence class of inputs)**. Classes:

- **Standard inputs** — typical values the builtin is designed for.
- **Edge cases** — zero, negative, empty collections, single-element collections, max/min numeric values where applicable.
- **Failure inputs** — divide-by-zero, non-finite results, out-of-bounds `nth`, assertion failures. Verify they surface as `@dvala.error` warnings in fold, and as thrown `DvalaError` in normal eval.
- **Polymorphic arities** — for builtins like `+` that accept any number of args, cover at least 0-arg (identity), 1-arg (monadic), and 2+-arg (reduce) cases.

Rough case count estimate from Phase A's ~470 pure builtins: ~3–5 cases per builtin = 1400–2400 test rows. Vitest can handle this; runtime should be under 30s.

### Bootstrapping the table

The table will be large. Two options:

**a) Hand-author every row.** Maximum intent; minimum coupling. Author writes the cases they believe are important. Audit each row during review.

**b) Auto-generate from builtin docs.** Every builtin's `docs.examples` already contains runnable snippets. Parse each example, run it through both paths, assert equality. Gets us coverage for free; misses edge cases the examples don't cover.

**Recommendation:** ship (b) as the baseline, supplement with (a) for edge cases. The examples already exist and are tested for "runs without error" — this just adds the fold-equivalence assertion.

---

## Part 3 — CI integration

### The double run

```yaml
# .github/workflows/ci.yml (or equivalent)
jobs:
  test-no-fold:
    name: Test with DVALA_FOLD=0
    runs-on: ubuntu-latest
    env:
      DVALA_FOLD: '0'
    steps:
      - run: npm test

  test-fold:
    name: Test with DVALA_FOLD=1
    runs-on: ubuntu-latest
    env:
      DVALA_FOLD: '1'
    steps:
      - run: npm test
```

Both jobs run the full test suite. Any test that passes under one but fails the other reveals either:
- A bug in folding (result differs from normal eval), or
- A test that implicitly depends on non-folded behavior (which is itself a bug — tests should not care whether folding is on).

### The differential matrix runs under both

The `foldDifferential.test.ts` file tests the *invariant*, not the current default. It must pass under both settings. Under `DVALA_FOLD=0` the fold sandbox is still callable directly (through `evaluateNodeForFold`) — the toggle gates *whether the typechecker uses it*, not whether the code compiles.

### Performance measurement

The double-run also gives us the compile-time delta from Phase C's Step D1 for free. Record the delta per commit; alert on >5% regression.

---

## Open questions

1. **LSP / playground handling.** Should the LSP always fold (for best hover info)? Should the playground expose a toggle to let users compare typed-with-fold vs typed-without-fold? Probably yes to both once Phase C is stable; defer for now.

2. **Test-file fold interaction.** Per the Phase A audit, the `test` module has shared `TestCollector` state. If a `.test.dvala` file gets typechecked with `DVALA_FOLD=1`, fold might attempt to execute `test("name", -> 42)` at type-check time and mutate the collector. Fix: either declare `@test.register` effect on `test/describe/skip`, or exclude `test` module functions from fold via an allow-list (temporary). Design: prefer the effect declaration approach; it's the correct long-term answer. Track in Phase A follow-ups.

3. **Higher-order callback folding.** Phase A flagged that `filter`, `map`, `reduce`, etc. have type signatures that don't express effect polymorphism. Current fold attempts on these would pass pure-callback cases (good) and fail effectful-callback cases with a warning (good). The differential tests should include at least one case each with a pure callback (e.g. `map([1,2,3], inc)`) to confirm this works.

4. **Non-deterministic JS APIs we missed.** The audit found no current usage, but future builtins might introduce `Math.random`, `Date.now`, etc. Consider adding a lint rule or grep-based CI check that flags these APIs in builtin impls — so future audits don't have to re-establish the baseline.

---

## Deliverables

Phase B is complete when:

1. `DVALA_FOLD` env toggle implemented, defaults to `false`, documented.
2. `dvala.typecheck` accepts `fold?: boolean` option.
3. `foldDifferential.test.ts` exists with ≥1 case per pure builtin. Passes under `DVALA_FOLD=0` and `DVALA_FOLD=1`.
4. CI runs the test suite under both toggle values. Both must pass.
5. Phase A follow-up #3 (test module effect declaration) landed, OR `test.test`/`test.describe`/`test.skip` temporarily excluded from fold via the audit-informed allow-list.
6. Summary entry added to [2026-04-16_constant-folding-in-types.md](2026-04-16_constant-folding-in-types.md) confirming Phase B complete.

After Phase B, Phase C (folding implementation) can land with confidence — the single-gate architecture (effect-set only, no whitelist) is justified by Phase A's audit and Phase B's mechanical verification.
