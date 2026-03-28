---
name: Lazy evaluation design
description: Lazy pure expressions with handler-controlled effect eagerness — core decisions and status
type: project
---

Design doc at `design/active/2026-03-27_lazy-evaluation.md`.

**Key decisions made:**
- Pure expressions are lazy by default (call-by-need)
- Effects are **eager by default** — `lazy` keyword on handlers opts into deferred effects
- Memoization: always — one thunk = one evaluation, regardless of how many times referenced
- `do` blocks: no special treatment, laziness flows through naturally
- Thunks are AST + env, already serializable — no new serialization challenges

**Why eager-default for effects:** Lazy-default effects produce silent bugs when obligatory effects (logging, state, financial) aren't forced. Flipping the default makes forgetting `lazy` safe instead of dangerous.

**Open questions:** debugging tooling, thunk overhead for trivial expressions, per-effect vs per-handler `lazy`, existing code migration, space leaks.

**How to apply:** This is Phase 2 on the roadmap, after handler redesign.
