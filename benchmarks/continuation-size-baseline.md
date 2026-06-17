# Continuation size measurement

Last captured at commit `4b064271` on 2026-06-17.

**What "dead" means:** nodes already evaluated (in `SequenceFrame`, `AndFrame`, `OrFrame`,
`QqFrame`, `ArrayBuildFrame`, `TemplateStringBuildFrame`), plus unmatched cases in
`MatchFrame` once a case has been chosen. Only top-level node entries are counted,
not sub-expression children — real byte savings are larger.

## Before / after pruning

`SequenceFrame` pruning shipped in the commit following the baseline. The table below shows both measurements side-by-side.

| Scenario | Bytes (before) | Bytes (after) | Reduction | k dead % (before) | k dead % (after) |
| --- | ---: | ---: | ---: | ---: | ---: |
| sequence-10-lets | 10,160 | 8,060 | 21% | 92% | 0% |
| sequence-25-lets | 22,985 | 17,915 | 22% | 96% | 0% |
| sequence-50-lets | 44,360 | 34,340 | 23% | 98% | 0% |
| nested-sequence (10 outer + 10 inner) | 28,309 | 20,244 | 28% | 92% | 0% |
| match-5-cases (suspend in case 1) | 904 | 904 | 0% | 0% | 0% |
| match-10-cases (suspend in case 1) | 1,221 | 1,221 | 0% | 0% | 0% |

### Current continuation (k)

| Scenario | Total bytes | k total nodes | k dead | k live | k dead % |
| --- | ---: | ---: | ---: | ---: | ---: |
| sequence-10-lets | 8,060 | 1 | 0 | 1 | 0% |
| sequence-25-lets | 17,915 | 1 | 0 | 1 | 0% |
| sequence-50-lets | 34,340 | 1 | 0 | 1 | 0% |
| nested-sequence (10 outer + 10 inner) | 20,244 | 2 | 0 | 2 | 0% |
| match-5-cases (suspend in case 1) | 904 | 0 | 0 | 0 | 0% |
| match-10-cases (suspend in case 1) | 1,221 | 0 | 0 | 0 | 0% |

### Snapshots (accumulated past states)

Snapshots carry copies of earlier continuation states. Each suspension appends one.
Non-zero dead% here is expected: snapshots freeze the state at the moment of
suspension, before the pruned frame exists. This is not a pruning gap.

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
