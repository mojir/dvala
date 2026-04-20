# Language Service — Next Features

**Status:** Ready to implement (refreshed 2026-04-20)
**Created:** 2026-04-02

## Goal

Continue building out the Dvala language service with features that build on the existing symbol table, workspace index, and scope tracking infrastructure.

## First milestone

Start with **cross-file rename**. It's the smallest self-contained feature, builds directly on existing `findAllOccurrences`, and has the highest user-value-per-effort ratio. After it lands, pick the next item off the "Suggested Order" section based on how much time is available.

Second milestone options (any order):
- **Semantic tokens** — visual polish; lets the editor distinguish functions from variables from macros using the symbol table's kind info rather than the text-grammar heuristic.
- **Inlay hints** — good complement to signature help.

The heavier items (code actions, call hierarchy) should wait until after the lighter three ship, because they need more plumbing and the lighter three may surface issues with the symbol table that affect design choices there.

---

## Completed (see archived docs)

- Statement-level error recovery, token-scanned fallback
- Symbol table builder with scope ranges, param extraction
- Workspace index with cross-file import graph
- Go to Definition (symbols, imports, cross-file)
- Find References, Rename Symbol (per-file)
- Document Symbols / Outline
- Real-time diagnostics (parse errors + unresolved symbols)
- Context-aware completions (scope-aware)
- Signature help (builtins + user functions)
- Workspace symbols (Cmd+T)

---

## Remaining Features

### 1. Cross-file Rename

**Goal:** Renaming an exported symbol updates all importing files.

**Challenge:** Shorthand objects. Renaming `pi` in `{ pi }` must update:
- The definition site (`let pi = ...`)
- All `Sym` references in the defining file
- The export object key (`{ pi }` → `{ tau }` or `{ pi: tau }`)
- Import destructuring keys in all importing files (`let { pi } = import(...)`)
- The destructured binding names + their references in importing files

**Approach:**
- Extend `findAllOccurrences` to include export object keys and import destructuring keys
- Track the relationship between export keys and import destructuring keys in `FileSymbols`
- Handle shorthand vs explicit key:value — renaming should preserve shorthand when key and value match

**Effort:** Medium

### 2. Semantic Tokens

**Goal:** Fine-grained syntax coloring that distinguishes functions, variables, macros, parameters, imports, handlers — more accurate than the TextMate grammar.

**Approach:**
- Register a `DocumentSemanticTokensProvider`
- Walk the symbol table's definitions and references
- Map `SymbolDef.kind` → semantic token types (`variable`, `function`, `macro`, `parameter`, etc.)
- Mark definition sites and reference sites with their resolved kind

**Token types to support:**
| Kind | Token Type | Modifiers |
|---|---|---|
| variable | `variable` | `declaration` on def site |
| function | `function` | `declaration` on def site |
| macro | `macro` | `declaration` on def site |
| handler | `variable` | `declaration` on def site |
| parameter | `parameter` | `declaration` on def site |
| import | `namespace` | `declaration` on def site |

**Effort:** Medium

### 3. Inlay Hints

**Goal:** Show parameter names at call sites: `add(/*a:*/ 1, /*b:*/ 2)`.

**Approach:**
- Register an `InlayHintsProvider`
- Find all `Call` nodes in the AST where the callee resolves to a function with known `params`
- For each argument, insert an inlay hint with the parameter name
- Skip when the argument is already a named variable matching the parameter name (avoid `add(a, b)` showing hints)
- Support builtins too (parameter names from `reference/index.ts`)

**Effort:** Medium

### 4. Code Actions (Refactorings)

**Goal:** Quick-fix and refactoring actions via Cmd+.

**Actions:**
1. **Extract variable** — select expression → `let <name> = <expr>` inserted before current statement
2. **Inline variable** — cursor on `let x = <expr>` → replace all references with `<expr>`, remove binding
3. **Extract function** — select block → `let <name> = (<free vars>) -> do <selected> end` with free variable analysis from scope ranges

**Approach:**
- Register a `CodeActionProvider`
- Use `getSymbolsInScope` to find free variables in selections
- Use `findAllOccurrences` for inline variable

**Effort:** High

### 5. Selection Range

**Goal:** Alt+Shift+Arrow to expand/shrink selection by semantic units (expression → statement → block → file).

**Approach:**
- Register a `SelectionRangeProvider`
- Use AST node ranges from the source map to build a hierarchy of selection ranges
- Each position maps to a chain: innermost expression → enclosing expression → statement → block → file

**Effort:** Medium

### 6. Call Hierarchy

**Goal:** View callers/callees for a function (Shift+Alt+H).

**Approach:**
- Register a `CallHierarchyProvider`
- For each `Call` node in the symbol table, record: which function scope contains the call, and what function is being called
- "Incoming calls" = which functions have a Call node that resolves to this function
- "Outgoing calls" = which Call nodes exist inside this function's scope range
- Requires extending the symbol table builder to track `CallSite` records: `{ callerDef: SymbolDef, calleeName: string, location }`

**Effort:** High

---

## Suggested Order

1. **Cross-file rename** — low-hanging fruit, high user value, builds on existing `findAllOccurrences`
2. **Semantic tokens** — visual polish, straightforward mapping from symbol table
3. **Inlay hints** — nice complement to signature help
4. **Code actions** — highest effort but biggest productivity boost
5. **Selection range** — quality-of-life, moderate effort
6. **Call hierarchy** — most complex, needs call graph tracking
