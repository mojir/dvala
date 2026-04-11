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
* **Essential for error handling** — this is the only Dvala-level way to observe branch errors without crashing, because outer `@dvala.error` handlers cannot catch errors from inside parallel branches (the BarrierFrame blocks effect propagation)

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

To handle errors per-branch inside `parallel` or `race`, wrap each branch in a `do...with handler` block.

## Branch Safety

Branches are **independent** — they cannot access shared state or communicate with each other. The BarrierFrame prevents effects from crossing branch boundaries, which eliminates race conditions on stateful algebraic handlers. See the concurrency safety model in the design docs for the full analysis.

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

## Summary

`parallel`, `race`, and `settled` bring structured concurrency to Dvala: concurrent work is lexically scoped, results are predictable, cancellation is automatic, and errors are controllable. Combined with the effect system and composable branch arrays, they let programs express concurrent I/O patterns without callbacks, promises, or colored functions.
