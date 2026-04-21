# Cross-File Rename

**Status:** In Progress
**Created:** 2026-04-21
**Branch:** `ls-cross-file-rename`

First milestone of `design/active/2026-04-02_language-service-next.md`.

## Problem

Today's rename (via `findAllOccurrences`) misses three classes of occurrence:

1. The export key `"pi"` in a module's `{ pi }` object (stored in `fileSymbols.exports`, never walked).
2. The import destructuring binding `let { pi } = import(...)` in files that import the target (stored in importer's `definitions` with `kind: 'import'`, never walked).
3. Importer references are matched by name only, so an unrelated local `pi` in an importer would be incorrectly renamed.

It also doesn't handle the symmetric case: renaming from within an importer (cursor on `pi` in `let { pi } = import(...)`) needs to start the search from the exporting file.

## Scope

**In scope:**
- Rename originating from defining file *or* from an importer — both resolve to the canonical definition and use it as the search root.
- Walk definitions, references, and exports in the root file.
- Walk references (filtered by `resolvedDef` pointing into root) and import-kind definitions (filtered by destructuring RHS being an import of the root file) in each importer.

**Out of scope (for this PR):**
- **Transitive re-exports.** If file A exports `pi`, file B re-exports from A, file C imports from B — we do not propagate the rename through B to C. Re-exports are not tracked in the symbol table today.
- **Parameterised import keys / aliases** (e.g., `let { pi: p } = import(...)`). The parser does not currently accept this syntax.

## Dvala shorthand / destructuring facts (verified via `dvala parse --debug`)

- `{ pi }` export → two nodes: `Str "pi"` (key) + `Sym "pi"` (value). The `Str` is captured by `extractExports`; the `Sym` becomes a reference. Both share the same source position because the token `pi` is written once.
- `let { pi } = import("./lib")` → the destructuring key is a **plain JS string**, and the binding is a `Sym "pi"` node. Since aliases are not supported, the destructuring key and the binding name are always the same token at the same position. Renaming the binding automatically renames the key.

Implication: no special "preserve shorthand" logic is needed. Range-deduplication (when two nodes share the same start location) is sufficient.

## Approach

### `findAllOccurrences` — keep signature, widen semantics

Given `findAllOccurrences(filePath, symbolName)`:

1. **In the target file**: walk `definitions`, `references`, and **`exports`** matching by name.
2. **In each importer** (via `reverseImports`):
   - Walk `definitions` with `kind === 'import'` and matching name, **filtered to only those whose destructuring RHS is an import of the target file**. (We know this because the import-kind definition and the import path are in the same `Let` binding; we can track it during symbol table building by attaching a `sourceFile: string` field to `kind: 'import'` definitions, or by walking the AST at query time.)
   - Walk `references` matching by name **and** whose `resolvedDef.location.file === target file**. This filters out unrelated locals.
3. **Dedup** by `(file, line, column)` to handle shorthand where the same token backs two AST nodes.

### Rename provider — resolve to canonical file first

In `provideRenameEdits`:
1. `getSymbolAtPosition` → `{ name, def }`.
2. The canonical file is `def.location.file` (which may be the current file if the user started from the defining file, or another file if they started from an importer).
3. Call `findAllOccurrences(canonicalFile, name)`.

### Data model change

Add a field to `SymbolDef` (or to a sibling map) so that import-kind definitions know which file they were destructured from:

```ts
interface SymbolDef {
  ...
  /** For kind === 'import' definitions: absolute path of the destructured module. */
  importedFrom?: string
}
```

Populated by `SymbolTableBuilder` when walking a `Let` whose RHS is an `Import` node whose path resolves to a known file.

## Testing

Add to `WorkspaceIndex.test.ts`:
- Shorthand export: rename in lib renames export key + let binding + destructuring binding + importer ref.
- Explicit key:value export: `{ pi: somePi }` — only the key is renamed, not `somePi`.
- Locality: importer has an unrelated local `pi` — not renamed.
- Rename from importer: cursor on destructuring `pi` renames lib's let + export + other importers.
- Multiple importers: all are updated.

## Open follow-ups (explicit non-goals)

- Transitive re-exports → separate design (`2026-04-21_transitive-reexports.md`).
- `dvala parse` reports that `let { pi: p } = import(...)` is not accepted; if aliased destructuring is added later, this doc needs an update (`2026-04-21_aliased-destructuring.md`).
- The older `WorkspaceIndex.findReferences` method still has the pre-fix locality bug and is left in place with a `@deprecated` tag. Callers should use `findAllOccurrences`. Clean-up tracked alongside the transitive re-exports work, where `findReferences` will be rewritten on top of the same BFS machinery.
