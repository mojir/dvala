# Hygienic Macros

Macros receive **unevaluated code** (AST) and return **transformed code**. Code templates make this ergonomic:

```dvala
let double = macro (ast) -> ```${ast} + ${ast}```;
double(21)
```

```dvala
let unless = macro (cond, body) ->
  ```if not(${cond}) then ${body} else null end```;

unless(false, "this runs!")
```

## Hygienic by Default

Bindings inside code templates are automatically gensymed — no name collisions with the caller:

```dvala
let withTemp = macro (ast) -> ```do
  let tmp = ${ast};
  tmp * 2
end```;

let tmp = 999;
[withTemp(5), tmp]
```

The macro's `tmp` doesn't clobber the caller's `tmp`.

## Pipe into Macros

Because `|>` is desugared at parse time, macros work with pipes:

```dvala
let double = macro (ast) -> ```${ast} + ${ast}```;
let negate = macro (ast) -> ```0 - ${ast}```;
21 |> double |> negate
```

## Inspect Expansions

```dvala
let { prettyPrint } = import(ast);
let double = macro (ast) -> ```${ast} + ${ast}```;
macroexpand(double, ```21```) |> prettyPrint
```
