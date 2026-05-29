/**
 * Pure call-site detection used by signature-help providers. Given the
 * source text plus a cursor position, scan backward from the cursor to
 * find the unmatched `(` and extract the callee name + active argument
 * index.
 *
 * Free of any editor dependency — consumers pass the source as a string.
 * The VS Code adapter trims the source to a few lines above the cursor;
 * worker-side adapters can pass either the full document text or a
 * windowed slice. (Position is 1-based, matching the rest of src/shared.)
 */

import type { Position } from './types'

/**
 * Find the function call context at a 1-based cursor position.
 *
 * Returns null when the cursor is not inside a parenthesized argument
 * list, or when the unmatched `(` has no identifier immediately before it
 * (e.g. an anonymous IIFE call site).
 */
export function findCallContext(
  source: string,
  position: Position,
): { functionName: string; activeParam: number } | null {
  // Walk forward to compute the offset for (line, column) — both 1-based.
  // Guard against positions past the end of the source (clamp to end).
  const line = position.line
  const column = position.column

  let offset = 0
  let currentLine = 1
  let currentCol = 1
  while (offset < source.length) {
    if (currentLine === line && currentCol === column) break
    const ch = source[offset]
    if (ch === '\n') {
      currentLine++
      currentCol = 1
    } else {
      currentCol++
    }
    offset++
  }

  let depth = 0
  let commaCount = 0
  for (let i = offset - 1; i >= 0; i--) {
    const ch = source[i]
    if (ch === ')') depth++
    else if (ch === '(') {
      if (depth === 0) {
        const before = source.substring(0, i).trimEnd()
        const nameMatch = before.match(/([a-zA-Z_$][a-zA-Z0-9_$]*)$/)
        if (nameMatch) {
          return { functionName: nameMatch[1]!, activeParam: commaCount }
        }
        return null
      }
      depth--
    } else if (ch === ',' && depth === 0) {
      commaCount++
    }
  }
  return null
}
