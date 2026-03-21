# Concurrency: parallel & race

## Background: Structured Concurrency

[Martin Sústrik](https://250bpm.com/blog:71/) introduced **[structured concurrency](https://en.wikipedia.org/wiki/Structured_concurrency)** (2016) — the idea that concurrent operations should be scoped like blocks of code: they start together, and the parent waits for all children to finish. [Nathaniel J. Smith](https://vorpus.org/blog/notes-on-structured-concurrency-or-go-statement-considered-harmful/)'s [Trio](https://trio.readthedocs.io/) library (2018) brought this to Python with **nurseries** — bounded regions where tasks live and die.

Dvala provides two structured concurrency primitives: `parallel` and `race`. Both are special expressions that scope concurrent work within a single expression.

Since `parallel` and `race` require async mode and external effect handlers, the examples in this tutorial are shown but not executed. The concepts can be understood through local effect handlers:

```dvala
handle
  let a = perform(@my.val, 10);
  let b = perform(@my.val, 20);
  a + b
with [(arg, eff, nxt) ->
  if eff == @my.val then arg * 2
  else nxt(eff, arg)
  end
]
end
```

## parallel — Run All, Collect All

`parallel` evaluates multiple expressions concurrently and returns an array of all results in order:

```dvala no-run
// Each branch runs concurrently
parallel(
  perform(@fetch.user, "alice"),
  perform(@fetch.user, "bob"),
  perform(@fetch.user, "carol")
)
// => [alice-data, bob-data, carol-data]
```

Key properties:

* **All branches run** — every expression is evaluated
* **Order preserved** — results come back in declaration order, regardless of completion order
* **Structured** — the `parallel` expression does not return until all branches complete

## race — First Wins, Rest Cancelled

`race` evaluates multiple expressions concurrently and returns the **first** one to complete. Losing branches are cancelled via `AbortSignal`:

```dvala no-run
// First response wins — others are cancelled
race(
  perform(@api.primary, query),
  perform(@api.fallback, query)
)
```

Key properties:

* **First completion wins** — the fastest branch determines the result
* **Losers cancelled** — remaining branches receive an abort signal
* **Error tolerance** — branches that error are silently dropped; if all branches error, an aggregate error is thrown

## Effects and Concurrency

`parallel` and `race` are most useful with effects, since effects can be asynchronous. A synchronous expression completes immediately, so concurrency only matters when branches perform I/O or other async operations:

```dvala no-run
// Fetch user data and preferences concurrently
let [user, prefs] = parallel(
  perform(@db.get-user, id),
  perform(@db.get-prefs, id)
)
```

## Suspension and parallel

When a `parallel` branch suspends (via the effect system's suspend mechanism), the entire `parallel` expression suspends with a **composite blob** — a combined state of all branches. On resume, each branch is resumed individually. This makes `parallel` compatible with Dvala's serializable continuations.

## Practical Patterns

### Fan-Out / Fan-In

Process multiple items concurrently, then combine:

```dvala no-run
// Process all items concurrently
let results = parallel(
  perform(@process.item, items(0)),
  perform(@process.item, items(1)),
  perform(@process.item, items(2))
);
reduce(results, +, 0)
```

### Timeout Pattern

Race a computation against a timer:

```dvala no-run
// Either get the result or time out
race(
  perform(@compute.heavy, data),
  do
    perform(@dvala.sleep, 5000);
    "timeout"
  end
)
```

### Primary / Fallback

Try the preferred source first, fall back on failure:

```dvala no-run
// Fastest successful response wins
race(
  perform(@cache.get, key),
  perform(@db.get, key)
)
```

## Requirements

* `parallel` and `race` require **async mode** (`dvala.runAsync()`)
* Both require at least one branch expression
* Both are **special expressions** — branches are not evaluated upfront but launched concurrently

## Comparison

| Feature | `parallel` | `race` |
|---------|-----------|--------|
| Branches evaluated | All | Until first completes |
| Result | Array of all results | Single winner |
| Cancellation | None | Losers cancelled |
| Error handling | Any error propagates | Errors ignored unless all fail |
| Suspension | Composite blob | Host provides winner |

## Summary

`parallel` and `race` bring structured concurrency to Dvala: concurrent work is lexically scoped, results are predictable, and cancellation is automatic. Combined with the effect system, they let programs express concurrent I/O patterns without callbacks, promises, or colored functions.
