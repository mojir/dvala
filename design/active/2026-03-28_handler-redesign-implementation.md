# Handler Redesign Implementation Plan

**Status:** Active
**Created:** 2026-03-28

## Goal

Implement Phase 1 of the Dvala roadmap: Koka-aligned handler model with named clauses, explicit `resume`, `transform` clause, implicit propagation. This document tracks the implementation steps and their order.

Full design: [2026-03-27_abort-semantics.md](2026-03-27_abort-semantics.md)

---

## Implementation Strategy

The redesign touches parser, evaluator, frames, tests, and the effectHandler module. To keep things working at each step, we'll implement incrementally — each step produces a passing test suite (with some old tests modified/removed as semantics change).

### Key architectural changes

1. **Handle AST node** — payload changes from `[bodyExprs, handlersExpr]` to `[bodyExprs, clauseList, transformNode?]`
2. **HandleWithFrame** — `handlers: Any[]` (array of functions) becomes `clauses: Map<string, {params, body}>` + `transformNode`
3. **EffectResumeFrame** — current "handler return = resume body" semantics flip to "handler return = abort". New `resume` keyword captures continuation and returns its result.
4. **Shorthand handler syntax** — `@eff(x) -> body` no longer desugars to lambda with `(arg, eff, nxt)`. It becomes a named clause directly.
5. **Handler chains removed** — `[h1, h2]` array syntax and `HandleNextFunction` go away.

### Implementation order

**Step 1: Parse named clauses in `handle...with...transform...end`**
- Modify `parseHandle.ts` to parse `with @effect(params) -> expr` clauses and optional `transform x -> expr`
- Change Handle AST payload to `[bodyExprs, clauses, transformClause?]`
- Where `clauses` = `Array<[effectName, params, bodyExpr]>`
- Duplicate effect names = parse error

**Step 2: New HandleWithFrame with clause map**
- Replace `handlers: Any[]` with `clauses` structure in HandleWithFrame
- Add `transformNode` and `transformParam` fields
- Add `bodyEnv` for evaluating body in correct scope

**Step 3: Named clause dispatch (replaces handler chain)**
- When perform fires, look up effect name in clause map
- If found: evaluate clause body with params bound
- If not found: propagate to outer handler (implicit propagation)
- Remove `invokeHandleWithChain`, `buildNextFunction`, `HandleNextFunction`

**Step 4: Abort-by-default semantics**
- Handler clause return value becomes the handle block's result (abort)
- Remove `EffectResumeFrame`'s current "return = resume" behavior
- Add new `HandleAbortFrame` or repurpose `EffectResumeFrame` for abort path

**Step 5: `resume` keyword**
- `resume(value)` in a handler clause:
  1. Captures the continuation from the perform site
  2. Reinstalls the handler around it (deep semantics)
  3. Evaluates the continuation with the given value
  4. Returns the continuation's result (after transform)
- One-shot guard: calling resume twice = runtime error
- New frame type: `ResumeCallFrame` or similar

**Step 6: Transform clause**
- On normal body completion: apply transform
- On abort (handler returns without resume): bypass transform
- Inside resume: transform applies to the reinstalled body's normal completion

**Step 7: Multiple perform args**
- Extend `perform` to accept variadic args: `perform(@eff, a, b, c)`
- Handler clause receives them positionally: `@eff(a, b, c) -> ...`

**Step 8: Clean up old system**
- Remove handler chain/array support
- Remove `HandleNextFunction` type
- Remove shorthand-to-lambda desugaring (shorthand now parsed as clause directly)
- Update `effectHandler` module (`fallback`, `retry`)
- Remove `nxt` from all tests and examples

**Step 9: Update tests**
- Migrate existing handler tests to new syntax
- Add new tests: abort, resume-returns-value, transform, state threading, one-shot guard, nested handlers, implicit propagation, multiple args

**Step 10: Update docs and references**
- Update skill docs, tutorials, examples
- Update `dvala doc handle`, `dvala doc perform`

## Current status

Starting Step 1.
