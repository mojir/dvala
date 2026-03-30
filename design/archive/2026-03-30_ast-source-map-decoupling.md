# Decouple Source Maps from Node IDs

**Status:** Completed
**Created:** 2026-03-30

## Goal

Remove the dependency between AST node IDs and source map positioning. Source maps should be independently mergeable across pre-built bundles without node ID collisions. This is a prerequisite for the AST bundle format and distributed module bundles.

---

## Background

### Current design

Every AST node is a 3-tuple: `[type, payload, nodeId]`

```typescript
type AstNode = [NodeType, unknown, number]
```

The source map is an array indexed by node ID:

```typescript
interface SourceMap {
  sources: { path: string; content: string }[]
  positions: (SourceMapPosition | undefined)[]  // positions[nodeId] → location
}
```

Error reporting resolves source info via: `sourceMap.positions[node[2]]`

### The problem

Node IDs are allocated by a global counter in a single process. If two bundles are built independently (e.g. distributed module packages), their node ID sequences start from 0 and collide when merged. This makes source map lookups give wrong source locations.

### What depends on node[2] today

| Component | Uses node[2]? | How |
|-----------|--------------|-----|
| Parser | Yes | Allocates IDs, stores in sourceMap.positions[] |
| Evaluator | Yes | `env.resolve(node[2])` for error reporting (~86 call sites) |
| Source maps | Yes | Array indexed by node ID |
| Binding slots | Yes | Stores nodeId for error reporting |
| Macros/AST module | Partial | Generated nodes use nodeId: 0 (sentinel) |
| Serialization | No | Preserves IDs but doesn't use them |
| Deduplication | No | Uses content hashing |
| Caching | No | Uses source strings as keys |

## Proposal

### Keep node IDs, but don't use them as source map keys

Node IDs remain useful for identity, caching, and debugging. But the source map should use a different addressing scheme that survives merging.

### New source map addressing: source-relative positions

Instead of `positions[nodeId]`, the source map maps from `(sourceIndex, startLine, startCol)` — information that's intrinsic to the source file, not the parse process.

```typescript
interface SourceMap {
  sources: { path: string; content: string }[]
  /** Map from node ID to source position. Key is node ID within this compilation unit. */
  nodePositions: Map<number, SourcePosition>
}

interface SourcePosition {
  source: number        // index into sources[]
  start: [number, number]  // [line, col], 0-based
  end: [number, number]    // [line, col], 0-based
}
```

### Merging source maps

When merging two bundles:
1. Concatenate `sources[]` arrays
2. Remap `source` indices in the incoming bundle's positions (offset by the number of existing sources)
3. Remap node IDs in the incoming bundle's AST (offset by current max node ID)
4. Merge `nodePositions` maps (no key collisions after node ID remapping)

Node ID remapping is a single AST walk — trivial cost. The source positions themselves never change (they're relative to their original source file).

### Alternative: drop node IDs entirely

Nodes become 2-tuples: `[type, payload]`. Source positions are stored in a parallel structure addressed by AST path.

**Pros**: No IDs to collide, smaller nodes
**Cons**: Massive refactor (~86 evaluator call sites), AST path addressing is complex and fragile

**Not recommended for now.** Node IDs are cheap, useful, and remapping is simple.

### Alternative: use a source-position key instead of node ID

The source map is keyed by `"sourceIndex:line:col"` string. Nodes still carry IDs but they're not used for source map lookup. Instead, the evaluator resolves source info by looking up the node's source position.

**Problem**: Requires the evaluator to know the node's source position to look it up — circular.

### Recommended approach

**Keep the current structure but make merging explicit.** The `SourceMap` type stays as-is (positions array indexed by node ID). When merging bundles, remap node IDs. This is:

- Minimal change to existing code
- No new addressing scheme to design
- Merging is one AST walk + array offset
- Source positions are always correct after remapping

The key insight: **the problem isn't the format, it's the assumption that node IDs are globally unique without coordination.** Making remapping an explicit step when merging bundles solves the collision problem without changing the fundamental data structure.

## Open Questions

- Should we add a `nodeIdOffset` field to the bundle format so the runtime knows how to remap without a full walk?
- Should macros/code templates use a reserved range (e.g. negative IDs) instead of 0 for generated nodes?
- Should we change from a sparse array to a `Map<number, SourcePosition>` for source map positions? (Better for sparse ID spaces after merging)

## Implementation Plan

1. **Change source map from sparse array to Map** — `positions: Map<number, SourcePosition>` instead of `(SourcePosition | undefined)[]`. This handles sparse ID spaces from merged bundles efficiently.
2. **Add `remapNodeIds(ast, offset)` utility** — walks AST, adds offset to every node[2]. Returns new AST + remapped source map.
3. **Update `resolveSourceCodeInfo`** — use Map lookup instead of array index.
4. **Update parser** — write positions to Map instead of array.
5. **Update evaluator** — no change needed (still calls `env.resolve(node[2])`).
6. **Update bundle format** — include source map as serialized Map.
7. **Test with merged bundles** — verify no collisions after remapping.
