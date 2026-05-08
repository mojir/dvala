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
| `aa573882` | 2026-05-08 17:02:38 | Fix runtime bridge review issues |
| `55ae08bd` | 2026-05-08 16:40:22 | Format runtime bridge files |
| `49845f9d` | 2026-05-08 16:34:53 | Clean up knip runtime bridge exports |
| `803d829c` | 2026-05-04 13:56:01 | unify REPL metadata across CLI and playground |
| `b17658d6` | 2026-04-29 18:50:52 | docs: drop stale destructured-ops mention from HandlerFunction.linear JSDoc |
| `b51e8bc6` | 2026-04-27 19:16:58 | refactor(shared-ls): make WorkspaceIndex truly path-free + review fixes |
| `ffaa479f` | 2026-04-27 14:24:20 | chore(toolchain): migrate to tsgo + oxlint + tsgolint + oxfmt |
| `105c551a` | 2026-04-26 16:33:58 | fix(typechecker): apply guard narrowing to match case bodies |
| `b3ad619f` | 2026-04-26 16:12:02 | fix(typechecker): intersect upper bounds for display, not union |
| `734e52fa` | 2026-04-26 15:52:33 | fix(typechecker): include base+source in varKey for Refined types |

## 1. Pipeline: tokenize

*pure tokenize cost — `tokenize(source)` for each corpus program*

| Measurement | `aa573882` (2026-05-08) | `55ae08bd` (2026-05-08) | `49845f9d` (2026-05-08) | `803d829c` (2026-05-04) | `b17658d6` (2026-04-29) | `b51e8bc6` (2026-04-27) | `ffaa479f` (2026-04-27) | `105c551a` (2026-04-26) | `b3ad619f` (2026-04-26) | `734e52fa` (2026-04-26) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms |
| medium (untyped fold) | 0.008 ms | 0.009 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms |
| typed (annotated arithmetic) | 0.010 ms | 0.011 ms | 0.010 ms | 0.010 ms | 0.010 ms | 0.009 ms | 0.010 ms | 0.010 ms | 0.010 ms | 0.010 ms |
| refinement-heavy (50 annotations) | 0.388 ms | 0.514 ms | 0.389 ms | 0.382 ms | 0.366 ms | 0.359 ms | 0.379 ms | 0.378 ms | 0.384 ms | 0.377 ms |
| effect-heavy (handler + perform) | 0.005 ms | 0.007 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms |
| eval-heavy (fib(15) recursion) | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms |

## 2. Pipeline: parse (pre-tokenized)

*parser cost only — `parseTokenStream(pre-tokenized)` for each corpus program*

| Measurement | `aa573882` (2026-05-08) | `55ae08bd` (2026-05-08) | `49845f9d` (2026-05-08) | `803d829c` (2026-05-04) | `b17658d6` (2026-04-29) | `b51e8bc6` (2026-04-27) | `ffaa479f` (2026-04-27) | `105c551a` (2026-04-26) | `b3ad619f` (2026-04-26) | `734e52fa` (2026-04-26) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.001 ms | 0.002 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms |
| medium (untyped fold) | 0.003 ms | 0.003 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms |
| typed (annotated arithmetic) | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.002 ms | 0.003 ms | 0.002 ms | 0.003 ms | 0.003 ms | 0.003 ms |
| refinement-heavy (50 annotations) | 0.094 ms | 0.113 ms | 0.082 ms | 0.085 ms | 0.079 ms | 0.083 ms | 0.088 ms | 0.088 ms | 0.089 ms | 0.088 ms |
| effect-heavy (handler + perform) | 0.001 ms | 0.002 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.002 ms | 0.001 ms | 0.001 ms | 0.001 ms |
| eval-heavy (fib(15) recursion) | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.002 ms | 0.003 ms | 0.003 ms | 0.002 ms | 0.003 ms |

## 3. Pipeline: typecheck (cumulative — incl. tokenize + parse)

*`dvala.typecheck(source)` per program — full pipeline through the typechecker. Typecheck-only cost ≈ this − phase-tokenize − phase-parse.*

| Measurement | `aa573882` (2026-05-08) | `55ae08bd` (2026-05-08) | `49845f9d` (2026-05-08) | `803d829c` (2026-05-04) | `b17658d6` (2026-04-29) | `b51e8bc6` (2026-04-27) | `ffaa479f` (2026-04-27) | `105c551a` (2026-04-26) | `b3ad619f` (2026-04-26) | `734e52fa` (2026-04-26) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.007 ms | 0.010 ms | 0.006 ms | 0.005 ms | 0.006 ms | 0.008 ms | 0.005 ms | 0.007 ms | 0.006 ms | 0.008 ms |
| medium (untyped fold) | 0.037 ms | 0.036 ms | 0.034 ms | 0.034 ms | 0.033 ms | 0.031 ms | 0.034 ms | 0.032 ms | 0.035 ms | 0.031 ms |
| typed (annotated arithmetic) | 0.056 ms | 0.069 ms | 0.055 ms | 0.056 ms | 0.052 ms | 0.053 ms | 0.053 ms | 0.053 ms | 0.058 ms | 0.051 ms |
| refinement-heavy (50 annotations) | 5.531 ms | 7.385 ms | 5.440 ms | 5.448 ms | 5.279 ms | 5.207 ms | 5.547 ms | 5.477 ms | 5.588 ms | 5.159 ms |
| effect-heavy (handler + perform) | 0.022 ms | 0.029 ms | 0.021 ms | 0.022 ms | 0.021 ms | 0.021 ms | 0.022 ms | 0.020 ms | 0.021 ms | 0.020 ms |
| eval-heavy (fib(15) recursion) | 0.082 ms | 0.099 ms | 0.080 ms | 0.078 ms | 0.074 ms | 0.076 ms | 0.080 ms | 0.079 ms | 0.080 ms | 0.077 ms |

## 4. Pipeline: run (typecheck disabled)

*`dvala.run(source)` with typecheck disabled — captures tokenize + parse + evaluate. Evaluator-only cost ≈ this − phase-tokenize − phase-parse.*

| Measurement | `aa573882` (2026-05-08) | `55ae08bd` (2026-05-08) | `49845f9d` (2026-05-08) | `803d829c` (2026-05-04) | `b17658d6` (2026-04-29) | `b51e8bc6` (2026-04-27) | `ffaa479f` (2026-04-27) | `105c551a` (2026-04-26) | `b3ad619f` (2026-04-26) | `734e52fa` (2026-04-26) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.001 ms | 0.002 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.002 ms | 0.001 ms | 0.001 ms |
| medium (untyped fold) | 0.039 ms | 0.042 ms | 0.038 ms | 0.038 ms | 0.036 ms | 0.036 ms | 0.038 ms | 0.038 ms | 0.038 ms | 0.037 ms |
| typed (annotated arithmetic) | 0.007 ms | 0.008 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.006 ms | 0.007 ms | 0.007 ms | 0.007 ms |
| refinement-heavy (50 annotations) | 0.076 ms | 0.162 ms | 0.066 ms | 0.067 ms | 0.065 ms | 0.072 ms | 0.081 ms | 0.082 ms | 0.070 ms | 0.072 ms |
| effect-heavy (handler + perform) | 0.005 ms | 0.007 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms |
| eval-heavy (fib(15) recursion) | 4.739 ms | 5.905 ms | 4.536 ms | 4.662 ms | 4.468 ms | 4.500 ms | 4.475 ms | 4.569 ms | 4.714 ms | 4.570 ms |

## 5. Pipeline: end-to-end (full)

*`dvala.run(source)` — tokenize + parse + typecheck + evaluate. The number a user actually observes.*

| Measurement | `aa573882` (2026-05-08) | `55ae08bd` (2026-05-08) | `49845f9d` (2026-05-08) | `803d829c` (2026-05-04) | `b17658d6` (2026-04-29) | `b51e8bc6` (2026-04-27) | `ffaa479f` (2026-04-27) | `105c551a` (2026-04-26) | `b3ad619f` (2026-04-26) | `734e52fa` (2026-04-26) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms |
| medium (untyped fold) | 0.048 ms | 0.050 ms | 0.045 ms | 0.046 ms | 0.043 ms | 0.045 ms | 0.045 ms | 0.047 ms | 0.047 ms | 0.045 ms |
| typed (annotated arithmetic) | 0.028 ms | 0.031 ms | 0.027 ms | 0.027 ms | 0.026 ms | 0.025 ms | 0.026 ms | 0.026 ms | 0.027 ms | 0.026 ms |
| refinement-heavy (50 annotations) | 0.661 ms | 0.810 ms | 0.663 ms | 0.635 ms | 0.651 ms | 0.599 ms | 0.603 ms | 0.619 ms | 0.625 ms | 0.589 ms |
| effect-heavy (handler + perform) | 0.008 ms | 0.011 ms | 0.009 ms | 0.008 ms | 0.008 ms | 0.007 ms | 0.008 ms | 0.008 ms | 0.007 ms | 0.007 ms |
| eval-heavy (fib(15) recursion) | 4.894 ms | 4.996 ms | 4.696 ms | 4.672 ms | 4.594 ms | 4.643 ms | 4.654 ms | 4.660 ms | 4.784 ms | 4.630 ms |

## 6. Refinement subtype-check cost (per predicate shape)

*isolated subtype-check calls between source type and refinement target — no parse or typecheck overhead*

| Measurement | `aa573882` (2026-05-08) | `55ae08bd` (2026-05-08) | `49845f9d` (2026-05-08) | `803d829c` (2026-05-04) | `b17658d6` (2026-04-29) | `b51e8bc6` (2026-04-27) | `ffaa479f` (2026-04-27) | `105c551a` (2026-04-26) | `b3ad619f` (2026-04-26) | `734e52fa` (2026-04-26) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| interval target — Number → {n \| n > 0 && n < 100} | 0.10 μs | 0.09 μs | 0.10 μs | 0.10 μs | 0.09 μs | 0.10 μs | 0.10 μs | 0.10 μs | 0.10 μs | 0.10 μs |
| set target — :ok → {x \| :ok \| :error} | 0.13 μs | 0.13 μs | 0.13 μs | 0.13 μs | 0.12 μs | 0.12 μs | 0.13 μs | 0.13 μs | 0.13 μs | 0.13 μs |
| count target — String → {s \| count(s) > 0} | 0.06 μs | 0.06 μs | 0.06 μs | 0.06 μs | 0.06 μs | 0.06 μs | 0.06 μs | 0.06 μs | 0.06 μs | 0.06 μs |
| excludedSet — Number → {n \| !=0 && !=1 && !=-1} | 0.22 μs | 0.22 μs | 0.23 μs | 0.21 μs | 0.21 μs | 0.21 μs | 0.22 μs | 0.22 μs | 0.22 μs | 0.21 μs |
| literal source — 50 → {n \| n > 0 && n < 100} | 0.11 μs | 0.11 μs | 0.12 μs | 0.10 μs | 0.10 μs | 0.11 μs | 0.11 μs | 0.11 μs | 0.11 μs | 0.10 μs |

## 7. Stacked refinement simplify scaling

*simplifying N stacked refinements (`Base & {p1} & {p2} & ... & {pN}`) — empirically O(N²); regressions show as a worse exponent*

| Measurement | `aa573882` (2026-05-08) | `55ae08bd` (2026-05-08) | `49845f9d` (2026-05-08) | `803d829c` (2026-05-04) | `b17658d6` (2026-04-29) | `b51e8bc6` (2026-04-27) | `ffaa479f` (2026-04-27) | `105c551a` (2026-04-26) | `b3ad619f` (2026-04-26) | `734e52fa` (2026-04-26) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| N= 2 stacked refinements | 0.87 μs | 0.95 μs | 0.85 μs | 0.85 μs | 0.84 μs | 0.87 μs | 0.82 μs | 0.82 μs | 0.85 μs | 0.82 μs |
| N= 4 stacked refinements | 3.57 μs | 3.63 μs | 3.57 μs | 3.51 μs | 3.38 μs | 3.44 μs | 3.44 μs | 3.52 μs | 3.49 μs | 3.52 μs |
| N= 8 stacked refinements | 15.39 μs | 15.60 μs | 15.21 μs | 15.23 μs | 14.61 μs | 14.95 μs | 14.72 μs | 15.12 μs | 15.15 μs | 15.32 μs |
| N=16 stacked refinements | 93.09 μs | 96.03 μs | 92.84 μs | 92.77 μs | 90.19 μs | 89.28 μs | 90.75 μs | 92.51 μs | 92.60 μs | 93.50 μs |
| N=32 stacked refinements | 487.72 μs | 506.49 μs | 486.81 μs | 514.56 μs | 477.41 μs | 476.91 μs | 478.14 μs | 490.57 μs | 490.86 μs | 490.74 μs |

## 8. Many-inequality refinement worst case

*`Number & {n | n != 1 && n != 2 && ... && n != N}` — documented quadratic worst case (each conjunction step merges against the growing exclusion list)*

| Measurement | `aa573882` (2026-05-08) | `55ae08bd` (2026-05-08) | `49845f9d` (2026-05-08) | `803d829c` (2026-05-04) | `b17658d6` (2026-04-29) | `b51e8bc6` (2026-04-27) | `ffaa479f` (2026-04-27) | `105c551a` (2026-04-26) | `b3ad619f` (2026-04-26) | `734e52fa` (2026-04-26) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| N= 10 (parse + simplify) | 29.44 μs | 29.37 μs | 28.39 μs | 32.71 μs | 27.84 μs | 27.70 μs | 28.57 μs | 30.28 μs | 29.69 μs | 28.76 μs |
| N= 50 (parse + simplify) | 186.22 μs | 197.13 μs | 178.89 μs | 206.28 μs | 178.23 μs | 178.13 μs | 182.77 μs | 194.15 μs | 190.99 μs | 184.92 μs |
| N=100 (parse + simplify) | 456.72 μs | 471.71 μs | 451.86 μs | 485.79 μs | 446.62 μs | 448.65 μs | 445.70 μs | 460.45 μs | 459.46 μs | 480.16 μs |

