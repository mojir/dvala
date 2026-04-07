# Pure Functional

All data in Dvala is **immutable**. All functions are **pure**. There are no side effects, no variable reassignment, no mutable state.

```dvala
let original = [1, 2, 3];
let extended = push(original, 4);
[original, extended];
```

The original array is unchanged — `push` returns a new array.

## Everything Is an Expression

There are no statements. `if`, `let`, `match`, `loop` — everything returns a value:

```dvala
let label = if 42 > 0 then "positive" else "negative" end;
label;
```

```dvala
let result = do let x = 10; let y = 20; x + y end;
result;
```

## Pipelines

Chain transformations with `|>`:

```dvala
reduce(_, +, 0)(map(_, -> $ ^ 2)(filter(_, isOdd)(range(1, 11))));
```

## Pattern Matching

```dvala
let describe = (val) ->
  match val
    case 0 then "zero"
    case x when x < 0 then "negative"
    case _ then "positive"
  end;

[describe(-5), describe(0), describe(42)];
```
