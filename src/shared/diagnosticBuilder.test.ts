import { describe, expect, it } from 'vitest'
import { ParseError } from '../errors'
import type { SymbolRef } from '../languageService/types'
import type { TypecheckResult } from '../typechecker/typecheck'
import { buildParseDiagnostics, buildSymbolDiagnostics, buildTypeDiagnostics } from './diagnosticBuilder'

describe('buildParseDiagnostics', () => {
  it('returns an empty list when there are no errors', () => {
    expect(buildParseDiagnostics([])).toEqual([])
  })

  it('drops errors without sourceCodeInfo', () => {
    const err = new ParseError('boom', undefined)
    expect(buildParseDiagnostics([err])).toEqual([])
  })

  it('produces a 1-based point range for errors with location', () => {
    const err = new ParseError('boom', {
      position: { line: 3, column: 7 },
      code: 'let x =',
      filePath: 'test.dvala',
    })
    const result = buildParseDiagnostics([err])
    expect(result).toHaveLength(1)
    expect(result[0]!.severity).toBe('error')
    expect(result[0]!.source).toBe('dvala')
    expect(result[0]!.range).toEqual({
      start: { line: 3, column: 7 },
      end: { line: 3, column: 8 },
    })
    // ParseError.message is enriched with location/code-marker info — we
    // pass it through as-is so the editor surfaces the same text the
    // existing CLI does. Verify the original short message is included.
    expect(result[0]!.message).toContain('boom')
  })

  it('clamps zero-based or out-of-range positions to 1-based minimums', () => {
    const err = new ParseError('underflow', {
      position: { line: 0, column: 0 },
      code: '',
    })
    const [diag] = buildParseDiagnostics([err])
    expect(diag!.range.start.line).toBe(1)
    expect(diag!.range.start.column).toBe(1)
    expect(diag!.range.end.column).toBe(2)
  })
})

describe('buildSymbolDiagnostics', () => {
  it('returns an empty list when there are no unresolved refs', () => {
    expect(buildSymbolDiagnostics([])).toEqual([])
  })

  it('produces a name-spanning range with a stable error message', () => {
    const ref: SymbolRef = {
      name: 'foo',
      nodeId: 0,
      location: { file: 'test.dvala', line: 2, column: 5 },
      resolvedDef: null,
    }
    const result = buildSymbolDiagnostics([ref])
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      message: "Undefined symbol 'foo'",
      severity: 'error',
      source: 'dvala',
      range: {
        start: { line: 2, column: 5 },
        end: { line: 2, column: 8 },
      },
    })
  })

  it('clamps non-positive line/column to 1', () => {
    const ref: SymbolRef = {
      name: 'x',
      nodeId: 0,
      location: { file: 'test.dvala', line: 0, column: 0 },
      resolvedDef: null,
    }
    const [diag] = buildSymbolDiagnostics([ref])
    expect(diag!.range.start).toEqual({ line: 1, column: 1 })
    expect(diag!.range.end).toEqual({ line: 1, column: 2 })
  })
})

describe('buildTypeDiagnostics', () => {
  it('returns an empty list when there are no diagnostics', () => {
    const result: TypecheckResult = { diagnostics: [], typeMap: new Map() }
    expect(buildTypeDiagnostics(result)).toEqual([])
  })

  it('drops diagnostics without sourceCodeInfo', () => {
    const result: TypecheckResult = {
      diagnostics: [{ message: 'orphan', severity: 'error' }],
      typeMap: new Map(),
    }
    expect(buildTypeDiagnostics(result)).toEqual([])
  })

  it('downgrades errors to warning and warnings to info', () => {
    const result: TypecheckResult = {
      diagnostics: [
        {
          message: 'mismatch',
          severity: 'error',
          sourceCodeInfo: {
            position: { line: 1, column: 4 },
            code: 'x',
          },
        },
        {
          message: 'cosmetic',
          severity: 'warning',
          sourceCodeInfo: {
            position: { line: 5, column: 10 },
            code: 'y',
          },
        },
      ],
      typeMap: new Map(),
    }
    const diags = buildTypeDiagnostics(result)
    expect(diags).toHaveLength(2)
    expect(diags[0]!.severity).toBe('warning')
    expect(diags[0]!.source).toBe('dvala-types')
    expect(diags[1]!.severity).toBe('info')
  })
})
