import { describe, it, expect } from 'vitest'
import { createDvala } from '../createDvala'
import { allBuiltinModules } from '../allModules'
import { expandType, expandTypeForDisplay, sanitizeDisplayType } from './infer'
import { simplify } from './simplify'
import { typeToString } from './types'
import * as path from 'path'
import * as fs from 'fs'

function getHoverTypeStringAt(result: ReturnType<ReturnType<typeof createDvala>['typecheck']>, line: number, col: number): string | undefined {
  let bestType: (typeof result.typeMap extends Map<number, infer T> ? T : never) | undefined
  let bestSize = Infinity

  for (const [nodeId, type] of result.typeMap) {
    if (type.tag === 'Unknown') continue
    const sourcePos = result.sourceMap?.get(nodeId)
    if (!sourcePos) continue

    const [startLine, startCol] = sourcePos.start
    const [endLine, endCol] = sourcePos.end
    if (line < startLine || line > endLine) continue

    const inRange = (line > startLine || col >= startCol)
      && (line < endLine || col <= endCol)
    if (!inRange) continue

    const size = (endLine - startLine) * 1000 + (endCol - startCol)
    if (size < bestSize) {
      bestSize = size
      bestType = type
    }
  }

  if (!bestType) return undefined
  return typeToString(simplify(sanitizeDisplayType(expandTypeForDisplay(bestType))))
}

// File import type-checking tests.
// These tests verify that the typechecker correctly resolves
// file imports, including transitive (nested) imports.
describe('typecheck — file imports', () => {
  const dvala = createDvala({
    modules: allBuiltinModules,
    debug: true,
    fileResolver: (importPath: string, fromDir: string) => {
      const resolved = path.resolve(fromDir, importPath)
      for (const candidate of [resolved, `${resolved}.dvala`]) {
        try { return fs.readFileSync(candidate, 'utf-8') } catch { /* try next */ }
      }
      throw new Error(`File not found: ${importPath}`)
    },
  })

  const projectDir = path.resolve('examples/project')

  it('resolves simple file import (no nested imports)', () => {
    const source = 'let { clamp } = import("./lib/math"); clamp(5, 0, 10)'
    const result = dvala.typecheck(source, { fileResolverBaseDir: projectDir })
    const errors = result.diagnostics.filter(d => d.severity === 'error')
    expect(errors.map(e => e.message)).toEqual([])
  })

  it('resolves file import with handler (logging.dvala)', () => {
    const source = 'let { withLogging } = import("./lib/logging"); withLogging'
    const result = dvala.typecheck(source, { fileResolverBaseDir: projectDir })
    const errors = result.diagnostics.filter(d => d.severity === 'error')
    expect(errors.map(e => e.message)).toEqual([])
  })

  it('resolves transitive import (constants imports macros)', () => {
    // constants.dvala does import("./macros") — tests nested file resolution
    const source = 'let { pi } = import("./lib/constants"); pi'
    const result = dvala.typecheck(source, { fileResolverBaseDir: projectDir })
    const errors = result.diagnostics.filter(d => d.severity === 'error')
    expect(errors.map(e => e.message)).toEqual([])
  })

  it('infers Number for macro-expanded pi in constants', () => {
    // double(3.14.../2) expands to 3.14.../2 + 3.14.../2, which is Number
    const source = 'let { pi } = import("./lib/constants"); pi'
    const result = dvala.typecheck(source, { fileResolverBaseDir: projectDir })
    // Find the type of the last expression (pi reference)
    const lastNodeType = [...result.typeMap.values()].pop()
    expect(lastNodeType).toBeDefined()
    const expanded = expandType(lastNodeType!, 'positive')
    const simplified = simplify(expanded)
    expect(typeToString(simplified)).toBe('Number')
  })

  it('hover on destructured imported pi shows Number', () => {
    const source = 'let { pi } = import("./lib/constants"); pi'
    const result = dvala.typecheck(source, { fileResolverBaseDir: projectDir })
    const bindingCol = source.indexOf('pi')

    expect(getHoverTypeStringAt(result, 0, bindingCol)).toBe('Number')
  })

  it('hover on pi in examples/project/main.dvala shows Number', () => {
    const source = fs.readFileSync(path.join(projectDir, 'main.dvala'), 'utf-8')
    const result = dvala.typecheck(source, { fileResolverBaseDir: projectDir })

    expect(getHoverTypeStringAt(result, 2, 6)).toBe('Number')
  })

  it('hover on destructured imported withLogging is available', () => {
    const source = 'let { withLogging } = import("./lib/logging"); withLogging'
    const result = dvala.typecheck(source, { fileResolverBaseDir: projectDir })
    const hoverCol = source.lastIndexOf('withLogging')

    expect(getHoverTypeStringAt(result, 0, hoverCol)).toBeDefined()
  })

  it('hover on parameter in arithmetic lambda shows Number instead of Never', () => {
    const source = 'let a = (a) -> a + 1;'
    const result = dvala.typecheck(source, { fileResolverBaseDir: projectDir })
    const hoverCol = source.lastIndexOf('a + 1')

    expect(getHoverTypeStringAt(result, 0, hoverCol)).toBe('Number')
  })

  it('hover on parameter in self-add lambda shows the scalar arithmetic shape', () => {
    const source = 'let result = (a) -> a + a;'
    const result = dvala.typecheck(source, { fileResolverBaseDir: projectDir })
    const hoverCol = source.indexOf('(a)') + 1

    expect(getHoverTypeStringAt(result, 0, hoverCol)).toBe('Number')
  })

  it('hover on self-add callee at scalar call site shows selected overload', () => {
    const source = 'let result = (a) -> a + a;\nresult(2);'
    const result = dvala.typecheck(source, { fileResolverBaseDir: projectDir })

    expect(getHoverTypeStringAt(result, 1, 1)).toBe('(Number) -> Number')
  })

  it('hover on imported withLogging does not leak Never fields', () => {
    const source = 'let { withLogging } = import("./lib/logging"); withLogging'
    const result = dvala.typecheck(source, { fileResolverBaseDir: projectDir })
    const hoverCol = source.lastIndexOf('withLogging')
    const hover = getHoverTypeStringAt(result, 0, hoverCol)

    expect(hover).toBeDefined()
    expect(hover).not.toContain('Never')
    expect(hover).toContain('logs:')
  })

  it('hover on imported withLogging preserves logs as String[]', () => {
    const source = 'let { withLogging } = import("./lib/logging"); withLogging'
    const result = dvala.typecheck(source, { fileResolverBaseDir: projectDir })
    const hoverCol = source.lastIndexOf('withLogging')
    const hover = getHoverTypeStringAt(result, 0, hoverCol)

    expect(hover).toBeDefined()
    expect(hover).toContain('logs: String[]')
    expect(hover).not.toContain('logs: Unknown[]')
  })

  it('project logging import enforces log payload types inside callback literals', () => {
    const source = `
      let { withLogging } = import("./lib/logging");

      withLogging(-> do
        perform(@project.log, 10);
        1
      end)
    `
    const result = dvala.typecheck(source, { fileResolverBaseDir: projectDir })

    expect(result.diagnostics.length).toBeGreaterThan(0)
    expect(result.diagnostics[0]?.message).toContain('not a subtype of String')
  })

  it('macro imports do not suppress project logging payload diagnostics', () => {
    const source = `
      let { double, withDefault } = import("./lib/macros");
      let { withLogging } = import("./lib/logging");

      withLogging(-> do
        let doubled = double(21);
        let safe = withDefault(null, 42);
        perform(@project.log, 10);
        doubled + safe
      end)
    `
    const result = dvala.typecheck(source, { fileResolverBaseDir: projectDir })

    expect(result.diagnostics.length).toBeGreaterThan(0)
    expect(result.diagnostics.some(diag => diag.message.includes('not a subtype of String'))).toBe(true)
  })

  it('examples/project/main.dvala typechecks cleanly', () => {
    const source = fs.readFileSync(path.join(projectDir, 'main.dvala'), 'utf-8')
    const result = dvala.typecheck(source, { fileResolverBaseDir: projectDir })

    expect(result.diagnostics).toHaveLength(0)
  })
})
