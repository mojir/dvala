# Continuation Dedup — Implementation Plan

## Problem

Each `checkpoint()` call serializes the full continuation stack via `serializeToObject(k)`,
producing an independent plain-object tree. When the program suspends, all accumulated
snapshots are embedded in the suspension blob via `serializeSuspensionBlob()`.

With N checkpoints, the blob contains N+1 full serialized continuations (N snapshots +
the current continuation). Most of the data in each continuation is **structurally
identical** — the same AST sub-trees (function bodies, loop bodies, handler blocks)
appear verbatim in every snapshot because the program hasn't changed.

### Current sizes (estimated, 50 KB continuation)

| Checkpoints | Blob size   |
|-------------|-------------|
| 100         | 5 MB        |
| 1,000       | 50 MB       |
| 10,000      | 500 MB      |

### Target sizes with dedup

| Checkpoints | Blob size   | Reduction |
|-------------|-------------|-----------|
| 100         | ~1 MB       | ~5×       |
| 1,000       | ~9 MB       | ~6×       |
| 10,000      | ~83 MB      | ~6×       |

---

## Design

### Content-addressable sub-tree pooling

At suspension time, walk all serialized continuations (snapshot continuations +
current continuation) in a single pass. Compute a content hash for each sub-tree.
When the same hash appears more than once, store the sub-tree once in a shared pool
and replace duplicates with a reference.

### When dedup runs

- **Checkpoint time:** No change. `serializeToObject(k)` runs as today — fast, independent.
- **Suspension time:** `serializeSuspensionBlob()` runs the dedup pass over all
  snapshot continuations and the current continuation before assembling the blob.
- **Deserialization:** `deserializeFromObject()` resolves pool references back to
  inline sub-trees.

This means checkpoints stay cheap (~1 ms each). The dedup cost is paid only at
suspension — a rare event that produces a blob for external persistence.

### Size threshold

Only sub-trees above a configurable byte threshold (default: ~200 bytes serialized)
are candidates for pooling. This avoids the overhead of hashing and referencing
tiny objects where the ref itself would be comparable in size.

### Blob format

```typescript
interface DedupedBlobData {
  version: number  // bump to 2

  // Shared sub-tree pool: numeric id → sub-tree value
  pool?: Record<number, unknown>

  // Same fields as today, but sub-trees above threshold are replaced
  // with { __poolRef: <id> } markers
  contextStacks: SerializedContextStack[]
  k: unknown
  meta?: Any
  snapshots?: unknown[]
  nextSnapshotIndex?: number
}

interface PoolRef { __poolRef: number }
```

### Hashing strategy

Use a bottom-up Merkle-style hash:

1. Walk the object tree depth-first
2. For leaf values (strings, numbers, booleans, null): use the value itself as its "hash"
3. For arrays: recursively hash each element, concatenate hashes, hash the result
4. For objects: recursively hash each value (sorted by key), concatenate key+hash pairs, hash the result
5. Use a fast string hash (e.g., FNV-1a or djb2) on the concatenated representation

Why not `JSON.stringify`? It's correct but slow for deep trees. A Merkle approach
avoids re-stringifying shared sub-trees — once a sub-tree is hashed, its hash
propagates up to parents without re-walking.

### Interaction with `__csRef`

The existing `ContextStack` dedup (`__csRef` / `__csDef` markers) operates at
serialization time (per-snapshot). The pool dedup operates at blob assembly time
(across snapshots). They work at different levels and don't interfere:

- Within each snapshot: `ContextStack` instances are deduped by identity (`__csRef`)
- Across snapshots: entire sub-trees (including resolved `__csRef` data) are deduped by content hash

---

## Rules

* Do one step at a time
* Explain changes made — the codebase should be understood as we go
* If any decision is needed, ask first
* Before a step is completed:
  1. `npm run check` must pass
  2. Test coverage should be at 100%
* When a step is completed, update this plan with progress

---

## Step 1 — Content hasher utility ✅

Implemented `contentHash(value: unknown): number` in `src/evaluator/contentHash.ts`.
22 tests, 100% coverage. `npm run check` passes.

Bottom-up Merkle approach:
- Primitives: hash their JSON representation
- Arrays: hash `"[" + elements.map(contentHash).join(",") + "]"`
- Objects: hash `"{" + sortedEntries.map(([k,v]) => k + ":" + contentHash(v)).join(",") + "}"`

Use a fast non-cryptographic hash (FNV-1a or similar) that returns a numeric hash.
Accumulate child hashes directly into FNV-1a as integers rather than building
intermediate strings — avoids string concatenation overhead at every node.

**Files:**
- `src/evaluator/contentHash.ts` — `contentHash()` function

**Tests:**
- Identical structures produce identical hashes
- Different structures produce different hashes
- Object key order doesn't affect hash
- Handles nested arrays/objects
- Handles null, booleans, numbers, strings
- Performance: hash a 50 KB object tree in < 5 ms

---

## Step 2 — Sub-tree pooling function ✅

Implemented `dedupSubTrees()` in `src/evaluator/dedupSubTrees.ts`.
Includes `deepEqual`, `estimateSize`, `deepClone`, and bottom-up walking.
21 tests (combined with Step 3), 100% coverage. `npm run check` passes.

Algorithm:
1. Walk all roots, compute content hash for every sub-tree
2. Track occurrence count per hash
3. For sub-trees with count > 1 AND estimated size ≥ threshold:
   - Verify structural equality on hash match (guard against collisions)
   - Store the sub-tree in `pool` under a numeric ID
   - Replace all occurrences with `{ __poolRef: id }`
4. Return the rewritten roots and pool

Must handle sub-trees that contain `__poolRef` markers (parent pooling after
child pooling) — work bottom-up.

**Files:**
- `src/evaluator/dedupSubTrees.ts` — `dedupSubTrees()` function

**Tests:**
- No dedup when all sub-trees are unique
- Dedup when identical sub-trees appear in different roots
- Threshold filtering (small objects not pooled)
- Nested dedup (child pooled, then parent with pooled child also pooled)
- Does not corrupt `__csRef` / `__csDef` markers
- Round-trip: expand pool refs → get back original

---

## Step 3 — Pool expansion function (deserialization) ✅

Implemented `expandPoolRefs()` and `isPoolRef()` in `src/evaluator/dedupSubTrees.ts`.
Tests in `dedupSubTrees.test.ts`. 100% coverage. `npm run check` passes.

Recursively walks the object tree. When `{ __poolRef: id }` is found, replaces
it with the corresponding value from the pool (recursively expanded).

**Files:**
- `src/evaluator/dedupSubTrees.ts` — `expandPoolRefs()` function (same module)

**Tests:**
- Expands single-level refs
- Expands nested refs (pooled sub-tree contains pooled sub-tree)
- Throws on unknown pool ref
- Identity: expandPoolRefs on data with no refs returns same structure

---

## Step 4 — Integrate into `serializeSuspensionBlob` ✅

Updated `serializeSuspensionBlob()` to run `dedupSubTrees()` over all serialized data.
Bumped blob version to 2. Added `pool` field to `SuspensionBlobData`.
Existing suspend/resume tests pass. `npm run check` passes.

**Files:**
- `src/evaluator/suspension.ts` — Update `serializeSuspensionBlob()`, `SuspensionBlobData`

**Tests:**
- Suspension blob with 0 snapshots: no pool, same as before
- Suspension blob with identical snapshots: pool contains shared sub-trees
- Blob size is measurably smaller with repeated snapshots
- Existing suspend/resume tests still pass

---

## Step 5 — Integrate into `deserializeFromObject` ✅

Updated `deserializeFromObject()` to expand `__poolRef` markers from the blob's
`pool` before existing deserialization logic. Supports both v1 and v2 blobs.
All suspend/resume/snapshot tests pass. `npm run check` passes.

**Files:**
- `src/evaluator/suspension.ts` — Update `deserializeFromObject()`

**Tests:**
- Full round-trip: run → checkpoint × N → suspend → resume → checkpoint × M → complete
- Correctly restores snapshots from pooled blob
- Snapshot state survives dedup: indices, runIds, meta preserved
- `resumeFrom` works after dedup'd suspend/resume cycle

---

## Step 6 — Performance tests and threshold tuning ✅

Integration tests in `__tests__/dedup-integration.test.ts`:
- Suspension blob with checkpoints has snapshots and v2 format
- Suspend/resume round-trip works correctly with dedup
- `threshold = 0` produces correct results
- `threshold = Infinity` produces no pool (v1-equivalent)
- 1000 similar objects deduped in < 1 second with verified size reduction
`npm run check` passes.

---

## Design Decisions (Resolved)

1. **Hash algorithm:** FNV-1a. Fast, non-cryptographic. Collisions guarded by
   deep structural equality check on match — safe without being slow.

2. **Pool ref format:** Numeric IDs (`{ __poolRef: 42 }`). Shorter than hash strings,
   pool is local to a single blob so self-describing keys aren't needed.

3. **Threshold default:** 200 bytes as starting estimate. Step 6 will tune based
   on real measurements. Minimum viable threshold ~50 bytes (ref marker is ~20-30 bytes).

4. **Hash accumulation:** Feed child hashes directly into FNV-1a as integers
   rather than building intermediate strings. Avoids string concatenation overhead
   at every node.

---

## Excluded

### Streaming / incremental dedup at checkpoint time
Would require keeping a persistent hash table across checkpoints. Higher checkpoint
cost, more memory, more complexity. The one-pass-at-suspension approach is simpler
and sufficient.

### Cross-blob dedup (across suspend/resume cycles)
Each blob is self-contained. The host can implement external dedup if needed
(e.g., content-addressable storage). Not a runtime concern.

### Delta encoding between snapshots
Would produce even smaller blobs but requires ordered snapshot access and complex
patching on deserialization. Not worth the complexity for v1 of this feature.
