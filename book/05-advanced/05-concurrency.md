# Concurrency: parallel, race & settled

## Background: Structured Concurrency

[Martin Sústrik](https://250bpm.com/blog:71/) introduced **[structured concurrency](https://en.wikipedia.org/wiki/Structured_concurrency)** (2016) — the idea that concurrent operations should be scoped like blocks of code: they start together, and the parent waits for all children to finish. [Nathaniel J. Smith](https://vorpus.org/blog/notes-on-structured-concurrency-or-go-statement-considered-harmful/)'s [Trio](https://trio.readthedocs.io/) library (2018) brought this to Python with **nurseries** — bounded regions where tasks live and die.

Dvala provides three structured concurrency primitives: `parallel`, `race`, and `settled`. All take an array of zero-argument functions as branches, making them composable — you can build branch arrays dynamically with `for`, `map`, `filter`, and `++`.

> **Why are the examples below marked `no-run`?** `parallel`, `race`, and `settled` launch branches concurrently — they always require `dvala.runAsync()` on the host side, even when branches are synchronous. The playground uses synchronous evaluation, so these expressions cannot run inline. To try them, integrate Dvala into a TypeScript project and call `runAsync()`.

The sequential equivalent of `parallel` (useful for understanding the shape) looks like this and runs in the playground:

```dvala
do
  with handler
    @my.val(arg) -> resume(arg * 2)
  end;
  let a = perform(@my.val, 10);
  let b = perform(@my.val, 20);
  [a, b];
end;
```

## parallel — Run All, Fail Fast

`parallel` takes an array of functions, runs them all concurrently, and returns an array of results in order. If any branch errors, the entire expression throws:

```dvala no-run
// Each branch function runs concurrently
parallel([
  -> perform(@fetch.user, "alice"),
  -> perform(@fetch.user, "bob"),
  -> perform(@fetch.user, "carol")
])
// => [alice-data, bob-data, carol-data]
```

Key properties:

* **All branches run** — every function is called
* **Order preserved** — results come back in declaration order, regardless of completion order
* **Fail fast** — if any branch errors, the parallel throws immediately
* **Structured** — the expression does not return until all branches complete

## race — First Wins, Rest Cancelled

`race` takes an array of functions, runs them concurrently, and returns the **first** one to complete. Losing branches are cancelled via `AbortSignal`:

```dvala no-run
// First response wins — others are cancelled
race([
  -> perform(@api.primary, query),
  -> perform(@api.fallback, query)
])
```

Key properties:

* **First completion wins** — the fastest branch determines the result
* **Losers cancelled** — remaining branches receive an abort signal
* **Error tolerance** — branches that error are silently dropped; if all branches error, an aggregate error is thrown

## settled — Run All, Collect Outcomes

`settled` takes an array of functions, runs them all concurrently, and returns tagged results for every branch — never throws on branch errors:

```dvala no-run
// All branches run; errors are captured, not thrown
settled([
  -> perform(@fetch.user, "alice"),
  -> raise("not found"),
  -> perform(@fetch.user, "carol")
])
// => [[:ok, alice-data], [:error, {type: "UserError", message: "not found"}], [:ok, carol-data]]
```

Key properties:

* **Never throws** — all errors are wrapped as `[:error, errorPayload]`
* **Success tagged** — successful results are wrapped as `[:ok, value]`
* **All branches run** — like `parallel`, waits for every branch
* **Essential for error observation** — the primary way to observe branch errors without crashing. By default, outer handlers cannot catch errors from inside branches (the barrier blocks effect propagation). See [Handler Propagation](#handler-propagation) for how to change this

## Composable Branches

Branches are plain arrays of functions — you can build them dynamically:

```dvala no-run
// Build branches with for
let tasks = for(url in urls) -> (-> perform(@host.fetch, url));
parallel(tasks)

// Combine from different sources
let critical = [-> perform(@host.fetch, url1), -> perform(@host.fetch, url2)];
let optional = [-> perform(@host.fetch, url3)];
settled(critical ++ optional)

// Slice
parallel(take(tasks, 5))
```

## Effects and Concurrency

`parallel`, `race`, and `settled` are most useful with effects, since effects can be asynchronous. A synchronous expression completes immediately, so concurrency only matters when branches perform I/O or other async operations:

```dvala no-run
// Fetch user data and preferences concurrently
let [user, prefs] = parallel([
  -> perform(@db.getUser, id),
  -> perform(@db.getPrefs, id)
])
```

## Suspension and Snapshots

When a branch suspends (via the effect system), the entire concurrent expression suspends. The snapshot captures the state of every branch — completed branches store their values, suspended branches store their continuations. On resume, completed branches use their cached values and suspended branches pick up where they left off. This makes `parallel`, `race`, and `settled` fully compatible with Dvala's serializable continuations and the "run anywhere, resume everywhere" model.

## Practical Patterns

### Fan-Out / Fan-In

Process multiple items concurrently, then combine:

```dvala no-run
let results = parallel(for(item in items) -> (-> perform(@process.item, item)));
reduce(results, +, 0)
```

### Timeout

Race a computation against a timer:

```dvala no-run
race([
  -> perform(@compute.heavy, data),
  -> do perform(@dvala.sleep, 5000); "timeout" end
])
```

### Primary / Fallback

Try the preferred source first, fall back on failure:

```dvala no-run
race([
  -> perform(@cache.get, key),
  -> perform(@db.get, key)
])
```

### Retry Failed Branches

Use `settled` to collect outcomes, then retry failures:

```dvala no-run
let results = settled(tasks);
let failed = for(i in range(count(results)) when first(results[i]) == :error) -> tasks[i];
let retryResults = settled(failed)
```

### Partial Success with Fallback

Use pattern matching on settled results:

```dvala no-run
settled(tasks) |> map((r) -> match r
  case [ :ok, v] then v
  case [ :error, _] then defaultValue
end)
```

## Error Handling

**In `parallel`:** if any branch throws an unhandled error, the entire expression throws. Other branches are cancelled.

**In `race`:** branches that throw are silently dropped — only successful completions count. If *all* branches throw, `race` throws an aggregate error.

**In `settled`:** errors are never thrown. Each branch result is tagged as `[:ok, value]` or `[:error, errorPayload]`. The error payload is the same structured object you'd see in a `@dvala.error` handler: `{ type, message, data? }`.

To handle errors per-branch inside `parallel` or `race`, you can either wrap each branch in a `do...with handler` block, or use `with propagate` to propagate a handler into all branches automatically. See [Handler Propagation](#handler-propagation) below.

## Handler Propagation

By default, handlers installed outside a `parallel`, `race`, or `settled` block do **not** reach inside branches. Effects from branches hit the barrier and are dispatched to host handlers instead. This is safe and correct — it prevents race conditions on stateful handlers.

But sometimes you want a "safety net" handler that applies to all branches. Use `with propagate` to opt in:

```dvala no-run
// Without propagate: error leaks to host — parallel fails
do with handler @dvala.error(e) -> resume(null) end;
  parallel([-> 1 + "a", -> 42]);
end
// => error

// With propagate: error caught inside branch — parallel succeeds
do with propagate handler @dvala.error(e) -> resume(null) end;
  parallel([-> 1 + "a", -> 42]);
end
// => [null, 42]
```

`with propagate` copies the handler into each branch at fork time. It is semantically equivalent to wrapping every branch manually:

```dvala no-run
// These are equivalent:
do with propagate h;
  parallel([-> a(), -> b()])
end

let safe = handler @dvala.error(e) -> resume(null) end;
parallel([-> do with safe; a() end, -> do with safe; b() end])
```

### Abort Semantics Are Branch-Scoped

When a propagated handler does not call `resume` (abort), the abort value replaces the **branch** result only — not the entire `parallel` expression:

```dvala no-run
do with propagate handler @dvala.error(e) -> "failed" end;
  parallel([-> 1 + "a", -> 42]);
end
// => ["failed", 42]   — abort replaces branch, other branches unaffected
```

This differs from non-parallel code where abort replaces the entire `do with` block. Think of `with propagate` as "each branch gets its own copy of this handler" — the handler's scope is the branch.

### Custom Effects

`propagate` works with any effect, not just errors:

```dvala no-run
do with propagate handler @config(key) -> resume("default") end;
  parallel([
    -> perform(@config, "timeout"),
    -> perform(@config, "retries"),
  ]);
end
// => ["default", "default"]
```

### Shallow Handlers and Independent State

Shallow state handlers propagate correctly. Each branch gets its own copy that evolves independently:

```dvala no-run
let state = (s) -> shallow handler
  @get() -> do with state(s); resume(s) end
  @set(v) -> do with state(v); resume(null) end
end;

do with propagate state(0);
  parallel([
    -> do perform(@set, 1); perform(@get) end,
    -> do perform(@set, 2); perform(@get) end,
  ]);
end
// => [1, 2]   — each branch has independent state
```

### Interaction with settled

Without `propagate`, `settled` collects branch errors as `[:error, payload]` — this is its primary purpose. With `propagate`, a propagated error handler catches errors before `settled` sees them:

```dvala no-run
// Without propagate: settled sees the error
do with handler @dvala.error(e) -> resume(null) end;
  settled([-> 1 + "a"]);
end
// => [[:error, {...}]]

// With propagate: handler catches error first — settled sees success
do with propagate handler @dvala.error(e) -> resume(null) end;
  settled([-> 1 + "a"]);
end
// => [[:ok, null]]
```

This is intentional — you explicitly chose both `propagate` and `settled`. If you want `settled` to collect errors, don't use `propagate` on the error handler.

### Nested Parallel

Propagation is transitive. A handler propagated into an outer branch is available for harvesting by an inner `parallel`:

```dvala no-run
do with propagate handler @dvala.error(e) -> resume("caught") end;
  parallel([
    -> parallel([-> 1 + "a"])
  ]);
end
// => [["caught"]]
```

### Transform Clauses

Transform clauses are **not** propagated into branches. The transform applies once at the original handler scope (outside the parallel), not per-branch:

```dvala no-run
do with propagate handler
  @dvala.error(e) -> resume(null)
  transform result -> result ++ [99]
end;
  parallel([-> 21]);
end
// => [21, 99]   — transform applied once to [21], not inside the branch
```

## Branch Safety

Branches are **independent** — they cannot access shared state or communicate with each other. The barrier prevents effects from crossing branch boundaries by default, which eliminates race conditions on stateful algebraic handlers. Propagated handlers are copied into each branch — they don't share state across branches.

## Requirements

* `parallel`, `race`, and `settled` require **async mode** (`dvala.runAsync()`)
* All require an array with at least one function
* Each element must be a function (zero-argument)

## Comparison

| Feature | `parallel` | `race` | `settled` |
|---------|-----------|--------|-----------|
| Branches evaluated | All | Until first completes | All |
| Result | Array of values | Single winner | Array of `[:ok, v]` / `[:error, e]` |
| Cancellation | None | Losers cancelled | None |
| Error handling | Fail fast (throws) | Errors ignored unless all fail | All captured as `[:error, ...]` |
| Suspension | Suspends, resumes all branches | Suspends, first to complete wins | Suspends, resumes all branches |

## Design: How Concurrency, Handlers, and Serialization Compose

Dvala's concurrency model is not a separate subsystem bolted onto the effect system — it is a natural consequence of three design decisions that reinforce each other.

### Effects as the only way out

Every branch interaction with the outside world goes through `perform`. There are no raw I/O calls, no shared mutable state, no hidden channels. This means the runtime has **complete visibility** over every point where a branch blocks, communicates, or fails. The barrier frame can enforce isolation precisely because all side effects are mediated by the handler stack — there is nothing to "leak" around it.

This is the same principle behind [Plotkin and Pretnar's algebraic effect handlers](https://homepages.inf.ed.ac.uk/gdp/publications/Effect_Handlers.pdf) (2009): effects are algebraic operations, and handlers give them meaning. The barrier simply defines a scope boundary for that meaning — handlers above the barrier provide one interpretation, handlers below provide another.

### Immutability enables safe forking

When `parallel` forks N branches, each branch receives a copy of the outer continuation stack. This is cheap because Dvala's continuation frames are **immutable persistent data structures** (PersistentList, PersistentVector, PersistentMap). "Copying" a continuation is O(1) — it's just a pointer to the same immutable structure. Each branch can evolve its continuation independently without invalidating the others.

This is why `propagate` works correctly with multi-shot handlers and shallow state threading: the propagated handler frame is an immutable value shared by reference. When `resume` freshens the continuation environments (via `freshenContinuationEnvs`), each branch gets its own mutable binding layer on top of the shared immutable structure. No locking, no coordination, no races.

### Serializable continuations compose with concurrency

When a branch suspends, its continuation (everything from the perform site to the barrier) is captured as a JSON-serializable snapshot. The parallel orchestrator collects the state of all branches — completed branches store their values, suspended branches store their continuations — into a composite snapshot. On resume, the orchestrator reconstructs the parallel: completed branches use cached values, suspended branches are deserialized and resumed.

This works because every value in a Dvala continuation is JSON-compatible by construction. There are no opaque host references, no native stack frames, no closures over mutable state. A continuation frame that was created by handler propagation (an `AlgebraicHandleFrame` above the barrier) serializes identically to any other handler frame — it is a standard frame with standard fields.

The combination of these three properties — effect-mediated I/O, immutable continuations, and JSON-serializable state — means that a Dvala program can suspend inside a parallel branch, be serialized to a database, shipped across the network, and resumed in a different process, with all handler propagation intact. The host needs no special logic for this — the snapshot format is the same regardless of whether propagation was used.

### The barrier as a scoping mechanism

The barrier frame is often described as "blocking" effects, but a more accurate framing is that it **scopes** handler visibility. Without `propagate`, a handler's scope ends at the barrier — effects inside the branch are dispatched to host handlers as if the outer handler did not exist. With `propagate`, the handler's scope extends into the branch — effects inside the branch see the propagated handler first.

This is analogous to lexical scoping in lambda calculus: a `let` binding is visible in its body but not outside it. The barrier is a scope boundary for the effect dimension, just as `end` is a scope boundary for the value dimension. `propagate` is the mechanism for explicitly widening that scope, similar to how closures capture bindings from enclosing scopes.

## Summary

`parallel`, `race`, and `settled` bring structured concurrency to Dvala: concurrent work is lexically scoped, results are predictable, cancellation is automatic, and errors are controllable. Combined with the effect system, handler propagation, and composable branch arrays, they let programs express concurrent I/O patterns without callbacks, promises, or colored functions.
