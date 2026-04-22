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
  /**
   * For kind === 'import' definitions, the raw import-path string from the RHS
   * `import("...")` call (e.g. "./lib"). Resolve to an absolute file path via
   * the owning file's `imports` map. Used by cross-file rename to link a
   * destructuring binding back to its source module.
   */
  importPath?: string
  /**
   * For exports extracted from a file's trailing `{ key: value }` object,
   * the nodeId of the value-side expression (only set when the value is a
   * single Sym node — either shorthand `{ pi }` or explicit `{ pi: localSym }`).
   * Used by cross-file rename to verify that a named export actually
   * re-exports an imported binding (vs. exporting an unrelated local under
   * a colliding name).
   */
  valueNodeId?: number
  /**
   * For object-destructuring bindings, the external (exported) key this
   * binding was destructured from. For shorthand `{ pi }` this equals
   * `name`; for aliased `{ pi as p }` the local `name` is `p` and
   * `importedName` is `pi`. Used by the rename refactor to identify the
   * key-side occurrence distinctly from the local-side occurrence.
   */
  importedName?: string
  /**
   * Source location of the KEY token in an object-destructuring binding.
   * For shorthand this coincides with `location`; for aliased bindings it
   * points at the key, while `location` points at the local. Used by
   * rename to edit the key independently of the local.
   */
  keyLocation?: SymbolLocation
  /**
   * The key token's nodeId — the same value carried on the parser's
   * `ObjectBindingEntry.keyNodeId`. Enables rename/go-to-definition on the
   * key token to find this SymbolDef without walking back through the AST.
   */
  keyNodeId?: number
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
