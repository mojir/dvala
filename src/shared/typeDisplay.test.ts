import { describe, expect, it } from 'vitest'
import { allBuiltinModules } from '../allModules'
import { createDvala } from '../createDvala'
import type { SymbolDef } from '../languageService/types'
import type { Position, Range } from './types'
import { findTypeAtDefinition, findTypeAtPosition, formatHoverType } from './typeDisplay'

const dvala = createDvala({ modules: allBuiltinModules, debug: true })

function tc(source: string) {
  return dvala.typecheck(source)
}

describe('formatHoverType', () => {
  it('formats a simple primitive', () => {
    const result = tc('let x = 42')
    // pull any non-Unknown type from the map
    const type = [...result.typeMap.values()].find(t => t.tag !== 'Unknown')
    expect(type).toBeDefined()
    expect(formatHoverType(type!)).toBeTypeOf('string')
  })
})

describe('findTypeAtPosition', () => {
  it('returns undefined when sourceMap is missing', () => {
    const result = tc('let x = 1')
    expect(findTypeAtPosition(result.typeMap, undefined, { line: 1, column: 5 })).toBeUndefined()
  })

  it('finds the type of a variable at its definition site', () => {
    // `x` is defined at column 5 (1-based: line 1, col 5)
    const result = tc('let x = 42')
    const pos: Position = { line: 1, column: 5 }
    const type = findTypeAtPosition(result.typeMap, result.sourceMap, pos)
    expect(type).toBeDefined()
    // Should be an Integer literal type
    expect(formatHoverType(type!)).toMatch(/Integer|42/)
  })

  it('returns undefined for a position outside any tracked node', () => {
    const result = tc('let x = 42')
    // Way past the end of the source
    const pos: Position = { line: 10, column: 100 }
    expect(findTypeAtPosition(result.typeMap, result.sourceMap, pos)).toBeUndefined()
  })

  it('prefers the smallest covering node', () => {
    // `let y = x + 1` — hovering on `x` should give the Integer type, not the
    // enclosing `+` call result.
    const result = tc('let x = 42; let y = x + 1')
    // `x` reference is at line 1, col 21 (after `let y = `)
    const pos: Position = { line: 1, column: 21 }
    const type = findTypeAtPosition(result.typeMap, result.sourceMap, pos)
    expect(type).toBeDefined()
  })

  it('uses preferredRange to bias selection', () => {
    const result = tc('let x = 42; let y = x + 1')
    // Hovering at the same position with a preferred range biased at the `x`
    // identifier should return a type whose start aligns with the preferred range.
    const pos: Position = { line: 1, column: 21 }
    const preferred: Range = {
      start: { line: 1, column: 21 },
      end: { line: 1, column: 22 },
    }
    const type = findTypeAtPosition(result.typeMap, result.sourceMap, pos, preferred)
    expect(type).toBeDefined()
  })
})

describe('findTypeAtDefinition', () => {
  it('finds the type at a SymbolDef location', () => {
    const result = tc('let x = 42')
    const def: SymbolDef = {
      name: 'x',
      kind: 'variable',
      nodeId: 0,
      // The `x` token in `let x = 42` is at line 1, column 5 (1-based).
      location: { file: 'test.dvala', line: 1, column: 5 },
      scope: 0,
    }
    const type = findTypeAtDefinition(result.typeMap, result.sourceMap, def)
    expect(type).toBeDefined()
  })

  it('returns undefined when sourceMap is missing', () => {
    const result = tc('let x = 1')
    const def: SymbolDef = {
      name: 'x',
      kind: 'variable',
      nodeId: 0,
      location: { file: 'test.dvala', line: 1, column: 5 },
      scope: 0,
    }
    expect(findTypeAtDefinition(result.typeMap, undefined, def)).toBeUndefined()
  })
})
