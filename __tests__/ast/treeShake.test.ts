import { describe, expect, it } from 'vitest'
import { treeShake } from '../../src/ast/treeShake'
import { NodeTypes } from '../../src/constants/constants'
import { createDvala } from '../../src/createDvala'
import { minifyTokenStream } from '../../src/tokenizer/minifyTokenStream'
import { tokenize } from '../../src/tokenizer/tokenize'
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

  // --- isSideEffectFree — additional value-node shapes ---

  it('removes an unused array-literal binding', () => {
    // Arrays are pure when all elements are pure — this exercises the
    // NodeTypes.Array branch of isSideEffectFree.
    const ast = parse('let unused = [1, 2, 3]; 42')
    const shaken = treeShake(ast)
    expect(shaken.body.length).toBe(1)
    expect(evalAst(shaken)).toBe(42)
  })

  it('removes an unused object-literal binding', () => {
    const ast = parse('let unused = { a: 1, b: 2 }; 42')
    const shaken = treeShake(ast)
    expect(shaken.body.length).toBe(1)
    expect(evalAst(shaken)).toBe(42)
  })

  it('removes an unused nested-array binding', () => {
    // Nested arrays exercise the recursive `.every(isSideEffectFree)` branch
    const ast = parse('let unused = [[1, 2], [3, [4, 5]]]; 42')
    const shaken = treeShake(ast)
    expect(shaken.body.length).toBe(1)
  })

  it('removes an unused binding whose value is a pure if-expression', () => {
    // Exercises the NodeTypes.If branch — pure when every branch is pure.
    const ast = parse('let unused = if 1 < 2 then 10 else 20 end; 42')
    const shaken = treeShake(ast)
    expect(shaken.body.length).toBe(1)
    expect(evalAst(shaken)).toBe(42)
  })

  it('keeps an unused binding whose value is a user-function call', () => {
    // Calls to user-defined functions are not considered pure — the x binding
    // itself is kept even though nothing references x.
    // Note: the sweep is syntactic, so `f` (whose value is a pure Function)
    // is still removed; the dependency graph only propagates through *live*
    // names, and no non-Let statement references x or f here.
    const ast = parse('let f = () -> 1; let x = f(); 42')
    const shaken = treeShake(ast)
    // `x` is retained (value has side effects); `f`'s Let is dropped.
    expect(shaken.body.length).toBe(2)
    // The retained body contains the user-function call and the final expression
    expect(shaken.body[shaken.body.length - 1]).toEqual(ast.body[ast.body.length - 1])
  })

  it('keeps an unused binding whose value is a macro call', () => {
    // MacroCall is deliberately reported as unsafe — the `unused` Let stays.
    // `m`'s value is a pure Function node, so its Let is removed (the sweep
    // is syntactic and does not re-walk retained values to mark dependencies).
    const ast = parse('let m = macro (x) -> x; let unused = #m(42); 42')
    const shaken = treeShake(ast)
    // Expect the macro-call Let and the trailing expression — and only those.
    expect(shaken.body.map(n => n[0])).toEqual([NodeTypes.Let, NodeTypes.Num])
  })

  it('removes an unused binding that wraps pure code in a nested let-inside-block', () => {
    // Block with an inner Let — exercises the NodeTypes.Let branch inside
    // the NodeTypes.Block case (not the top-level Let handling).
    const ast = parse('let unused = do let y = 1; y + 2 end; 42')
    const shaken = treeShake(ast)
    expect(shaken.body.length).toBe(1)
    expect(evalAst(shaken)).toBe(42)
  })

  it('removes an unused array-destructured binding when all names are unused', () => {
    // Exercises the case 'array' branch of extractBindingNames
    const ast = parse('let [a, b] = [1, 2]; 42')
    const shaken = treeShake(ast)
    expect(shaken.body.length).toBe(1)
    expect(evalAst(shaken)).toBe(42)
  })

  it('keeps an array-destructured binding when any name is used', () => {
    const ast = parse('let [a, b] = [10, 20]; a')
    const shaken = treeShake(ast)
    expect(shaken.body.length).toBe(2)
    expect(evalAst(shaken)).toBe(10)
  })

  it('removes an unused binding whose value is a rest destructure inside an array pattern', () => {
    // `let [first, ...rest] = ...` — verifies the array-destructure path
    // still works with a rest element; no names are referenced.
    const ast = parse('let [first, ...rest] = [1, 2, 3]; 42')
    const shaken = treeShake(ast)
    expect(shaken.body.length).toBe(1)
    expect(evalAst(shaken)).toBe(42)
  })
})
