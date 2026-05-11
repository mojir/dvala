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
| `e84df45c` | 2026-05-11 19:33:22 | Restore playground runtime debug mode |
| `81a785bc` | 2026-05-11 19:13:25 | Route playground runtime through backend |
| `3e396faf` | 2026-05-11 19:04:48 | Accept effect handlers in backend startSession |
| `96588521` | 2026-05-11 19:02:00 | Add backend runtime session seam |
| `d6f5c690` | 2026-05-11 18:46:59 | Route navigation through backend |
| `861a9bbc` | 2026-05-11 18:35:56 | Route completion through backend |
| `be9cc153` | 2026-05-11 18:17:05 | Route hover through backend |
| `25513287` | 2026-05-11 18:06:01 | Route formatting through backend |
| `6244c7bb` | 2026-05-08 22:55:00 | Add first backend API boundary |
| `49731985` | 2026-05-08 17:30:41 | Stop exporting internal bridge helpers |

## 1. Pipeline: tokenize

*pure tokenize cost — `tokenize(source)` for each corpus program*

| Measurement | `e84df45c` (2026-05-11) | `81a785bc` (2026-05-11) | `3e396faf` (2026-05-11) | `96588521` (2026-05-11) | `d6f5c690` (2026-05-11) | `861a9bbc` (2026-05-11) | `be9cc153` (2026-05-11) | `25513287` (2026-05-11) | `6244c7bb` (2026-05-08) | `49731985` (2026-05-08) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms |
| medium (untyped fold) | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms |
| typed (annotated arithmetic) | 0.010 ms | 0.010 ms | 0.010 ms | 0.010 ms | 0.010 ms | 0.010 ms | 0.010 ms | 0.010 ms | 0.010 ms | 0.010 ms |
| refinement-heavy (50 annotations) | 0.385 ms | 0.398 ms | 0.395 ms | 0.387 ms | 0.387 ms | 0.375 ms | 0.377 ms | 0.384 ms | 0.379 ms | 0.393 ms |
| effect-heavy (handler + perform) | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms |
| eval-heavy (fib(15) recursion) | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.006 ms | 0.007 ms |

## 2. Pipeline: parse (pre-tokenized)

*parser cost only — `parseTokenStream(pre-tokenized)` for each corpus program*

| Measurement | `e84df45c` (2026-05-11) | `81a785bc` (2026-05-11) | `3e396faf` (2026-05-11) | `96588521` (2026-05-11) | `d6f5c690` (2026-05-11) | `861a9bbc` (2026-05-11) | `be9cc153` (2026-05-11) | `25513287` (2026-05-11) | `6244c7bb` (2026-05-08) | `49731985` (2026-05-08) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms |
| medium (untyped fold) | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.002 ms | 0.002 ms | 0.003 ms | 0.003 ms | 0.003 ms |
| typed (annotated arithmetic) | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms |
| refinement-heavy (50 annotations) | 0.091 ms | 0.098 ms | 0.097 ms | 0.097 ms | 0.093 ms | 0.093 ms | 0.089 ms | 0.096 ms | 0.093 ms | 0.094 ms |
| effect-heavy (handler + perform) | 0.002 ms | 0.002 ms | 0.001 ms | 0.002 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms |
| eval-heavy (fib(15) recursion) | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.002 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms |

## 3. Pipeline: typecheck (cumulative — incl. tokenize + parse)

*`dvala.typecheck(source)` per program — full pipeline through the typechecker. Typecheck-only cost ≈ this − phase-tokenize − phase-parse.*

| Measurement | `e84df45c` (2026-05-11) | `81a785bc` (2026-05-11) | `3e396faf` (2026-05-11) | `96588521` (2026-05-11) | `d6f5c690` (2026-05-11) | `861a9bbc` (2026-05-11) | `be9cc153` (2026-05-11) | `25513287` (2026-05-11) | `6244c7bb` (2026-05-08) | `49731985` (2026-05-08) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.006 ms | 0.007 ms | 0.008 ms | 0.005 ms | 0.008 ms | 0.005 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.005 ms |
| medium (untyped fold) | 0.034 ms | 0.036 ms | 0.035 ms | 0.034 ms | 0.035 ms | 0.036 ms | 0.034 ms | 0.034 ms | 0.036 ms | 0.036 ms |
| typed (annotated arithmetic) | 0.055 ms | 0.058 ms | 0.056 ms | 0.057 ms | 0.058 ms | 0.056 ms | 0.056 ms | 0.055 ms | 0.057 ms | 0.057 ms |
| refinement-heavy (50 annotations) | 5.671 ms | 5.939 ms | 5.951 ms | 5.661 ms | 5.689 ms | 5.501 ms | 5.496 ms | 5.394 ms | 5.464 ms | 5.810 ms |
| effect-heavy (handler + perform) | 0.022 ms | 0.030 ms | 0.024 ms | 0.022 ms | 0.023 ms | 0.023 ms | 0.023 ms | 0.021 ms | 0.023 ms | 0.024 ms |
| eval-heavy (fib(15) recursion) | 0.084 ms | 0.090 ms | 0.087 ms | 0.084 ms | 0.083 ms | 0.081 ms | 0.081 ms | 0.085 ms | 0.081 ms | 0.082 ms |

## 4. Pipeline: run (typecheck disabled)

*`dvala.run(source)` with typecheck disabled — captures tokenize + parse + evaluate. Evaluator-only cost ≈ this − phase-tokenize − phase-parse.*

| Measurement | `e84df45c` (2026-05-11) | `81a785bc` (2026-05-11) | `3e396faf` (2026-05-11) | `96588521` (2026-05-11) | `d6f5c690` (2026-05-11) | `861a9bbc` (2026-05-11) | `be9cc153` (2026-05-11) | `25513287` (2026-05-11) | `6244c7bb` (2026-05-08) | `49731985` (2026-05-08) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.002 ms | 0.001 ms | 0.002 ms | 0.001 ms | 0.001 ms |
| medium (untyped fold) | 0.041 ms | 0.043 ms | 0.041 ms | 0.040 ms | 0.040 ms | 0.041 ms | 0.038 ms | 0.038 ms | 0.039 ms | 0.039 ms |
| typed (annotated arithmetic) | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.008 ms | 0.008 ms | 0.006 ms | 0.007 ms | 0.007 ms |
| refinement-heavy (50 annotations) | 0.076 ms | 0.079 ms | 0.078 ms | 0.073 ms | 0.077 ms | 0.075 ms | 0.070 ms | 0.074 ms | 0.111 ms | 0.071 ms |
| effect-heavy (handler + perform) | 0.005 ms | 0.005 ms | 0.005 ms | 0.006 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.006 ms |
| eval-heavy (fib(15) recursion) | 4.786 ms | 4.925 ms | 4.976 ms | 4.813 ms | 4.911 ms | 4.709 ms | 4.563 ms | 4.541 ms | 4.703 ms | 4.772 ms |

## 5. Pipeline: end-to-end (full)

*`dvala.run(source)` — tokenize + parse + typecheck + evaluate. The number a user actually observes.*

| Measurement | `e84df45c` (2026-05-11) | `81a785bc` (2026-05-11) | `3e396faf` (2026-05-11) | `96588521` (2026-05-11) | `d6f5c690` (2026-05-11) | `861a9bbc` (2026-05-11) | `be9cc153` (2026-05-11) | `25513287` (2026-05-11) | `6244c7bb` (2026-05-08) | `49731985` (2026-05-08) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms |
| medium (untyped fold) | 0.049 ms | 0.052 ms | 0.050 ms | 0.048 ms | 0.049 ms | 0.046 ms | 0.046 ms | 0.046 ms | 0.047 ms | 0.048 ms |
| typed (annotated arithmetic) | 0.028 ms | 0.030 ms | 0.029 ms | 0.028 ms | 0.028 ms | 0.028 ms | 0.027 ms | 0.027 ms | 0.028 ms | 0.027 ms |
| refinement-heavy (50 annotations) | 0.720 ms | 0.758 ms | 0.754 ms | 0.722 ms | 0.738 ms | 0.719 ms | 0.705 ms | 0.688 ms | 0.711 ms | 0.645 ms |
| effect-heavy (handler + perform) | 0.009 ms | 0.010 ms | 0.010 ms | 0.010 ms | 0.010 ms | 0.009 ms | 0.009 ms | 0.009 ms | 0.009 ms | 0.009 ms |
| eval-heavy (fib(15) recursion) | 4.938 ms | 5.033 ms | 5.073 ms | 4.869 ms | 5.045 ms | 4.821 ms | 4.720 ms | 4.725 ms | 4.790 ms | 4.860 ms |

## 6. Refinement subtype-check cost (per predicate shape)

*isolated subtype-check calls between source type and refinement target — no parse or typecheck overhead*

| Measurement | `e84df45c` (2026-05-11) | `81a785bc` (2026-05-11) | `3e396faf` (2026-05-11) | `96588521` (2026-05-11) | `d6f5c690` (2026-05-11) | `861a9bbc` (2026-05-11) | `be9cc153` (2026-05-11) | `25513287` (2026-05-11) | `6244c7bb` (2026-05-08) | `49731985` (2026-05-08) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| interval target — Number → {n \| n > 0 && n < 100} | 0.10 μs | 0.10 μs | 0.10 μs | 0.10 μs | 0.10 μs | 0.09 μs | 0.10 μs | 0.10 μs | 0.09 μs | 0.10 μs |
| set target — :ok → {x \| :ok \| :error} | 0.13 μs | 0.13 μs | 0.14 μs | 0.13 μs | 0.14 μs | 0.13 μs | 0.13 μs | 0.13 μs | 0.13 μs | 0.13 μs |
| count target — String → {s \| count(s) > 0} | 0.06 μs | 0.06 μs | 0.06 μs | 0.06 μs | 0.06 μs | 0.06 μs | 0.06 μs | 0.06 μs | 0.06 μs | 0.06 μs |
| excludedSet — Number → {n \| !=0 && !=1 && !=-1} | 0.22 μs | 0.23 μs | 0.23 μs | 0.23 μs | 0.22 μs | 0.22 μs | 0.22 μs | 0.21 μs | 0.22 μs | 0.22 μs |
| literal source — 50 → {n \| n > 0 && n < 100} | 0.10 μs | 0.11 μs | 0.11 μs | 0.12 μs | 0.11 μs | 0.11 μs | 0.11 μs | 0.11 μs | 0.11 μs | 0.11 μs |

## 7. Stacked refinement simplify scaling

*simplifying N stacked refinements (`Base & {p1} & {p2} & ... & {pN}`) — empirically O(N²); regressions show as a worse exponent*

| Measurement | `e84df45c` (2026-05-11) | `81a785bc` (2026-05-11) | `3e396faf` (2026-05-11) | `96588521` (2026-05-11) | `d6f5c690` (2026-05-11) | `861a9bbc` (2026-05-11) | `be9cc153` (2026-05-11) | `25513287` (2026-05-11) | `6244c7bb` (2026-05-08) | `49731985` (2026-05-08) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| N= 2 stacked refinements | 0.87 μs | 0.84 μs | 0.95 μs | 0.92 μs | 0.93 μs | 0.85 μs | 0.85 μs | 0.89 μs | 0.85 μs | 0.89 μs |
| N= 4 stacked refinements | 3.71 μs | 3.66 μs | 3.81 μs | 3.65 μs | 3.72 μs | 3.57 μs | 3.62 μs | 3.56 μs | 3.50 μs | 3.67 μs |
| N= 8 stacked refinements | 15.60 μs | 15.89 μs | 16.41 μs | 15.95 μs | 16.02 μs | 15.41 μs | 15.86 μs | 15.20 μs | 15.48 μs | 15.71 μs |
| N=16 stacked refinements | 94.72 μs | 97.35 μs | 98.86 μs | 95.67 μs | 97.35 μs | 94.54 μs | 93.92 μs | 91.73 μs | 93.10 μs | 94.91 μs |
| N=32 stacked refinements | 497.56 μs | 513.61 μs | 517.02 μs | 501.49 μs | 511.21 μs | 501.06 μs | 494.82 μs | 483.05 μs | 489.80 μs | 504.04 μs |

## 8. Many-inequality refinement worst case

*`Number & {n | n != 1 && n != 2 && ... && n != N}` — documented quadratic worst case (each conjunction step merges against the growing exclusion list)*

| Measurement | `e84df45c` (2026-05-11) | `81a785bc` (2026-05-11) | `3e396faf` (2026-05-11) | `96588521` (2026-05-11) | `d6f5c690` (2026-05-11) | `861a9bbc` (2026-05-11) | `be9cc153` (2026-05-11) | `25513287` (2026-05-11) | `6244c7bb` (2026-05-08) | `49731985` (2026-05-08) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| N= 10 (parse + simplify) | 29.87 μs | 30.48 μs | 30.53 μs | 30.22 μs | 30.56 μs | 29.29 μs | 31.09 μs | 29.43 μs | 29.97 μs | 30.27 μs |
| N= 50 (parse + simplify) | 190.92 μs | 196.62 μs | 193.84 μs | 191.83 μs | 194.20 μs | 186.30 μs | 194.74 μs | 186.86 μs | 186.17 μs | 193.65 μs |
| N=100 (parse + simplify) | 472.05 μs | 492.66 μs | 489.23 μs | 498.83 μs | 501.85 μs | 469.85 μs | 481.14 μs | 482.02 μs | 466.91 μs | 480.09 μs |

