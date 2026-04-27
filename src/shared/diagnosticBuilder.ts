/**
 * Convert language-service signals (parse errors, unresolved references,
 * type-check diagnostics) into the portable `Diagnostic` shape consumed by
 * editor adapters. The adapters (VS Code's `vscode.Diagnostic`, Monaco's
 * `IMarkerData`) translate from this shape to their host-specific types.
 *
 * All ranges are emitted as **1-based** positions (Monaco's native shape).
 * VS Code adapters subtract 1 at their boundary; the playground worker
 * passes them through to Monaco unchanged.
 */

import type { ParseError } from '../errors'
import type { SymbolRef } from '../languageService/types'
import type { TypecheckResult } from '../typechecker/typecheck'
import type { Diagnostic, Range } from './types'

/** Build a 1-based single-character range starting at the given position. */
function pointRange(line: number, column: number): Range {
  const safeLine = Math.max(1, line)
  const safeCol = Math.max(1, column)
  return {
    start: { line: safeLine, column: safeCol },
    end: { line: safeLine, column: safeCol + 1 },
  }
}

/**
 * Build diagnostics for parse errors. Errors without source info are dropped
 * (no place to anchor a marker) — the same behavior the VS Code extension
 * inlined.
 */
export function buildParseDiagnostics(parseErrors: ParseError[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  for (const err of parseErrors) {
    if (!err.sourceCodeInfo) continue
    diagnostics.push({
      message: err.message,
      range: pointRange(err.sourceCodeInfo.position.line, err.sourceCodeInfo.position.column),
      severity: 'error',
      source: 'dvala',
    })
  }
  return diagnostics
}

/**
 * Build diagnostics for unresolved symbol references. Each ref produces a
 * range covering the full symbol-name span so the squiggle aligns with the
 * identifier rather than a single cell.
 */
export function buildSymbolDiagnostics(unresolvedRefs: SymbolRef[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  for (const ref of unresolvedRefs) {
    const line = Math.max(1, ref.location.line)
    const column = Math.max(1, ref.location.column)
    diagnostics.push({
      message: `Undefined symbol '${ref.name}'`,
      range: {
        start: { line, column },
        end: { line, column: column + ref.name.length },
      },
      severity: 'error',
      source: 'dvala',
    })
  }
  return diagnostics
}

/**
 * Build diagnostics from a typecheck result. Type errors are downgraded to
 * `'warning'` and warnings to `'info'` because the type system is
 * intentionally non-blocking — code still runs even with type mismatches,
 * mirroring the TypeScript convention. Diagnostics without source info are
 * dropped.
 */
export function buildTypeDiagnostics(typeResult: TypecheckResult): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  for (const diag of typeResult.diagnostics) {
    if (!diag.sourceCodeInfo) continue
    diagnostics.push({
      message: diag.message,
      range: pointRange(diag.sourceCodeInfo.position.line, diag.sourceCodeInfo.position.column),
      severity: diag.severity === 'error' ? 'warning' : 'info',
      source: 'dvala-types',
    })
  }
  return diagnostics
}
