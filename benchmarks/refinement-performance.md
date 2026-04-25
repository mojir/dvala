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
| `7a67807c` | 2026-04-25 10:52:17 | docs(claude.md): require perf benchmark on refinement-types PRs |
| `7a67807c` | 2026-04-25 10:50:26 | docs(claude.md): require perf benchmark on refinement-types PRs |
| `966faea2` | 2026-04-25 10:34:55 | Refinement types Phase 2.1 – 2.4 — representation, merging, fold-discharge, solver (#96) |

## 1. Parse + typecheck overhead

*plain (no annotation) vs. typed Number vs. refined Number & {n | n > 0} — same program shape, parse and typecheck split out*

| Measurement | `7a67807c` (2026-04-25) | `7a67807c` (2026-04-25) | `966faea2` (2026-04-25) |
| --- | ---: | ---: | ---: |
| parse: plain (no annotation) | 0.004 ms | 0.004 ms | — |
| parse: typed Number annotation | 0.003 ms | 0.003 ms | — |
| parse: refined Number & {n \| n > 0} | 0.004 ms | 0.004 ms | — |
| typecheck: plain (no annotation) | 0.010 ms | 0.006 ms | — |
| typecheck: typed Number annotation | 0.007 ms | 0.007 ms | — |
| typecheck: refined Number & {n \| n > 0} | 0.019 ms | 0.017 ms | — |
| plain Number annotation | — | — | 0.009 ms |
| refined Number & {n \| n > 0} | — | — | 0.017 ms |

## 2. Refinement subtype-check cost (per predicate shape)

*isolated subtype-check calls between source type and refinement target — no parse or typecheck overhead*

| Measurement | `7a67807c` (2026-04-25) | `7a67807c` (2026-04-25) | `966faea2` (2026-04-25) |
| --- | ---: | ---: | ---: |
| interval target — Number → {n \| n > 0 && n < 100} | 0.08 μs | 0.08 μs | 0.10 μs |
| set target — :ok → {x \| :ok \| :error} | 0.12 μs | 0.12 μs | 0.12 μs |
| count target — String → {s \| count(s) > 0} | 0.05 μs | 0.05 μs | 0.05 μs |
| excludedSet — Number → {n \| !=0 && !=1 && !=-1} | 0.20 μs | 0.20 μs | 0.20 μs |
| literal source — 50 → {n \| n > 0 && n < 100} | 0.10 μs | 0.10 μs | 0.10 μs |

## 3. Stacked refinement simplify scaling

*simplifying N stacked refinements (`Base & {p1} & {p2} & ... & {pN}`) — empirically O(N²); regressions show as a worse exponent*

| Measurement | `7a67807c` (2026-04-25) | `7a67807c` (2026-04-25) | `966faea2` (2026-04-25) |
| --- | ---: | ---: | ---: |
| N= 2 stacked refinements | 0.78 μs | 0.79 μs | 0.83 μs |
| N= 4 stacked refinements | 3.28 μs | 3.33 μs | 3.54 μs |
| N= 8 stacked refinements | 14.20 μs | 14.42 μs | 14.54 μs |
| N=16 stacked refinements | 86.33 μs | 88.51 μs | 85.98 μs |
| N=32 stacked refinements | 454.07 μs | 464.89 μs | 455.12 μs |

## 4. Many-inequality refinement worst case

*`Number & {n | n != 1 && n != 2 && ... && n != N}` — documented quadratic worst case (each conjunction step merges against the growing exclusion list)*

| Measurement | `7a67807c` (2026-04-25) | `7a67807c` (2026-04-25) | `966faea2` (2026-04-25) |
| --- | ---: | ---: | ---: |
| N= 10 (parse + simplify) | 27.56 μs | 27.12 μs | 27.36 μs |
| N= 50 (parse + simplify) | 170.46 μs | 175.72 μs | 173.19 μs |
| N=100 (parse + simplify) | 417.76 μs | 429.83 μs | 427.16 μs |

## 5. End-to-end refinement-heavy program (small)

*representative shape — 3 type aliases, 4 calls, multiple solver paths*

| Measurement | `7a67807c` (2026-04-25) | `7a67807c` (2026-04-25) | `966faea2` (2026-04-25) |
| --- | ---: | ---: | ---: |
| parse + typecheck full program | 0.151 ms | 0.152 ms | 0.179 ms |

## 6. End-to-end refinement-heavy program (large)

*50+ refinement annotations across type aliases, function params, and let-bindings — catches scaling regressions proportional to refinement count*

| Measurement | `7a67807c` (2026-04-25) | `7a67807c` (2026-04-25) | `966faea2` (2026-04-25) |
| --- | ---: | ---: | ---: |
| parse + typecheck (50 refinements) | 4.772 ms | 4.805 ms | — |

