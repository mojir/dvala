# Loops & Recursion

Dvala provides `for` comprehensions for building arrays and `loop`/`recur` for tail-recursive iteration.

## For Comprehensions

`for` iterates over a collection and returns a new array:

```dvala
for (x in [1, 2, 3, 4]) -> x * 2;
```

## Filtering with when

Use `when` to skip elements that don't match a condition:

```dvala
for (x in range(10) when isOdd(x)) -> x * x;
```

## Early Exit with while

`while` stops the iteration entirely when the condition becomes false:

```dvala
for (x in range(100) while x < 5) -> x * 10;
```

## Local Bindings with let

Bind intermediate values inside the comprehension:

```dvala
for (x in [1, 2, 3] let sq = x * x) -> sq + 1;
```

## Multiple Iterators

Multiple bindings produce a cartesian product:

```dvala
for (i in [1, 2], j in [10, 20]) -> i + j;
```

## Complex Comprehension

Combine `let`, `when`, and `while` for powerful queries:

```dvala
for (i in range(10) let sq = i ^ 2 when sq % 3 == 0 while sq < 50) -> sq;
```

## Loop / Recur

`loop` sets up initial bindings, and `recur` jumps back to the top with new values. This is tail-recursive and efficient:

```dvala
loop (n = 5, acc = 1) -> if n <= 1 then acc else recur(n - 1, acc * n) end;
```

## Self Recursion

Inside a lambda, `self` refers to the enclosing function:

```dvala
let fib = (n) -> if n <= 1 then n else self(n - 1) + self(n - 2) end;
fib(10);
```

> **Warning:** This Fibonacci implementation is `O(2^n)` — it recomputes the same subproblems exponentially. It works for small inputs but becomes unusably slow past around `fib(30)`. For large inputs, use `loop`/`recur` with two accumulators instead. See the [Tail Call Optimization](../04-design-principles/05-tail-call-optimization.md) chapter.

## While-Style Loops

Dvala has no standalone `while` keyword. To loop while a condition holds, use `loop`/`recur`:

```dvala
// Keep halving until value drops below 1
loop (x = 100) -> if x < 1 then x else recur(x / 2) end;
```

The `while` keyword that appears in `for` comprehensions is for **early exit from a `for`**, not a general loop construct.

## For with Side Effects

`for` can also be used for side effects (the result array can be ignored):

```dvala
for (x in [1, 2, 3]) -> perform(@dvala.io.print, x);
```
