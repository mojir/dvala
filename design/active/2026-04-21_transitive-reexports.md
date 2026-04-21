# Cross-File Rename — Transitive Re-Exports

**Status:** Draft
**Created:** 2026-04-21
**Depends on:** `design/active/2026-04-21_cross-file-rename.md` (PR #70)

## Goal

Extend cross-file rename so it propagates along re-export chains: if file A exports `pi`, file B re-exports it (`let { pi } = import("./A"); { pi }`), and file C imports from B (`let { pi } = import("./B"); pi`), renaming `pi` in A must update every occurrence in A, B, and C.

The initial cross-file rename (PR #70) walks only direct importers of the defining file, so the chain stops at B.

## Non-goals

- **Aliased re-export chains** where a file re-exports under a different name (`let { pi } = import("./A"); { tau: pi }`). Treated in the aliased-destructuring design doc.
- **Renaming a re-exporter's local alias without touching the origin.** Because Dvala currently has no aliasing, a re-exporter's `pi` binding is always the same name as the origin. If aliasing lands, this question becomes real.
- **Cycles that cross module boundaries in the rename graph** (A re-exports from B while B re-exports from A). Dvala doesn't generally support cyclic imports — the design below detects cycles and stops to avoid infinite loops, but doesn't try to "do the right thing" in that case.

## Today's state (baseline)

`findAllOccurrences(libFile, 'pi')` in `src/languageService/WorkspaceIndex.ts`:

1. Walks the defining file's `definitions`, `references`, and `exports`.
2. Walks each direct importer's `definitions` (filtered to `kind: 'import'` with a matching `importPath`) and `references` (filtered to those whose `resolvedDef` is one of those import defs).
3. Dedups by `(file, line, column)`.

No traversal of importers-of-importers.

## Proposal

Replace the one-hop importer loop with a BFS over **re-exporters**.

### Detecting a re-export

A file B re-exports `pi` from A if **all** of the following hold:

1. B has an entry in `fileSymbols.exports` with `name === 'pi'`.
2. B has a top-level `SymbolDef` with `kind === 'import'`, `name === 'pi'`, and `importPath` that resolves (via B's `imports` map) to A.
3. *(Implicit via Dvala's shorthand-only destructuring)* The export object's value-side `Sym` at the export's position resolves to that import def. This step is a consistency check; without aliasing, steps 1 and 2 are sufficient.

### Algorithm

```
function findAllOccurrencesTransitive(targetFile, symbolName):
  # occurrences are (file, line, column, nameLength)
  results = []
  seen = new Set<string>() # dedup locations across all hops

  # Queue of (file, name-in-that-file) pairs to process as "roots".
  # name-in-that-file stays `symbolName` everywhere until aliased
  # destructuring lands; this design doc assumes the name is invariant.
  worklist = [(targetFile, symbolName)]
  visitedFiles = new Set<string>()

  while worklist is not empty:
    (file, name) = worklist.pop()
    if file in visitedFiles: continue
    visitedFiles.add(file)

    # (a) target-file defs/refs/exports — same as today's target-file branch
    collect(file, name, results, seen)

    # (b) each direct importer's import-def + matching refs — same as today
    for importer in reverseImports[file]:
      importDefs = importDefsMatching(importer, file, name)
      for def in importDefs:
        record(def.location, results, seen)
      for ref in importer.references:
        if ref.name == name and ref.resolvedDef in importDefs:
          record(ref.location, results, seen)

      # (c) NEW: if this importer re-exports `name`, enqueue it as a new root.
      if isReexport(importer, name, importDefs):
        worklist.push((importer, name))

  return results
```

### Where this differs from the current implementation

- `visitedFiles` guards against cycles (A imports B imports A would otherwise loop).
- `(c)` is the new hop: when an importer re-exports the name, the importer itself becomes the next search root.
- The results accumulate across hops and dedup via the shared `seen` set.
- `collect(file, name, ...)` is the same "walk definitions + references + exports in this file" logic as the current target-file branch. Today that runs once for the target file; now it runs once per file in the re-export chain, picking up each hop's own `{ pi }` export key and destructuring binding.

### Performance

In practice the worklist is small — re-export chains in real projects are short and narrow. Worst case is linear in the number of files in the workspace (a single linear chain of re-exporters). Each hop does a scan of the importer's symbol table; no quadratic blowup relative to today's behavior.

## Data model changes

None. `importPath` already exists on import-kind defs (from PR #70), and `reverseImports` already gives direct-importer lookups. Re-export detection is a query over existing fields.

## Rename-provider interaction

No changes required in the VS Code extension. `resolveCanonicalFile` still resolves the cursor's symbol back to the origin file. `findAllOccurrences` silently grows to walk the re-export chain. The rename provider's `WorkspaceEdit` loop already handles multi-file edits.

## Testing

Unit tests in `src/languageService/WorkspaceIndex.test.ts`:

1. **Linear chain A → B → C.** Rename `pi` in A. Expect occurrences in all three files: A's `let pi`/export, B's destructuring/export, C's destructuring/use.
2. **Fanout A → {B1, B2}** where both re-export, each with its own importer. Full coverage without double-counting.
3. **Chain cut by non-re-exporter.** A → B (re-exports) → C (imports but doesn't re-export) → D (imports from C). Rename in A hits A, B, C but not D.
4. **Starting from the middle.** Cursor on `pi` in C's use-site. `resolveCanonicalFile` walks C → B → A; `findAllOccurrences` starting from A covers the full chain.
5. **Cycle guard.** A imports from B, B imports from A, both re-export `pi`. No infinite loop, results are dedup'd, the test just asserts termination + expected location count.
6. **Re-exporter has an unrelated local `pi`** in a nested scope. Locality filter (ref must resolve to the import def) continues to exclude it.

## Rollout

- Single PR, stacked on top of PR #70 after merge.
- Release notes: bullet under "language service" — no user-facing API change beyond behavioral fix.

## Open questions

- **Partial re-exports**: what if the re-exporter exports under shorthand but the object is malformed (parse error)? `fileSymbols.exports` is empty for broken files; the chain stops silently. Is that the right behavior? Likely yes — broken files shouldn't be mutated by automated rename anyway.
- **Should `findReferences` (Shift+F12) also follow the chain?** Yes — same fix, same code path, same behavior.
- **When the workspace index has not yet indexed a file in the chain** (e.g. C hasn't been opened), `reverseImports` won't list it, so C's occurrences are missed. This is an existing limitation of the lazy indexing model, not specific to re-exports. Potential follow-up: eager workspace scan on first rename.
