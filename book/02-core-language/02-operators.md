# Operators

Dvala has a rich set of operators. A unique feature is that operators and functions are interchangeable — operators can be called as functions and two-argument functions can be used as infix operators.

## Arithmetic

The standard math operators, with whitespace required:

```dvala
2 + 3 * 4;
```

```dvala
2 ^ 10;
```

```dvala
17 % 5;
```

## Comparison

Comparison operators use structural equality (`==`), not reference equality:

```dvala
3 > 2;
```

```dvala
[1, 2] == [1, 2];
```

```dvala
1 != 2;
```

## String Concatenation

Use `++` to concatenate strings and sequences:

```dvala
"Hello" ++ ", " ++ "World!";
```

```dvala
[1, 2] ++ [3, 4];
```

## Logical Operators

`&&` and `||` are short-circuit. `??` is the nullish coalescing operator:

```dvala
true && "yes";
```

```dvala
false || "fallback";
```

```dvala
null ?? "default";
```

## Property Access

The `.` operator accesses object properties, and `[]` accesses by index or computed key:

```dvala
let obj = { name: "Alice", age: 30 };
obj.name;
```

```dvala
let arr = [10, 20, 30];
get(arr, 1);
```

`.` access is **strict** — it throws a `KeyError` if the key is missing. Use `?.` for safe access: it returns `null` for missing keys and propagates `null` through chains instead of erroring:

```dvala
let obj = { a: { b: 42 } };
obj.a.b;
```

```dvala
let obj = { a: null };
obj.a?.b;
```

```dvala
let obj = null;
obj?.x?.y?.z;
```

Safe access returns `null` for missing keys:

```dvala
let obj = { a: 1 };
obj?.missing;
```

```dvala
let arr = [10, 20];
get(arr, 99);
```

## Operators as Functions

Every operator can be called in function (prefix) form. Some are variadic:

```dvala
+(1, 2, 3, 4, 5);
```

```dvala
*(2, 3, 4);
```

```dvala
<(1, 2, 3, 4);
```

## Functions as Operators

Any two-argument function can be used as an infix operator:

```dvala
max(5, 10);
```

```dvala
filter([1, 2, 3, 4], isOdd);
```

## Operator Precedence

Dvala follows standard mathematical precedence: `*`, `/`, `%` bind tighter than `+`, `-`. So `2 + 3 * 4` evaluates as `2 + (3 * 4) = 14`, not `(2 + 3) * 4 = 20`. Use parentheses when in doubt.

## Partial Application

Use `_` as a placeholder to create partially applied functions from operators:

```dvala
let add5 = +(5, _);
add5(10);
```

```dvala
let half = /(_, 2);
half(20);
```

The `_` placeholder works the same way in pipe expressions — `xs |> filter(_, isOdd)` passes `xs` into the first argument of `filter`. See the [Pipes & Data Flow](../03-data-and-control-flow/06-pipes-and-data-flow.md) chapter for the full picture.

