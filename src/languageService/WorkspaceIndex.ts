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
   */
  getSymbolAtPosition(filePath: string, line: number, column: number): { name: string; def: SymbolDef | null } | null {
    const absolutePath = path.resolve(filePath)
    const fileSymbols = this.cache.get(absolutePath)?.symbols
    if (!fileSymbols) return null

    // Check definitions first (cursor on a `let x = ...` definition site)
    const defAtPos = findDefAtPosition(fileSymbols.definitions, line, column)
    if (defAtPos) return { name: defAtPos.name, def: defAtPos }

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
   * resolves to it), this returns the imported module's path so that
   * `findAllOccurrences` starts from there and picks up the original `let pi`
   * and the `{ pi }` export key.
   *
   * Returns the current file when the symbol is defined locally or when the
   * reference is unresolved. When the cursor is on an import-kind binding
   * whose module path isn't resolvable (e.g. the imported file is missing or
   * not yet indexed), `unresolvedImport` carries the raw path string so the
   * caller can warn the user that the rename is about to be scoped to a
   * single file instead of the full workspace.
   *
   * Invariant (for the `kind === 'import'` branch): when the cursor lands on
   * a reference, `SymbolTableBuilder` always resolves references against the
   * same file's scope chain, so `symbol.def.location.file` equals
   * `path.resolve(filePath)`. We still use the def's location to read the
   * imports map because it's the same map and it documents the intent.
   */
  resolveCanonicalFile(
    filePath: string,
    line: number,
    column: number,
  ): { file: string; name: string; unresolvedImport?: string } | null {
    const symbol = this.getSymbolAtPosition(filePath, line, column)
    if (!symbol) return null
    let canonicalFile = symbol.def?.location.file ?? path.resolve(filePath)
    let unresolvedImport: string | undefined
    if (symbol.def?.kind === 'import' && symbol.def.importPath) {
      const importerSymbols = this.getFileSymbols(symbol.def.location.file)
      const resolved = importerSymbols?.imports.get(symbol.def.importPath)
      if (resolved) canonicalFile = resolved
      else unresolvedImport = symbol.def.importPath
    }
    return unresolvedImport
      ? { file: canonicalFile, name: symbol.name, unresolvedImport }
      : { file: canonicalFile, name: symbol.name }
  }

  /**
   * Find all locations of a symbol: the definition site + all reference sites
   * + export-object keys + destructuring bindings in importing files.
   * Used by "Find All References" and cross-file Rename.
   *
   * `filePath` should be the file that *owns* the definition (i.e. the
   * canonical source). For rename, the provider resolves the cursor's symbol
   * first and passes `resolvedDef.location.file` so that starting from either
   * the defining file or an importer yields the same result set.
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

    // Collect from the defining file.
    const fileSymbols = this.cache.get(absolutePath)?.symbols
    if (fileSymbols) {
      for (const def of fileSymbols.definitions) {
        if (def.name === symbolName) push(def.location, def.name.length)
      }
      for (const ref of fileSymbols.references) {
        if (ref.name === symbolName) push(ref.location, ref.name.length)
      }
      // Export-object keys like `{ pi }` live in a separate list — each
      // entry's location points at the key token, which for shorthand is
      // the same token that also appears as a Sym reference (deduped above).
      for (const exp of fileSymbols.exports) {
        if (exp.name === symbolName) push(exp.location, exp.name.length)
      }
    }

    // Collect from files that import the defining file.
    const importers = this.reverseImports.get(absolutePath)
    if (importers) {
      for (const importerPath of importers) {
        const importerSymbols = this.cache.get(importerPath)?.symbols
        if (!importerSymbols) continue

        // Import-kind destructuring bindings matching the name whose RHS
        // import path resolves to our target file. `importPath` on the def is
        // the raw string (e.g. "./lib"); the importer's `imports` map
        // resolves it to an absolute path.
        const matchingImportDefs = new Set<SymbolDef>()
        for (const def of importerSymbols.definitions) {
          if (def.kind !== 'import' || def.name !== symbolName || !def.importPath) continue
          const resolved = importerSymbols.imports.get(def.importPath)
          if (resolved === absolutePath) {
            matchingImportDefs.add(def)
            push(def.location, def.name.length)
          }
        }

        // Only include references that resolve back to one of those
        // destructuring bindings. This filters out unrelated locals — e.g.
        // a second `let pi = 42` elsewhere in the same importer.
        for (const ref of importerSymbols.references) {
          if (ref.name !== symbolName) continue
          if (ref.resolvedDef && matchingImportDefs.has(ref.resolvedDef)) {
            push(ref.location, ref.name.length)
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

/** Find the definition at a given source position. */
function findDefAtPosition(defs: SymbolDef[], line: number, column: number): SymbolDef | null {
  for (const def of defs) {
    if (def.location.line === line && column >= def.location.column && column < def.location.column + def.name.length) {
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
      const keyNode = (entry as [AstNode, AstNode])[0]
      if (keyNode[0] === NodeTypes.Str) {
        const name = keyNode[1] as string
        const nodeId = keyNode[2]
        const location = resolveLocation(nodeId, sourceMap, filePath)
        exports.push({ name, kind: 'variable', nodeId, location, scope: 0 })
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
