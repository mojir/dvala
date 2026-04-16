# Shared Language Services for VS Code and Playground

**Status:** Draft
**Created:** 2026-04-16

## Goal

Extract environment-agnostic language service logic from the VS Code extension into shared modules that both the extension and the browser-based playground can consume. This enables hover types, inline diagnostics, go-to-definition, completions, and eventually debugging in the playground without duplicating the implementation.

---

## Background

The VS Code extension (`vscode-dvala/src/extension.ts`) implements a rich set of language features:

- **Hover types** — inferred type display at cursor position
- **Diagnostics** — parse errors, unresolved symbols, type warnings
- **Completions** — builtin references, user symbols, signature help
- **Go-to-definition** — jump to symbol definition
- **Find references / rename** — cross-file symbol operations
- **Code execution** — run with effect handlers

These features are implemented as a mix of pure computation and VS Code API wrappers. The pure computation — type resolution, position matching, diagnostic conversion, call context parsing — has no inherent dependency on VS Code and could run in any environment.

The playground (`playground-www/src/`) already has its own code execution, effect handling, and markdown rendering, but lacks type information, diagnostics, and symbol navigation. Adding these features by extracting shared modules avoids maintaining two divergent implementations.

### What already exists that's environment-agnostic

- **`WorkspaceIndex`** (`src/languageService/WorkspaceIndex.ts`) — symbol resolution, scope tracking, diagnostics. Only FS dependency is in `updateFile()`, which accepts source text directly.
- **`SymbolTableBuilder`** (`src/languageService/SymbolTableBuilder.ts`) — AST → symbol table.
- **Type formatting pipeline** — `expandTypeForDisplay()` → `sanitizeDisplayType()` → `simplify()` → `typeToString()`. All pure functions in `src/typechecker/`.
- **`allReference`** (`reference/index.ts`) — builtin documentation. Already used by both extension and playground.
- **`stringifyValue`** (`common/utils.ts`) — already shared.

### What's VS Code-specific (stays in the extension)

- Provider registrations (`registerHoverProvider`, `registerCompletionItemProvider`, etc.)
- `vscode.Diagnostic`, `vscode.MarkdownString`, `vscode.CompletionItem` constructors
- Editor/document APIs (`activeTextEditor`, `getText()`, `getWordRangeAtPosition()`)
- Debug adapter protocol integration
- File watchers, output channels, status bar

## Proposal

Create a `src/shared/` directory with portable modules that both consumers import. The VS Code extension becomes a thin adapter that wires these modules into VS Code's provider APIs. The playground imports the same modules and wires them into its own UI.

### Module 1: `src/shared/typeDisplay.ts`

**Priority:** High — enables playground hover types

Extracts the type display pipeline and position-based type lookup.

```typescript
// Portable position types (no vscode dependency)
interface Position { line: number; column: number }
interface Range { start: Position; end: Position }

// Core functions
function formatHoverType(type: Type): string
function findTypeAtPosition(
  typeMap: Map<number, Type>,
  sourceMap: Map<number, SourceMapPosition>,
  position: Position,
  preferredRange?: Range,
): Type | undefined
function findTypeAtDefinition(
  typeMap: Map<number, Type>,
  sourceMap: Map<number, SourceMapPosition>,
  def: SymbolDef,
): Type | undefined
```

**Current location:** `vscode-dvala/src/extension.ts` lines 170–234

**VS Code adapter:** Converts `vscode.Position` / `vscode.Range` to portable types, calls shared functions, wraps result in `vscode.MarkdownString`.

**Playground use:** Call directly with CodeMirror cursor position, display result in a tooltip div.

### Module 2: `src/shared/diagnosticBuilder.ts`

**Priority:** High — enables playground inline errors

Extracts the logic that converts parse errors, unresolved symbols, and type diagnostics into a portable diagnostic format.

```typescript
interface Diagnostic {
  message: string
  range: Range
  severity: 'error' | 'warning' | 'info'
  source: 'dvala' | 'dvala-types'
}

function buildParseDiagnostics(parseErrors: ParseError[]): Diagnostic[]
function buildSymbolDiagnostics(unresolvedRefs: SymbolRef[]): Diagnostic[]
function buildTypeDiagnostics(typeResult: TypecheckResult): Diagnostic[]
```

**Current location:** `vscode-dvala/src/extension.ts` lines 730–793

**VS Code adapter:** Maps `Diagnostic` → `vscode.Diagnostic` (severity enum, range constructor).

**Playground use:** Maps `Diagnostic` → CodeMirror lint annotations or inline error markers.

### Module 3: `src/shared/callContext.ts`

**Priority:** Medium — enables playground signature help

Extracts the pure string-parsing logic for detecting which function is being called and which parameter the cursor is on.

```typescript
function findCallContext(
  source: string,
  line: number,
  column: number,
): { functionName: string; activeParam: number } | null
```

**Current location:** `vscode-dvala/src/extension.ts` lines 108–133

**Change needed:** Currently takes `vscode.TextDocument` + `vscode.Position`. Extract to take `source: string` + `line` + `column`.

### Module 4: `src/shared/completionBuilder.ts`

**Priority:** Medium — enables playground autocomplete

Extracts completion item construction from symbol definitions and reference data.

```typescript
interface CompletionItem {
  label: string
  kind: 'variable' | 'function' | 'macro' | 'handler' | 'parameter' | 'import' | 'module' | 'effect'
  detail?: string
  insertText?: string
  params?: string[]
  sortText?: string
}

function symbolDefToCompletion(def: SymbolDef): CompletionItem
function referenceToCompletion(name: string, ref: Reference): CompletionItem
function buildBuiltinCompletions(): CompletionItem[]
```

**Current location:** `vscode-dvala/src/extension.ts` lines 74–102, 137–160

**VS Code adapter:** Maps `CompletionItem` → `vscode.CompletionItem` (kind enum, snippet strings).

**Playground use:** Maps `CompletionItem` → CodeMirror autocompletion entries.

### Module 5: `WorkspaceIndex` as public API

**Priority:** Low (playground is single-file today) — enables playground multi-file support later

`WorkspaceIndex` is already environment-agnostic. The only change needed:

1. Abstract the `fs.readFileSync` call in `updateFile()` behind a file-resolver callback (or just require callers to pass source text, which is already supported).
2. Export it from a public entry point (e.g., `src/languageService/index.ts`).

The playground can use it for single-file symbol resolution today (scope-aware completions, go-to-definition within a file) and multi-file support later if the playground gains a file system.

### Module 6: Reference rendering (portable markdown)

**Priority:** Low — playground already has `renderDvalaMarkdown.ts`

Extract the pure markdown generation from `buildHoverMarkdown()` into a shared function that returns a markdown string (not `vscode.MarkdownString`). Both the extension and the playground can render it with their respective markdown renderers.

**Current location:** `vscode-dvala/src/extension.ts` lines 26–62

## Migration Strategy

Each module is extracted independently. The VS Code extension is updated to import from `src/shared/` instead of having inline implementations. No behavioral changes — the extraction is a pure refactor from the extension's perspective.

1. Extract module → write it in `src/shared/`
2. Update the VS Code extension to use the shared module
3. Add tests for the shared module (position matching, diagnostic conversion, etc.)
4. Wire the shared module into the playground when the UI is ready

This means extraction can happen incrementally, one module at a time, without blocking playground UI work.

## Open Questions

- Should the portable position/range types live in `src/shared/types.ts` or in `src/languageService/types.ts` (which already has `SymbolLocation`)?
- Should `WorkspaceIndex` be usable in the browser as-is, or does it need a browser-compatible fork that strips `fs`/`path` imports?
- For playground hover, should we run the full typechecker on every keystroke (expensive) or debounce / run on demand? The VS Code extension runs on every document change — is that viable in the browser?
- Should the playground's CodeMirror integration be a separate package (`playground-www/src/languageSupport/`) or inline in existing playground components?

## Implementation Plan

### Phase 1: Type display and diagnostics (high value)

1. Create `src/shared/typeDisplay.ts` — extract `formatHoverType`, `findTypeAtPosition`, `findTypeAtDefinition`
2. Create `src/shared/diagnosticBuilder.ts` — extract parse/symbol/type diagnostic builders
3. Create `src/shared/types.ts` — portable `Position`, `Range`, `Diagnostic` types
4. Update VS Code extension to import from `src/shared/`
5. Add unit tests for shared modules

### Phase 2: Completions and signature help (medium value)

6. Create `src/shared/callContext.ts` — extract `findCallContext`
7. Create `src/shared/completionBuilder.ts` — extract completion item construction
8. Update VS Code extension to use shared builders
9. Add unit tests

### Phase 3: Playground integration

10. Wire `typeDisplay` into playground hover (CodeMirror tooltip)
11. Wire `diagnosticBuilder` into playground error display (CodeMirror lint)
12. Wire `completionBuilder` into playground autocomplete (CodeMirror autocompletion)
13. Wire `callContext` into playground signature help

### Phase 4: Symbol navigation (when playground gains multi-file)

14. Export `WorkspaceIndex` with browser-compatible file resolution
15. Wire go-to-definition and find-references into playground
