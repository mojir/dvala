# trampoline-evaluator.ts walkthrough

## The core idea

Traditional recursive evaluators call themselves to evaluate sub-expressions, consuming JS call stack. This file uses a **trampoline** instead: rather than recursing, every evaluation step returns a *description of what to do next* (a `Step`). A tight loop calls `tick(step)` repeatedly until done — no JS stack growth.

---

## The three central types

**`Step`** — what to do next (one of):
- `{ type: 'Value', value, k }` — a sub-expression finished with a value
- `{ type: 'Eval', node, env, k }` — evaluate this AST node
- `{ type: 'Apply', frame, value, k }` — apply a frame to a value
- `{ type: 'Perform', effect, args, k }` — dispatch an algebraic effect
- `{ type: 'Parallel' / 'Race', branches, env, k }` — concurrent branches
- `{ type: 'Error', error, k }` — route an error through effect handlers

**`ContinuationStack` (`k`)** — what to do *after* the current sub-expression finishes. It's an explicit stack of frames. Where a recursive evaluator would return to a caller, this uses `k`.

**`Frame`** — one pending "what to do when the sub-expression returns". There are ~30 frame types: `IfBranch`, `EvalArgs`, `LetBind`, `FnBody`, `BindingSlot`, `MatchSlot`, `TryWith`, `EffectResume`, etc.

---

## The main functions

**`stepNode(node, env, k)`** — maps an AST node to the first `Step`:
- Leaf nodes (`Number`, `String`, `Symbol`) → immediately `{ type: 'Value', ... }`
- `NormalExpression` (function calls) → calls `stepNormalExpression`, which pushes an `EvalArgsFrame` and starts evaluating the first argument
- `SpecialExpression` (`if`, `let`, `loop`, `do`, `match`, `perform`, etc.) → `stepSpecialExpression`, which pushes the appropriate frame and evaluates the first sub-expression

**`applyFrame(frame, value, k)`** — when a sub-expression completes with `value`, the top frame from `k` decides what happens next. For example:
- `IfBranchFrame` → branches on the condition value, evaluates `then` or `else`
- `EvalArgsFrame` → collects the argument, evaluates the next one, or dispatches the call
- `FnBodyFrame` → either returns the result or evaluates the next body expression
- `LetBindFrame` → binds the value and continues
- `BindingSlotFrame` → continues destructuring after a default value was evaluated

**`tick(step, handlers?, signal?)`** — processes one step and returns the next. The central dispatch: `Value` → pop frame and apply it, `Eval` → call `stepNode`, `Perform` → call `dispatchPerform`, etc.

**`runSyncTrampoline(initial)`** — `for(;;) { step = tick(step) }`. If a step returns a `Promise`, throws (not allowed in sync context).

**`runAsyncTrampoline(initial)`** — same loop but `await`s Promises when they appear.

---

## Function call dispatch

Calling `foo(a, b)` goes through several frames:

1. `stepNormalExpression` pushes `EvalArgsFrame` + `NanCheckFrame`, evaluates `a`
2. `applyEvalArgs` receives `a`'s value, evaluates `b`
3. `applyEvalArgs` receives `b`'s value, calls `dispatchCall`
4. `dispatchCall` identifies the function type (builtin, user-defined, partial, comp, etc.) and dispatches
5. For user-defined: `setupUserDefinedCall` → `continueArgSlotBinding` → binds args via `startBindingSlots` → `proceedToFnBody`
6. `FnBodyFrame` on the stack handles the body; `recur` finds it to restart the function (tail-call)

---

## Binding and pattern matching

Both use the same slot-based approach — "flatten the pattern to a list of slots, process them iteratively":

- **`startBindingSlots`** / **`continueBindingSlots`**: destructure `let` / function args. Slots have a `path` (how to extract the value) and optionally a `defaultNode`. If a default needs evaluating, push `BindingSlotFrame` and continue after.
- **`startMatchSlots`** / **`continueMatchSlots`**: same idea for `match` expressions. Slots can be `literal` (push `MatchSlotFrame`, evaluate the literal node, then compare), `bind`, `rest`, `typeCheck`, or `wildcard`.

---

## Effect system

`perform(effect(dvala.log), "hello")` → `PerformArgsFrame` collects args → produces `{ type: 'Perform', effect, args, k }` → `tick` calls `dispatchPerform`:

1. Check `TryWithFrame`s on the stack for a matching `case effect(X) then handler`
2. Check host-provided `handlers` (registered via JS API, with wildcard support like `"dvala.*"`)
3. Check standard built-in effect definitions
4. If `dvala.error` and unhandled → throw `UserDefinedError`
5. Otherwise → throw "unhandled effect"

When a local handler matches: `invokeMatchedHandler` pushes `EffectResumeFrame` (which holds the original `k`) and evaluates the handler. When the handler returns, `applyEffectResume` restores the original continuation.

---

## Parallel & Race

`parallel(a, b, c)` → `executeParallelBranches` runs all branches as independent `runBranch()` calls via `Promise.allSettled`. Each branch is a complete independent trampoline run. If any branch suspends (via `SuspensionSignal`), a `ParallelResumeFrame` is built on the outer `k` and a `SuspensionSignal` is thrown so the host can resume branches one at a time.

---

## Entry points

| Function | Use |
|---|---|
| `evaluate(ast, ctx)` | Normal evaluation — tries sync first, falls back to async |
| `evaluateAsync(ast, ctx)` | Force async (avoids double-execution of side effects) |
| `evaluateWithEffects(ast, ctx, handlers)` | Full effect + suspension support |
| `evaluateWithSyncEffects(ast, ctx, handlers)` | Sync-only with effect handlers |
| `resumeWithEffects(k, value, handlers)` | Resume a previously suspended continuation |
