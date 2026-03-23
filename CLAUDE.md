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

## Dvala Syntax Notes

- **`if/else if` chains need only one `end`**: `if A then B else if C then D else E end` — the entire chain is closed by a single `end`.
- **`loop` has no `end`**: the body is a single expression; the loop is terminated by its body expression's own `end` (or by the enclosing `do...end` block). Never add a bare `end` for the loop itself.
- **`do...end` always needs explicit `end`**: `do let x = 1; x + 1 end`.
- **Unary minus works**: `-x`, `-3`, `-PI` are all valid. But `-(a, b)` is a prefix function call (subtraction).
- **JS-style identifiers only**: letters, digits, `_`, `$`. No hyphens, `?`, or `!`. Use camelCase: `isArray`, `dropWhile`, `mergeWith`.
- **Reserved keywords**: `next`, `in` (and others) cannot be used as variable names — use e.g. `nxt`, `inArr`.
- **Built-in names can be shadowed**: `let take = take([1, 2, 3], 2)` works — the RHS resolves in the outer scope before the binding takes effect.

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
