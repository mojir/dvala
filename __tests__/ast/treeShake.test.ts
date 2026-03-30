import { describe, expect, it } from 'vitest'
import { createDvala } from '../../src/createDvala'
import { treeShake } from '../../src/ast/treeShake'
import { tokenize } from '../../src/tokenizer/tokenize'
import { minifyTokenStream } from '../../src/tokenizer/minifyTokenStream'
import { parseToAst } from '../../src/parser'
import type { Ast } from '../../src/parser/types'

function parse(source: string): Ast {
  const tokenStream = tokenize(source, false, undefined)
  const minified = minifyTokenStream(tokenStream, { removeWhiteSpace: true })
  return parseToAst(minified)
}

function evalAst(ast: Ast): unknown {
  const dvala = createDvala()
  return dvala.run({ version: 1, ast })
}

describe('treeShake', () => {
  it('removes unused simple binding', () => {
    const ast = parse('let unused = 42; let used = 10; used + 1')
    const shaken = treeShake(ast)

    expect(shaken.body.length).toBe(2) // let used + expression
    expect(evalAst(shaken)).toBe(11)
  })

  it('keeps all bindings when all are used', () => {
    const ast = parse('let a = 1; let b = a + 1; b')
    const shaken = treeShake(ast)

    expect(shaken.body.length).toBe(3) // both lets + expression
    expect(evalAst(shaken)).toBe(2)
  })

  it('handles cascading removal', () => {
    const ast = parse('let a = 1; let b = a + 1; let c = b + 1; let result = 99; result')
    const shaken = treeShake(ast)

    // a, b, c are all dead (only result is live)
    expect(shaken.body.length).toBe(2) // let result + expression
    expect(evalAst(shaken)).toBe(99)
  })

  it('removes unused destructured binding when all names unused', () => {
    const ast = parse('let { a, b } = { a: 1, b: 2 }; 42')
    const shaken = treeShake(ast)

    expect(shaken.body.length).toBe(1) // just the expression
    expect(evalAst(shaken)).toBe(42)
  })

  it('keeps destructured binding when some names are used', () => {
    const ast = parse('let { a, b } = { a: 1, b: 2 }; a')
    const shaken = treeShake(ast)

    // Both a and b are in the same Let — kept because a is live
    expect(shaken.body.length).toBe(2)
    expect(evalAst(shaken)).toBe(1)
  })

  it('removes unused macro definition', () => {
    const ast = parse('let m = macro (x) -> x; 42')
    const shaken = treeShake(ast)

    expect(shaken.body.length).toBe(1)
    expect(evalAst(shaken)).toBe(42)
  })

  it('removes unused import', () => {
    const ast = parse('let { sin } = import("math"); 42')
    const shaken = treeShake(ast)

    expect(shaken.body.length).toBe(1)
    expect(evalAst(shaken)).toBe(42)
  })

  it('keeps bindings with side effects', () => {
    // perform is a side effect — the Let should be kept even if unused
    const ast = parse('let x = perform(@dvala.io.print, "hi"); 42')
    const shaken = treeShake(ast)

    // x's value has side effects — kept
    expect(shaken.body.length).toBe(2)
  })

  it('removes unused block (module) binding', () => {
    const ast = parse('let mod = do let a = 1; { a: a } end; 42')
    const shaken = treeShake(ast)

    expect(shaken.body.length).toBe(1)
    expect(evalAst(shaken)).toBe(42)
  })

  it('does nothing to an empty body', () => {
    const ast: Ast = { body: [] }
    const shaken = treeShake(ast)
    expect(shaken.body.length).toBe(0)
  })

  it('preserves source map', () => {
    const tokenStream = tokenize('let x = 1; 42', true, undefined)
    const minified = minifyTokenStream(tokenStream, { removeWhiteSpace: true })
    const ast = parseToAst(minified)

    const shaken = treeShake(ast)
    expect(shaken.sourceMap).toBe(ast.sourceMap)
  })
})
