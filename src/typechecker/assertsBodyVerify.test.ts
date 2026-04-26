import { describe, expect, it } from 'vitest'
import { NodeTypes } from '../constants/constants'
import { parseToAst } from '../parser'
import type { AstNode, BindingTarget } from '../parser/types'
import { minifyTokenStream } from '../tokenizer/minifyTokenStream'
import { tokenize } from '../tokenizer/tokenize'
import { verifyAssertionFunctionBodies } from './assertsBodyVerify'

function parseProgram(source: string) {
  const tokenStream = tokenize(source, false, undefined)
  const minified = minifyTokenStream(tokenStream, { removeWhiteSpace: true })
  return parseToAst(minified)
}

describe('verifyAssertionFunctionBodies', () => {
  it('returns no diagnostics when the program has no type annotations', () => {
    expect(verifyAssertionFunctionBodies(parseProgram('1'))).toEqual([])
  })

  it('accepts a multi-statement body once an earlier assert proves the predicate', () => {
    const diagnostics = verifyAssertionFunctionBodies(parseProgram(`
      let assertPositive: (x: Number) -> asserts {x | x > 0} = (x) -> do
        assert(x > 0);
        true
      end;
      1
    `))

    expect(diagnostics).toHaveLength(0)
  })

  it('accepts an if-body when both normal-return paths prove the predicate', () => {
    const diagnostics = verifyAssertionFunctionBodies(parseProgram(`
      let assertPositive: (x: Number) -> asserts {x | x > 0} = (x) ->
        if x > 0 then true else assert(x > 0) end;
      1
    `))

    expect(diagnostics).toHaveLength(0)
  })

  it('accepts verified helper calls with the same asserted predicate', () => {
    const diagnostics = verifyAssertionFunctionBodies(parseProgram(`
      let assertPositiveBase: (x: Number) -> asserts {x | x > 0} = (x) -> assert(x > 0);
      let assertPositive: (x: Number) -> asserts {x | x > 0} = (x) -> do
        assertPositiveBase(x);
        true
      end;
      1
    `))

    expect(diagnostics).toHaveLength(0)
  })

  it('ignores recursive-looking calls that only appear inside nested lambdas', () => {
    const diagnostics = verifyAssertionFunctionBodies(parseProgram(`
      let assertPositive: (x: Number) -> asserts {x | x > 0} = (x) -> do
        let delayed = () -> assertPositive(x);
        assert(x > 0)
      end;
      1
    `))

    expect(diagnostics).toHaveLength(0)
  })

  it('rejects helper calls that do not prove the current binder', () => {
    const diagnostics = verifyAssertionFunctionBodies(parseProgram(`
      let assertPositiveBase: (x: Number) -> asserts {x | x > 0} = (x) -> assert(x > 0);
      let assertPositive: (x: Number) -> asserts {x | x > 0} = (x) -> assertPositiveBase(1);
      1
    `))

    expect(diagnostics.some(d => d.message.includes('does not prove'))).toBe(true)
  })

  it('ignores malformed assertion annotations instead of crashing verification', () => {
    const ast = parseProgram(`
      let assertPositive = (x) -> assert(x > 0);
      1
    `)
    const letNode = ast.body[0]!
    const [binding] = letNode[1] as [BindingTarget, AstNode]
    ast.typeAnnotations = new Map([[binding[2], '(x: Number) -> asserts {x |']])

    expect(verifyAssertionFunctionBodies(ast)).toEqual([])
  })

  it('skips annotated functions that are not assertion functions', () => {
    const ast = parseProgram(`
      let keepPositive = (x) -> x > 0;
      1
    `)
    const letNode = ast.body[0]!
    const [binding] = letNode[1] as [BindingTarget, AstNode]
    ast.typeAnnotations = new Map([[binding[2], '(x: Number) -> Boolean']])

    expect(verifyAssertionFunctionBodies(ast)).toEqual([])
  })

  it('verifies assertion functions nested inside top-level blocks', () => {
    const diagnostics = verifyAssertionFunctionBodies(parseProgram(`
      do
        let assertPositive: (x: Number) -> asserts {x | x > 0} = (x) -> assert(x > 0);
        1
      end
    `))

    expect(diagnostics).toHaveLength(0)
  })

  it('handles non-terminal if statements in assertion bodies', () => {
    const diagnostics = verifyAssertionFunctionBodies(parseProgram(`
      let assertPositive: (x: Number) -> asserts {x | x > 0} = (x) -> do
        if x > 0 then true else assert(x > 0) end;
        true
      end;
      1
    `))

    expect(diagnostics).toHaveLength(0)
  })

  it('keeps later statements trivially proven after an earlier exact assert', () => {
    const diagnostics = verifyAssertionFunctionBodies(parseProgram(`
      let assertPositive: (x: Number) -> asserts {x | x > 0} = (x) -> do
        assert(x > 0);
        if false then false else true end;
        true
      end;
      1
    `))

    expect(diagnostics).toHaveLength(0)
  })

  it('rejects helper calls whose asserted predicate differs from the target predicate', () => {
    const diagnostics = verifyAssertionFunctionBodies(parseProgram(`
      let assertStrictlyPositive: (x: Number) -> asserts {x | x > 1} = (x) -> assert(x > 1);
      let assertPositive: (x: Number) -> asserts {x | x > 0} = (x) -> assertStrictlyPositive(x);
      1
    `))

    expect(diagnostics.some(d => d.message.includes('does not prove'))).toBe(true)
  })

  it('rejects helper-like calls when the callee is not a symbol', () => {
    const ast = parseProgram(`
      let assertPositiveBase: (x: Number) -> asserts {x | x > 0} = (x) -> assert(x > 0);
      let assertPositive: (x: Number) -> asserts {x | x > 0} = (x) -> assertPositiveBase(x);
      1
    `)
    const literalAst = parseProgram('1')
    const outerValueNode = (ast.body[1]![1] as [BindingTarget, AstNode])[1]
    const [, outerBodyNodes] = outerValueNode[1] as [AstNode[], AstNode[]]
    const callNode = outerBodyNodes[0]!
    ;(callNode[1] as [AstNode, AstNode[]])[0] = literalAst.body[0]!

    const diagnostics = verifyAssertionFunctionBodies(ast)

    expect(callNode[0]).toBe(NodeTypes.Call)
    expect(diagnostics.some(d => d.message.includes('does not prove'))).toBe(true)
  })

  it('rejects assertion functions with empty bodies', () => {
    const ast = parseProgram(`
      let assertPositive: (x: Number) -> asserts {x | x > 0} = (x) -> assert(x > 0);
      1
    `)
    const valueNode = (ast.body[0]![1] as [BindingTarget, AstNode])[1]
    ;(valueNode[1] as [AstNode[], AstNode[]])[1] = []

    const diagnostics = verifyAssertionFunctionBodies(ast)

    expect(diagnostics.some(d => d.message.includes('does not prove'))).toBe(true)
  })

  // Pins the documented limitation: `match` bodies aren't path-checked
  // by the verifier in this cut. The body is conservatively rejected
  // (treated as "did not prove P") rather than silently accepted —
  // sound but restrictive. Future work could add a `Match` case to
  // `terminalProves` / `statementGuarantees` mirroring the existing
  // `If` handling. See design doc Decision 1 for context.
  it('rejects match-bodied assertion functions (match path-checking deferred)', () => {
    const ast = parseProgram(`
      let assertPositive: (x: Number) -> asserts {x | x > 0} = (x) ->
        match x
          case n then assert(n > 0)
        end;
      1
    `)
    const diagnostics = verifyAssertionFunctionBodies(ast)
    expect(diagnostics.some(d => d.message.includes('does not prove'))).toBe(true)
  })
})
