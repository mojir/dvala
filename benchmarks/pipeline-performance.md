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
| `4b3374b0` | 2026-05-26 13:07:49 | fix: remove initReferenceData from minimal bundle entry point to prevent empty dist/index.js |
| `585579cb` | 2026-05-26 12:06:31 | refactor: route playground-www deep src/ imports through proper boundaries |
| `18b49784` | 2026-05-26 11:56:28 | refactor: route js-interop deep src/ imports through src/index.ts |
| `09bdfa87` | 2026-05-22 21:32:42 | refactor: route cross-package src/ imports through dvala-core-tooling boundary |
| `88a2acd5` | 2026-05-22 17:58:21 | fix: remove src/backend/ shims and fix test-file exclusions |
| `cc0dc1fc` | 2026-05-21 14:30:42 | feat: move workspace-backend behavioral code into package |
| `225da874` | 2026-05-14 19:39:06 | Move playground-www into apps/playground-www |
| `895fd484` | 2026-05-14 17:33:02 | test: harden cli entrypoint smoke and avoid tmp scan race |
| `a1d640c2` | 2026-05-13 08:12:17 | test: make CST corpus roundtrip resilient to temp-file cleanup |
| `60856de6` | 2026-05-12 21:24:48 | Fix validateSnapshot error normalization and add regression test |

## 1. Pipeline: tokenize

*pure tokenize cost — `tokenize(source)` for each corpus program*

| Measurement | `4b3374b0` (2026-05-26) | `585579cb` (2026-05-26) | `18b49784` (2026-05-26) | `09bdfa87` (2026-05-22) | `88a2acd5` (2026-05-22) | `cc0dc1fc` (2026-05-21) | `225da874` (2026-05-14) | `895fd484` (2026-05-14) | `a1d640c2` (2026-05-13) | `60856de6` (2026-05-12) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms |
| medium (untyped fold) | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms |
| typed (annotated arithmetic) | 0.010 ms | 0.010 ms | 0.010 ms | 0.010 ms | 0.010 ms | 0.010 ms | 0.010 ms | 0.010 ms | 0.010 ms | 0.010 ms |
| refinement-heavy (50 annotations) | 0.375 ms | 0.371 ms | 0.360 ms | 0.369 ms | 0.371 ms | 0.373 ms | 0.389 ms | 0.393 ms | 0.386 ms | 0.373 ms |
| effect-heavy (handler + perform) | 0.004 ms | 0.005 ms | 0.005 ms | 0.004 ms | 0.004 ms | 0.004 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms |
| eval-heavy (fib(15) recursion) | 0.007 ms | 0.007 ms | 0.006 ms | 0.006 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms |

## 2. Pipeline: parse (pre-tokenized)

*parser cost only — `parseTokenStream(pre-tokenized)` for each corpus program*

| Measurement | `4b3374b0` (2026-05-26) | `585579cb` (2026-05-26) | `18b49784` (2026-05-26) | `09bdfa87` (2026-05-22) | `88a2acd5` (2026-05-22) | `cc0dc1fc` (2026-05-21) | `225da874` (2026-05-14) | `895fd484` (2026-05-14) | `a1d640c2` (2026-05-13) | `60856de6` (2026-05-12) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms |
| medium (untyped fold) | 0.002 ms | 0.003 ms | 0.002 ms | 0.003 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.003 ms | 0.002 ms | 0.002 ms |
| typed (annotated arithmetic) | 0.003 ms | 0.003 ms | 0.003 ms | 0.002 ms | 0.002 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms |
| refinement-heavy (50 annotations) | 0.090 ms | 0.088 ms | 0.079 ms | 0.089 ms | 0.081 ms | 0.079 ms | 0.093 ms | 0.096 ms | 0.094 ms | 0.090 ms |
| effect-heavy (handler + perform) | 0.001 ms | 0.001 ms | 0.002 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.002 ms | 0.001 ms | 0.001 ms | 0.001 ms |
| eval-heavy (fib(15) recursion) | 0.003 ms | 0.003 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms |

## 3. Pipeline: typecheck (cumulative — incl. tokenize + parse)

*`dvala.typecheck(source)` per program — full pipeline through the typechecker. Typecheck-only cost ≈ this − phase-tokenize − phase-parse.*

| Measurement | `4b3374b0` (2026-05-26) | `585579cb` (2026-05-26) | `18b49784` (2026-05-26) | `09bdfa87` (2026-05-22) | `88a2acd5` (2026-05-22) | `cc0dc1fc` (2026-05-21) | `225da874` (2026-05-14) | `895fd484` (2026-05-14) | `a1d640c2` (2026-05-13) | `60856de6` (2026-05-12) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.006 ms | 0.007 ms | 0.006 ms | 0.007 ms | 0.007 ms | 0.008 ms | 0.007 ms | 0.008 ms | 0.008 ms | 0.008 ms |
| medium (untyped fold) | 0.033 ms | 0.032 ms | 0.034 ms | 0.031 ms | 0.032 ms | 0.035 ms | 0.034 ms | 0.034 ms | 0.032 ms | 0.034 ms |
| typed (annotated arithmetic) | 0.052 ms | 0.053 ms | 0.053 ms | 0.051 ms | 0.056 ms | 0.053 ms | 0.055 ms | 0.056 ms | 0.054 ms | 0.057 ms |
| refinement-heavy (50 annotations) | 5.297 ms | 5.276 ms | 5.395 ms | 5.370 ms | 5.247 ms | 5.124 ms | 5.602 ms | 5.637 ms | 5.598 ms | 5.438 ms |
| effect-heavy (handler + perform) | 0.022 ms | 0.021 ms | 0.021 ms | 0.022 ms | 0.025 ms | 0.021 ms | 0.022 ms | 0.023 ms | 0.023 ms | 0.021 ms |
| eval-heavy (fib(15) recursion) | 0.077 ms | 0.076 ms | 0.079 ms | 0.074 ms | 0.074 ms | 0.080 ms | 0.081 ms | 0.083 ms | 0.082 ms | 0.080 ms |

## 4. Pipeline: run (typecheck disabled)

*`dvala.run(source)` with typecheck disabled — captures tokenize + parse + evaluate. Evaluator-only cost ≈ this − phase-tokenize − phase-parse.*

| Measurement | `4b3374b0` (2026-05-26) | `585579cb` (2026-05-26) | `18b49784` (2026-05-26) | `09bdfa87` (2026-05-22) | `88a2acd5` (2026-05-22) | `cc0dc1fc` (2026-05-21) | `225da874` (2026-05-14) | `895fd484` (2026-05-14) | `a1d640c2` (2026-05-13) | `60856de6` (2026-05-12) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.002 ms | 0.001 ms | 0.001 ms | 0.002 ms |
| medium (untyped fold) | 0.036 ms | 0.037 ms | 0.036 ms | 0.036 ms | 0.036 ms | 0.037 ms | 0.039 ms | 0.041 ms | 0.039 ms | 0.049 ms |
| typed (annotated arithmetic) | 0.006 ms | 0.006 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.008 ms | 0.007 ms | 0.007 ms |
| refinement-heavy (50 annotations) | 0.077 ms | 0.065 ms | 0.073 ms | 0.062 ms | 0.066 ms | 0.069 ms | 0.070 ms | 0.075 ms | 0.070 ms | 0.068 ms |
| effect-heavy (handler + perform) | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms |
| eval-heavy (fib(15) recursion) | 4.377 ms | 4.439 ms | 4.348 ms | 4.297 ms | 4.437 ms | 4.501 ms | 4.862 ms | 4.818 ms | 4.728 ms | 5.677 ms |

## 5. Pipeline: end-to-end (full)

*`dvala.run(source)` — tokenize + parse + typecheck + evaluate. The number a user actually observes.*

| Measurement | `4b3374b0` (2026-05-26) | `585579cb` (2026-05-26) | `18b49784` (2026-05-26) | `09bdfa87` (2026-05-22) | `88a2acd5` (2026-05-22) | `cc0dc1fc` (2026-05-21) | `225da874` (2026-05-14) | `895fd484` (2026-05-14) | `a1d640c2` (2026-05-13) | `60856de6` (2026-05-12) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms |
| medium (untyped fold) | 0.043 ms | 0.044 ms | 0.043 ms | 0.043 ms | 0.045 ms | 0.045 ms | 0.047 ms | 0.048 ms | 0.054 ms | 0.059 ms |
| typed (annotated arithmetic) | 0.027 ms | 0.027 ms | 0.025 ms | 0.027 ms | 0.026 ms | 0.028 ms | 0.028 ms | 0.028 ms | 0.028 ms | 0.027 ms |
| refinement-heavy (50 annotations) | 0.660 ms | 0.671 ms | 0.582 ms | 0.594 ms | 0.607 ms | 0.600 ms | 0.720 ms | 0.737 ms | 0.699 ms | 0.659 ms |
| effect-heavy (handler + perform) | 0.009 ms | 0.008 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.008 ms | 0.009 ms | 0.009 ms | 0.009 ms | 0.008 ms |
| eval-heavy (fib(15) recursion) | 4.477 ms | 4.497 ms | 4.492 ms | 4.452 ms | 4.479 ms | 4.609 ms | 4.980 ms | 4.894 ms | 5.286 ms | 5.750 ms |

## 6. Refinement subtype-check cost (per predicate shape)

*isolated subtype-check calls between source type and refinement target — no parse or typecheck overhead*

| Measurement | `4b3374b0` (2026-05-26) | `585579cb` (2026-05-26) | `18b49784` (2026-05-26) | `09bdfa87` (2026-05-22) | `88a2acd5` (2026-05-22) | `cc0dc1fc` (2026-05-21) | `225da874` (2026-05-14) | `895fd484` (2026-05-14) | `a1d640c2` (2026-05-13) | `60856de6` (2026-05-12) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| interval target — Number → {n \| n > 0 && n < 100} | 0.10 μs | 0.09 μs | 0.10 μs | 0.09 μs | 0.10 μs | 0.09 μs | 0.10 μs | 0.10 μs | 0.11 μs | 0.10 μs |
| set target — :ok → {x \| :ok \| :error} | 0.12 μs | 0.12 μs | 0.12 μs | 0.12 μs | 0.12 μs | 0.13 μs | 0.13 μs | 0.13 μs | 0.14 μs | 0.13 μs |
| count target — String → {s \| count(s) > 0} | 0.06 μs | 0.06 μs | 0.06 μs | 0.05 μs | 0.06 μs | 0.05 μs | 0.06 μs | 0.06 μs | 0.06 μs | 0.06 μs |
| excludedSet — Number → {n \| !=0 && !=1 && !=-1} | 0.21 μs | 0.21 μs | 0.21 μs | 0.20 μs | 0.21 μs | 0.22 μs | 0.22 μs | 0.22 μs | 0.24 μs | 0.22 μs |
| literal source — 50 → {n \| n > 0 && n < 100} | 0.11 μs | 0.11 μs | 0.10 μs | 0.10 μs | 0.10 μs | 0.10 μs | 0.10 μs | 0.11 μs | 0.12 μs | 0.10 μs |

## 7. Stacked refinement simplify scaling

*simplifying N stacked refinements (`Base & {p1} & {p2} & ... & {pN}`) — empirically O(N²); regressions show as a worse exponent*

| Measurement | `4b3374b0` (2026-05-26) | `585579cb` (2026-05-26) | `18b49784` (2026-05-26) | `09bdfa87` (2026-05-22) | `88a2acd5` (2026-05-22) | `cc0dc1fc` (2026-05-21) | `225da874` (2026-05-14) | `895fd484` (2026-05-14) | `a1d640c2` (2026-05-13) | `60856de6` (2026-05-12) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| N= 2 stacked refinements | 0.80 μs | 0.80 μs | 0.79 μs | 0.79 μs | 0.78 μs | 0.83 μs | 0.85 μs | 0.86 μs | 0.94 μs | 0.82 μs |
| N= 4 stacked refinements | 3.38 μs | 3.54 μs | 3.57 μs | 3.49 μs | 3.43 μs | 3.49 μs | 3.58 μs | 3.69 μs | 3.69 μs | 3.55 μs |
| N= 8 stacked refinements | 14.60 μs | 14.91 μs | 14.49 μs | 14.52 μs | 14.68 μs | 14.93 μs | 15.44 μs | 15.83 μs | 15.84 μs | 15.02 μs |
| N=16 stacked refinements | 90.18 μs | 91.29 μs | 88.93 μs | 89.15 μs | 90.56 μs | 90.95 μs | 94.29 μs | 95.69 μs | 93.59 μs | 92.46 μs |
| N=32 stacked refinements | 472.44 μs | 476.63 μs | 470.92 μs | 466.93 μs | 478.70 μs | 480.57 μs | 493.22 μs | 507.99 μs | 496.83 μs | 491.54 μs |

## 8. Many-inequality refinement worst case

*`Number & {n | n != 1 && n != 2 && ... && n != N}` — documented quadratic worst case (each conjunction step merges against the growing exclusion list)*

| Measurement | `4b3374b0` (2026-05-26) | `585579cb` (2026-05-26) | `18b49784` (2026-05-26) | `09bdfa87` (2026-05-22) | `88a2acd5` (2026-05-22) | `cc0dc1fc` (2026-05-21) | `225da874` (2026-05-14) | `895fd484` (2026-05-14) | `a1d640c2` (2026-05-13) | `60856de6` (2026-05-12) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| N= 10 (parse + simplify) | 30.12 μs | 27.72 μs | 27.60 μs | 27.77 μs | 30.28 μs | 31.49 μs | 30.19 μs | 30.51 μs | 30.84 μs | 29.19 μs |
| N= 50 (parse + simplify) | 190.00 μs | 178.93 μs | 175.36 μs | 175.99 μs | 186.66 μs | 195.17 μs | 189.71 μs | 203.17 μs | 200.72 μs | 190.74 μs |
| N=100 (parse + simplify) | 458.94 μs | 460.67 μs | 444.52 μs | 432.36 μs | 458.97 μs | 460.60 μs | 477.28 μs | 485.81 μs | 501.64 μs | 455.16 μs |

