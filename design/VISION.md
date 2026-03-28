# Dvala Vision

## The Foundation

Dvala is built on three primitives. Each depends on the previous, and the combination is greater than the sum of its parts:

1. **Pure functional** — all values are immutable, all side effects are explicit. This is the bedrock. Without purity, nothing else works: multi-shot forks state (unsafe with shared mutation), continuations serialize the stack (impossible with closures over mutable state), handler swapping changes behavior (unsound with side channels).

2. **Algebraic effects + handlers** — code performs effects without knowing how they're handled. Handlers control what happens, whether to resume or abort, and what value to return. Purity guarantees that all side effects go through this mechanism — there are no hidden channels.

3. **Serializable continuations** — the evaluation state is data (AST + environment + immutable frames). Suspend anywhere, serialize, ship, resume later with different handlers. Only possible because purity means the stack is plain data, not closures over mutable state.

No production language combines all three. Each exists in isolation — Haskell has purity, Koka has effects, Unison has serializable computations — but nobody has put them together. Dvala does.

### Emergent property: concurrency

Dvala has no concurrency primitive — no channels, no actors, no async/await. Instead, concurrency falls out for free from the foundation:

- **Multi-shot effects** give you forking (explore multiple branches)
- **Immutability** makes forks thread-safe (no shared mutable state)
- **Handlers** decide sequential vs parallel dispatch
- **The host platform** provides the actual threads (JS event loop, JVM coroutines, OS threads)

Dvala provides the *model* — fork safely, share immutable state. The host provides the *mechanism*. This means the same Dvala code runs single-threaded on JS and parallel on JVM, with no code changes. Concurrency is a deployment decision, not a language decision.

## The Insight

Most hard problems in software boil down to one question:

> **Who decides when, where, how, and whether something happens?**

In most languages, the answer is scattered: frameworks, DI containers, middleware chains, callback registrations, monadic transformers, configuration files.

In Dvala, the answer is always the same: **the handler**.

The code says "I need X." The handler decides everything else. This single mechanism — perform + handle — replaces a zoo of patterns and frameworks.

## What Falls Out Naturally

### Constraint Solving & Optimization

Multi-shot effects = explore a search space. Immutable state = backtrack for free. Handler stack = composable propagators and search strategies.

```dvala
let x = perform(@var, [1, 2, 3, 4, 5]);
let y = perform(@var, [1, 2, 3, 4, 5]);
perform(@constraint, x + y == 7);
perform(@minimize, x * y);
```

The user writes declarations. The handler stack is the solver. Swap a handler, swap the strategy.

*Design doc: [constraint-solver](active/2026-03-28_constraint-solver.md)*

### Workflow Orchestration

Long-running processes that survive restarts, deployments, and infrastructure changes. A workflow is just code with effects — `perform(@approve, request)` suspends until a human approves. The continuation serializes to a database and resumes days later.

```dvala
let order = perform(@receive_order);
let approved = perform(@approve, order);         // suspends — days pass
let payment = perform(@charge, order.total);     // resumes here
let shipped = perform(@ship, order);
perform(@notify, order.customer, shipped);
```

No workflow engine. No state machine DSL. No DAG definition. Just code. The handler decides what "suspend" means — write to Postgres, enqueue in Redis, store in S3.

### Speculative Execution

Multi-shot + race = try multiple strategies, first good answer wins:

```dvala
handle
  let strategy = perform(@choose, ["greedy", "exact", "random"]);
  run_solver(strategy, problem)
with
  ({ eff, arg, resume }) ->
    race(arg, (s) -> resume(s))   // fork all strategies, first to finish wins
end
```

Each `resume(s)` forks the continuation with a different strategy. `race` runs them concurrently (on threaded platforms) or interleaved (on JS), returning the first result.

### Transactional Systems

Handlers can intercept, buffer, and commit or rollback any effect:

```dvala
handle
  perform(@write, "users", user);
  perform(@write, "logs", entry);
  if invalid(user) then perform(@abort) end;
  perform(@write, "audit", record);
with
  // handler buffers all @write effects
  // on normal completion: commit all
  // on @abort: discard all
end
```

No transaction library. The handler *is* the transaction manager. Nest handlers for savepoints.

### Testing & Mocking

Swap handlers = swap reality. No dependency injection framework, no mock library:

```dvala
// Production
handle userCode with
  @db(query) -> postgres.execute(query)
  @http(req) -> fetch(req)
  @time() -> Date.now()
end

// Test — same userCode, different handlers
handle userCode with
  @db(query) -> inMemoryDb.execute(query)
  @http(req) -> fixtures[req.url]
  @time() -> 1234567890
end
```

The code under test doesn't know. No interfaces, no injection, no mocking framework. Handlers are the dependency injection.

### Distributed Computing

Serialize a continuation, ship it to another machine, resume with local handlers:

```dvala
// Machine A: start computation
let suspended = serialize(continuation);
perform(@send, "machine-b", suspended);

// Machine B: resume with local resources
let cont = deserialize(received);
handle resume(cont) with
  @db(query) -> localPostgres.execute(query)   // local DB, not machine A's
  @log(msg) -> localLogger.write(msg)           // local logger
end
```

The continuation carries the computation. The handlers provide the environment. Mobile code without RPC frameworks or service meshes.

### Time Travel Debugging

Immutable state means every previous state still exists:

```dvala
handle userCode with
  // handler records every continuation state
  ({ eff, arg, resume }) ->
    record(currentState);
    resume(handle(eff, arg))
end

// Replay from any recorded state
handle resume(states[42]) with ... end
```

Step forward and backward through execution. Inspect any historical state without reconstruction. The playground could visualize this — a timeline of states with full inspection at each point.

## The Pattern

Every example above follows the same pattern:

1. **Code performs effects** — declaratively states what it needs
2. **Handlers interpret effects** — decide the strategy, timing, and implementation
3. **Continuations carry state** — serialize, fork, suspend, resume
4. **Immutability enables sharing** — backtrack, parallelize, inspect without cost

No new primitives needed for each use case. No framework for each domain. The foundation is the framework.

## What This Means for Dvala

Dvala isn't a general-purpose language trying to compete with JavaScript or Python on breadth. It's a **runtime for problems that need control over execution** — scheduling, workflows, optimization, distributed systems, simulations.

The bet: a small, principled foundation (purity + effects + serializable continuations) can replace a stack of specialized tools, with code that's shorter, more composable, and easier to reason about.

The risk: nobody has shipped this combination in production. The interactions between these features might surface fundamental issues at scale. That's why the roadmap is phased — each phase validates the foundation before the next builds on it.
