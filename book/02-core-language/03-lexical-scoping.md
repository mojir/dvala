# Lexical Scoping & Closures

## Background: The Lambda Papers

Lexical scoping was formalized by [Steele](https://en.wikipedia.org/wiki/Guy_L._Steele_Jr.) and [Sussman](https://en.wikipedia.org/wiki/Gerald_Jay_Sussman) in the **[Lambda Papers](https://en.wikipedia.org/wiki/History_of_the_Scheme_programming_language)** (1975–1980), which introduced [Scheme](https://en.wikipedia.org/wiki/Scheme_%28programming_language%29). The key insight: a variable's meaning is determined by **where it appears in the source code**, not by when or how the function is called. This replaced dynamic scoping, where variable lookup followed the call stack — a source of subtle bugs.

Dvala is lexically scoped throughout. Every variable reference resolves to the nearest enclosing binding in the source text.

## Let Bindings

`let` introduces a new binding in the current scope. Bindings are visible from their declaration onward:

```dvala
let x = 10;
let y = 20;
x + y
```

## Nested Scopes

`do...end` blocks create new scopes. Inner scopes can access outer bindings:

```dvala
let outer = 5;
do
  let inner = 10;
  outer + inner
end
```

But outer scopes cannot see inner bindings — they are confined to their block:

```dvala
let result = do
  let secret = 42;
  secret
end;
result
```

## Closures

A **closure** is a function that captures variables from its enclosing scope. The captured bindings travel with the function, even after the enclosing scope has returned:

```dvala
let makeAdder = (n) -> do
  let add = (x) -> n + x;
  add
end;
let addTen = makeAdder(10);
addTen(5)
```

Here `add` captures `n` from `makeAdder`'s scope. When `addTen` is called later, it still has access to `n = 10`.

## Variable Shadowing

An inner binding can **shadow** an outer one with the same name. The outer binding is unaffected:

```dvala
let x = 5;
let result = do
  let x = 99;
  x
end;
[result, x]
```

The inner `x` is 99, but the outer `x` remains 5. Shadowing creates a new binding — it does not modify the original.

## Closures Capture the Lexical Environment

A function always refers to the environment where it was **defined**, not where it is **called**:

```dvala
let x = 10;
let addX = y -> x + y;
let result = do
  let x = 20;
  addX(5)
end;
result
```

Even though `x` is shadowed to 20 in the `do` block, `addX` uses its own captured `x = 10`. The result is 15, not 25.

## Function Parameters Shadow

Parameters create local bindings that shadow any outer variables of the same name:

```dvala
let x = 100;
let f = (x) -> x * 2;
f(7)
```

The parameter `x` shadows the outer `x = 100`. The function returns 14.

## Separate Closure Instances

Each call to a closure-creating function produces an independent closure with its own captured state:

```dvala
let makeCounter = () -> do
  let n = 0;
  let step = () -> do
    let n = n + 1;
    n
  end;
  step
end;
let c1 = makeCounter();
let c2 = makeCounter();
[c1(), c1(), c2()]
```

`c1` and `c2` are independent. Note: because Dvala has no mutation, each call to `c1()` starts from `n = 0` and returns 1. If you need a counter that increments across calls, the idiomatic approach is to maintain state in an effect handler — see the [Effects & Handlers](../05-advanced/02-effects.md) chapter for the shallow handler state pattern.

## Closures in Higher-Order Functions

Closures work naturally with `map`, `filter`, and other higher-order functions:

```dvala
let multiplier = 3;
map([1, 2, 3, 4], x -> x * multiplier)
```

The lambda captures `multiplier` from the enclosing scope.

## Nested Closures

Closures can nest — each level captures from the level above:

```dvala
let a = 1;
let f = (b) -> (c) -> a + b + c;
f(10)(100)
```

The innermost function captures both `a` (from the top level) and `b` (from the first function).

## Why Lexical Scoping Matters

* **Predictability** — you can determine what a variable refers to by reading the source code
* **Encapsulation** — closures provide private state without mutation
* **Composability** — functions can be freely passed around without worrying about name collisions
* **Serialization** — Dvala's serializable continuations work because lexical environments have a well-defined structure

## Summary

Lexical scoping means variables resolve where they are written, not where they are called. Closures capture their lexical environment and carry it with them. Combined with Dvala's immutability, this gives programs a clear, predictable structure rooted in Scheme's original insight: code structure determines meaning.
