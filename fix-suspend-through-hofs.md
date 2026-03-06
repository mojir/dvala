# Fix suspend/resume through migrated HOFs

## Summary

Fixed three bugs that broke the algebraic effects suspend/resume system
after higher-order functions were migrated from TypeScript to Dvala source.
Added 9 new tests covering suspend through map, filter, reduce, and for loops.

## Bug 1: Missing `initCoreDvalaSources` in effects API

**Symptom:** `"map is implemented in Dvala"` stub error when calling `map`
through `run()` or `runSync()`.

**Root cause:** The standalone effects API (`src/effects.ts`) created
context stacks without calling `initCoreDvalaSources()`, so `dvalaImpl`
properties were never set on builtin expressions.

**Fix:** Added `initCoreDvalaSources()` calls to both `runSync()` and
`run()` in `src/effects.ts`.

## Bug 2: `perform` fails inside dvalaImpl HOF callbacks

**Symptom:** `"Unhandled effect: 'my.approve'"` when `perform` is used
inside a callback passed to `map`, `filter`, or `reduce`.

**Root cause:** `map`'s Dvala implementation calls `apply(fn, a)` to invoke
callbacks. `apply` was a TS-only builtin without `dvalaImpl`, so it
dispatched through the recursive evaluator (`executeFunctionRecursive`)
which runs `runSyncTrampoline` with NO effect handlers. Any `perform` inside
the callback failed because there were no handlers to catch it.

**Fix:** Implemented `apply` in `functional.dvala` so it executes through
the trampoline CPS path, keeping effect handlers active for callbacks.
Stubbed the TS evaluate body.

## Bug 3: For-loop resume replays from start instead of advancing

**Symptom:** After suspend inside a for-loop body (first element), resuming
produces the same element again instead of advancing to the next.

**Root cause:** After serialization/deserialization of the continuation,
`frame.context` and the context inside `frame.env` become separate objects.
When `advanceForElement` mutates `frame.context` (e.g., sets `x=2`), the
change doesn't propagate to `frame.env`'s stale copy. The body was
evaluated with `frame.env` which still had old values.

**Fix:** In `processForNextLevel` (trampoline.ts), changed body evaluation
from `env` to `env.create(frame.context)`, pushing the current context on
top so the body always sees the latest loop variable values.

## Additional: Module dvalaImpl dispatch in trampoline

Extended `dispatchDvalaFunction` to check for `dvalaImpl` on module
functions and route through `setupUserDefinedCall` (CPS path) instead of
the recursive fallback. This ensures module functions with Dvala
implementations also support suspend/resume correctly.

## Files changed

- `src/effects.ts` — Added `initCoreDvalaSources()` calls
- `src/builtin/core/functional.dvala` — Added `apply` implementation
- `src/builtin/core/functional.ts` — Stubbed `apply` evaluate, removed unused imports
- `src/evaluator/trampoline.ts` — Fixed `processForNextLevel` env, added module dvalaImpl dispatch
- `src/evaluator/frames.ts` — Added `module` field to `ImportMergeFrame`
- `__tests__/suspend-hof.test.ts` — 9 new tests for suspend through HOFs

## Test results

All 5358 tests pass (5349 existing + 9 new). TypeScript compiles clean.
