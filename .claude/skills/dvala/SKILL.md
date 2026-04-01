---
name: dvala
description: Load BEFORE writing, debugging, or reasoning about Dvala language code. Provides syntax reference, AST node format, macro details, and CLI tools. ALWAYS load when the task involves Dvala code (not TypeScript).
---

# Dvala Language Reference

## CLI Tools

Use `dvala` CLI subcommands to look up documentation, run code, and inspect internals:

- `dvala run '<code>'` — execute Dvala code and print the result (also accepts `-f <file>`)
- `dvala doc <name>` — show documentation for a function, expression, effect, shorthand, or datatype
- `dvala list` — list core functions and special expressions
- `dvala list <module>` — list functions in a module
- `dvala list --modules` — list all available modules
- `dvala list --datatypes` — list all datatypes
- `dvala tokenize '<code>' [--debug]` — tokenize source to JSON (also accepts `-f <file>`)
- `dvala parse '<code>' [--debug]` — parse source to AST JSON (also accepts `-f <file>`)
- `dvala examples` — show example programs

Before suggesting Dvala code to the user, verify it works by running it with `dvala run`.

## Expressions & Blocks

- Statements are separated by `;`. The last expression's value is the result.
- **`do...end`** block: `do let x = 1; x + 1 end` — always needs explicit `end`.
- **`if/else if`** chains need only one `end`: `if A then B else if C then D else E end`.
- If without else returns `null` when the condition is false.

## Let Bindings

```dvala
let x = 42;
let [a, b, ...rest] = [1, 2, 3, 4];        // array destructuring + rest
let [a = 0, b = 99] = [7];                  // defaults
let { name, age } = person;                  // object destructuring
let { name as n } = person;                  // alias (NOT colon — use `as`)
let { user: { name, tags: [first] } } = d;  // nested
let { ...rest } = obj;                       // object rest
```

Object shorthand `{ x }` works — equivalent to `{ x: x }`.
Builtin names (e.g. `sin`, `count`) need explicit `key: value` in object literals (they're not identifiers, so shorthand doesn't apply).

## Functions

```dvala
let f = (a, b) -> a + b;          // basic lambda
let g = () -> 42;                  // no params
let h = -> $ + 1;                  // shorthand ($ = first arg, $2 = second, etc.)
let i = -> $ + $2;                 // shorthand two args
let j = (a, b = 10) -> a + b;     // default parameter
let k = (first, ...rest) -> rest;  // rest parameter
let l = (n) -> do                  // body block
  let x = n * 2;
  x + 1
end;
```

- `self` refers to the current function (anonymous recursion).
- Partial application: `+(_, 10)` creates a function that adds 10.
- Higher-order: `map`, `filter`, `reduce`, `sort`, `some`, `apply`, `comp`, `constantly`, `identity`.
- Meta: `arity(fn)` returns `{ min, max }`, `doc(fn)` returns docstring, `fn withDoc "..."`.

## Loop & Recur

```dvala
loop (i = 0, acc = 0) ->
  if i >= 10 then acc
  else recur(i + 1, acc + i)
  end
```

**`loop` has no `end`** — the body is a single expression. Use `do...end` for multi-statement bodies.

## For Comprehension

```dvala
for (x in [1, 2, 3]) -> x * 2
for (x in range(10) let sq = x ^ 2 when isOdd(x) while sq < 100) -> sq
for (x in [1, 2], y in [10, 20]) -> x + y   // nested
```

Clauses after the collection: `let` (local binding), `when` (filter), `while` (stop condition).

## Match

```dvala
match value
  case 0 then "zero"                         // literal
  case x when x < 0 then "negative"          // guard
  case { x, y } then `(${x}, ${y})`          // object destructuring
  case [a, b] then "pair"                     // array destructuring
  case _ then "other"                         // wildcard
end
```

## Effects & Handlers

```dvala
perform(@dvala.io.print, "hello");            // invoke effect
let v = perform(@dvala.io.pick, [1, 2, 3]);   // effect with return value

// handler...end creates a first-class handler value
let h = handler
  @my.eff(x) -> resume(x * 2)     // resume = continue body
  @dvala.error(msg) -> "caught"    // no resume = abort
transform
  x -> { ok: true, data: x }      // optional, transforms normal completion
end;

// with h; installs handler for rest of block
do
  with h;
  perform(@my.eff, 21)
end

// h(-> body) installs handler around thunk
h(-> perform(@my.eff, 21))

// effectHandler module
let { fallback, retry } = import("effectHandler");
do with fallback(0); 0 / 0 end              // catch errors (aborts with 0)
retry(3, -> dangerousOperation())            // retry up to 3 times
```

## Operators

Arithmetic: `+`, `-`, `*`, `/`, `^` (power), `%` (remainder), `mod`
Comparison: `==`, `!=`, `<`, `>`, `<=`, `>=`
Logical: `&&`, `||`, `not(x)`
Nullish: `??` (first non-null)
Bitwise: `&`, `|`, `xor`, `<<`, `>>`, `>>>`
Concat: `++` (strings and arrays)
Pipe: `|>` (value pipe)
Unary: `-x` (negation)

## Import

```dvala
let { sin, cos } = import("math");
let m = import("collection");
m.frequencies([1, 1, 2])
```

## Identifiers

- **JS-style only**: letters, digits, `_`, `$`. No hyphens, `?`, or `!`. Use camelCase.
- **Reserved keywords**: `next`, `in`, `true`, `false`, `null`, `end`, `then`, `else`, `case`, `when`, `while`, `do`, `let`, `fn` — cannot be used as variable names.
- **Built-in names can be shadowed**: `let take = take([1, 2, 3], 2)` works.

## Misc

- Regexp shorthand: `#"pattern"` (creates a regexp, e.g. `"abc" reMatch #"\d+"`)
- Template strings: `` `hello ${expr}` ``
- Spread in arrays: `[...arr, 4]` / objects: `{ ...obj, key: val }`
- Comments: `// single line` or `/* multi line */`

## Macros

```dvala
let id = macro (ast) -> ast;     // anonymous macro — returns AST unchanged
id(1 + 2)                         // → 3 (AST of `1 + 2` returned, then evaluated)

let m = macro@mylib.id (ast) -> ast;  // named macro with qualified name
qualifiedName(m)                       // → "mylib.id"
```

- `macro (params) -> body` — anonymous macro. Same syntax as functions but with `macro` keyword.
- `macro@qualified.name (params) -> body` — named macro with a qualified name for host-level dispatch. The `@` must be attached to `macro` with no space.
- When a macro is called, arguments are **NOT evaluated** — they're passed as AST nodes (arrays).
- The macro body executes normally. It receives AST data and must return AST data.
- The returned AST is then evaluated in the **calling scope**.
- Named macros emit `@dvala.macro.expand` — the host can intercept. Anonymous macros are called directly.
- `typeOf(m)` → `"macro"`, `isMacro(m)` → `true`, `isFunction(m)` → `false`.
- `qualifiedName(m)` → `"mylib.id"` (named) or `null` (anonymous). Also works on effects: `qualifiedName(@dvala.io.print)` → `"dvala.io.print"`.

### Quote Blocks (`quote...end`)

`quote...end` creates AST data at parse time. `$^{expr}` splices evaluated values into the AST.

```dvala
// Simple — returns AST for `42` → ["Num", 42, 0]
quote 42 end

// With splicing — insert evaluated AST nodes
let a = ["Num", 1, 0];
quote $^{a} + $^{a} end  // → ["Call", [["Builtin", "+", 0], [["Num", 1, 0], ["Num", 1, 0]]], 0]

// Macro using quote
let double = macro (ast) -> quote $^{ast} + $^{ast} end;
double(21)                // → 42
```

- Content is parsed as Dvala code at parse time — no runtime parsing
- `$^{expr}` evaluates `expr` at runtime and inserts the result (must be valid AST data)
- `$^^{expr}` escapes two levels (for macro-generating macros)
- Multi-statement templates produce an array of AST nodes
- Node IDs in generated AST are always 0

### AST Node Format (what macros receive and return)

Every AST node is a 3-tuple: `[type, payload, nodeId]`. The `type` is a string tag, `payload` varies by type, `nodeId` is an integer (use `0` for generated nodes).

**Value nodes:**
```
["Num", 42, 0]          // number literal
["Str", "hello", 0]     // string literal
["Bool", true, 0]       // boolean
["Null", 0]             // null (2-tuple exception)
```

**Identifier nodes:**
```
["Sym", "x", 0]         // variable reference
["Builtin", "+", 0]     // built-in function
["Effect", "dvala.io.print", 0]  // effect reference
```

**Call (function application):**
```
["Call", [fnNode, [argNodes...]], 0]
// Example: f(x, 1) →
["Call", [["Sym", "f", 0], [["Sym", "x", 0], ["Num", 1, 0]]], 0]
```

**Key special expressions:**
```
["If", [cond, then, else], 0]
["Let", [bindingTarget, valueNode], 0]
["Block", [stmt1, stmt2, ...], 0]
["Function", [[params], [bodyExprs]], 0]
["Perform", [effectExpr, payloadExpr], 0]
["Handle", [[bodyExprs], handlersExpr], 0]
["Array", [elements...], 0]
["Object", [entries...], 0]       // entries are [key, val] pairs or SpreadNodes
["Recur", [args...], 0]
["Macro", [[params], [bodyExprs]], 0]
```

**Operators (also Call nodes):** `x + 1` → `["Call", [["Builtin", "+", 0], [["Sym", "x", 0], ["Num", 1, 0]]], 0]`

### Writing Macros — Key Patterns

**Identity macro** (pass-through):
```dvala
let id = macro (ast) -> ast;
id(let x = 42);  // equivalent to: let x = 42
```

**Constructing AST manually:**
```dvala
let always42 = macro (ast) -> ["Num", 42, 0];
always42(anything)  // → 42, ignores the argument
```

**Inspecting AST structure in macro body:**
```dvala
let debug = macro (ast) -> do
  perform(@dvala.io.print, str(ast));  // print the AST
  ast                                    // return it unchanged
end;
```

### Implementation Architecture

- Parser: `src/parser/subParsers/parseMacro.ts` — parses `macro` keyword
- Node type: `NodeTypes.Macro` in `src/constants/constants.ts`
- Function type: `MacroFunction` in `src/parser/types.ts` (functionType: `'Macro'`)
- Evaluator: `case NodeTypes.Macro:` in `stepNode()` creates `MacroFunction` value
- Macro call: detected in `stepNormalExpression()` — skips arg evaluation, passes AST
- `MacroEvalFrame` in `src/evaluator/frames.ts` — evaluates returned AST in calling scope
- Type guards: `isMacroFunction()` in `src/typeGuards/dvalaFunction.ts`
- Predicates: `isMacro` in `src/builtin/core/predicates.ts`, `typeOf` updated in `src/builtin/core/misc.ts`
- Tests: `__tests__/macro.test.ts`
- Code templates: `src/tokenizer/tokenizers.ts` (`tokenizeCodeTemplate`), `src/parser/subParsers/parseCodeTemplate.ts`
- Node types: `CodeTmpl` (template), `Splice` (interpolation marker) in `src/constants/constants.ts`
- `CodeTemplateBuildFrame` in `src/evaluator/frames.ts` — evaluates splice expressions sequentially
- `astToData()` in trampoline evaluator — converts pre-parsed AST to Dvala data, replacing Splice nodes
- Tests: `__tests__/code-template.test.ts`

### Gotchas When Working on Macros

- Macro args are AST nodes (arrays). In Dvala, arrays are truthy, so `typeOf(ast)` → `"array"`.
- Don't confuse the macro's body execution (normal eval) with the returned AST (evaluated after).
- `parseLambdaFunction` rejects `(singleParam) ->` pattern — that's why `parseMacro` uses `parseFunctionArguments` directly.
- Variable names in tests must not shadow builtins (e.g., don't use `first` as a macro name — it's a builtin).
- Macros only intercept **named calls** to user-defined or builtin symbols. Expression-based callees (`(myMacro)(x)`) go through normal evaluation — the macro check happens in `stepNormalExpression` for `UserDefinedSymbol` and `BuiltinSymbol` names only. This means you can shadow a builtin (e.g. `let assert = macro ...`) and it will work correctly as a macro.
- Named macros emit `@dvala.macro.expand` — anonymous macros are called directly with no effect overhead.
- Quote `$^{expr}` works in both **expression and binding positions** — e.g., `quote let $^{pattern} = $^{value} end` where `pattern` can be a Sym, Array, or Object AST node (destructuring patterns are auto-converted to binding targets).
- **Nested quotes** for macro-generating macros: `$^^{expr}` escapes two quote levels, `$^^^{expr}` three levels. The `^` count tells you how many levels you're escaping.

### `macroexpand` and the `ast` Module

`macroexpand(macroFn, ...astArgs)` calls a macro's body and returns the expanded AST as data, without evaluating it. Pass AST arguments using quote blocks:

```dvala
let { prettyPrint } = import("ast");
let double = macro (ast) -> quote $^{ast} + $^{ast} end;
macroexpand(double, quote 21 end) |> prettyPrint   // → "21 + 21"
```

The `ast` module (`import("ast")`) provides constructors (`num`, `strNode`, `sym`, `builtin`, `effectNode`, `call`, `ifNode`, `block`), predicates (`isNum`, `isStr`, `isSym`, `isCall`, `isLet`, `isFn`, etc.), accessors (`nodeType`, `payload`), and `prettyPrint`.

Note: some names are suffixed to avoid clashing with core builtins: `strNode` (vs `str`), `effectNode` (vs `effect`), `isEffectNode` (vs `isEffect`).
