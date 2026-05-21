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
| `cc0dc1fc` | 2026-05-21 14:30:42 | feat: move workspace-backend behavioral code into package |
| `225da874` | 2026-05-14 19:39:06 | Move playground-www into apps/playground-www |
| `895fd484` | 2026-05-14 17:33:02 | test: harden cli entrypoint smoke and avoid tmp scan race |
| `a1d640c2` | 2026-05-13 08:12:17 | test: make CST corpus roundtrip resilient to temp-file cleanup |
| `60856de6` | 2026-05-12 21:24:48 | Fix validateSnapshot error normalization and add regression test |
| `c8dead0a` | 2026-05-12 20:32:19 | Move playground LS state into worker |
| `47986f02` | 2026-05-12 19:35:28 | Validate embedded snapshot imports |
| `8fb25541` | 2026-05-12 19:24:46 | Harden snapshot import validation |
| `cb603452` | 2026-05-11 22:07:21 | Move snapshot import validation to backend |
| `648c0f17` | 2026-05-11 20:24:26 | Migrate VS Code signature help and symbols to backend |

## 1. Pipeline: tokenize

*pure tokenize cost — `tokenize(source)` for each corpus program*

| Measurement | `cc0dc1fc` (2026-05-21) | `225da874` (2026-05-14) | `895fd484` (2026-05-14) | `a1d640c2` (2026-05-13) | `60856de6` (2026-05-12) | `c8dead0a` (2026-05-12) | `47986f02` (2026-05-12) | `8fb25541` (2026-05-12) | `cb603452` (2026-05-11) | `648c0f17` (2026-05-11) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms |
| medium (untyped fold) | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.009 ms |
| typed (annotated arithmetic) | 0.010 ms | 0.010 ms | 0.010 ms | 0.010 ms | 0.010 ms | 0.010 ms | 0.010 ms | 0.010 ms | 0.009 ms | 0.011 ms |
| refinement-heavy (50 annotations) | 0.373 ms | 0.389 ms | 0.393 ms | 0.386 ms | 0.373 ms | 0.397 ms | 0.390 ms | 0.388 ms | 0.371 ms | 0.396 ms |
| effect-heavy (handler + perform) | 0.004 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms |
| eval-heavy (fib(15) recursion) | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms |

## 2. Pipeline: parse (pre-tokenized)

*parser cost only — `parseTokenStream(pre-tokenized)` for each corpus program*

| Measurement | `cc0dc1fc` (2026-05-21) | `225da874` (2026-05-14) | `895fd484` (2026-05-14) | `a1d640c2` (2026-05-13) | `60856de6` (2026-05-12) | `c8dead0a` (2026-05-12) | `47986f02` (2026-05-12) | `8fb25541` (2026-05-12) | `cb603452` (2026-05-11) | `648c0f17` (2026-05-11) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms |
| medium (untyped fold) | 0.002 ms | 0.002 ms | 0.003 ms | 0.002 ms | 0.002 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.002 ms |
| typed (annotated arithmetic) | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms |
| refinement-heavy (50 annotations) | 0.079 ms | 0.093 ms | 0.096 ms | 0.094 ms | 0.090 ms | 0.096 ms | 0.095 ms | 0.084 ms | 0.092 ms | 0.092 ms |
| effect-heavy (handler + perform) | 0.001 ms | 0.002 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.002 ms | 0.001 ms | 0.002 ms | 0.001 ms | 0.002 ms |
| eval-heavy (fib(15) recursion) | 0.002 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.002 ms | 0.003 ms |

## 3. Pipeline: typecheck (cumulative — incl. tokenize + parse)

*`dvala.typecheck(source)` per program — full pipeline through the typechecker. Typecheck-only cost ≈ this − phase-tokenize − phase-parse.*

| Measurement | `cc0dc1fc` (2026-05-21) | `225da874` (2026-05-14) | `895fd484` (2026-05-14) | `a1d640c2` (2026-05-13) | `60856de6` (2026-05-12) | `c8dead0a` (2026-05-12) | `47986f02` (2026-05-12) | `8fb25541` (2026-05-12) | `cb603452` (2026-05-11) | `648c0f17` (2026-05-11) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.008 ms | 0.007 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.007 ms | 0.009 ms | 0.005 ms | 0.007 ms | 0.008 ms |
| medium (untyped fold) | 0.035 ms | 0.034 ms | 0.034 ms | 0.032 ms | 0.034 ms | 0.034 ms | 0.034 ms | 0.036 ms | 0.035 ms | 0.033 ms |
| typed (annotated arithmetic) | 0.053 ms | 0.055 ms | 0.056 ms | 0.054 ms | 0.057 ms | 0.057 ms | 0.061 ms | 0.059 ms | 0.057 ms | 0.060 ms |
| refinement-heavy (50 annotations) | 5.124 ms | 5.602 ms | 5.637 ms | 5.598 ms | 5.438 ms | 5.666 ms | 5.752 ms | 5.667 ms | 5.426 ms | 5.754 ms |
| effect-heavy (handler + perform) | 0.021 ms | 0.022 ms | 0.023 ms | 0.023 ms | 0.021 ms | 0.023 ms | 0.023 ms | 0.022 ms | 0.022 ms | 0.024 ms |
| eval-heavy (fib(15) recursion) | 0.080 ms | 0.081 ms | 0.083 ms | 0.082 ms | 0.080 ms | 0.086 ms | 0.089 ms | 0.084 ms | 0.080 ms | 0.085 ms |

## 4. Pipeline: run (typecheck disabled)

*`dvala.run(source)` with typecheck disabled — captures tokenize + parse + evaluate. Evaluator-only cost ≈ this − phase-tokenize − phase-parse.*

| Measurement | `cc0dc1fc` (2026-05-21) | `225da874` (2026-05-14) | `895fd484` (2026-05-14) | `a1d640c2` (2026-05-13) | `60856de6` (2026-05-12) | `c8dead0a` (2026-05-12) | `47986f02` (2026-05-12) | `8fb25541` (2026-05-12) | `cb603452` (2026-05-11) | `648c0f17` (2026-05-11) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.001 ms | 0.002 ms | 0.001 ms | 0.001 ms | 0.002 ms | 0.001 ms | 0.002 ms | 0.001 ms | 0.001 ms | 0.001 ms |
| medium (untyped fold) | 0.037 ms | 0.039 ms | 0.041 ms | 0.039 ms | 0.049 ms | 0.039 ms | 0.042 ms | 0.038 ms | 0.041 ms | 0.040 ms |
| typed (annotated arithmetic) | 0.007 ms | 0.007 ms | 0.008 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms |
| refinement-heavy (50 annotations) | 0.069 ms | 0.070 ms | 0.075 ms | 0.070 ms | 0.068 ms | 0.075 ms | 0.074 ms | 0.072 ms | 0.076 ms | 0.078 ms |
| effect-heavy (handler + perform) | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.006 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms |
| eval-heavy (fib(15) recursion) | 4.501 ms | 4.862 ms | 4.818 ms | 4.728 ms | 5.677 ms | 4.765 ms | 4.877 ms | 4.684 ms | 4.794 ms | 4.847 ms |

## 5. Pipeline: end-to-end (full)

*`dvala.run(source)` — tokenize + parse + typecheck + evaluate. The number a user actually observes.*

| Measurement | `cc0dc1fc` (2026-05-21) | `225da874` (2026-05-14) | `895fd484` (2026-05-14) | `a1d640c2` (2026-05-13) | `60856de6` (2026-05-12) | `c8dead0a` (2026-05-12) | `47986f02` (2026-05-12) | `8fb25541` (2026-05-12) | `cb603452` (2026-05-11) | `648c0f17` (2026-05-11) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms |
| medium (untyped fold) | 0.045 ms | 0.047 ms | 0.048 ms | 0.054 ms | 0.059 ms | 0.048 ms | 0.048 ms | 0.047 ms | 0.046 ms | 0.048 ms |
| typed (annotated arithmetic) | 0.028 ms | 0.028 ms | 0.028 ms | 0.028 ms | 0.027 ms | 0.028 ms | 0.027 ms | 0.028 ms | 0.027 ms | 0.029 ms |
| refinement-heavy (50 annotations) | 0.600 ms | 0.720 ms | 0.737 ms | 0.699 ms | 0.659 ms | 0.688 ms | 0.660 ms | 0.695 ms | 0.688 ms | 0.691 ms |
| effect-heavy (handler + perform) | 0.008 ms | 0.009 ms | 0.009 ms | 0.009 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.009 ms | 0.009 ms | 0.009 ms |
| eval-heavy (fib(15) recursion) | 4.609 ms | 4.980 ms | 4.894 ms | 5.286 ms | 5.750 ms | 4.859 ms | 4.983 ms | 4.795 ms | 4.802 ms | 4.942 ms |

## 6. Refinement subtype-check cost (per predicate shape)

*isolated subtype-check calls between source type and refinement target — no parse or typecheck overhead*

| Measurement | `cc0dc1fc` (2026-05-21) | `225da874` (2026-05-14) | `895fd484` (2026-05-14) | `a1d640c2` (2026-05-13) | `60856de6` (2026-05-12) | `c8dead0a` (2026-05-12) | `47986f02` (2026-05-12) | `8fb25541` (2026-05-12) | `cb603452` (2026-05-11) | `648c0f17` (2026-05-11) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| interval target — Number → {n \| n > 0 && n < 100} | 0.09 μs | 0.10 μs | 0.10 μs | 0.11 μs | 0.10 μs | 0.10 μs | 0.10 μs | 0.10 μs | 0.10 μs | 0.10 μs |
| set target — :ok → {x \| :ok \| :error} | 0.13 μs | 0.13 μs | 0.13 μs | 0.14 μs | 0.13 μs | 0.14 μs | 0.13 μs | 0.13 μs | 0.13 μs | 0.14 μs |
| count target — String → {s \| count(s) > 0} | 0.05 μs | 0.06 μs | 0.06 μs | 0.06 μs | 0.06 μs | 0.06 μs | 0.06 μs | 0.06 μs | 0.06 μs | 0.06 μs |
| excludedSet — Number → {n \| !=0 && !=1 && !=-1} | 0.22 μs | 0.22 μs | 0.22 μs | 0.24 μs | 0.22 μs | 0.22 μs | 0.22 μs | 0.21 μs | 0.21 μs | 0.22 μs |
| literal source — 50 → {n \| n > 0 && n < 100} | 0.10 μs | 0.10 μs | 0.11 μs | 0.12 μs | 0.10 μs | 0.11 μs | 0.11 μs | 0.11 μs | 0.11 μs | 0.11 μs |

## 7. Stacked refinement simplify scaling

*simplifying N stacked refinements (`Base & {p1} & {p2} & ... & {pN}`) — empirically O(N²); regressions show as a worse exponent*

| Measurement | `cc0dc1fc` (2026-05-21) | `225da874` (2026-05-14) | `895fd484` (2026-05-14) | `a1d640c2` (2026-05-13) | `60856de6` (2026-05-12) | `c8dead0a` (2026-05-12) | `47986f02` (2026-05-12) | `8fb25541` (2026-05-12) | `cb603452` (2026-05-11) | `648c0f17` (2026-05-11) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| N= 2 stacked refinements | 0.83 μs | 0.85 μs | 0.86 μs | 0.94 μs | 0.82 μs | 0.88 μs | 0.87 μs | 0.83 μs | 0.82 μs | 0.90 μs |
| N= 4 stacked refinements | 3.49 μs | 3.58 μs | 3.69 μs | 3.69 μs | 3.55 μs | 3.69 μs | 3.68 μs | 3.51 μs | 3.55 μs | 3.72 μs |
| N= 8 stacked refinements | 14.93 μs | 15.44 μs | 15.83 μs | 15.84 μs | 15.02 μs | 15.90 μs | 15.82 μs | 15.29 μs | 15.05 μs | 16.06 μs |
| N=16 stacked refinements | 90.95 μs | 94.29 μs | 95.69 μs | 93.59 μs | 92.46 μs | 97.64 μs | 95.45 μs | 92.30 μs | 92.82 μs | 97.32 μs |
| N=32 stacked refinements | 480.57 μs | 493.22 μs | 507.99 μs | 496.83 μs | 491.54 μs | 517.28 μs | 497.06 μs | 488.17 μs | 491.45 μs | 509.29 μs |

## 8. Many-inequality refinement worst case

*`Number & {n | n != 1 && n != 2 && ... && n != N}` — documented quadratic worst case (each conjunction step merges against the growing exclusion list)*

| Measurement | `cc0dc1fc` (2026-05-21) | `225da874` (2026-05-14) | `895fd484` (2026-05-14) | `a1d640c2` (2026-05-13) | `60856de6` (2026-05-12) | `c8dead0a` (2026-05-12) | `47986f02` (2026-05-12) | `8fb25541` (2026-05-12) | `cb603452` (2026-05-11) | `648c0f17` (2026-05-11) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| N= 10 (parse + simplify) | 31.49 μs | 30.19 μs | 30.51 μs | 30.84 μs | 29.19 μs | 29.49 μs | 30.44 μs | 29.46 μs | 28.24 μs | 30.43 μs |
| N= 50 (parse + simplify) | 195.17 μs | 189.71 μs | 203.17 μs | 200.72 μs | 190.74 μs | 192.65 μs | 195.14 μs | 183.68 μs | 187.60 μs | 198.35 μs |
| N=100 (parse + simplify) | 460.60 μs | 477.28 μs | 485.81 μs | 501.64 μs | 455.16 μs | 491.39 μs | 492.16 μs | 460.45 μs | 470.48 μs | 470.01 μs |

