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
let greet = (name = "World") -> "Hello, " ++ name;
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

A lambda can call itself using `self`:

```dvala
let factorial = n ->
  if n <= 1 then
    1
  else
    n * self(n - 1)
  end;
factorial(6)
```

## Composition

`comp` composes functions right-to-left — the rightmost runs first:

```dvala
(comp str inc)(41)
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
