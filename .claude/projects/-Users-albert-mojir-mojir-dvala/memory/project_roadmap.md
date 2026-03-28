---
name: Dvala roadmap
description: Phased roadmap — KMP migration, handler redesign, persistent data structures, multi-shot, constraint solver
type: project
---

Roadmap at `design/ROADMAP.md`. Vision at `design/VISION.md`.

**Phase order:** (1) Handler redesign → (2) Persistent data structures → (3) Multi-shot continuations → (4) Constraint solver. KMP migration and lazy evaluation deferred.

**Key decisions:**
- Handler redesign is the next implementation task — in TypeScript for now.
- KMP migration timing not decided — design doc exists but moved to deferred.
- Lazy evaluation removed from active roadmap — not essential for core use cases.
- Three primitives: purity + algebraic effects + serializable continuations.

**How to apply:** Phase 1 (handler redesign) is the next implementation task.
