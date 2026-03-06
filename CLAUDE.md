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

## Coding Conventions

- Imports must be sorted alphabetically
- `it()` descriptions must begin with lowercase
- No side-effect imports for module registration
- Every built-in function needs a `docs` property with `category`, `description`, `returns`, `args`, `variants`, `examples`

## MCP Tools

When working with Dvala code or answering questions about the language, use the MCP tools rather than reading source files:

- `mcp__dvala__listModules` — list all modules
- `mcp__dvala__listModuleExpressions` — list functions in a module
- `mcp__dvala__listCoreExpressions` — list core built-in functions
- `mcp__dvala__getDoc` — get documentation for a function or special expression
- `mcp__dvala__runCode` — execute Dvala code
- `mcp__dvala__getExamples` — get example programs
- `mcp__dvala__listDatatypes` — list datatypes

Before suggesting Dvala code to the user, verify it works by running it with `mcp__dvala__runCode`.
