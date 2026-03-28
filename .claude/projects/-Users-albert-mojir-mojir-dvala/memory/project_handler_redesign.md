---
name: Effect handler redesign — final design decisions
description: Abort/resume/transform handler model — all syntax and semantics decisions from 2026-03-27/28 design sessions
type: project
---

Design doc at `design/active/2026-03-27_abort-semantics.md`.

**Final design (updated 2026-03-28):**
- Named effect clauses only — exact match dispatch, no catch-all, no wildcards
- `resume` is a keyword available in every clause — call it to continue, don't call it to abort
- `resume` returns the continuation's result (like Koka, unlike OCaml 5 where continue is a jump)
- `transform x -> expr` clause in its own section — transforms normal completion, never abort values
- `perform` supports multiple arguments — `perform(@eff, a, b)` → `@eff(a, b) -> ...`
- Unmatched effects propagate implicitly — no `nxt`, no explicit forwarding
- No handler chains — composition via nesting
- No shorthand form — one form with explicit `resume`
- Deep handler reinstallation on resume
- Handler clause bodies run outside handler scope — `perform` inside a clause propagates outward (enables intercept-and-forward pattern)
- Retry is a pattern (recursive function + handle block), not a handler primitive

**How to apply:** This is Phase 1 on the roadmap, implemented directly in Kotlin during KMP migration (Phase 0).
