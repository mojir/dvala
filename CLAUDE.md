## Key Commands

- `npm run check` — full pipeline: lint + typecheck + test + build
- `npm run test` — run tests only
- `npm run build` — build all bundles

Run `npm run check` after any medium or larger code change.

## Project Structure

- Entry: `src/index.ts` (minimal), `src/full.ts` (full with all modules)
- Built-ins: `src/builtin/core/` (normal expressions), `src/builtin/specialExpressions/`
- Modules: `src/builtin/modules/<name>/`
- Reference data: `reference/index.ts` (derived from co-located docs)
- Tests: `__tests__/` (integration), `src/**/*.test.ts` (unit)

## TS Coding Conventions

- Do not shadow variables
- Imports must be sorted alphabetically
- `it()` descriptions must begin with lowercase
- No side-effect imports for module registration
- Every built-in function needs a `docs` property with `category`, `description`, `returns`, `args`, `variants`, `examples`
- Always add descriptive comments in code — explain the *why*, not just the *what*

## Demo Convention

For user-facing features, include **demo blocks** in the commit message. These serve as an interactive changelog — `npm run demo [ref]` extracts them and generates playground URLs.

### Commit message format

Use a `---` separator after the description, then markdown with ` ```demo ` fenced blocks:

````
feat: implement feature X

Description of the change.

---

```demo
description: short description of what the demo shows
code:
let x = 42;
x + 1
```
````

Multiple demos per commit are fine. For demos needing context (bindings):

````
```demo
description: macro with custom handler
context:
let myHandler = (arg, eff, nxt) -> nxt(eff, arg)
code:
handle perform(@my.eff, 10) with [myHandler] end
```
````

### Generating playground links

```bash
npm run demo          # from HEAD
npm run demo HEAD~3   # from specific ref
npm run demo abc123   # from hash
```

### Before committing

Always show the user a playground demo link before committing. Generate it with:

```bash
node -e "const code = 'let x = 42; x + 1'; console.log('http://localhost:9901/?state=' + btoa(encodeURIComponent(JSON.stringify({'dvala-code': code}))))"
```

The playground runs on `http://localhost:9901/` (start with `npm run dev`).

## Creating design documents and plans
I encurage you to structurize bigger tasks by creating .md plans.
Create .md files inside /design

Prefix all design document filenames with the creation date in ISO format: `YYYY-MM-DD_<name>.md` (e.g. `2026-01-02_my-design.md`).

## Dvala Language Reference

### Expressions & Blocks

- Statements are separated by `;`. The last expression's value is the result.
- **`do...end`** block: `do let x = 1; x + 1 end` — always needs explicit `end`.
- **`if/else if`** chains need only one `end`: `if A then B else if C then D else E end`.
- If without else returns `null` when the condition is false.

### Let Bindings

```dvala
let x = 42;
let [a, b, ...rest] = [1, 2, 3, 4];        // array destructuring + rest
let [a = 0, b = 99] = [7];                  // defaults
let { name, age } = person;                  // object destructuring
let { name as n } = person;                  // alias (NOT colon — use `as`)
let { user: { name, tags: [first] } } = d;  // nested
let { ...rest } = obj;                       // object rest
```

**Gotcha**: Object shorthand `{ x }` does NOT work in object literals. Always use `{ x: x }`.
Builtin names (e.g. `sin`, `count`) need explicit `key: value` in object literals.

### Functions

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

### Loop & Recur

```dvala
loop (i = 0, acc = 0) ->
  if i >= 10 then acc
  else recur(i + 1, acc + i)
  end
```

**`loop` has no `end`** — the body is a single expression. Use `do...end` for multi-statement bodies.

### For Comprehension

```dvala
for (x in [1, 2, 3]) -> x * 2
for (x in range(10) let sq = x ^ 2 when isOdd(x) while sq < 100) -> sq
for (x in [1, 2], y in [10, 20]) -> x + y   // nested
```

Clauses after the collection: `let` (local binding), `when` (filter), `while` (stop condition).

### Match

```dvala
match value
  case 0 then "zero"                         // literal
  case x when x < 0 then "negative"          // guard
  case { x, y } then `(${x}, ${y})`          // object destructuring
  case [a, b] then "pair"                     // array destructuring
  case _ then "other"                         // wildcard
end
```

### Effects & Handlers

```dvala
perform(@dvala.io.print, "hello");            // invoke effect
let v = perform(@dvala.io.pick, [1, 2, 3]);   // effect with return value

// handle...with block
handle
  perform(@my.eff, arg)
with @my.eff(x) -> x * 2 end

// effect pipe (shorthand for handle...with)
perform(@dvala.io.pick, choices) ||> fallback(0)

// handler module
let { fallback, retry } = import(effectHandler);
(0 / 0) ||> fallback(0)                       // catch errors
perform(@eff, x) ||> [retry(2), fallback(0)]   // handler chain
```

### Operators

Arithmetic: `+`, `-`, `*`, `/`, `^` (power), `%` (remainder), `mod`
Comparison: `==`, `!=`, `<`, `>`, `<=`, `>=`
Logical: `&&`, `||`, `not(x)`
Nullish: `??` (first non-null)
Bitwise: `&`, `|`, `xor`, `<<`, `>>`, `>>>`
Concat: `++` (strings and arrays)
Pipe: `|>` (value pipe), `||>` (effect pipe)
Unary: `-x` (negation)

### Import

```dvala
let { sin, cos } = import(math);
let m = import(collection);
m.frequencies([1, 1, 2])
```

### Identifiers

- **JS-style only**: letters, digits, `_`, `$`. No hyphens, `?`, or `!`. Use camelCase.
- **Reserved keywords**: `next`, `in`, `true`, `false`, `null`, `end`, `then`, `else`, `case`, `when`, `while`, `do`, `let`, `fn` — cannot be used as variable names.
- **Built-in names can be shadowed**: `let take = take([1, 2, 3], 2)` works.

### Misc

- Regexp shorthand: `#"pattern"` (creates a regexp, e.g. `"abc" reMatch #"\d+"`)
- Template strings: `` `hello ${expr}` ``
- Spread in arrays: `[...arr, 4]` / objects: `{ ...obj, key: val }`
- Comments: `// single line` or `/* multi line */`

### Macros

```dvala
let id = macro (ast) -> ast;     // identity macro — returns AST unchanged
id(1 + 2)                         // → 3 (AST of `1 + 2` returned, then evaluated)
```

- `macro (params) -> body` — defines a macro. Same syntax as functions but with `macro` keyword.
- When a macro is called, arguments are **NOT evaluated** — they're passed as AST nodes (arrays).
- The macro body executes normally. It receives AST data and must return AST data.
- The returned AST is then evaluated in the **calling scope**.
- `typeOf(m)` → `"macro"`, `isMacro(m)` → `true`, `isFunction(m)` → `false`.

#### AST Node Format (what macros receive and return)

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

#### Writing Macros — Key Patterns

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

#### Implementation Architecture

- Parser: `src/parser/subParsers/parseMacro.ts` — parses `macro` keyword
- Node type: `NodeTypes.Macro` in `src/constants/constants.ts`
- Function type: `MacroFunction` in `src/parser/types.ts` (functionType: `'Macro'`)
- Evaluator: `case NodeTypes.Macro:` in `stepNode()` creates `MacroFunction` value
- Macro call: detected in `stepNormalExpression()` — skips arg evaluation, passes AST
- `MacroEvalFrame` in `src/evaluator/frames.ts` — evaluates returned AST in calling scope
- Type guards: `isMacroFunction()` in `src/typeGuards/dvalaFunction.ts`
- Predicates: `isMacro` in `src/builtin/core/predicates.ts`, `typeOf` updated in `src/builtin/core/misc.ts`
- Tests: `__tests__/macro.test.ts`

#### Gotchas When Working on Macros

- Macro args are AST nodes (arrays). In Dvala, arrays are truthy, so `typeOf(ast)` → `"array"`.
- Don't confuse the macro's body execution (normal eval) with the returned AST (evaluated after).
- `parseLambdaFunction` rejects `(singleParam) ->` pattern — that's why `parseMacro` uses `parseFunctionArguments` directly.
- Variable names in tests must not shadow builtins (e.g., don't use `first` as a macro name — it's a builtin).
- Macros only intercept **named calls** to user-defined symbols. Expression-based callees (`(myMacro)(x)`) go through normal evaluation — the macro check happens in `stepNormalExpression` for `UserDefinedSymbol` names only.
- The `@macro.expand` effect from the design doc is NOT yet implemented — currently macros are called directly.

## MCP Tools

When working with Dvala code or answering questions about the language, use the MCP tools rather than reading source files:

### Reference & documentation
- `mcp__dvala__listModules` — list all modules
- `mcp__dvala__listModuleExpressions` — list functions in a module
- `mcp__dvala__listCoreExpressions` — list core built-in functions
- `mcp__dvala__getDoc` — get documentation for a function or special expression
- `mcp__dvala__getExamples` — get example programs
- `mcp__dvala__listDatatypes` — list datatypes

### Execution
- `mcp__dvala__runCode` — execute Dvala code
- `mcp__dvala__runCodeDebug` — execute Dvala code with debug mode (source positions in error messages)

### Tokenizer & parser
- `mcp__dvala__tokenizeCode` — tokenize source into a JSON token stream
- `mcp__dvala__tokenizeCodeDebug` — tokenize with debug source positions
- `mcp__dvala__parseCode` — tokenize + parse in one step, returns AST as JSON
- `mcp__dvala__parseCodeDebug` — tokenize + parse with debug source positions
- `mcp__dvala__parseTokenStream` — parse a JSON token stream (from `tokenizeCode`) into an AST
- `mcp__dvala__parseTokenStreamDebug` — parse a debug token stream (from `tokenizeCodeDebug`) into an AST

Each `*Debug` variant enables debug mode which captures source positions in tokens/AST nodes, producing richer error messages at the cost of larger output.

`parseTokenStream` / `parseTokenStreamDebug` expect the full `{ tokens, hasDebugData }` object returned by the tokenizer — not just the `tokens` array.

Before suggesting Dvala code to the user, verify it works by running it with `mcp__dvala__runCode`.
