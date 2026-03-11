# Trampoline Evaluator — Improvement Plan

Based on code review of `src/evaluator/trampoline-evaluator.ts`.

---

## Issue 1 — Fragile async detection (High)

**Problem:** `evaluate` and `evaluateWithSyncEffects` detect async by catching a `DvalaError`
and matching a substring of its message:

```ts
if (error instanceof DvalaError && error.message.includes('Unexpected async operation')) {
```

If the message changes, async evaluation silently breaks.

**Fix:** Introduce a dedicated subclass or sentinel property:

```ts
class AsyncDetectedError extends DvalaError {
  readonly isAsyncDetected = true
}
```

Then detect with `error instanceof AsyncDetectedError` or `error.isAsyncDetected`.

---

## Issue 2 — Double-execution of side effects in `evaluate` (High)

**Problem:** `evaluate` tries the sync trampoline first. If async is detected, it rebuilds
the initial step and reruns the entire AST via `runAsyncTrampoline`. Any side effects
before the first `await` execute twice. There is no warning to callers.

**Fix (short term):** Add a prominent doc comment on `evaluate` warning about this.

**Fix (long term):** Consider always running async when any host-provided handler is
registered (since handlers are the typical source of async), or expose a flag so callers
can opt into async-first. Alternatively, make async detection happen before evaluation
starts (e.g. by inspecting whether any `perform` nodes exist in the AST).

---

## Issue 3 — `evaluateWithSyncEffects` retry is dead code (High)

**Problem:**

```ts
} catch (error) {
  if (error instanceof DvalaError && error.message.includes('Unexpected async operation')) {
    const freshInitial = buildInitialStep(ast.body, contextStack)
    return runSyncTrampoline(freshInitial, effectHandlers)  // throws again immediately
  }
```

Retrying with the sync trampoline after it already failed with "unexpected async" will
throw the same error on the retry. This code never recovers anything.

**Fix:** Remove the retry branch entirely. Let the error propagate:

```ts
export function evaluateWithSyncEffects(ast, contextStack, effectHandlers?) {
  return runSyncTrampoline(buildInitialStep(ast.body, contextStack), effectHandlers)
}
```

---

## Issue 4 — Stale design notes in `handleParallelResume` (Medium)

**Problem:** Lines ~2742–2749 contain implementation-time thinking notes:

```ts
// Actually, looking at how we build this: the first suspended branch
// was kept OUT of suspendedBranches (slice(1)), and its meta was used
// in the SuspensionSignal. But we need its index!
//
// Let me reconsider: ...
// Better approach: store the current branch index explicitly.
// Since we're in the middle of implementing, let me find the missing index.
```

**Fix:** Replace with a concise explanation of why the index is derived rather than stored:

```ts
// The branch exposed to the host was removed from suspendedBranches (via slice(1))
// and is not yet in completedBranches. Find it by exclusion.
```

Or — better — store `currentBranchIndex` explicitly on `ParallelResumeFrame` and remove
the O(n) search entirely (see Issue 8).

---

## Issue 5 — Orphaned doc comment before `tryDispatchDvalaError` (Medium)

**Problem:** Two consecutive doc comments appear at line ~1868. The first describes
a removed `TryCatchFrame` and a removed `throw` keyword:

```ts
/**
 * Search the continuation stack for the nearest TryCatchFrame.
 * Since TryCatchFrame has been removed, this now always re-throws the error.
 * Kept as a helper for the transition period while `throw` still exists.
 */
/**
 * Try to route a DvalaError through the 'dvala.error' algebraic effect.
 * ...
 */
function tryDispatchDvalaError(...) {
```

**Fix:** Delete the first (stale) comment block entirely.

---

## Issue 6 — Misleading `for` loop in `continueBindingArgs` (Medium)

**Problem:** The loop always returns on the first iteration, making it functionally
equivalent to a simple `if`:

```ts
for (let i = argIndex; i < nbrOfNonRestArgs; i++) {
  const arg = args[i]!
  const defaultNode = arg[1][1]
  if (!defaultNode) {
    throw new DvalaError(`Missing required argument ${i}`, sourceCodeInfo)
  }
  // ...
  return { type: 'Eval', node: defaultNode, ... }  // always returns here
}
```

Subsequent arguments are handled by re-entering `continueArgSlotBinding` via
`FnArgBind` → `applyFnArgBind` → `applyFnArgSlotComplete`. The loop never advances.

**Fix:** Replace with a direct access of `args[argIndex]`:

```ts
const arg = args[argIndex]!
const defaultNode = arg[1][1]
if (!defaultNode) {
  throw new DvalaError(`Missing required argument ${argIndex}`, sourceCodeInfo)
}
const frame: FnArgBindFrame = { ..., argIndex, ... }
return { type: 'Eval', node: defaultNode, env: bindingEnv, k: [frame, ...k] }
```

---

## Issue 7 — Inconsistent frame mutation (Medium)

**Problem:** Most frames are updated immutably (`{ ...frame, index: index + 1 }`),
but `EvalArgsFrame.params`, `RecurFrame.params`, and `PerformArgsFrame.params` are
mutated in place with `.push()`. This inconsistency is unexpected given the stated
goal of "all state lives in frames — enabling serialization later".

In-place mutation is fine when the frame is only ever accessed by one continuation,
but it could cause subtle bugs if frames are ever shared (e.g. after a
serialize/deserialize round-trip where two continuations reference the same frame object).

**Fix:** Either document clearly that these `params` arrays are single-owner (and thus
safe to mutate), or switch to immutable updates:

```ts
// Instead of:
params.push(value)
// Use:
const newFrame = { ...frame, params: [...frame.params, value] }
```

The documentation approach is lower cost and probably sufficient given current usage.

---

## Issue 8 — Duplicated branch-index search logic (Low)

**Problem:** The same O(n) "find the index not in completed or suspended" computation
appears in both `handleParallelResume` (~line 2750) and `retriggerParallelGroup`
(~line 3886).

**Fix option A:** Extract to a helper:

```ts
function findCurrentBranchIndex(
  branchCount: number,
  completedBranches: { index: number }[],
  suspendedBranches: { index: number }[],
): number {
  const completedIndices = new Set(completedBranches.map(b => b.index))
  const suspendedIndices = new Set(suspendedBranches.map(b => b.index))
  for (let i = 0; i < branchCount; i++) {
    if (!completedIndices.has(i) && !suspendedIndices.has(i)) return i
  }
  return -1
}
```

**Fix option B (better):** Add `currentBranchIndex: number` to `ParallelResumeFrame`
and set it explicitly when building the frame. Eliminates both the search and the
stale comments (Issue 4).

---

## Issue 9 — `getCollectionUtils` allocates on every call (Low)

**Problem:**

```ts
function getCollectionUtils() {
  return {
    asColl: (v, s) => { ... },
    isSeq: (v) => { ... },
  }
}
```

Called inside hot paths, this creates a new object (with two closure allocations) on
every call. The pattern exists to avoid circular imports.

**Fix:** Cache the result after the first call:

```ts
let _collectionUtils: ReturnType<typeof getCollectionUtils> | undefined
function getCollectionUtils() {
  return _collectionUtils ??= {
    asColl: ...,
    isSeq: ...,
  }
}
```

---

## Issue 10 — `dispatchDvalaFunction` missing exhaustiveness check (Low)

**Problem:** The `switch (fn.functionType)` in `dispatchDvalaFunction` covers all
current cases but has no `default` guard. Adding a new `functionType` would silently
return `undefined` from a function typed to return `Step`.

`applyFrame` correctly uses:
```ts
default: {
  const _exhaustive: never = frame
  throw new DvalaError(`Unhandled frame type: ${(_exhaustive as Frame).type}`)
}
```

**Fix:** Add the same pattern to `dispatchDvalaFunction`:

```ts
default: {
  const _exhaustive: never = fn
  throw new DvalaError(`Unhandled function type: ${(_exhaustive as DvalaFunction).functionType}`)
}
```

---

## Issue 11 — File size (Low)

At ~3900 lines, the file covers several distinct responsibilities. Natural split points:

| Proposed file | Contents |
|---|---|
| `bindingEval.ts` | `startBindingSlots`, `continueBindingSlots`, `applyBindingSlot`, `flattenBindingPatternWithoutDefault` |
| `matchEval.ts` | `startMatchSlots`, `continueMatchSlots`, `applyMatchSlot`, `matchSucceeded`, `tryNextMatchCase` |
| `parallelEval.ts` | `executeParallelBranches`, `executeRaceBranches`, `handleParallelResume`, `runBranch`, `combineSignals`, retrigger helpers |
| `effectDispatch.ts` | `dispatchPerform`, `dispatchHostHandler`, `tryDispatchDvalaError`, `handlerMatchesEffect`, `invokeMatchedHandler` |
| `trampoline-evaluator.ts` | Core loop: `stepNode`, `stepNormalExpression`, `stepSpecialExpression`, `applyFrame`, `tick`, `run*Trampoline`, entry points |

Not urgent, but the file will become harder to navigate as features are added.

---

## Suggested order of work

1. **Issue 3** — Remove dead retry in `evaluateWithSyncEffects` (5 min, no risk)
2. **Issue 5** — Remove stale comment (2 min, no risk)
3. **Issue 4** — Replace stale design notes in `handleParallelResume` (5 min, no risk)
4. **Issue 6** — Simplify misleading `for` loop (10 min, low risk)
5. **Issue 10** — Add exhaustiveness check to `dispatchDvalaFunction` (5 min, no risk)
6. **Issue 8B** — Store `currentBranchIndex` on `ParallelResumeFrame` (30 min, medium risk)
7. **Issue 1** — Replace fragile async detection with `AsyncDetectedError` (1 h, medium risk)
8. **Issue 2** — Document or fix double-execution in `evaluate` (depends on design decision)
9. **Issue 7** — Document or fix frame mutation inconsistency (depends on serialization plans)
10. **Issue 9** — Cache `getCollectionUtils` (15 min, no risk)
11. **Issue 11** — Split file (multi-day, low risk if done carefully)
