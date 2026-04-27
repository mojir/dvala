/**
 * Portable type-display helpers for hover providers. Pure functions that
 * consume a typecheck result + a 1-based cursor position and return either
 * the inferred Type at that position, or a formatted string ready for display.
 *
 * The position-search logic is identical to what the VS Code extension used
 * to inline. It picks the smallest typed node whose source span covers the
 * cursor; when a `preferredRange` is supplied (typically the editor's "word
 * range" at the cursor), it biases toward nodes whose start aligns with
 * that range so hovering on a symbol prefers the symbol's own type over an
 * enclosing call.
 */

import type { SourceMapPosition } from '../parser/types'
import type { SymbolDef } from '../languageService/types'
import { expandTypeForDisplay, sanitizeDisplayType, simplify, typeToString } from '../typechecker'
import type { Type } from '../typechecker/types'
import type { Position, Range } from './types'

/** Format a Type for hover display: expand → sanitize → simplify → stringify. */
export function formatHoverType(type: Type): string {
  return typeToString(simplify(sanitizeDisplayType(expandTypeForDisplay(type))))
}

/**
 * Find the Type whose source span covers the (1-based) cursor position.
 *
 * Picks the smallest covering node. When `preferredRange` is set, an
 * additional preference is applied: among covering nodes, prefer the one
 * whose start aligns most closely with the preferred range's start (this is
 * how the extension biases toward the word-at-cursor over an enclosing call).
 */
export function findTypeAtPosition(
  typeMap: Map<number, Type>,
  sourceMap: Map<number, SourceMapPosition> | undefined,
  position: Position,
  preferredRange?: Range,
): Type | undefined {
  if (!sourceMap) return undefined

  // Convert 1-based shared position to 0-based source-map convention.
  const line = position.line - 1
  const col = position.column - 1
  const preferredStartLine = preferredRange ? preferredRange.start.line - 1 : 0
  const preferredStartCol = preferredRange ? preferredRange.start.column - 1 : 0

  let bestPreferredType: Type | undefined
  let bestPreferredStartDistance = Infinity
  let bestPreferredSize = Infinity
  let bestType: Type | undefined
  let bestSize = Infinity

  for (const [nodeId, type] of typeMap) {
    if (type.tag === 'Unknown') continue

    const sourcePos = sourceMap.get(nodeId)
    if (!sourcePos) continue

    const [startLine, startCol] = sourcePos.start
    const [endLine, endCol] = sourcePos.end
    if (line < startLine || line > endLine) continue

    const inRange = (line > startLine || col >= startCol) && (line < endLine || col <= endCol)
    if (!inRange) continue

    const size = (endLine - startLine) * 1000 + (endCol - startCol)
    if (preferredRange) {
      const lineDistance = Math.abs(startLine - preferredStartLine)
      const colDistance =
        lineDistance === 0
          ? Math.abs(startCol - preferredStartCol)
          : Math.abs(startCol - preferredStartCol) + lineDistance * 1000

      if (
        colDistance < bestPreferredStartDistance ||
        (colDistance === bestPreferredStartDistance && size < bestPreferredSize)
      ) {
        bestPreferredStartDistance = colDistance
        bestPreferredSize = size
        bestPreferredType = type
      }
    }

    if (size < bestSize) {
      bestSize = size
      bestType = type
    }
  }

  return bestPreferredType ?? bestType
}

/**
 * Find the Type at a definition's location. Equivalent to
 * `findTypeAtPosition` with `position` and `preferredRange` both anchored
 * at the definition's name span.
 */
export function findTypeAtDefinition(
  typeMap: Map<number, Type>,
  sourceMap: Map<number, SourceMapPosition> | undefined,
  def: SymbolDef,
): Type | undefined {
  const start: Position = { line: def.location.line, column: def.location.column }
  const end: Position = { line: def.location.line, column: def.location.column + def.name.length }
  return findTypeAtPosition(typeMap, sourceMap, start, { start, end })
}
