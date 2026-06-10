# Dvala Conformance Suite

**Status:** Parked (2026-06-10) — deferred to the KMP era. The analysis + proposal stand; no corpus built yet. Revisit when KMP is greenlit (or sooner if the orphan-files item below becomes annoying).
**Created:** 2026-06-09

> **Parked-state notes (2026-06-10):**
> - The two orphan `.test.dvala` files (`core-math.test.dvala`,
>   `effectHandler.test.dvala`) were **verified passing** but still **run nowhere** —
>   the bridge [`__tests__/dvala-tests.test.ts:18`](../../__tests__/dvala-tests.test.ts#L18)
>   globs the dead root `src/**`. Left in place by decision; **revisit them as part of
>   plan steps 1–2** (move into the corpus + fix/replace the bridge) when this plan is
>   picked up, rather than band-aiding the glob now.
> - Impl-level line/expression coverage of the builtins **shipped separately** (core)
>   in PR #250 — see [2026-06-09_dvala-coverage-from-unit-tests.md](2026-06-09_dvala-coverage-from-unit-tests.md).

## Goal

Establish a **standalone, implementation-independent corpus of `.dvala` tests** —
`packages/dvala-conformance` — that defines the **observable behavioral contract**
of the Dvala language. It is the spec a *second runtime* (the Kotlin Multiplatform
port) must satisfy: point any runtime at the corpus, and passing it is the
definition of "this runtime is correct."

Explicitly **not** a goal: a second, parallel re-test of behavior the TypeScript
suite already covers. The justification is cross-runtime conformance, not
bug-catching the TS tests miss. See "Why this is *not* just a second test suite."

---

## Background

### The trigger

The `.dvala`-builtin migration ([2026-06-05_minimize-kmp-runtime-surface-via-dvala-builtins.md](2026-06-05_minimize-kmp-runtime-surface-via-dvala-builtins.md))
pushes builtin logic out of TS into `.dvala` so a KMP runtime inherits it for free.
That raised the natural question: should each `.dvala` impl get a co-located
`.test.dvala`, run as its own suite, with coverage?

Investigating the current state surfaced two facts that reframe the question:

1. **The builtins are already tested** — `__tests__/builtin/normalExpressions/predicate.test.ts`
   etc. run `dvala.run('isEven(2)')` through the real evaluator, with mature c8
   line **and branch** coverage. A co-located `.test.dvala` for the same builtin
   exercises the same path and asserts the same behavior — it catches ~no
   additional bug. As a *testing* investment it is largely redundant.

2. **The existing `.dvala`-test bridge is silently broken.**
   [`__tests__/dvala-tests.test.ts`](../../__tests__/dvala-tests.test.ts) globs
   `src/**/*.test.dvala` from the repo root — but root `src/` was removed in the
   monorepo decomposition. It matches **0 files** and passes via its
   "no files found" placeholder. The two builtin `.test.dvala` files that exist
   (`packages/dvala-engine/src/builtin/core/core-math.test.dvala`,
   `.../modules/effectHandler/effectHandler.test.dvala`) therefore **run nowhere
   in CI**. A suite that can rot unnoticed for months is not load-bearing —
   confirming point 1.

### What already exists (mature, but pointed at user projects)

- **Framework** — `@mojir/dvala-test-framework`: `runTest` / `runTestFile` /
  `runTestSuite` + formatters (console, JUnit, TAP, HTML).
- **In-language API** — the `test` module (`describe` / `test` / `skip`) and the
  `assertion` module (`assertEqual` / `assertTrue` / …).
- **Coverage** — [`coverage.ts`](../../packages/dvala-test-framework/src/coverage.ts)
  computes **line coverage (LCOV)** *and* **expression / AST-node coverage**
  (`exprsFound` / `exprsHit`) via an evaluator `onNodeEval` hook + source maps,
  with an `all:true` mode that reports never-run files at 0%, plus an HTML report.
- **CLI** — `dvala test` dogfoods all of it for user projects (include/exclude/
  reporters config).

So the machinery is built; it is simply **not applied to the engine's own
builtins**, and the one bridge that tried is broken.

### Why this is *not* just a second test suite

The thing TS tests **cannot** do: act as the contract a *different* runtime must
satisfy. TS tests are bound to the TS engine through `dvala.run`. A `.dvala`
corpus is runtime-agnostic source — it validates **observable semantics** (return
values, which error *kinds* throw, effect ordering) on *any* evaluator.

- For **migrated** builtins, it validates the shared `.dvala` impl runs correctly
  on whatever evaluator executes it (TS today, KMP later).
- For **native** builtins, it is the **spec** the Kotlin reimplementation must
  pass — i.e. the executable form of the "irreducible primitive contract" the
  core-builtin inventory is trying to define.

This is the standard model for language conformance: Test262 (every JS engine
runs it from a shared external repo), the WebAssembly spec tests, the Lua test
suite. None co-locate their conformance corpus with one implementation — the
whole point is that *multiple* implementations point at the same external corpus.

### Why co-location is the wrong default here

Co-locating `.test.dvala` next to each `.dvala` ties the corpus to *this*
implementation's file tree (`packages/dvala-engine/src/builtin/...`). A KMP
runtime has none of that structure, so a porter would have to fish test files out
of another implementation's package internals. And it is exactly the coupling
that already broke the discovery glob. A conformance corpus should be
implementation-independent **by construction**.

## Proposal

Create **`packages/dvala-conformance`** — a standalone package whose payload is a
tree of `.dvala` conformance tests, organized **by language surface** (not by TS
source file):

```
packages/dvala-conformance/
  core/                 # core builtins: predicates, collection, sequence, ...
  modules/<name>/       # per-module behavior
  special-expressions/  # if / match / loop / do / let / handler ...
  effects/              # perform / handler ordering / resume semantics
  semantics/            # equality, ordering, coercion, numeric edge cases
```

**Run model — two parallel CI jobs with distinct purposes** (this resolves the
earlier "two jobs?" question — they are no longer the same tests run two ways):

- **vitest job** (existing) — implementation correctness + the **TS coverage
  gate**, plus the incidental TS coverage from driving `.dvala` through the
  evaluator. Needs no build (source aliases).
- **conformance job** (new) — build engine → `dvala test` over
  `packages/dvala-conformance` → pass/fail + **surface-coverage** report.
  Runtime-agnostic; a future KMP runtime runs the identical directory.

**Coverage metric — surface coverage, primary.** Because the corpus is a spec,
its coverage target is the **language surface**: "does every builtin / special
form / effect path in the reference registry have at least one conformance
assertion?" — computable directly from the existing API registry (`dvala list` /
reference data). This is more meaningful for porting *and* sidesteps building a
branch-coverage engine for a tree-walking interpreter (c8 already provides branch
coverage on the TS side). Existing line / expression coverage stays as a secondary
signal.

> Impl-level **line / expression coverage** of the `.dvala` builtins is a separate
> concern, owned by
> [2026-06-09_dvala-coverage-from-unit-tests.md](2026-06-09_dvala-coverage-from-unit-tests.md)
> — it measures the builtin `.dvala` files from the existing TS unit suite and
> shares the same `coverage.ts` machinery this corpus would later reuse.

**Scope discipline — grow with the migration, do not sweep.** The move *to a
neutral location* is cheap and high-leverage now. *Filling it out completely* is a
KMP-era investment. Concretely:

- Every builtin migrated TS→`.dvala` ships its conformance test in the same PR
  (the convention the predicates PR should have set).
- Only **portable, observable** behavior goes in — no error-message strings, no
  snapshot/suspension internals, no capability wiring (those stay TS-side). The
  neutral location makes this discipline structural.
- The comprehensive "every native builtin has a conformance test" sweep is
  deferred until KMP is actually greenlit; that is when the corpus becomes a
  *gate* rather than report-only.

**Decision (per discussion): a package, not a top-level `conformance/` dir.**
`packages/dvala-conformance` is the unit the conformance CI job builds against and
keeps the door open to publishing/versioning the corpus independently as "the
Dvala conformance suite." It also fits the existing workspace shape.

## Open Questions

- **Surface-coverage source of truth.** Drive the "every surface item is
  exercised" check off the reference API registry — exact data source and how to
  mark intentional gaps (e.g. a builtin deliberately not yet covered)?
- **What belongs in conformance vs stays TS-only.** Effects/suspension/snapshot
  semantics are partly observable (ordering, resume values) and partly
  implementation detail (snapshot bytes). Where exactly is the line for the
  effects/ and semantics/ sections?
- **Error contract granularity.** Conformance should assert error *kind*
  (`ArithmeticError` vs `TypeError`, both `DvalaError`) but not message text. Is
  the current error-kind taxonomy stable/portable enough to assert against?
- **Migration of the two orphans.** Move `core-math.test.dvala` /
  `effectHandler.test.dvala` into the corpus and delete the broken
  `__tests__/dvala-tests.test.ts` bridge, or keep a (fixed) vitest wrapper that
  also runs the corpus for TS-coverage attribution? (Leaning: fixed vitest wrapper
  *and* the standalone job — the wrapper keeps TS coverage, the job emits surface
  coverage.)
- **Does running the corpus require a built engine in CI?** The CLI consumes
  `dist/`. Confirm the conformance job's build cost is acceptable, or run via a
  thin source-aliased runner like the vitest path.
- **Package shape.** Pure test-asset package (no `src`/build, just `.dvala` +
  a manifest) vs a package that also exports a small harness/manifest the KMP side
  can consume. Default to assets-only until a consumer needs more.

## Implementation Plan

1. **Stop the rot (cheap, do first).** Fix or replace
   [`__tests__/dvala-tests.test.ts`](../../__tests__/dvala-tests.test.ts) so the
   two existing builtin `.test.dvala` files actually run; glob a stable location,
   not the dead root `src/**`.
2. **Scaffold `packages/dvala-conformance`** with the surface-based directory
   layout and move the two orphaned files in (renaming to drop the impl-coupled
   location).
3. **Wire the conformance CI job** — build engine → `dvala test` over the corpus →
   pass/fail; report-only initially.
4. **Add the surface-coverage report** driven off the reference registry; emit
   "% of builtins / special forms / effect paths with ≥1 conformance assertion"
   and a list of uncovered surface items.
5. **Set the migration convention** — every TS→`.dvala` migration PR adds its
   conformance test to the corpus (start by back-filling the predicates slice).
6. **Defer:** comprehensive native-builtin coverage and making the corpus a hard
   gate — revisit when KMP is greenlit.

### Out of scope

- A branch-coverage engine for the interpreter (use expression coverage as the
  proxy; c8 covers TS branches).
- Rewriting existing TS tests in `.dvala`.
- The KMP port itself — this corpus is an input it consumes, not part of it.
