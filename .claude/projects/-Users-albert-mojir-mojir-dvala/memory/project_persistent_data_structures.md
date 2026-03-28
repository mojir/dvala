---
name: Persistent data structures planned (HAMTs + multi-shot)
description: Future plan to replace JS arrays/objects with persistent HAMTs for O(log N) updates and free multi-shot continuations
type: project
---

Design doc at `design/active/2026-03-27_persistent-data-structures.md`.

**The problem:** Dvala clones entire arrays/objects on every operation (O(N)). Large collections are expensive. Multi-shot continuations require cloning the stack.

**The solution:** Persistent data structures (HAMTs, branching factor 32) with structural sharing. Updates become O(log32 N) ≈ O(1). Continuation stack becomes an immutable linked list — forking for multi-shot is O(1).

**Phasing:** (1) Ship handler redesign with one-shot. (2) Persistent values for arrays/objects. (3) Immutable evaluator frames. (4) Multi-shot falls out for free.

**Open questions:** Small collection threshold, host interop boundary (toJS()), custom implementation vs library.
