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
| `ab1db2be` | 2026-05-30 01:24:06 | remove: dissolve the @mojir/dvala umbrella package |
| `59cdcfc5` | 2026-05-29 12:14:30 | re-point: consumers move to @mojir/dvala-core-tooling + package config |
| `b5295b73` | 2026-05-28 20:54:57 | refactor: extract engine cluster into @mojir/dvala-engine (PR G) |
| `42231e60` | 2026-05-28 18:48:02 | refactor: sever runtime → parser via injected parseSource capability |
| `45441132` | 2026-05-28 18:17:04 | refactor: move typeGuards + getAssertionError + arity validator into dvala-types leaf |
| `70310733` | 2026-05-28 17:53:28 | refactor: move errors.ts + utils/debug/ into dvala-types leaf |
| `8cda5a15` | 2026-05-28 17:14:03 | refactor: relocate CallStackEntry type to dvala-types leaf |
| `476a5eef` | 2026-05-27 21:23:08 | refactor: move the value/AST vocabulary into the dvala-types leaf |
| `90571f50` | 2026-05-27 20:36:54 | refactor: move utils/persistent into the dvala-types leaf |
| `90571f50` | 2026-05-27 20:35:20 | refactor: move utils/persistent into the dvala-types leaf |

## 1. Pipeline: tokenize

*pure tokenize cost — `tokenize(source)` for each corpus program*

| Measurement | `ab1db2be` (2026-05-30) | `59cdcfc5` (2026-05-29) | `b5295b73` (2026-05-28) | `42231e60` (2026-05-28) | `45441132` (2026-05-28) | `70310733` (2026-05-28) | `8cda5a15` (2026-05-28) | `476a5eef` (2026-05-27) | `90571f50` (2026-05-27) | `90571f50` (2026-05-27) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms |
| medium (untyped fold) | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms |
| typed (annotated arithmetic) | 0.010 ms | 0.010 ms | 0.010 ms | 0.010 ms | 0.009 ms | 0.010 ms | 0.009 ms | 0.010 ms | 0.009 ms | 0.009 ms |
| refinement-heavy (50 annotations) | 0.369 ms | 0.408 ms | 0.379 ms | 0.375 ms | 0.363 ms | 0.367 ms | 0.371 ms | 0.372 ms | 0.360 ms | 0.365 ms |
| effect-heavy (handler + perform) | 0.004 ms | 0.004 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.004 ms | 0.005 ms | 0.004 ms | 0.004 ms |
| eval-heavy (fib(15) recursion) | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.006 ms | 0.007 ms | 0.006 ms | 0.007 ms | 0.006 ms | 0.006 ms |

## 2. Pipeline: parse (pre-tokenized)

*parser cost only — `parseTokenStream(pre-tokenized)` for each corpus program*

| Measurement | `ab1db2be` (2026-05-30) | `59cdcfc5` (2026-05-29) | `b5295b73` (2026-05-28) | `42231e60` (2026-05-28) | `45441132` (2026-05-28) | `70310733` (2026-05-28) | `8cda5a15` (2026-05-28) | `476a5eef` (2026-05-27) | `90571f50` (2026-05-27) | `90571f50` (2026-05-27) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.000 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.000 ms | 0.001 ms | 0.000 ms | 0.001 ms |
| medium (untyped fold) | 0.002 ms | 0.004 ms | 0.004 ms | 0.005 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms |
| typed (annotated arithmetic) | 0.002 ms | 0.004 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.004 ms | 0.002 ms | 0.003 ms | 0.002 ms | 0.003 ms |
| refinement-heavy (50 annotations) | 0.078 ms | 0.089 ms | 0.085 ms | 0.086 ms | 0.080 ms | 0.087 ms | 0.081 ms | 0.081 ms | 0.080 ms | 0.079 ms |
| effect-heavy (handler + perform) | 0.001 ms | 0.002 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.002 ms |
| eval-heavy (fib(15) recursion) | 0.002 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.002 ms | 0.003 ms | 0.002 ms | 0.003 ms |

## 3. Pipeline: typecheck (cumulative — incl. tokenize + parse)

*`dvala.typecheck(source)` per program — full pipeline through the typechecker. Typecheck-only cost ≈ this − phase-tokenize − phase-parse.*

| Measurement | `ab1db2be` (2026-05-30) | `59cdcfc5` (2026-05-29) | `b5295b73` (2026-05-28) | `42231e60` (2026-05-28) | `45441132` (2026-05-28) | `70310733` (2026-05-28) | `8cda5a15` (2026-05-28) | `476a5eef` (2026-05-27) | `90571f50` (2026-05-27) | `90571f50` (2026-05-27) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.053 ms | 0.060 ms | 0.010 ms | 0.006 ms | 0.006 ms | 0.005 ms | 0.006 ms | 0.005 ms | 0.006 ms | 0.005 ms |
| medium (untyped fold) | 0.060 ms | 0.166 ms | 0.138 ms | 0.035 ms | 0.031 ms | 0.032 ms | 0.031 ms | 0.031 ms | 0.031 ms | 0.031 ms |
| typed (annotated arithmetic) | 0.112 ms | 0.296 ms | 0.252 ms | 0.057 ms | 0.053 ms | 0.052 ms | 0.054 ms | 0.053 ms | 0.052 ms | 0.055 ms |
| refinement-heavy (50 annotations) | 5.030 ms | 258.062 ms | 266.578 ms | 5.231 ms | 5.246 ms | 5.323 ms | 5.005 ms | 5.282 ms | 5.152 ms | 5.305 ms |
| effect-heavy (handler + perform) | 0.055 ms | 0.138 ms | 0.105 ms | 0.021 ms | 0.022 ms | 0.021 ms | 0.019 ms | 0.020 ms | 0.020 ms | 0.022 ms |
| eval-heavy (fib(15) recursion) | 0.078 ms | 0.206 ms | 0.201 ms | 0.079 ms | 0.076 ms | 0.080 ms | 0.079 ms | 0.079 ms | 0.073 ms | 0.078 ms |

## 4. Pipeline: run (typecheck disabled)

*`dvala.run(source)` with typecheck disabled — captures tokenize + parse + evaluate. Evaluator-only cost ≈ this − phase-tokenize − phase-parse.*

| Measurement | `ab1db2be` (2026-05-30) | `59cdcfc5` (2026-05-29) | `b5295b73` (2026-05-28) | `42231e60` (2026-05-28) | `45441132` (2026-05-28) | `70310733` (2026-05-28) | `8cda5a15` (2026-05-28) | `476a5eef` (2026-05-27) | `90571f50` (2026-05-27) | `90571f50` (2026-05-27) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms |
| medium (untyped fold) | 0.037 ms | 0.038 ms | 0.038 ms | 0.038 ms | 0.037 ms | 0.037 ms | 0.036 ms | 0.035 ms | 0.036 ms | 0.036 ms |
| typed (annotated arithmetic) | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.006 ms | 0.007 ms | 0.007 ms | 0.006 ms | 0.007 ms |
| refinement-heavy (50 annotations) | 0.070 ms | 0.070 ms | 0.079 ms | 0.071 ms | 0.067 ms | 0.065 ms | 0.071 ms | 0.072 ms | 0.064 ms | 0.064 ms |
| effect-heavy (handler + perform) | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms |
| eval-heavy (fib(15) recursion) | 4.493 ms | 4.631 ms | 4.588 ms | 4.617 ms | 4.481 ms | 4.368 ms | 4.462 ms | 4.403 ms | 4.391 ms | 4.420 ms |

## 5. Pipeline: end-to-end (full)

*`dvala.run(source)` — tokenize + parse + typecheck + evaluate. The number a user actually observes.*

| Measurement | `ab1db2be` (2026-05-30) | `59cdcfc5` (2026-05-29) | `b5295b73` (2026-05-28) | `42231e60` (2026-05-28) | `45441132` (2026-05-28) | `70310733` (2026-05-28) | `8cda5a15` (2026-05-28) | `476a5eef` (2026-05-27) | `90571f50` (2026-05-27) | `90571f50` (2026-05-27) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.055 ms | 0.055 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms |
| medium (untyped fold) | 0.082 ms | 0.083 ms | 0.046 ms | 0.045 ms | 0.046 ms | 0.045 ms | 0.043 ms | 0.043 ms | 0.042 ms | 0.043 ms |
| typed (annotated arithmetic) | 0.080 ms | 0.082 ms | 0.028 ms | 0.027 ms | 0.026 ms | 0.028 ms | 0.026 ms | 0.028 ms | 0.025 ms | 0.027 ms |
| refinement-heavy (50 annotations) | 0.659 ms | 0.679 ms | 0.701 ms | 0.659 ms | 0.592 ms | 0.661 ms | 0.602 ms | 0.659 ms | 0.562 ms | 0.659 ms |
| effect-heavy (handler + perform) | 0.064 ms | 0.064 ms | 0.009 ms | 0.008 ms | 0.007 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.007 ms | 0.009 ms |
| eval-heavy (fib(15) recursion) | 4.531 ms | 4.667 ms | 4.674 ms | 4.769 ms | 4.601 ms | 4.496 ms | 4.480 ms | 4.535 ms | 4.405 ms | 4.545 ms |

## 6. Refinement subtype-check cost (per predicate shape)

*isolated subtype-check calls between source type and refinement target — no parse or typecheck overhead*

| Measurement | `ab1db2be` (2026-05-30) | `59cdcfc5` (2026-05-29) | `b5295b73` (2026-05-28) | `42231e60` (2026-05-28) | `45441132` (2026-05-28) | `70310733` (2026-05-28) | `8cda5a15` (2026-05-28) | `476a5eef` (2026-05-27) | `90571f50` (2026-05-27) | `90571f50` (2026-05-27) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| interval target — Number → {n \| n > 0 && n < 100} | 0.06 μs | 0.27 μs | 0.27 μs | 0.27 μs | 0.27 μs | 0.27 μs | 0.26 μs | 0.27 μs | 0.17 μs | 0.17 μs |
| set target — :ok → {x \| :ok \| :error} | 0.10 μs | 0.35 μs | 0.36 μs | 0.36 μs | 0.35 μs | 0.35 μs | 0.34 μs | 0.35 μs | 0.22 μs | 0.22 μs |
| count target — String → {s \| count(s) > 0} | 0.04 μs | 0.17 μs | 0.18 μs | 0.18 μs | 0.17 μs | 0.17 μs | 0.17 μs | 0.17 μs | 0.11 μs | 0.11 μs |
| excludedSet — Number → {n \| !=0 && !=1 && !=-1} | 0.15 μs | 0.47 μs | 0.49 μs | 0.48 μs | 0.47 μs | 0.47 μs | 0.46 μs | 0.47 μs | 0.33 μs | 0.33 μs |
| literal source — 50 → {n \| n > 0 && n < 100} | 0.08 μs | 0.29 μs | 0.28 μs | 0.29 μs | 0.28 μs | 0.28 μs | 0.28 μs | 0.28 μs | 0.19 μs | 0.18 μs |

## 7. Stacked refinement simplify scaling

*simplifying N stacked refinements (`Base & {p1} & {p2} & ... & {pN}`) — empirically O(N²); regressions show as a worse exponent*

| Measurement | `ab1db2be` (2026-05-30) | `59cdcfc5` (2026-05-29) | `b5295b73` (2026-05-28) | `42231e60` (2026-05-28) | `45441132` (2026-05-28) | `70310733` (2026-05-28) | `8cda5a15` (2026-05-28) | `476a5eef` (2026-05-27) | `90571f50` (2026-05-27) | `90571f50` (2026-05-27) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| N= 2 stacked refinements | 0.44 μs | 1.33 μs | 1.34 μs | 1.35 μs | 1.34 μs | 1.33 μs | 1.30 μs | 1.33 μs | 0.99 μs | 0.98 μs |
| N= 4 stacked refinements | 1.90 μs | 5.24 μs | 5.29 μs | 5.32 μs | 5.26 μs | 5.04 μs | 5.11 μs | 5.16 μs | 4.20 μs | 4.12 μs |
| N= 8 stacked refinements | 8.28 μs | 21.10 μs | 21.49 μs | 21.25 μs | 21.18 μs | 20.91 μs | 20.56 μs | 20.88 μs | 17.51 μs | 17.04 μs |
| N=16 stacked refinements | 49.88 μs | 113.32 μs | 116.31 μs | 115.34 μs | 114.39 μs | 113.62 μs | 110.46 μs | 111.83 μs | 99.20 μs | 97.69 μs |
| N=32 stacked refinements | 269.33 μs | 569.16 μs | 578.77 μs | 578.00 μs | 575.63 μs | 561.85 μs | 547.22 μs | 561.00 μs | 511.75 μs | 501.77 μs |

## 8. Many-inequality refinement worst case

*`Number & {n | n != 1 && n != 2 && ... && n != N}` — documented quadratic worst case (each conjunction step merges against the growing exclusion list)*

| Measurement | `ab1db2be` (2026-05-30) | `59cdcfc5` (2026-05-29) | `b5295b73` (2026-05-28) | `42231e60` (2026-05-28) | `45441132` (2026-05-28) | `70310733` (2026-05-28) | `8cda5a15` (2026-05-28) | `476a5eef` (2026-05-27) | `90571f50` (2026-05-27) | `90571f50` (2026-05-27) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| N= 10 (parse + simplify) | 17.12 μs | 35.33 μs | 36.33 μs | 33.26 μs | 34.26 μs | 32.68 μs | 37.60 μs | 31.94 μs | 29.56 μs | 29.39 μs |
| N= 50 (parse + simplify) | 111.05 μs | 217.48 μs | 219.00 μs | 213.00 μs | 204.63 μs | 198.07 μs | 195.72 μs | 198.06 μs | 184.01 μs | 183.92 μs |
| N=100 (parse + simplify) | 284.22 μs | 525.34 μs | 532.03 μs | 509.55 μs | 501.18 μs | 485.00 μs | 470.31 μs | 483.71 μs | 457.80 μs | 453.05 μs |

