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

### `MatchFrame` — drop cases after match

Once a case matches (phase transitions from `matchValue` to `body`), drop all cases except the matched one:

```typescript
// After match found at index i:
matchFrame.cases = [matchFrame.cases[i]!]
matchFrame.index = 0
```

The matched case body may still be needed (for guard re-entry or debugging). Unmatched cases are dead.

### `IfBranchFrame` — drop unchosen branch at condition resolution

In `applyIfBranch`, before returning the eval step for the chosen branch, the frame is consumed so this is naturally handled. No change needed unless the frame somehow persists (confirm with a test).

### Serialization

No changes needed if pruning happens at transition time. The serializer already faithfully records frame state.

---

## Open Questions

- Should we mutate frames in place or create new trimmed frames? Mutation is cheaper; new frames are easier to reason about.
- Does anything outside the evaluator hold references to `SequenceFrame.nodes` that would break if the array is replaced? (closures capturing the frame, debug tooling, snapshot diffing)
- Should pruning be togglable (e.g. disabled in debug mode to preserve full AST for error messages)?
- Does `IfBranchFrame` actually persist in any real suspension scenario, or is the window always closed before a suspension can occur?
- Are there other frame types with similar issues not covered here?

---

## Implementation Plan

1. **Audit all frame types** — enumerate every frame that holds `AstNode` fields or arrays. Confirm which ones can carry past/unreachable AST beyond the three identified here.
2. **Add a size measurement** — before changing anything, add a utility that measures continuation size (node count) at suspension time. Establish a baseline on representative programs.
3. **Prune `SequenceFrame`** — slice `nodes` on each index advance. Add a test that confirms a module-heavy program produces a smaller continuation after executing past module definitions.
4. **Prune `MatchFrame`** — drop unmatched cases after a match is found.
5. **Verify `IfBranchFrame`** — confirm with a test whether both branches ever appear in a serialized continuation. Fix if they do.
6. **Remeasure** — run the same size measurement from step 2. Record the reduction.
7. **Confirm no semantic change** — full test suite must pass unchanged. Pruning is pure optimization; semantics must be identical.
