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
| `3ac58715` | 2026-06-04 12:02:17 | typecheck: fold-true catchall detection runs in both DVALA_FOLD modes |
| `ff863d1a` | 2026-06-04 11:54:09 | typecheck: review fixups for non-exhaustive match PR |
| `10d95659` | 2026-06-04 11:04:30 | typecheck: require explicit catchall for non-trackable match scrutinees |
| `b9f7aefe` | 2026-06-04 08:17:47 | typecheck: close refinement Phase 2 — strict-by-default + polish sweep |
| `ab1db2be` | 2026-05-30 01:24:06 | remove: dissolve the @mojir/dvala umbrella package |
| `59cdcfc5` | 2026-05-29 12:14:30 | re-point: consumers move to @mojir/dvala-core-tooling + package config |
| `b5295b73` | 2026-05-28 20:54:57 | refactor: extract engine cluster into @mojir/dvala-engine (PR G) |
| `42231e60` | 2026-05-28 18:48:02 | refactor: sever runtime → parser via injected parseSource capability |
| `45441132` | 2026-05-28 18:17:04 | refactor: move typeGuards + getAssertionError + arity validator into dvala-types leaf |
| `70310733` | 2026-05-28 17:53:28 | refactor: move errors.ts + utils/debug/ into dvala-types leaf |

## 1. Pipeline: tokenize

*pure tokenize cost — `tokenize(source)` for each corpus program*

| Measurement | `3ac58715` (2026-06-04) | `ff863d1a` (2026-06-04) | `10d95659` (2026-06-04) | `b9f7aefe` (2026-06-04) | `ab1db2be` (2026-05-30) | `59cdcfc5` (2026-05-29) | `b5295b73` (2026-05-28) | `42231e60` (2026-05-28) | `45441132` (2026-05-28) | `70310733` (2026-05-28) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms |
| medium (untyped fold) | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms |
| typed (annotated arithmetic) | 0.010 ms | 0.010 ms | 0.010 ms | 0.009 ms | 0.010 ms | 0.010 ms | 0.010 ms | 0.010 ms | 0.009 ms | 0.010 ms |
| refinement-heavy (50 annotations) | 0.385 ms | 0.374 ms | 0.361 ms | 0.359 ms | 0.369 ms | 0.408 ms | 0.379 ms | 0.375 ms | 0.363 ms | 0.367 ms |
| effect-heavy (handler + perform) | 0.005 ms | 0.005 ms | 0.004 ms | 0.004 ms | 0.004 ms | 0.004 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms |
| eval-heavy (fib(15) recursion) | 0.007 ms | 0.007 ms | 0.007 ms | 0.006 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.006 ms | 0.007 ms |

## 2. Pipeline: parse (pre-tokenized)

*parser cost only — `parseTokenStream(pre-tokenized)` for each corpus program*

| Measurement | `3ac58715` (2026-06-04) | `ff863d1a` (2026-06-04) | `10d95659` (2026-06-04) | `b9f7aefe` (2026-06-04) | `ab1db2be` (2026-05-30) | `59cdcfc5` (2026-05-29) | `b5295b73` (2026-05-28) | `42231e60` (2026-05-28) | `45441132` (2026-05-28) | `70310733` (2026-05-28) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.000 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms |
| medium (untyped fold) | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.004 ms | 0.004 ms | 0.005 ms | 0.002 ms | 0.002 ms |
| typed (annotated arithmetic) | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.004 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.004 ms |
| refinement-heavy (50 annotations) | 0.080 ms | 0.079 ms | 0.076 ms | 0.077 ms | 0.078 ms | 0.089 ms | 0.085 ms | 0.086 ms | 0.080 ms | 0.087 ms |
| effect-heavy (handler + perform) | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.002 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms |
| eval-heavy (fib(15) recursion) | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms |

## 3. Pipeline: typecheck (cumulative — incl. tokenize + parse)

*`dvala.typecheck(source)` per program — full pipeline through the typechecker. Typecheck-only cost ≈ this − phase-tokenize − phase-parse.*

| Measurement | `3ac58715` (2026-06-04) | `ff863d1a` (2026-06-04) | `10d95659` (2026-06-04) | `b9f7aefe` (2026-06-04) | `ab1db2be` (2026-05-30) | `59cdcfc5` (2026-05-29) | `b5295b73` (2026-05-28) | `42231e60` (2026-05-28) | `45441132` (2026-05-28) | `70310733` (2026-05-28) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.055 ms | 0.054 ms | 0.051 ms | 0.051 ms | 0.053 ms | 0.060 ms | 0.010 ms | 0.006 ms | 0.006 ms | 0.005 ms |
| medium (untyped fold) | 0.064 ms | 0.062 ms | 0.063 ms | 0.059 ms | 0.060 ms | 0.166 ms | 0.138 ms | 0.035 ms | 0.031 ms | 0.032 ms |
| typed (annotated arithmetic) | 0.114 ms | 0.120 ms | 0.113 ms | 0.108 ms | 0.112 ms | 0.296 ms | 0.252 ms | 0.057 ms | 0.053 ms | 0.052 ms |
| refinement-heavy (50 annotations) | 5.295 ms | 5.484 ms | 5.082 ms | 4.953 ms | 5.030 ms | 258.062 ms | 266.578 ms | 5.231 ms | 5.246 ms | 5.323 ms |
| effect-heavy (handler + perform) | 0.055 ms | 0.056 ms | 0.053 ms | 0.053 ms | 0.055 ms | 0.138 ms | 0.105 ms | 0.021 ms | 0.022 ms | 0.021 ms |
| eval-heavy (fib(15) recursion) | 0.081 ms | 0.079 ms | 0.076 ms | 0.075 ms | 0.078 ms | 0.206 ms | 0.201 ms | 0.079 ms | 0.076 ms | 0.080 ms |

## 4. Pipeline: run (typecheck disabled)

*`dvala.run(source)` with typecheck disabled — captures tokenize + parse + evaluate. Evaluator-only cost ≈ this − phase-tokenize − phase-parse.*

| Measurement | `3ac58715` (2026-06-04) | `ff863d1a` (2026-06-04) | `10d95659` (2026-06-04) | `b9f7aefe` (2026-06-04) | `ab1db2be` (2026-05-30) | `59cdcfc5` (2026-05-29) | `b5295b73` (2026-05-28) | `42231e60` (2026-05-28) | `45441132` (2026-05-28) | `70310733` (2026-05-28) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms |
| medium (untyped fold) | 0.039 ms | 0.037 ms | 0.037 ms | 0.035 ms | 0.037 ms | 0.038 ms | 0.038 ms | 0.038 ms | 0.037 ms | 0.037 ms |
| typed (annotated arithmetic) | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.006 ms |
| refinement-heavy (50 annotations) | 0.076 ms | 0.075 ms | 0.069 ms | 0.072 ms | 0.070 ms | 0.070 ms | 0.079 ms | 0.071 ms | 0.067 ms | 0.065 ms |
| effect-heavy (handler + perform) | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms |
| eval-heavy (fib(15) recursion) | 4.582 ms | 4.579 ms | 4.615 ms | 4.442 ms | 4.493 ms | 4.631 ms | 4.588 ms | 4.617 ms | 4.481 ms | 4.368 ms |

## 5. Pipeline: end-to-end (full)

*`dvala.run(source)` — tokenize + parse + typecheck + evaluate. The number a user actually observes.*

| Measurement | `3ac58715` (2026-06-04) | `ff863d1a` (2026-06-04) | `10d95659` (2026-06-04) | `b9f7aefe` (2026-06-04) | `ab1db2be` (2026-05-30) | `59cdcfc5` (2026-05-29) | `b5295b73` (2026-05-28) | `42231e60` (2026-05-28) | `45441132` (2026-05-28) | `70310733` (2026-05-28) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.056 ms | 0.055 ms | 0.054 ms | 0.054 ms | 0.055 ms | 0.055 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms |
| medium (untyped fold) | 0.083 ms | 0.083 ms | 0.084 ms | 0.081 ms | 0.082 ms | 0.083 ms | 0.046 ms | 0.045 ms | 0.046 ms | 0.045 ms |
| typed (annotated arithmetic) | 0.083 ms | 0.081 ms | 0.059 ms | 0.077 ms | 0.080 ms | 0.082 ms | 0.028 ms | 0.027 ms | 0.026 ms | 0.028 ms |
| refinement-heavy (50 annotations) | 0.677 ms | 0.683 ms | 0.576 ms | 0.617 ms | 0.659 ms | 0.679 ms | 0.701 ms | 0.659 ms | 0.592 ms | 0.661 ms |
| effect-heavy (handler + perform) | 0.064 ms | 0.065 ms | 0.045 ms | 0.048 ms | 0.064 ms | 0.064 ms | 0.009 ms | 0.008 ms | 0.007 ms | 0.008 ms |
| eval-heavy (fib(15) recursion) | 4.682 ms | 4.679 ms | 4.562 ms | 4.520 ms | 4.531 ms | 4.667 ms | 4.674 ms | 4.769 ms | 4.601 ms | 4.496 ms |

## 6. Refinement subtype-check cost (per predicate shape)

*isolated subtype-check calls between source type and refinement target — no parse or typecheck overhead*

| Measurement | `3ac58715` (2026-06-04) | `ff863d1a` (2026-06-04) | `10d95659` (2026-06-04) | `b9f7aefe` (2026-06-04) | `ab1db2be` (2026-05-30) | `59cdcfc5` (2026-05-29) | `b5295b73` (2026-05-28) | `42231e60` (2026-05-28) | `45441132` (2026-05-28) | `70310733` (2026-05-28) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| interval target — Number → {n \| n > 0 && n < 100} | 0.22 μs | 0.23 μs | 0.21 μs | 0.22 μs | 0.06 μs | 0.27 μs | 0.27 μs | 0.27 μs | 0.27 μs | 0.27 μs |
| set target — :ok → {x \| :ok \| :error} | 0.10 μs | 0.10 μs | 0.09 μs | 0.10 μs | 0.10 μs | 0.35 μs | 0.36 μs | 0.36 μs | 0.35 μs | 0.35 μs |
| count target — String → {s \| count(s) > 0} | 0.28 μs | 0.29 μs | 0.25 μs | 0.27 μs | 0.04 μs | 0.17 μs | 0.18 μs | 0.18 μs | 0.17 μs | 0.17 μs |
| excludedSet — Number → {n \| !=0 && !=1 && !=-1} | 0.18 μs | 0.18 μs | 0.17 μs | 0.17 μs | 0.15 μs | 0.47 μs | 0.49 μs | 0.48 μs | 0.47 μs | 0.47 μs |
| literal source — 50 → {n \| n > 0 && n < 100} | 0.10 μs | 0.10 μs | 0.09 μs | 0.09 μs | 0.08 μs | 0.29 μs | 0.28 μs | 0.29 μs | 0.28 μs | 0.28 μs |

## 7. Stacked refinement simplify scaling

*simplifying N stacked refinements (`Base & {p1} & {p2} & ... & {pN}`) — empirically O(N²); regressions show as a worse exponent*

| Measurement | `3ac58715` (2026-06-04) | `ff863d1a` (2026-06-04) | `10d95659` (2026-06-04) | `b9f7aefe` (2026-06-04) | `ab1db2be` (2026-05-30) | `59cdcfc5` (2026-05-29) | `b5295b73` (2026-05-28) | `42231e60` (2026-05-28) | `45441132` (2026-05-28) | `70310733` (2026-05-28) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| N= 2 stacked refinements | 0.43 μs | 0.42 μs | 0.40 μs | 0.43 μs | 0.44 μs | 1.33 μs | 1.34 μs | 1.35 μs | 1.34 μs | 1.33 μs |
| N= 4 stacked refinements | 1.46 μs | 1.46 μs | 1.38 μs | 1.36 μs | 1.90 μs | 5.24 μs | 5.29 μs | 5.32 μs | 5.26 μs | 5.04 μs |
| N= 8 stacked refinements | 5.22 μs | 5.22 μs | 5.06 μs | 5.07 μs | 8.28 μs | 21.10 μs | 21.49 μs | 21.25 μs | 21.18 μs | 20.91 μs |
| N=16 stacked refinements | 28.66 μs | 28.63 μs | 27.74 μs | 27.15 μs | 49.88 μs | 113.32 μs | 116.31 μs | 115.34 μs | 114.39 μs | 113.62 μs |
| N=32 stacked refinements | 132.39 μs | 133.40 μs | 129.27 μs | 128.62 μs | 269.33 μs | 569.16 μs | 578.77 μs | 578.00 μs | 575.63 μs | 561.85 μs |

## 8. Many-inequality refinement worst case

*`Number & {n | n != 1 && n != 2 && ... && n != N}` — documented quadratic worst case (each conjunction step merges against the growing exclusion list)*

| Measurement | `3ac58715` (2026-06-04) | `ff863d1a` (2026-06-04) | `10d95659` (2026-06-04) | `b9f7aefe` (2026-06-04) | `ab1db2be` (2026-05-30) | `59cdcfc5` (2026-05-29) | `b5295b73` (2026-05-28) | `42231e60` (2026-05-28) | `45441132` (2026-05-28) | `70310733` (2026-05-28) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| N= 10 (parse + simplify) | 15.17 μs | 15.51 μs | 14.67 μs | 15.23 μs | 17.12 μs | 35.33 μs | 36.33 μs | 33.26 μs | 34.26 μs | 32.68 μs |
| N= 50 (parse + simplify) | 84.11 μs | 86.35 μs | 84.29 μs | 81.33 μs | 111.05 μs | 217.48 μs | 219.00 μs | 213.00 μs | 204.63 μs | 198.07 μs |
| N=100 (parse + simplify) | 182.39 μs | 187.42 μs | 175.78 μs | 177.24 μs | 284.22 μs | 525.34 μs | 532.03 μs | 509.55 μs | 501.18 μs | 485.00 μs |

