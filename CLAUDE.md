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
