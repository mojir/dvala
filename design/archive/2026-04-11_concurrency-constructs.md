# Concurrency Constructs: parallel, settled, race + Atoms

**Status:** Complete ✅
**Created:** 2026-04-11
**Completed:** 2026-04-11
**Branch:** `concurrency-constructs`

## Goal

1. Introduce **atoms** (`:ok`, `:error`, etc.) as a new Dvala value type
2. Unify and extend concurrency primitives into three clean constructs with array-of-functions branches
3. Add `settled` as a new error-tolerant mode using atom-tagged results
4. Preserve full snapshot/resume/cross-runtime portability

## Design Principles

1. **Low API surface, simple signatures** — three constructs, zero config objects
2. **Branches are arrays of functions** — composable, filterable, dynamic
3. **Run anywhere, resume everywhere** — all state is serializable data; a snapshot taken in TypeScript must resume in KMP
4. **No shared mutable state** — branches are independent; coordination happens through effect handlers

---

## Part 1: Atoms

### What is an atom?

An atom is a self-evaluating named constant — a value that represents itself. Like a string, but semantically a **tag**, not text.

```dvala
:ok
:error
:pending
:north
```

### Semantics

| Aspect | Design |
|--------|--------|
| Syntax | `:name` where name is `[a-zA-Z][a-zA-Z0-9]*` (simple identifiers) |
| Type | `typeOf(:ok)` returns `"atom"` |
| Equality | Structural: `:ok == :ok` is `true`, `:ok == :error` is `false` |
| Comparison | Atoms compare alphabetically (for `sort`, `<`, `>`) |
| String conversion | `str(:ok)` returns `":ok"` |
| Predicate | `isAtom(x)` returns `true` if x is an atom |
| Serialization | `{ "type": "atom", "value": "ok" }` — trivially portable to KMP |

### What atoms are NOT

- Not a global registry or symbol table (unlike Erlang atoms)
- Not mutable references
- Not interned at runtime (implementation may intern for performance, but no observable difference)
- Not namespaced (no `:foo.bar` — that's what effects use `@` for)

### Runtime representation

```typescript
// In interface.ts
interface Atom {
  readonly __brand: 'Atom'
  readonly name: string
}

// Constructor
function atom(name: string): Atom

// Singleton cache for common atoms (optimization, not semantic)
const OK = atom('ok')
const ERROR = atom('error')
```

### Where atoms immediately pay off

1. **Settled results**: `[:ok, v]` / `[:error, e]`
2. **Pattern matching tags**: `match msg case [:ok, v] then v case [:error, e] then handle(e) end`
3. **Enumerations**: `let direction = :north`
4. **Future Map keys**: cheaper identity comparison than strings

### Tokenizer note: `:` ambiguity

`:` is already used in object literals (`{ key: value }`) and destructuring. The tokenizer must distinguish:
- `{ status: :ok }` — `:` is key-value separator, `:ok` is atom
- `:ok` at expression position — atom literal

This is unambiguous: atom `:name` requires a letter immediately after `:`, while the key-value `:` is preceded by an identifier and followed by whitespace/expression. The tokenizer can check: if `:` is immediately followed by `[a-zA-Z]`, emit an atom token.

### Implementation scope

- New value type in `interface.ts`
- Tokenizer: recognize `:name` tokens (`:` immediately followed by `[a-zA-Z]`)
- Parser: parse atom literals as AST nodes
- Evaluator: atoms are self-evaluating (like numbers, strings, booleans)
- Predicates: `isAtom(x)`
- Equality: `==` / `!=` work structurally (already do for all Dvala values)
- Serialization: `suspension.ts` serialize/deserialize atom values
- `typeOf`: return `"atom"`
- `str`: return `":name"`
- Pretty printer: render as `:name`

---

## Part 2: The Three Constructs

```dvala
parallel(fns)     // Run all. Fail-fast on first error.      Returns [v1, v2, ...]
settled(fns)      // Run all. Collect outcomes.               Returns [[:ok, v1], [:error, e2], ...]
race(fns)         // First success wins. Errors dropped.      Returns value
```

Each takes an **array of zero-argument functions**. Nothing else.

### Syntax in practice

```dvala
// Fixed branches — arrow syntax is lightweight
parallel([
  -> perform(@host.fetch, url1),
  -> perform(@host.fetch, url2),
  -> perform(@host.fetch, url3)
])

// Dynamic branches — for produces the array, compose freely
let tasks = for(url in urls) -> (-> perform(@host.fetch, url));
settled(tasks)

// Compose
let critical = take(3, tasks);
let optional = drop(3, tasks);
parallel(critical ++ [-> fallback()])

// Pipeline with atoms
urls
  |> map(fn(url) -> (-> perform(@host.fetch, url)))
  |> settled
  |> filter(fn(r) -> first(r) == :ok)
  |> map(second)
```

### Error semantics per mode

| Mode | Branch succeeds | Branch errors | All error |
|------|----------------|---------------|-----------|
| `parallel` | Collect value | **Throw first error**, cancel rest | Throw |
| `settled` | `[:ok, value]` | `[:error, errorPayload]` | Return array (no throw) |
| `race` | **Winner** (cancel rest) | Silently drop | Throw aggregate |

### Why `settled` is essential — not just convenient

Errors from parallel branches **cannot be caught by outer Dvala-level `@dvala.error` handlers**. The BarrierFrame blocks `tryDispatchDvalaError` from finding outer handlers, and `executeParallelBranches` re-throws the error as a JS exception that bypasses algebraic dispatch on the outer continuation entirely.

```dvala
// This does NOT catch the error — @dvala.error handler never fires
do with handler @dvala.error(e) -> resume(e) end;
  parallel(raise("boom"), "ok")
end
// => UserError: boom (unhandled, crashes the program)
```

| What | Can catch errors from parallel branches? |
|------|----------------------------------------|
| Branch-local `@dvala.error` handler | **Yes** (inside the barrier) |
| Outer `@dvala.error` handler | **No** (barrier blocks it) |
| Host error handling | **Yes** (catches the DvalaError in JS) |
| `settled` | **Yes** (wraps errors as `[:error, payload]`) |

This makes `settled` **the only Dvala-level way to observe and handle branch errors without crashing**. Without it, unrecoverable branch errors can only be handled by the host.

### Error handling patterns — all composable from the three primitives

| Pattern | How |
|---------|-----|
| All must succeed | `parallel(tasks)` |
| Collect all outcomes | `settled(tasks)` |
| First success, tolerate errors | `race(tasks)` |
| Retry failed branches | `settled` -> filter `:error` results -> re-run original functions |
| Partial success with fallback | `settled` -> `map` with `match` on `:ok`/`:error` |
| At least N must succeed | `settled` -> count `:ok` -> check threshold |
| Per-branch timeout | Each branch wraps itself in `race` against a timeout effect |
| Per-branch error recovery | Branch-local `@dvala.error` handler (inside the barrier) |

```dvala
// Retry failed branches
let results = settled(tasks);
let failedIdx = for(i in range(count(results)) when first(results[i]) == :error) -> i;
let retryResults = settled(map(failedIdx, fn(i) -> tasks[i]));

// Partial success with fallback
settled(tasks) |> map(fn(r) -> match r
  case [:ok, v] then v
  case [:error, _] then defaultValue
end)

// At least N must succeed
let results = settled(tasks);
let ok = filter(results, fn(r) -> first(r) == :ok);
if count(ok) >= n then map(ok, second) else raise("not enough") end
```

No additional error-handling constructs are needed. The three primitives + `match` + collection functions cover every pattern.

### Error model for settled

When a branch errors in settled mode, the error goes through the standard `@dvala.error` dispatch:

1. Error occurs in branch
2. `tryDispatchDvalaError` looks for an `@dvala.error` handler **within the branch** (stops at BarrierFrame)
3. If found: handler runs, branch continues normally -> `[:ok, handlerResult]`
4. If not found: error escapes the branch
5. Orchestration catches it. In settled mode: wraps as `[:error, errorPayload]`

The `errorPayload` is the same structured object that `@dvala.error` handlers receive:

```dvala
settled([-> 42, -> raise("boom", { code: 42 })])
// => [[:ok, 42], [:error, { type: "UserError", message: "boom", data: { code: 42 } }]]

settled([-> raise("oops")])
// => [[:error, { type: "UserError", message: "oops" }]]

settled([-> 1 + "a"])
// => [[:error, { type: "TypeError", message: "..." }]]
```

This means:
- The error payload is **the same object** you'd see in a `@dvala.error` handler clause
- It always has `type` (string) and `message` (string)
- It may have `data` (from `raise(msg, data)`)
- Pattern matching works naturally:

```dvala
for(result in settled(tasks)) -> match result
  case [:ok, value] then process(value)
  case [:error, { message }] then log(message)
end
```

### Branch-local error handlers still work

```dvala
settled([
  // This branch handles its own errors — settled sees the handler's result
  -> do with handler @dvala.error(e) -> resume(-1) end;
    raise("handled internally")
  end,

  // This branch's error escapes — settled captures it
  -> raise("unhandled")
])
// => [[:ok, -1], [:error, { type: "UserError", message: "unhandled" }]]
```

---

## Relationship to Current Implementation

### What exists today

- `parallel(expr1, expr2, ...)` — special expression, branches are inline AST nodes, fail-fast
- `race(expr1, expr2, ...)` — special expression, branches are inline AST nodes, first success
- No `settled` equivalent
- No atom type

### What changes

| Aspect | Today | Proposed |
|--------|-------|----------|
| Atom type | Does not exist | New value type `:name` |
| Branch specification | Inline AST expressions | Array of function values |
| `parallel` arguments | Variadic AST nodes | Single array expression |
| `race` arguments | Variadic AST nodes | Single array expression |
| `settled` | Does not exist | New construct |
| Mode type | `'parallel' \| 'race'` | `'parallel' \| 'settled' \| 'race'` |
| Frame storage | `branches: AstNode[]` + `env` | `branches: FunctionValue[]` (env captured in closures) |
| Error handling | Mode-dependent | Mode-dependent, with new settled path |

### Backward compatibility

**Breaking change.** This is pre-1.0. The old `parallel(a, b, c)` inline syntax is removed. `settled` is a new special expression name — same status as `parallel` and `race` (not a reserved keyword).

```dvala
// Old
parallel(a, b, c)
race(a, b, c)

// New
parallel([-> a, -> b, -> c])
race([-> a, -> b, -> c])
```

**Note on `-> expr` syntax:** The shorthand `-> expr` creates a 1-arg function with `$` as implicit parameter. When the parallel machinery calls branches with 0 args, `$` is `null`. Since branch bodies don't reference `$`, this works correctly. The alternative `() -> expr` is explicit but more verbose. Both forms are valid.

---

## Snapshot/Resume Implications

This section maps directly to the existing parallel snapshot architecture (see `2026-04-02_parallel-race-snapshot-and-resume.md`). The core two-tier checkpoint model is unchanged — the changes are:

### 1. Function branches instead of AST branches

**Today:** `ReRunParallelFrame` stores `branches: AstNode[]` + `env: ContextStack`. On re-run, evaluates each AST node in the stored env.

**Proposed:** `ReRunParallelFrame` stores `branches: FunctionValue[]`. On re-run, calls each function (which carries its own captured env). The `env` field is no longer needed in the frame.

**Serialization:** Dvala functions are closures (AST body + captured environment). Both are plain data — serializable across runtimes. A KMP runtime deserializes the function value and calls it. No change to the serialization format's expressiveness.

**`ParallelBranchContext` changes:**
```typescript
// Today
interface ParallelBranchContext {
  branchIndex: number
  branchCount: number
  branches: AstNode[]          // AST nodes
  env: ContextStack            // env at call site
  mode: 'parallel' | 'race'
}

// Proposed
interface ParallelBranchContext {
  branchIndex: number
  branchCount: number
  branches: FunctionValue[]    // function closures (each captures its own env)
  mode: 'parallel' | 'settled' | 'race'
}
```

### 2. Settled mode in checkpoint frames

Both `ReRunParallelFrame` and `ResumeParallelFrame` carry a `mode` field. Adding `'settled'` as a variant affects how the orchestration logic handles errors:

**In `executeReRunParallel` and `executeResumeParallel`:**

```
mode === 'parallel':
  errors.length > 0 -> throw errors[0]

mode === 'settled':
  errors converted to [:error, errorPayload] in completedBranches
  never throws (errors are results)

mode === 'race':
  individual errors dropped
  all errors -> throw aggregate
```

**Critical subtlety for settled + suspension:** When a branch errors in settled mode, it counts as "completed" with value `[:error, errorPayload]`, not as "errored." This means:
- The `completedBranches` array in `ResumeParallelFrame` includes error results
- The `errors` array in orchestration is empty (errors are converted to results immediately)
- Re-suspension logic is simpler: no error-triggered failures

**Settled suspension follows the same two-tier model as parallel.** If a branch suspends in settled mode, the checkpoint composition works identically — the mode field in the `ReRunParallelFrame` / `ResumeParallelFrame` is `'settled'`, and on resume the orchestration applies settled error wrapping. The error-to-result conversion happens at the orchestration level (after branches settle), not during suspension itself.

### 3. Frame type changes

```typescript
// ReRunParallelFrame — stores functions instead of AST+env
interface ReRunParallelFrame {
  type: 'ReRunParallel'
  branchIndex: number
  branchCount: number
  branches: FunctionValue[]                   // was AstNode[]
  // env removed — captured in each function
  mode: 'parallel' | 'settled' | 'race'      // was 'parallel' | 'race'
}

// ResumeParallelFrame — same change + settled mode
interface ResumeParallelFrame {
  type: 'ResumeParallel'
  branchIndex: number
  branchCount: number
  branches: FunctionValue[]                   // was AstNode[]
  // env removed
  completedBranches: { index: number; value: unknown }[]
  suspendedBranches: {
    index: number
    k: ContinuationStack
    effectName?: string
    effectArg?: Any
  }[]
  mode: 'parallel' | 'settled' | 'race'      // was 'parallel' | 'race'
}

// ParallelBranchBarrierFrame — unchanged structure, updated context
interface ParallelBranchBarrierFrame {
  type: 'ParallelBranchBarrier'
  branchCtx: ParallelBranchContext            // updated type (see above)
}
```

### 4. The two-tier checkpoint model is unchanged

- **Tier 1 (mid-execution):** BarrierFrame -> ReRunParallelFrame. Siblings re-run by calling stored function values (instead of evaluating AST). Identical mechanism, different invocation.
- **Tier 2 (final suspension):** BarrierFrame -> ResumeParallelFrame. Suspended siblings resumed from stored continuations. Completed siblings use cached values. Unchanged.
- **BarrierFrame roles unchanged:** completion sentinel, effect boundary, context carrier.
- **Snapshot history threading unchanged:** branches inherit outer snapshot state, only suspending branch's checkpoints survive.

### 5. Atom serialization in snapshots

Atoms appear in settled results (e.g. `[:ok, 42]` stored in `completedBranches`). The serialization system must handle atoms. Since atoms are simple `{ type: "atom", value: "ok" }`, this is trivial — same category as strings and numbers.

### 6. `buildParallelResult` changes

```typescript
function buildParallelResult(completedBranches, mode) {
  switch (mode) {
    case 'parallel':
      // Array of values in order (existing)
      return sortedValues

    case 'settled':
      // Array of atom-tagged results in order
      // completedBranches already contains [:ok, v] and [:error, e] entries
      return sortedValues

    case 'race':
      // First completed value (existing)
      return firstValue
  }
}
```

---

## Evaluation Flow

### How `parallel([fn1, fn2, fn3])` evaluates

1. **Parse:** `parallel(expr)` -> `ParallelNode` with single child (the array expression)
2. **Eval:** Evaluate the array expression -> get `[fn1, fn2, fn3]` (PersistentVector of function values)
3. **Validate:** Check that all elements are functions; raise error if not
4. **Step:** Create `ParallelStep { branches: [fn1, fn2, fn3], mode: 'parallel', k }`
5. **Execute:** `executeParallelBranches` iterates over function values
6. **Per branch:** Create `ParallelBranchContext` (with function array), set up `BarrierFrame`, call `runBranch`
7. **Branch execution:** Instead of evaluating an AST node, the branch **applies** the function value (zero args)
8. **Collect results:** Mode-dependent (parallel: array, settled: tagged array, race: scalar)

### How `runBranch` changes

```typescript
// Today: evaluates an AST node
async function runBranch(node: AstNode, env, handlers, signal, k, branchCtx) {
  const barrierK = cons(BarrierFrame({ branchCtx }), k)
  const initial = { type: 'Eval', node, env, k: barrierK }
  return runEffectLoopRaw(initial, handlers, signal)
}

// Proposed: applies a function value
async function runBranch(fn: FunctionValue, handlers, signal, k, branchCtx) {
  const barrierK = cons(BarrierFrame({ branchCtx }), k)
  const initial = { type: 'Apply', fn, args: [], k: barrierK }
  return runEffectLoopRaw(initial, handlers, signal)
}
```

The branch starts with an `Apply` step (call the function with no arguments) instead of an `Eval` step (evaluate AST in env). The function's captured environment provides all context.

---

## Implementation Plan

### Phase 0: Atoms

Introduce atoms as a value type. No dependency on concurrency work — can be landed independently.

1. **Atom value type**
   - New `Atom` interface in `interface.ts` with `__brand: 'Atom'` and `name: string`
   - Constructor function `atom(name: string): Atom`
   - Type guard `isAtom(x): x is Atom`
   - Add `Atom` to the `Any` union type
   - Files: `interface.ts`

2. **Tokenizer**
   - Recognize `:name` as a new token type (`TokenType.Atom` or similar)
   - Name must match `[a-zA-Z][a-zA-Z0-9]*`
   - Files: `tokenizer/`

3. **Parser**
   - Parse atom tokens as atom literal AST nodes
   - New `AtomNode` type or reuse a literal node with atom value
   - Files: `parser/`, `interface.ts` (AST types)

4. **Evaluator**
   - Atoms are self-evaluating: `eval(:ok)` returns the atom `:ok`
   - Add to `applyValue`/`tick` as needed
   - Files: `trampoline-evaluator.ts`

5. **Core operations**
   - `typeOf(:ok)` returns `"atom"`
   - `str(:ok)` returns `":ok"`
   - `==` / `!=` work structurally (same name = equal) — likely already works via generic equality
   - `isAtom(x)` predicate in core builtins
   - `compare` support for atoms (alphabetical by name)
   - Files: `builtin/core/`

6. **Serialization**
   - `suspension.ts`: serialize atom as `{ type: "atom", value: "ok" }`
   - Deserialize back to `Atom` value
   - Files: `suspension.ts`

7. **Pretty printer**
   - Render atoms as `:name`
   - Files: `prettyPrint.ts`

8. **Tests**
   - Atom literals evaluate to themselves
   - Equality: `:ok == :ok`, `:ok != :error`
   - `typeOf`, `str`, `isAtom`
   - Pattern matching: `match x case :ok then "yes" case :error then "no" end`
   - Arrays with atoms: `[:ok, 42]`
   - Serialization round-trip
   - Files: `__tests__/atoms.test.ts`, `src/evaluator/trampoline.test.ts`

### Phase 1: Add `settled` with current inline syntax

Add `settled` as a new special expression using atoms for result tags. Keep inline branch syntax temporarily — this lets us validate settled semantics before the bigger refactor. The inline syntax code in Phase 1 will be rewritten in Phase 2, but the tests serve as regression coverage for the refactor.

9. **Add `settled` node type**
    - New `NodeTypes.Settled` constant
    - New `SettledNode` AST type (same structure as `ParallelNode`)
    - Parser/tokenizer support for `settled` keyword
    - Files: `constants.ts`, `interface.ts`, `specialExpressions/settled.ts`, tokenizer, parser

10. **Add `'settled'` to mode type**
    - Update `ParallelBranchContext.mode` to `'parallel' | 'settled' | 'race'`
    - Update `ReRunParallelFrame.mode` and `ResumeParallelFrame.mode`
    - Files: `frames.ts`

11. **Implement settled error handling in orchestration**
    - In `executeParallelBranches`: when `mode === 'settled'`, catch branch errors and convert to `[:error, errorPayload]` using `buildErrorPayload()` (existing helper). Add to `completedBranches` instead of `errors`.
    - Success branches wrapped as `[:ok, value]`
    - In `executeReRunParallel` and `executeResumeParallel`: same settled error conversion
    - Update `buildParallelResult` to handle settled mode (passthrough — results already tagged)
    - Files: `trampoline-evaluator.ts`

12. **Evaluation entry point**
    - Unify step types: `ParallelStep` gains a `mode` field instead of separate step types
    - `tick()` dispatches to `executeParallelBranches` with the mode from the step
    - Remove separate `RaceStep` — use `ParallelStep { mode: 'race' }` (optional cleanup)
    - Files: `step.ts`, `trampoline-evaluator.ts`

13. **Settled-specific tests**
    - Basic: `settled(expr1, expr2)` where one succeeds and one errors
    - All succeed: returns `[[:ok, v1], [:ok, v2]]`
    - All error: returns `[[:error, e1], [:error, e2]]` (no throw)
    - Mixed: correct ordering of ok/error results
    - Error payload structure: verify `type`, `message`, `data` fields present
    - Branch-local `@dvala.error` handler: error caught internally -> `[:ok, handlerResult]`
    - Snapshot: checkpoint inside settled branch -> resume -> settled semantics preserved
    - Resume: settled with suspension -> resume -> settled error collection
    - Nested: `settled` inside `parallel`, `parallel` inside `settled`
    - Files: `__tests__/settled.test.ts`

### Phase 2: Refactor branches to arrays of functions

Change all three constructs to accept a single array-of-functions argument. Breaking change — old inline syntax removed.

14. **Change AST node structure**
    - `ParallelNode`, `RaceNode`, `SettledNode` change from multiple branch children to a single child (the array expression)
    - Parser: `parallel(expr)` parses one argument expression
    - Validation: at parse time, just accept one expression. At eval time, validate it's an array of functions.
    - Files: parser, `specialExpressions/parallel.ts`, `specialExpressions/race.ts`, `specialExpressions/settled.ts`

15. **Add argument evaluation step**
    - Before creating branches, evaluate the array argument to get function values
    - New frame: `ParallelArgFrame` — evaluates the array expression, then on receiving the value, validates it's an array of functions and transitions to the parallel execution step
    - Files: `frames.ts`, `step.ts`, `trampoline-evaluator.ts`

16. **Update `runBranch` to apply functions**
    - Change from `{ type: 'Eval', node, env, k }` to `{ type: 'Apply', fn, args: [], k }`
    - Each function carries its captured env — no separate `env` parameter needed for the branch
    - Files: `trampoline-evaluator.ts`

17. **Update frame types**
    - `ParallelBranchContext.branches`: `AstNode[]` -> `FunctionValue[]`
    - Remove `ParallelBranchContext.env` (functions capture their own env)
    - `ReRunParallelFrame.branches`: `AstNode[]` -> `FunctionValue[]`
    - Remove `ReRunParallelFrame.env`
    - `ResumeParallelFrame.branches`: `AstNode[]` -> `FunctionValue[]`
    - Remove `ResumeParallelFrame.env`
    - Files: `frames.ts`

18. **Update serialization**
    - `suspension.ts`: serialize/deserialize function values in frame fields
    - Function values are already serializable (they're closures: AST body + PersistentMap env)
    - Verify round-trip: serialize -> deserialize -> call function -> same result
    - Files: `suspension.ts`

19. **Update re-run/resume logic**
    - `executeReRunParallel`: call stored functions instead of evaluating AST nodes in env
    - `executeResumeParallel`: same (for sibling re-triggering)
    - `composeCheckpointContinuation`: barrier->ReRunFrame conversion stores function values from branchCtx
    - Files: `trampoline-evaluator.ts`

20. **Update all existing tests**
    - All parallel/race tests rewritten with array-of-functions syntax
    - All snapshot tests updated
    - New composition tests: filter, concat, dynamic branch arrays
    - Files: `__tests__/parallel-snapshot.test.ts`, `__tests__/parallel.test.ts`, etc.

### Phase 3: Cleanup and documentation

21. **Remove old code paths**
    - Remove variadic branch parsing from parallel/race
    - Remove `env` field from frame types
    - Clean up any dead code referencing old `AstNode[]` branch patterns
    - Files: parser, `frames.ts`, `trampoline-evaluator.ts`

22. **Documentation and reference**
    - Update `parallel`, `race` docs with new array-of-functions syntax
    - Add `settled` docs with error model examples
    - Add atom docs
    - Update reference data
    - Files: `reference/`, `specialExpressions/*/docs`

23. **End-to-end and playground tests**
    - E2E tests with all three constructs
    - Playground examples showing settled + atoms
    - Cross-mode snapshot/resume tests
    - Files: `e2e/`, playground

---

## Design Decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Atom syntax | `:name` | Clean, familiar from Clojure/Elixir, no conflict with existing syntax |
| 2 | Settled error value | Full `@dvala.error` payload object | Consistent with handler model, preserves `type`, `message`, `data` |
| 3 | Backward compatibility | Break immediately | Pre-1.0, no transition period |
| 4 | Branch specification | Array of functions only | Composable, simple, clean with `->` syntax |
| 5 | `limit:` parameter | Deferred | Host-level concern for now |
| 6 | Result tagging | Atoms (`:ok`, `:error`) | First-class values, not strings |
| 7 | Atom name format | `[a-zA-Z][a-zA-Z0-9]*` | Simple, no dots (reserved for effects), no hyphens |
| 8 | Function validation | Runtime check | `parallel` validates array elements are functions, clear error message |

---

## Concurrency Safety Model

### The guarantee

Dvala's concurrency model is intentionally restricted to avoid the complexity of thread-based concurrency:

- **No shared mutable state** — branches cannot access shared variables, queues, or channels
- **No locks, mutexes, or semaphores** — not needed because there's nothing shared to protect
- **No deadlocks possible** — branches are independent; they can't wait on each other
- **No actor mailboxes** — actors imply identity and mutable state, both incompatible with snapshot/resume
- **Structured concurrency only** — every branch is scoped to its block, no orphaned tasks

Branches talk **up** to handlers (via `perform`), never **sideways** to siblings. The BarrierFrame enforces this at the evaluator level.

The three constructs (`parallel`, `settled`, `race`) are the complete concurrency surface. They are deterministic in structure, fully serializable, and free of the class of bugs (deadlocks, race conditions, starvation) that shared-state concurrency introduces.

### Why the BarrierFrame is the key safety mechanism

Algebraic effect handlers in Dvala can model mutable state. A shallow handler that handles `@state.get` and `@state.set` effectively creates a stateful computation context. This is a well-known and useful pattern in algebraic effects:

```dvala
do with stateHandler(0);
  let x = perform(@state.get);
  perform(@state.set, x + 1);
  perform(@state.get)             // => 1
end
```

Now consider what would happen if parallel branches could reach this handler:

```dvala
// HYPOTHETICAL — if effects crossed the BarrierFrame (NOT how Dvala works)
do with stateHandler(0);
  parallel([
    -> do
      let x = perform(@state.get);      // read: 0
      perform(@state.set, x + 1)        // write: 1
    end,
    -> do
      let x = perform(@state.get);      // read: 0 or 1? depends on interleaving
      perform(@state.set, x + 1)        // write: 1 or 2? classic lost update
    end
  ])
end
```

This is a textbook read-modify-write race condition — in pure Dvala, no host involved. Two branches concurrently accessing a stateful handler produces non-deterministic results.

**The BarrierFrame prevents this.** Effects from inside parallel branches cannot propagate through the barrier to reach outer handlers. The stateful handler is invisible to branches. This is not an inconvenience — it is the mechanism that makes Dvala's concurrency safe.

The BarrierFrame serves three critical roles simultaneously:
1. **Completion sentinel** — catches branch results
2. **Effect boundary** — blocks effects from reaching outer handlers (prevents race conditions on stateful handlers)
3. **Context carrier** — holds branch metadata for snapshot composition

### First-class handlers and branch safety

Handlers are first-class values in Dvala. You can pass a handler into a parallel branch and install it there:

```dvala
let h = handler @state.get() -> resume(42) end;
parallel([
  -> do with h; perform(@state.get) end,
  -> do with h; perform(@state.get) end
])
```

This **does** bypass the BarrierFrame — each branch installs the handler on its own k, above the barrier. The effect finds it before hitting the barrier.

But this is safe, because each `do with h; ... end` creates a **new, independent AlgebraicHandleFrame** on the branch's own continuation. The handler value is a template (immutable AST + closures), not a stateful instance. State in algebraic effects is modeled through the continuation, which is per-branch.

Even a handler that models mutable state through continuation-threading is safe:

```dvala
let stateHandler = fn(init) -> handler
  @state.get() -> fn(s) -> (resume(s))(s)
  @state.set(v) -> fn(s) -> (resume(null))(v)
end;

parallel([
  -> do with stateHandler(0);
    let x = perform(@state.get);      // reads 0 (branch 1's state)
    perform(@state.set, x + 1);
    perform(@state.get)               // reads 1
  end,
  -> do with stateHandler(0);
    let x = perform(@state.get);      // reads 0 (branch 2's independent state)
    perform(@state.set, x + 1);
    perform(@state.get)               // reads 1
  end
])
// => [1, 1] — independent state per branch, no race condition
```

Each branch threads its own state through its own continuation. No sharing, no interference.

**The one exception: handlers that proxy to host shared state.**

```dvala
let h = handler
  @state.get() -> resume(perform(@host.getSharedCounter))
  @state.set(v) -> do perform(@host.setSharedCounter, v); resume(null) end
end;

parallel([
  -> do with h;
    let x = perform(@state.get);
    perform(@state.set, x + 1)
  end,
  -> do with h;
    let x = perform(@state.get);
    perform(@state.set, x + 1)
  end
])
```

This IS a race condition — but it's the host boundary issue in disguise. The Dvala handler is just a proxy; the actual shared mutable state (`@host.getSharedCounter`) lives in the host.

**Summary of exploit vectors:**

| Attack vector | Works? | Why |
|---------------|--------|-----|
| Closure over handler scope | **No** | Effect dispatch is dynamic (continuation stack), not lexical |
| Captured resume function passed to branch | **No** | Resumed continuation re-enters the same code path, self-defeating |
| First-class handler passed to branch | **Safe** | Each `do with h` creates independent frame; state is per-continuation |
| First-class handler proxying to host | **Race condition** | Host shared state — same as direct host effects |
| AST manipulation via macros | **No** | Macro-expanded code goes through normal evaluator with barrier checks |
| Shared value references | **No** | All Dvala values are immutable — nothing to race on |

The safety guarantee rests on three independent properties:

1. **Effect dispatch is dynamic** — walks the continuation stack, not lexical scope. Closures can't smuggle handler access across the barrier.
2. **The BarrierFrame sits on the continuation stack** — any effect dispatched inside a branch hits it.
3. **All values are immutable** — even shared references are harmless. Handler values are templates, not stateful instances.

You would need to break **all three** to create a race condition in pure Dvala.

### Where race conditions CAN still occur

The safety boundary is at the host level. Host effect handlers exist outside Dvala and can provide access to shared external state — either directly or through a Dvala handler proxy.

| Layer | Race conditions possible? | Why |
|-------|--------------------------|-----|
| Pure Dvala code | **No** | All values immutable, no shared state |
| Dvala algebraic handlers (outer) | **No** | BarrierFrame blocks cross-branch effect propagation |
| Dvala algebraic handlers (in branch) | **No** | Each `do with h` creates independent state per branch |
| First-class handler proxying to host | **Yes** | Host state is shared — Dvala handler is just a proxy |
| Host effect handlers directly | **Yes** | Host state is outside Dvala's control |

**Guidance for host authors:** effect handlers used with `parallel`/`settled`/`race` must be safe for concurrent access. If a handler exposes shared mutable state, it must handle its own synchronization (e.g., atomic operations, serialized access). Dvala guarantees branch isolation at the language level; the host guarantees it at the integration level.

### Concurrency safety test suite

The safety model must be verified by a comprehensive test suite covering every exploit vector. These tests ensure that future evaluator changes don't accidentally break the isolation guarantees.

**BarrierFrame effect isolation:**
- Outer algebraic handler is NOT visible to parallel branches
- Outer `@dvala.error` handler does NOT catch branch errors
- `tryDispatchDvalaError` stops at the BarrierFrame
- `dispatchPerform` stops at the BarrierFrame

**Closure-based attacks:**
- Function defined in handler scope, called inside branch — effect dispatch uses branch's k, not closure's scope
- Function capturing handler-scope variable, called inside branch — no handler leakage

**First-class handler safety:**
- Same handler value used in two branches — each creates independent frame
- Stateful handler (continuation-threaded) in two branches — independent state per branch
- Handler that proxies to host effect — verify this DOES access host (documenting the boundary)

**Resume function attacks:**
- `resume(resume)` trick — captured resume function called from branch doesn't break isolation
- Multi-shot resume from inside branch — stays within branch's continuation

**Immutability:**
- Shared object reference across branches — verify no mutation possible
- Shared array reference across branches — verify no mutation possible

**Nested parallel:**
- Nested `parallel` inside `parallel` — inner barrier doesn't leak to outer, outer doesn't leak to inner
- Handler between nesting levels — only visible to the correct scope

**Integration with settled:**
- Branch error in settled mode — properly wrapped as `[:error, payload]`, not propagated
- Branch-local `@dvala.error` handler — catches error within branch, settled sees `[:ok, handlerResult]`

Files: `__tests__/concurrency-safety.test.ts`

### The Book: Concurrency chapter

This safety model — and the reasoning behind it — deserves a dedicated chapter in The Book (the Dvala language guide). It should cover:

1. **The concurrency model** — `parallel`, `settled`, `race` as the three primitives
2. **Branches are independent** — no shared state, no communication, no deadlocks
3. **The BarrierFrame explained** — why effects can't cross branch boundaries, with the stateful handler example showing what would go wrong
4. **First-class handlers are safe** — why passing handlers into branches doesn't break isolation, with the continuation-threaded state example
5. **The host boundary** — where race conditions CAN occur (host effects and handler proxies), and how to write safe host handlers
6. **Comparison with other models** — how Dvala's approach differs from threads/locks, actors, channels, and async/await. What you give up (inter-branch streaming) and what you gain (determinism, serializability, portability)
7. **Patterns** — structural composition (sequential parallel stages), host-mediated coordination, effect-based producer/consumer via host handlers

## Non-Goals

- **Channels / inter-branch communication** — violates snapshot/resume, introduces shared mutable state, and breaks the BarrierFrame safety guarantee
- **Bounded parallelism (`limit:`)** — deferred, host-level concern for now
- **Lazy sequences** — separate feature, orthogonal to concurrency
- **Atom namespacing** — keep atoms simple; effects handle namespacing via `@`
