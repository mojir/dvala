# Hygienic Macros

Macros receive **unevaluated code** (AST) and return **transformed code**. `quote...end` makes this ergonomic:

```dvala
let double = macro(ast) -> quote $^{ast} + $^{ast} end;
double(21);

```

```dvala
let unless =
  macro(cond, body) -> quote if not ($^{cond}) then $^{body} else null end end;

unless(false, "this runs!");

```

## Hygienic by Default

Bindings inside quotes are automatically gensymed — no name collisions with the caller:

```dvala
let withTemp = macro(ast) -> quote do let tmp = $^{ast}; tmp * 2; end; end;

let tmp = 999;
[withTemp(5), tmp];

```

The macro's `tmp` doesn't clobber the caller's `tmp`.

## Pipe into Macros

Because `|>` is desugared at parse time, macros work with pipes:

```dvala
let double = macro(ast) -> quote $^{ast} + $^{ast} end;
let negate = macro(ast) -> quote - $^{ast} end;
21 |> double |> negate;

```

## Inspect Expansions

```dvala
let { prettyPrint } = import("ast");
let double = macro(ast) -> quote $^{ast} + $^{ast} end;
prettyPrint(macroexpand(double, quote 21 end));

```
