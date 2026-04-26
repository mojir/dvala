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
| `b3ad619f` | 2026-04-26 16:12:02 | fix(typechecker): intersect upper bounds for display, not union |
| `734e52fa` | 2026-04-26 15:52:33 | fix(typechecker): include base+source in varKey for Refined types |
| `4b6e3410` | 2026-04-26 15:08:16 | feat(typechecker): match-body proof checking in asserts verifier |
| `219c9678` | 2026-04-26 10:10:22 | docs: update refinement phase plan |
| `aa68f70c` | 2026-04-26 09:01:45 | docs: cover assertion helper narrowing |
| `0b2de3d4` | 2026-04-25 20:49:37 | feat(typechecker): carry asserts info on FunctionType + propagate through walkers (Phase 2.5c step 2) |
| `2b915b2a` | 2026-04-25 19:40:42 | feat: wire dvala doc/list for prelude refined-type aliases (#103) |
| `b0d06b69` | 2026-04-25 19:11:40 | chore: address review feedback on PR #102 |
| `64d37704` | 2026-04-25 19:04:40 | feat(formatter): emit type-alias declarations + book chapter on refined types |
| `faca6709` | 2026-04-25 18:29:24 | chore(typechecker): address review feedback on prelude PR |

## 1. Pipeline: tokenize

*pure tokenize cost — `tokenize(source)` for each corpus program*

| Measurement | `b3ad619f` (2026-04-26) | `734e52fa` (2026-04-26) | `4b6e3410` (2026-04-26) | `219c9678` (2026-04-26) | `aa68f70c` (2026-04-26) | `0b2de3d4` (2026-04-25) | `2b915b2a` (2026-04-25) | `b0d06b69` (2026-04-25) | `64d37704` (2026-04-25) | `faca6709` (2026-04-25) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms |
| medium (untyped fold) | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms | 0.008 ms |
| typed (annotated arithmetic) | 0.010 ms | 0.010 ms | 0.010 ms | 0.009 ms | 0.009 ms | 0.010 ms | 0.010 ms | 0.010 ms | 0.010 ms | 0.010 ms |
| refinement-heavy (50 annotations) | 0.384 ms | 0.377 ms | 0.384 ms | 0.363 ms | 0.372 ms | 0.385 ms | 0.379 ms | 0.383 ms | 0.376 ms | 0.380 ms |
| effect-heavy (handler + perform) | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms |
| eval-heavy (fib(15) recursion) | 0.007 ms | 0.007 ms | 0.007 ms | 0.006 ms | 0.006 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.006 ms | 0.007 ms |

## 2. Pipeline: parse (pre-tokenized)

*parser cost only — `parseTokenStream(pre-tokenized)` for each corpus program*

| Measurement | `b3ad619f` (2026-04-26) | `734e52fa` (2026-04-26) | `4b6e3410` (2026-04-26) | `219c9678` (2026-04-26) | `aa68f70c` (2026-04-26) | `0b2de3d4` (2026-04-25) | `2b915b2a` (2026-04-25) | `b0d06b69` (2026-04-25) | `64d37704` (2026-04-25) | `faca6709` (2026-04-25) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms |
| medium (untyped fold) | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms |
| typed (annotated arithmetic) | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.003 ms |
| refinement-heavy (50 annotations) | 0.089 ms | 0.088 ms | 0.089 ms | 0.091 ms | 0.088 ms | 0.090 ms | 0.082 ms | 0.084 ms | 0.081 ms | 0.087 ms |
| effect-heavy (handler + perform) | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms |
| eval-heavy (fib(15) recursion) | 0.002 ms | 0.003 ms | 0.002 ms | 0.003 ms | 0.003 ms | 0.003 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms |

## 3. Pipeline: typecheck (cumulative — incl. tokenize + parse)

*`dvala.typecheck(source)` per program — full pipeline through the typechecker. Typecheck-only cost ≈ this − phase-tokenize − phase-parse.*

| Measurement | `b3ad619f` (2026-04-26) | `734e52fa` (2026-04-26) | `4b6e3410` (2026-04-26) | `219c9678` (2026-04-26) | `aa68f70c` (2026-04-26) | `0b2de3d4` (2026-04-25) | `2b915b2a` (2026-04-25) | `b0d06b69` (2026-04-25) | `64d37704` (2026-04-25) | `faca6709` (2026-04-25) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.006 ms | 0.008 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.006 ms | 0.007 ms | 0.005 ms | 0.007 ms |
| medium (untyped fold) | 0.035 ms | 0.031 ms | 0.032 ms | 0.032 ms | 0.031 ms | 0.033 ms | 0.033 ms | 0.034 ms | 0.032 ms | 0.032 ms |
| typed (annotated arithmetic) | 0.058 ms | 0.051 ms | 0.057 ms | 0.054 ms | 0.052 ms | 0.060 ms | 0.056 ms | 0.056 ms | 0.054 ms | 0.052 ms |
| refinement-heavy (50 annotations) | 5.588 ms | 5.159 ms | 5.363 ms | 5.225 ms | 5.177 ms | 5.471 ms | 5.359 ms | 5.287 ms | 5.472 ms | 5.235 ms |
| effect-heavy (handler + perform) | 0.021 ms | 0.020 ms | 0.022 ms | 0.023 ms | 0.020 ms | 0.020 ms | 0.021 ms | 0.021 ms | 0.020 ms | 0.022 ms |
| eval-heavy (fib(15) recursion) | 0.080 ms | 0.077 ms | 0.077 ms | 0.077 ms | 0.084 ms | 0.077 ms | 0.077 ms | 0.073 ms | 0.075 ms | 0.081 ms |

## 4. Pipeline: run (typecheck disabled)

*`dvala.run(source)` with typecheck disabled — captures tokenize + parse + evaluate. Evaluator-only cost ≈ this − phase-tokenize − phase-parse.*

| Measurement | `b3ad619f` (2026-04-26) | `734e52fa` (2026-04-26) | `4b6e3410` (2026-04-26) | `219c9678` (2026-04-26) | `aa68f70c` (2026-04-26) | `0b2de3d4` (2026-04-25) | `2b915b2a` (2026-04-25) | `b0d06b69` (2026-04-25) | `64d37704` (2026-04-25) | `faca6709` (2026-04-25) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.001 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.003 ms |
| medium (untyped fold) | 0.038 ms | 0.037 ms | 0.037 ms | 0.036 ms | 0.037 ms | 0.039 ms | 0.037 ms | 0.038 ms | 0.037 ms | 0.038 ms |
| typed (annotated arithmetic) | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.006 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms | 0.007 ms |
| refinement-heavy (50 annotations) | 0.070 ms | 0.072 ms | 0.068 ms | 0.079 ms | 0.072 ms | 0.072 ms | 0.081 ms | 0.068 ms | 0.069 ms | 0.069 ms |
| effect-heavy (handler + perform) | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.005 ms | 0.004 ms | 0.005 ms |
| eval-heavy (fib(15) recursion) | 4.714 ms | 4.570 ms | 4.627 ms | 4.330 ms | 4.597 ms | 4.580 ms | 4.369 ms | 4.620 ms | 4.507 ms | 4.544 ms |

## 5. Pipeline: end-to-end (full)

*`dvala.run(source)` — tokenize + parse + typecheck + evaluate. The number a user actually observes.*

| Measurement | `b3ad619f` (2026-04-26) | `734e52fa` (2026-04-26) | `4b6e3410` (2026-04-26) | `219c9678` (2026-04-26) | `aa68f70c` (2026-04-26) | `0b2de3d4` (2026-04-25) | `2b915b2a` (2026-04-25) | `b0d06b69` (2026-04-25) | `64d37704` (2026-04-25) | `faca6709` (2026-04-25) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tiny (1 + 2 * 3) | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms | 0.002 ms |
| medium (untyped fold) | 0.047 ms | 0.045 ms | 0.046 ms | 0.044 ms | 0.045 ms | 0.045 ms | 0.044 ms | 0.045 ms | 0.044 ms | 0.046 ms |
| typed (annotated arithmetic) | 0.027 ms | 0.026 ms | 0.027 ms | 0.026 ms | 0.028 ms | 0.027 ms | 0.027 ms | 0.027 ms | 0.027 ms | 0.027 ms |
| refinement-heavy (50 annotations) | 0.625 ms | 0.589 ms | 0.602 ms | 0.615 ms | 0.664 ms | 0.551 ms | 0.532 ms | 0.473 ms | 0.526 ms | 0.556 ms |
| effect-heavy (handler + perform) | 0.007 ms | 0.007 ms | 0.007 ms | 0.008 ms | 0.009 ms | 0.009 ms | 0.008 ms | 0.007 ms | 0.009 ms | 0.008 ms |
| eval-heavy (fib(15) recursion) | 4.784 ms | 4.630 ms | 4.683 ms | 4.412 ms | 4.680 ms | 4.697 ms | 4.531 ms | 4.746 ms | 4.628 ms | 4.534 ms |

## 6. Refinement subtype-check cost (per predicate shape)

*isolated subtype-check calls between source type and refinement target — no parse or typecheck overhead*

| Measurement | `b3ad619f` (2026-04-26) | `734e52fa` (2026-04-26) | `4b6e3410` (2026-04-26) | `219c9678` (2026-04-26) | `aa68f70c` (2026-04-26) | `0b2de3d4` (2026-04-25) | `2b915b2a` (2026-04-25) | `b0d06b69` (2026-04-25) | `64d37704` (2026-04-25) | `faca6709` (2026-04-25) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| interval target — Number → {n \| n > 0 && n < 100} | 0.10 μs | 0.10 μs | 0.09 μs | 0.09 μs | 0.09 μs | 0.10 μs | 0.10 μs | 0.10 μs | 0.09 μs | 0.09 μs |
| set target — :ok → {x \| :ok \| :error} | 0.13 μs | 0.13 μs | 0.13 μs | 0.13 μs | 0.13 μs | 0.13 μs | 0.13 μs | 0.13 μs | 0.13 μs | 0.13 μs |
| count target — String → {s \| count(s) > 0} | 0.06 μs | 0.06 μs | 0.06 μs | 0.06 μs | 0.06 μs | 0.06 μs | 0.05 μs | 0.06 μs | 0.06 μs | 0.06 μs |
| excludedSet — Number → {n \| !=0 && !=1 && !=-1} | 0.22 μs | 0.21 μs | 0.23 μs | 0.20 μs | 0.22 μs | 0.22 μs | 0.21 μs | 0.21 μs | 0.21 μs | 0.21 μs |
| literal source — 50 → {n \| n > 0 && n < 100} | 0.11 μs | 0.10 μs | 0.11 μs | 0.10 μs | 0.10 μs | 0.11 μs | 0.10 μs | 0.11 μs | 0.10 μs | 0.11 μs |

## 7. Stacked refinement simplify scaling

*simplifying N stacked refinements (`Base & {p1} & {p2} & ... & {pN}`) — empirically O(N²); regressions show as a worse exponent*

| Measurement | `b3ad619f` (2026-04-26) | `734e52fa` (2026-04-26) | `4b6e3410` (2026-04-26) | `219c9678` (2026-04-26) | `aa68f70c` (2026-04-26) | `0b2de3d4` (2026-04-25) | `2b915b2a` (2026-04-25) | `b0d06b69` (2026-04-25) | `64d37704` (2026-04-25) | `faca6709` (2026-04-25) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| N= 2 stacked refinements | 0.85 μs | 0.82 μs | 0.83 μs | 0.88 μs | 0.81 μs | 0.82 μs | 0.85 μs | 0.82 μs | 0.79 μs | 0.80 μs |
| N= 4 stacked refinements | 3.49 μs | 3.52 μs | 3.58 μs | 3.57 μs | 3.46 μs | 3.58 μs | 3.47 μs | 3.53 μs | 3.39 μs | 3.50 μs |
| N= 8 stacked refinements | 15.15 μs | 15.32 μs | 15.41 μs | 16.20 μs | 15.04 μs | 15.28 μs | 15.00 μs | 15.00 μs | 14.71 μs | 15.00 μs |
| N=16 stacked refinements | 92.60 μs | 93.50 μs | 94.02 μs | 90.93 μs | 91.82 μs | 93.33 μs | 92.24 μs | 92.06 μs | 90.52 μs | 92.20 μs |
| N=32 stacked refinements | 490.86 μs | 490.74 μs | 500.06 μs | 480.78 μs | 484.42 μs | 493.62 μs | 486.42 μs | 484.23 μs | 485.47 μs | 490.34 μs |

## 8. Many-inequality refinement worst case

*`Number & {n | n != 1 && n != 2 && ... && n != N}` — documented quadratic worst case (each conjunction step merges against the growing exclusion list)*

| Measurement | `b3ad619f` (2026-04-26) | `734e52fa` (2026-04-26) | `4b6e3410` (2026-04-26) | `219c9678` (2026-04-26) | `aa68f70c` (2026-04-26) | `0b2de3d4` (2026-04-25) | `2b915b2a` (2026-04-25) | `b0d06b69` (2026-04-25) | `64d37704` (2026-04-25) | `faca6709` (2026-04-25) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| N= 10 (parse + simplify) | 29.69 μs | 28.76 μs | 29.37 μs | 29.33 μs | 28.37 μs | 28.70 μs | 28.46 μs | 28.88 μs | 27.74 μs | 28.96 μs |
| N= 50 (parse + simplify) | 190.99 μs | 184.92 μs | 196.31 μs | 189.10 μs | 182.70 μs | 183.20 μs | 182.91 μs | 182.99 μs | 179.16 μs | 188.17 μs |
| N=100 (parse + simplify) | 459.46 μs | 480.16 μs | 464.87 μs | 448.20 μs | 478.60 μs | 455.16 μs | 454.20 μs | 456.43 μs | 446.47 μs | 484.31 μs |

