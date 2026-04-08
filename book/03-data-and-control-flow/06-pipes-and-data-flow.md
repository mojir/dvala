# Pipes & Data Flow

Dvala has powerful features for building readable data transformation pipelines: the pipe operator, data-as-functions, and operator-style calling.

## The Pipe Operator

Use `|>` to pass a value through a chain of transformations. Use `_` to mark where the piped value goes. The `_` placeholder is the same mechanism as partial application in operators — see the [Operators](../02-core-language/02-operators.md) chapter for how it works outside of pipes.

```dvala
reduce(_, +, 0)(map(_, -> $ * $)(filter(_, isOdd)([1, 2, 3, 4, 5, 6])));
```

## Pipe Without Placeholder

When piping to a single-argument function, no placeholder is needed:

```dvala
join(_, "-")(reverse(split(_, " ")(upperCase("hello world"))));
```

## Operator Style

Any two-argument function can be used as an infix operator. The left value becomes the first argument:

```dvala
filter([1, 2, 3, 4], isOdd);
```

```dvala
map([1, 2, 3], inc);
```

## Chaining Operators

Chain multiple operator-style calls for a fluent reading:

```dvala
map(filter([1, 2, 3, 4, 5, 6], isEven), -> $ * $);
```

## Arrays as Functions

An array can be called as a function with an index to get that element:

```dvala
let arr = [10, 20, 30];
arr(1);
```

## Numbers as Functions

A number can be called with a collection to access that index:

```dvala
let words = ["alpha", "beta", "gamma"];
1(words);
```

## Strings as Functions

A string can be called with an object to access that property. This is powerful with `map`:

```dvala
let people = [{ name: "Alice" }, { name: "Bob" }];
map(people, "name");
```

## Objects as Functions

An object can be called with a key to get the value:

```dvala
let config = { host: "localhost", port: 8080 };
config("port");
```

## Putting it Together

Combine pipes, data-as-functions, and operators for expressive data processing:

```dvala
let data = [
  { name: "Alice", score: 95 },
  { name: "Bob", score: 60 },
  { name: "Carol", score: 82 },
];
map(_, "name")(filter(_, -> $.score >= 80)(data));
```
