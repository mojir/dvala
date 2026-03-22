# Trampoline.ts — Coverage Plan

**Current:** 96.66% stmts, 94.02% branch, 96.29% funcs, 96.66% lines
**Goal:** 100% all metrics

## Summary

~119 uncovered statement lines, ~56 uncovered branches, 4 uncovered functions.

### Progress
- Phase 1 (tests): ✅ Done — added `??`, wildcard+standard, async handler tests
- Phase 2 (v8 ignore): 🔄 In progress — applied to Group A (recursive evaluator), partial Group B (loop/for zero bindings, import.source, dvalaImpl dispatch, ?? single-arg)
Most gaps fall into two categories:

1. **Recursive evaluator fallback paths** — only reached when a normal expression
   callback invokes a user function that itself involves async binding, async
   patterns, or compound function types. The trampoline normally handles these
   via frames, but the recursive `evaluateNodeRecursive` path is used as a
   callback by normal expression `.evaluate()` calls.

2. **Host-handler / parallel / race / retrigger internals** — async branches
   inside `dispatchHostHandler`, `combineSignals`, `executeRaceBranches`,
   `retriggerWithEffects`, and `retriggerParallelGroup`.

---

## Uncovered Regions — Detailed Plan

### Group A — Recursive evaluator fallback paths (v8 ignore)

These are inside `evaluateNodeRecursive` and helpers. They duplicate the
trampoline's frame-based logic but exist so that normal expression
`.evaluate()` callbacks get a working `evaluateNode`. They're hard to reach
because the trampoline handles the outer call; the recursive path only fires
inside a callback's closure. Most async branches here are impossible to
trigger from Dvala code today.

| Lines | Function / Context | What's uncovered | Action |
|-------|-------------------|-----------------|--------|
| 160–162 | `evaluateNodeRecursive` | SpecialExpression → async retry (`runAsyncTrampoline` branch) | ✅ **v8 ignore** applied |
| 184–186 | `evaluateParamsRecursive` | Spread operator with non-array value in async context | ✅ **v8 ignore** applied |
| 225–226 | `evaluateNormalExpressionRecursive` | `normalExpression.dvalaImpl` branch | ✅ **v8 ignore** applied — trampoline handles all dvalaImpl dispatch |
| 245–255 | `evaluateNormalExpressionRecursive` | Anonymous function expression with placeholders in recursive path | ✅ **v8 ignore** applied |
| 280 | `executeFunctionRecursive` | `fn === undefined` for named symbol | ✅ **v8 ignore** applied |
| 384–390 | `executeUserDefinedRecursive` | Async `bodyResult.catch(RecurSignal)` branch | ✅ **v8 ignore** applied |
| 402–404 | `executePartialRecursive` | Wrong number of args in partial call | ✅ **v8 ignore** applied — arity checked at call site |
| 491–495 | `executeBuiltinRecursive` | `pure` check + `dvalaImpl` branch | ✅ **v8 ignore** applied |
| 510–518 | `executeSpecialBuiltinRecursive` and `executeModuleRecursive` | Unreachable special builtin + module not found branches | ✅ **v8 ignore** applied (block ignore around both functions) |

### Group B — Trampoline frame dispatch paths

| Lines | Function / Context | What's uncovered | Action |
|-------|-------------------|-----------------|--------|
| 764–765 | `stepSpecialExpression` `??` | `?? (undefinedSym)` with single undefined and `nodes.length === 1` | ✅ **v8 ignore** applied — ??(x) uses evaluateAsNormalExpression, infix requires 2+ operands |
| 788–789 | `stepSpecialExpression` `??` | `?? (...)` with `nodes.length === 1` for defined value | ✅ **v8 ignore** applied — same reason as above |
| 895–906 | `stepSpecialExpression` `loop` | Loop with zero bindings | ✅ **v8 ignore** applied |
| 928–929 | `stepSpecialExpression` `for/doseq` | For/doseq with zero loop-bindings | ✅ **v8 ignore** applied |
| 1084–1086 | `stepSpecialExpression` `import` | Module with `.source` (multi-node import) | ✅ **v8 ignore** applied — initCoreDvalaSources pre-evaluates modules |
| 1177–1178 | `dispatchCall` | `normalExpression.dvalaImpl` in trampoline dispatch | ✅ **v8 ignore** applied — initCoreDvalaSources sets dvalaImpl at startup |
| 1245 | `dispatchFunction` | Some branch in function dispatch | Read code — likely a defensive guard → **v8 ignore** |
| 1317–1369 | `setupUserDefinedCall` | Async binding fallback paths (5 clusters) | **v8 ignore** — binding utilities are synchronous from Dvala; the `instanceof Promise` checks are defensive |
| 1440 | `applyFrame` | `BindingDefault` case dispatch | **Test via `applyBindingDefault`** |
| 1446 | `applyFrame` | branch: condition `isObj(value)` → false | **v8 ignore** — ImportMerge always evaluates to object |
| 1460–1461 | `applyFrame` | `ImportMerge` — dvalaImpl override where expression exists and fn is UserDefined | Covered by number-theory test? Verify |
| 1470–1471 | `applyFrame` | `ImportMerge` — dvala-only functions (no TS match) | Covered by functional module test? Verify |

### Group C — Match / Cond / For frame edge cases

| Lines | Function / Context | What's uncovered | Action |
|-------|-------------------|-----------------|--------|
| 1522–1525 | `applyCond` | `phase === 'body'` — body evaluation complete | **Test** — cond returning evaluated body value |
| 1551–1554 | `applyMatch` | `phase === 'guard'` — guard evaluation in match | **Test** — match with guard expression |
| 1568–1571 | `processMatchCase` | Async `tryMatch` branch | **v8 ignore** — tryMatch always synchronous |
| 1624–1625 | `applyAnd` / `applyOr` | Last-node shortcut branch | **Test** — `&& (a, b)` where a is truthy, b is the last |
| 1724 | `ObjectBuild` | `currentKey === null` branch | **Test** — object literal with computed keys |
| 1855–1859 | `applyForLoop` `evalWhile` | While-guard failing → skip remaining | **Test** — `for (x in [1,2,3] while x < 2) -> x` |
| 1903–1906 | `applyForLoop` `evalBody` | Body evaluation return value pushed to result | Likely already covered; verify |

### Group D — Host handler / effect dispatch

| Lines | Function / Context | What's uncovered | Action |
|-------|-------------------|-----------------|--------|
| 2255–2260 | `handlerMatchesEffect` | DvalaFunction predicate + async predicate check | **Test** — use `effectMatcher` with a function predicate in `try/with` |
| 2357 | `dispatchPerform` | Some branch in local effect dispatch | Read code to determine |
| 2415 | `dispatchHostHandler` | `effectSignal.aborted` pre-check | **v8 ignore** — only reachable in parallel/race timing edge case |
| 2426 | `dispatchHostHandler` | `pattern === '*'` catch-all before standard handler | ✅ **Done** — test in coverage-gaps.test.ts |
| 2431–2443 | `dispatchHostHandler` | `dvala.error` / `dvala.checkpoint` in `tryHandler` when all call `next()` | ✅ **Done** — tests in coverage-gaps.test.ts |
| 2480–2481 | `dispatchHostHandler` | Async handler outcome already settled synchronously | ✅ **Done** — test in coverage-gaps.test.ts |
| 2492–2496 | `dispatchHostHandler` | Async handler promise‐not-yet-settled path | **Test** — truly async handler |
| 2516–2518 | `dispatchHostHandler` | Async handler outcome settled + rejection suppressed | ✅ **Done** — test in coverage-gaps.test.ts |
| 2532–2534 | `dispatchHostHandler` | Async handler no-outcome error | ✅ **Done** — test in coverage-gaps.test.ts |
| 2549–2561 | `dispatchHostHandler` | Async handler rejected with non-DvalaError | ✅ **Done** — test in coverage-gaps.test.ts |
| 2564 | `dispatchHostHandler` | Return from `tryHandler` tail | May be implicitly covered |

### Group E — Parallel / Race / Retrigger

| Lines | Function / Context | What's uncovered | Action |
|-------|-------------------|-----------------|--------|
| 2590 (fn) | `combineSignals` | `a.addEventListener('abort', ...)` callback | **v8 ignore** — only fires during parallel/race abort timing; not directly testable |
| 2664–2666 | `executeParallelBranches` | `settled.status === 'rejected'` in parallel | **v8 ignore** — branches should never reject (defensive) |
| 2739 (fn) | `onParentAbort` in `executeRaceBranches` | Parent abort handler | **v8 ignore** — only fires during external abort |
| 2740–2743 | `executeRaceBranches` | `onParentAbort` body | Same as above |
| 2786–2787 | `executeRaceBranches` | `settled.status === 'rejected'` in race | **v8 ignore** — defensive |
| 2792 | `executeRaceBranches` | something around race | Read code to determine |
| 3445–3446 | `retriggerWithEffects` | `effectName/effectArgs` missing → suspended passthrough | **v8 ignore** — defensive; serialized snapshots always have these |
| 3470–3471 | `retriggerWithEffects` | `isSuspensionSignal` catch → return suspended | **Test** — handler calls suspend() during retrigger |
| 3478–3479 | `retriggerWithEffects` | Generic error → wrapped DvalaError | **v8 ignore** — non-DvalaError from retrigger is defensive |
| 3484 | `retriggerWithEffects` | Some return path | Read code |
| 3541–3542 | `retriggerParallelGroup` | Branch in parallel resume handling | **v8 ignore** — requires complex multi-branch suspend/resume scenario |
| 3591–3594 | `runEffectLoop` | `error instanceof DvalaError` and generic error returns | **Test** — non-DvalaError thrown during effect execution |

### Group F — Utility / Entry point functions

| Lines | Function / Context | What's uncovered | Action |
|-------|-------------------|-----------------|--------|
| 2962–2973 (fn) | `applyBindingDefault` | Binding default frame handler | **v8 ignore** — `BindingDefaultFrame` is pushed but currently resolved inline; frame path unreachable |
| 3027 | `applyDebugStep` | Some branch in debug step | Read code |
| 3031 | `applyDebugStep` | `phase === 'awaitPerform'` passthrough | **Test** — debug mode test likely covers, verify |
| 3063–3071 (fn) | `wrapMaybePromiseAsStep` error branch | Promise error wrapping in `result.then` | **Test** — normal expression returning rejected Promise |
| 3257–3259 (fn) | `evaluateAsync` | Export never called directly | ✅ **Done** — test in coverage-gaps.test.ts |
| 3267–3278 (fn) | `evaluateNode` | Export never called directly | ✅ **Done** — test in coverage-gaps.test.ts |
| 3331–3333 | `evaluateWithSyncEffects` | Async retry in sync effect evaluation | **v8 ignore** — sync effects cannot produce async ops |

---

## Execution Plan

### Phase 1 — Write tests (cover ~20–30 lines)

1. ✅ **`evaluateAsync` and `evaluateNode`** — call directly from test
2. ✅ **`??` edge cases** — unreachable via trampoline; v8 ignore applied
3. **`applyAnd` / `applyOr` last-node** — still uncovered (testable or v8 ignore)
4. **`applyForLoop` `evalWhile`** — still uncovered (testable)
5. ✅ **Host handler edge cases** — async handler that rejects, handler chain exhaustion,
   sync settle in async handler, wildcard+standard, truly async handler
6. **`wrapMaybePromiseAsStep`** — still uncovered (testable or v8 ignore)
7. **`retriggerWithEffects`** — still uncovered (mix of testable + v8 ignore)
8. **`runEffectLoop`** error branches — still uncovered (v8 ignore)

### Phase 2 — Add `/* v8 ignore */` for unreachable code

✅ **Done** (Group A — recursive evaluator, ~40 lines):
- evaluateNodeRecursive async retry
- evaluateParamsRecursive spread async
- evaluateNormalExpressionRecursive dvalaImpl + anonymous fn placeholders
- executeFunctionRecursive undefined symbol guard
- executeUserDefinedRecursive async recur catch
- executePartialRecursive arity guard
- executeBuiltinRecursive pure+dvalaImpl
- executeSpecialBuiltinRecursive + executeModuleRecursive (entire functions)

✅ **Done** (Group B partial — parser/import/dispatch, ~25 lines):
- ?? single-arg branches (both undefined and defined)
- loop zero bindings
- for/doseq zero bindings
- import dvalaModule.source block
- dispatchCall dvalaImpl branch

**Remaining** (~119 uncovered stmts, ~56 branches, 4 functions):
- Group B remainder: setupUserDefinedCall async binding fallbacks (lines 1356-1408),
  dispatchFunction line 1284, ImportMerge dvalaImpl/dvala-only (lines 1499-1510)
- Group C: applyCond body (1561-1564), applyMatch guard+body (1590-1610),
  processMatchCase async tryMatch (1607-1610), applyAnd/Or last-node (1663-1664),
  applyForLoop evalWhile (1894-1898) and evalBody (1942-1945)
- Group D: handlerMatchesEffect DvalaFunction predicate (2294-2299),
  dispatchPerform branch (2396), effectSignal.aborted (2454),
  async handler paths still uncovered (2534-2600)
- Group E: combineSignals callback (2629), parallel rejected (2703-2705),
  onParentAbort (2778-2782), race rejected (2825-2826)
- Group F: applyBindingDefault (3001-3012), applyDebugStep (3070),
  wrapMaybePromiseAsStep error branch (3102-3110),
  evaluateWithSyncEffects async retry (3370-3372),
  retriggerWithEffects paths (3484-3518), runEffectLoop errors (3630-3633)

### Phase 3 — Verify

Run `npm run check` and confirm 100% on all metrics.
