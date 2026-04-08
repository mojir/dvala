# Immutability & Referential Transparency

## Background: Values, Not Variables

[W.V.O. Quine (1960)](https://en.wikipedia.org/wiki/Word_and_Object) distinguished between **referentially transparent** expressions — those that can be replaced by their value without changing the program's meaning — and **referentially opaque** ones. [Christopher Strachey (1967)](https://www.cs.cmu.edu/~crary/819-f09/Strachey67.pdf) applied this to programming: a language is referentially transparent when equals can be substituted for equals.

Dvala is built on immutability. There is no assignment operator, no mutation, and no mutable state. Every binding is a **value**, not a variable.

## No Mutation

In Dvala, once a name is bound to a value, it cannot be changed. There is no `=` reassignment and no mutation operators:

```dvala
let x = 42;
let y = x + 1;
[x, y];
```

`x` is 42 forever in this scope. `y` is 43. Neither can be modified.

## Shadowing Is Not Mutation

You can use `let` to create a **new** binding with the same name in a nested scope. This shadows the old binding — it does not modify it:

```dvala
let x = 10;
do
  let x = x + 5;
  x;
end;
```

The inner `x` is 15, but the outer `x` remains 10. Shadowing creates a new binding — it does not modify the original. Functions that captured the original `x` still see 10:

### Closures See Their Own Captured Value, Not the Shadow

```dvala
let x = 10;
let getX = () -> x;
do
  let x = 99;
  getX();
end;
```

`getX` was defined when `x` was 10. Shadowing `x` to 99 in the inner scope does not affect `getX` — it still returns 10. This predictability is a direct consequence of immutability combined with lexical scoping.

## Immutable Data Structures

Arrays and objects are immutable. Operations that seem to "modify" them actually return new values:

```dvala
let original = [1, 2, 3];
let extended = push(original, 4);
[original, extended];
```

The original array is unchanged. `push` returns a new array.

```dvala
let person = { name: "Alice", age: 30 };
let older = assoc(person, "age", 31);
[person, older];
```

`assoc` returns a new object. The original `person` is unmodified.

## Referential Transparency

Because values never change, any expression can be replaced by its result without affecting the program:

```dvala
// These are identical — f(3) can be computed once and reused
let f = (x) -> x * x + 1;
let a = f(3);
let b = f(3);
a == b;
```

This property — **referential transparency** — means you can reason about code by substitution, just like algebra.

## Transform, Don't Mutate

Dvala programs transform data through **pipelines** of pure functions. Each step takes input and produces new output:

```dvala
reverse(
  map(_, -> $ * $)(
    filter(_, isEven)(
      [
        1,
        2,
        3,
        4,
        5,
        6,
        7,
        8,
      ],
    ),
  ),
);
```

No data was mutated. Each operation produced a fresh value.

## Building Up Results

Where imperative code would use a mutable accumulator, Dvala uses `reduce` or `loop/recur`:

```dvala
// Sum of squares using reduce
reduce(
  [
    1,
    2,
    3,
    4,
    5,
  ],
  (acc, x) -> acc + x * x,
  0,
);
```

```dvala
// Factorial using loop/recur
loop (n = 6, acc = 1) -> if n <= 1 then acc else recur(n - 1, acc * n) end;
```

Each iteration creates new bindings rather than modifying existing ones.

## Immutable Objects

Object operations always return new objects:

```dvala
let config = { host: "localhost", port: 8080 };
let updated = assoc(_, "debug", true)(assoc(_, "port", 3000)(config));
[config, updated];
```

## Immutability Makes Serialization Possible

Dvala's killer feature — snapshotting and resuming a running program — works because there is no mutable state to capture. A suspended program's entire world is a tree of values. That tree can be serialized to JSON, stored in a database, and loaded into a completely different process. If values could mutate, a snapshot would be meaningless: by the time you resume, the captured state would be stale.

See the [Suspension & Serializable Continuations](../05-advanced/04-suspension.md) chapter for the full story.

## Why Immutability Matters

* **Serializable continuations** — programs can be snapshotted and resumed because state never changes out from under them
* **Pure functions** — without mutation, functions are guaranteed pure (same inputs → same outputs)
* **Safe concurrency** — `parallel` branches can't interfere with each other because there's nothing to mutate (see [Concurrency](../05-advanced/05-concurrency.md))
* **Predictable debugging** — a value is the same everywhere it appears
* **Equational reasoning** — you can understand code by substituting values, like simplifying a math expression

## The Immutability Guarantee

Unlike languages where immutability is a convention (e.g., "please don't mutate this"), Dvala enforces it at the language level:

* No assignment operator — `let` always creates a new binding
* No mutable data structures — arrays and objects are values
* No reference types — there are no pointers or refs
* No `set!` or `swap!` — mutation simply doesn't exist in the language

This is not a restriction but a feature: it makes programs simpler, more predictable, and more composable.

## Summary

Dvala's immutability guarantee — rooted in referential transparency — means values never change, bindings are permanent, and data structures are always fresh copies. This eliminates an entire class of bugs (aliasing, race conditions, unexpected mutation) and enables powerful features like serializable continuations and safe concurrency. Programs are built by transforming values through pipelines, not by mutating state in place.
