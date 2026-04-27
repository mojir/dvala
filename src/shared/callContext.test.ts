import { describe, expect, it } from 'vitest'
import { findCallContext } from './callContext'

describe('findCallContext', () => {
  it('returns null when the cursor is not inside a call', () => {
    expect(findCallContext('let x = 1', { line: 1, column: 10 })).toBeNull()
  })

  it('finds the function name and zero active param at the start of args', () => {
    const src = 'foo('
    const result = findCallContext(src, { line: 1, column: 5 })
    expect(result).toEqual({ functionName: 'foo', activeParam: 0 })
  })

  it('counts commas to track the active parameter', () => {
    const src = 'add(1, 2, '
    const result = findCallContext(src, { line: 1, column: 11 })
    expect(result).toEqual({ functionName: 'add', activeParam: 2 })
  })

  it('skips nested call parentheses when counting unmatched paren', () => {
    // Cursor inside the outer call after a nested call: `outer(inner(1, 2), |`
    const src = 'outer(inner(1, 2), '
    const result = findCallContext(src, { line: 1, column: 20 })
    expect(result).toEqual({ functionName: 'outer', activeParam: 1 })
  })

  it('returns null when the unmatched paren is anonymous', () => {
    const src = '(1 + '
    const result = findCallContext(src, { line: 1, column: 6 })
    expect(result).toBeNull()
  })

  it('handles multi-line source', () => {
    const src = 'let result = compute(\n  a,\n  '
    const result = findCallContext(src, { line: 3, column: 3 })
    expect(result).toEqual({ functionName: 'compute', activeParam: 1 })
  })

  it('handles dollar/underscore identifiers', () => {
    const src = '$_helper(x, '
    const result = findCallContext(src, { line: 1, column: 13 })
    expect(result?.functionName).toBe('$_helper')
  })

  it('clamps cursor positions past end of source', () => {
    const src = 'foo(1, 2'
    // Cursor past end — clamped to end of source, still inside the open paren.
    const result = findCallContext(src, { line: 5, column: 50 })
    expect(result).toEqual({ functionName: 'foo', activeParam: 1 })
  })
})
