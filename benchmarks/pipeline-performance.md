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
| `476a5eef` | 2026-05-27 21:23:08 | refactor: move the value/AST vocabulary into the dvala-types leaf |
| `90571f50` | 2026-05-27 20:36:54 | refactor: move utils/persistent into the dvala-types leaf |
| `90571f50` | 2026-05-27 20:35:20 | refactor: move utils/persistent into the dvala-types leaf |
| `dd6cfd53` | 2026-05-26 21:05:06 | refactor: extract standaloneTooling.ts to structurally decouple minimal bundle from tooling bundle |
| `9a6c955a` | 2026-05-26 14:31:12 | refactor: address code-review findings — facade cleanup and import ordering |
| `4b3374b0` | 2026-05-26 13:07:49 | fix: remove initReferenceData from minimal bundle entry point to prevent empty dist/index.js |
| `585579cb` | 2026-05-26 12:06:31 | refactor: route playground-www deep src/ imports through proper boundaries |
| `18b49784` | 2026-05-26 11:56:28 | refactor: route js-interop deep src/ imports through src/index.ts |
| `09bdfa87` | 2026-05-22 21:32:42 | refactor: route cross-package src/ imports through dvala-core-tooling boundary |
| `88a2acd5` | 2026-05-22 17:58:21 | fix: remove src/backend/ shims and fix test-file exclusions |

## 1. Pipeline: tokenize

*pure tokenize cost — `tokenize(source)` for each corpus program*

| Measurement | `476a5eef` (2026-05-27) | `90571f50` (2026-05-27) | `90571f50` (2026-05-27) | `dd6cfd53` (2026-05-26) | `9a6c955a` (2026-05-26) | `4b3374b0` (2026-05-26) | `585579cb` (2026-05-26) | `18b49784` (2026-05-26) | `09bdfa87` (2026-05-22) | `88a2acd5` (2026-05-22) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms |
| medium (untyped fold) | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms |
| typed (annotated arithmetic) | 0.010 ms | 0.009 ms | 0.009 ms | 0.010 ms | 0.009 ms | 0.010 ms | 0.010 ms | 0.010 ms | 0.010 ms | 0.010 ms |
| refinement-heavy (50 annotations) | 0.372 ms | 0.360 ms | 0.365 ms | 0.375 ms | 0.370 ms | 0.375 ms | 0.371 ms | 0.360 ms | 0.369 ms | 0.371 ms |
| effect-heavy (handler + perform) | 0.005 ms | 0.004 ms | 0.004 ms | 0.004 ms | 0.005 ms | 0.004 ms | 0.005 ms | 0.005 ms | 0.004 ms | 0.004 ms |
| eval-heavy (fib(15) recursion) | 0.007 ms | 0.006 ms | 0.006 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.006 ms | 0.006 ms | 0.007 ms |

## 2. Pipeline: parse (pre-tokenized)

*parser cost only — `parseTokenStream(pre-tokenized)` for each corpus program*

| Measurement | `476a5eef` (2026-05-27) | `90571f50` (2026-05-27) | `90571f50` (2026-05-27) | `dd6cfd53` (2026-05-26) | `9a6c955a` (2026-05-26) | `4b3374b0` (2026-05-26) | `585579cb` (2026-05-26) | `18b49784` (2026-05-26) | `09bdfa87` (2026-05-22) | `88a2acd5` (2026-05-22) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.001 ms | 0.000 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms |
| medium (untyped fold) | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.003 ms | 0.002 ms | 0.003 ms | 0.002 ms |
| typed (annotated arithmetic) | 0.003 ms | 0.002 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.002 ms | 0.002 ms |
| refinement-heavy (50 annotations) | 0.081 ms | 0.080 ms | 0.079 ms | 0.081 ms | 0.087 ms | 0.090 ms | 0.088 ms | 0.079 ms | 0.089 ms | 0.081 ms |
| effect-heavy (handler + perform) | 0.001 ms | 0.001 ms | 0.002 ms | 0.002 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.002 ms | 0.001 ms | 0.001 ms |
| eval-heavy (fib(15) recursion) | 0.003 ms | 0.002 ms | 0.003 ms | 0.002 ms | 0.002 ms | 0.003 ms | 0.003 ms | 0.002 ms | 0.002 ms | 0.002 ms |

## 3. Pipeline: typecheck (cumulative — incl. tokenize + parse)

*`dvala.typecheck(source)` per program — full pipeline through the typechecker. Typecheck-only cost ≈ this − phase-tokenize − phase-parse.*

| Measurement | `476a5eef` (2026-05-27) | `90571f50` (2026-05-27) | `90571f50` (2026-05-27) | `dd6cfd53` (2026-05-26) | `9a6c955a` (2026-05-26) | `4b3374b0` (2026-05-26) | `585579cb` (2026-05-26) | `18b49784` (2026-05-26) | `09bdfa87` (2026-05-22) | `88a2acd5` (2026-05-22) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.005 ms | 0.006 ms | 0.005 ms | 0.005 ms | 0.006 ms | 0.006 ms | 0.007 ms | 0.006 ms | 0.007 ms | 0.007 ms |
| medium (untyped fold) | 0.031 ms | 0.031 ms | 0.031 ms | 0.031 ms | 0.033 ms | 0.033 ms | 0.032 ms | 0.034 ms | 0.031 ms | 0.032 ms |
| typed (annotated arithmetic) | 0.053 ms | 0.052 ms | 0.055 ms | 0.053 ms | 0.052 ms | 0.052 ms | 0.053 ms | 0.053 ms | 0.051 ms | 0.056 ms |
| refinement-heavy (50 annotations) | 5.282 ms | 5.152 ms | 5.305 ms | 5.730 ms | 5.322 ms | 5.297 ms | 5.276 ms | 5.395 ms | 5.370 ms | 5.247 ms |
| effect-heavy (handler + perform) | 0.020 ms | 0.020 ms | 0.022 ms | 0.019 ms | 0.021 ms | 0.022 ms | 0.021 ms | 0.021 ms | 0.022 ms | 0.025 ms |
| eval-heavy (fib(15) recursion) | 0.079 ms | 0.073 ms | 0.078 ms | 0.076 ms | 0.077 ms | 0.077 ms | 0.076 ms | 0.079 ms | 0.074 ms | 0.074 ms |

## 4. Pipeline: run (typecheck disabled)

*`dvala.run(source)` with typecheck disabled — captures tokenize + parse + evaluate. Evaluator-only cost ≈ this − phase-tokenize − phase-parse.*

| Measurement | `476a5eef` (2026-05-27) | `90571f50` (2026-05-27) | `90571f50` (2026-05-27) | `dd6cfd53` (2026-05-26) | `9a6c955a` (2026-05-26) | `4b3374b0` (2026-05-26) | `585579cb` (2026-05-26) | `18b49784` (2026-05-26) | `09bdfa87` (2026-05-22) | `88a2acd5` (2026-05-22) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms |
| medium (untyped fold) | 0.035 ms | 0.036 ms | 0.036 ms | 0.036 ms | 0.037 ms | 0.036 ms | 0.037 ms | 0.036 ms | 0.036 ms | 0.036 ms |
| typed (annotated arithmetic) | 0.007 ms | 0.006 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.006 ms | 0.006 ms | 0.007 ms | 0.007 ms | 0.007 ms |
| refinement-heavy (50 annotations) | 0.072 ms | 0.064 ms | 0.064 ms | 0.063 ms | 0.067 ms | 0.077 ms | 0.065 ms | 0.073 ms | 0.062 ms | 0.066 ms |
| effect-heavy (handler + perform) | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms |
| eval-heavy (fib(15) recursion) | 4.403 ms | 4.391 ms | 4.420 ms | 4.453 ms | 4.633 ms | 4.377 ms | 4.439 ms | 4.348 ms | 4.297 ms | 4.437 ms |

## 5. Pipeline: end-to-end (full)

*`dvala.run(source)` — tokenize + parse + typecheck + evaluate. The number a user actually observes.*

| Measurement | `476a5eef` (2026-05-27) | `90571f50` (2026-05-27) | `90571f50` (2026-05-27) | `dd6cfd53` (2026-05-26) | `9a6c955a` (2026-05-26) | `4b3374b0` (2026-05-26) | `585579cb` (2026-05-26) | `18b49784` (2026-05-26) | `09bdfa87` (2026-05-22) | `88a2acd5` (2026-05-22) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms |
| medium (untyped fold) | 0.043 ms | 0.042 ms | 0.043 ms | 0.045 ms | 0.043 ms | 0.043 ms | 0.044 ms | 0.043 ms | 0.043 ms | 0.045 ms |
| typed (annotated arithmetic) | 0.028 ms | 0.025 ms | 0.027 ms | 0.027 ms | 0.025 ms | 0.027 ms | 0.027 ms | 0.025 ms | 0.027 ms | 0.026 ms |
| refinement-heavy (50 annotations) | 0.659 ms | 0.562 ms | 0.659 ms | 0.683 ms | 0.578 ms | 0.660 ms | 0.671 ms | 0.582 ms | 0.594 ms | 0.607 ms |
| effect-heavy (handler + perform) | 0.008 ms | 0.007 ms | 0.009 ms | 0.009 ms | 0.007 ms | 0.009 ms | 0.008 ms | 0.007 ms | 0.007 ms | 0.007 ms |
| eval-heavy (fib(15) recursion) | 4.535 ms | 4.405 ms | 4.545 ms | 4.500 ms | 4.563 ms | 4.477 ms | 4.497 ms | 4.492 ms | 4.452 ms | 4.479 ms |

## 6. Refinement subtype-check cost (per predicate shape)

*isolated subtype-check calls between source type and refinement target — no parse or typecheck overhead*

| Measurement | `476a5eef` (2026-05-27) | `90571f50` (2026-05-27) | `90571f50` (2026-05-27) | `dd6cfd53` (2026-05-26) | `9a6c955a` (2026-05-26) | `4b3374b0` (2026-05-26) | `585579cb` (2026-05-26) | `18b49784` (2026-05-26) | `09bdfa87` (2026-05-22) | `88a2acd5` (2026-05-22) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| interval target — Number → {n \| n > 0 && n < 100} | 0.27 μs | 0.17 μs | 0.17 μs | 0.09 μs | 0.09 μs | 0.10 μs | 0.09 μs | 0.10 μs | 0.09 μs | 0.10 μs |
| set target — :ok → {x \| :ok \| :error} | 0.35 μs | 0.22 μs | 0.22 μs | 0.13 μs | 0.13 μs | 0.12 μs | 0.12 μs | 0.12 μs | 0.12 μs | 0.12 μs |
| count target — String → {s \| count(s) > 0} | 0.17 μs | 0.11 μs | 0.11 μs | 0.06 μs | 0.05 μs | 0.06 μs | 0.06 μs | 0.06 μs | 0.05 μs | 0.06 μs |
| excludedSet — Number → {n \| !=0 && !=1 && !=-1} | 0.47 μs | 0.33 μs | 0.33 μs | 0.21 μs | 0.22 μs | 0.21 μs | 0.21 μs | 0.21 μs | 0.20 μs | 0.21 μs |
| literal source — 50 → {n \| n > 0 && n < 100} | 0.28 μs | 0.19 μs | 0.18 μs | 0.10 μs | 0.11 μs | 0.11 μs | 0.11 μs | 0.10 μs | 0.10 μs | 0.10 μs |

## 7. Stacked refinement simplify scaling

*simplifying N stacked refinements (`Base & {p1} & {p2} & ... & {pN}`) — empirically O(N²); regressions show as a worse exponent*

| Measurement | `476a5eef` (2026-05-27) | `90571f50` (2026-05-27) | `90571f50` (2026-05-27) | `dd6cfd53` (2026-05-26) | `9a6c955a` (2026-05-26) | `4b3374b0` (2026-05-26) | `585579cb` (2026-05-26) | `18b49784` (2026-05-26) | `09bdfa87` (2026-05-22) | `88a2acd5` (2026-05-22) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| N= 2 stacked refinements | 1.33 μs | 0.99 μs | 0.98 μs | 0.82 μs | 0.80 μs | 0.80 μs | 0.80 μs | 0.79 μs | 0.79 μs | 0.78 μs |
| N= 4 stacked refinements | 5.16 μs | 4.20 μs | 4.12 μs | 3.45 μs | 3.58 μs | 3.38 μs | 3.54 μs | 3.57 μs | 3.49 μs | 3.43 μs |
| N= 8 stacked refinements | 20.88 μs | 17.51 μs | 17.04 μs | 14.71 μs | 14.75 μs | 14.60 μs | 14.91 μs | 14.49 μs | 14.52 μs | 14.68 μs |
| N=16 stacked refinements | 111.83 μs | 99.20 μs | 97.69 μs | 89.57 μs | 91.04 μs | 90.18 μs | 91.29 μs | 88.93 μs | 89.15 μs | 90.56 μs |
| N=32 stacked refinements | 561.00 μs | 511.75 μs | 501.77 μs | 472.53 μs | 480.82 μs | 472.44 μs | 476.63 μs | 470.92 μs | 466.93 μs | 478.70 μs |

## 8. Many-inequality refinement worst case

*`Number & {n | n != 1 && n != 2 && ... && n != N}` — documented quadratic worst case (each conjunction step merges against the growing exclusion list)*

| Measurement | `476a5eef` (2026-05-27) | `90571f50` (2026-05-27) | `90571f50` (2026-05-27) | `dd6cfd53` (2026-05-26) | `9a6c955a` (2026-05-26) | `4b3374b0` (2026-05-26) | `585579cb` (2026-05-26) | `18b49784` (2026-05-26) | `09bdfa87` (2026-05-22) | `88a2acd5` (2026-05-22) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| N= 10 (parse + simplify) | 31.94 μs | 29.56 μs | 29.39 μs | 30.28 μs | 29.88 μs | 30.12 μs | 27.72 μs | 27.60 μs | 27.77 μs | 30.28 μs |
| N= 50 (parse + simplify) | 198.06 μs | 184.01 μs | 183.92 μs | 186.58 μs | 187.79 μs | 190.00 μs | 178.93 μs | 175.36 μs | 175.99 μs | 186.66 μs |
| N=100 (parse + simplify) | 483.71 μs | 457.80 μs | 453.05 μs | 454.00 μs | 465.08 μs | 458.94 μs | 460.67 μs | 444.52 μs | 432.36 μs | 458.97 μs |

