/**
 * Shared types for the Dvala language service.
 */

import type { ParseError } from '../errors'

export interface SymbolLocation {
  file: string
  line: number // 1-based
  column: number // 1-based
}

export interface SymbolDef {
  name: string
  kind: 'variable' | 'function' | 'macro' | 'handler' | 'parameter' | 'import'
  nodeId: number
  location: SymbolLocation
  scope: number // depth in scope chain (0 = top-level)
  /** Parameter names for function/macro definitions (e.g. ['a', 'b'] for `let add = (a, b) -> ...`) */
  params?: string[]
}

export interface SymbolRef {
  name: string
  nodeId: number
  location: SymbolLocation
  resolvedDef: SymbolDef | null // null = unresolved (→ diagnostic)
}

/**
 * A scope range tracks the source region where a set of definitions are visible.
 * Used for scope-aware completions: given a cursor position, find all enclosing
 * scope ranges to determine which symbols are in scope.
 */
export interface ScopeRange {
  /** Start of the scope (1-based, inclusive) */
  startLine: number
  startColumn: number
  /** End of the scope (1-based, inclusive) */
  endLine: number
  endColumn: number
  /** Definitions introduced in this scope (parameters, let bindings, etc.) */
  definitions: SymbolDef[]
}

export interface FileSymbols {
  filePath: string
  definitions: SymbolDef[]
  references: SymbolRef[]
  imports: Map<string, string> // import path → resolved absolute path
  /** Exported names from the file's return object (e.g. `{ pi, e }` at file end) */
  exports: SymbolDef[]
  parseErrors: ParseError[]
  /** Scope ranges for position-aware symbol lookup */
  scopeRanges: ScopeRange[]
}
