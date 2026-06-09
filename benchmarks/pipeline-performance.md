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
| `194f915f` | 2026-06-09 08:15:39 | refactor: migrate 9 core predicates from TS to predicates.dvala |
| `40ec5a00` | 2026-06-04 22:00:48 | parser: extend binary-op Call/And/Or/Qq source-map ranges to span the full expression |
| `c8ba0be4` | 2026-06-04 20:43:54 | vscode-dvala: code actions — insert-catchall quick-fix (LS Q4 #5a) |
| `34868b99` | 2026-06-04 14:28:15 | vscode-dvala: semantic tokens + inlay hints (Q4 lighter pair) |
| `3ac58715` | 2026-06-04 12:02:17 | typecheck: fold-true catchall detection runs in both DVALA_FOLD modes |
| `ff863d1a` | 2026-06-04 11:54:09 | typecheck: review fixups for non-exhaustive match PR |
| `10d95659` | 2026-06-04 11:04:30 | typecheck: require explicit catchall for non-trackable match scrutinees |
| `b9f7aefe` | 2026-06-04 08:17:47 | typecheck: close refinement Phase 2 — strict-by-default + polish sweep |
| `ab1db2be` | 2026-05-30 01:24:06 | remove: dissolve the @mojir/dvala umbrella package |
| `59cdcfc5` | 2026-05-29 12:14:30 | re-point: consumers move to @mojir/dvala-core-tooling + package config |

## 1. Pipeline: tokenize

*pure tokenize cost — `tokenize(source)` for each corpus program*

| Measurement | `194f915f` (2026-06-09) | `40ec5a00` (2026-06-04) | `c8ba0be4` (2026-06-04) | `34868b99` (2026-06-04) | `3ac58715` (2026-06-04) | `ff863d1a` (2026-06-04) | `10d95659` (2026-06-04) | `b9f7aefe` (2026-06-04) | `ab1db2be` (2026-05-30) | `59cdcfc5` (2026-05-29) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms |
| medium (untyped fold) | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms |
| typed (annotated arithmetic) | 0.010 ms | 0.010 ms | 0.010 ms | 0.010 ms | 0.010 ms | 0.010 ms | 0.010 ms | 0.009 ms | 0.010 ms | 0.010 ms |
| refinement-heavy (50 annotations) | 0.376 ms | 0.371 ms | 0.370 ms | 0.361 ms | 0.385 ms | 0.374 ms | 0.361 ms | 0.359 ms | 0.369 ms | 0.408 ms |
| effect-heavy (handler + perform) | 0.004 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.004 ms | 0.004 ms | 0.004 ms | 0.004 ms |
| eval-heavy (fib(15) recursion) | 0.006 ms | 0.007 ms | 0.006 ms | 0.006 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.006 ms | 0.007 ms | 0.007 ms |

## 2. Pipeline: parse (pre-tokenized)

*parser cost only — `parseTokenStream(pre-tokenized)` for each corpus program*

| Measurement | `194f915f` (2026-06-09) | `40ec5a00` (2026-06-04) | `c8ba0be4` (2026-06-04) | `34868b99` (2026-06-04) | `3ac58715` (2026-06-04) | `ff863d1a` (2026-06-04) | `10d95659` (2026-06-04) | `b9f7aefe` (2026-06-04) | `ab1db2be` (2026-05-30) | `59cdcfc5` (2026-05-29) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.000 ms | 0.001 ms |
| medium (untyped fold) | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.004 ms |
| typed (annotated arithmetic) | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.004 ms |
| refinement-heavy (50 annotations) | 0.070 ms | 0.080 ms | 0.080 ms | 0.077 ms | 0.080 ms | 0.079 ms | 0.076 ms | 0.077 ms | 0.078 ms | 0.089 ms |
| effect-heavy (handler + perform) | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.002 ms |
| eval-heavy (fib(15) recursion) | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.003 ms |

## 3. Pipeline: typecheck (cumulative — incl. tokenize + parse)

*`dvala.typecheck(source)` per program — full pipeline through the typechecker. Typecheck-only cost ≈ this − phase-tokenize − phase-parse.*

| Measurement | `194f915f` (2026-06-09) | `40ec5a00` (2026-06-04) | `c8ba0be4` (2026-06-04) | `34868b99` (2026-06-04) | `3ac58715` (2026-06-04) | `ff863d1a` (2026-06-04) | `10d95659` (2026-06-04) | `b9f7aefe` (2026-06-04) | `ab1db2be` (2026-05-30) | `59cdcfc5` (2026-05-29) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.057 ms | 0.053 ms | 0.054 ms | 0.052 ms | 0.055 ms | 0.054 ms | 0.051 ms | 0.051 ms | 0.053 ms | 0.060 ms |
| medium (untyped fold) | 0.065 ms | 0.061 ms | 0.062 ms | 0.060 ms | 0.064 ms | 0.062 ms | 0.063 ms | 0.059 ms | 0.060 ms | 0.166 ms |
| typed (annotated arithmetic) | 0.083 ms | 0.113 ms | 0.112 ms | 0.112 ms | 0.114 ms | 0.120 ms | 0.113 ms | 0.108 ms | 0.112 ms | 0.296 ms |
| refinement-heavy (50 annotations) | 3.794 ms | 5.193 ms | 5.103 ms | 5.302 ms | 5.295 ms | 5.484 ms | 5.082 ms | 4.953 ms | 5.030 ms | 258.062 ms |
| effect-heavy (handler + perform) | 0.059 ms | 0.059 ms | 0.055 ms | 0.053 ms | 0.055 ms | 0.056 ms | 0.053 ms | 0.053 ms | 0.055 ms | 0.138 ms |
| eval-heavy (fib(15) recursion) | 0.074 ms | 0.082 ms | 0.079 ms | 0.077 ms | 0.081 ms | 0.079 ms | 0.076 ms | 0.075 ms | 0.078 ms | 0.206 ms |

## 4. Pipeline: run (typecheck disabled)

*`dvala.run(source)` with typecheck disabled — captures tokenize + parse + evaluate. Evaluator-only cost ≈ this − phase-tokenize − phase-parse.*

| Measurement | `194f915f` (2026-06-09) | `40ec5a00` (2026-06-04) | `c8ba0be4` (2026-06-04) | `34868b99` (2026-06-04) | `3ac58715` (2026-06-04) | `ff863d1a` (2026-06-04) | `10d95659` (2026-06-04) | `b9f7aefe` (2026-06-04) | `ab1db2be` (2026-05-30) | `59cdcfc5` (2026-05-29) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.002 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms |
| medium (untyped fold) | 0.034 ms | 0.037 ms | 0.038 ms | 0.035 ms | 0.039 ms | 0.037 ms | 0.037 ms | 0.035 ms | 0.037 ms | 0.038 ms |
| typed (annotated arithmetic) | 0.005 ms | 0.007 ms | 0.006 ms | 0.006 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms |
| refinement-heavy (50 annotations) | 0.083 ms | 0.072 ms | 0.070 ms | 0.073 ms | 0.076 ms | 0.075 ms | 0.069 ms | 0.072 ms | 0.070 ms | 0.070 ms |
| effect-heavy (handler + perform) | 0.002 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms |
| eval-heavy (fib(15) recursion) | 3.991 ms | 4.642 ms | 4.612 ms | 4.408 ms | 4.582 ms | 4.579 ms | 4.615 ms | 4.442 ms | 4.493 ms | 4.631 ms |

## 5. Pipeline: end-to-end (full)

*`dvala.run(source)` — tokenize + parse + typecheck + evaluate. The number a user actually observes.*

| Measurement | `194f915f` (2026-06-09) | `40ec5a00` (2026-06-04) | `c8ba0be4` (2026-06-04) | `34868b99` (2026-06-04) | `3ac58715` (2026-06-04) | `ff863d1a` (2026-06-04) | `10d95659` (2026-06-04) | `b9f7aefe` (2026-06-04) | `ab1db2be` (2026-05-30) | `59cdcfc5` (2026-05-29) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.058 ms | 0.056 ms | 0.055 ms | 0.055 ms | 0.056 ms | 0.055 ms | 0.054 ms | 0.054 ms | 0.055 ms | 0.055 ms |
| medium (untyped fold) | 0.079 ms | 0.082 ms | 0.082 ms | 0.081 ms | 0.083 ms | 0.083 ms | 0.084 ms | 0.081 ms | 0.082 ms | 0.083 ms |
| typed (annotated arithmetic) | 0.064 ms | 0.059 ms | 0.059 ms | 0.059 ms | 0.083 ms | 0.081 ms | 0.059 ms | 0.077 ms | 0.080 ms | 0.082 ms |
| refinement-heavy (50 annotations) | 0.621 ms | 0.593 ms | 0.574 ms | 0.601 ms | 0.677 ms | 0.683 ms | 0.576 ms | 0.617 ms | 0.659 ms | 0.679 ms |
| effect-heavy (handler + perform) | 0.046 ms | 0.045 ms | 0.045 ms | 0.046 ms | 0.064 ms | 0.065 ms | 0.045 ms | 0.048 ms | 0.064 ms | 0.064 ms |
| eval-heavy (fib(15) recursion) | 4.057 ms | 4.696 ms | 4.786 ms | 4.499 ms | 4.682 ms | 4.679 ms | 4.562 ms | 4.520 ms | 4.531 ms | 4.667 ms |

## 6. Refinement subtype-check cost (per predicate shape)

*isolated subtype-check calls between source type and refinement target — no parse or typecheck overhead*

| Measurement | `194f915f` (2026-06-09) | `40ec5a00` (2026-06-04) | `c8ba0be4` (2026-06-04) | `34868b99` (2026-06-04) | `3ac58715` (2026-06-04) | `ff863d1a` (2026-06-04) | `10d95659` (2026-06-04) | `b9f7aefe` (2026-06-04) | `ab1db2be` (2026-05-30) | `59cdcfc5` (2026-05-29) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| interval target — Number → {n \| n > 0 && n < 100} | 0.21 μs | 0.23 μs | 0.25 μs | 0.22 μs | 0.22 μs | 0.23 μs | 0.21 μs | 0.22 μs | 0.06 μs | 0.27 μs |
| set target — :ok → {x \| :ok \| :error} | 0.09 μs | 0.10 μs | 0.11 μs | 0.10 μs | 0.10 μs | 0.10 μs | 0.09 μs | 0.10 μs | 0.10 μs | 0.35 μs |
| count target — String → {s \| count(s) > 0} | 0.23 μs | 0.24 μs | 0.25 μs | 0.28 μs | 0.28 μs | 0.29 μs | 0.25 μs | 0.27 μs | 0.04 μs | 0.17 μs |
| excludedSet — Number → {n \| !=0 && !=1 && !=-1} | 0.15 μs | 0.18 μs | 0.18 μs | 0.18 μs | 0.18 μs | 0.18 μs | 0.17 μs | 0.17 μs | 0.15 μs | 0.47 μs |
| literal source — 50 → {n \| n > 0 && n < 100} | 0.09 μs | 0.10 μs | 0.10 μs | 0.11 μs | 0.10 μs | 0.10 μs | 0.09 μs | 0.09 μs | 0.08 μs | 0.29 μs |

## 7. Stacked refinement simplify scaling

*simplifying N stacked refinements (`Base & {p1} & {p2} & ... & {pN}`) — empirically O(N²); regressions show as a worse exponent*

| Measurement | `194f915f` (2026-06-09) | `40ec5a00` (2026-06-04) | `c8ba0be4` (2026-06-04) | `34868b99` (2026-06-04) | `3ac58715` (2026-06-04) | `ff863d1a` (2026-06-04) | `10d95659` (2026-06-04) | `b9f7aefe` (2026-06-04) | `ab1db2be` (2026-05-30) | `59cdcfc5` (2026-05-29) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| N= 2 stacked refinements | 0.59 μs | 0.43 μs | 0.42 μs | 0.45 μs | 0.43 μs | 0.42 μs | 0.40 μs | 0.43 μs | 0.44 μs | 1.33 μs |
| N= 4 stacked refinements | 1.40 μs | 1.43 μs | 1.50 μs | 1.43 μs | 1.46 μs | 1.46 μs | 1.38 μs | 1.36 μs | 1.90 μs | 5.24 μs |
| N= 8 stacked refinements | 5.05 μs | 5.22 μs | 5.29 μs | 5.07 μs | 5.22 μs | 5.22 μs | 5.06 μs | 5.07 μs | 8.28 μs | 21.10 μs |
| N=16 stacked refinements | 27.82 μs | 28.55 μs | 30.02 μs | 28.57 μs | 28.66 μs | 28.63 μs | 27.74 μs | 27.15 μs | 49.88 μs | 113.32 μs |
| N=32 stacked refinements | 128.33 μs | 135.29 μs | 138.40 μs | 130.08 μs | 132.39 μs | 133.40 μs | 129.27 μs | 128.62 μs | 269.33 μs | 569.16 μs |

## 8. Many-inequality refinement worst case

*`Number & {n | n != 1 && n != 2 && ... && n != N}` — documented quadratic worst case (each conjunction step merges against the growing exclusion list)*

| Measurement | `194f915f` (2026-06-09) | `40ec5a00` (2026-06-04) | `c8ba0be4` (2026-06-04) | `34868b99` (2026-06-04) | `3ac58715` (2026-06-04) | `ff863d1a` (2026-06-04) | `10d95659` (2026-06-04) | `b9f7aefe` (2026-06-04) | `ab1db2be` (2026-05-30) | `59cdcfc5` (2026-05-29) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| N= 10 (parse + simplify) | 15.09 μs | 16.54 μs | 18.08 μs | 15.80 μs | 15.17 μs | 15.51 μs | 14.67 μs | 15.23 μs | 17.12 μs | 35.33 μs |
| N= 50 (parse + simplify) | 80.91 μs | 83.64 μs | 85.59 μs | 84.90 μs | 84.11 μs | 86.35 μs | 84.29 μs | 81.33 μs | 111.05 μs | 217.48 μs |
| N=100 (parse + simplify) | 172.83 μs | 187.37 μs | 185.91 μs | 186.99 μs | 182.39 μs | 187.42 μs | 175.78 μs | 177.24 μs | 284.22 μs | 525.34 μs |

