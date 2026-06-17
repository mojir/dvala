# Pruned Continuations

**Status:** Draft
**Created:** 2026-06-15

## Goal

Make continuations minimal — containing only the reachable future of the program. A suspended program should carry no AST that can never be executed again. As execution progresses, the continuation should shrink.

---

## Background

A Dvala continuation is the evaluator's frame stack at the point of suspension. Completed frames are already dropped — that part is correct today. However, individual frames carry unreachable AST beyond what they need.

Analysis of the current frame types reveals three main offenders:

### `SequenceFrame` — highest impact

```typescript
export interface SequenceFrame {
  type: 'Sequence'
  nodes: AstNode[]  // ALL nodes, including already-evaluated ones
  index: number     // next node to evaluate
  env: ContextStack
}
```

`nodes` is never trimmed. A module with 100 top-level definitions that suspends mid-evaluation still carries all 100 AST nodes. Only `index` advances. This is the dominant source of dead AST in a continuation — especially for module-heavy programs.

### `MatchFrame` — medium impact

```typescript
export interface MatchFrame {
  type: 'Match'
  cases: MatchCase[]  // ALL cases, including unmatched ones
  index: number
  // ...
}
```

Once a case matches and the program suspends during body evaluation, the remaining unmatched cases are dead. They persist in the frame.

### `IfBranchFrame` — minor impact

```typescript
export interface IfBranchFrame {
  type: 'IfBranch'
  thenNode: AstNode
  elseNode: AstNode | undefined
  env: ContextStack
}
```

Both branches are held while the condition is being evaluated. Once the condition resolves and `applyIfBranch` chooses a branch, the frame is consumed — so the window where both branches coexist is narrow (only during condition evaluation). Lower priority than `SequenceFrame`.

### Serialization does zero pruning

`serializeValue()` recursively serializes every field of every frame as-is. No pruning at the serialization boundary.

### Connection to the bundle and module system design

The module system design (`design/archive/2026-03-23_stabilize-wire-formats.md`) describes the continuation as the dominant artifact in a running Dvala program — larger than the module code, shrinking over execution lifetime. That property is aspirational today. Pruned continuations are what makes it real.

---

## Proposal

Prune at **frame transition time**, not at serialization. This reduces in-memory footprint as well as wire format size. Serialization then faithfully records what's in memory — no special pruning pass needed there.

### `SequenceFrame` — slice on advance

When advancing the sequence index, drop already-evaluated nodes:

```typescript
// Before: index advances, full nodes[] persists
sequenceFrame.index += 1

// After: drop evaluated nodes, reset index to 0
sequenceFrame.nodes = sequenceFrame.nodes.slice(sequenceFrame.index)
sequenceFrame.index = 0
```

Alternatively, create a new trimmed frame rather than mutating. Either way, evaluated nodes are dropped immediately after evaluation, not held until the sequence completes.

### `MatchFrame` — closed, not a real problem

Empirically verified via the baseline benchmark: `MatchFrame` is consumed before body evaluation. By the time a suspension can occur inside a case body, the frame is already off the stack. Dead cases never persist in practice.

### `IfBranchFrame` — closed, not a real problem

Same finding: the frame is consumed by `applyIfBranch` before the chosen branch is evaluated. The window where both branches coexist on the stack (during condition evaluation) is narrow and always closed before a suspension can occur inside the branch.

### Serialization

No changes needed. Pruning happens at transition time; the serializer faithfully records whatever is in the frame.

---

## Decisions (locked)

1. **Mutate or new frame:** `applySequence` already creates a new frame (`{ ...frame, index: index + 1 }`), so pruning is a natural change to what that new frame contains — no separate mutation step needed.
2. **Pruning is unconditional.** No debug-mode toggle. Debug tools should work from snapshots, not live frame internals.
3. **External references:** Audited. `SequenceFrame` is only referenced inside `trampoline-evaluator.ts`, `suspension.ts`, and tests. Tests check `step.node` (the next node being evaluated), not the new frame's sliced `nodes` — safe.
4. **`MatchFrame` and `IfBranchFrame`:** Closed. Not real problems in practice; removed from scope.
5. **Scope:** `SequenceFrame` only. `And`/`Or`/`Qq`/`ArrayBuild`/`TemplateStringBuild` deferred until data shows they matter.

---

## Implementation Plan

1. ~~**Audit all frame types**~~ — done. `SequenceFrame` is the only target.
2. ~~**Add a size measurement / baseline**~~ — done. See `benchmarks/continuation-size-baseline.md` (92–98% dead in `k`).
3. ~~**Prune `SequenceFrame`**~~ — done. `applySequence` now carries only `nodes.slice(index + 1)` with `index: 0`. Unit test added.
4. ~~**Remeasure**~~ — done. 0% dead in `k`; 21–28% byte reduction. See `benchmarks/continuation-size-baseline.md`.
5. ~~**Confirm no semantic change**~~ — done. 37 166 tests pass.
