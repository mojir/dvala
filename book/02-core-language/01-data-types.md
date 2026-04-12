# Data Types

Dvala is **dynamically typed** — there are no type annotations and types are checked at runtime. Every value is immutable and fully serializable as JSON.

## Comments

Use `//` for single-line comments and `/* */` for multi-line:

```dvala
// This is a single-line comment
let x = 42; // inline comment

/* This spans
   multiple lines */
let y = x + 1;
y;
```

## Numbers

Numbers can be integers or floats. Dvala also supports hexadecimal, binary, octal, and scientific notation:

```dvala
42;
```

```dvala
3.14;
```

```dvala
255;
```

```dvala
10;
```

```dvala
-0.023;
```

Division by zero produces `Infinity` (or `-Infinity`), and invalid operations like `0 / 0` throw an error rather than silently producing `NaN`. `Infinity` is a valid number value but is **not** JSON-serializable — avoid it in data that will be snapshotted.

## Strings

Strings are enclosed in double quotes and support escape sequences:

```dvala
"Hello, World!";
```

```dvala
"Line 1\nLine 2";
```

## Template Strings

Template strings use backticks and support `${...}` interpolation — any expression can be embedded directly:

```dvala
let name = "World";
`Hello, ${name}!`;
```

```dvala
let x = 7;
let y = 6;
`${x} * ${y} = ${x * y}`;
```

Interpolations can contain any expression — function calls, conditionals, and more:

```dvala
let price = 9.99;
let qty = 3;
`Total: ${price * qty}`;
```

## Booleans and Null

The boolean values `true` and `false`, plus `null`:

```dvala
true;
```

```dvala
null;
```

## Atoms

Atoms are self-evaluating named constants — lightweight tags that represent themselves. They start with `:` followed by a name:

```dvala
:ok;
```

```dvala
:error;
```

Atoms are ideal as tags in data structures, especially for results and status values:

```dvala
[:ok, 42];
```

```dvala
[:error, "not found"];
```

Two atoms with the same name are always equal. Use `isAtom` to test and `typeOf` to inspect:

```dvala
:ok == :ok;
```

```dvala
typeOf(:hello);
```

Atoms work naturally in pattern matching:

```dvala
let result = [:ok, 42];
match result
  case [ :ok, value] then `Success: ${value}`
  case [ :error, msg] then `Error: ${msg}`
end;
```

## Arrays

Arrays hold ordered collections of any types:

```dvala
[1, "two", true, null];
```

Accessing out-of-bounds indices returns `null` (no error):

```dvala
let arr = [10, 20, 30];
[get(arr, 0), get(arr, 2), get(arr, 99)];
```

Use spread to merge arrays:

```dvala
[1, 2, ...[3, 4], 5];
```

## Objects

Objects are key-value maps. Keys are strings:

```dvala
{ name: "Alice", age: 30 };
```

Accessing properties with `.` or `[]` is null-safe — missing keys return `null`, and accessing properties on `null` propagates `null` instead of erroring:

```dvala
let user = { name: "Alice" };
[user.name, user.age, user.address.city];
```

Spread works in objects too:

```dvala
let defaults = { theme: "dark", lang: "en" };
{ ...defaults, lang: "sv" };
```

## Regular Expressions

Regexp literals start with `#"`. No need to escape backslashes:

```dvala
reMatch("abc123", #"[a-z]+(\d+)");
```

## Type Predicates

Check the type of a value with predicate functions:

```dvala
isNumber(42);
```

```dvala
isString("hello");
```

```dvala
isAtom(:ok);
```

```dvala
isArray([1, 2, 3]);
```

```dvala
isObject({ a: 1 });
```

## Structural Equality

Values are compared by structure, not by reference. Two arrays with the same elements are equal:

```dvala
[1, 2, 3] == [1, 2, 3];
```

```dvala
{ a: 1 } == { a: 1 };
```

```dvala
{ a: 1, b: 2 } == { b: 2, a: 1 };
```

Atoms are equal when they have the same name:

```dvala
:ok == :ok;
```

```dvala
[:ok, 42] == [:ok, 42];
```
