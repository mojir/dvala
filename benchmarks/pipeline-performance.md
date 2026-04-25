# Dvala pipeline performance history

Tracks performance of every pipeline phase (tokenize → parse → typecheck → run) plus refinement-typechecker scenarios.

Source of truth: `benchmarks/pipeline-history.json` (full history).
Re-render: `npm run benchmarks:run` (also runs the benchmarks first).
Last 10 runs shown below; older runs are in the JSON only.

A new measurement added in a future run shows up as a new row, with `—` in
older columns that didn't measure it. New scenarios appear as new sections.

## Run history

| Commit | Date | Message |
| --- | --- | --- |
| `caed343e` | 2026-04-25 15:11:26 | chore(typechecker): address review feedback on Phase 2.5b |
| `62c68940` | 2026-04-25 15:00:59 | feat(typechecker): refinement Phase 2.5b — if-narrowing on refinements |
| `d4d3df5f` | 2026-04-25 14:41:23 | chore(typechecker): address review feedback on Phase 2.5a |
| `53f65e0f` | 2026-04-25 14:26:28 | feat(typechecker): refinement Phase 2.5a — block-level assert narrowing |
| `dacdb682` | 2026-04-25 14:17:39 | Refinement-types perf benchmark + CLAUDE.md rule (backfill for #96) (#97) |
| `07853a75` | 2026-04-25 12:51:55 | chore(hooks): pre-push hook enforces refinement perf benchmark |
| `bae472e8` | 2026-04-25 12:18:28 | chore(benchmarks): namespace npm scripts under benchmarks:* |
| `7a67807c` | 2026-04-25 10:52:17 | docs(claude.md): require perf benchmark on refinement-types PRs |
| `7a67807c` | 2026-04-25 10:50:26 | docs(claude.md): require perf benchmark on refinement-types PRs |
| `966faea2` | 2026-04-25 10:34:55 | Refinement types Phase 2.1 – 2.4 — representation, merging, fold-discharge, solver (#96) |

## 1. Pipeline: tokenize

*pure tokenize cost — `tokenize(source)` for each corpus program*

| Measurement | `caed343e` (2026-04-25) | `62c68940` (2026-04-25) | `d4d3df5f` (2026-04-25) | `53f65e0f` (2026-04-25) | `dacdb682` (2026-04-25) | `07853a75` (2026-04-25) | `bae472e8` (2026-04-25) | `7a67807c` (2026-04-25) | `7a67807c` (2026-04-25) | `966faea2` (2026-04-25) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.002 ms | — | — | — | — |
| medium (untyped fold) | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | — | — | — | — |
| typed (annotated arithmetic) | 0.010 ms | 0.010 ms | 0.010 ms | 0.009 ms | 0.010 ms | 0.011 ms | — | — | — | — |
| refinement-heavy (50 annotations) | 0.382 ms | 0.386 ms | 0.370 ms | 0.357 ms | 0.385 ms | 0.527 ms | — | — | — | — |
| effect-heavy (handler + perform) | 0.005 ms | 0.005 ms | 0.005 ms | 0.004 ms | 0.005 ms | 0.008 ms | — | — | — | — |
| eval-heavy (fib(15) recursion) | 0.007 ms | 0.007 ms | 0.007 ms | 0.006 ms | 0.007 ms | 0.007 ms | — | — | — | — |

## 2. Pipeline: parse (pre-tokenized)

*parser cost only — `parseTokenStream(pre-tokenized)` for each corpus program*

| Measurement | `caed343e` (2026-04-25) | `62c68940` (2026-04-25) | `d4d3df5f` (2026-04-25) | `53f65e0f` (2026-04-25) | `dacdb682` (2026-04-25) | `07853a75` (2026-04-25) | `bae472e8` (2026-04-25) | `7a67807c` (2026-04-25) | `7a67807c` (2026-04-25) | `966faea2` (2026-04-25) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | — | — | — | — |
| medium (untyped fold) | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.003 ms | 0.004 ms | — | — | — | — |
| typed (annotated arithmetic) | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | — | — | — | — |
| refinement-heavy (50 annotations) | 0.083 ms | 0.085 ms | 0.086 ms | 0.082 ms | 0.090 ms | 0.109 ms | — | — | — | — |
| effect-heavy (handler + perform) | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.002 ms | — | — | — | — |
| eval-heavy (fib(15) recursion) | 0.002 ms | 0.002 ms | 0.003 ms | 0.002 ms | 0.002 ms | 0.003 ms | — | — | — | — |

## 3. Pipeline: typecheck (cumulative — incl. tokenize + parse)

*`dvala.typecheck(source)` per program — full pipeline through the typechecker. Typecheck-only cost ≈ this − phase-tokenize − phase-parse.*

| Measurement | `caed343e` (2026-04-25) | `62c68940` (2026-04-25) | `d4d3df5f` (2026-04-25) | `53f65e0f` (2026-04-25) | `dacdb682` (2026-04-25) | `07853a75` (2026-04-25) | `bae472e8` (2026-04-25) | `7a67807c` (2026-04-25) | `7a67807c` (2026-04-25) | `966faea2` (2026-04-25) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.005 ms | 0.007 ms | 0.008 ms | 0.004 ms | 0.008 ms | 0.011 ms | — | — | — | — |
| medium (untyped fold) | 0.036 ms | 0.032 ms | 0.032 ms | 0.030 ms | 0.033 ms | 0.037 ms | — | — | — | — |
| typed (annotated arithmetic) | 0.053 ms | 0.053 ms | 0.055 ms | 0.054 ms | 0.056 ms | 0.080 ms | — | — | — | — |
| refinement-heavy (50 annotations) | 5.314 ms | 5.293 ms | 5.138 ms | 5.099 ms | 5.372 ms | 6.995 ms | — | — | — | — |
| effect-heavy (handler + perform) | 0.022 ms | 0.021 ms | 0.022 ms | 0.021 ms | 0.023 ms | 0.026 ms | — | — | — | — |
| eval-heavy (fib(15) recursion) | 0.080 ms | 0.076 ms | 0.075 ms | 0.075 ms | 0.079 ms | 0.087 ms | — | — | — | — |

## 4. Pipeline: run (typecheck disabled)

*`dvala.run(source)` with typecheck disabled — captures tokenize + parse + evaluate. Evaluator-only cost ≈ this − phase-tokenize − phase-parse.*

| Measurement | `caed343e` (2026-04-25) | `62c68940` (2026-04-25) | `d4d3df5f` (2026-04-25) | `53f65e0f` (2026-04-25) | `dacdb682` (2026-04-25) | `07853a75` (2026-04-25) | `bae472e8` (2026-04-25) | `7a67807c` (2026-04-25) | `7a67807c` (2026-04-25) | `966faea2` (2026-04-25) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.002 ms | 0.002 ms | 0.002 ms | 0.003 ms | 0.002 ms | 0.003 ms | — | — | — | — |
| medium (untyped fold) | 0.038 ms | 0.037 ms | 0.039 ms | 0.036 ms | 0.040 ms | 0.041 ms | — | — | — | — |
| typed (annotated arithmetic) | 0.007 ms | 0.007 ms | 0.007 ms | 0.006 ms | 0.007 ms | 0.008 ms | — | — | — | — |
| refinement-heavy (50 annotations) | 0.068 ms | 0.070 ms | 0.071 ms | 0.069 ms | 0.074 ms | 0.181 ms | — | — | — | — |
| effect-heavy (handler + perform) | 0.005 ms | 0.005 ms | 0.005 ms | 0.004 ms | 0.005 ms | 0.006 ms | — | — | — | — |
| eval-heavy (fib(15) recursion) | 4.594 ms | 4.468 ms | 4.613 ms | 4.520 ms | 4.653 ms | 4.809 ms | — | — | — | — |

## 5. Pipeline: end-to-end (full)

*`dvala.run(source)` — tokenize + parse + typecheck + evaluate. The number a user actually observes.*

| Measurement | `caed343e` (2026-04-25) | `62c68940` (2026-04-25) | `d4d3df5f` (2026-04-25) | `53f65e0f` (2026-04-25) | `dacdb682` (2026-04-25) | `07853a75` (2026-04-25) | `bae472e8` (2026-04-25) | `7a67807c` (2026-04-25) | `7a67807c` (2026-04-25) | `966faea2` (2026-04-25) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | — | — | — | — |
| medium (untyped fold) | 0.046 ms | 0.044 ms | 0.045 ms | 0.042 ms | 0.046 ms | 0.048 ms | — | — | — | — |
| typed (annotated arithmetic) | 0.026 ms | 0.025 ms | 0.026 ms | 0.026 ms | 0.027 ms | 0.027 ms | — | — | — | — |
| refinement-heavy (50 annotations) | 0.553 ms | 0.475 ms | 0.506 ms | 0.485 ms | 0.577 ms | 0.543 ms | — | — | — | — |
| effect-heavy (handler + perform) | 0.009 ms | 0.007 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | — | — | — | — |
| eval-heavy (fib(15) recursion) | 4.719 ms | 4.616 ms | 4.628 ms | 4.530 ms | 4.710 ms | 4.467 ms | — | — | — | — |

## 6. Refinement subtype-check cost (per predicate shape)

*isolated subtype-check calls between source type and refinement target — no parse or typecheck overhead*

| Measurement | `caed343e` (2026-04-25) | `62c68940` (2026-04-25) | `d4d3df5f` (2026-04-25) | `53f65e0f` (2026-04-25) | `dacdb682` (2026-04-25) | `07853a75` (2026-04-25) | `bae472e8` (2026-04-25) | `7a67807c` (2026-04-25) | `7a67807c` (2026-04-25) | `966faea2` (2026-04-25) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| interval target — Number → {n \| n > 0 && n < 100} | 0.10 μs | 0.10 μs | 0.10 μs | 0.09 μs | 0.09 μs | 0.09 μs | 0.09 μs | 0.08 μs | 0.08 μs | 0.10 μs |
| set target — :ok → {x \| :ok \| :error} | 0.13 μs | 0.12 μs | 0.13 μs | 0.12 μs | 0.13 μs | 0.12 μs | 0.12 μs | 0.12 μs | 0.12 μs | 0.12 μs |
| count target — String → {s \| count(s) > 0} | 0.06 μs | 0.06 μs | 0.06 μs | 0.05 μs | 0.06 μs | 0.06 μs | 0.05 μs | 0.05 μs | 0.05 μs | 0.05 μs |
| excludedSet — Number → {n \| !=0 && !=1 && !=-1} | 0.22 μs | 0.21 μs | 0.22 μs | 0.21 μs | 0.22 μs | 0.22 μs | 0.21 μs | 0.20 μs | 0.20 μs | 0.20 μs |
| literal source — 50 → {n \| n > 0 && n < 100} | 0.11 μs | 0.10 μs | 0.11 μs | 0.10 μs | 0.11 μs | 0.11 μs | 0.10 μs | 0.10 μs | 0.10 μs | 0.10 μs |

## 7. Stacked refinement simplify scaling

*simplifying N stacked refinements (`Base & {p1} & {p2} & ... & {pN}`) — empirically O(N²); regressions show as a worse exponent*

| Measurement | `caed343e` (2026-04-25) | `62c68940` (2026-04-25) | `d4d3df5f` (2026-04-25) | `53f65e0f` (2026-04-25) | `dacdb682` (2026-04-25) | `07853a75` (2026-04-25) | `bae472e8` (2026-04-25) | `7a67807c` (2026-04-25) | `7a67807c` (2026-04-25) | `966faea2` (2026-04-25) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| N= 2 stacked refinements | 0.84 μs | 0.83 μs | 0.85 μs | 0.76 μs | 0.84 μs | 0.81 μs | 0.78 μs | 0.78 μs | 0.79 μs | 0.83 μs |
| N= 4 stacked refinements | 3.59 μs | 3.52 μs | 3.50 μs | 3.36 μs | 3.59 μs | 3.44 μs | 3.30 μs | 3.28 μs | 3.33 μs | 3.54 μs |
| N= 8 stacked refinements | 15.32 μs | 15.09 μs | 15.18 μs | 14.70 μs | 15.14 μs | 14.79 μs | 14.23 μs | 14.20 μs | 14.42 μs | 14.54 μs |
| N=16 stacked refinements | 93.06 μs | 91.59 μs | 93.39 μs | 89.65 μs | 92.41 μs | 90.18 μs | 88.34 μs | 86.33 μs | 88.51 μs | 85.98 μs |
| N=32 stacked refinements | 494.13 μs | 485.65 μs | 495.02 μs | 475.80 μs | 485.57 μs | 473.25 μs | 459.83 μs | 454.07 μs | 464.89 μs | 455.12 μs |

## 8. Many-inequality refinement worst case

*`Number & {n | n != 1 && n != 2 && ... && n != N}` — documented quadratic worst case (each conjunction step merges against the growing exclusion list)*

| Measurement | `caed343e` (2026-04-25) | `62c68940` (2026-04-25) | `d4d3df5f` (2026-04-25) | `53f65e0f` (2026-04-25) | `dacdb682` (2026-04-25) | `07853a75` (2026-04-25) | `bae472e8` (2026-04-25) | `7a67807c` (2026-04-25) | `7a67807c` (2026-04-25) | `966faea2` (2026-04-25) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| N= 10 (parse + simplify) | 29.02 μs | 29.05 μs | 29.07 μs | 27.29 μs | 29.40 μs | 28.34 μs | 28.48 μs | 27.56 μs | 27.12 μs | 27.36 μs |
| N= 50 (parse + simplify) | 185.46 μs | 186.18 μs | 189.09 μs | 186.21 μs | 204.41 μs | 184.54 μs | 175.54 μs | 170.46 μs | 175.72 μs | 173.19 μs |
| N=100 (parse + simplify) | 458.35 μs | 471.13 μs | 452.79 μs | 443.12 μs | 466.34 μs | 467.84 μs | 431.79 μs | 417.76 μs | 429.83 μs | 427.16 μs |

