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
3. The export's value-side `Sym` resolves to that import def.

Step 3 is **not** optional: although import-side destructuring is shorthand-only, export-side aliasing is already allowed (`{ pi: pi2 }`). Without this check, a file that imports `pi` from A but exports an unrelated local under the name `pi` — e.g.

```
let { pi } = import("./A")
let pi2 = 42
{ pi: pi2 }
```

— would be misclassified as a re-exporter and drag A's rename into it.

In practice, step 3 is a lookup: find the `SymbolRef` at the export entry's value position (for shorthand `{ pi }`, same token as the key; for explicit `{ pi: expr }`, the `Sym` at the value's source range) and check that `ref.resolvedDef` is in the matching-import-defs set. When the value is a non-`Sym` expression (`{ pi: 1 + 1 }`), the check fails and B is correctly not a re-exporter.

### Algorithm

Traversal order (BFS vs DFS) doesn't affect correctness — results are accumulated into a shared dedup set — so we pick whichever is cheapest. A queue (`shift`) avoids revisiting deeply-nested re-export branches before siblings and keeps the worklist shallow in fanout-heavy cases.

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
    (file, name) = worklist.shift()
    # Cycle / duplicate-enqueue guard is applied on pop, not on push:
    # the same file may be enqueued multiple times (e.g. fanout where two
    # re-exporters both re-export into a third), but only processed once.
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

### `resolveCanonicalFile` — walk to the ultimate origin

Today's `resolveCanonicalFile` (in `src/languageService/WorkspaceIndex.ts`) follows `def.importPath` **exactly one hop**. That was sufficient for PR #70 because direct-importer coverage was the only cross-file edge. With re-export chains it isn't: if the cursor sits on `pi` in C where `C` imports from B and B re-exports from A, the one-hop walk lands on B, and the BFS from B never reaches A (A is an exporter to B, not an importer of B — `reverseImports[B]` doesn't list it).

Fix: iterate until the resolved def is not `kind: 'import'` (or until we'd revisit a file). Pseudocode:

```
function resolveCanonicalFile(filePath, line, column):
  symbol = getSymbolAtPosition(filePath, line, column)
  if not symbol: return null

  current = symbol
  visited = new Set<string>()
  while current.def and current.def.kind == 'import' and current.def.importPath:
    importerFile = current.def.location.file
    if importerFile in visited: break  # cycle guard
    visited.add(importerFile)

    importerSymbols = getFileSymbols(importerFile)
    resolved = importerSymbols?.imports.get(current.def.importPath)
    if not resolved:
      # unresolved import (e.g. file missing / not indexed) — stop here
      return { file: current.def.location.file, name: current.name,
               unresolvedImport: current.def.importPath }

    # Re-resolve `name` against the next file up the chain. If it is also
    # destructured there as an import binding, the loop continues; otherwise
    # we've reached the origin.
    nextSymbols = getFileSymbols(resolved)
    nextDef = nextSymbols?.definitions.find(d => d.name == current.name && d.scope == 0)
    if not nextDef: break
    current = { name: current.name, def: nextDef }

  return { file: current.def?.location.file ?? path.resolve(filePath),
           name: current.name }
```

The BFS then starts from the true origin, so `reverseImports[A]` reaches B, `reverseImports[B]` reaches C, and the full chain is covered regardless of where the rename was initiated.

### Where this differs from the current implementation

- `resolveCanonicalFile` walks to the ultimate origin instead of one hop.
- `visitedFiles` guards against cycles (A imports B imports A would otherwise loop).
- `(c)` is the new hop: when an importer re-exports the name, the importer itself becomes the next search root.
- The results accumulate across hops and dedup via the shared `seen` set.
- `collect(file, name, ...)` is the same "walk definitions + references + exports in this file" logic as the current target-file branch. Today that runs once for the target file; now it runs once per file in the re-export chain, picking up each hop's own `{ pi }` export key and destructuring binding.

### Performance

In practice the worklist is small — re-export chains in real projects are short and narrow. Worst case is linear in the number of files in the workspace (a single linear chain of re-exporters). Each hop does a scan of the importer's symbol table; no quadratic blowup relative to today's behavior.

## Data model changes

None. `importPath` already exists on import-kind defs (from PR #70), and `reverseImports` already gives direct-importer lookups. Re-export detection is a query over existing fields.

## Rename-provider interaction

No changes required in the VS Code extension. `resolveCanonicalFile` grows internally to walk the full chain back to the origin, but keeps its return shape. `findAllOccurrences` silently grows to walk the re-export chain. The rename provider's `WorkspaceEdit` loop already handles multi-file edits.

## Testing

Unit tests in `src/languageService/WorkspaceIndex.test.ts`:

1. **Linear chain A → B → C.** Rename `pi` in A. Expect occurrences in all three files: A's `let pi`/export, B's destructuring/export, C's destructuring/use.
2. **Fanout A → {B1, B2}** where both re-export, each with its own importer. Full coverage without double-counting.
3. **Chain cut by non-re-exporter.** A → B (re-exports) → C (imports but doesn't re-export) → D (imports from C). Rename in A hits A, B, C but not D.
4. **Starting from the middle.** Cursor on `pi` in C's use-site. `resolveCanonicalFile` walks C → B → A; `findAllOccurrences` starting from A covers the full chain.
5. **Cycle guard.** A imports from B, B imports from A, both re-export `pi`. No infinite loop, results are dedup'd, the test just asserts termination + expected location count.
6. **Re-exporter has an unrelated local `pi`** in a nested scope. Locality filter (ref must resolve to the import def) continues to exclude it.
7. **False-positive re-export detection.** B imports `pi` from A but its export object is `{ pi: pi2 }` where `pi2` is an unrelated local. B must NOT be treated as a re-exporter; renaming `pi` in A must not touch B's `{ pi: pi2 }` key. This pins the step-3 value-resolution check.

## Rollout

- Single PR, stacked on top of PR #70 after merge.
- Release notes: bullet under "language service" — no user-facing API change beyond behavioral fix.

## Eager workspace indexing (sub-task, lands with this PR)

Lazy indexing — the workspace only knows about files VS Code has opened — was acceptable for PR #70 because a missing importer loses at most one hop of rename coverage. Transitive rename amplifies this: an un-indexed re-exporter silently drops its entire subtree of downstream importers. A user opens A, renames `pi`, and has no way to tell whether the rename is complete or whether three unopened files with `let { pi } = import("./A")` were skipped.

This is no longer a "potential follow-up" — shipping transitive rename without it is a correctness regression in user perception. Scope for this PR:

1. On first invocation of `findAllOccurrences` (or the rename provider), eagerly walk the workspace root (respecting `.gitignore`) and call `updateFile` for every `.dvala` file not already cached.
2. Gate by a one-shot flag on `WorkspaceIndex` so subsequent renames don't re-scan.
3. File watcher already keeps the index fresh after the initial scan — no additional invalidation needed.
4. Test: rename in a workspace where only the origin file has been opened; assert all importers in the chain are updated.

If the workspace is very large (10k+ files), the eager scan will take seconds. Acceptable for a first rename; if it becomes a problem, a future optimisation can parse only the top-level structure (imports + exports) without running the full symbol-table builder.

## Open questions

- **Partial re-exports**: what if the re-exporter exports under shorthand but the object is malformed (parse error)? `fileSymbols.exports` is empty for broken files; the chain stops silently. Is that the right behavior? Likely yes — broken files shouldn't be mutated by automated rename anyway.
- **Should `findReferences` (Shift+F12) also follow the chain?** Yes — same fix, same code path, same behavior.
