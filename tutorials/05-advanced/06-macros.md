# Macros

## What Are Macros?

Macros are functions that operate on **code** instead of **values**. When you call a regular function, its arguments are evaluated first and the function receives the results. When you call a macro, arguments are **not** evaluated — the macro receives the raw AST (abstract syntax tree), transforms it, and returns new AST that is then evaluated in the caller's scope.

This lets you extend the language with custom syntax, control flow, and code transformations.

```dvala
// Regular function: arguments are evaluated first
let addOne = (x) -> x + 1;
addOne(2 + 3)
```

```dvala
// Macro: argument is passed as AST, not as 5
let id = macro (ast) -> ast;
id(2 + 3)
```

The function returns 6 (`5 + 1`). The macro returns 5 (it passes `2 + 3` through unchanged). The difference: the function receives the **value** 5, the macro receives the **expression** `2 + 3` as a data structure.

---

## Defining Macros

Use the `macro` keyword. The syntax is identical to functions but with `macro` before the parameters:

```dvala
let myMacro = macro (ast) -> ast;
typeOf(myMacro)
```

```dvala
isMacro(macro (ast) -> ast)
```

```dvala
isFunction(macro (ast) -> ast)
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
let showType = macro (ast) -> do
  let nodeType = first(ast);
  ["Str", nodeType, 0]
end;
showType(42)
```

```dvala
let showType = macro (ast) -> do
  let nodeType = first(ast);
  ["Str", nodeType, 0]
end;
showType(x + 1)
```

The first returns `"Num"` because `42` is a number literal. The second returns `"Call"` because `x + 1` is a function call to `+`.

---

## Code Templates

Manually constructing AST arrays is tedious. **Code templates** (triple backticks) let you write Dvala code that produces AST data at parse time:

```dvala
// This is AST data, not evaluated code
```42```
```

```dvala
```"hello"```
```

```dvala
```x + 1```
```

### Splicing with `${expr}`

Inside a code template, `${expr}` evaluates `expr` at runtime and inserts the result into the AST:

```dvala
let node = ["Num", 99, 0];
```${node}```
```

This is the key to building macros — you receive AST, splice it into a template, and return the new AST:

```dvala
// double: duplicates an expression
let double = macro (ast) -> ```${ast} + ${ast}```;
double(21)
```

```dvala
let double = macro (ast) -> ```${ast} + ${ast}```;
double(inc(5))
```

The macro receives the AST of `21` (or `inc(5)`), splices it into `${ast} + ${ast}`, and returns the expanded AST. The evaluator then evaluates the result.

### Multi-Statement Templates

Templates can contain multiple statements. The result is an array of AST nodes:

```dvala
let twoStatements = ```let x = 1; x + 1```;
typeOf(twoStatements)
```

### N-Backtick Nesting

If your code template needs to contain triple backticks, use 4+ backticks for the outer delimiter. The closing delimiter must match the opening count exactly.

> **Note:** Nested code templates with `${...}` splices in the inner template are not yet supported — the outer template parser consumes all splice markers. This is a known limitation for macro-generating macros.

---

## Practical Macro Patterns

### Custom Control Flow

Macros can create new control flow constructs that functions cannot:

```dvala
// unless: execute body only if condition is false
let unless = macro (cond, body) ->
  ```if not(${cond}) then ${body} else null end```;

unless(false, 42)
```

```dvala
let unless = macro (cond, body) ->
  ```if not(${cond}) then ${body} else null end```;

unless(true, 42)
```

A regular function `unless(cond, body)` would evaluate `body` before calling the function — defeating the purpose. The macro delays evaluation.

### Expression Wrappers

```dvala
// Wrap an expression in a try-catch style handler
let safely = macro (ast) ->
  ```(${ast}) ||> fallback(null)```;

let { fallback } = import(effectHandler);
safely(0 / 0)
```

### Multiple Arguments

Macros can take multiple AST arguments:

```dvala
let pickFirst = macro (a, b) -> a;
pickFirst(42, 1 / 0)
```

The second argument (`1 / 0`) is never evaluated because the macro only returns the first AST.

---

## Piping into Macros

Because `a |> b` is desugared to `b(a)` at parse time, macros work naturally with pipes:

```dvala
let double = macro (ast) -> ```${ast} + ${ast}```;
let negate = macro (ast) -> ```0 - ${ast}```;
21 |> double |> negate
```

```dvala
let double = macro (ast) -> ```${ast} + ${ast}```;
[1, 2, 3] |> map(_, -> double($))
```

Wait — the second example doesn't work as a macro pipe because `double` is inside a lambda. Macros only intercept **direct named calls** at the call site. Inside a lambda, `double($)` is a regular macro call which works fine.

---

## Hygiene

Macros generate code that runs in the caller's scope. Without care, a macro's internal variable names could collide with the caller's variables.

Dvala solves this automatically: **literal bindings in code templates are auto-gensymed** — renamed to unique symbols that can't collide with anything.

```dvala
// The macro introduces "tmp" internally
let withTemp = macro (ast) -> ```do
  let tmp = ${ast};
  tmp * 2
end```;

// The caller also has "tmp"
let tmp = 999;

// No collision — macro's "tmp" is gensymed
[withTemp(5), tmp]
```

The macro's `tmp` becomes something like `__gensym_tmp_42__` — invisible to the caller. The caller's `tmp` stays 999.

### What Gets Gensymed

- **Literal bindings** in code templates — `let x = ...`, function params `(x) -> ...`
- Only names written directly in the template source

### What Doesn't Get Gensymed

- **Spliced values** from `${expr}` — they keep their original identity
- Names from the caller's AST pass through unchanged

This is the key rule: **template = private, splice = caller's**.

```dvala
// The macro's param "n" is gensymed, but the spliced ${ast} retains
// the caller's reference to "n"
let makeAdder = macro (ast) -> ```(n) -> n + ${ast}```;
let n = 100;
let f = makeAdder(n);
f(1)
```

Without hygiene this would return 2 (param `n` shadows caller's `n`). With hygiene it correctly returns 101.

---

## Qualified Names

Macros can have a **qualified name** — a dotted DNS-style identifier for host-level dispatch:

```dvala
let m = macro@mylib.double (ast) -> ```${ast} + ${ast}```;
qualifiedName(m)
```

```dvala
// Anonymous macros have no qualified name
qualifiedName(macro (ast) -> ast)
```

The `@` must be attached to `macro` with no space — `macro@name`, not `macro @name`.

### Qualified Names and Effects

Qualified names connect macros to the effect system. When a **named** macro is called, the evaluator emits `@dvala.macro.expand` — an effect that host handlers can intercept:

```dvala
let double = macro@mylib.double (ast) -> ```${ast} + ${ast}```;

// Named macro emits the effect — handler can intercept
handle
  double(21)
with [(arg, eff, nxt) ->
  if eff == @dvala.macro.expand then do
    perform(@dvala.io.print, "Expanding macro: " ++ qualifiedName(get(arg, "fn")));
    // Return the expansion result as AST
    ["Num", 99, 0]
  end
  else nxt(eff, arg)
  end
] end
```

**Anonymous** macros (without `macro@name`) skip the effect entirely — they're direct calls with no host visibility:

```dvala
let double = macro (ast) -> ```${ast} + ${ast}```;

// Anonymous — handler is NOT called
handle
  double(21)
with [(arg, eff, nxt) ->
  if eff == @dvala.macro.expand then ["Num", 99, 0]
  else nxt(eff, arg)
  end
] end
```

This gives you a spectrum:
- **Anonymous macros** — fast, private, no overhead
- **Named macros** — observable, interceptable, good for libraries

The `qualifiedName` function works on both macros and effects — they share the same namespace:

```dvala
[qualifiedName(@dvala.io.print), qualifiedName(macro@my.lib (x) -> x)]
```

---

## Inspecting Expansions

### `macroexpand`

`macroexpand` calls a macro's body with AST arguments and returns the expanded AST **without evaluating it**:

```dvala
let double = macro (ast) -> ```${ast} + ${ast}```;
macroexpand(double, ```21```)
```

Pass the macro function and AST arguments (constructed with code templates). The result is the expanded AST as data.

### Pretty Printing

Combine `macroexpand` with `prettyPrint` from the `ast` module for readable output:

```dvala
let { prettyPrint } = import(ast);
let double = macro (ast) -> ```${ast} + ${ast}```;
macroexpand(double, ```21```) |> prettyPrint
```

```dvala
let { prettyPrint } = import(ast);
let unless = macro (cond, body) ->
  ```if not(${cond}) then ${body} else null end```;
macroexpand(unless, ```x > 10```, ```42```) |> prettyPrint
```

---

## The AST Module

For programmatic AST construction and inspection, use `import(ast)`:

### Constructors

```dvala
let { num, sym, builtin, call } = import(ast);
call(builtin("+"), [num(1), num(2)])
```

Available constructors: `num`, `strNode`, `bool`, `nil`, `sym`, `builtin`, `effectNode`, `call`, `ifNode`, `block`.

### Predicates

```dvala
let { isNum, isCall, isAstNode, num } = import(ast);
[isNum(num(42)), isCall(num(42)), isAstNode(num(42)), isAstNode(42)]
```

Available predicates: `isNum`, `isStr`, `isSym`, `isBuiltin`, `isCall`, `isIf`, `isBlock`, `isLet`, `isFn`, `isBool`, `isNil`, `isEffectNode`, `isAstNode`.

### Accessors

```dvala
let { nodeType, payload, num } = import(ast);
[nodeType(num(42)), payload(num(42))]
```

### Pretty Print

```dvala
let { prettyPrint, call, builtin, num, sym, ifNode } = import(ast);
prettyPrint(ifNode(call(builtin(">"), [sym("x"), num(0)]), sym("x"), num(0)))
```

---

## Pattern Matching on AST

Dvala's `match` with array destructuring works naturally on AST nodes:

```dvala
let describe = macro (ast) -> do
  let result = match ast
    case ["Num", n, _] then ["Str", "number: " ++ str(n), 0]
    case ["Str", s, _] then ["Str", "string: " ++ s, 0]
    case ["Call", _, _] then ["Str", "call expression", 0]
    case _ then ["Str", "something else", 0]
  end;
  result
end;

[describe(42), describe("hi"), describe(1 + 2), describe(true)]
```

This is powerful for macros that need to inspect and transform specific AST shapes.

---

## Implicit Spread in Templates

When a splice `${expr}` evaluates to an **array of AST nodes** (not a single node), the nodes are spread into the parent:

```dvala
let args = [["Num", 1, 0], ["Num", 2, 0]];
```+(${args})```
```

Detection is unambiguous: a single AST node starts with a string (`["Num", ...]`), an array of nodes starts with an array (`[["Num", ...], ...]`).

---

## Gotchas

### Macros Only Intercept Named Calls

Macros are detected when calling a **named user-defined symbol**. Calling through an expression doesn't trigger macro behavior:

```dvala
let id = macro (ast) -> ast;

// Direct call — macro intercepts, receives AST
id(42)
```

```dvala
let id = macro (ast) -> ast;
let fns = [id];

// Expression call — NOT intercepted as macro
// first(fns) evaluates to the macro value, then it's called as a regular function
// This means it receives the VALUE 42, not AST
first(fns)(42)
```

### AST Arguments Are Arrays

Since AST nodes are arrays, and arrays are truthy in Dvala, be careful with type checks:

```dvala
let check = macro (ast) -> do
  // ast is always an array (AST node), so it's always truthy
  // Use first(ast) to get the type tag
  if first(ast) == "Num" then
    ["Str", "got a number!", 0]
  else
    ["Str", "got something else", 0]
  end
end;
check(42)
```

### Template Bindings Are Always Gensymed

Even simple code templates gensym their bindings. If you want a binding to keep its original name (e.g., for the caller to reference), it must come from a splice:

```dvala no-run
// This gensyms "x" — caller can't reference it
let bad = macro (ast) -> ```let x = ${ast}```;

// This keeps the caller's name — use the ast module to construct
// the binding target programmatically if needed
```

---

## Summary

| Concept | Description |
|---------|-------------|
| `macro (params) -> body` | Define an anonymous macro |
| `macro@name (params) -> body` | Define a named macro with qualified name |
| `` ```code``` `` | Code template — produces AST data |
| `` ```${expr}``` `` | Splice — insert evaluated AST into template |
| `macroexpand(m, ...args)` | Expand without evaluating |
| `prettyPrint(ast)` | AST to readable source |
| `qualifiedName(m)` | Get the qualified name (or null) |
| Hygiene | Template bindings auto-gensymed |
| `@dvala.macro.expand` | Effect emitted by named macros |
| `a \|> myMacro` | Pipe into macro (desugared at parse time) |
