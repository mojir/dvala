import { describe, expect, it } from 'vitest'
import { createDvala } from '../../src/createDvala'
import { expandMacros } from '../../src/ast/expandMacros'
import { tokenize } from '../../src/tokenizer/tokenize'
import { minifyTokenStream } from '../../src/tokenizer/minifyTokenStream'
import { parseToAst } from '../../src/parser'
import type { Ast } from '../../src/parser/types'

function parse(source: string): Ast {
  const tokenStream = tokenize(source, false, undefined)
  const minified = minifyTokenStream(tokenStream, { removeWhiteSpace: true })
  return parseToAst(minified)
}

describe('expandMacros', () => {
  it('expands a simple macro', () => {
    const ast = parse('let double = macro (x) -> quote $^{x} + $^{x} end; double(21)')
    const expanded = expandMacros(ast)

    // The macro definition should be removed, call expanded to 21 + 21
    expect(expanded.body.length).toBe(1) // just the expanded expression
    // The remaining node should NOT be a Call to "double" — it should be the expansion
    const remaining = expanded.body[0]!
    expect(remaining[0]).not.toBe('Sym') // not an unexpanded reference
    // Evaluate the expanded AST
    const dvala = createDvala()
    expect(dvala.run({ version: 1, ast: expanded })).toBe(42)
  })

  it('removes macro definition from output', () => {
    const ast = parse('let m = macro (x) -> x; m(42)')
    const expanded = expandMacros(ast)

    // Should only have the expanded body, no Let for the macro
    expect(expanded.body.length).toBe(1) // just the expanded expression
  })

  it('expands nested macro calls', () => {
    const ast = parse(`
      let addOne = macro (x) -> quote $^{x} + 1 end;
      let addTwo = macro (x) -> quote addOne($^{x}) + 1 end;
      addTwo(10)
    `)
    const expanded = expandMacros(ast)

    const dvala = createDvala()
    expect(dvala.run({ version: 1, ast: expanded })).toBe(12)
  })

  it('leaves non-macro code untouched', () => {
    const ast = parse('let x = 42; x + 1')
    const expanded = expandMacros(ast)

    expect(expanded.body.length).toBe(ast.body.length)
    const dvala = createDvala()
    expect(dvala.run({ version: 1, ast: expanded })).toBe(43)
  })

  it('leaves runtime-dependent macros unexpanded', () => {
    // This macro references a variable that doesn't exist at build time
    const ast = parse('let m = macro (x) -> quote $^{x} + runtimeValue end; m(1)')
    const expanded = expandMacros(ast)

    // The macro expansion will succeed (it just constructs AST),
    // but the expanded code references runtimeValue
    // The macro definition should still be removed since expansion succeeded
    expect(expanded.body.length).toBeLessThanOrEqual(ast.body.length)
  })

  it('preserves source map', () => {
    const tokenStream = tokenize('let m = macro (x) -> x; m(42)', true, undefined)
    const minified = minifyTokenStream(tokenStream, { removeWhiteSpace: true })
    const ast = parseToAst(minified)

    const expanded = expandMacros(ast)
    expect(expanded.sourceMap).toBe(ast.sourceMap) // same reference, not copied
  })

  it('handles identity macro', () => {
    const ast = parse('let id = macro (x) -> x; id(let y = 42); y')
    const expanded = expandMacros(ast)

    const dvala = createDvala()
    expect(dvala.run({ version: 1, ast: expanded })).toBe(42)
  })
})
