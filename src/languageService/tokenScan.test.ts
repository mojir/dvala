import { describe, expect, it } from 'vitest'
import { scanTokensForDefinitions } from './tokenScan'
import { tokenize } from '../tokenizer/tokenize'

function scan(source: string) {
  const tokens = tokenize(source, true, 'test.dvala')
  return scanTokensForDefinitions(tokens.tokens, 'test.dvala')
}

describe('scanTokensForDefinitions', () => {
  it('finds simple let bindings', () => {
    const defs = scan('let x = 1; let y = 2')
    expect(defs).toHaveLength(2)
    expect(defs[0]!.name).toBe('x')
    expect(defs[1]!.name).toBe('y')
  })

  it('classifies functions', () => {
    const defs = scan('let f = (x) -> x + 1')
    expect(defs[0]!.kind).toBe('function')
  })

  it('classifies macros', () => {
    const defs = scan('let m = macro (x) -> quote x end')
    expect(defs[0]!.kind).toBe('macro')
  })

  it('classifies handlers', () => {
    const defs = scan('let h = handler @my.eff(x) -> resume(x) end')
    expect(defs[0]!.kind).toBe('handler')
  })

  it('classifies imports', () => {
    const defs = scan('let { x } = import("./lib")')
    // destructured import — token scanner sees `let` followed by `{`, not a symbol
    expect(defs).toHaveLength(0)
  })

  it('classifies plain variables', () => {
    const defs = scan('let x = 42')
    expect(defs[0]!.kind).toBe('variable')
  })

  it('includes source positions', () => {
    const defs = scan('let x = 1')
    expect(defs[0]!.location.file).toBe('test.dvala')
    expect(defs[0]!.location.line).toBeGreaterThan(0)
  })

  it('works on broken code', () => {
    // Token scanner should still find `x` even though `!!!` is invalid
    const defs = scan('let x = 1; !!!; let y = 2')
    expect(defs).toHaveLength(2)
    expect(defs[0]!.name).toBe('x')
    expect(defs[1]!.name).toBe('y')
  })

  it('handles empty input', () => {
    const defs = scan('')
    expect(defs).toHaveLength(0)
  })

  it('classifies shallow handlers', () => {
    const defs = scan('let h = shallow handler @my.eff(x) -> resume(x) end')
    expect(defs[0]!.kind).toBe('handler')
  })

  it('classifies simple let import', () => {
    const defs = scan('let lib = import("./lib")')
    expect(defs[0]!.kind).toBe('import')
  })

  it('classifies variable when RHS is not a keyword', () => {
    const defs = scan('let x = someFunction()')
    expect(defs[0]!.kind).toBe('variable')
  })

  it('classifies variable when no = follows name', () => {
    // Edge case: `let x` without `=` (invalid code but token scanner should handle it)
    const defs = scan('let x')
    expect(defs[0]!.kind).toBe('variable')
  })
})
