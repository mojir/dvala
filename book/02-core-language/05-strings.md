# Strings

Strings are immutable sequences of characters. Dvala provides a rich set of built-in functions for building, searching, transforming, and splitting strings — no module import required.

## Literals

Double-quoted strings with standard escape sequences:

```dvala
"Hello, World!"
```

```dvala
"Line 1\nLine 2\tTabbed"
```

## Template Strings

Backtick strings interpolate any expression with `${...}`:

```dvala
let name = "Alice";
let score = 42;
`${name} scored ${score} points`
```

Any expression works inside `${}` — arithmetic, function calls, conditionals:

```dvala
let temp = 22;
`It is ${temp}°C — ${if temp > 20 then "warm" else "cold" end}`
```

## Building Strings

Use `++` to concatenate, or `str` to build from multiple values of any type:

```dvala
"Hello" ++ ", " ++ "World!"
```

```dvala
str("Count: ", 42, " items (", true, ")")
```

`str` converts every argument to a string — useful when mixing types without a template string.

## Length

`count` returns the number of characters:

```dvala
count("hello")
```

## Case

```dvala
upperCase("hello world")
```

```dvala
lowerCase("HELLO WORLD")
```

## Trimming

`trim` removes leading and trailing whitespace:

```dvala
trim("   hello   ")
```

## Slicing

`slice` extracts a substring by start (inclusive) and end (exclusive) index:

```dvala
slice("hello world", 6, 11)
```

```dvala
slice("hello world", 0, 5)
```

## Searching

`contains` tests whether a substring is present:

```dvala
contains("hello world", "world")
```

`indexOf` returns the position of the first occurrence, or `-1` if not found:

```dvala
indexOf("hello world", "o")
```

## Replace

`replace` substitutes the first occurrence of a string or regex:

```dvala
replace("hello world", "world", "Dvala")
```

```dvala
replace("aabbcc", #"b+", "X")
```

## Split and Join

`split` breaks a string into an array:

```dvala
split("one,two,three", ",")
```

`join` reassembles an array into a string:

```dvala
join(["one", "two", "three"], " | ")
```

Split and join compose naturally:

```dvala
"hello world foo"
  |> split(_, " ")
  |> map(_, upperCase)
  |> join(_, "-")
```

## Strings as Sequences

Strings are sequences of single-character strings. All sequence functions work on them:

```dvala
first("hello")
```

```dvala
rest("hello")
```

```dvala
reverse("hello")
```

```dvala
map("hello", upperCase)
```

```dvala
filter("hello world", -> $ != " ")
```

## Regular Expressions

Regexp literals use `#"..."` syntax — no backslash doubling needed:

```dvala
reMatch("abc123", #"\d+")
```

With capture groups, `reMatch` returns an array: the full match followed by each group:

```dvala
reMatch("2026-03-31", #"(\d{4})-(\d{2})-(\d{2})")
```

`reMatch` returns `null` when there is no match:

```dvala
reMatch("no digits here", #"\d+")
```

Use `replace` with a regex for pattern-based substitution:

```dvala
replace("phone: 123-456-7890", #"\d{3}-\d{3}-\d{4}", "[REDACTED]")
```
