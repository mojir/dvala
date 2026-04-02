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
import { NodeTypes } from '../constants/constants'
import type { AstNode } from '../parser/types'
import type { ParseError } from '../errors'
import { buildSymbolTable } from './SymbolTableBuilder'
import { scanTokensForDefinitions } from './tokenScan'
import type { FileSymbols, SymbolDef, SymbolRef } from './types'

// All builtin symbol names — used to skip them during reference resolution
const builtinNames = new Set<string>([
  ...Object.keys(builtin.normalExpressions),
  ...Object.keys(builtin.specialExpressions),
  'true', 'false', 'null', 'E', 'PI', 'Infinity',
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

    const { definitions, references } = buildSymbolTable(
      parseResult.body,
      parseResult.sourceMap,
      absolutePath,
      builtinNames,
    )

    // Extract import paths from the AST
    const imports = new Map<string, string>()
    extractImports(parseResult.body, absolutePath, imports)

    const fileSymbols: FileSymbols = {
      filePath: absolutePath,
      definitions,
      references,
      imports,
      parseErrors: parseResult.errors,
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
   * Searches the current file and all files that import it.
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
   * Get top-level document symbols for the outline view.
   */
  getDocumentSymbols(filePath: string): SymbolDef[] {
    const defs = this.getDefinitions(filePath)
    return defs.filter(d => d.scope === 0)
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

/** Find the reference closest to a given source position. */
function findRefAtPosition(refs: SymbolRef[], line: number, column: number): SymbolRef | null {
  // Find exact line match first, then closest column
  const onLine = refs.filter(r => r.location.line === line)
  if (onLine.length === 0) return null
  // Find the ref whose column is closest to (but not after) the given column
  let best: SymbolRef | null = null
  for (const ref of onLine) {
    if (ref.location.column <= column) {
      if (!best || ref.location.column > best.location.column) {
        best = ref
      }
    }
  }
  return best
}

/** Extract import paths from AST nodes and resolve them to absolute paths. */
function extractImports(nodes: AstNode[], fromFile: string, imports: Map<string, string>): void {
  for (const node of nodes) {
    walkForImports(node, fromFile, imports)
  }
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
      if (Array.isArray(child) && child.length === 3 && typeof child[0] === 'string' && typeof child[2] === 'number') {
        walkForImports(child as AstNode, fromFile, imports)
      } else if (Array.isArray(child)) {
        for (const c of child) {
          if (Array.isArray(c) && c.length === 3 && typeof c[0] === 'string' && typeof c[2] === 'number') {
            walkForImports(c as AstNode, fromFile, imports)
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
