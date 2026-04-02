# Dvala Language Service

**Status:** Draft
**Created:** 2026-04-02

## Goal

Add IDE-quality language features to the Dvala VSCode extension: Go to Definition for user-defined symbols, Find References, Rename, Document Symbols (outline), real-time diagnostics, and richer completions. Build this incrementally on top of existing infrastructure.

---

## Background

### What exists today

| Feature | Status | Implementation |
|---|---|---|
| Hover (builtins) | ✅ Done | `HoverProvider` using `reference/index.ts` data |
| Completion (builtins) | ✅ Done | `CompletionItemProvider` from reference + snippets |
| Go to Definition (imports) | ✅ Done | `DefinitionProvider` resolving `import("./path")` |
| Go to Definition (debug vars) | ✅ Done | Custom DAP request + AST binding map |
| Diagnostics | ❌ None | Only runtime errors shown after execution |
| Go to Definition (symbols) | ❌ None | No symbol → definition mapping |
| Find References | ❌ None | No reference tracking |
| Rename Symbol | ❌ None | No symbol identity tracking |
| Document Symbols / Outline | ❌ None | No top-level symbol extraction |
| Signature Help | ❌ None | No parameter-level tracking |

### Reusable infrastructure

- **Parser** (`src/parser/`) — hand-written recursive descent, full AST with unique node IDs and source map positions. No incremental parsing or error recovery. 72 throw sites across 20 sub-parser files.
- **`getUndefinedSymbols()`** (`src/getUndefinedSymbols/`) — static AST walk that resolves symbols against a ContextStack. Already scope-aware (blocks, handlers, closures). Returns `Set<string>` of unresolved names.
- **`AutoCompleter`** (`src/AutoCompleter/`) — tokenizer-based, returns symbol suggestions by prefix/substring matching. Not AST-aware.
- **Bundler import resolution** (`src/bundler/`) — `resolveWithExtension()` resolves relative paths with `.dvala` fallback, detects circular deps.
- **`ContextStack`** (`src/evaluator/ContextStack.ts`) — runtime scope chain with `lookUp()`, `lookUpByName()`. Could be used statically.
- **Reference data** (`reference/index.ts`) — rich metadata for all builtins: descriptions, argument types, variants, examples.
- **Error classes** (`src/errors.ts`) — all carry `SourceCodeInfo { position: { line, column }, code, filePath }`.

### What's missing

- **Symbol table**: no index of where symbols are defined (name → location).
- **Reference tracking**: no record of where symbols are used.
- **Cross-file index**: no workspace-level symbol graph.
- **Error recovery**: parser stops at first error — no partial AST for broken files.

---

## Proposal

### Architecture: hybrid analysis with statement-level error recovery

Two layers work together so the language service stays useful even when the file doesn't compile:

1. **Token-level extraction** (always works) — scan the token stream for `let <name>` patterns to extract top-level definitions. This gives completions and basic Go to Definition even in broken files.

2. **AST-level analysis** (when parse succeeds) — full symbol table with scope-aware reference resolution, diagnostics, and cross-file indexing.

When the parser fails, the **last successful AST is cached** per file. The token-level definitions are always fresh.

```
Editor change → Tokenize (always succeeds)
                  ├─→ Token scan → top-level definitions (always available)
                  └─→ Parse (may fail)
                        ├─ success → Build SymbolTable → Update WorkspaceIndex
                        └─ failure → Keep last-good SymbolTable, report parse error as diagnostic
```

### Statement-level error recovery in parser

Add a try/catch in the top-level parse loop (`src/parser/index.ts`, lines 22-31) to recover from errors within individual statements:

```typescript
while (!ctx.isAtEnd()) {
  const posBeforeStatement = ctx.getPosition()
  try {
    nodes.push(parseExpression(ctx, 0))
    if (isOperatorToken(ctx.tryPeek(), ';')) {
      ctx.advance()
    } else if (!ctx.isAtEnd()) {
      throw new ParseError('Expected ;', ctx.peekSourceCodeInfo())
    }
  } catch (e) {
    errors.push(e)
    // Skip to next semicolon to recover
    skipToNextSemicolon(ctx)
  }
}
```

**Scope:** ~30-40 lines in one file (`src/parser/index.ts`), plus a `skipToNextSemicolon` helper.

**Edge cases to handle:**
- Token cursor is at an arbitrary position after a failed `parseExpression` — must scan forward through raw tokens to find `;`
- `storePosition` is single-slot — the recovery loop must not rely on it (save cursor position as a local variable before each statement)
- Orphan source map entries from partially-parsed nodes — harmless, ignored by symbol table builder

**Limitations:**
- Only recovers between top-level statements. Errors *within* an expression (e.g., `let x = foo(1, |)`) discard the whole statement.
- Missing `end` delimiters cascade — everything after the unclosed block is lost.
- Good enough for ~80-90% of mid-typing scenarios (most edits happen in one statement while the rest is valid).

### Core data structures

```typescript
interface SymbolDef {
  name: string
  kind: 'variable' | 'function' | 'macro' | 'handler' | 'parameter' | 'import'
  nodeId: number
  location: { file: string; line: number; column: number }
  scope: number  // depth in scope chain (0 = top-level)
}

interface SymbolRef {
  name: string
  nodeId: number
  location: { file: string; line: number; column: number }
  resolvedDef: SymbolDef | null  // null = unresolved (→ diagnostic)
}

interface FileSymbols {
  filePath: string
  definitions: SymbolDef[]
  references: SymbolRef[]
  imports: Map<string, string>  // import path → resolved absolute path
  parseErrors: ParseError[]     // errors from failed statements
}

class WorkspaceIndex {
  private files = new Map<string, FileSymbols>()
  private reverseImports = new Map<string, Set<string>>()
  // Token-level definitions as fallback when AST is unavailable
  private tokenDefs = new Map<string, SymbolDef[]>()

  updateFile(filePath: string, source: string): void
  invalidateDependents(filePath: string): void
  findDefinition(file: string, line: number, column: number): SymbolDef | null
  findReferences(file: string, symbolName: string, line: number, column: number): SymbolRef[]
  getDocumentSymbols(file: string): SymbolDef[]
  getDiagnostics(file: string): DiagnosticEntry[]
}
```

### Symbol table building

Walk the AST once per file to collect definitions and references:

**Definitions** — created by:
- `Let` nodes: `let x = ...` → variable/function/macro/handler depending on RHS
- Function parameters: `(a, b) -> ...` → parameter defs
- Handler clause params: `@eff(x) -> ...` → parameter defs
- `for` bindings: `for x in xs do ... end` → variable defs
- `match` bindings: `match ... | pattern -> ...` → variable defs
- Destructuring: `let { a, b } = ...` → variable defs per extracted name

**References** — every `Sym` node that isn't a definition site.

**Resolution** — use a static scope stack (mirrors ContextStack) during the walk. When a reference is encountered, look up the scope stack for the matching definition. If not found and not a builtin → unresolved (diagnostic).

### Scope handling

The walk maintains a scope stack. New scopes are pushed for:
- Function bodies (parameters in scope)
- `do ... end` blocks
- Handler clause bodies (clause params + `resume` in scope)
- `for` / `loop` bodies
- `match` clause bodies

This matches the runtime ContextStack behavior but runs statically on the AST.

---

## Implementation Plan

### Phase 0: Statement-level error recovery in parser

**Goal:** Parser produces partial ASTs for files with syntax errors.

1. Add `parseInternalRecoverable()` to `src/parser/index.ts`
   - Wraps `parseExpression()` in try/catch per statement
   - `skipToNextSemicolon()` helper scans forward through tokens
   - Returns `{ nodes, errors, sourceMap }` — nodes from successful statements, errors from failed ones
2. Expose via `parseToAstRecoverable()` for the language service (existing `parse()`/`parseToAst()` remain unchanged for runtime use)
3. Add tests: file with one bad statement among good ones → partial AST + error list

### Phase 1: Per-file symbol table + diagnostics

**Goal:** Real-time error underlining for undefined symbols, and Document Symbols (outline).

1. Create `src/languageService/tokenScan.ts`
   - Scan token stream for `let <name>` patterns
   - Always succeeds, provides fallback definitions
2. Create `src/languageService/SymbolTableBuilder.ts`
   - Walk AST (full or partial), collect `SymbolDef[]` and `SymbolRef[]`
   - Maintain static scope stack for resolution
   - Report unresolved symbols as diagnostics
3. Create `src/languageService/WorkspaceIndex.ts`
   - Per-file caching with content-hash invalidation
   - Trigger rebuild on `onDidChangeTextDocument` with debounce (~300ms)
   - Falls back to token-scan definitions when AST unavailable
4. Register `DocumentSymbolProvider` in extension
   - Return top-level definitions from `FileSymbols`
5. Register diagnostics (via `onDidChangeTextDocument`)
   - Parse errors from Phase 0 + unresolved symbols from symbol table
   - Report as `DiagnosticSeverity.Error`

### Phase 2: Go to Definition for user symbols

**Goal:** Cmd+click / F12 on any user-defined symbol navigates to its `let` binding.

1. Extend `DefinitionProvider` to query `WorkspaceIndex.findDefinition()`
2. For symbols defined in imported files, resolve across the import graph
3. Merge with existing import-path definition provider
4. Handle builtins: show reference docs instead of navigating

### Phase 3: Find References + Rename

**Goal:** Find all usages of a symbol, rename across files.

1. Register `ReferenceProvider` using `WorkspaceIndex.findReferences()`
2. Cross-file references via the import graph (symbols exported from one file, used in another)
3. Register `RenameProvider`
   - Uses `findReferences()` to locate all occurrences
   - Returns `WorkspaceEdit` with text edits
   - Validates: can't rename builtins, must be valid identifier

### Phase 4: Richer completions + signature help

**Goal:** Context-aware completions (not just builtins) and parameter hints.

1. Extend completion provider with symbols from `FileSymbols`
   - Include user-defined functions, variables, macros from current file + imports
   - Sort by scope proximity (inner scope first)
   - Token-scan definitions ensure completions work in broken files
2. Register `SignatureHelpProvider`
   - Detect when cursor is inside a function call `f(|)`
   - Look up function definition → extract parameter names
   - Show parameter hints as user types each argument

### Phase 5: Refactorings

**Goal:** Code actions for common structural transformations.

All three refactorings are registered via `CodeActionProvider` and appear in the right-click menu and the lightbulb (Cmd+.).

1. **Extract variable**
   - Select an expression → code action offers "Extract to variable"
   - Inserts `let <name> = <selected expression>;` before the current statement
   - Replaces the selection with `<name>`
   - Triggers rename mode so you can immediately name it
2. **Inline variable**
   - Cursor on a `let x = <expr>` binding → code action offers "Inline variable"
   - Uses `findReferences()` to locate all usages of `x`
   - Replaces each reference with `<expr>`, removes the `let` binding
   - Validates: only offered when the RHS is a pure expression (no side effects) and the variable is used at least once
3. **Extract function**
   - Select a block of code → code action offers "Extract to function"
   - Analyzes free variables in the selection using the symbol table (variables referenced but defined outside the selection)
   - Creates `let <name> = (<free vars>) -> do <selected code> end;` before the current scope
   - Replaces the selection with `<name>(<free vars>)`
   - Triggers rename mode for the new function name

---

## Open Questions

- **Performance budget**: for large files, how expensive is a full re-parse + symbol table build on every keystroke? Debounce should handle most cases, but at what file size does it become noticeable?
- **Separate LSP server vs in-process**: keeping everything in-process is simpler but blocks the extension host during analysis. At what scale does a separate server become necessary?
- **Cross-file rename**: when renaming a symbol exported from a module, should we rename in all importing files automatically? How do we handle destructured imports like `let { x } = import("./lib")`?
- **Type information**: should we track value types (number, string, function, etc.) from the RHS of bindings? This would enable richer hover info and type-error diagnostics but adds complexity. Deferred for now.
