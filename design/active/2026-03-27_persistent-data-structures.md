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

**Decision: preserve the current host API.** Persistent structures are an internal optimization — the host never sees them.

The key insight is that Dvala's workload splits cleanly:
- **Inside Dvala**: heavy computation on large data (e.g. matrix operations) — persistent structures save O(N) on every operation
- **At host boundaries**: I/O-bound side effects (DB writes, LLM calls, user input) — O(N) conversion is negligible compared to the I/O cost

This means we can convert at every boundary without meaningful performance impact, because the host is about to do something orders of magnitude slower than the conversion.

#### Where conversion happens

1. **`dvala.run()` return value** — convert persistent → plain JS once at the end
2. **Host effect handler args** — convert persistent → plain JS before each handler call
3. **Host effect handler return values** — convert plain JS → persistent when resuming

```typescript
// Host API stays exactly the same:
const result = dvala.run('[1, 2, 3]')
result[0]  // 1 — plain JS array, no .get() needed

// Host effect handlers stay exactly the same:
dvala.run('perform(@save, {name: "Alice"})', {
  handlers: {
    save: (arg) => {
      db.save(arg)        // arg is a plain JS object
      return { ok: true } // plain JS return, converted back internally
    }
  }
})
```

#### Strategy options

**Strategy A: Eager conversion (start here)**
Convert to/from plain JS at every boundary crossing. Simple, predictable, zero API change.

**Strategy B: Proxy wrappers (optimize later if needed)**
Wrap persistent values in a JS Proxy that makes them look like plain objects/arrays. The host handler receives something that behaves like plain JS but avoids O(N) materialization unless the host actually iterates the whole thing:
- A handler that reads `arg.name` pays O(log N) for that one lookup, not O(N) to convert everything
- A handler that passes `arg` straight to `JSON.stringify()` materializes on demand
- A handler that doesn't inspect args at all pays nothing

Proxy traps need careful handling for `typeof`, `Array.isArray()`, spread, `JSON.stringify()`, etc. — but it's solvable.

**Recommendation:** Start with Strategy A. Move to B only if profiling shows conversion cost matters somewhere. They're identical from the host's perspective.

### Multi-shot continuations (falls out for free)

With immutable frames and persistent stack, multi-shot just works:

```dvala
let chooseAll = handler
  @choose(options) -> flatMap(options, (x) -> resume(x))
end

do with chooseAll;
  let a = perform(@choose, [1, 2, 3]);
  let b = perform(@choose, [a, a * 10]);
  [a, b]
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

### ~~Option C: Immer-style proxies~~ (rejected for internal representation)

Proxies as an *alternative to HAMTs* don't work — no structural sharing, no multi-shot benefit. However, proxies have a role at the **host interop boundary** (see Strategy B above) to avoid eager conversion costs.

### Recommendation: Option B

A minimal custom implementation gives the best trade-off. Dvala only needs:
- Persistent vector (array replacement): ~200 lines
- Persistent hash map (object replacement): ~300 lines
- Persistent linked list (stack): ~20 lines

---

## Migration strategy: internal proxy layer

Replacing JS arrays/objects with HAMTs would normally require rewriting every evaluator and builtin function that touches values. A **proxy layer** can drastically reduce that scope.

### The idea

Wrap persistent structures in JS Proxies internally, so the evaluator and builtins keep reading values with `arr[i]`, `obj.key`, `arr.length` — the proxy translates to HAMT lookups. Only the write/create paths need rewriting.

### What changes, what doesn't

| Code pattern | Change needed? | Why |
|---|---|---|
| `arr[i]`, `obj.key`, `arr.length` | No | Proxy get trap → HAMT lookup |
| `typeof val`, `Array.isArray(val)` | No | Proxy traps handle these |
| `[...arr, newItem]`, `{ ...obj, k: v }` | **Yes** → `arr.append(x)`, `obj.assoc(k, v)` | Spread materializes O(N), defeating the HAMT |
| `.filter()`, `.map()`, `.slice()` | **Yes** → use HAMT iterators | Same reason — iteration materializes |
| Builtins that only read args | No | Proxy handles reads transparently |

### Performance impact of the proxy layer

Proxy traps add overhead on every property access — benchmarks typically show 5-50x slower than direct property access in V8. But the comparison isn't proxy vs native JS. It's:

- `proxy trap → HAMT.get()` vs `HAMT.get()` directly

The delta is just the proxy trap dispatch, which is small relative to the HAMT tree traversal itself. And the cases where it matters most:

- **Casual reads** (`arr[0]`, `obj.name`): ~100ns proxy overhead. Irrelevant next to everything else happening in evaluation.
- **Hot inner loops** (`map`, `filter`, `reduce`): builtins use HAMT's native iterator directly, bypassing the proxy entirely.
- **Collection creation** (`append`, `assoc`): uses persistent APIs directly, no proxy involved.

The proxy is only active for the "glue code" — individual value reads in the evaluator and builtins. That's not the bottleneck.

**Conclusion:** The proxy layer is a migration strategy, not a performance concern. It should be benchmarked before committing to it, but the overhead is unlikely to matter. If it does, the proxy can be removed incrementally by rewriting read paths to direct HAMT calls — a straightforward, non-urgent optimization.

The branching factor and node layout can be tuned for Dvala's typical collection sizes.

---

## Architecture layering

The implementation is three fully decoupled layers:

```
┌─────────────────────────────────┐
│  Host boundary                  │  toJS() conversion OR proxy wrapper
├─────────────────────────────────┤
│  Internal proxy layer (optional)│  Makes HAMTs look like plain JS for evaluator/builtins
├─────────────────────────────────┤
│  Persistent data structures     │  Pure HAMT vector + hash map, no knowledge of proxies
└─────────────────────────────────┘
```

- The **data structures** are self-contained — `.get()`, `.set()`, `.push()`, `.assoc()`, iterators.
- The **internal proxy layer** is optional and can be added/removed without touching the data structures.
- The **host boundary** chooses its own strategy (eager conversion or proxy) independently.

This also means the persistent structures are **platform-portable**. Each platform implements its own:
- **JavaScript**: custom HAMT (this doc)
- **Kotlin/KMP**: `kotlinx.collections.immutable` (PersistentList, PersistentMap) or custom
- **Future platforms**: whatever native persistent collections are available

The host API and Dvala semantics stay identical across platforms — only the internal representation changes.

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
- **Playground impact**: The AST viewer and output panel display values. Need to handle persistent values correctly. (Likely a non-issue since `dvala.run()` will return plain JS.)
