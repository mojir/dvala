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
}

export interface SymbolRef {
  name: string
  nodeId: number
  location: SymbolLocation
  resolvedDef: SymbolDef | null // null = unresolved (→ diagnostic)
}

export interface FileSymbols {
  filePath: string
  definitions: SymbolDef[]
  references: SymbolRef[]
  imports: Map<string, string> // import path → resolved absolute path
  parseErrors: ParseError[]
}
