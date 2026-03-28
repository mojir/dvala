# Constraint Solver via Multi-Shot Effects

**Status:** Draft
**Created:** 2026-03-28

## Goal

Build a general-purpose constraint solver on top of Dvala's multi-shot effects and handler stack. The solver should handle real scheduling problems (cumulative constraints, optimization) with reasonable performance, while keeping the architecture composable — swap propagators, search strategies, and execution modes by swapping handlers.

Secondary goal: demonstrate that multi-shot effects + immutable state = thread-safe concurrency for free, enabling parallel search on threaded platforms (KMP/JVM).

---

## Background

### Why effects for constraint solving

A constraint solver needs four things:

1. **Domain variables** — variables with finite domains of possible values
2. **Constraints** — relations between variables (equality, inequality, cumulative, etc.)
3. **Propagation** — narrowing domains when a variable is assigned or a domain shrinks
4. **Search** — choosing a variable, trying values, backtracking on failure

Traditional solvers implement all four as a monolithic engine. In Dvala, each maps to a handler layer:

| Solver component | Dvala mechanism |
|---|---|
| Domain variables | `@var` effect — handler tracks domains |
| Constraints | `@constraint` / `@cumulative` effect — handler registers and propagates |
| Search | `@choose` effect — multi-shot continuation forks for each value |
| Backtracking | Immutable state — revert by keeping the old pointer |
| Optimization | `@minimize` effect — branch and bound via handler |

### The composability argument

The real value isn't raw speed — it's that every layer is swappable:

- Swap the `@cumulative` handler for a stronger/weaker propagator
- Swap the search handler for DFS, BFS, or best-first
- Swap sequential exploration for parallel
- Add new constraint types as new handlers

User code doesn't change. The problem description is declarative; the handler stack is the solver configuration.

---

## Proposal

### User-facing API

A scheduling problem looks like plain Dvala code:

```dvala
let tasks = [
  { id: "A", duration: 3, usage: 2 },
  { id: "B", duration: 2, usage: 3 },
  { id: "C", duration: 4, usage: 1 },
  { id: "D", duration: 2, usage: 2 },
];

let capacity = 4;
let horizon = 10;

let starts = map(tasks, (task) ->
  perform(@var, { name: task.id, domain: range(0, horizon - task.duration) })
);

perform(@cumulative, { tasks: tasks, starts: starts, capacity: capacity });

let makespan = max(zipWith((s, t) -> s + t.duration, starts, tasks));
perform(@minimize, makespan);
```

### Handler stack architecture

```
@minimize        — branch and bound, tracks best solution
  @cumulative    — propagation (timetable, edge-finding)
    @constraint  — simple constraints (equality, inequality, arithmetic)
      @var       — domain tracking, @choose for search, @fail for dead ends
        user code
```

Each layer is a separate handler. The user wraps their problem in the stack they want:

```dvala
handle
  handle
    handle
      // user's problem definition
    with varHandler end
  with cumulativeHandler end
with minimizeHandler end
```

Or, with a convenience wrapper:

```dvala
solve({
  search: :dfs,
  propagators: [:cumulative, :alldifferent],
}, () ->
  // user's problem definition
)
```

### The `@var` handler (search)

The core of the solver. Tracks variable domains and performs search via `@choose`:

```dvala
// Simplified — the handler threads a constraint store through resume
@var({ name, domain }) ->
  let store = addVariable(store, name, domain);
  resume(choose(store, name))    // multi-shot: fork for each value in domain
```

When `@choose` forks, each branch gets its own immutable constraint store. Backtracking is O(1) — just discard the branch's pointer.

### The `@cumulative` handler (propagation)

Implements resource-constrained scheduling propagation:

**Timetable propagation** — for each task, compute the mandatory part (the interval where the task must be running regardless of start time). If mandatory parts at any time point exceed capacity, prune start domains.

**Edge-finding** — reason about task sets: "these tasks can't all fit before task X" → adjust X's earliest start.

The handler intercepts `@var` lookups to narrow domains before search continues:

```dvala
@cumulative({ tasks, starts, capacity }) ->
  let store = propagate(store, tasks, starts, capacity);  // fixpoint loop
  if inconsistent(store) then perform(@fail)
  else resume(store)
  end
```

### Parallel search

Multi-shot gives you forks. The execution strategy is a handler decision:

```dvala
// Sequential (default) — try each value one by one
flatMap(domain, (v) -> resume(v))

// Parallel — fan out across workers
parallel(domain, (v) -> resume(v))

// Race — first solution wins, cancel the rest
race(domain, (v) -> resume(v))
```

Same multi-shot, different dispatch. The user code and propagators don't know or care.

### Thread safety from immutability

Multi-shot forks share immutable structure (persistent data structures, immutable frames). No fork can mutate another fork's state. This means:

- **JS/single-threaded**: forks run interleaved. Correct, not concurrent.
- **KMP/JVM**: forks map to coroutines or threads. No locks, no synchronization, no data races.
- **Any threaded runtime**: same Dvala code, real parallelism for free.

Dvala doesn't need a concurrency model. It needs immutable values and multi-shot effects. The host platform provides the threads.

This is the same insight behind Erlang (isolated processes) and Clojure (persistent structures), but Dvala gets it from the combination of its existing features rather than a dedicated concurrency primitive.

---

## Performance analysis

### Where it's competitive

- **Algorithmic complexity**: propagation + backtracking search — same as production solvers
- **Backtracking cost**: O(1) with persistent data structures vs O(N) state restoration in traditional solvers
- **Composability**: adding/removing propagators is trivial — production solvers make this hard

### Where it's slower

- **Constant factor**: handler dispatch + continuation management vs direct function calls in C++/Java solvers
- **Propagation**: generic handler-based propagation vs specialized bit-vector/watched-literal data structures
- **Incremental propagation**: naive approach re-propagates everything per choice point; production solvers only re-propagate what changed

### Expected performance class

Roughly comparable to a constraint solver written in Python (python-constraint, OR-Tools Python bindings). For problems with tens to hundreds of tasks — real scheduling problems, not millions — the difference is seconds vs milliseconds. Correct and usable.

---

## Open Questions

- **Propagation fixpoint**: how to express the fixpoint loop (propagate until no domain changes) cleanly in the handler model? Recursive handler calls? A dedicated `@propagate` effect?
- **Constraint store representation**: persistent map from variable names to domains? How to efficiently represent and narrow domains?
- **Incremental propagation**: can handlers track "what changed" to avoid re-propagating everything? This is the main performance lever.
- **Global constraints beyond cumulative**: alldifferent, element, table — each would be a handler. How much can be shared?
- **Optimization (branch and bound)**: how does the `@minimize` handler communicate bounds back to inner handlers for pruning? Needs to thread the best-known bound through the constraint store.
- **Lazy evaluation interaction**: with lazy effects, constraint posting could be deferred until the solver actually needs them. Is that useful (dynamic constraint discovery) or confusing?
- **Convenience API**: the raw handler stack is powerful but verbose. What does a good user-facing `solve()` wrapper look like?

---

## Implementation Plan

1. **Depends on**: handler redesign (Phase 1), persistent data structures (Phase 3), multi-shot (Phase 4)
2. **Prototype `@var` + `@choose` + `@fail`** — basic nondeterministic search, no propagation
3. **Add simple constraints** — equality, inequality, arithmetic. Propagation via domain filtering.
4. **Add `@cumulative`** — timetable propagation first, edge-finding later
5. **Add `@minimize`** — branch and bound with bound threading
6. **Parallel search** — `parallel()` / `race()` dispatch for multi-shot forks
7. **Benchmark** — compare against python-constraint on standard scheduling benchmarks
8. **Convenience API** — `solve()` wrapper that assembles the handler stack
