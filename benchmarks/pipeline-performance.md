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
| `60856de6` | 2026-05-12 21:24:48 | Fix validateSnapshot error normalization and add regression test |
| `c8dead0a` | 2026-05-12 20:32:19 | Move playground LS state into worker |
| `47986f02` | 2026-05-12 19:35:28 | Validate embedded snapshot imports |
| `8fb25541` | 2026-05-12 19:24:46 | Harden snapshot import validation |
| `cb603452` | 2026-05-11 22:07:21 | Move snapshot import validation to backend |
| `648c0f17` | 2026-05-11 20:24:26 | Migrate VS Code signature help and symbols to backend |
| `e84df45c` | 2026-05-11 19:33:22 | Restore playground runtime debug mode |
| `81a785bc` | 2026-05-11 19:13:25 | Route playground runtime through backend |
| `3e396faf` | 2026-05-11 19:04:48 | Accept effect handlers in backend startSession |
| `96588521` | 2026-05-11 19:02:00 | Add backend runtime session seam |

## 1. Pipeline: tokenize

*pure tokenize cost — `tokenize(source)` for each corpus program*

| Measurement | `60856de6` (2026-05-12) | `c8dead0a` (2026-05-12) | `47986f02` (2026-05-12) | `8fb25541` (2026-05-12) | `cb603452` (2026-05-11) | `648c0f17` (2026-05-11) | `e84df45c` (2026-05-11) | `81a785bc` (2026-05-11) | `3e396faf` (2026-05-11) | `96588521` (2026-05-11) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms |
| medium (untyped fold) | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.009 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms |
| typed (annotated arithmetic) | 0.010 ms | 0.010 ms | 0.010 ms | 0.010 ms | 0.009 ms | 0.011 ms | 0.010 ms | 0.010 ms | 0.010 ms | 0.010 ms |
| refinement-heavy (50 annotations) | 0.373 ms | 0.397 ms | 0.390 ms | 0.388 ms | 0.371 ms | 0.396 ms | 0.385 ms | 0.398 ms | 0.395 ms | 0.387 ms |
| effect-heavy (handler + perform) | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms |
| eval-heavy (fib(15) recursion) | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms |

## 2. Pipeline: parse (pre-tokenized)

*parser cost only — `parseTokenStream(pre-tokenized)` for each corpus program*

| Measurement | `60856de6` (2026-05-12) | `c8dead0a` (2026-05-12) | `47986f02` (2026-05-12) | `8fb25541` (2026-05-12) | `cb603452` (2026-05-11) | `648c0f17` (2026-05-11) | `e84df45c` (2026-05-11) | `81a785bc` (2026-05-11) | `3e396faf` (2026-05-11) | `96588521` (2026-05-11) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms |
| medium (untyped fold) | 0.002 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.002 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms |
| typed (annotated arithmetic) | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms |
| refinement-heavy (50 annotations) | 0.090 ms | 0.096 ms | 0.095 ms | 0.084 ms | 0.092 ms | 0.092 ms | 0.091 ms | 0.098 ms | 0.097 ms | 0.097 ms |
| effect-heavy (handler + perform) | 0.001 ms | 0.002 ms | 0.001 ms | 0.002 ms | 0.001 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.001 ms | 0.002 ms |
| eval-heavy (fib(15) recursion) | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.002 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms |

## 3. Pipeline: typecheck (cumulative — incl. tokenize + parse)

*`dvala.typecheck(source)` per program — full pipeline through the typechecker. Typecheck-only cost ≈ this − phase-tokenize − phase-parse.*

| Measurement | `60856de6` (2026-05-12) | `c8dead0a` (2026-05-12) | `47986f02` (2026-05-12) | `8fb25541` (2026-05-12) | `cb603452` (2026-05-11) | `648c0f17` (2026-05-11) | `e84df45c` (2026-05-11) | `81a785bc` (2026-05-11) | `3e396faf` (2026-05-11) | `96588521` (2026-05-11) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.008 ms | 0.007 ms | 0.009 ms | 0.005 ms | 0.007 ms | 0.008 ms | 0.006 ms | 0.007 ms | 0.008 ms | 0.005 ms |
| medium (untyped fold) | 0.034 ms | 0.034 ms | 0.034 ms | 0.036 ms | 0.035 ms | 0.033 ms | 0.034 ms | 0.036 ms | 0.035 ms | 0.034 ms |
| typed (annotated arithmetic) | 0.057 ms | 0.057 ms | 0.061 ms | 0.059 ms | 0.057 ms | 0.060 ms | 0.055 ms | 0.058 ms | 0.056 ms | 0.057 ms |
| refinement-heavy (50 annotations) | 5.438 ms | 5.666 ms | 5.752 ms | 5.667 ms | 5.426 ms | 5.754 ms | 5.671 ms | 5.939 ms | 5.951 ms | 5.661 ms |
| effect-heavy (handler + perform) | 0.021 ms | 0.023 ms | 0.023 ms | 0.022 ms | 0.022 ms | 0.024 ms | 0.022 ms | 0.030 ms | 0.024 ms | 0.022 ms |
| eval-heavy (fib(15) recursion) | 0.080 ms | 0.086 ms | 0.089 ms | 0.084 ms | 0.080 ms | 0.085 ms | 0.084 ms | 0.090 ms | 0.087 ms | 0.084 ms |

## 4. Pipeline: run (typecheck disabled)

*`dvala.run(source)` with typecheck disabled — captures tokenize + parse + evaluate. Evaluator-only cost ≈ this − phase-tokenize − phase-parse.*

| Measurement | `60856de6` (2026-05-12) | `c8dead0a` (2026-05-12) | `47986f02` (2026-05-12) | `8fb25541` (2026-05-12) | `cb603452` (2026-05-11) | `648c0f17` (2026-05-11) | `e84df45c` (2026-05-11) | `81a785bc` (2026-05-11) | `3e396faf` (2026-05-11) | `96588521` (2026-05-11) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.002 ms | 0.001 ms | 0.002 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms |
| medium (untyped fold) | 0.049 ms | 0.039 ms | 0.042 ms | 0.038 ms | 0.041 ms | 0.040 ms | 0.041 ms | 0.043 ms | 0.041 ms | 0.040 ms |
| typed (annotated arithmetic) | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms |
| refinement-heavy (50 annotations) | 0.068 ms | 0.075 ms | 0.074 ms | 0.072 ms | 0.076 ms | 0.078 ms | 0.076 ms | 0.079 ms | 0.078 ms | 0.073 ms |
| effect-heavy (handler + perform) | 0.005 ms | 0.006 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.006 ms |
| eval-heavy (fib(15) recursion) | 5.677 ms | 4.765 ms | 4.877 ms | 4.684 ms | 4.794 ms | 4.847 ms | 4.786 ms | 4.925 ms | 4.976 ms | 4.813 ms |

## 5. Pipeline: end-to-end (full)

*`dvala.run(source)` — tokenize + parse + typecheck + evaluate. The number a user actually observes.*

| Measurement | `60856de6` (2026-05-12) | `c8dead0a` (2026-05-12) | `47986f02` (2026-05-12) | `8fb25541` (2026-05-12) | `cb603452` (2026-05-11) | `648c0f17` (2026-05-11) | `e84df45c` (2026-05-11) | `81a785bc` (2026-05-11) | `3e396faf` (2026-05-11) | `96588521` (2026-05-11) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms |
| medium (untyped fold) | 0.059 ms | 0.048 ms | 0.048 ms | 0.047 ms | 0.046 ms | 0.048 ms | 0.049 ms | 0.052 ms | 0.050 ms | 0.048 ms |
| typed (annotated arithmetic) | 0.027 ms | 0.028 ms | 0.027 ms | 0.028 ms | 0.027 ms | 0.029 ms | 0.028 ms | 0.030 ms | 0.029 ms | 0.028 ms |
| refinement-heavy (50 annotations) | 0.659 ms | 0.688 ms | 0.660 ms | 0.695 ms | 0.688 ms | 0.691 ms | 0.720 ms | 0.758 ms | 0.754 ms | 0.722 ms |
| effect-heavy (handler + perform) | 0.008 ms | 0.008 ms | 0.008 ms | 0.009 ms | 0.009 ms | 0.009 ms | 0.009 ms | 0.010 ms | 0.010 ms | 0.010 ms |
| eval-heavy (fib(15) recursion) | 5.750 ms | 4.859 ms | 4.983 ms | 4.795 ms | 4.802 ms | 4.942 ms | 4.938 ms | 5.033 ms | 5.073 ms | 4.869 ms |

## 6. Refinement subtype-check cost (per predicate shape)

*isolated subtype-check calls between source type and refinement target — no parse or typecheck overhead*

| Measurement | `60856de6` (2026-05-12) | `c8dead0a` (2026-05-12) | `47986f02` (2026-05-12) | `8fb25541` (2026-05-12) | `cb603452` (2026-05-11) | `648c0f17` (2026-05-11) | `e84df45c` (2026-05-11) | `81a785bc` (2026-05-11) | `3e396faf` (2026-05-11) | `96588521` (2026-05-11) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| interval target — Number → {n \| n > 0 && n < 100} | 0.10 μs | 0.10 μs | 0.10 μs | 0.10 μs | 0.10 μs | 0.10 μs | 0.10 μs | 0.10 μs | 0.10 μs | 0.10 μs |
| set target — :ok → {x \| :ok \| :error} | 0.13 μs | 0.14 μs | 0.13 μs | 0.13 μs | 0.13 μs | 0.14 μs | 0.13 μs | 0.13 μs | 0.14 μs | 0.13 μs |
| count target — String → {s \| count(s) > 0} | 0.06 μs | 0.06 μs | 0.06 μs | 0.06 μs | 0.06 μs | 0.06 μs | 0.06 μs | 0.06 μs | 0.06 μs | 0.06 μs |
| excludedSet — Number → {n \| !=0 && !=1 && !=-1} | 0.22 μs | 0.22 μs | 0.22 μs | 0.21 μs | 0.21 μs | 0.22 μs | 0.22 μs | 0.23 μs | 0.23 μs | 0.23 μs |
| literal source — 50 → {n \| n > 0 && n < 100} | 0.10 μs | 0.11 μs | 0.11 μs | 0.11 μs | 0.11 μs | 0.11 μs | 0.10 μs | 0.11 μs | 0.11 μs | 0.12 μs |

## 7. Stacked refinement simplify scaling

*simplifying N stacked refinements (`Base & {p1} & {p2} & ... & {pN}`) — empirically O(N²); regressions show as a worse exponent*

| Measurement | `60856de6` (2026-05-12) | `c8dead0a` (2026-05-12) | `47986f02` (2026-05-12) | `8fb25541` (2026-05-12) | `cb603452` (2026-05-11) | `648c0f17` (2026-05-11) | `e84df45c` (2026-05-11) | `81a785bc` (2026-05-11) | `3e396faf` (2026-05-11) | `96588521` (2026-05-11) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| N= 2 stacked refinements | 0.82 μs | 0.88 μs | 0.87 μs | 0.83 μs | 0.82 μs | 0.90 μs | 0.87 μs | 0.84 μs | 0.95 μs | 0.92 μs |
| N= 4 stacked refinements | 3.55 μs | 3.69 μs | 3.68 μs | 3.51 μs | 3.55 μs | 3.72 μs | 3.71 μs | 3.66 μs | 3.81 μs | 3.65 μs |
| N= 8 stacked refinements | 15.02 μs | 15.90 μs | 15.82 μs | 15.29 μs | 15.05 μs | 16.06 μs | 15.60 μs | 15.89 μs | 16.41 μs | 15.95 μs |
| N=16 stacked refinements | 92.46 μs | 97.64 μs | 95.45 μs | 92.30 μs | 92.82 μs | 97.32 μs | 94.72 μs | 97.35 μs | 98.86 μs | 95.67 μs |
| N=32 stacked refinements | 491.54 μs | 517.28 μs | 497.06 μs | 488.17 μs | 491.45 μs | 509.29 μs | 497.56 μs | 513.61 μs | 517.02 μs | 501.49 μs |

## 8. Many-inequality refinement worst case

*`Number & {n | n != 1 && n != 2 && ... && n != N}` — documented quadratic worst case (each conjunction step merges against the growing exclusion list)*

| Measurement | `60856de6` (2026-05-12) | `c8dead0a` (2026-05-12) | `47986f02` (2026-05-12) | `8fb25541` (2026-05-12) | `cb603452` (2026-05-11) | `648c0f17` (2026-05-11) | `e84df45c` (2026-05-11) | `81a785bc` (2026-05-11) | `3e396faf` (2026-05-11) | `96588521` (2026-05-11) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| N= 10 (parse + simplify) | 29.19 μs | 29.49 μs | 30.44 μs | 29.46 μs | 28.24 μs | 30.43 μs | 29.87 μs | 30.48 μs | 30.53 μs | 30.22 μs |
| N= 50 (parse + simplify) | 190.74 μs | 192.65 μs | 195.14 μs | 183.68 μs | 187.60 μs | 198.35 μs | 190.92 μs | 196.62 μs | 193.84 μs | 191.83 μs |
| N=100 (parse + simplify) | 455.16 μs | 491.39 μs | 492.16 μs | 460.45 μs | 470.48 μs | 470.01 μs | 472.05 μs | 492.66 μs | 489.23 μs | 498.83 μs |

