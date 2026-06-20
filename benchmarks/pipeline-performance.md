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
| `4bb5a3c4` | 2026-06-20 21:03:48 | perf: O(n log n) countValues via sort + run-length encoding |
| `69d1b637` | 2026-06-20 21:00:08 | fix: include offending value in promoted-builtin guard errors |
| `f508e714` | 2026-06-20 20:46:59 | feat: promote sum/prod/cumsum/cumprod and index/predicate helpers to core |
| `eba91518` | 2026-06-17 14:21:32 | perf: prune dead AST nodes from SequenceFrame at transition time |
| `8e6399cb` | 2026-06-13 23:17:30 | test: 100% .dvala builtin coverage — guards, dead-code removal, exhaustion tests |
| `c31a00e7` | 2026-06-12 13:46:50 | feat: measure branch-arm coverage + fill multi-line continuation lines |
| `e7f35d94` | 2026-06-12 12:44:19 | fix: feed core init-time coverage into per-instance getCoverage too |
| `fc2cb805` | 2026-06-12 07:14:16 | fix: record core builtins' init-time coverage in the union baseline |
| `508c8a21` | 2026-06-11 21:37:00 | fix: flag spread (`...expr`) as a structural leaf for coverage |
| `bfb86828` | 2026-06-11 19:53:38 | fix: eliminate false-negative .dvala coverage from discarded parser nodes |

## 1. Pipeline: tokenize

*pure tokenize cost — `tokenize(source)` for each corpus program*

| Measurement | `4bb5a3c4` (2026-06-20) | `69d1b637` (2026-06-20) | `f508e714` (2026-06-20) | `eba91518` (2026-06-17) | `8e6399cb` (2026-06-13) | `c31a00e7` (2026-06-12) | `e7f35d94` (2026-06-12) | `fc2cb805` (2026-06-12) | `508c8a21` (2026-06-11) | `bfb86828` (2026-06-11) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms |
| medium (untyped fold) | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms |
| typed (annotated arithmetic) | 0.010 ms | 0.010 ms | 0.010 ms | 0.009 ms | 0.010 ms | 0.010 ms | 0.010 ms | 0.009 ms | 0.009 ms | 0.010 ms |
| refinement-heavy (50 annotations) | 0.366 ms | 0.378 ms | 0.373 ms | 0.351 ms | 0.372 ms | 0.362 ms | 0.366 ms | 0.363 ms | 0.360 ms | 0.387 ms |
| effect-heavy (handler + perform) | 0.004 ms | 0.005 ms | 0.005 ms | 0.004 ms | 0.004 ms | 0.004 ms | 0.004 ms | 0.004 ms | 0.004 ms | 0.005 ms |
| eval-heavy (fib(15) recursion) | 0.007 ms | 0.007 ms | 0.007 ms | 0.006 ms | 0.006 ms | 0.006 ms | 0.007 ms | 0.007 ms | 0.006 ms | 0.007 ms |

## 2. Pipeline: parse (pre-tokenized)

*parser cost only — `parseTokenStream(pre-tokenized)` for each corpus program*

| Measurement | `4bb5a3c4` (2026-06-20) | `69d1b637` (2026-06-20) | `f508e714` (2026-06-20) | `eba91518` (2026-06-17) | `8e6399cb` (2026-06-13) | `c31a00e7` (2026-06-12) | `e7f35d94` (2026-06-12) | `fc2cb805` (2026-06-12) | `508c8a21` (2026-06-11) | `bfb86828` (2026-06-11) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms |
| medium (untyped fold) | 0.003 ms | 0.003 ms | 0.002 ms | 0.002 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms |
| typed (annotated arithmetic) | 0.002 ms | 0.002 ms | 0.003 ms | 0.002 ms | 0.002 ms | 0.003 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms |
| refinement-heavy (50 annotations) | 0.081 ms | 0.080 ms | 0.082 ms | 0.077 ms | 0.082 ms | 0.081 ms | 0.081 ms | 0.081 ms | 0.080 ms | 0.073 ms |
| effect-heavy (handler + perform) | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms |
| eval-heavy (fib(15) recursion) | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms |

## 3. Pipeline: typecheck (cumulative — incl. tokenize + parse)

*`dvala.typecheck(source)` per program — full pipeline through the typechecker. Typecheck-only cost ≈ this − phase-tokenize − phase-parse.*

| Measurement | `4bb5a3c4` (2026-06-20) | `69d1b637` (2026-06-20) | `f508e714` (2026-06-20) | `eba91518` (2026-06-17) | `8e6399cb` (2026-06-13) | `c31a00e7` (2026-06-12) | `e7f35d94` (2026-06-12) | `fc2cb805` (2026-06-12) | `508c8a21` (2026-06-11) | `bfb86828` (2026-06-11) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.055 ms | 0.055 ms | 0.060 ms | 0.057 ms | 0.054 ms | 0.054 ms | 0.057 ms | 0.054 ms | 0.056 ms | 0.058 ms |
| medium (untyped fold) | 0.066 ms | 0.072 ms | 0.069 ms | 0.064 ms | 0.065 ms | 0.065 ms | 0.067 ms | 0.065 ms | 0.066 ms | 0.066 ms |
| typed (annotated arithmetic) | 0.081 ms | 0.082 ms | 0.081 ms | 0.083 ms | 0.086 ms | 0.087 ms | 0.084 ms | 0.082 ms | 0.080 ms | 0.094 ms |
| refinement-heavy (50 annotations) | 3.941 ms | 3.893 ms | 4.021 ms | 3.842 ms | 3.872 ms | 4.096 ms | 4.061 ms | 4.152 ms | 3.870 ms | 4.030 ms |
| effect-heavy (handler + perform) | 0.055 ms | 0.054 ms | 0.058 ms | 0.057 ms | 0.053 ms | 0.059 ms | 0.060 ms | 0.058 ms | 0.055 ms | 0.063 ms |
| eval-heavy (fib(15) recursion) | 0.075 ms | 0.073 ms | 0.079 ms | 0.077 ms | 0.077 ms | 0.079 ms | 0.075 ms | 0.080 ms | 0.075 ms | 0.079 ms |

## 4. Pipeline: run (typecheck disabled)

*`dvala.run(source)` with typecheck disabled — captures tokenize + parse + evaluate. Evaluator-only cost ≈ this − phase-tokenize − phase-parse.*

| Measurement | `4bb5a3c4` (2026-06-20) | `69d1b637` (2026-06-20) | `f508e714` (2026-06-20) | `eba91518` (2026-06-17) | `8e6399cb` (2026-06-13) | `c31a00e7` (2026-06-12) | `e7f35d94` (2026-06-12) | `fc2cb805` (2026-06-12) | `508c8a21` (2026-06-11) | `bfb86828` (2026-06-11) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.002 ms |
| medium (untyped fold) | 0.033 ms | 0.033 ms | 0.033 ms | 0.032 ms | 0.035 ms | 0.033 ms | 0.035 ms | 0.036 ms | 0.034 ms | 0.033 ms |
| typed (annotated arithmetic) | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms |
| refinement-heavy (50 annotations) | 0.085 ms | 0.086 ms | 0.081 ms | 0.083 ms | 0.082 ms | 0.082 ms | 0.083 ms | 0.085 ms | 0.084 ms | 0.084 ms |
| effect-heavy (handler + perform) | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms |
| eval-heavy (fib(15) recursion) | 4.234 ms | 4.159 ms | 4.213 ms | 4.006 ms | 4.176 ms | 4.148 ms | 4.289 ms | 4.164 ms | 4.184 ms | 4.073 ms |

## 5. Pipeline: end-to-end (full)

*`dvala.run(source)` — tokenize + parse + typecheck + evaluate. The number a user actually observes.*

| Measurement | `4bb5a3c4` (2026-06-20) | `69d1b637` (2026-06-20) | `f508e714` (2026-06-20) | `eba91518` (2026-06-17) | `8e6399cb` (2026-06-13) | `c31a00e7` (2026-06-12) | `e7f35d94` (2026-06-12) | `fc2cb805` (2026-06-12) | `508c8a21` (2026-06-11) | `bfb86828` (2026-06-11) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.056 ms | 0.057 ms | 0.058 ms | 0.056 ms | 0.056 ms | 0.059 ms | 0.060 ms | 0.059 ms | 0.056 ms | 0.060 ms |
| medium (untyped fold) | 0.082 ms | 0.080 ms | 0.081 ms | 0.076 ms | 0.078 ms | 0.078 ms | 0.081 ms | 0.078 ms | 0.081 ms | 0.081 ms |
| typed (annotated arithmetic) | 0.061 ms | 0.060 ms | 0.059 ms | 0.057 ms | 0.061 ms | 0.059 ms | 0.061 ms | 0.059 ms | 0.061 ms | 0.067 ms |
| refinement-heavy (50 annotations) | 0.596 ms | 0.587 ms | 0.593 ms | 0.559 ms | 0.586 ms | 0.575 ms | 0.602 ms | 0.590 ms | 0.570 ms | 0.711 ms |
| effect-heavy (handler + perform) | 0.047 ms | 0.047 ms | 0.045 ms | 0.044 ms | 0.044 ms | 0.046 ms | 0.046 ms | 0.045 ms | 0.046 ms | 0.050 ms |
| eval-heavy (fib(15) recursion) | 4.323 ms | 4.194 ms | 4.238 ms | 4.151 ms | 4.258 ms | 4.201 ms | 4.353 ms | 4.199 ms | 4.308 ms | 4.107 ms |

## 6. Refinement subtype-check cost (per predicate shape)

*isolated subtype-check calls between source type and refinement target — no parse or typecheck overhead*

| Measurement | `4bb5a3c4` (2026-06-20) | `69d1b637` (2026-06-20) | `f508e714` (2026-06-20) | `eba91518` (2026-06-17) | `8e6399cb` (2026-06-13) | `c31a00e7` (2026-06-12) | `e7f35d94` (2026-06-12) | `fc2cb805` (2026-06-12) | `508c8a21` (2026-06-11) | `bfb86828` (2026-06-11) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| interval target — Number → {n \| n > 0 && n < 100} | 0.22 μs | 0.22 μs | 0.23 μs | 0.22 μs | 0.22 μs | 0.23 μs | 0.23 μs | 0.22 μs | 0.22 μs | 0.22 μs |
| set target — :ok → {x \| :ok \| :error} | 0.09 μs | 0.10 μs | 0.10 μs | 0.10 μs | 0.10 μs | 0.10 μs | 0.10 μs | 0.10 μs | 0.09 μs | 0.09 μs |
| count target — String → {s \| count(s) > 0} | 0.26 μs | 0.26 μs | 0.25 μs | 0.25 μs | 0.26 μs | 0.26 μs | 0.26 μs | 0.26 μs | 0.26 μs | 0.24 μs |
| excludedSet — Number → {n \| !=0 && !=1 && !=-1} | 0.17 μs | 0.17 μs | 0.17 μs | 0.16 μs | 0.17 μs | 0.17 μs | 0.17 μs | 0.16 μs | 0.17 μs | 0.16 μs |
| literal source — 50 → {n \| n > 0 && n < 100} | 0.09 μs | 0.09 μs | 0.09 μs | 0.09 μs | 0.09 μs | 0.09 μs | 0.10 μs | 0.09 μs | 0.09 μs | 0.08 μs |

## 7. Stacked refinement simplify scaling

*simplifying N stacked refinements (`Base & {p1} & {p2} & ... & {pN}`) — empirically O(N²); regressions show as a worse exponent*

| Measurement | `4bb5a3c4` (2026-06-20) | `69d1b637` (2026-06-20) | `f508e714` (2026-06-20) | `eba91518` (2026-06-17) | `8e6399cb` (2026-06-13) | `c31a00e7` (2026-06-12) | `e7f35d94` (2026-06-12) | `fc2cb805` (2026-06-12) | `508c8a21` (2026-06-11) | `bfb86828` (2026-06-11) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| N= 2 stacked refinements | 0.49 μs | 0.52 μs | 0.52 μs | 0.55 μs | 0.51 μs | 0.49 μs | 0.48 μs | 0.50 μs | 0.53 μs | 0.61 μs |
| N= 4 stacked refinements | 1.42 μs | 1.47 μs | 1.48 μs | 1.38 μs | 1.45 μs | 1.48 μs | 1.49 μs | 1.45 μs | 1.48 μs | 1.41 μs |
| N= 8 stacked refinements | 5.15 μs | 5.19 μs | 5.37 μs | 5.08 μs | 5.09 μs | 5.29 μs | 5.19 μs | 5.16 μs | 5.24 μs | 5.10 μs |
| N=16 stacked refinements | 28.22 μs | 28.11 μs | 29.01 μs | 28.05 μs | 28.20 μs | 29.06 μs | 28.42 μs | 28.20 μs | 28.06 μs | 28.39 μs |
| N=32 stacked refinements | 130.92 μs | 130.10 μs | 133.64 μs | 128.36 μs | 130.21 μs | 133.01 μs | 131.18 μs | 130.06 μs | 130.41 μs | 131.22 μs |

## 8. Many-inequality refinement worst case

*`Number & {n | n != 1 && n != 2 && ... && n != N}` — documented quadratic worst case (each conjunction step merges against the growing exclusion list)*

| Measurement | `4bb5a3c4` (2026-06-20) | `69d1b637` (2026-06-20) | `f508e714` (2026-06-20) | `eba91518` (2026-06-17) | `8e6399cb` (2026-06-13) | `c31a00e7` (2026-06-12) | `e7f35d94` (2026-06-12) | `fc2cb805` (2026-06-12) | `508c8a21` (2026-06-11) | `bfb86828` (2026-06-11) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| N= 10 (parse + simplify) | 15.40 μs | 15.74 μs | 15.34 μs | 15.06 μs | 15.19 μs | 15.06 μs | 15.81 μs | 15.31 μs | 15.34 μs | 15.49 μs |
| N= 50 (parse + simplify) | 84.13 μs | 84.33 μs | 84.19 μs | 79.94 μs | 88.34 μs | 82.04 μs | 84.69 μs | 83.09 μs | 83.82 μs | 82.29 μs |
| N=100 (parse + simplify) | 180.06 μs | 177.16 μs | 184.21 μs | 171.70 μs | 178.39 μs | 176.39 μs | 190.88 μs | 177.03 μs | 177.58 μs | 175.59 μs |

