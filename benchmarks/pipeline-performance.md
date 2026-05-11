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
| `25513287` | 2026-05-11 18:06:01 | Route formatting through backend |
| `6244c7bb` | 2026-05-08 22:55:00 | Add first backend API boundary |
| `49731985` | 2026-05-08 17:30:41 | Stop exporting internal bridge helpers |
| `aa573882` | 2026-05-08 17:02:38 | Fix runtime bridge review issues |
| `55ae08bd` | 2026-05-08 16:40:22 | Format runtime bridge files |
| `49845f9d` | 2026-05-08 16:34:53 | Clean up knip runtime bridge exports |
| `803d829c` | 2026-05-04 13:56:01 | unify REPL metadata across CLI and playground |
| `b17658d6` | 2026-04-29 18:50:52 | docs: drop stale destructured-ops mention from HandlerFunction.linear JSDoc |
| `b51e8bc6` | 2026-04-27 19:16:58 | refactor(shared-ls): make WorkspaceIndex truly path-free + review fixes |
| `ffaa479f` | 2026-04-27 14:24:20 | chore(toolchain): migrate to tsgo + oxlint + tsgolint + oxfmt |

## 1. Pipeline: tokenize

*pure tokenize cost — `tokenize(source)` for each corpus program*

| Measurement | `25513287` (2026-05-11) | `6244c7bb` (2026-05-08) | `49731985` (2026-05-08) | `aa573882` (2026-05-08) | `55ae08bd` (2026-05-08) | `49845f9d` (2026-05-08) | `803d829c` (2026-05-04) | `b17658d6` (2026-04-29) | `b51e8bc6` (2026-04-27) | `ffaa479f` (2026-04-27) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms |
| medium (untyped fold) | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.009 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms |
| typed (annotated arithmetic) | 0.010 ms | 0.010 ms | 0.010 ms | 0.010 ms | 0.011 ms | 0.010 ms | 0.010 ms | 0.010 ms | 0.009 ms | 0.010 ms |
| refinement-heavy (50 annotations) | 0.384 ms | 0.379 ms | 0.393 ms | 0.388 ms | 0.514 ms | 0.389 ms | 0.382 ms | 0.366 ms | 0.359 ms | 0.379 ms |
| effect-heavy (handler + perform) | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.007 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms |
| eval-heavy (fib(15) recursion) | 0.007 ms | 0.006 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms |

## 2. Pipeline: parse (pre-tokenized)

*parser cost only — `parseTokenStream(pre-tokenized)` for each corpus program*

| Measurement | `25513287` (2026-05-11) | `6244c7bb` (2026-05-08) | `49731985` (2026-05-08) | `aa573882` (2026-05-08) | `55ae08bd` (2026-05-08) | `49845f9d` (2026-05-08) | `803d829c` (2026-05-04) | `b17658d6` (2026-04-29) | `b51e8bc6` (2026-04-27) | `ffaa479f` (2026-04-27) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.002 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms |
| medium (untyped fold) | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms |
| typed (annotated arithmetic) | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.002 ms | 0.003 ms | 0.002 ms |
| refinement-heavy (50 annotations) | 0.096 ms | 0.093 ms | 0.094 ms | 0.094 ms | 0.113 ms | 0.082 ms | 0.085 ms | 0.079 ms | 0.083 ms | 0.088 ms |
| effect-heavy (handler + perform) | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.002 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.002 ms |
| eval-heavy (fib(15) recursion) | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.002 ms | 0.003 ms |

## 3. Pipeline: typecheck (cumulative — incl. tokenize + parse)

*`dvala.typecheck(source)` per program — full pipeline through the typechecker. Typecheck-only cost ≈ this − phase-tokenize − phase-parse.*

| Measurement | `25513287` (2026-05-11) | `6244c7bb` (2026-05-08) | `49731985` (2026-05-08) | `aa573882` (2026-05-08) | `55ae08bd` (2026-05-08) | `49845f9d` (2026-05-08) | `803d829c` (2026-05-04) | `b17658d6` (2026-04-29) | `b51e8bc6` (2026-04-27) | `ffaa479f` (2026-04-27) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.007 ms | 0.007 ms | 0.005 ms | 0.007 ms | 0.010 ms | 0.006 ms | 0.005 ms | 0.006 ms | 0.008 ms | 0.005 ms |
| medium (untyped fold) | 0.034 ms | 0.036 ms | 0.036 ms | 0.037 ms | 0.036 ms | 0.034 ms | 0.034 ms | 0.033 ms | 0.031 ms | 0.034 ms |
| typed (annotated arithmetic) | 0.055 ms | 0.057 ms | 0.057 ms | 0.056 ms | 0.069 ms | 0.055 ms | 0.056 ms | 0.052 ms | 0.053 ms | 0.053 ms |
| refinement-heavy (50 annotations) | 5.394 ms | 5.464 ms | 5.810 ms | 5.531 ms | 7.385 ms | 5.440 ms | 5.448 ms | 5.279 ms | 5.207 ms | 5.547 ms |
| effect-heavy (handler + perform) | 0.021 ms | 0.023 ms | 0.024 ms | 0.022 ms | 0.029 ms | 0.021 ms | 0.022 ms | 0.021 ms | 0.021 ms | 0.022 ms |
| eval-heavy (fib(15) recursion) | 0.085 ms | 0.081 ms | 0.082 ms | 0.082 ms | 0.099 ms | 0.080 ms | 0.078 ms | 0.074 ms | 0.076 ms | 0.080 ms |

## 4. Pipeline: run (typecheck disabled)

*`dvala.run(source)` with typecheck disabled — captures tokenize + parse + evaluate. Evaluator-only cost ≈ this − phase-tokenize − phase-parse.*

| Measurement | `25513287` (2026-05-11) | `6244c7bb` (2026-05-08) | `49731985` (2026-05-08) | `aa573882` (2026-05-08) | `55ae08bd` (2026-05-08) | `49845f9d` (2026-05-08) | `803d829c` (2026-05-04) | `b17658d6` (2026-04-29) | `b51e8bc6` (2026-04-27) | `ffaa479f` (2026-04-27) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.002 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.002 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms |
| medium (untyped fold) | 0.038 ms | 0.039 ms | 0.039 ms | 0.039 ms | 0.042 ms | 0.038 ms | 0.038 ms | 0.036 ms | 0.036 ms | 0.038 ms |
| typed (annotated arithmetic) | 0.006 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.008 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.006 ms |
| refinement-heavy (50 annotations) | 0.074 ms | 0.111 ms | 0.071 ms | 0.076 ms | 0.162 ms | 0.066 ms | 0.067 ms | 0.065 ms | 0.072 ms | 0.081 ms |
| effect-heavy (handler + perform) | 0.005 ms | 0.005 ms | 0.006 ms | 0.005 ms | 0.007 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms |
| eval-heavy (fib(15) recursion) | 4.541 ms | 4.703 ms | 4.772 ms | 4.739 ms | 5.905 ms | 4.536 ms | 4.662 ms | 4.468 ms | 4.500 ms | 4.475 ms |

## 5. Pipeline: end-to-end (full)

*`dvala.run(source)` — tokenize + parse + typecheck + evaluate. The number a user actually observes.*

| Measurement | `25513287` (2026-05-11) | `6244c7bb` (2026-05-08) | `49731985` (2026-05-08) | `aa573882` (2026-05-08) | `55ae08bd` (2026-05-08) | `49845f9d` (2026-05-08) | `803d829c` (2026-05-04) | `b17658d6` (2026-04-29) | `b51e8bc6` (2026-04-27) | `ffaa479f` (2026-04-27) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms |
| medium (untyped fold) | 0.046 ms | 0.047 ms | 0.048 ms | 0.048 ms | 0.050 ms | 0.045 ms | 0.046 ms | 0.043 ms | 0.045 ms | 0.045 ms |
| typed (annotated arithmetic) | 0.027 ms | 0.028 ms | 0.027 ms | 0.028 ms | 0.031 ms | 0.027 ms | 0.027 ms | 0.026 ms | 0.025 ms | 0.026 ms |
| refinement-heavy (50 annotations) | 0.688 ms | 0.711 ms | 0.645 ms | 0.661 ms | 0.810 ms | 0.663 ms | 0.635 ms | 0.651 ms | 0.599 ms | 0.603 ms |
| effect-heavy (handler + perform) | 0.009 ms | 0.009 ms | 0.009 ms | 0.008 ms | 0.011 ms | 0.009 ms | 0.008 ms | 0.008 ms | 0.007 ms | 0.008 ms |
| eval-heavy (fib(15) recursion) | 4.725 ms | 4.790 ms | 4.860 ms | 4.894 ms | 4.996 ms | 4.696 ms | 4.672 ms | 4.594 ms | 4.643 ms | 4.654 ms |

## 6. Refinement subtype-check cost (per predicate shape)

*isolated subtype-check calls between source type and refinement target — no parse or typecheck overhead*

| Measurement | `25513287` (2026-05-11) | `6244c7bb` (2026-05-08) | `49731985` (2026-05-08) | `aa573882` (2026-05-08) | `55ae08bd` (2026-05-08) | `49845f9d` (2026-05-08) | `803d829c` (2026-05-04) | `b17658d6` (2026-04-29) | `b51e8bc6` (2026-04-27) | `ffaa479f` (2026-04-27) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| interval target — Number → {n \| n > 0 && n < 100} | 0.10 μs | 0.09 μs | 0.10 μs | 0.10 μs | 0.09 μs | 0.10 μs | 0.10 μs | 0.09 μs | 0.10 μs | 0.10 μs |
| set target — :ok → {x \| :ok \| :error} | 0.13 μs | 0.13 μs | 0.13 μs | 0.13 μs | 0.13 μs | 0.13 μs | 0.13 μs | 0.12 μs | 0.12 μs | 0.13 μs |
| count target — String → {s \| count(s) > 0} | 0.06 μs | 0.06 μs | 0.06 μs | 0.06 μs | 0.06 μs | 0.06 μs | 0.06 μs | 0.06 μs | 0.06 μs | 0.06 μs |
| excludedSet — Number → {n \| !=0 && !=1 && !=-1} | 0.21 μs | 0.22 μs | 0.22 μs | 0.22 μs | 0.22 μs | 0.23 μs | 0.21 μs | 0.21 μs | 0.21 μs | 0.22 μs |
| literal source — 50 → {n \| n > 0 && n < 100} | 0.11 μs | 0.11 μs | 0.11 μs | 0.11 μs | 0.11 μs | 0.12 μs | 0.10 μs | 0.10 μs | 0.11 μs | 0.11 μs |

## 7. Stacked refinement simplify scaling

*simplifying N stacked refinements (`Base & {p1} & {p2} & ... & {pN}`) — empirically O(N²); regressions show as a worse exponent*

| Measurement | `25513287` (2026-05-11) | `6244c7bb` (2026-05-08) | `49731985` (2026-05-08) | `aa573882` (2026-05-08) | `55ae08bd` (2026-05-08) | `49845f9d` (2026-05-08) | `803d829c` (2026-05-04) | `b17658d6` (2026-04-29) | `b51e8bc6` (2026-04-27) | `ffaa479f` (2026-04-27) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| N= 2 stacked refinements | 0.89 μs | 0.85 μs | 0.89 μs | 0.87 μs | 0.95 μs | 0.85 μs | 0.85 μs | 0.84 μs | 0.87 μs | 0.82 μs |
| N= 4 stacked refinements | 3.56 μs | 3.50 μs | 3.67 μs | 3.57 μs | 3.63 μs | 3.57 μs | 3.51 μs | 3.38 μs | 3.44 μs | 3.44 μs |
| N= 8 stacked refinements | 15.20 μs | 15.48 μs | 15.71 μs | 15.39 μs | 15.60 μs | 15.21 μs | 15.23 μs | 14.61 μs | 14.95 μs | 14.72 μs |
| N=16 stacked refinements | 91.73 μs | 93.10 μs | 94.91 μs | 93.09 μs | 96.03 μs | 92.84 μs | 92.77 μs | 90.19 μs | 89.28 μs | 90.75 μs |
| N=32 stacked refinements | 483.05 μs | 489.80 μs | 504.04 μs | 487.72 μs | 506.49 μs | 486.81 μs | 514.56 μs | 477.41 μs | 476.91 μs | 478.14 μs |

## 8. Many-inequality refinement worst case

*`Number & {n | n != 1 && n != 2 && ... && n != N}` — documented quadratic worst case (each conjunction step merges against the growing exclusion list)*

| Measurement | `25513287` (2026-05-11) | `6244c7bb` (2026-05-08) | `49731985` (2026-05-08) | `aa573882` (2026-05-08) | `55ae08bd` (2026-05-08) | `49845f9d` (2026-05-08) | `803d829c` (2026-05-04) | `b17658d6` (2026-04-29) | `b51e8bc6` (2026-04-27) | `ffaa479f` (2026-04-27) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| N= 10 (parse + simplify) | 29.43 μs | 29.97 μs | 30.27 μs | 29.44 μs | 29.37 μs | 28.39 μs | 32.71 μs | 27.84 μs | 27.70 μs | 28.57 μs |
| N= 50 (parse + simplify) | 186.86 μs | 186.17 μs | 193.65 μs | 186.22 μs | 197.13 μs | 178.89 μs | 206.28 μs | 178.23 μs | 178.13 μs | 182.77 μs |
| N=100 (parse + simplify) | 482.02 μs | 466.91 μs | 480.09 μs | 456.72 μs | 471.71 μs | 451.86 μs | 485.79 μs | 446.62 μs | 448.65 μs | 445.70 μs |

