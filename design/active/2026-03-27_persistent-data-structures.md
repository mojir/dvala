# Persistent Data Structures & Multi-Shot Continuations

**Status:** Future
**Created:** 2026-03-27

## Goal

Replace Dvala's internal representation of arrays and objects with persistent (structurally-shared) data structures. This solves two problems at once:

1. **Value operations on large collections** — currently O(N) clone per operation, becomes O(log N)
2. **Multi-shot continuations** — continuation stack becomes free to fork, enabling nondeterminism, backtracking, and probabilistic programming

---

## Background

### The cloning problem

Dvala is a pure functional language — all values are immutable. Every operation that "modifies" a collection creates a full copy:

```dvala
let big = range(100000);
let bigger = append(big, 1);       // copies 100,000 elements
let updated = set(big, 50000, 0);  // copies 100,000 elements to change one
let merged = { ...largeObj, x: 1 } // copies entire object to add one key
```

This is the fundamental cost of immutability without structural sharing.

### The multi-shot problem

Multi-shot continuations (calling `resume` multiple times in an effect handler) require cloning the continuation stack. With mutable frames, this means serializing and deserializing the entire stack. With immutable persistent structures, forking is O(1) — just keep the pointer.

### How Clojure solves this

Clojure uses Hash Array Mapped Tries (HAMTs) for all collections. An "update" creates a new root with a path-copied spine — typically 1-6 nodes — sharing everything else with the original:

```
Original vector [a b c d e f ... 1M elements]
                 └─ node1 ─ node2 ─ node3 ─ ...

append(original, x):
                 └─ node1 ─ node2 ─ node3' ─ ... (new leaf)
                                    ↑ shares node1, node2 with original
```

Branching factor 32 means max depth ~6 for a billion elements. O(log32 N) ≈ O(1) in practice.

---

## Proposal

### Replace internal representation

| Type | Current (JS native) | Persistent |
|---|---|---|
| Array | `any[]` | Persistent vector (HAMT-based, branching factor 32) |
| Object | `Record<string, any>` | Persistent hash map (HAMT) |
| Continuation stack | `Frame[]` | Persistent linked list (cons cells) |

### Evaluator: immutable frames

Currently frames are mutated in place:
```typescript
frame.index++
frame.values.push(value)
```

After: every step returns a new frame:
```typescript
const next = { ...frame, index: frame.index + 1 }
return { type: 'Eval', node: next.nodes[next.index], k: push(next, k.tail) }
```

The continuation stack becomes a persistent linked list:
```typescript
type Stack<T> = null | { head: T; tail: Stack<T> }
```

Push and pop are O(1). Forking (multi-shot) is O(1) — just keep the reference.

### Performance characteristics

| Operation | Today | After |
|---|---|---|
| `append(arr, x)` | O(N) clone | O(log32 N) ≈ O(1) |
| `set(arr, i, v)` | O(N) clone | O(log32 N) |
| `get(arr, i)` | O(1) | O(log32 N) — slightly slower |
| `{ ...obj, key: v }` | O(N) clone | O(log32 N) |
| `get(obj, key)` | O(1) | O(log32 N) — slightly slower |
| `map(arr, f)` | O(N) build new array | O(N) but with transient optimization |
| `resume(v)` single | Same as today | Same as today |
| `resume(v)` multi-shot | Serialize + deserialize O(stack) | O(1) — keep pointer |

Read access gets slightly slower (O(log32 N) vs O(1)), but writes go from O(N) to O(log32 N). Net win for any non-trivial collection.

### Transient optimization

For bulk operations like `map`, `filter`, `reduce` that build a new collection step by step, use transients — a temporarily mutable persistent structure that's converted to immutable at the end:

```typescript
// Conceptual: map with transient
function map(collection, fn) {
  let result = collection.asTransient()  // mutable view
  for (const item of collection) {
    result.push(fn(item))                // cheap mutation
  }
  return result.asPersistent()           // freeze back to immutable
}
```

Clojure uses this pattern extensively. Transients are ~2x faster than persistent operations for bulk builds.

### Host interop boundary

Dvala values would no longer be plain JS objects and arrays. The host API needs a conversion layer:

```typescript
// Today: plain JS values
const result = dvala.run('[1, 2, 3]')
result[0]         // 1 — just a JS array

// After: persistent values with toJS()
const result = dvala.run('[1, 2, 3]')
result.toJS()     // [1, 2, 3] — converts to plain JS
result.get(0)     // 1 — direct access without conversion
```

Options:
- **Auto-convert at boundary**: `dvala.run()` always returns plain JS. Simple for users, but loses structural sharing.
- **Lazy conversion**: Return persistent values, provide `.toJS()`. Users who pass values back into Dvala avoid conversion round-trips.
- **Configurable**: Let the host choose.

### Multi-shot continuations (falls out for free)

With immutable frames and persistent stack, multi-shot just works:

```dvala
handle
  let a = perform(@choose, [1, 2, 3]);
  let b = perform(@choose, [a, a * 10]);
  [a, b]
with
  return(x) -> [x]
  ({ arg, eff, nxt, resume }) ->
    if eff == @choose then
      flatMap(arg, (x) -> resume(x))    // each resume shares the immutable stack
    else nxt(eff, arg)
    end
end
// → [[1, 1], [1, 10], [2, 2], [2, 20], [3, 3], [3, 30]]
```

No serialization, no cloning, no opt-in. `resume` is just a function that takes an immutable stack reference.

The one-shot guard becomes unnecessary and can be removed.

---

## Implementation options

### Option A: ImmutableJS

Battle-tested library (Facebook). Provides `List`, `Map`, `Set`, `Record`.

- **Pro**: Mature, well-optimized, good documentation
- **Con**: Large dependency (~60KB minified), API differs from plain JS
- **Con**: Partially unmaintained (slow release cadence)

### Option B: Custom HAMT implementation

Build a minimal persistent vector and hash map tailored to Dvala's needs.

- **Pro**: No dependency, optimized for Dvala's access patterns
- **Con**: Significant implementation effort, needs thorough testing

### Option C: Immer-style proxies

Use JS Proxy to intercept mutations and create structural copies lazily.

- **Pro**: Values look like plain JS objects (no API change)
- **Con**: Not truly persistent — no structural sharing across time
- **Con**: Proxy overhead on every access
- **Con**: Doesn't help with multi-shot (still need to clone)

### Recommendation: Option B

A minimal custom implementation gives the best trade-off. Dvala only needs:
- Persistent vector (array replacement): ~200 lines
- Persistent hash map (object replacement): ~300 lines
- Persistent linked list (stack): ~20 lines

The branching factor and node layout can be tuned for Dvala's typical collection sizes.

---

## Phasing

1. **Phase 0 (now)**: Ship handler redesign (abort/resume/return) with one-shot
2. **Phase 1**: Persistent vector and hash map for Dvala values. Benchmark against current clone-based approach. Add host interop boundary.
3. **Phase 2**: Immutable evaluator frames + persistent continuation stack
4. **Phase 3**: Remove one-shot guard. Multi-shot falls out for free.
5. **Phase 4**: Add `@choose` effect and nondeterminism patterns to the standard library

---

## Open Questions

- **Small collection threshold**: For arrays < N elements, is a plain JS array faster than a HAMT? Should small collections use flat arrays internally?
- **Equality**: Persistent structures enable O(1) reference equality (`===`). Should Dvala's `==` use this? (Clojure does for identical? vs =)
- **Serialization**: Persistent structures need custom serialization. The current continuation serialization assumes plain arrays/objects.
- **String representation**: Strings are already immutable in JS. Do they need persistent treatment? (Probably not — JS strings are efficient.)
- **Playground impact**: The AST viewer and output panel display values. Need to handle persistent values correctly.
