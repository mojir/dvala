# Control Flow

Since everything in Dvala is an expression, all control flow constructs return values.

## If / Then / Else

The basic conditional. Without `else`, the expression returns `null` when the condition is false:

```
if 10 > 5 then "big" else "small" end
```

```
if false then "nope" end
```

## Unless

`unless` is a negated `if` — the body runs when the condition is false:

```
unless 3 > 10 then "as expected" end
```

## Cond (Multi-branch)

`cond` evaluates multiple conditions in order and returns the first match:

```
let x = 12;
cond
  case x < 5 then "small"
  case x < 15 then "medium"
  case true then "large"
end
```

## Match (Pattern Matching)

`match` compares a value against specific cases:

```
let day = 3;
match day
  case 1 then "Mon"
  case 2 then "Tue"
  case 3 then "Wed"
end
```

## Ternary Operator

A compact conditional with `? :`:

```
let n = 7;
n > 0 ? "positive" : "non-positive"
```

## Logical Short-circuit

`&&` returns the first falsy value (or the last value). `||` returns the first truthy value (or the last value):

```
true && "second"
```

```
null || false || "found it"
```

## Nullish Coalescing

`??` returns the left side unless it is `null`. Unlike `||`, it does not coalesce `false` or `0`:

```
0 ?? "default"
```

```
null ?? "default"
```

## Do Blocks

Group multiple expressions with `do` / `end`. The block returns its last expression:

```
do
  let a = 10;
  let b = 20;
  a + b
end
```

## Error Handling

Use `do` / `with` to handle errors. `perform(effect(dvala.error), msg)` raises an error:

```
do
  perform(effect(dvala.error), "oops")
with
  case effect(dvala.error) then ([msg]) -> msg
end
```

```
let safe-div = (a, b) ->
  do
    a / b
  with
    case effect(dvala.error) then (args) -> "error"
  end;
safe-div(10, 0)
```
