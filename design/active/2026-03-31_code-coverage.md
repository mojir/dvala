# Dvala Code Coverage & Debugger

**Status:** Draft
**Created:** 2026-03-31

---

## Overview

Three-part initiative built on a shared foundation:

- **Part 1 — Preparation**: wire source positions and the `onNodeEval` hook into the evaluator, fix snapshot timing
- **Part 2 — Code Coverage**: collect hit node IDs, produce coverage reports
- **Part 3 — Debugger**: breakpoints, variable inspection, time travel

Parts 2 and 3 are independent once Part 1 is done.

---

## Part 1 — Preparation

### 1a. Source Map in the Evaluator

`AstNode` is `[NodeType, Payload, nodeId: number]`. Source positions live in a separate `SourceMap` (`Map<nodeId, {start, end}>`) that is only built today when source text is passed to the parser (debug/error mode).

**Change**: when coverage or debug mode is active, always build the `SourceMap` and thread it through to the evaluator so the hook can resolve `node[2]` → `{line, col}`.

### 1b. `onNodeEval` Hook

```typescript
onNodeEval?: (node: AstNode, getContinuation: () => Continuation) => void

interface Continuation {
  env: ContextStack           // current bindings
  k: ContinuationStack        // call stack
  resume: () => void          // continue execution
  getSnapshots: () => Snapshot[]  // prior post-effect snapshots (time travel)
}
```

`getContinuation()` is **lazy** — only called when needed. In the coverage path it is never called, costing nothing beyond the function call itself.

### 1c. Fix Snapshot Timing

Current behavior: snapshot taken **before** each effect.

New behavior:
1. **One snapshot at program start** — before the first node is evaluated
2. **One snapshot after each effect resolves** — effect result already in scope

**Why after?** A post-effect snapshot has the effect result baked in. Re-executing from it is pure and deterministic — no effect results need to be replayed. The segment between any two consecutive snapshots is always pure.

---

## Part 2 — Code Coverage

**Primary unit**: AST node. Coverage collects a `Set<nodeId>` of evaluated nodes.

- More precise than line coverage — a single line can contain multiple expressions
- Branch coverage falls out naturally: both arms of `if` are separate nodes; if only one nodeId appears in the hit set, the other branch was never taken

**Display**: derive line-level indicators from node positions (`sourceMap.positions.get(nodeId)`) for editor gutters.

**Output format**: LCOV for line-level (unlocks VS Code gutter + CI). Node-level format can be added later for precise expression highlighting.

**API**: `dvala test --coverage`

---

## Part 3 — Debugger

Built on the same `onNodeEval` hook.

| Capability | Mechanism |
|---|---|
| Continue | `resume()` from `getContinuation()` |
| Inspect variables | `env` from `getContinuation()` |
| Call stack display | `k` from `getContinuation()` |
| Step over / into / out | host tracks depth across `onNodeEval` calls |
| Time travel (step back) | `getSnapshots()` → retrigger → pure re-execution to target node |
| Alter effect result / crash recovery | rewind to snapshot after effect N-1, re-handle effect N differently |

**Breakpoint protocol**: host maintains a `Set<nodeId>` of breakpoints. On each `onNodeEval` call, host checks if `node[2]` is in the set. If yes, calls `getContinuation()` and holds `resume()` until "continue" is clicked.

**Time travel algorithm**:
```
rewind(targetNodeId):
  snapshot = latest snapshot with position ≤ target
  retrigger(snapshot)
    → pure re-execution, deterministic
    → onNodeEval stops when targetNodeId is reached
```

No effect history needed — pure re-execution is always correct.

---

## Part 1 — Implementation Plan

1. **Thread `SourceMap` to evaluator**
   - Add `sourceMap?: SourceMap` to the evaluator's run options / context
   - When `onNodeEval` is set, require source map to be built (parser must receive source text)
   - Expose `resolvePosition(nodeId): SourceMapPosition | undefined` helper

2. **Add `onNodeEval` to run options**
   - Add `onNodeEval?: (node: AstNode, getContinuation: () => Continuation) => void` to `DvalaRunOptions`
   - Thread it through `runEffectLoop` → trampoline dispatch
   - Call it at the top of the main `eval` dispatch loop (before the `switch` on node type)
   - `getContinuation` closes over current `(env, k)` — only captures when called

3. **Fix auto-checkpoint timing**
   - Take a snapshot at `runEffectLoop` start (program start)
   - Remove the "intercept before effect" mechanism
   - After an effect resolves and its result is about to be applied — take snapshot then continue
