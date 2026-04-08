# Macros

## What Are Macros?

Macros are functions that operate on **code** instead of **values**. When you call a regular function, its arguments are evaluated first and the function receives the results. When you call a macro, arguments are **not** evaluated — the macro receives the raw AST (abstract syntax tree), transforms it, and returns new AST that is then evaluated in the caller's scope.

This lets you extend the language with custom syntax, control flow, and code transformations.

```dvala
// Regular function: arguments are evaluated first
let addOne = (x) -> x + 1;
addOne(2 + 3);
```

```dvala
// Macro: argument is passed as AST, not as 5
let id = macro ( ast) -> ast;
id(2 + 3);
```

The function returns 6 (`5 + 1`). The macro returns 5 (it passes `2 + 3` through unchanged). The difference: the function receives the **value** 5, the macro receives the **expression** `2 + 3` as a data structure.

---

## Defining Macros

Use the `macro` keyword. The syntax is identical to functions but with `macro` before the parameters:

```dvala
let myMacro = macro ( ast) -> ast;
typeOf(myMacro);
```

```dvala
isMacro(macro ( ast) -> ast);
```

```dvala
isFunction(macro ( ast) -> ast);
```

Macros are a distinct type — `isMacro` returns true, `isFunction` returns false.

---

## How Macros Work

When the evaluator encounters a macro call like `myMacro(1 + 2)`:

1. **Don't evaluate the argument** — instead, capture the AST of `1 + 2`
2. **Call the macro body** — pass the AST node as a regular value
3. **Macro body executes normally** — it receives an array (AST data) and returns an array
4. **Evaluate the result** — the returned AST is evaluated in the caller's scope

The macro body runs like any function — it can use `let`, `if`, `match`, call other functions, perform effects. The only difference is what it receives (AST) and what happens to its return value (gets evaluated).

---

## AST Node Format

Every AST node is a 3-element array: `[type, payload, nodeId]`.

| Node | Example | AST |
|------|---------|-----|
| Number | `42` | `["Num", 42, 0]` |
| String | `"hi"` | `["Str", "hi", 0]` |
| Boolean | `true` | `["Reserved", "true", 0]` |
| Null | `null` | `["Reserved", "null", 0]` |
| Symbol | `x` | `["Sym", "x", 0]` |
| Builtin | `+` | `["Builtin", "+", 0]` |
| Effect | `@dvala.io.print` | `["Effect", "dvala.io.print", 0]` |

Compound nodes nest other nodes in their payload:

```dvala
// A macro that inspects its argument's AST type
let showType =
  macro ( ast) -> do
    let nodeType = first(ast);
    ["Str", nodeType, 0];
  end;
showType(42);
```

```dvala
let showType =
  macro ( ast) -> do
    let nodeType = first(ast);
    ["Str", nodeType, 0];
  end;
showType(x + 1);
```

The first returns `"Num"` because `42` is a number literal. The second returns `"Call"` because `x + 1` is a function call to `+`.

---

## Quote Blocks

Manually constructing AST arrays is tedious. **Quote blocks** (`quote...end`) let you write Dvala code that produces AST data at parse time:

```dvala
// This is AST data, not evaluated code
quote 42 end;
```

```dvala
quote "hello" end;
```

```dvala
quote x + 1 end;
```

### Splicing with `$^{expr}`

Inside a quote block, `$^{expr}` evaluates `expr` at runtime and inserts the result into the AST:

```dvala
let node = ["Num", 99, 0];
quote $^{ node} end;
```

This is the key to building macros — you receive AST, splice it into a template, and return the new AST:

```dvala
// double: duplicates an expression
let double = macro ( ast) -> quote $^{ ast} + $^{ ast} end;
double(21);
```

```dvala
let double = macro ( ast) -> quote $^{ ast} + $^{ ast} end;
double(inc(5));
```

The macro receives the AST of `21` (or `inc(5)`), splices it into `$^{ast} + $^{ast}`, and returns the expanded AST. The evaluator then evaluates the result.

### Multi-Statement Templates

Quote blocks can contain multiple statements. The result is an array of AST nodes:

```dvala
let twoStatements = quote let x = 1; x + 1; end;
typeOf(twoStatements);
```

### Nested Quote Blocks

Quote blocks can be nested naturally — inner `quote...end` blocks are just part of the quoted code. Use `$^^{expr}` (deferred splice) when writing a macro that *generates a quote block*, and you need a splice to be resolved during the outer expansion (where `$^` would only be visible to the inner quote):

```dvala no-run
// A macro that produces a quoted expression containing a resolved value.
// $^{val} resolves at depth 1 (this quote).
// $^^{val} would resolve at depth 2 — inside a nested quote block.
let snapshot = macro (val) ->
  // Produces: quote <resolved-value> + 1 end  (as an AST)
  quote quote $^^{val} + 1 end end;
```

In practice `$^^` is only needed when building macros that themselves generate `quote` blocks. For everyday macro writing, `$^` is sufficient.

---

## Practical Macro Patterns

### Custom Control Flow

Macros can create new control flow constructs that functions cannot:

```dvala
// unless: execute body only if condition is false
let unless =
  macro ( cond, body) -> quote if not ( $^{ cond}) then $^{ body} else null end end;

unless(false, 42);
```

```dvala
let unless =
  macro ( cond, body) -> quote if not ( $^{ cond}) then $^{ body} else null end end;

unless(true, 42);
```

A regular function `unless(cond, body)` would evaluate `body` before calling the function — defeating the purpose. The macro delays evaluation.

### Expression Wrappers

```dvala
// Wrap an expression in a try-catch style handler
let safely = macro ( ast) -> quote fallback ( null) ( -> $^{ ast}) end;

let { fallback } = import("effectHandler");
safely(0 / 0);
```

### Multiple Arguments

Macros can take multiple AST arguments:

```dvala
let pickFirst = macro ( a, b) -> a;
pickFirst(42, 1 / 0);
```

The second argument (`1 / 0`) is never evaluated because the macro only returns the first AST.

---

## Piping into Macros

Because `a |> b` is desugared to `b(a)` at parse time, macros work naturally with pipes:

```dvala
let double = macro ( ast) -> quote $^{ ast} + $^{ ast} end;
let negate = macro ( ast) -> quote - $^{ ast} end;
21 |> double |> negate;
```

Macros also work inside lambdas passed to pipes:

```dvala
let double = macro ( ast) -> quote $^{ ast} + $^{ ast} end;
map(_, -> double($))([1, 2, 3]);
```

---

## Prefix Syntax: #name

The `#` prefix provides a concise way to call single-argument macros. Instead of `myMacro(expr)`, write `#myMacro expr`:

```dvala
let double = macro ( ast) -> quote $^{ ast} + $^{ ast} end;
#double 21;
```

This is equivalent to `double(21)` — the `#` is purely syntactic sugar. All three forms below produce the same result:

```dvala
let double = macro ( ast) -> quote $^{ ast} + $^{ ast} end;
[double(21), #double 21, double(21)];
```

The `#` prefix consumes one operand, so it chains naturally — each `#` wraps the next:

```dvala
let double = macro ( ast) -> quote $^{ ast} + $^{ ast} end;
let inc = macro ( ast) -> quote $^{ ast} + 1 end;
#double #inc 10;
```

Here `#double #inc 10` parses as `double(inc(10))` — `inc(10)` expands to `11`, then `double(11)` expands to `11 + 11`.

Unlike regular call syntax, the `#` prefix enforces that the name must resolve to a macro. Calling a non-macro with `#` is a runtime error:

```dvala throws
let f = (x) -> x * 2;
#f 21;
```

### Decorating Bindings

The `#` prefix consumes a full expression, including `let` bindings. This means both forms below are valid:

```dvala
let double = macro ( x) -> quote $^{ x} + $^{ x} end;
let x = #double 21;
x;
```

```dvala no-run
let double = macro (x) -> quote $^{x} + $^{x} end;
#double let x = 21;
x
```

In the first form, the macro receives `21`. In the second, it receives the entire `let x = 21` AST. A simple macro like `double` doesn't know how to handle a `let` node — it just doubles the whole expression, which isn't useful.

To write a macro that handles both, use `decorate` from the `ast` module. It extracts the value from a `let` binding (or uses the node directly), passes it to a transform function, and rewraps the result:

```dvala
let { assertEqual } = import("assertion");
let { decorate } = import("ast");

let double =
  macro ( ast) -> decorate(ast, (value) -> quote $^{ value} + $^{ value} end);

assertEqual(#double 21, 42);
#double let x = 21;
assertEqual(x, 42);
```

The transform function receives the value AST and returns new AST. `decorate` handles the `let` unwrapping and rewrapping automatically.

---

## Hygiene

Macros generate code that runs in the caller's scope. Without care, a macro's internal variable names could collide with the caller's variables.

Dvala solves this automatically: **literal bindings in quote blocks are auto-gensymed** — renamed to unique symbols that can't collide with anything.

```dvala
// The macro introduces "tmp" internally
let withTemp = macro ( ast) -> quote do let tmp = $^{ ast}; tmp * 2; end; end;

// The caller also has "tmp"
let tmp = 999;

// No collision — macro's "tmp" is gensymed
[withTemp(5), tmp];
```

The macro's `tmp` becomes something like `__gensym_tmp_42__` — invisible to the caller. The caller's `tmp` stays 999.

### What Gets Gensymed

- **Literal bindings** in quote blocks — `let x = ...`, function params `(x) -> ...`
- Only names written directly in the quote block source

### What Doesn't Get Gensymed

- **Spliced values** from `$^{expr}` — they keep their original identity
- Names from the caller's AST pass through unchanged

This is the key rule: **quote block = private, splice = caller's**.

```dvala
// The macro's param "n" is gensymed, but the spliced $^{ast} retains
// the caller's reference to "n"
let makeAdder = macro ( ast) -> quote ( n) -> n + $^{ ast} end;
let n = 100;
let f = makeAdder(n);
f(1);
```

Without hygiene this would return 2 (param `n` shadows caller's `n`). With hygiene it correctly returns 101.

---

## Qualified Names

Macros can have a **qualified name** — a dotted DNS-style identifier for host-level dispatch:

```dvala
let m = macro@mylib.double ( ast) -> quote $^{ ast} + $^{ ast} end;
qualifiedName(m);
```

```dvala
// Anonymous macros have no qualified name
qualifiedName(macro ( ast) -> ast);
```

The `@` must be attached to `macro` with no space — `macro@name`, not `macro @name`.

### Qualified Names and Effects

Qualified names connect macros to the effect system. When a **named** macro is called, the evaluator emits `@dvala.macro.expand` — an effect that host handlers can intercept:

```dvala
let double = macro@mylib.double ( ast) -> quote $^{ ast} + $^{ ast} end;

// Named macro emits the effect — handler can intercept
do
  with handler
    @dvala.macro.expand(arg) -> do
      perform(@dvala.io.print, `Expanding macro: ${qualifiedName(arg.fn)}`);
      resume(["Num", 99, 0]);
    end
  end;
  double(21);
end;
// Return the expansion result as AST
```

**Anonymous** macros (without `macro@name`) skip the effect entirely — they're direct calls with no host visibility:

```dvala
let double = macro ( ast) -> quote $^{ ast} + $^{ ast} end;

// Anonymous — handler is NOT called
do
  with handler
    @dvala.macro.expand(arg) -> resume(["Num", 99, 0])
  end;
  double(21);
end;
```

This gives you a spectrum:
- **Anonymous macros** — fast, private, no overhead
- **Named macros** — observable, interceptable, good for libraries

The `qualifiedName` function works on both macros and effects — they share the same namespace:

```dvala
[qualifiedName(@dvala.io.print), qualifiedName(macro@my.lib ( x) -> x)];
```

---

## Inspecting Expansions

### `macroexpand`

`macroexpand` calls a macro's body with AST arguments and returns the expanded AST **without evaluating it**:

```dvala
let double = macro ( ast) -> quote $^{ ast} + $^{ ast} end;
macroexpand(double, quote 21 end);
```

Pass the macro function and AST arguments (constructed with quote blocks). The result is the expanded AST as data.

### Pretty Printing

Combine `macroexpand` with `prettyPrint` from the `ast` module for readable output:

```dvala
let { prettyPrint } = import("ast");
let double = macro ( ast) -> quote $^{ ast} + $^{ ast} end;
prettyPrint(macroexpand(double, quote 21 end));
```

```dvala
let { prettyPrint } = import("ast");
let unless =
  macro ( cond, body) -> quote if not ( $^{ cond}) then $^{ body} else null end end;
prettyPrint(macroexpand(unless, quote x > 10 end, quote 42 end));
```

---

## The AST Module

For programmatic AST construction and inspection, use `import("ast")`:

### Constructors

```dvala
let { num, sym, builtin, call } = import("ast");
call(builtin("+"), [num(1), num(2)]);
```

Available constructors: `num`, `strNode`, `bool`, `nil`, `sym`, `builtin`, `effectNode`, `call`, `ifNode`, `block`.

### Predicates

```dvala
let { isNum, isCall, isAstNode, num } = import("ast");
[isNum(num(42)), isCall(num(42)), isAstNode(num(42)), isAstNode(42)];
```

Available predicates: `isNum`, `isStr`, `isSym`, `isBuiltin`, `isCall`, `isIf`, `isBlock`, `isLet`, `isFn`, `isBool`, `isNil`, `isEffectNode`, `isAstNode`.

### Accessors

```dvala
let { nodeType, payload, num } = import("ast");
[nodeType(num(42)), payload(num(42))];
```

### Pretty Print

```dvala
let { prettyPrint, call, builtin, num, sym, ifNode } = import("ast");
prettyPrint(ifNode(call(builtin(">"), [sym("x"), num(0)]), sym("x"), num(0)));
```

---

## Pattern Matching on AST

Dvala's `match` with array destructuring works naturally on AST nodes:

```dvala
let describe =
  macro ( ast) -> do
    let result =
      match ast
        case [ "Num", n, _] then ["Str", `number: ${n}`, 0]
        case [ "Str", s, _] then ["Str", `string: ${s}`, 0]
        case [ "Call", _, _] then ["Str", "call expression", 0]
        case _ then ["Str", "something else", 0]
      end;
    result;
  end;

[describe(42), describe("hi"), describe(1 + 2), describe(true)];
```

This is powerful for macros that need to inspect and transform specific AST shapes.

---

## Implicit Spread in Quote Blocks

When a splice `$^{expr}` evaluates to an **array of AST nodes** (not a single node), the nodes are spread into the parent:

```dvala
let args = [["Num", 1, 0], ["Num", 2, 0]];
quote + ( $^{ args}) end;
```

Detection is unambiguous: a single AST node starts with a string (`["Num", ...]`), an array of nodes starts with an array (`[["Num", ...], ...]`).

---

## Gotchas

### Macros Only Intercept Named Calls

A macro call is only recognized when the callee is a **named variable** — `myMacro(x)`. If the macro is accessed through an expression like `first(fns)`, the macro check doesn't trigger and arguments are evaluated normally:

```dvala
// This macro returns the AST type tag as a string
let showType = macro ( ast) -> ["Str", first(ast), 0];

// Direct call — macro intercepts, receives AST node ["Num", 42, 0]
showType(42);
```

```dvala throws
let showType = macro ( ast) -> ["Str", first(ast), 0];
let fns = [showType];

// Expression call — NOT intercepted as macro
// first(fns) evaluates to the macro, then it's called as a regular function
// ast receives the VALUE 42 (not AST), so first(42) fails
first(fns)(42); // Error: Expected string or array, got 42
```

### AST Arguments Are Arrays

Since AST nodes are arrays, and arrays are truthy in Dvala, be careful with type checks:

```dvala
// ast is always an array (AST node), so it's always truthy
// Use first(ast) to get the type tag
let check =
  macro ( ast) -> if first(ast) == "Num" then
    ["Str", "got a number!", 0]
  else
    ["Str", "got something else", 0]
  end;
check(42);
```

### Quote Block Bindings Are Always Gensymed

Even simple quote blocks gensym their bindings. If you want a binding to keep its original name (e.g., for the caller to reference), it must come from a splice:

```dvala no-run
// This gensyms "x" — caller can't reference it
let bad = macro (ast) -> quote let x = $^{ast} end;

// This keeps the caller's name — use the ast module to construct
// the binding target programmatically if needed
```

---

## Summary

| Concept | Description |
|---------|-------------|
| `macro (params) -> body` | Define an anonymous macro |
| `macro@name (params) -> body` | Define a named macro with qualified name |
| `quote code end` | Quote block — produces AST data |
| `$^{expr}` | Splice — insert evaluated AST into quote block |
| `$^^{expr}` | Deferred splice — resolved in inner expansion |
| `macroexpand(m, ...args)` | Expand without evaluating |
| `prettyPrint(ast)` | AST to readable source |
| `qualifiedName(m)` | Get the qualified name (or null) |
| Hygiene | Quote block bindings auto-gensymed |
| `@dvala.macro.expand` | Effect emitted by named macros |
| `a \|> myMacro` | Pipe into macro (desugared at parse time) |
| `#myMacro expr` | Prefix macro call (macro-only, chains: `#a #b x`) |
| `decorate(ast, transform)` | Decorator helper — extracts value, calls transform, rewraps let |
