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
| `fc2cb805` | 2026-06-12 07:14:16 | fix: record core builtins' init-time coverage in the union baseline |
| `508c8a21` | 2026-06-11 21:37:00 | fix: flag spread (`...expr`) as a structural leaf for coverage |
| `bfb86828` | 2026-06-11 19:53:38 | fix: eliminate false-negative .dvala coverage from discarded parser nodes |
| `9d65b8a2` | 2026-06-11 16:26:00 | feat: module .dvala coverage in the DVALA_COVERAGE union baseline |
| `b511715b` | 2026-06-09 13:06:02 | feat: measure .dvala builtin coverage from the TS unit suite |
| `194f915f` | 2026-06-09 08:15:39 | refactor: migrate 9 core predicates from TS to predicates.dvala |
| `40ec5a00` | 2026-06-04 22:00:48 | parser: extend binary-op Call/And/Or/Qq source-map ranges to span the full expression |
| `c8ba0be4` | 2026-06-04 20:43:54 | vscode-dvala: code actions — insert-catchall quick-fix (LS Q4 #5a) |
| `34868b99` | 2026-06-04 14:28:15 | vscode-dvala: semantic tokens + inlay hints (Q4 lighter pair) |
| `3ac58715` | 2026-06-04 12:02:17 | typecheck: fold-true catchall detection runs in both DVALA_FOLD modes |

## 1. Pipeline: tokenize

*pure tokenize cost — `tokenize(source)` for each corpus program*

| Measurement | `fc2cb805` (2026-06-12) | `508c8a21` (2026-06-11) | `bfb86828` (2026-06-11) | `9d65b8a2` (2026-06-11) | `b511715b` (2026-06-09) | `194f915f` (2026-06-09) | `40ec5a00` (2026-06-04) | `c8ba0be4` (2026-06-04) | `34868b99` (2026-06-04) | `3ac58715` (2026-06-04) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms |
| medium (untyped fold) | 0.008 ms | 0.008 ms | 0.008 ms | 0.009 ms | 0.009 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms |
| typed (annotated arithmetic) | 0.009 ms | 0.009 ms | 0.010 ms | 0.011 ms | 0.010 ms | 0.010 ms | 0.010 ms | 0.010 ms | 0.010 ms | 0.010 ms |
| refinement-heavy (50 annotations) | 0.363 ms | 0.360 ms | 0.387 ms | 0.410 ms | 0.396 ms | 0.376 ms | 0.371 ms | 0.370 ms | 0.361 ms | 0.385 ms |
| effect-heavy (handler + perform) | 0.004 ms | 0.004 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.004 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms |
| eval-heavy (fib(15) recursion) | 0.007 ms | 0.006 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.006 ms | 0.007 ms | 0.006 ms | 0.006 ms | 0.007 ms |

## 2. Pipeline: parse (pre-tokenized)

*parser cost only — `parseTokenStream(pre-tokenized)` for each corpus program*

| Measurement | `fc2cb805` (2026-06-12) | `508c8a21` (2026-06-11) | `bfb86828` (2026-06-11) | `9d65b8a2` (2026-06-11) | `b511715b` (2026-06-09) | `194f915f` (2026-06-09) | `40ec5a00` (2026-06-04) | `c8ba0be4` (2026-06-04) | `34868b99` (2026-06-04) | `3ac58715` (2026-06-04) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms |
| medium (untyped fold) | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms |
| typed (annotated arithmetic) | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms |
| refinement-heavy (50 annotations) | 0.081 ms | 0.080 ms | 0.073 ms | 0.075 ms | 0.073 ms | 0.070 ms | 0.080 ms | 0.080 ms | 0.077 ms | 0.080 ms |
| effect-heavy (handler + perform) | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms |
| eval-heavy (fib(15) recursion) | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms |

## 3. Pipeline: typecheck (cumulative — incl. tokenize + parse)

*`dvala.typecheck(source)` per program — full pipeline through the typechecker. Typecheck-only cost ≈ this − phase-tokenize − phase-parse.*

| Measurement | `fc2cb805` (2026-06-12) | `508c8a21` (2026-06-11) | `bfb86828` (2026-06-11) | `9d65b8a2` (2026-06-11) | `b511715b` (2026-06-09) | `194f915f` (2026-06-09) | `40ec5a00` (2026-06-04) | `c8ba0be4` (2026-06-04) | `34868b99` (2026-06-04) | `3ac58715` (2026-06-04) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.054 ms | 0.056 ms | 0.058 ms | 0.061 ms | 0.057 ms | 0.057 ms | 0.053 ms | 0.054 ms | 0.052 ms | 0.055 ms |
| medium (untyped fold) | 0.065 ms | 0.066 ms | 0.066 ms | 0.071 ms | 0.066 ms | 0.065 ms | 0.061 ms | 0.062 ms | 0.060 ms | 0.064 ms |
| typed (annotated arithmetic) | 0.082 ms | 0.080 ms | 0.094 ms | 0.090 ms | 0.088 ms | 0.083 ms | 0.113 ms | 0.112 ms | 0.112 ms | 0.114 ms |
| refinement-heavy (50 annotations) | 4.152 ms | 3.870 ms | 4.030 ms | 4.126 ms | 3.950 ms | 3.794 ms | 5.193 ms | 5.103 ms | 5.302 ms | 5.295 ms |
| effect-heavy (handler + perform) | 0.058 ms | 0.055 ms | 0.063 ms | 0.059 ms | 0.056 ms | 0.059 ms | 0.059 ms | 0.055 ms | 0.053 ms | 0.055 ms |
| eval-heavy (fib(15) recursion) | 0.080 ms | 0.075 ms | 0.079 ms | 0.077 ms | 0.075 ms | 0.074 ms | 0.082 ms | 0.079 ms | 0.077 ms | 0.081 ms |

## 4. Pipeline: run (typecheck disabled)

*`dvala.run(source)` with typecheck disabled — captures tokenize + parse + evaluate. Evaluator-only cost ≈ this − phase-tokenize − phase-parse.*

| Measurement | `fc2cb805` (2026-06-12) | `508c8a21` (2026-06-11) | `bfb86828` (2026-06-11) | `9d65b8a2` (2026-06-11) | `b511715b` (2026-06-09) | `194f915f` (2026-06-09) | `40ec5a00` (2026-06-04) | `c8ba0be4` (2026-06-04) | `34868b99` (2026-06-04) | `3ac58715` (2026-06-04) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.001 ms | 0.001 ms | 0.002 ms | 0.001 ms | 0.001 ms | 0.002 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms |
| medium (untyped fold) | 0.036 ms | 0.034 ms | 0.033 ms | 0.035 ms | 0.033 ms | 0.034 ms | 0.037 ms | 0.038 ms | 0.035 ms | 0.039 ms |
| typed (annotated arithmetic) | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.007 ms | 0.006 ms | 0.006 ms | 0.007 ms |
| refinement-heavy (50 annotations) | 0.085 ms | 0.084 ms | 0.084 ms | 0.091 ms | 0.083 ms | 0.083 ms | 0.072 ms | 0.070 ms | 0.073 ms | 0.076 ms |
| effect-heavy (handler + perform) | 0.003 ms | 0.003 ms | 0.003 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms |
| eval-heavy (fib(15) recursion) | 4.164 ms | 4.184 ms | 4.073 ms | 4.246 ms | 4.095 ms | 3.991 ms | 4.642 ms | 4.612 ms | 4.408 ms | 4.582 ms |

## 5. Pipeline: end-to-end (full)

*`dvala.run(source)` — tokenize + parse + typecheck + evaluate. The number a user actually observes.*

| Measurement | `fc2cb805` (2026-06-12) | `508c8a21` (2026-06-11) | `bfb86828` (2026-06-11) | `9d65b8a2` (2026-06-11) | `b511715b` (2026-06-09) | `194f915f` (2026-06-09) | `40ec5a00` (2026-06-04) | `c8ba0be4` (2026-06-04) | `34868b99` (2026-06-04) | `3ac58715` (2026-06-04) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.059 ms | 0.056 ms | 0.060 ms | 0.060 ms | 0.058 ms | 0.058 ms | 0.056 ms | 0.055 ms | 0.055 ms | 0.056 ms |
| medium (untyped fold) | 0.078 ms | 0.081 ms | 0.081 ms | 0.086 ms | 0.085 ms | 0.079 ms | 0.082 ms | 0.082 ms | 0.081 ms | 0.083 ms |
| typed (annotated arithmetic) | 0.059 ms | 0.061 ms | 0.067 ms | 0.066 ms | 0.063 ms | 0.064 ms | 0.059 ms | 0.059 ms | 0.059 ms | 0.083 ms |
| refinement-heavy (50 annotations) | 0.590 ms | 0.570 ms | 0.711 ms | 0.737 ms | 0.645 ms | 0.621 ms | 0.593 ms | 0.574 ms | 0.601 ms | 0.677 ms |
| effect-heavy (handler + perform) | 0.045 ms | 0.046 ms | 0.050 ms | 0.054 ms | 0.050 ms | 0.046 ms | 0.045 ms | 0.045 ms | 0.046 ms | 0.064 ms |
| eval-heavy (fib(15) recursion) | 4.199 ms | 4.308 ms | 4.107 ms | 4.483 ms | 4.237 ms | 4.057 ms | 4.696 ms | 4.786 ms | 4.499 ms | 4.682 ms |

## 6. Refinement subtype-check cost (per predicate shape)

*isolated subtype-check calls between source type and refinement target — no parse or typecheck overhead*

| Measurement | `fc2cb805` (2026-06-12) | `508c8a21` (2026-06-11) | `bfb86828` (2026-06-11) | `9d65b8a2` (2026-06-11) | `b511715b` (2026-06-09) | `194f915f` (2026-06-09) | `40ec5a00` (2026-06-04) | `c8ba0be4` (2026-06-04) | `34868b99` (2026-06-04) | `3ac58715` (2026-06-04) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| interval target — Number → {n \| n > 0 && n < 100} | 0.22 μs | 0.22 μs | 0.22 μs | 0.23 μs | 0.22 μs | 0.21 μs | 0.23 μs | 0.25 μs | 0.22 μs | 0.22 μs |
| set target — :ok → {x \| :ok \| :error} | 0.10 μs | 0.09 μs | 0.09 μs | 0.10 μs | 0.10 μs | 0.09 μs | 0.10 μs | 0.11 μs | 0.10 μs | 0.10 μs |
| count target — String → {s \| count(s) > 0} | 0.26 μs | 0.26 μs | 0.24 μs | 0.25 μs | 0.24 μs | 0.23 μs | 0.24 μs | 0.25 μs | 0.28 μs | 0.28 μs |
| excludedSet — Number → {n \| !=0 && !=1 && !=-1} | 0.16 μs | 0.17 μs | 0.16 μs | 0.17 μs | 0.16 μs | 0.15 μs | 0.18 μs | 0.18 μs | 0.18 μs | 0.18 μs |
| literal source — 50 → {n \| n > 0 && n < 100} | 0.09 μs | 0.09 μs | 0.08 μs | 0.09 μs | 0.09 μs | 0.09 μs | 0.10 μs | 0.10 μs | 0.11 μs | 0.10 μs |

## 7. Stacked refinement simplify scaling

*simplifying N stacked refinements (`Base & {p1} & {p2} & ... & {pN}`) — empirically O(N²); regressions show as a worse exponent*

| Measurement | `fc2cb805` (2026-06-12) | `508c8a21` (2026-06-11) | `bfb86828` (2026-06-11) | `9d65b8a2` (2026-06-11) | `b511715b` (2026-06-09) | `194f915f` (2026-06-09) | `40ec5a00` (2026-06-04) | `c8ba0be4` (2026-06-04) | `34868b99` (2026-06-04) | `3ac58715` (2026-06-04) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| N= 2 stacked refinements | 0.50 μs | 0.53 μs | 0.61 μs | 0.62 μs | 0.57 μs | 0.59 μs | 0.43 μs | 0.42 μs | 0.45 μs | 0.43 μs |
| N= 4 stacked refinements | 1.45 μs | 1.48 μs | 1.41 μs | 1.48 μs | 1.48 μs | 1.40 μs | 1.43 μs | 1.50 μs | 1.43 μs | 1.46 μs |
| N= 8 stacked refinements | 5.16 μs | 5.24 μs | 5.10 μs | 5.35 μs | 5.15 μs | 5.05 μs | 5.22 μs | 5.29 μs | 5.07 μs | 5.22 μs |
| N=16 stacked refinements | 28.20 μs | 28.06 μs | 28.39 μs | 29.85 μs | 28.95 μs | 27.82 μs | 28.55 μs | 30.02 μs | 28.57 μs | 28.66 μs |
| N=32 stacked refinements | 130.06 μs | 130.41 μs | 131.22 μs | 136.53 μs | 133.28 μs | 128.33 μs | 135.29 μs | 138.40 μs | 130.08 μs | 132.39 μs |

## 8. Many-inequality refinement worst case

*`Number & {n | n != 1 && n != 2 && ... && n != N}` — documented quadratic worst case (each conjunction step merges against the growing exclusion list)*

| Measurement | `fc2cb805` (2026-06-12) | `508c8a21` (2026-06-11) | `bfb86828` (2026-06-11) | `9d65b8a2` (2026-06-11) | `b511715b` (2026-06-09) | `194f915f` (2026-06-09) | `40ec5a00` (2026-06-04) | `c8ba0be4` (2026-06-04) | `34868b99` (2026-06-04) | `3ac58715` (2026-06-04) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| N= 10 (parse + simplify) | 15.31 μs | 15.34 μs | 15.49 μs | 16.98 μs | 16.08 μs | 15.09 μs | 16.54 μs | 18.08 μs | 15.80 μs | 15.17 μs |
| N= 50 (parse + simplify) | 83.09 μs | 83.82 μs | 82.29 μs | 88.77 μs | 86.57 μs | 80.91 μs | 83.64 μs | 85.59 μs | 84.90 μs | 84.11 μs |
| N=100 (parse + simplify) | 177.03 μs | 177.58 μs | 175.59 μs | 188.02 μs | 183.27 μs | 172.83 μs | 187.37 μs | 185.91 μs | 186.99 μs | 182.39 μs |

