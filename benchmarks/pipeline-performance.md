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
| `45441132` | 2026-05-28 18:17:04 | refactor: move typeGuards + getAssertionError + arity validator into dvala-types leaf |
| `70310733` | 2026-05-28 17:53:28 | refactor: move errors.ts + utils/debug/ into dvala-types leaf |
| `8cda5a15` | 2026-05-28 17:14:03 | refactor: relocate CallStackEntry type to dvala-types leaf |
| `476a5eef` | 2026-05-27 21:23:08 | refactor: move the value/AST vocabulary into the dvala-types leaf |
| `90571f50` | 2026-05-27 20:36:54 | refactor: move utils/persistent into the dvala-types leaf |
| `90571f50` | 2026-05-27 20:35:20 | refactor: move utils/persistent into the dvala-types leaf |
| `dd6cfd53` | 2026-05-26 21:05:06 | refactor: extract standaloneTooling.ts to structurally decouple minimal bundle from tooling bundle |
| `9a6c955a` | 2026-05-26 14:31:12 | refactor: address code-review findings — facade cleanup and import ordering |
| `4b3374b0` | 2026-05-26 13:07:49 | fix: remove initReferenceData from minimal bundle entry point to prevent empty dist/index.js |
| `585579cb` | 2026-05-26 12:06:31 | refactor: route playground-www deep src/ imports through proper boundaries |

## 1. Pipeline: tokenize

*pure tokenize cost — `tokenize(source)` for each corpus program*

| Measurement | `45441132` (2026-05-28) | `70310733` (2026-05-28) | `8cda5a15` (2026-05-28) | `476a5eef` (2026-05-27) | `90571f50` (2026-05-27) | `90571f50` (2026-05-27) | `dd6cfd53` (2026-05-26) | `9a6c955a` (2026-05-26) | `4b3374b0` (2026-05-26) | `585579cb` (2026-05-26) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms |
| medium (untyped fold) | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms |
| typed (annotated arithmetic) | 0.009 ms | 0.010 ms | 0.009 ms | 0.010 ms | 0.009 ms | 0.009 ms | 0.010 ms | 0.009 ms | 0.010 ms | 0.010 ms |
| refinement-heavy (50 annotations) | 0.363 ms | 0.367 ms | 0.371 ms | 0.372 ms | 0.360 ms | 0.365 ms | 0.375 ms | 0.370 ms | 0.375 ms | 0.371 ms |
| effect-heavy (handler + perform) | 0.005 ms | 0.005 ms | 0.004 ms | 0.005 ms | 0.004 ms | 0.004 ms | 0.004 ms | 0.005 ms | 0.004 ms | 0.005 ms |
| eval-heavy (fib(15) recursion) | 0.006 ms | 0.007 ms | 0.006 ms | 0.007 ms | 0.006 ms | 0.006 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms |

## 2. Pipeline: parse (pre-tokenized)

*parser cost only — `parseTokenStream(pre-tokenized)` for each corpus program*

| Measurement | `45441132` (2026-05-28) | `70310733` (2026-05-28) | `8cda5a15` (2026-05-28) | `476a5eef` (2026-05-27) | `90571f50` (2026-05-27) | `90571f50` (2026-05-27) | `dd6cfd53` (2026-05-26) | `9a6c955a` (2026-05-26) | `4b3374b0` (2026-05-26) | `585579cb` (2026-05-26) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.001 ms | 0.001 ms | 0.000 ms | 0.001 ms | 0.000 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms |
| medium (untyped fold) | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.003 ms |
| typed (annotated arithmetic) | 0.003 ms | 0.004 ms | 0.002 ms | 0.003 ms | 0.002 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms |
| refinement-heavy (50 annotations) | 0.080 ms | 0.087 ms | 0.081 ms | 0.081 ms | 0.080 ms | 0.079 ms | 0.081 ms | 0.087 ms | 0.090 ms | 0.088 ms |
| effect-heavy (handler + perform) | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.002 ms | 0.002 ms | 0.001 ms | 0.001 ms | 0.001 ms |
| eval-heavy (fib(15) recursion) | 0.003 ms | 0.003 ms | 0.002 ms | 0.003 ms | 0.002 ms | 0.003 ms | 0.002 ms | 0.002 ms | 0.003 ms | 0.003 ms |

## 3. Pipeline: typecheck (cumulative — incl. tokenize + parse)

*`dvala.typecheck(source)` per program — full pipeline through the typechecker. Typecheck-only cost ≈ this − phase-tokenize − phase-parse.*

| Measurement | `45441132` (2026-05-28) | `70310733` (2026-05-28) | `8cda5a15` (2026-05-28) | `476a5eef` (2026-05-27) | `90571f50` (2026-05-27) | `90571f50` (2026-05-27) | `dd6cfd53` (2026-05-26) | `9a6c955a` (2026-05-26) | `4b3374b0` (2026-05-26) | `585579cb` (2026-05-26) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.006 ms | 0.005 ms | 0.006 ms | 0.005 ms | 0.006 ms | 0.005 ms | 0.005 ms | 0.006 ms | 0.006 ms | 0.007 ms |
| medium (untyped fold) | 0.031 ms | 0.032 ms | 0.031 ms | 0.031 ms | 0.031 ms | 0.031 ms | 0.031 ms | 0.033 ms | 0.033 ms | 0.032 ms |
| typed (annotated arithmetic) | 0.053 ms | 0.052 ms | 0.054 ms | 0.053 ms | 0.052 ms | 0.055 ms | 0.053 ms | 0.052 ms | 0.052 ms | 0.053 ms |
| refinement-heavy (50 annotations) | 5.246 ms | 5.323 ms | 5.005 ms | 5.282 ms | 5.152 ms | 5.305 ms | 5.730 ms | 5.322 ms | 5.297 ms | 5.276 ms |
| effect-heavy (handler + perform) | 0.022 ms | 0.021 ms | 0.019 ms | 0.020 ms | 0.020 ms | 0.022 ms | 0.019 ms | 0.021 ms | 0.022 ms | 0.021 ms |
| eval-heavy (fib(15) recursion) | 0.076 ms | 0.080 ms | 0.079 ms | 0.079 ms | 0.073 ms | 0.078 ms | 0.076 ms | 0.077 ms | 0.077 ms | 0.076 ms |

## 4. Pipeline: run (typecheck disabled)

*`dvala.run(source)` with typecheck disabled — captures tokenize + parse + evaluate. Evaluator-only cost ≈ this − phase-tokenize − phase-parse.*

| Measurement | `45441132` (2026-05-28) | `70310733` (2026-05-28) | `8cda5a15` (2026-05-28) | `476a5eef` (2026-05-27) | `90571f50` (2026-05-27) | `90571f50` (2026-05-27) | `dd6cfd53` (2026-05-26) | `9a6c955a` (2026-05-26) | `4b3374b0` (2026-05-26) | `585579cb` (2026-05-26) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms |
| medium (untyped fold) | 0.037 ms | 0.037 ms | 0.036 ms | 0.035 ms | 0.036 ms | 0.036 ms | 0.036 ms | 0.037 ms | 0.036 ms | 0.037 ms |
| typed (annotated arithmetic) | 0.007 ms | 0.006 ms | 0.007 ms | 0.007 ms | 0.006 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.006 ms | 0.006 ms |
| refinement-heavy (50 annotations) | 0.067 ms | 0.065 ms | 0.071 ms | 0.072 ms | 0.064 ms | 0.064 ms | 0.063 ms | 0.067 ms | 0.077 ms | 0.065 ms |
| effect-heavy (handler + perform) | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms |
| eval-heavy (fib(15) recursion) | 4.481 ms | 4.368 ms | 4.462 ms | 4.403 ms | 4.391 ms | 4.420 ms | 4.453 ms | 4.633 ms | 4.377 ms | 4.439 ms |

## 5. Pipeline: end-to-end (full)

*`dvala.run(source)` — tokenize + parse + typecheck + evaluate. The number a user actually observes.*

| Measurement | `45441132` (2026-05-28) | `70310733` (2026-05-28) | `8cda5a15` (2026-05-28) | `476a5eef` (2026-05-27) | `90571f50` (2026-05-27) | `90571f50` (2026-05-27) | `dd6cfd53` (2026-05-26) | `9a6c955a` (2026-05-26) | `4b3374b0` (2026-05-26) | `585579cb` (2026-05-26) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms |
| medium (untyped fold) | 0.046 ms | 0.045 ms | 0.043 ms | 0.043 ms | 0.042 ms | 0.043 ms | 0.045 ms | 0.043 ms | 0.043 ms | 0.044 ms |
| typed (annotated arithmetic) | 0.026 ms | 0.028 ms | 0.026 ms | 0.028 ms | 0.025 ms | 0.027 ms | 0.027 ms | 0.025 ms | 0.027 ms | 0.027 ms |
| refinement-heavy (50 annotations) | 0.592 ms | 0.661 ms | 0.602 ms | 0.659 ms | 0.562 ms | 0.659 ms | 0.683 ms | 0.578 ms | 0.660 ms | 0.671 ms |
| effect-heavy (handler + perform) | 0.007 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.007 ms | 0.009 ms | 0.009 ms | 0.007 ms | 0.009 ms | 0.008 ms |
| eval-heavy (fib(15) recursion) | 4.601 ms | 4.496 ms | 4.480 ms | 4.535 ms | 4.405 ms | 4.545 ms | 4.500 ms | 4.563 ms | 4.477 ms | 4.497 ms |

## 6. Refinement subtype-check cost (per predicate shape)

*isolated subtype-check calls between source type and refinement target — no parse or typecheck overhead*

| Measurement | `45441132` (2026-05-28) | `70310733` (2026-05-28) | `8cda5a15` (2026-05-28) | `476a5eef` (2026-05-27) | `90571f50` (2026-05-27) | `90571f50` (2026-05-27) | `dd6cfd53` (2026-05-26) | `9a6c955a` (2026-05-26) | `4b3374b0` (2026-05-26) | `585579cb` (2026-05-26) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| interval target — Number → {n \| n > 0 && n < 100} | 0.27 μs | 0.27 μs | 0.26 μs | 0.27 μs | 0.17 μs | 0.17 μs | 0.09 μs | 0.09 μs | 0.10 μs | 0.09 μs |
| set target — :ok → {x \| :ok \| :error} | 0.35 μs | 0.35 μs | 0.34 μs | 0.35 μs | 0.22 μs | 0.22 μs | 0.13 μs | 0.13 μs | 0.12 μs | 0.12 μs |
| count target — String → {s \| count(s) > 0} | 0.17 μs | 0.17 μs | 0.17 μs | 0.17 μs | 0.11 μs | 0.11 μs | 0.06 μs | 0.05 μs | 0.06 μs | 0.06 μs |
| excludedSet — Number → {n \| !=0 && !=1 && !=-1} | 0.47 μs | 0.47 μs | 0.46 μs | 0.47 μs | 0.33 μs | 0.33 μs | 0.21 μs | 0.22 μs | 0.21 μs | 0.21 μs |
| literal source — 50 → {n \| n > 0 && n < 100} | 0.28 μs | 0.28 μs | 0.28 μs | 0.28 μs | 0.19 μs | 0.18 μs | 0.10 μs | 0.11 μs | 0.11 μs | 0.11 μs |

## 7. Stacked refinement simplify scaling

*simplifying N stacked refinements (`Base & {p1} & {p2} & ... & {pN}`) — empirically O(N²); regressions show as a worse exponent*

| Measurement | `45441132` (2026-05-28) | `70310733` (2026-05-28) | `8cda5a15` (2026-05-28) | `476a5eef` (2026-05-27) | `90571f50` (2026-05-27) | `90571f50` (2026-05-27) | `dd6cfd53` (2026-05-26) | `9a6c955a` (2026-05-26) | `4b3374b0` (2026-05-26) | `585579cb` (2026-05-26) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| N= 2 stacked refinements | 1.34 μs | 1.33 μs | 1.30 μs | 1.33 μs | 0.99 μs | 0.98 μs | 0.82 μs | 0.80 μs | 0.80 μs | 0.80 μs |
| N= 4 stacked refinements | 5.26 μs | 5.04 μs | 5.11 μs | 5.16 μs | 4.20 μs | 4.12 μs | 3.45 μs | 3.58 μs | 3.38 μs | 3.54 μs |
| N= 8 stacked refinements | 21.18 μs | 20.91 μs | 20.56 μs | 20.88 μs | 17.51 μs | 17.04 μs | 14.71 μs | 14.75 μs | 14.60 μs | 14.91 μs |
| N=16 stacked refinements | 114.39 μs | 113.62 μs | 110.46 μs | 111.83 μs | 99.20 μs | 97.69 μs | 89.57 μs | 91.04 μs | 90.18 μs | 91.29 μs |
| N=32 stacked refinements | 575.63 μs | 561.85 μs | 547.22 μs | 561.00 μs | 511.75 μs | 501.77 μs | 472.53 μs | 480.82 μs | 472.44 μs | 476.63 μs |

## 8. Many-inequality refinement worst case

*`Number & {n | n != 1 && n != 2 && ... && n != N}` — documented quadratic worst case (each conjunction step merges against the growing exclusion list)*

| Measurement | `45441132` (2026-05-28) | `70310733` (2026-05-28) | `8cda5a15` (2026-05-28) | `476a5eef` (2026-05-27) | `90571f50` (2026-05-27) | `90571f50` (2026-05-27) | `dd6cfd53` (2026-05-26) | `9a6c955a` (2026-05-26) | `4b3374b0` (2026-05-26) | `585579cb` (2026-05-26) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| N= 10 (parse + simplify) | 34.26 μs | 32.68 μs | 37.60 μs | 31.94 μs | 29.56 μs | 29.39 μs | 30.28 μs | 29.88 μs | 30.12 μs | 27.72 μs |
| N= 50 (parse + simplify) | 204.63 μs | 198.07 μs | 195.72 μs | 198.06 μs | 184.01 μs | 183.92 μs | 186.58 μs | 187.79 μs | 190.00 μs | 178.93 μs |
| N=100 (parse + simplify) | 501.18 μs | 485.00 μs | 470.31 μs | 483.71 μs | 457.80 μs | 453.05 μs | 454.00 μs | 465.08 μs | 458.94 μs | 460.67 μs |

