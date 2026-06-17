# Continuation size baseline (pre-pruning)

Captured at commit `fc036e1a` on 2026-06-17 13:25:45.

Re-run after implementing pruned continuations to measure the improvement.

**What "dead" means:** nodes already evaluated (in `SequenceFrame`, `AndFrame`, `OrFrame`,
`QqFrame`, `ArrayBuildFrame`, `TemplateStringBuildFrame`), plus unmatched cases in
`MatchFrame` once a case has been chosen. Only top-level node entries are counted,
not sub-expression children — real byte savings are larger.

### Current continuation (k)

| Scenario | Total bytes | k total nodes | k dead | k live | k dead % |
| --- | ---: | ---: | ---: | ---: | ---: |
| sequence-10-lets | 10,160 | 12 | 11 | 1 | 92% |
| sequence-25-lets | 22,985 | 27 | 26 | 1 | 96% |
| sequence-50-lets | 44,360 | 52 | 51 | 1 | 98% |
| nested-sequence (10 outer + 10 inner) | 28,309 | 24 | 22 | 2 | 92% |
| match-5-cases (suspend in case 1) | 904 | 0 | 0 | 0 | 0% |
| match-10-cases (suspend in case 1) | 1,221 | 0 | 0 | 0 | 0% |

### Snapshots (accumulated past states)

Snapshots carry copies of earlier continuation states. Each suspension appends one.

| Scenario | Snapshot total nodes | Snapshot dead | Snapshot dead % |
| --- | ---: | ---: | ---: |
| sequence-10-lets | 24 | 2 | 8% |
| sequence-25-lets | 54 | 2 | 4% |
| sequence-50-lets | 104 | 2 | 2% |
| nested-sequence (10 outer + 10 inner) | 24 | 2 | 8% |
| match-5-cases (suspend in case 1) | 0 | 0 | 0% |
| match-10-cases (suspend in case 1) | 0 | 0 | 0% |

## Scenario descriptions

- **sequence-10-lets**: 10 top-level let bindings, then suspend, then use one
- **sequence-25-lets**: 25 top-level let bindings, then suspend, then use one
- **sequence-50-lets**: 50 top-level let bindings, then suspend, then use one
- **nested-sequence (10 outer + 10 inner)**: Outer sequence of 10 lets; inner do-block of 10 lets that suspends
- **match-5-cases (suspend in case 1)**: 5-case match; first case suspends — other 4 are dead
- **match-10-cases (suspend in case 1)**: 10-case match; first case suspends — other 9 are dead
