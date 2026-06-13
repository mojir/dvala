# 100% Coverage of All `.dvala` Builtin Files

**Status:** Approved — in progress (decisions locked 2026-06-13)
**Created:** 2026-06-13

## Goal

Every engine builtin `.dvala` file (core + modules, `packages/dvala-engine/src/builtin/**/*.dvala`) reports **100% line AND 100% expression coverage** in the `DVALA_COVERAGE=1` union report — and a **CI gate keeps it there**. Today the report is honest but partial (~96–97% exprs); the remaining gap is real untested code plus a handful of genuinely-unreachable defensive branches.

---

## Background

- The union report (PR #250/#253/#254) measures line + expression coverage of all builtin `.dvala` files from the existing TS/vitest suite under `DVALA_COVERAGE=1`, rendered to `coverage-dvala/` (summary.txt + HTML + lcov.info). It is now faithful: branch arms are measured (red/green), continuation lines filled, `lcov.info` matches the HTML.
- It is **report-only** — not a gate. The coverage workflow runs on manual dispatch.
- Remaining uncovered expressions fall into three kinds:
  1. **Reachable but untested** — a builtin function or branch the TS suite never exercises (e.g. an error path, a rarely-used variant, an `else` arm). The bulk.
  2. **Defensive / unreachable** — a guard that can't be triggered from valid Dvala (type-checked inputs make it dead), or a branch only reachable via internal invariants.
  3. **Genuinely dead** — code no longer reachable at all.
- Two pieces of *mechanism* are missing for a credible 100% target:
  - A **coverage-ignore directive for `.dvala`** (analogous to `/* v8 ignore */` for TS) — so category 2 can be excluded honestly with a documented reason, instead of contorting tests to hit unreachable guards.
  - A **gate** that fails CI when any builtin `.dvala` drops below 100% (lines + exprs, minus ignores).
- Test-mechanism question: coverage accrues from the **TS unit suite** running under `DVALA_COVERAGE=1`. New coverage therefore comes from TS tests that exercise the builtins (`__tests__/dvala-engine/builtin/**`). Co-located `.test.dvala` files are *not* a reliable path today (the `.test.dvala` CI bridge is known-broken; tracked with the conformance-suite doc).

## Proposal

Drive each file to 100% by triaging every uncovered expression and applying the cheapest honest fix, then lock it with a gate.

**1. Per-expression triage (the core loop).** For each uncovered expr in the report:
- **Reachable** → add/extend a TS unit test that calls the builtin with inputs exercising that path. Prefer the existing per-function test files.
- **Defensive/unreachable** → mark with a `.dvala` coverage-ignore directive carrying a one-line reason. Never ignore reachable code.
- **Dead** → delete it (boy-scout); re-run typecheck/tests.

**2. Build the `.dvala` coverage-ignore directive (prerequisite mechanism).**
- A comment convention the report's denominator honors, e.g. `;; coverage-ignore-next — <reason>` (next expression) and a block form `;; coverage-ignore-start` / `;; coverage-ignore-end`. (Exact syntax = open question.)
- Implemented where the denominator is built: the parser tags the position (a new `coverageIgnore` flag, set like `structuralLeaf`), and `computeCoverageSummary` / the report excludes ignored positions from both `found` and `uncovered`.
- Requires a deliberate, reviewable reason per ignore so it can't become a silent escape hatch.

**3. Phase the work, smallest gap first.** Order files by uncovered-expr count ascending: the many near-100% files reach 100% fast (momentum + shrinking the gate's redlist), saving the large ones (`number-theory`, `collection`) for last. Each file is an independent unit of work (parallelizable).

**4. Add the gate (lock it in).** Once all files are at 100%, extend the report/`test:coverage` to **fail** if any builtin `.dvala` is below 100% lines+exprs (after ignores). Wire it where the coverage run already produces the summary. Decide whether it gates PR CI or stays on the (now-enforcing) coverage workflow — see Open Questions.

**5. Guard against new gaps.** With the gate live, a new builtin function or branch without a test fails the coverage run — coverage stays at 100% by construction.

## Decisions (locked 2026-06-13)

1. **Ignores allowed, audited.** A coverage-ignore directive is permitted, but each requires a **mandatory reason** and the report shows the **count of ignored exprs** (e.g. "100% — 3 ignored"). Never ignore reachable code.
2. **Syntax:** `/* coverage-ignore-next: <reason> */` — block-comment form (inline-capable, so it can isolate one arm of a dense single-line conditional, which `//` cannot), applies to the **next expression**, reason required. (Block start/stop form deferred until triage shows a need.)
3. **No gate at this time.** We drive every file to 100% but add **no CI enforcement** yet — accepting that 100% can silently regress until a gate is added later. (Gate design retained below under "Deferred".)
4. **Test mechanism:** **TS unit tests** under `__tests__/dvala-engine/builtin/**` (`dvala.run(...)` with path-hitting inputs). `.test.dvala` revival is out of scope.
5. **Target metric: expressions = 100%.** Exprs strictly dominates — exprs=100% ⟹ lines=100% here (every hit node covers its start + continuation lines) — and is the finer signal. Lines come along for free.

## Implementation Plan

1. **Measure & triage.** Run the union; produce a per-file list of uncovered exprs. Classify each as reachable / defensive / dead. Output: a tracking checklist (counts per file).
2. **Build the coverage-ignore directive** (`/* coverage-ignore-next: <reason> */`) + tests. Land first so the triage loop can use it. Parser tags the next node's position with a `coverageIgnore` flag (+ the reason); the report drops ignored positions from `found`/`uncovered` and surfaces the count.
3. **Per-file passes, smallest gap first.** For each file: add TS tests for reachable exprs, ignore defensive ones (with reasons), delete dead ones. Re-run the union; confirm the file hits 100% exprs. Commit per file (or small batches). Run benchmarks when engine `src/` changes.
4. **Document** the policy (how to keep `.dvala` at 100%, when an ignore is acceptable) in CLAUDE.md / the coverage docs.

### Deferred

- **The 100% gate.** Decision #3: no CI enforcement now. When added later, lean toward a PR-time job running `DVALA_COVERAGE=1 vitest run` (no c8 — cheap) that fails if any builtin `.dvala` is < 100% exprs after ignores; fall back to the coverage workflow if `isolate:false` flakiness makes it noisy.

## Non-goals

- 100% coverage of the **TS** sources (separate c8 report; unchanged here).
- Reviving `.test.dvala` / the conformance suite (tracked separately).
