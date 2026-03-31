# Functions

Functions are first-class values in Dvala. You can define them, pass them around, and compose them freely.

## Arrow Functions

Define functions with the arrow (`->`) syntax. For a single parameter, parentheses are optional:

```dvala
let double = x -> x * 2;
double(21)
```

## Multiple Parameters

Wrap multiple parameters in parentheses:

```dvala
let add = (a, b) -> a + b;
add(3, 4)
```

## No Parameters

Use empty parentheses for functions that take no arguments:

```dvala
let greet = () -> "Hello!";
greet()
```

## Default Parameters

Parameters can have default values:

```dvala
let greet = (name = "World") -> `Hello, ${name}`;
greet()
```

## Rest Parameters

Collect remaining arguments with the rest (`...`) syntax:

```dvala
let sumAll = (...nums) -> reduce(nums, +, 0);
sumAll(1, 2, 3, 4, 5)
```

## Short-hand Lambdas

For quick one-liners, use `->` with `$` (first argument) and `$2`, `$3`, ... for positional arguments:

```dvala
map([1, 2, 3], -> $ * $)
```

```dvala
map([1, 2, 3, 4], -> $ + 10)
```

## Recursion with self

Every function can call itself via `self` — without needing to know its own name. This is Dvala's built-in support for anonymous recursion:

```dvala
let factorial = n ->
  if n <= 1 then
    1
  else
    n * self(n - 1)
  end;
factorial(6)
```

`self` always refers to the immediately enclosing function. It works equally well in anonymous lambdas:

```dvala
let fib = n ->
  if n <= 1 then n
  else self(n - 1) + self(n - 2)
  end;
fib(8)
```

> **Note:** `self` recursion is not stack-safe for large inputs. For iteration over large data, use `loop`/`recur`. See the [Tail Call Optimization](../04-design-principles/05-tail-call-optimization.md) chapter.

## Arity

Dvala is strict about the number of arguments. Calling a function with **too few** arguments throws an error at runtime:

```dvala throws
let add = (a, b) -> a + b;
add(1)  // Error: Expected 2 arguments, got 1
```

Calling with **too many** arguments silently ignores the extras:

```dvala
let add = (a, b) -> a + b;
add(1, 2, 99)  // => 3, extra argument ignored
```

Use rest parameters (`...args`) if you need to accept a variable number of arguments.

## Composition

`comp` composes functions **right-to-left** — the rightmost function runs first:

```dvala
(comp str inc)(41)
```

`inc` runs first (41 → 42), then `str` converts to string. For **left-to-right** composition, use the pipe operator `|>` instead — it reads in the same order as the transformations happen:

```dvala
41 |> inc |> str
```

## Higher-order Functions

Functions can be passed as arguments. This is the heart of functional programming:

```dvala
let double = x -> x * 2;
map([1, 2, 3, 4], double)
```

## Apply

Call a function with an array of arguments using `apply`:

```dvala
apply(+, [1, 2, 3, 4, 5])
```
