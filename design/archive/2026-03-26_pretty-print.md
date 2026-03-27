# Pretty Print — Smart AST Formatter

## Status: Planning

## Problem

`prettyPrint` in the `ast` module is incomplete and has structural limitations:

1. **Missing node types** — only covers ~12 of 28 node types
2. **No line wrapping** — always produces single-line output
3. **Not smart** — doesn't choose idiomatic syntax (e.g. `f(x)` vs `x |> f`, `get(obj, "k")` vs `obj.k`)
4. **Single consumer** — only available as a Dvala function, but needed in TS (playground, tooling)

## Use Cases

| Consumer | Context | Needs |
|----------|---------|-------|
| Dvala code | `macroexpand(m, ...) \|> prettyPrint` | In-language AST inspection |
| Playground | AST panel, hover tooltips | TS-level function |
| Tooling | Future formatter, macro debugging | Shared TS implementation |

## Non-goals

- **Source formatter with comment preservation** — comments are stripped by the tokenizer and don't exist in the AST. A `dvala fmt` tool would need to work at the token level, which is a separate project.
- **Round-trip fidelity** — prettyPrint produces *idiomatic* output, not the original source. It's a smart formatter, not a reconstructor.

## Design Decisions

### Formatting: opinionated, one mode

- **Max width: 80** — hard limit for breakable constructs (blocks, args, arrays, if/else), soft limit for atoms (long strings, identifiers that can't break further)
- **Indent: 2 spaces** — no tabs, no configuration
- No config knobs. One style for all Dvala code.

### Smart formatting: idiomatic output

PrettyPrint chooses the *best* representation for the AST it sees, regardless of how it was constructed (by parser, macro, or manual construction).

| AST pattern | Emit as | Condition |
|------------|---------|-----------|
| `["Call", [f, [x]]]` nested single-arg | `x \|> g \|> f` | Chain of 2+ single-arg calls, callee is symbol/builtin |
| `["Call", [get, [obj, ["Str", "k"]]]]` | `obj.k` | `get` builtin with string literal key |
| `["Handle", [[expr], handler]]` | `expr \|\|> handler` | Single body expression |
| `["Call", ["-", [["Num", 0], x]]]` | `-x` | Subtraction with literal 0 as first arg |
| `["Block", [single]]` | unwrap inner | Single-statement block |
| `["Call", [op, [a, b]]]` | `a op b` | Known infix operator (already done) |

## Completeness

**Handled today:**
Num, Str, Reserved, Sym, Builtin, Effect, Call (with infix), If, Block, Let, Function, Perform, Array

**Missing:**
- `And` (&&), `Or` (||), `Qq` (??) — short-circuit operators
- `Object` — object literals `{ key: value }`
- `Spread` — `...expr` in arrays/objects
- `TmplStr` — template strings `` `hello ${expr}` ``
- `Recur` — `recur(args...)`
- `Handle` — `handle ... with ... end` / `||>` shorthand
- `Loop` — `loop (bindings) -> body`
- `For` — `for (x in coll) -> expr`
- `Match` — `match ... case ... end`
- `Import` — `import(module)`
- `Macro` — `macro (params) -> body` / `macro@name (params) -> body`
- `CodeTmpl` / `Splice` — code templates (emit as `<CodeTmpl>` fallback is fine)
- `Parallel` / `Race` — `parallel(...)` / `race(...)`
- `Binding` targets — `object`, `array`, `literal`, `wildcard` destructuring

## Architecture

The prettyPrint implementation is a **TS function** that the Dvala builtin wraps:

```
src/prettyPrint.ts          ← core TS implementation
src/builtin/modules/ast/    ← Dvala wrapper calls the TS function
playground-www/              ← imports TS function directly
```

## Implementation Plan

### Step 1 — Extract to shared TS module
Move prettyPrint from the ast module to `src/prettyPrint.ts`. The ast module wraps it.

### Step 2 — Complete node coverage (single-line)
Add all missing node types. Keep single-line output. This unblocks all use cases with basic formatting.

### Step 3 — Smart rewrites
Add heuristic detection for idiomatic patterns: pipe chains, dot access, effect pipe shorthand, unary minus.

### Step 4 — Line wrapping
80-column width-aware formatting. Two-pass approach:
1. Try to fit on one line
2. If too wide, break at natural points (`;` in blocks, `,` in args/arrays, branches in if/else)

Hard limit for breakable constructs, soft limit for atoms.

### Step 5 — Playground integration
Import the TS function in the playground for AST inspector display.
