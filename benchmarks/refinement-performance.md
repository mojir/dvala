# Refinement-types performance history

Tracks performance of the refinement-types machinery (Phase 2.1+) over time.

Source of truth: `benchmarks/refinement-history.json` (full history).
Re-render: `npm run benchmark:refinement` (also runs the benchmarks first).
Last 10 runs shown below; older runs are in the JSON only.

A new measurement added in a future run shows up as a new row, with `—` in
older columns that didn't measure it. New scenarios appear as new sections.

## Run history

| Commit | Date | Message |
| --- | --- | --- |
| `966faea2` | 2026-04-25 10:34:55 | Refinement types Phase 2.1 – 2.4 — representation, merging, fold-discharge, solver (#96) |

## 1. Parse + typecheck overhead

*plain Number annotation vs. Number & {n | n > 0} on otherwise identical programs*

| Measurement | `966faea2` (2026-04-25) |
| --- | ---: |
| plain Number annotation | 0.009 ms |
| refined Number & {n \| n > 0} | 0.017 ms |

## 2. Solver direct cost (per shape)

*isolated solveRefinedSubtype calls — no parse or typecheck overhead*

| Measurement | `966faea2` (2026-04-25) |
| --- | ---: |
| interval target — Number → {n \| n > 0 && n < 100} | 0.10 μs |
| set target — :ok → {x \| :ok \| :error} | 0.12 μs |
| count target — String → {s \| count(s) > 0} | 0.05 μs |
| excludedSet — Number → {n \| !=0 && !=1 && !=-1} | 0.20 μs |
| literal source — 50 → {n \| n > 0 && n < 100} | 0.10 μs |

## 3. Stacked refinement simplify scaling

*N stacked refinements collapse via mergeRefinementPredicates — empirically O(N²) (each merge re-walks the growing inner predicate); regressions show as a worse exponent*

| Measurement | `966faea2` (2026-04-25) |
| --- | ---: |
| N= 2 stacked refinements | 0.83 μs |
| N= 4 stacked refinements | 3.54 μs |
| N= 8 stacked refinements | 14.54 μs |
| N=16 stacked refinements | 85.98 μs |
| N=32 stacked refinements | 455.12 μs |

## 4. excludedSet quadratic worst case

*`n != 1 && n != 2 && ... && n != N` — documented O(n²) per `mergeExcludedValues`*

| Measurement | `966faea2` (2026-04-25) |
| --- | ---: |
| N= 10 (parse + simplify) | 27.36 μs |
| N= 50 (parse + simplify) | 173.19 μs |
| N=100 (parse + simplify) | 427.16 μs |

## 5. End-to-end refinement-heavy program

*representative shape — 3 type aliases, 4 calls, multiple solver paths*

| Measurement | `966faea2` (2026-04-25) |
| --- | ---: |
| parse + typecheck full program | 0.179 ms |

