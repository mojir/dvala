# Phase 4: Context-aware Completions + Signature Help

**Status:** Complete
**Created:** 2026-04-02

## Goal

Extend the Dvala VSCode extension with two features:

1. **Context-aware completions** — suggest user-defined symbols (variables, functions, macros, handlers, imports) alongside builtins, scoped to what's visible at the cursor.
2. **Signature help** — show parameter names and positions when typing inside a function call `f(|)`.

---

## Background

### Current completions

The completion provider (`extension.ts:330`) returns a **static list** of builtin symbols built at activation time from `reference/index.ts`. It ignores:
- User-defined symbols (`let x = ...`, function parameters, etc.)
- Scope — it shows everything everywhere
- Imported symbols from other files

### Available infrastructure

- **`WorkspaceIndex.getDefinitions(file)`** — returns all definitions (AST-based or token-scanned fallback). Includes name, kind, scope depth, and location.
- **`WorkspaceIndex.getFileSymbols(file)`** — full symbol table with definitions, references, and imports.
- **`SymbolDef.kind`** — classifies symbols as `variable | function | macro | handler | parameter | import`.
- **`SymbolDef.scope`** — depth in scope chain (0 = top-level). Currently available but not enough for position-aware scope filtering.
- **Token-scanned definitions** — always available even for broken files, giving top-level `let <name>` bindings.

### What's missing

1. **Scope-at-position query** — no API to ask "what symbols are visible at line L, column C?" The symbol table has scope depths but doesn't track which scopes contain which positions.
2. **Parameter names on function definitions** — `SymbolDef` stores the function's name and location but not its parameter list. Needed for signature help.
3. **Trigger characters** — the completion provider has no trigger character configuration; signature help needs `(` and `,` as triggers.

---

## Proposal

### Part 1: Context-aware completions

#### Approach: scope-at-position via definition filtering

Rather than building a full scope-position map, use a simpler heuristic that covers the common cases well:

1. **Top-level symbols** (scope=0) — always visible. These are the `let` bindings at file level.
2. **Symbols from imported files** — top-level exports from files referenced by `import("./...")`.
3. **Builtin symbols** — the existing static list (already built).

Scope-aware filtering for inner symbols (function parameters, block-local variables) would require tracking scope ranges (start/end positions). This can be deferred — top-level + imported + builtins covers ~90% of useful completions.

#### Implementation

Extend the `CompletionItemProvider` to be position-aware:

```typescript
const completionProvider = vscode.languages.registerCompletionItemProvider('dvala', {
  provideCompletionItems(document, position) {
    indexDocument(document)
    const items: vscode.CompletionItem[] = [...builtinCompletionItems]

    // Add user-defined top-level symbols from current file
    const defs = workspaceIndex.getDefinitions(document.uri.fsPath)
    for (const def of defs) {
      if (def.scope !== 0) continue
      if (builtinNames.has(def.name)) continue
      items.push(symbolDefToCompletionItem(def))
    }

    // Add exported symbols from imported files
    const fileSymbols = workspaceIndex.getFileSymbols(document.uri.fsPath)
    if (fileSymbols) {
      for (const importedPath of fileSymbols.imports.values()) {
        const importedSymbols = workspaceIndex.getFileSymbols(importedPath)
        if (importedSymbols) {
          for (const exp of importedSymbols.exports) {
            items.push(symbolDefToCompletionItem(exp))
          }
        }
      }
    }

    return items
  },
})
```

#### Completion item mapping

```typescript
function symbolDefToCompletionItem(def: SymbolDef): vscode.CompletionItem {
  const kind = {
    variable: vscode.CompletionItemKind.Variable,
    function: vscode.CompletionItemKind.Function,
    macro: vscode.CompletionItemKind.Method,
    handler: vscode.CompletionItemKind.Event,
    parameter: vscode.CompletionItemKind.Variable,
    import: vscode.CompletionItemKind.Module,
  }[def.kind]

  const item = new vscode.CompletionItem(def.name, kind)
  item.detail = def.kind
  item.sortText = '1_' + def.name  // sort user symbols before builtins
  return item
}
```

### Part 2: Signature help

#### Approach: parameter extraction from AST

Add a `params` field to `SymbolDef` for function/macro definitions:

```typescript
interface SymbolDef {
  // ... existing fields ...
  params?: string[]  // parameter names, only set for function/macro kinds
}
```

The `SymbolTableBuilder` already processes function params — extend it to capture the parameter name list on the parent definition.

#### Finding the call context

When the user types `(` or `,`, the signature help provider needs to:
1. Find the function name before the `(`
2. Look up its definition via the workspace index
3. Return the parameter names and highlight the active parameter

This can be done by scanning backward from the cursor through the document text:

```typescript
function findCallContext(document: vscode.TextDocument, position: vscode.Position):
  { functionName: string; activeParam: number } | null {
  const text = document.getText(new vscode.Range(
    new vscode.Position(Math.max(0, position.line - 5), 0), position))

  // Walk backward to find unmatched '('
  let depth = 0
  let commaCount = 0
  for (let i = text.length - 1; i >= 0; i--) {
    const ch = text[i]
    if (ch === ')') depth++
    else if (ch === '(') {
      if (depth === 0) {
        // Found the opening paren — extract function name before it
        const before = text.substring(0, i).trimEnd()
        const nameMatch = before.match(/([a-zA-Z_$][a-zA-Z0-9_$]*)$/)
        if (nameMatch) {
          return { functionName: nameMatch[1], activeParam: commaCount }
        }
        return null
      }
      depth--
    }
    else if (ch === ',' && depth === 0) commaCount++
  }
  return null
}
```

#### Registration

```typescript
const signatureHelpProvider = vscode.languages.registerSignatureHelpProvider('dvala',
  {
    provideSignatureHelp(document, position) {
      const ctx = findCallContext(document, position)
      if (!ctx) return null

      // Look up the function definition
      // Check builtins first, then user-defined symbols
      const ref = allReference[ctx.functionName] ?? referenceByTitle[ctx.functionName]
      if (ref && isFunctionReference(ref)) {
        return buildBuiltinSignatureHelp(ref, ctx.activeParam)
      }

      // Try user-defined functions
      indexDocument(document)
      const defs = workspaceIndex.getDefinitions(document.uri.fsPath)
      const funcDef = defs.find(d => d.name === ctx.functionName && d.params)
      if (funcDef?.params) {
        return buildUserSignatureHelp(funcDef, ctx.activeParam)
      }

      return null
    },
  },
  '(', ','  // trigger characters
)
```

---

## Implementation Plan

### Step 1: Add `params` field to SymbolDef and populate in SymbolTableBuilder

- Extend `SymbolDef` in `types.ts` with optional `params?: string[]`
- In `SymbolTableBuilder`, when processing a `Let` node whose RHS is a `Function` or `Macro`, extract parameter names from the binding targets and attach them to the definition
- Update token-scanned definitions to attempt parameter extraction too (scan for `(name1, name2)` pattern after `=`)
- Add tests

### Step 2: Context-aware completions in extension

- Refactor `provideCompletionItems` to be position-aware (receives `document` and `position`)
- Add user-defined top-level symbols from `WorkspaceIndex.getDefinitions()`
- Add exported symbols from imported files
- Map `SymbolDef.kind` to appropriate `CompletionItemKind`
- Sort user symbols before builtins (via `sortText`)
- Keep builtin completions as-is

### Step 3: Signature help for builtins

- Register `SignatureHelpProvider` with trigger characters `(` and `,`
- Implement `findCallContext()` to detect function name and active parameter index
- For builtins: use `reference/index.ts` variant data to build `SignatureHelp`
- Test with builtins like `map`, `filter`, `reduce`

### Step 4: Signature help for user-defined functions

- Use `params` from `SymbolDef` to build `SignatureHelp` for user functions
- Resolve cross-file: look up imported function definitions
- Handle macros (same parameter structure)

### Step 5: Tests and edge cases

- Completion deduplication (user symbol shadows builtin)
- Nested calls `f(g(|))` — signature help shows `g`'s params, not `f`'s
- Multiline calls — `findCallContext` must scan across line boundaries
- Broken files — completions fall back to token-scanned definitions

---

## Open Questions

- **Scope-aware completions**: Should we invest in position-based scope tracking now, or is top-level + imports enough for v1? Inner-scope symbols (function params, block-local vars) won't appear in completions until we add scope ranges.
- **Macro signature help**: Macros have parameters but their semantics differ from functions (they receive AST nodes, not values). Should signature help show macro params the same way, or distinguish them visually?
- **Completion ranking**: Should recently-used symbols or closer-scope symbols rank higher? VS Code's built-in fuzzy matching handles most of this, but we could add boost via `sortText`.
- **Re-trigger after comma**: VS Code re-triggers signature help on `,` but the active parameter index needs to update. Does the simple backward-scan handle re-trigger correctly?
