# `.dvala` Coverage from the Unit Test Suite

**Status:** Implemented (2026-06-09) — all 6 plan steps shipped; `pnpm run check` + e2e green.
**Created:** 2026-06-09

## Implementation status (2026-06-09)

Built on branch `dvala-coverage-from-unit-tests`. Result: the 6 **core** builtin
`.dvala` files report **216/216 lines (100%)** and **~1147/1150 expressions (99.7%)**
from the existing TS unit suite, as a separate `coverage-dvala/` report (LCOV + HTML +
text), folded into `test:coverage` (`DVALA_COVERAGE=1`) and uploaded as its own CI
artifact. The c8 TS report is unchanged.

Open questions resolved:

- **Owning-impl-test organization:** deferred, as designed (enabled, not required). Numbers now exist to inform it.
- **Per-run opt-in API shape:** `createDvala({ coverage: true })` + `getCoverage()` (an instance-scoped collector, because the impl-tests use sync `dvala.run()` and `run` returns only the value). Required threading `onNodeEval` through the sync evaluator.
- **Throw-stub hygiene:** done — `/* v8 ignore next */` on the 23 migrated stubs.
- **HTML report location / retention:** `coverage-dvala/` (sibling of c8 `coverage/`); CI artifact `coverage-report-dvala`, 30-day retention.
- **Debug-mode cost:** accepted for the weekly `test:coverage` run.

Known limitations / follow-ups:

- **Scope is CORE builtins only.** `initCoreDvalaSources` loads only `core/*.dvala`; the
  module `.dvala` files (`modules/*/*.dvala`, decision 6 wanted them too) are not yet
  measured. The report's include glob is already `builtin/**/*.dvala`, ready for them.
- **±2-expression wobble in the total** (ratio stays 99.7%/100%): `structuralLeaf`
  classification depends on registry state at parse time, and the cross-worker merge
  picks one worker's canonical map. Attribution is correct (the canonical is the same
  parse that assigns `dvalaImpl`); full determinism would need a pinned parse state.

## Goal

Measure **line + expression coverage of the engine's builtin `.dvala` files**
(`packages/dvala-engine/src/builtin/**/*.dvala`) from the existing TS/vitest test
suite, and report it as a **separate** coverage report alongside the c8 (TS) one.

This recovers the coverage signal that the `.dvala`-builtin migration shifts out
of c8: when a builtin moves TS→`.dvala`, its logic leaves the c8-measured surface
(`.dvala` is excluded from vitest coverage) and its old TS body becomes an
unreachable throw-stub. The logic is still *exercised* by the unit tests
(`dvala.run('isEven(2)')`) — it is just no longer *measured*. This design measures
it again, on the `.dvala` surface.

Related but **out of scope** (own doc): the standalone conformance corpus and its
*surface* coverage metric — see
[2026-06-09_dvala-conformance-suite.md](2026-06-09_dvala-conformance-suite.md).
That doc deliberately punts on impl-level line/expression coverage; this is it.

---

## Background

### What migration does to coverage (the "lost coverage" problem)

For a builtin moved to `.dvala` (e.g. the predicates slice):

1. The logic body leaves the c8 surface — `.dvala` is explicitly excluded from
   vitest coverage ([vite.config.mts:105](../../vite.config.mts#L105)).
2. The replacement TS `evaluate` is a never-called throw-stub
   (`throw new Error('isEven is implemented in Dvala')`) with no `/* v8 ignore */`,
   so it shows as a *new uncovered* TS region.
3. The evaluator's own TS coverage rises (more `.dvala` exercises more trampoline
   paths) — but the *builtin's* logic is now unmeasured.

Net: coverage of the builtin's logic doesn't vanish, it **moves to the `.dvala`
surface** — which has no report in the engine's CI today. Mental model:
*as logic migrates TS→`.dvala`, coverage responsibility migrates c8→`.dvala`-coverage.*
Migration is coverage-neutral *iff* the `.dvala` surface is measured.

### The mechanism already exists and is proven

`.dvala` coverage is not new infrastructure — it is wired and battle-tested for
user projects:

- The evaluator exposes an `onNodeEval(node, …)` hook
  ([effectTypes.ts](../../packages/dvala-engine/src/evaluator/effectTypes.ts);
  fired in the main loop at
  [trampoline-evaluator.ts:5803](../../packages/dvala-engine/src/evaluator/trampoline-evaluator.ts#L5803)).
  `node[2]` is the node ID; recording it gives a `coverageMap: Map<nodeId, count>`.
- `run`/`runAsync` already accept `onNodeEval` + `filePath` and return a merged
  `sourceMap` (see how `runTestFile` uses them:
  [dvala-test-framework/src/index.ts:99-150](../../packages/dvala-test-framework/src/index.ts#L99-L150)).
- `coverage.ts` turns `(coverageMap, sourceMap)` into **line coverage** (LCOV) and
  **expression / AST-node coverage** (`exprsFound`/`exprsHit`), aggregating
  **by source path + line** across many results — so cross-instance merging is
  safe ([coverage.ts:116-208](../../packages/dvala-test-framework/src/coverage.ts#L116-L208)).
- The **runtime-import** path already does exactly the right thing for imported
  `.dvala`: parse with a *shared* `allocateNodeId` + `filePath` (in debug) and
  **merge the imported sourceMap** into the accumulated one with a source offset
  ([trampoline-evaluator.ts:773-787](../../packages/dvala-engine/src/evaluator/trampoline-evaluator.ts#L773-L787)).

### Why builtin `.dvala` coverage is zero today

The builtin sources are pre-evaluated at startup by `initCoreDvalaSources`, which
calls a bare `parseSource(source)` with **no options**
([initCoreDvala.ts:27](../../packages/dvala-engine/src/builtin/normalExpressions/initCoreDvala.ts#L27)).
Consequences:

1. **No `filePath`** → builtin nodes resolve to `<anonymous>`, which `coverage.ts`
   skips ([coverage.ts:133](../../packages/dvala-test-framework/src/coverage.ts#L133)).
2. **SourceMap not merged** → even a recorded hit on an `isEven` body node maps to
   nothing.
3. **Independent `allocateNodeId`** → builtin node IDs collide with the user
   program's, which would *conflate* coverage if naively enabled.

The runtime-import code (above) is the exact template that fixes (1)-(3).

## Proposal

Wire builtin `.dvala` sources into the existing coverage mechanism, and expose two
activation modes — an **attributable per-run opt-in** (primary) and an **optional
global baseline** — feeding a **separate** `.dvala` coverage report.

### Decisions (from the interview)

1. **Activation:** folded into the existing `test:coverage` run (heavier,
   already-separate), **never** the default `pnpm run test` — `onNodeEval` fires
   per node and requires `debug:true`, too costly for the hot path.
2. **Mechanism — opt-in primary, global baseline optional:**
   - **Primary (attributable):** an explicit per-run coverage option. A test file
     that *owns* a builtin's coverage opts in (passes a coverage collector / flag),
     and its hits are attributed to that file. This is the honest signal for
     "does the owning test cover this impl," and keeps `createDvala` clean.
   - **Optional baseline:** a `DVALA_COVERAGE=1` env switch makes `createDvala`
     auto-attach the hook process-wide; a root vitest `globalSetup`/teardown dumps
     a **suite-wide union** LCOV ("is this impl exercised by *anything*"). Useful
     for an initial baseline before the owning-test layer exists.
   - *Why opt-in is primary:* a suite-wide union can **mislead** — it would credit
     incidental coverage from cross-cutting tests and mask gaps in the owning
     impl-test. Attribution answers the question we actually care about.
3. **Reporting:** a **separate** `.dvala` report (own LCOV / HTML / summary), not
   merged with the c8 number — the two surfaces mean different things (c8 = TS
   impl + evaluator + tooling; `.dvala` = language-implemented builtins).
4. **Granularity:** report **both** line and expression coverage. `.dvala`
   one-liners pack multiple branchy nodes per line
   (`isOdd: (x) -> ((x % 2) != 0) && isInteger(x)`), so expression coverage is the
   real signal; lines keep the familiar LCOV/HTML view. Both are already computed.
5. **Gate:** **report-only** initially (matches how c8 is treated — weekly
   [coverage.yml](../../.github/workflows/coverage.yml), not a PR gate). Promote to
   a gate only once the signal is stable and owning impl-tests mature.
6. **File scope:** engine builtins only — `packages/dvala-engine/src/builtin/**/*.dvala`
   (**both** `core/*.dvala` and `modules/*/*.dvala`). Templates, fixtures, and the
   examples project are assets, not impl-under-test; excluded via the `coverage.ts`
   include/exclude globs.

### Why expression coverage, not a branch-coverage engine

Expression / AST-node coverage is the **proxy for branch coverage** here: each
`if`/`else` arm and each `&&`/`||` operand is a distinct node, so an untaken branch
is an unhit expression. Building a true branch-coverage engine for the tree-walking
interpreter is deliberately **out of scope** — c8 already provides branch coverage
on the TS side, and the AST-node proxy is good enough for the `.dvala` surface.

## Open Questions

- **Owning-impl-test organization (downstream, enabled by this work).** Once
  coverage is measurable, should impl-coverage be *owned per-function/per-file*
  (a dedicated impl-test layer, or the conformance corpus), vs. measured
  suite-wide? This is a test-org refactor that this measurement **enables but does
  not require** — and it should be designed *after* seeing real numbers, not
  before. Guardrail: tests assert **behavior**; coverage is the *lens* that finds
  untested behavior, not the goal (avoid assertion-light coverage-chasing).
- **Per-run opt-in API shape.** What does a TS test pass to opt in — a `coverage`
  flag on `createDvala`/`run` that returns the `(coverageMap, sourceMap)`, or a
  shared collector object? `runTestFile` already has a `coverage?: boolean` shape
  to mirror.
- **Throw-stub hygiene.** Should the migrated TS throw-stubs get `/* v8 ignore */`
  (so the intentionally-dead fallbacks stop diluting the c8 report)? Small, and
  arguably belongs with this work since it's the c8 side of the same migration.
- **HTML report location / retention.** Where does the `.dvala` HTML report land
  relative to the c8 `coverage/` dir, and is it uploaded as its own CI artifact?
- **Debug-mode cost.** Coverage forces `debug:true`; confirm the `test:coverage`
  run's added wall-clock is acceptable, or scope the global baseline to a subset.

## Implementation Plan

1. **Builtin sourceMap wiring (the core change).** In `initCoreDvalaSources`, parse
   builtin sources with `{ debug, filePath, allocateNodeId }` and merge their
   sourceMap into the runtime's accumulated one — mirroring the runtime-import
   template at
   [trampoline-evaluator.ts:773-787](../../packages/dvala-engine/src/evaluator/trampoline-evaluator.ts#L773-L787).
   The **shared `allocateNodeId`** is mandatory (fixes the node-ID collision).
2. **Vertical-slice spike (de-risk first).** Throwaway script:
   `createDvala({debug:true})` with step 1 applied, attach `onNodeEval`, run
   `isEven(2)` / `isEmpty([])`, then `generateLcov` and confirm `predicates.dvala`
   lines + expressions appear with hit counts. Validates the one hard assumption
   before building activation/reporting.
3. **Per-run opt-in API** (primary) — a coverage option on the run path that
   collects and returns `(coverageMap, sourceMap)`; opt the relevant impl-test
   files in (start with `predicate.test.ts`).
4. **Optional global baseline** — `DVALA_COVERAGE=1` → `createDvala` auto-attaches
   the hook; root vitest `globalSetup`/teardown aggregates via
   `computeCoverageSummary`/`generateLcov`.
5. **Separate report** — emit `.dvala` LCOV + HTML + text summary (line + expr),
   scoped to `packages/dvala-engine/src/builtin/**/*.dvala`; fold invocation into
   `test:coverage`; report-only.
6. **(Optional, same migration) throw-stub `/* v8 ignore */` hygiene.**

### Out of scope

- A true branch-coverage engine (use expression coverage as the proxy).
- Merging `.dvala` and c8 into a single combined number.
- The owning-impl-test reorganization (downstream; enabled, not required).
- Coverage of non-builtin `.dvala` (prelude, CLI templates, fixtures, examples).
