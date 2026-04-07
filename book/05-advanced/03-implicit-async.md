# Color-Free Concurrency

## The Problem: Function Coloring

In most languages, async functions are **colored** — once a function returns a promise, every caller must also become async. Bob Nystrom's ["What Color is Your Function?"](https://journal.stuffwithstuff.com/2015/02/01/what-color-is-your-function/) (2015) describes this viral infection: a single async call deep in the stack forces `async`/`await` annotations all the way up.

This split creates two incompatible worlds: sync code and async code. Libraries must often ship both versions, and refactoring between them is painful.

## Dvala's Solution: Transparent Async

Dvala programs **never** write `await`. There is no async keyword, no promise type, no special syntax for asynchronous operations. The same code runs synchronously or asynchronously depending entirely on how the host binds its effects.

Consider a simple function:

```dvala
let double = (x) -> x * 2;
double(21);
```

This function works identically whether `x` comes from a sync computation or an async one. The programmer never needs to know or care.

## How It Works: The Trampoline

Under the hood, Dvala uses a **trampoline** — the evaluator returns thunks (continuations) instead of recursing. When a host-provided function returns a JavaScript `Promise`, the trampoline detects this and awaits it automatically, then continues evaluation. The Dvala code itself is unaware anything asynchronous happened.

This is related to [Moggi](https://en.wikipedia.org/wiki/Eugenio_Moggi)'s [monadic I/O model (1991)](https://person.dibris.unige.it/moggi-eugenio/ftp/ic91.pdf) — effects are decoupled from computation. But unlike Haskell's explicit `IO` monad, Dvala hides the mechanism entirely. The trampoline acts as an invisible monad runner.

## Sync vs Async Host API

```typescript
// Synchronous — dvala.run() returns a value directly
const result = dvala.run('1 + 2')

// Asynchronous — dvala.runAsync() returns a Promise
const result = await dvala.runAsync('fetchData()')
```

The Dvala code inside (`1 + 2` or `fetchData()`) is written the same way. The choice between sync and async is made by the **host**, not by the program.

## Effects: Async Without Coloring

Dvala's effect system is the key integration point. When a program performs an effect, the host handler decides whether to resolve it synchronously or asynchronously:

```dvala
let x = perform(@dvala.random);
x * 100;
```

In the playground, `dvala.random` resolves instantly. In a different host, the same effect could hit a network service — the Dvala program wouldn't change at all.

## Higher-Order Functions Just Work

In colored languages, `map` over an async function requires a special `Promise.all(arr.map(...))` pattern. In Dvala, higher-order functions work transparently with async operations:

```dvala
map([1, 2, 3, 4], inc);
```

Whether `inc` is sync or async under the hood, `map` handles it without any special treatment. The trampoline resolves each step before continuing.

## Practical Implications

* **No refactoring burden** — switching a function from sync to async requires zero changes in callers
* **Composability** — `comp`, `|>`, `map`, `filter`, `reduce` all work identically regardless of async status
* **Simpler mental model** — programmers think in terms of values, not promises
* **No colored APIs** — library authors write one version that works everywhere

## Summary

Dvala eliminates function coloring by handling async transparently at the runtime level. Programs are written as pure expressions; the trampoline handles the messy details of sync vs async execution. This design follows from the principle that **when** a computation happens should be separate from **what** it computes.
