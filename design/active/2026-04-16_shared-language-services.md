# Shared Language Services for VS Code and Playground

**Status:** Draft
**Created:** 2026-04-16
**Updated:** 2026-04-26 — aligned with [2026-04-26_playground-monaco-tree-ls-cli.md](2026-04-26_playground-monaco-tree-ls-cli.md): editor is Monaco (not CodeMirror), LS runs in a Web Worker, multi-file is now Phase 1 of the playground plan (so `WorkspaceIndex` browser-readiness is no longer deferred).

## Goal

Extract environment-agnostic language service logic from the VS Code extension into shared modules that both the extension and the browser-based playground can consume. This enables hover types, inline diagnostics, go-to-definition, completions, and eventually debugging in the playground without duplicating the implementation.

**Scope split with the playground design.** This plan owns the *extraction* of shared modules. The *wiring* of those modules into the Monaco playground (provider registration, UI integration, debouncing, worker plumbing) is owned by the playground design doc's Phase 2. Concretely: this plan ships when the modules exist + the VS Code extension uses them; the playground integration phase below documents the wiring contract for the playground plan to fulfill.

**Worker boundary.** The playground runs the LS in a Web Worker. The shared modules must stay DOM-free and free of browser-only APIs so they can be imported by the worker bundle. Pure functions consuming and returning serializable data — already the design — satisfy this naturally.

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

- **`WorkspaceIndex`** (`src/languageService/WorkspaceIndex.ts`) — symbol resolution, scope tracking, diagnostics. FS dependencies (read-fallback in `updateFile`, `resolveImportPath`, `walkDvalaFiles`) need to be split off into a Node-side wrapper before browser consumption — see Module 5.
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

**Playground use:** Worker-side `registerHoverProvider` wires Monaco's `IPosition` → portable `Position` (note Monaco's `lineNumber`/`column` is 1-based, matching ours), calls `findTypeAtPosition`, returns the result as an `IMarkdownString` for Monaco's hover renderer.

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

**Playground use:** Worker computes diagnostics → main thread maps to `monaco.editor.IMarkerData` and pushes via `monaco.editor.setModelMarkers(model, owner, markers)` (owner is `'dvala'` or `'dvala-types'`).

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

**Playground use:** Maps `CompletionItem` → `monaco.languages.CompletionItem` (kind enum maps to `CompletionItemKind`, `insertText` carries through, `params` becomes a snippet template). Wired via `registerCompletionItemProvider`.

**Cleanup when this lands:** delete `getAutoCompleter` from [src/tooling.ts](../../src/tooling.ts) and the `AutoCompleter` class at [src/AutoCompleter/AutoCompleter.ts](../../src/AutoCompleter/AutoCompleter.ts). Both predate the language service and are kept alive by playground's `registerCompletionItemProvider` wiring at [playground-www/src/scripts.ts:4050,4076](../../playground-www/src/scripts.ts#L4050). Once the playground switches to the LS-backed `CompletionItem` provider above (Phase 2 of the playground plan), `getAutoCompleter` has no remaining production caller and the `AutoCompleter` directory can be deleted entirely. Coordinate the deletion with the playground integration PR.

### Module 5: `WorkspaceIndex` as public API

**Priority:** High (formerly Low — bumped 2026-04-26 because the playground plan introduces multi-file in Phase 1, so cross-file symbol resolution is now load-bearing for Phase 2 features like go-to-def, find-references, and rename).

The current `WorkspaceIndex` (`src/languageService/WorkspaceIndex.ts`) touches `fs` in three distinct places:
1. `updateFile(path, source?)` — falls back to `fs.readFileSync` when no source is provided.
2. `walkForImports` → `resolveImportPath` — uses `fs.existsSync` to check `./lib` and `./lib.dvala` during import-path resolution.
3. `indexWorkspace(root)` → `walkDvalaFiles` — uses `fs.readdirSync` to recursively walk the filesystem.

**Approach (hybrid I/O separation, decided 2026-04-26):** `WorkspaceIndex` becomes pure data manipulation; all I/O moves out of the class. CLI ergonomics are preserved by a thin Node-side wrapper.

Required changes:

1. **Make `updateFile` strictly source-driven.** Signature becomes `updateFile(path, source, resolvedImports: Map<string, string>)`. The caller passes both the source text and the pre-resolved import map. `WorkspaceIndex` stops reading files and stops resolving paths.
2. **Move filesystem-bound helpers out of `WorkspaceIndex`.** `walkDvalaFiles`, `resolveImportPath`, and the `fs.readFileSync` fallback move to a new Node-only helper module — e.g. `src/languageService/nodeWorkspaceIndexer.ts` — that wraps `WorkspaceIndex` and provides today's CLI ergonomics (`indexWorkspace(root)` walks the tree, calls back into `updateFile` with text + resolved imports for each file).
3. **Browser/playground builds its own thin wrapper** on top of `WorkspaceIndex` using `FileBackend` for reads + a path-resolver function that consults `FileBackend.list()`.
4. **Strip `fs`/`path` imports from `WorkspaceIndex.ts` and adjacent modules** so the worker bundle stays clean. `path.resolve` / `path.dirname` are fine via `path-browserify` (Vite handles automatically), but verify no Node-specific behavior creeps in.
5. **Export structure:** `WorkspaceIndex` from `src/languageService/index.ts` (public API) and via `dvala/internal` (tooling consumers, per the playground plan's two-surface discipline). The Node-side wrapper exports separately and is *not* in `dvala/internal` (it's CLI-only).

The playground uses `WorkspaceIndex` directly for go-to-definition, find-references, and rename across the file tree.

### Module 6: Reference rendering (portable markdown)

**Priority:** Low — playground already has `renderDvalaMarkdown.ts`

Extract the pure markdown generation from `buildHoverMarkdown()` into a shared function that returns a markdown string (not `vscode.MarkdownString`). Both the extension and the playground can render it with their respective markdown renderers.

**Current location:** `vscode-dvala/src/extension.ts` lines 26–62

### Position conventions

All positions and ranges in `src/shared/types.ts` and `src/languageService/types.ts` are **1-based** (line and column). This matches the existing `SymbolLocation` and Monaco's `IPosition`/`IRange`. CodeMirror was 0-based — that's no longer relevant since the playground is moving to Monaco. **Do not introduce 0-based positions** without explicit conversion at the boundary.

### Not in scope

- **Effect-handler resolution display.** Visualizing how an effect resolves to a handler at a given source location is genuinely Dvala-specific and doesn't fit the LSP-style provider model cleanly. Designed in a follow-up; the playground plan's right/bottom panels are the natural home (per [2026-04-26_playground-monaco-tree-ls-cli.md](2026-04-26_playground-monaco-tree-ls-cli.md) Phase 2 risk note).
- **Snapshot/replay diffing UI** — same reasoning; lives in the playground's bottom panel as a follow-up.

### Existing LS tests

The existing test files under `src/languageService/` (`renameNonImport.test.ts`, `SymbolTableBuilder.test.ts`, `tokenScan.test.ts`, `WorkspaceIndex.test.ts`) **stay where they are**. They test LS internals that aren't moving — `SymbolTableBuilder`, `WorkspaceIndex`, `tokenScan` all keep their current homes. The `WorkspaceIndex` tests will need updates to reflect the new pure `updateFile(path, source, resolvedImports)` signature, but the test file location is unchanged. New tests for the *shared modules* (Modules 1–4) live alongside them at `src/shared/*.test.ts`.

## Migration Strategy

**Precondition (infrastructure):** [2026-04-27_workspace-conversion.md](2026-04-27_workspace-conversion.md) should land first. Once `src/shared/` exists as material extracted modules, vscode-dvala consumes them via a `workspace:*` dependency (or by importing from a shared workspace member), which assumes pnpm workspaces are set up. Doing the workspace conversion as a separate, focused PR before this plan starts means each piece of infrastructure can be validated in isolation: pnpm migration → workspaces work → shared-LS extraction → playground integration. Mixing workspace conversion with module extraction would muddy the review and bisect signal if anything regresses.

Each module is extracted independently. The VS Code extension is updated to import from the shared package instead of having inline implementations. No behavioral changes — the extraction is a pure refactor from the extension's perspective.

1. Extract module → write it in `src/shared/`
2. Update the VS Code extension to use the shared module
3. Add tests for the shared module (position matching, diagnostic conversion, etc.)
4. Wire the shared module into the playground when the UI is ready (owned by the playground design doc's Phase 2 — not part of this plan)

Extraction within this plan happens incrementally, one module at a time. **However:** Phases 1–3 of this plan are now a hard prerequisite for the playground plan's Phase 2. The "decoupled from playground" framing is no longer accurate — extraction must complete before playground LS-parity work begins.

## Open Questions

- ~~Should the portable position/range types live in `src/shared/types.ts` or in `src/languageService/types.ts`?~~ **Resolved 2026-04-26: two files.** Generic editor-facing types (`Position`, `Range`, `Diagnostic`, `CompletionItem`) live in `src/shared/types.ts`. Dvala-specific types (`SymbolLocation`, `SymbolDef`, `SymbolRef`, `ScopeRange`, `FileSymbols`) stay in `src/languageService/types.ts` unchanged. Rule of thumb: types that encode "where in a file" or "what an editor wants to display" are shared; types that encode Dvala's symbol/scope/file-as-module model are LS-specific.
- ~~Should `WorkspaceIndex` be usable in the browser as-is (callback-based file resolution), or does it need a browser-compatible fork that strips `fs`/`path` imports entirely?~~ **Resolved 2026-04-26: hybrid I/O separation.** `WorkspaceIndex` becomes pure data manipulation (caller passes source text + pre-resolved import map). A Node-only `nodeWorkspaceIndexer.ts` wraps it for CLI ergonomics; the playground builds its own thin wrapper using `FileBackend`. See Module 5 above for the full breakdown of the three `fs`-touching behaviors and how each is resolved.
- ~~For playground hover, should we run the full typechecker on every keystroke (expensive) or debounce / run on demand?~~ **Resolved 2026-04-26:** debounced (~200–300ms) and runs in a Web Worker — see playground plan's Phase 2.
- ~~Should the playground's editor integration live as a separate directory (`playground-www/src/languageSupport/`) holding the Monaco provider registrations and worker-message glue, or inline in existing playground components?~~ **Resolved 2026-04-26: separate directory `playground-www/src/languageSupport/`.** Holds Monaco provider registrations, worker glue, position/type adapters between Monaco shapes and shared-LS shapes, debouncing, and error handling. Keeps `shell.ts` focused on UI shell concerns; makes the language-integration layer findable (`languageSupport/hover.ts`, `languageSupport/diagnostics.ts`, etc.).
- ~~Should rename, go-to-definition, and find-references be additional shared modules in this plan (e.g. `src/shared/navigationOps.ts`), or does that logic stay inside `WorkspaceIndex` and get consumed directly by the playground?~~ **Resolved 2026-04-26: stays on `WorkspaceIndex`.** The navigation operations (`findDefinition`, `findAllOccurrences`, `resolveCanonicalFile`, `getSymbolAtPosition`) already exist as methods on `WorkspaceIndex` and use Dvala-specific types (`SymbolDef`, `SymbolRef`, `SymbolLocation`) that legitimately encode the symbol model. The Monaco adapter layer (`playground-www/src/languageSupport/`) calls these methods directly and converts results to Monaco shapes — that conversion is a thin one-liner, not worth its own shared module.

## Implementation Plan

> **Scope:** This plan ships when the shared modules exist and the VS Code extension consumes them. Playground integration (originally Phase 3 below) is owned by [2026-04-26_playground-monaco-tree-ls-cli.md](2026-04-26_playground-monaco-tree-ls-cli.md) Phase 2 — but the wiring contracts are documented here so the playground plan has something concrete to consume.

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

### Phase 3: `WorkspaceIndex` browser-readiness (hybrid I/O separation)

10. Refactor `WorkspaceIndex.updateFile` to require source + a pre-resolved import map: `updateFile(path, source, resolvedImports: Map<string, string>)`. Remove the `fs.readFileSync` fallback and `resolveImportPath` from `WorkspaceIndex` itself.
11. Create `src/languageService/nodeWorkspaceIndexer.ts` — a Node-only wrapper that preserves today's CLI ergonomics (`indexWorkspace(root)` walks the tree via `walkDvalaFiles`, reads each file, resolves imports with `fs.existsSync`, then calls into `WorkspaceIndex.updateFile`). Move `walkDvalaFiles` and `resolveImportPath` here.
12. Update existing CLI / VS Code call sites to use the wrapper.
13. Audit `WorkspaceIndex.ts` and adjacent modules for any remaining `fs` imports; verify `path.resolve`/`path.dirname` resolve cleanly via `path-browserify` in the worker bundle.
14. Export `WorkspaceIndex` from the public LS entry point (`src/languageService/index.ts`) and via `dvala/internal`. Export `nodeWorkspaceIndexer` separately (CLI-only — not in `dvala/internal`).
15. Add unit tests covering the new pure `WorkspaceIndex.updateFile` contract and the `nodeWorkspaceIndexer` wrapper.

### Wiring contract (consumed by the playground plan, documented here for clarity)

The playground plan wires these modules into Monaco providers — *not* part of this plan's deliverables:

- `typeDisplay` → `monaco.languages.registerHoverProvider`
- `diagnosticBuilder` → `monaco.editor.setModelMarkers` (debounced, in worker)
- `callContext` → `monaco.languages.registerSignatureHelpProvider`
- `completionBuilder` → `monaco.languages.registerCompletionItemProvider`
- `WorkspaceIndex` → `registerDefinitionProvider`, `registerReferenceProvider`, `registerRenameProvider`
