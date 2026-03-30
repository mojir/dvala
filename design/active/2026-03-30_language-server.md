# Language Server (LSP)

**Status:** Draft
**Created:** 2026-03-30

## Goal

Implement a Language Server Protocol (LSP) server for Dvala, providing IDE intelligence (diagnostics, hover, go-to-definition, completions) in any LSP-capable editor — VS Code, Neovim, Emacs, Helix, Zed, JetBrains, Sublime Text, and others.

---

## Background

### LSP

LSP (Language Server Protocol) is an open standard originally from Microsoft. A single server implementation works across all supporting editors. The server runs as a standalone process; editors connect via JSON-RPC over stdio. The editor handles UI, the server handles all language intelligence.

### Current parser limitations

The current parser (`src/parser/`, ~3100 LOC, 31 files) is a recursive descent parser with precedence climbing. It throws immediately on the first syntax error with no recovery. This makes it unsuitable for LSP use — the user is always mid-typing, so the program is almost always in a broken state.

Source positions are already tracked comprehensively (every AST node has a node ID mapped to `SourceMapPosition` via `sourceMap`), which is a good foundation.

### Relationship to type system

The LSP without a type system is just a syntax error reporter — useful but limited. With Phase A (value types) and Phase B (effect rows) from the type system design, the LSP gains:
- Type error diagnostics
- Inferred types on hover
- Effect row annotations on hover

The error-recovering parser is a shared prerequisite. The typechecker layers on top.

---

## Proposal

### Architecture

```
dvala-lsp  (separate entry point, same repo)
  ├── error-recovering parser     ← rework of src/parser/
  ├── typechecker                 ← phases A + B (when built)
  ├── document store              ← in-memory per-file state
  └── LSP protocol layer          ← vscode-languageserver (npm)
       ↕ JSON-RPC / stdio
  Any LSP-capable editor
```

`vscode-languageserver` is a standalone npm package (not VS Code specific) that handles the protocol layer. The real work is the error-recovering parser and typechecker.

---

### Error-Recovering Parser

#### Tree-sitter vs extend current parser

**Tree-sitter** generates an incremental, error-recovering parser from a grammar DSL. Benefits: incremental parsing, battle-tested recovery, editor syntax highlighting grammars for free. Cost: a separate grammar file in a different DSL — two sources of truth for the language syntax.

**Extend current parser**: change sub-parsers to return `ErrorNode | T` instead of throwing. On error: record the error, consume tokens to a synchronization point, return an `ErrorNode`, continue parsing. The parser already has a position save/restore mechanism in `ParserContext` as a foundation.

**Decision: extend the current parser.** The parser is well-structured (one file per form), the source of truth stays unified, and error recovery in recursive descent is well-understood. Tree-sitter would be reconsidered if the grammar becomes significantly more complex.

#### Error recovery strategy

When a sub-parser hits an unexpected token:

1. Record the error with source position
2. Consume tokens until the nearest synchronization point:
   - `;` — top-level expression boundary
   - `end` — block/form boundary
   - `)`, `]`, `}` — grouping boundary
   - Matching delimiter of the enclosing form
3. Return an `ErrorNode` with the span of the skipped tokens
4. Continue parsing the rest of the program

The typechecker treats `ErrorNode` as `Any` with an open effect row — no cascading type errors from a single syntax error.

#### Incremental parsing

Skipped for v1. Full reparse on every document change, debounced ~200ms. Sufficient for files up to ~1000 lines. Incremental reparsing can be added later if latency becomes an issue.

---

### Document Store

The LSP maintains an in-memory store of open documents:

```typescript
interface DocumentState {
  uri: string
  version: number
  text: string
  ast: Ast | null           // null if parse failed completely
  errors: ParseError[]
  typeErrors: TypeError[]   // populated after typechecker runs
}
```

On `textDocument/didChange`: update text, schedule a reparse + recheck (debounced).

---

### LSP Features

#### Phase 1 — Diagnostics

- Syntax errors from the error-recovering parser
- Type errors from Phase A (value types: `1 + true`, arity mismatches)
- Unhandled effect errors from Phase B (effect row leaks with no handler)

All errors include source range and message. Delivered via `textDocument/publishDiagnostics`.

#### Phase 2 — Hover

- **Inferred type** at cursor — resolved from the type side-table by node ID
- **Effect row** at cursor — for functions and expressions
- **Builtin docs** — every builtin already has a `docs` property with `description`, `args`, `returns`, `examples`; surface these on hover

#### Phase 3 — Navigation

- **Go-to-definition** — follow binding references back to their `let`/parameter definition
- **Find references** — all uses of a binding

#### Phase 4 — Completions

- Scope-aware: bindings in scope at cursor position
- Builtin names with doc summaries
- Effect names (`@`) — known effects from declarations and in-scope handlers

---

### Multi-file

Dvala supports file imports. For v1: single-file only. The LSP typechecks each file in isolation. Multi-file support requires a project-level dependency graph and shared type environment across files. Deferred.

---

### Effectful Macros

Effectful macros expand at runtime — the LSP cannot run the evaluator on every keystroke. Same treatment as in the type system: unexpanded macro call sites are opaque holes (`Any`, open effect row). Diagnostics inside macro call arguments are suppressed.

Pure macros (no effects) could potentially be expanded at analysis time for better diagnostics inside macro bodies. Open question.

---

## Open Questions

1. **Tree-sitter** — if the grammar grows significantly more complex, reconsider. Tree-sitter also provides syntax highlighting grammars for editors automatically — worth the trade-off at that point?

2. **Package location** — `src/lsp/` in the same repo (simpler, shares code) or a separate npm package (cleaner boundary)? Leaning `src/lsp/` for now.

3. **Completions scope analysis** — needs to know which bindings are in scope at a given cursor position. Derived from the AST + a scope walk, or a separate dedicated pass?

4. **Pure macro expansion in LSP** — pure macros have no effects and could be expanded during analysis. Worth doing to improve diagnostics inside macro bodies?

5. **Hover for effect rows** — what's the right presentation? Show the full inferred row `<log, fetch | r>` or a simplified form?

---

## Implementation Plan

### Prerequisites
1. **Error-recovering parser** — modify sub-parsers to return `ErrorNode | T`, add synchronization logic, collect errors without throwing

### Phase 1 — Diagnostics
2. Set up `dvala-lsp` entry point, add `vscode-languageserver` dependency
3. Implement document store with debounced reparse
4. Wire parser errors → LSP diagnostics (`textDocument/publishDiagnostics`)
5. Wire type errors → LSP diagnostics (once typechecker exists)

### Phase 2 — Hover
6. Implement hover handler: resolve node at cursor position by source location, look up type side-table, format type + effect row
7. Add builtin doc lookup for hover on builtin names

### Phase 3 — Navigation
8. Build binding reference map during parsing/typechecking
9. Implement `textDocument/definition` and `textDocument/references`

### Phase 4 — Completions
10. Implement scope walk to collect in-scope bindings at cursor
11. Implement `textDocument/completion` with bindings + builtins + effect names
