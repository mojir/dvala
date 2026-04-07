# Tail Call Optimization via loop/recur

Dvala provides three iteration strategies. Pick the right one for your problem:

| Strategy | When to use | Stack safe? |
|---|---|---|
| `for` | Transforming or filtering a collection | Yes |
| `loop` / `recur` | Accumulator patterns, unbounded iteration | Yes — constant stack |
| `self` | Tree traversal, bounded-depth recursion | No — use only for shallow depths |

The rest of this chapter explains why this matters and how `loop`/`recur` works.

## The Problem: Stack Overflow

Recursive functions are elegant but dangerous. Each recursive call adds a frame to the call stack. For large inputs, this means stack overflow:

```dvala
// Beautiful but dangerous for large n
let factorial = (n) -> if n <= 1 then 1 else n * self(n - 1) end;
factorial(10);
```

This works for small inputs. But `factorial(100000)` would require 100,000 stack frames — a crash in most languages.

## Background: Tail Call Elimination

The [Scheme](https://en.wikipedia.org/wiki/Scheme_%28programming_language%29) language (Steele & Sussman, 1975) mandated **[proper tail calls](https://en.wikipedia.org/wiki/Tail_call)**: if a function's last action is calling another function, the caller's stack frame can be reused. [R5RS](https://en.wikipedia.org/wiki/Scheme_%28programming_language%29) (Clinger, 1998) formalized this guarantee.

But implicit tail call optimization (TCO) has a drawback: it's invisible. Programmers may accidentally break tail position without realizing it, silently losing the optimization.

## Dvala's Approach: Explicit loop/recur

Following [Clojure](https://en.wikipedia.org/wiki/Clojure)'s design ([Hickey](https://en.wikipedia.org/wiki/Rich_Hickey), 2007), Dvala uses **explicit** tail recursion via `loop` and `recur`. The contract is clear: `recur` always runs in constant stack space, and misuse is a compile-time error, not a silent performance bug.

```dvala
// Tail-recursive factorial — constant stack space
loop (n = 10, acc = 1) -> if n <= 1 then acc else recur(n - 1, acc * n) end;
```

## How loop/recur Works

`loop` takes initial bindings and a body. `recur` jumps back to the `loop` head with new values for each binding:

1. `loop` creates bindings (`n = 10, acc = 1`)
2. The body evaluates
3. If `recur` is reached, new values replace the bindings and the body runs again
4. If `recur` is **not** reached, the body's value becomes the result

No stack frames accumulate — `recur` is a **jump**, not a function call.

## Converting Recursion to loop/recur

The key technique is to add an **accumulator** parameter that carries the running result.

### Sum of 1 to n

Naive recursion:

```dvala
let addUp = (n) -> if n <= 0 then 0 else n + self(n - 1) end;
addUp(100);
```

With loop/recur:

```dvala
loop (n = 100, acc = 0) -> if n <= 0 then acc else recur(n - 1, acc + n) end;
```

### Fibonacci

Naive recursion is exponential — `O(2^n)`:

```dvala
let fib = (n) -> if n <= 1 then n else self(n - 1) + self(n - 2) end;
fib(10);
```

With loop/recur it becomes linear — `O(n)`:

```dvala
loop (n = 10, a = 0, b = 1) -> if n <= 0 then a else recur(n - 1, b, a + b) end;
```

### Reverse a List

```dvala
loop (xs = [1, 2, 3, 4, 5], acc = []) ->
  if isEmpty(xs) then acc else recur(dropLast(xs, 1), push(acc, last(xs))) end;
```

## Self Recursion: When You Don't Need TCO

For naturally recursive problems with small depth, `self` provides simple recursion without the loop/recur ceremony:

```dvala
let depth = (node) ->
  if not(isObject(node)) then
    0
  else
    1 + max(self(get(node, "left", 0)), self(get(node, "right", 0)))
  end;
depth({ left: { left: 0, right: 0 }, right: 0 });
```

Use `self` when the recursion depth is naturally bounded — for example, a balanced binary tree rarely exceeds depth 30–40. Use `loop`/`recur` whenever the iteration count grows with input size (lists, ranges, counters) or is otherwise unbounded.

## For Comprehensions: Iteration Without Recursion

Many problems that seem recursive are actually iterations. Dvala's `for` comprehension handles these directly:

```dvala
// Sum of squares of odd numbers under 10
for (x in range(10) when isOdd(x)) -> x * x;
```

```dvala
// Cartesian product
for (i in [1, 2, 3], j in ["a", "b"]) -> `${i}${j}`;
```

## Summary

Dvala provides three levels of iteration:

* **`for`** — declarative iteration for most problems
* **`loop` / `recur`** — explicit tail recursion for accumulator patterns, guaranteed constant stack space
* **`self`** — simple recursion for tree-shaped problems with bounded depth

The `loop`/`recur` design follows Clojure's principle: make tail recursion **explicit** so programmers always know when they have it and when they don't.
