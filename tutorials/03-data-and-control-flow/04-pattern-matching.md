# Pattern Matching

## Why Pattern Matching?

In functional programming, data flows through functions rather than being mutated in place. Pattern matching is the natural complement — it lets you **inspect the shape of data** and branch accordingly, all in a single expression. Instead of chains of `if`/`else` tests picking apart objects and arrays, you describe the structure you expect and let the language do the work.

Languages like Haskell, Erlang, Elixir, Rust, and OCaml have made pattern matching a core feature. Dvala brings the same idea: concise, readable, and exhaustive structural decomposition.

## Basic Matching

`match` evaluates a value against a series of `case` branches. The first matching branch wins:

```dvala
match "b"
  case "a" then "first"
  case "b" then "second"
  case "c" then "third"
end
```

All value types work as literal patterns — numbers, strings, booleans, and `null`:

```dvala
match true
  case true then "yes"
  case false then "no"
end
```

If no pattern matches, `match` returns `null`:

```dvala
match 42
  case 1 then "one"
  case 2 then "two"
end
```

## Wildcard

The wildcard `_` matches anything. Use it as a catch-all at the end:

```dvala
match 99
  case 1 then "one"
  case 2 then "two"
  case _ then "something else"
end
```

## Variable Binding

A name in a pattern binds the matched value to a variable, available in the body:

```dvala
match 42
  case x then x * 2
end
```

Variables can have default values. The default is used when the matched value is `null`:

```dvala
match null
  case x = 10 then x * 2
end
```

## Array Patterns

Match arrays by structure. Elements are matched positionally:

```dvala
match [10, 20]
  case [x, y] then x + y
end
```

Mix literals and variables — literals must match exactly:

```dvala
match [1, 2, 3]
  case [1, x, 3] then x
  case _ then "no match"
end
```

### Rest Patterns

Use `...name` to capture remaining elements:

```dvala
match [1, 2, 3, 4]
  case [x, ...xs] then xs
end
```

### Matching by Length

Different cases can match different array shapes:

```dvala
let describe = (lst) ->
  match lst
    case [] then "empty"
    case [x] then "one element"
    case [x, y] then "two elements"
    case [x, ...xs] then "many elements"
  end;

[describe([]), describe([1]), describe([1, 2]), describe([1, 2, 3])]
```

### Nested Arrays

Patterns nest arbitrarily:

```dvala
match [[1, 2], [3, 4]]
  case [[a, b], [c, d]] then a + b + c + d
end
```

## Object Patterns

Destructure objects by naming the keys you care about:

```dvala
match { name: "Alice", age: 30 }
  case { name, age } then name ++ " is " ++ str(age)
end
```

### Literal Constraints

Pin a key to a specific value:

```dvala
match { type: "click", x: 10, y: 20 }
  case { type: "click", x, y } then "Click at " ++ str(x) ++ ", " ++ str(y)
  case { type: "keydown", key } then "Key: " ++ key
  case _ then "unknown event"
end
```

### Default Values

Provide a fallback when a key is missing or `null`:

```dvala
match {}
  case { name = "Anonymous" } then name
end
```

### Renaming with `as`

Bind a key's value to a different name:

```dvala
match { name: "Alice" }
  case { name as n } then n ++ "!"
end
```

### Rest in Objects

Capture remaining keys with `...`:

```dvala
match { a: 1, b: 2, c: 3 }
  case { a, ...r } then r
end
```

### Nested Objects

Match deeply nested structures:

```dvala
match { user: { name: "Alice", profile: { email: "alice@example.com" } } }
  case { user: { name, profile: { email } } } then name ++ ": " ++ email
end
```

## Guards

Add a `when` clause to refine a match with an arbitrary condition. Bound variables are available in the guard:

```dvala
match 5
  case x when x > 10 then "big"
  case x when x > 0 then "small positive"
  case x then "non-positive"
end
```

Guards work with destructured patterns too:

```dvala
match { role: "admin", name: "Alice" }
  case { role: "admin", name } when name == "Bob" then "Admin Bob"
  case { role: "admin", name } then "Admin: " ++ name
  case _ then "unknown"
end
```

## Practical Examples

### Recursive List Sum

```dvala
let sum-list = (lst) ->
  match lst
    case [] then 0
    case [x, ...xs] then x + sum-list(xs)
  end;

sum-list([1, 2, 3, 4, 5])
```

### Coordinate Classification

```dvala
let describe-point = (point) ->
  match point
    case [0, 0] then "origin"
    case [0, y] then "y-axis"
    case [x, 0] then "x-axis"
    case [x, y] then "point at " ++ str(x) ++ ", " ++ str(y)
  end;

[describe-point([0, 0]), describe-point([0, 5]), describe-point([3, 0]), describe-point([3, 4])]
```

### HTTP Response Handling

```dvala
let handle-response = (response) ->
  match response
    case { status: 200, body } then "OK: " ++ body
    case { status: 404 } then "Not found"
    case { status } when status >= 500 then "Server error"
    case _ then "Unknown"
  end;

handle-response({ status: 200, body: "Hello" })
```
