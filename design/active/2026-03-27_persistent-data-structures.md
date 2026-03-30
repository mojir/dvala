# Persistent Data Structures & Multi-Shot Continuations

**Status:** Draft
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

All four directions require **deep, recursive** conversion — nested arrays/objects must be fully converted, not just the top level.

1. **`dvala.run()` return value** — persistent → plain JS once at the end
2. **Host effect handler args** — persistent → plain JS before each handler call
3. **Host effect handler return values** — plain JS → persistent when resuming
4. **`bindings` on entry** — plain JS → persistent when host-provided bindings enter the runtime (currently not converted — a gap that must be closed)

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

**Strategy: eager conversion (Strategy A).** Convert to/from plain JS at every boundary crossing. Simple, predictable, zero API change. Strategy B (proxy wrappers at the host boundary — not the internal proxy) remains a possible future optimization if profiling shows conversion cost matters, but is not planned.

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

## Migration strategy

**No internal proxy layer.** Every read path in the evaluator and builtins is rewritten to use the HAMT API directly (`arr.get(i)`, `obj.get(key)`, `arr.size`, etc.). More upfront work, but clean result with no tech debt and no layer to remove later.

### What changes

| Code pattern | Becomes |
|---|---|
| `arr[i]` | `arr.get(i)` |
| `arr.length` | `arr.size` |
| `obj.key` | `obj.get('key')` |
| `Array.isArray(val)` | `isPersistentVector(val)` |
| `[...arr, x]`, `{ ...obj, k: v }` | `arr.append(x)`, `obj.assoc(k, v)` |
| `.map()`, `.filter()`, `.slice()` | HAMT iterator equivalents |

### Immutable frames migration

The evaluator has 50+ frame types, all currently mutated in place (`frame.index++`, `frame.values.push(value)`). Making them immutable is the highest-risk change in the plan.

**Migration strategy:** Use TypeScript's `Readonly<T>` to find every mutation site mechanically. Mark all frame types as `Readonly<...>` — the compiler immediately flags every mutation site across the codebase. Fix them one frame type at a time, running the test suite after each. No manual hunting; the compiler does the audit.

```typescript
// Before
interface EvalFrame { index: number; nodes: AstNode[] }

// After — compiler flags every frame.index++ and frame.nodes.push()
type EvalFrame = Readonly<{ index: number; nodes: readonly AstNode[] }>
```

The persistent linked list for the continuation stack comes **last** — after all frames are immutable, switching `k` from `Frame[]` to a persistent linked list is straightforward.

**Copy-on-fork rejected:** An alternative (deep-copy the stack only on second `resume` call) would unblock multi-shot sooner with less risk, but at O(stack) per fork. Given the constraint solver use case (backtracking in tight loops), O(1) forking is worth the upfront cost.

### Architecture

```
┌─────────────────────────────────┐
│  Host boundary                  │  toJS() / fromJS() conversion
├─────────────────────────────────┤
│  Persistent data structures     │  HAMT vector + hash map, persistent linked list
└─────────────────────────────────┘
```

Platform-portable — each platform implements its own persistent structures:
- **JavaScript**: custom HAMT (this doc)
- **Kotlin/KMP**: `kotlinx.collections.immutable` or custom
- **Future platforms**: native persistent collections

The host API and Dvala semantics stay identical across platforms.

---

## Phasing

1. **Phase 0**: ~~Ship handler redesign (abort/resume/return) with one-shot~~ — **complete**
2. **Phase 1**: HAMT data structures + value migration (collections, builtins, evaluator read paths, host interop, deepEqual)
3. **Phase 2**: Immutable evaluator frames + persistent continuation stack + serialization update
4. **Phase 3**: Remove one-shot guard. Multi-shot falls out for free.
5. **Phase 4**: Add `@choose` effect and nondeterminism patterns to the standard library

## Implementation Plan

### Phase 1 — HAMT data structures + value migration

**Step 0 — `deepEqual` first**
Update `deepEqual` to handle HAMT values before anything else. `==` is broken the moment HAMT values exist and `deepEqual` still uses `Array.isArray`. All downstream tests depend on this.

**Step 1 — `PersistentVector`**
`.get(i)`, `.set(i, v)`, `.append(v)`, `.prepend(v)`, `.size`, iterator, transient for bulk ops (`map`, `filter`, `reduce`). Thorough unit tests including edge cases at branching boundaries.

**Step 2 — `PersistentMap`**
`.get(k)`, `.assoc(k, v)`, `.dissoc(k)`, `.has(k)`, `.size`, `.keys()`, `.entries()`, iterator, transient. Thorough unit tests.

**Step 3 — `PersistentList`** (cons cells for the continuation stack)
`.head`, `.tail`, `cons(v, list)`, `isEmpty`. Small — ~20 lines. Built now, wired in Phase 2.

**Step 4 — Type guards**
`isPersistentVector(v)`, `isPersistentMap(v)` replacing `Array.isArray` and `typeof x === 'object'` checks.

**Step 5 — Value creation paths**
Array literals, object literals, spread operations produce HAMT values. Parser/evaluator creates persistent structures instead of plain JS.

**Step 6 — Builtins**
All array/object builtins (`map`, `filter`, `append`, `assoc`, `slice`, etc.) use HAMT API. Hot-path builtins (`map`, `filter`, `reduce`) must use transients — not just iterator equivalents.

**Step 7 — Evaluator read paths**
Property access, index access, size/length checks throughout the evaluator. Every `arr[i]` → `arr.get(i)`, `arr.length` → `arr.size`, `obj.key` → `obj.get('key')`.

**Step 8 — Host interop**
`toJS(v)` / `fromJS(v)` — deep recursive conversion in both directions. Wire into `run()` return, effect handler args/returns, and `bindings` on entry.

**Step 9 — Benchmarks**
Before/after on write-heavy workloads (`append` in a loop, object spread). Establish read regression baseline. Acceptance criteria: write ops improve by expected factor; read ops regress no more than 2–3x (O(log32 N) vs O(1)) with no user-observable slowdown on typical programs.

### Phase 2 — Immutable frames + serialization

**Step 10 — Mark frames `Readonly<T>`**
Add `Readonly<...>` to all frame type definitions. Let the compiler enumerate every mutation site.

**Step 11 — Fix mutations frame by frame**
Convert each frame type, tests green after each. Every step returns a new frame instead of mutating.

**Step 12 — Switch continuation stack to `PersistentList`**
Replace `Frame[]` with `PersistentList<Frame>`. Push/pop become `cons` / `.tail`.

**Step 13 — Update serialization**
Frames now contain persistent values. Update serialization/deserialization to handle HAMT values inside frames. The logical value serialization (Step 8 above) provides the building block.

### Phase 3 — Multi-shot

**Step 14 — Remove one-shot guard**
Delete the `resumeConsumed` check. Multi-shot works because `resume` holds an immutable stack reference — calling it twice forks from the same snapshot.

**Step 15 — `@choose` and nondeterminism stdlib**
Add `@choose` effect, `chooseAll` handler, and nondeterminism patterns to the standard library.

---

## Decisions

- **No internal proxy layer**: Take the migration hit upfront. Every read path in the evaluator and builtins gets rewritten to the HAMT API directly. Cleaner result, no tech debt, no layer to remove later.
- **Small collection threshold**: Skipped for now. Pure HAMT for all collection sizes. A hybrid representation (flat array below threshold N, HAMT above) is a known future optimization — Clojure uses this for vectors under 32 elements. Add a prominent comment in the HAMT implementation pointing to this optimization.
- **KMP portability**: Keep in mind but not a constraint for the JS implementation. The HAMT API surface should be clean and portable — no JS-specific tricks leaking into the design.
- **Equality**: `==` is always structural. Reference equality (`===`) is used internally as a fast-path optimization only — never exposed to users. Two independently constructed equal collections are still O(N) to compare; values derived from each other short-circuit at shared nodes.
- **Serialization**: Serialize persistent values as plain logical values (arrays as JSON arrays, maps as JSON objects). Reconstruct HAMTs on deserialization. The wire format is independent of the internal representation. Note: continuation frames *contain* Dvala values — frame serialization is entangled with Phase 2 (immutable frames) and is more involved than top-level value serialization.
- **Immutable frames**: Use TypeScript `Readonly<T>` to mechanically surface all mutation sites. Fix one frame type at a time with tests green throughout. Persistent continuation stack comes last.
- **Copy-on-fork**: Rejected. O(1) forking via immutable frames is worth the upfront cost given the constraint solver use case.

## Open Questions

None.
