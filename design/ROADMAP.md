# Dvala Roadmap

## Phase 1: Handler Redesign

Koka-aligned handler model — named clauses, explicit `resume`, `transform` clause, implicit propagation.

- Design doc: [2026-03-27_abort-semantics.md](active/2026-03-27_abort-semantics.md)
- Status: Design complete

## Phase 2: Persistent Data Structures

HAMTs for arrays/objects, immutable evaluator frames, enabling multi-shot continuations.

- Design doc: [2026-03-27_persistent-data-structures.md](active/2026-03-27_persistent-data-structures.md)
- Status: Draft — host interop and architecture decided, implementation approach open
- Depends on: Phase 1 (one-shot handlers first, multi-shot after)

## Phase 3: Multi-Shot Continuations

Falls out for free from Phase 2 — remove one-shot guard, add `@choose` and nondeterminism patterns.

- Depends on: Phase 2

## Phase 4: Constraint Solver

General-purpose constraint solver built on multi-shot effects. Composable handler stack: `@var`, `@constraint`, `@cumulative`, `@minimize`. Parallel/race search via multi-shot fork dispatch. Thread-safe concurrency from immutability — no concurrency model needed, threads come from the host platform.

- Design doc: [2026-03-28_constraint-solver.md](active/2026-03-28_constraint-solver.md)
- Status: Draft
- Depends on: Phase 1 + Phase 2 + Phase 3

## Deferred: KMP Migration

Port the runtime core to Kotlin Multiplatform. Will be done at some point — timing not decided.

- Design doc: [2026-03-28_kmp-migration.md](active/2026-03-28_kmp-migration.md)
- Status: Draft

## Deferred: Lazy Evaluation

Lazy pure expressions with handler-controlled effect eagerness via `lazy` keyword. Interesting but not essential — the core use cases (workflows, constraint solving, testing, distributed computing) don't require it.

- Design doc: [2026-03-27_lazy-evaluation.md](active/2026-03-27_lazy-evaluation.md)
- Status: Draft — core decisions made, parked for now
