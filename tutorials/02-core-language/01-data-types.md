# Data Types

Dvala has a small set of data types. Every value is immutable and fully serializable as JSON.

## Numbers

Numbers can be integers or floats. Dvala also supports hexadecimal, binary, octal, and scientific notation:

```dvala
42
```

```dvala
3.14
```

```dvala
0xFF
```

```dvala
0b1010
```

```dvala
-2.3e-2
```

## Strings

Strings are enclosed in double quotes and support escape sequences:

```dvala
"Hello, World!"
```

```dvala
"Line 1\nLine 2"
```

## Template Strings

Template strings use backticks and support `${...}` interpolation — any expression can be embedded directly:

```dvala
let name = "World";
`Hello, ${name}!`
```

```dvala
let x = 7;
let y = 6;
`${x} * ${y} = ${x * y}`
```

Interpolations can contain full expressions including function calls, conditionals, and more:

```dvala
let items = ["apple", "banana", "cherry"];
for (i in range(count(items))) -> `${i + 1}. ${items[i]}`
```

## Booleans and Null

The boolean values `true` and `false`, plus `null`:

```dvala
true
```

```dvala
null
```

## Arrays

Arrays hold ordered collections of any types:

```dvala
[1, "two", true, null]
```

Accessing out-of-bounds indices returns `null` (no error):

```dvala
let arr = [10, 20, 30];
[arr[0], arr[2], arr[99]]
```

Use spread to merge arrays:

```dvala
[1, 2, ...[3, 4], 5]
```

## Objects

Objects are key-value maps. Keys are strings:

```dvala
{ name: "Alice", age: 30 }
```

Accessing properties with `.` or `[]` is null-safe — missing keys return `null`, and accessing properties on `null` propagates `null` instead of erroring:

```dvala
let user = {name: "Alice"};
[user.name, user.age, user.address.city]
```

Spread works in objects too:

```dvala
let defaults = { theme: "dark", lang: "en" };
{ ...defaults, lang: "sv" }
```

## Regular Expressions

Regexp literals start with `#"`. No need to escape backslashes:

```dvala
re-match("abc123", #"[a-z]+(\d+)")
```

## Type Predicates

Check the type of a value with predicate functions that end in `?`:

```dvala
number?(42)
```

```dvala
string?("hello")
```

```dvala
array?([1, 2, 3])
```

```dvala
object?({ a: 1 })
```

## Structural Equality

Values are compared by structure, not by reference. Two arrays with the same elements are equal:

```dvala
[1, 2, 3] == [1, 2, 3]
```

```dvala
{ a: 1 } == { a: 1 }
```

```dvala
{ a: 1, b: 2 } == { b: 2, a: 1 }
```
