/**
 * Editor-facing portable types shared between the VS Code extension and the
 * playground's Monaco-based language service. These types are DOM-free and
 * carry no dependency on `vscode`, Monaco, or any browser-only API so they
 * can be imported by a Web Worker bundle.
 *
 * Position convention: **1-based** for both line and column. This matches
 * Monaco's `IPosition` and the existing `SymbolLocation` shape used by the
 * language service. Adapters at editor boundaries (VS Code: 0-based) are
 * responsible for converting before calling into the shared modules.
 */

export interface Position {
  line: number
  column: number
}

export interface Range {
  start: Position
  end: Position
}

export interface Diagnostic {
  message: string
  range: Range
  severity: 'error' | 'warning' | 'info'
  source: 'dvala' | 'dvala-types'
}
