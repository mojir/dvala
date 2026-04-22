/**
 * Workspace-level index that connects per-file symbol tables across imports.
 *
 * Caches FileSymbols per file, tracks the import dependency graph, and provides
 * lookup APIs for Go to Definition, Find References, Document Symbols, and
 * Diagnostics. Falls back to token-scanned definitions when the parser fails.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { tokenize } from '../tokenizer/tokenize'
import { minifyTokenStream } from '../tokenizer/minifyTokenStream'
import { parseRecoverable } from '../parser'
import { builtin } from '../builtin'
import { reservedSymbolRecord } from '../tokenizer/reservedNames'
import { NodeTypes } from '../constants/constants'
import type { AstNode, SourceMap } from '../parser/types'
import type { ParseError } from '../errors'
import { buildSymbolTable } from './SymbolTableBuilder'
import { scanTokensForDefinitions } from './tokenScan'
import type { FileSymbols, ScopeRange, SymbolDef, SymbolRef } from './types'

// All builtin symbol names — used to skip them during reference resolution
const builtinNames = new Set<string>([
  ...Object.keys(builtin.normalExpressions),
  ...Object.keys(builtin.specialExpressions),
  ...Object.keys(reservedSymbolRecord),
])

interface CachedFile {
  /** Content hash to detect changes without re-parsing unchanged files */
  contentHash: string
  /** Full symbol analysis from AST (null if parse failed) */
  symbols: FileSymbols | null
  /** Token-scanned definitions (always available, even for broken files) */
  tokenDefs: SymbolDef[]
}

export class WorkspaceIndex {
  private cache = new Map<string, CachedFile>()
  /** Reverse import graph: file → set of files that import it */
  private reverseImports = new Map<string, Set<string>>()
  /** Workspace roots that have already been eagerly scanned (one-shot per root) */
  private indexedRoots = new Set<string>()

  /**
   * Eagerly index every `.dvala` file under `rootPath` (recursively). Required
   * by transitive-rename correctness: without this, a rename initiated from a
   * file whose re-export chain includes files never opened in the editor
   * would silently drop the un-indexed subtree.
   *
   * One-shot per root — subsequent calls with the same root return
   * immediately. Only files not already in the cache are parsed; files
   * that were indexed previously are left alone, so **stale disk content
   * for a pre-cached file is NOT refreshed here**. Callers that care about
   * freshness past the initial scan should rely on the filesystem watcher
   * (or call `invalidateFile` / `updateFile`).
   *
   * Skips `node_modules`, `.git`, and dotfile directories. Does not honour
   * `.gitignore` today; if that becomes important we can plug in a matcher.
   */
  indexWorkspace(rootPath: string): void {
    const absoluteRoot = path.resolve(rootPath)
    if (this.indexedRoots.has(absoluteRoot)) return
    this.indexedRoots.add(absoluteRoot)
    walkDvalaFiles(absoluteRoot, filePath => {
      if (!this.cache.has(filePath)) this.updateFile(filePath)
    })
  }

  /**
   * Update the index for a single file.
   * Parses the file, builds the symbol table, and updates the import graph.
   * Returns the file symbols (or null if the file doesn't exist).
   */
  updateFile(filePath: string, source?: string): FileSymbols | null {
    const absolutePath = path.resolve(filePath)

    // Read source if not provided
    if (source === undefined) {
      try {
        source = fs.readFileSync(absolutePath, 'utf-8')
      } catch {
        this.cache.delete(absolutePath)
        return null
      }
    }

    // Check if content changed
    const contentHash = simpleHash(source)
    const cached = this.cache.get(absolutePath)
    if (cached && cached.contentHash === contentHash && cached.symbols) {
      return cached.symbols
    }

    // Always produce token-scanned definitions (works on broken files)
    const tokens = tokenize(source, true, absolutePath)
    const tokenDefs = scanTokensForDefinitions(tokens.tokens, absolutePath)

    // Try to parse and build full symbol table
    const minified = minifyTokenStream(tokens, { removeWhiteSpace: true })
    const parseResult = parseRecoverable(minified)

    const { definitions, references, scopeRanges } = buildSymbolTable(
      parseResult.body,
      parseResult.sourceMap,
      absolutePath,
      builtinNames,
    )

    // Extract import paths from the AST
    const imports = new Map<string, string>()
    extractImports(parseResult.body, absolutePath, imports)

    // Extract exported names from the file's final expression (if it's an object literal).
    // This is the standard Dvala module pattern: `let ...; { name1, name2 }`
    const exports = extractExports(parseResult.body, parseResult.sourceMap, absolutePath)

    const fileSymbols: FileSymbols = {
      filePath: absolutePath,
      definitions,
      references,
      imports,
      exports,
      parseErrors: parseResult.errors,
      scopeRanges,
    }

    // Update cache
    this.cache.set(absolutePath, { contentHash, symbols: fileSymbols, tokenDefs })

    // Update reverse import graph
    this.updateReverseImports(absolutePath, imports)

    return fileSymbols
  }

  /**
   * Get file symbols, using cache if available.
   * Does NOT trigger a re-parse — call updateFile() first if the file may have changed.
   */
  getFileSymbols(filePath: string): FileSymbols | null {
    const absolutePath = path.resolve(filePath)
    return this.cache.get(absolutePath)?.symbols ?? null
  }

  /**
   * Get definitions for a file — returns AST definitions if available,
   * falls back to token-scanned definitions.
   */
  getDefinitions(filePath: string): SymbolDef[] {
    const absolutePath = path.resolve(filePath)
    const cached = this.cache.get(absolutePath)
    if (!cached) return []
    return cached.symbols?.definitions ?? cached.tokenDefs
  }

  /**
   * Find the definition of a symbol at a given position.
   * Searches the file's symbol table, then follows imports for cross-file resolution.
   */
  findDefinition(filePath: string, line: number, column: number): SymbolDef | null {
    const absolutePath = path.resolve(filePath)
    const fileSymbols = this.cache.get(absolutePath)?.symbols
    if (!fileSymbols) return null

    // Find the reference at this position
    const ref = findRefAtPosition(fileSymbols.references, line, column)
    if (ref?.resolvedDef) return ref.resolvedDef

    // If unresolved locally, check imported files
    if (ref) {
      for (const importedPath of fileSymbols.imports.values()) {
        const importedSymbols = this.cache.get(importedPath)?.symbols
        if (!importedSymbols) continue
        // Look for a top-level definition with this name in the imported file
        const def = importedSymbols.definitions.find(d => d.name === ref.name && d.scope === 0)
        if (def) return def
      }
    }

    return null
  }

  /**
   * Find all references to a symbol.
   *
   * @deprecated Prefer `findAllOccurrences` for any user-facing workflow.
   * This method matches importer references by name only and so includes
   * unrelated locals that happen to share the name (e.g. a local `let pi`
   * in an importer that doesn't come from the target file). It also does
   * not walk `exports`, so the export-object key `{ pi }` is missed.
   * Retained for existing callers and tests; do not wire new features
   * through it.
   */
  findReferences(filePath: string, symbolName: string): SymbolRef[] {
    const absolutePath = path.resolve(filePath)
    const results: SymbolRef[] = []

    // References in the current file
    const fileSymbols = this.cache.get(absolutePath)?.symbols
    if (fileSymbols) {
      results.push(...fileSymbols.references.filter(r => r.name === symbolName))
    }

    // References in files that import this file
    const importers = this.reverseImports.get(absolutePath)
    if (importers) {
      for (const importerPath of importers) {
        const importerSymbols = this.cache.get(importerPath)?.symbols
        if (importerSymbols) {
          results.push(...importerSymbols.references.filter(r => r.name === symbolName))
        }
      }
    }

    return results
  }

  /**
   * Get the symbol name at a given position (could be a definition or reference site).
   * Returns the name and the definition it resolves to (if any).
   *
   * For aliased destructuring `let { pi as p } = import("./math")`, the
   * binding's `location` points at `p` while `keyLocation` points at `pi`.
   * This method checks both: if the cursor is on the key token, the returned
   * symbol carries the *imported* name (`pi`) and `onKey: true` — signalling
   * to `resolveCanonicalFile` that the user is renaming from the key side
   * (equivalent to originating the rename at the origin). If the cursor is
   * on the local, the returned symbol carries the local name (`p`) and
   * `onKey: false` — signalling that this is a local-only rename.
   */
  getSymbolAtPosition(filePath: string, line: number, column: number): { name: string; def: SymbolDef | null; onKey?: boolean } | null {
    const absolutePath = path.resolve(filePath)
    const fileSymbols = this.cache.get(absolutePath)?.symbols
    if (!fileSymbols) return null

    // Check definitions first (cursor on a `let x = ...` definition site).
    // For aliased bindings, also accept a hit on the KEY token — distinguished
    // by the `onKey` flag so callers can apply key-vs-local rename semantics.
    for (const def of fileSymbols.definitions) {
      if (positionMatches(def.location, line, column, def.name.length)) {
        return { name: def.name, def, onKey: false }
      }
      if (def.keyLocation && def.importedName
        && positionMatches(def.keyLocation, line, column, def.importedName.length)) {
        return { name: def.importedName, def, onKey: true }
      }
    }

    // Check references (cursor on a usage site)
    const refAtPos = findRefAtPosition(fileSymbols.references, line, column)
    if (refAtPos) return { name: refAtPos.name, def: refAtPos.resolvedDef }

    // Finally, check export-object keys. For shorthand `{ pi }` the Str key
    // shares its position with the Sym value (already returned above as a
    // reference); this branch only fires for explicit `{ pi: somePi }` where
    // the key token has no matching def or ref. Returning the export's own
    // SymbolDef is enough for rename — `findAllOccurrences` will include the
    // same entry via its exports walk.
    const exportAtPos = findDefAtPosition(fileSymbols.exports, line, column)
    if (exportAtPos) return { name: exportAtPos.name, def: exportAtPos }

    return null
  }

  /**
   * Resolve the cursor's symbol to the file that owns its canonical definition.
   *
   * When the cursor sits on an import-kind binding (either the destructuring
   * site `let { pi } = import("./lib")` or a use-site like `pi * 2` that
   * resolves to it), this walks the import chain to the ultimate origin so
   * that `findAllOccurrences` starts from the top of the re-export graph and
   * can cover every file in the chain via `reverseImports` traversal.
   *
   * For chains like C → B → A (C imports from B, which re-exports from A),
   * walking one hop at a time wouldn't reach A: `reverseImports[B]` doesn't
   * list A because A doesn't import from B. Hence the iterative walk here.
   *
   * Returns the current file when the symbol is defined locally or when the
   * reference is unresolved. When the cursor is on an import-kind binding
   * whose module path isn't resolvable (e.g. the imported file is missing or
   * not yet indexed), `unresolvedImport` carries the raw path string so the
   * caller can warn the user that the rename is about to be scoped to a
   * single file instead of the full workspace.
   */
  resolveCanonicalFile(
    filePath: string,
    line: number,
    column: number,
  ): { file: string; name: string; unresolvedImport?: string } | null {
    const symbol = this.getSymbolAtPosition(filePath, line, column)
    if (!symbol) return null

    // Aliased-local short-circuit: the cursor sits on the LOCAL side of an
    // aliased destructuring, or on a use-site of that local. Either way the
    // user's intent is a local-only rename — the key side is a separate
    // rename target, never bundled.
    //
    // Detected by: the resolved def has a distinct `keyLocation` (i.e. the
    // binding is aliased) AND the cursor is NOT on the key token. The def-
    // side cursor sets `onKey` explicitly; a use-site ref leaves it
    // undefined — both are handled by `onKey !== true`.
    //
    // This fires for both import and non-import aliased bindings. For
    // non-import the loop below would have exited on the first check
    // (`kind !== 'import'`) and returned the same answer, so the guard is
    // self-contained and doesn't rely on the chain-walk's fall-through
    // happening to be right.
    if (symbol.def?.keyLocation && symbol.onKey !== true) {
      return { file: symbol.def.location.file, name: symbol.name }
    }

    // Follow the import chain upward until we reach a non-import definition
    // (the ultimate origin) or can't resolve a hop. Cycle-guarded via visited.
    let currentDef = symbol.def
    const visited = new Set<string>()
    while (currentDef?.kind === 'import' && currentDef.importPath) {
      // File that owns the current link in the chain — the one whose
      // `imports` map resolves `currentDef.importPath` to the next hop.
      const currentFile = currentDef.location.file
      if (visited.has(currentFile)) break // cycle — stop here
      visited.add(currentFile)

      const currentSymbols = this.getFileSymbols(currentFile)
      const resolvedPath = currentSymbols?.imports.get(currentDef.importPath)
      if (!resolvedPath) {
        return { file: currentFile, name: symbol.name, unresolvedImport: currentDef.importPath }
      }

      // Look for a top-level def of the same name in the next file up.
      // If it's another import-kind def, the loop continues; otherwise
      // we've reached the origin.
      const nextSymbols = this.getFileSymbols(resolvedPath)
      const nextDef = nextSymbols?.definitions.find(d => d.name === symbol.name && d.scope === 0)
      if (!nextDef) {
        // Next file has no matching top-level def (perhaps not indexed, or
        // malformed). Return the resolved path anyway so `findAllOccurrences`
        // at least searches the next file in the chain.
        return { file: resolvedPath, name: symbol.name }
      }
      currentDef = nextDef
    }

    const canonicalFile = currentDef?.location.file ?? path.resolve(filePath)
    return { file: canonicalFile, name: symbol.name }
  }

  /**
   * Find all locations of a symbol: the definition site + all reference sites
   * + export-object keys + destructuring bindings in importing files, and
   * recursively in files that re-export through the chain.
   * Used by "Find All References" and cross-file Rename.
   *
   * `filePath` should be the file that *owns* the definition (i.e. the
   * canonical source). For rename, the provider resolves the cursor's symbol
   * first via `resolveCanonicalFile` and passes that file so the BFS starts
   * from the top of the re-export chain.
   *
   * The BFS walks files that import (directly or transitively via re-exports)
   * the canonical file. An importer B is treated as a re-exporter — and
   * enqueued as a new BFS root — when B has a matching import-kind binding
   * from the current file AND B's trailing object exports the same name
   * with the value-side Sym resolving back to that import-kind binding.
   *
   * Occurrences are deduplicated by (file, line, column) because Dvala's
   * shorthand `{ pi }` produces two AST nodes (Str key + Sym value) at the
   * same source position.
   */
  findAllOccurrences(filePath: string, symbolName: string): { file: string; line: number; column: number; nameLength: number }[] {
    const absolutePath = path.resolve(filePath)
    const results: { file: string; line: number; column: number; nameLength: number }[] = []
    const seen = new Set<string>()
    const push = (loc: { file: string; line: number; column: number }, nameLength: number): void => {
      const key = `${loc.file}:${loc.line}:${loc.column}`
      if (seen.has(key)) return
      seen.add(key)
      results.push({ ...loc, nameLength })
    }

    // Collect from the origin file broadly (all defs/refs/exports matching
    // by name). This is the canonical binding's home — any same-named
    // occurrence in the origin is treated as the same rename target.
    const originSymbols = this.cache.get(absolutePath)?.symbols
    if (originSymbols) {
      for (const def of originSymbols.definitions) {
        if (def.name === symbolName) push(def.location, def.name.length)
        // Aliased bindings whose IMPORTED key matches `symbolName` contribute
        // their KEY location too. This covers non-import aliased keys (e.g.
        // `let { pi as p } = { pi: 3.14 }` with cursor on `pi`) — for these,
        // `resolveCanonicalFile` returns the current file with name=`pi`,
        // and we want the rename to at least edit the key token so the
        // user's F2 isn't a silent no-op. Import aliased bindings don't
        // land here because their canonical file is the origin (not this
        // file), which has `let pi = ...` matched via the def.name branch.
        if (def.keyLocation && def.importedName === symbolName && def.name !== symbolName) {
          push(def.keyLocation, def.importedName.length)
        }
      }
      for (const ref of originSymbols.references) {
        if (ref.name === symbolName) push(ref.location, ref.name.length)
      }
      for (const exp of originSymbols.exports) {
        if (exp.name === symbolName) push(exp.location, exp.name.length)
      }
    }

    // BFS over the re-export graph. Each worklist entry is a file whose
    // importers we haven't yet walked. Re-exporters enqueue themselves so
    // their own importers are reached in the next round.
    //
    // Unlike the origin, re-exporters are walked NARROWLY: only the import-
    // kind defs pointing back at the current BFS parent + refs resolving to
    // those defs + the exported key. Walking them broadly would pick up
    // unrelated same-named locals nested in the re-exporter.
    const worklist: string[] = [absolutePath]
    const visited = new Set<string>([absolutePath])

    while (worklist.length > 0) {
      const current = worklist.shift()!
      const importers = this.reverseImports.get(current)
      if (!importers) continue

      for (const importerPath of importers) {
        const importerSymbols = this.cache.get(importerPath)?.symbols
        if (!importerSymbols) continue
        // Note: we do NOT skip importers already in `visited`. In diamond
        // topologies — say C imports from both A and B where B re-exports
        // from A — C has two separate destructuring sites. A's pass sees
        // one via `resolved === A`, B's pass sees the other via
        // `resolved === B`. Skipping on revisit would drop real occurrences.

        // Matching import-kind defs: `let { pi } = import("./current")` or
        // `let { pi as p } = import("./current")`. For shorthand, `def.name`
        // is both the imported key and the local. For aliased, `def.name` is
        // the local and `def.importedName` holds the imported key. Rename of
        // an origin `pi` must update every importer's KEY occurrence but
        // must never touch an aliased local or its use-sites.
        //
        // `keyLocation` is the discriminator: present ⇔ the binding is
        // aliased. Absent ⇔ shorthand (key and local share one token).
        const matchingImportDefs = new Set<SymbolDef>()
        for (const def of importerSymbols.definitions) {
          if (def.kind !== 'import' || !def.importPath) continue
          const resolved = importerSymbols.imports.get(def.importPath)
          if (resolved !== current) continue

          const isAliased = def.keyLocation !== undefined
          if (!isAliased && def.name === symbolName) {
            // Shorthand `{ pi }` — rename the whole token.
            matchingImportDefs.add(def)
            push(def.location, def.name.length)
          } else if (isAliased && def.importedName === symbolName) {
            // Aliased `{ pi as p }` — rename the KEY only. The local (def.name)
            // and its use-sites stay as the user authored them.
            matchingImportDefs.add(def)
            push(def.keyLocation!, def.importedName.length)
          }
        }

        // References resolving back to those import-kind defs. Filtering by
        // resolvedDef identity excludes unrelated locals with the same name.
        // For aliased imports, use-site refs target the LOCAL name (`p`) not
        // the imported name (`pi`) — so `ref.name !== symbolName` already
        // excludes them. No extra gate needed.
        for (const ref of importerSymbols.references) {
          if (ref.name !== symbolName) continue
          if (ref.resolvedDef && matchingImportDefs.has(ref.resolvedDef)) {
            push(ref.location, ref.name.length)
          }
        }

        // If this importer re-exports the name, include its export-object
        // key (for shorthand `{ pi }` this dedups with the Sym value already
        // recorded; for explicit `{ pi: localSym }` the key is a distinct
        // token that needs its own occurrence), then enqueue the importer
        // so its own importers are walked next round.
        if (matchingImportDefs.size > 0 && isReexport(importerSymbols, symbolName, matchingImportDefs)) {
          for (const exp of importerSymbols.exports) {
            if (exp.name === symbolName) push(exp.location, exp.name.length)
          }
          if (!visited.has(importerPath)) {
            visited.add(importerPath)
            worklist.push(importerPath)
          }
        }
      }
    }

    return results
  }

  /**
   * Get top-level document symbols for the outline view.
   */
  getDocumentSymbols(filePath: string): SymbolDef[] {
    const defs = this.getDefinitions(filePath)
    return defs.filter(d => d.scope === 0)
  }

  /**
   * Get all symbols visible at a given position in a file.
   * Includes top-level definitions defined before the cursor,
   * plus definitions from all enclosing scope ranges.
   */
  getSymbolsInScope(filePath: string, line: number, column: number): SymbolDef[] {
    const absolutePath = path.resolve(filePath)
    const fileSymbols = this.cache.get(absolutePath)?.symbols
    if (!fileSymbols) {
      // Fall back to token-scanned definitions (all top-level)
      return this.cache.get(absolutePath)?.tokenDefs ?? []
    }

    const result: SymbolDef[] = []
    const seen = new Set<string>()

    // Collect definitions from enclosing scope ranges (innermost first for shadowing)
    // Sort by area ascending so inner scopes come first
    const enclosing = fileSymbols.scopeRanges
      .filter(sr => positionInRange(line, column, sr))
      .sort((a, b) => rangeArea(a) - rangeArea(b))

    for (const scope of enclosing) {
      for (const def of scope.definitions) {
        if (!seen.has(def.name)) {
          seen.add(def.name)
          result.push(def)
        }
      }
    }

    // Add top-level definitions that appear before the cursor position
    // (let bindings are sequential — can't reference a name before it's defined)
    for (const def of fileSymbols.definitions) {
      if (def.scope !== 0) continue
      if (seen.has(def.name)) continue
      if (def.location.line < line || (def.location.line === line && def.location.column <= column)) {
        seen.add(def.name)
        result.push(def)
      }
    }

    return result
  }

  /**
   * Get diagnostics for a file: parse errors + unresolved symbol references.
   */
  getDiagnostics(filePath: string): { parseErrors: ParseError[]; unresolvedRefs: SymbolRef[] } {
    const absolutePath = path.resolve(filePath)
    const fileSymbols = this.cache.get(absolutePath)?.symbols
    if (!fileSymbols) {
      return { parseErrors: [], unresolvedRefs: [] }
    }
    const unresolvedRefs = fileSymbols.references.filter(r => r.resolvedDef === null)
    return { parseErrors: fileSymbols.parseErrors, unresolvedRefs }
  }

  /**
   * Invalidate a file and all files that depend on it.
   */
  invalidateFile(filePath: string): void {
    const absolutePath = path.resolve(filePath)
    this.cache.delete(absolutePath)
    // Also invalidate dependents (they may have stale cross-file references)
    const dependents = this.reverseImports.get(absolutePath)
    if (dependents) {
      for (const dep of dependents) {
        this.cache.delete(dep)
      }
    }
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private updateReverseImports(filePath: string, imports: Map<string, string>): void {
    // Remove old reverse import entries for this file
    for (const [, importers] of this.reverseImports) {
      importers.delete(filePath)
    }
    // Add new entries
    for (const resolvedPath of imports.values()) {
      let importers = this.reverseImports.get(resolvedPath)
      if (!importers) {
        importers = new Set()
        this.reverseImports.set(resolvedPath, importers)
      }
      importers.add(filePath)
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** True when (line, column) falls within the `nameLength` span starting at `loc`. */
function positionMatches(loc: { line: number; column: number }, line: number, column: number, nameLength: number): boolean {
  return loc.line === line && column >= loc.column && column < loc.column + nameLength
}

/** Find the definition at a given source position. */
function findDefAtPosition(defs: SymbolDef[], line: number, column: number): SymbolDef | null {
  for (const def of defs) {
    if (positionMatches(def.location, line, column, def.name.length)) {
      return def
    }
  }
  return null
}

/** Find the reference at a given source position (cursor must be within the name span). */
function findRefAtPosition(refs: SymbolRef[], line: number, column: number): SymbolRef | null {
  for (const ref of refs) {
    if (ref.location.line === line
      && column >= ref.location.column
      && column < ref.location.column + ref.name.length) {
      return ref
    }
  }
  return null
}

/**
 * Extract exported symbol names from the file's return value.
 * Detects the Dvala module pattern where the last expression is an object literal:
 *   `let ...; { pi: ..., e: ... }`
 * The object keys become the file's exports.
 */
function extractExports(nodes: AstNode[], sourceMap: SourceMap | undefined, filePath: string): SymbolDef[] {
  if (nodes.length === 0) return []
  const lastNode = nodes[nodes.length - 1]!
  if (lastNode[0] !== NodeTypes.Object) return []

  const exports: SymbolDef[] = []
  const entries = lastNode[1] as (AstNode[] | AstNode)[]
  for (const entry of entries) {
    // Key-value pair: [keyNode, valueNode] where keyNode is a Str node
    if (Array.isArray(entry) && Array.isArray(entry[0])) {
      const [keyNode, valueNode] = entry as [AstNode, AstNode]
      if (keyNode[0] === NodeTypes.Str) {
        const name = keyNode[1] as string
        const nodeId = keyNode[2]
        const location = resolveLocation(nodeId, sourceMap, filePath)
        const exportDef: SymbolDef = { name, kind: 'variable', nodeId, location, scope: 0 }
        // Capture the value-side nodeId when the value is a single Sym so that
        // re-export detection can verify the export actually points at the
        // imported binding (vs. an unrelated local under a colliding name).
        if (valueNode && valueNode[0] === NodeTypes.Sym) {
          exportDef.valueNodeId = valueNode[2]
        }
        exports.push(exportDef)
      }
    }
  }
  return exports
}

/** Resolve a node ID to a source location. */
function resolveLocation(nodeId: number, sourceMap: SourceMap | undefined, filePath: string): { file: string; line: number; column: number } {
  if (!sourceMap) return { file: filePath, line: 0, column: 0 }
  const pos = sourceMap.positions.get(nodeId)
  if (!pos) return { file: filePath, line: 0, column: 0 }
  const source = sourceMap.sources[pos.source]
  return {
    file: source?.path ?? filePath,
    line: pos.start[0] + 1,
    column: pos.start[1] + 1,
  }
}

/** Extract import paths from AST nodes and resolve them to absolute paths. */
function extractImports(nodes: AstNode[], fromFile: string, imports: Map<string, string>): void {
  for (const node of nodes) {
    walkForImports(node, fromFile, imports)
  }
}

/** Known AST node type strings — used to identify AstNode tuples in payload arrays. */
const knownNodeTypes = new Set<string>(Object.values(NodeTypes))

/** Check if a value looks like an AstNode: [knownType, payload, number]. */
function isAstNode(value: unknown): value is AstNode {
  return Array.isArray(value)
    && value.length === 3
    && typeof value[0] === 'string'
    && knownNodeTypes.has(value[0])
    && typeof value[2] === 'number'
}

function walkForImports(node: AstNode, fromFile: string, imports: Map<string, string>): void {
  const [type, payload] = node
  if (type === NodeTypes.Import) {
    const importPath = payload as string
    // Only resolve relative imports (builtin modules like "functional" are not files)
    if (importPath.startsWith('.') || importPath.startsWith('/')) {
      const dir = path.dirname(fromFile)
      const resolved = resolveImportPath(path.resolve(dir, importPath))
      if (resolved) {
        imports.set(importPath, resolved)
      }
    }
    return
  }
  // Recurse into payload to find nested imports (e.g., inside let bindings)
  if (Array.isArray(payload)) {
    for (const child of payload) {
      if (isAstNode(child)) {
        walkForImports(child, fromFile, imports)
      } else if (Array.isArray(child)) {
        for (const c of child) {
          if (isAstNode(c)) {
            walkForImports(c, fromFile, imports)
          }
        }
      }
    }
  }
}

/** Resolve an import path, trying the exact path then with .dvala extension. */
function resolveImportPath(filePath: string): string | null {
  if (fs.existsSync(filePath)) return filePath
  const withExt = `${filePath}.dvala`
  if (fs.existsSync(withExt)) return withExt
  return null
}

/** Check if a 1-based position is inside a scope range. */
function positionInRange(line: number, column: number, range: ScopeRange): boolean {
  if (line < range.startLine || line > range.endLine) return false
  if (line === range.startLine && column < range.startColumn) return false
  if (line === range.endLine && column > range.endColumn) return false
  return true
}

/** Approximate area of a scope range (for sorting inner-before-outer). */
function rangeArea(range: ScopeRange): number {
  return (range.endLine - range.startLine) * 100000 + (range.endColumn - range.startColumn)
}

/**
 * Decide whether `file` re-exports `name` from one of the given import defs.
 *
 * A re-export requires:
 *  1. An entry in `file.exports` with matching name (the trailing object
 *     has `{ name, ... }` or `{ name: ... }`).
 *  2. The value-side expression of that export entry is a Sym whose ref
 *     resolves back to one of the import defs (i.e., the exported value
 *     really is the imported binding, not an unrelated same-named local).
 *
 * Without (2), a file that imports `pi` from A but exports an unrelated
 * local under the name `pi` (`{ pi: pi2 }`) would be misclassified as a
 * re-exporter, dragging A's rename into it.
 *
 * The Sym lookup uses the export's `valueNodeId`, captured during
 * `extractExports`. When the export value is a non-Sym expression
 * (`{ pi: 1 + 1 }`), `valueNodeId` is undefined and this check returns false.
 */
function isReexport(
  fileSymbols: FileSymbols,
  name: string,
  matchingImportDefs: Set<SymbolDef>,
): boolean {
  for (const exp of fileSymbols.exports) {
    if (exp.name !== name) continue
    if (exp.valueNodeId === undefined) continue
    const valueRef = fileSymbols.references.find(r => r.nodeId === exp.valueNodeId)
    if (valueRef?.resolvedDef && matchingImportDefs.has(valueRef.resolvedDef)) {
      return true
    }
  }
  return false
}

/**
 * Recursively visit every `.dvala` file under `dir`, invoking `visit(filePath)`
 * for each. Skips `node_modules`, `.git`, and dotfile directories.
 */
function walkDvalaFiles(dir: string, visit: (filePath: string) => void): void {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    if (entry.name === 'node_modules') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkDvalaFiles(full, visit)
    } else if (entry.isFile() && entry.name.endsWith('.dvala')) {
      visit(full)
    }
  }
}

/** Simple string hash for change detection. */
function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0 // Convert to 32-bit integer
  }
  return hash.toString(36)
}
