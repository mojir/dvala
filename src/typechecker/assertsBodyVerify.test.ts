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
    const diagnostics = verifyAssertionFunctionBodies(
      parseProgram(`
      let assertPositive: (x: Number) -> asserts {x | x > 0} = (x) -> do
        assert(x > 0);
        true
      end;
      1
    `),
    )

    expect(diagnostics).toHaveLength(0)
  })

  it('accepts an if-body when both normal-return paths prove the predicate', () => {
    const diagnostics = verifyAssertionFunctionBodies(
      parseProgram(`
      let assertPositive: (x: Number) -> asserts {x | x > 0} = (x) ->
        if x > 0 then true else assert(x > 0) end;
      1
    `),
    )

    expect(diagnostics).toHaveLength(0)
  })

  it('accepts verified helper calls with the same asserted predicate', () => {
    const diagnostics = verifyAssertionFunctionBodies(
      parseProgram(`
      let assertPositiveBase: (x: Number) -> asserts {x | x > 0} = (x) -> assert(x > 0);
      let assertPositive: (x: Number) -> asserts {x | x > 0} = (x) -> do
        assertPositiveBase(x);
        true
      end;
      1
    `),
    )

    expect(diagnostics).toHaveLength(0)
  })

  it('ignores recursive-looking calls that only appear inside nested lambdas', () => {
    const diagnostics = verifyAssertionFunctionBodies(
      parseProgram(`
      let assertPositive: (x: Number) -> asserts {x | x > 0} = (x) -> do
        let delayed = () -> assertPositive(x);
        assert(x > 0)
      end;
      1
    `),
    )

    expect(diagnostics).toHaveLength(0)
  })

  it('rejects helper calls that do not prove the current binder', () => {
    const diagnostics = verifyAssertionFunctionBodies(
      parseProgram(`
      let assertPositiveBase: (x: Number) -> asserts {x | x > 0} = (x) -> assert(x > 0);
      let assertPositive: (x: Number) -> asserts {x | x > 0} = (x) -> assertPositiveBase(1);
      1
    `),
    )

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
    const diagnostics = verifyAssertionFunctionBodies(
      parseProgram(`
      do
        let assertPositive: (x: Number) -> asserts {x | x > 0} = (x) -> assert(x > 0);
        1
      end
    `),
    )

    expect(diagnostics).toHaveLength(0)
  })

  it('handles non-terminal if statements in assertion bodies', () => {
    const diagnostics = verifyAssertionFunctionBodies(
      parseProgram(`
      let assertPositive: (x: Number) -> asserts {x | x > 0} = (x) -> do
        if x > 0 then true else assert(x > 0) end;
        true
      end;
      1
    `),
    )

    expect(diagnostics).toHaveLength(0)
  })

  it('keeps later statements trivially proven after an earlier exact assert', () => {
    const diagnostics = verifyAssertionFunctionBodies(
      parseProgram(`
      let assertPositive: (x: Number) -> asserts {x | x > 0} = (x) -> do
        assert(x > 0);
        if false then false else true end;
        true
      end;
      1
    `),
    )

    expect(diagnostics).toHaveLength(0)
  })

  it('rejects helper calls whose asserted predicate differs from the target predicate', () => {
    const diagnostics = verifyAssertionFunctionBodies(
      parseProgram(`
      let assertStrictlyPositive: (x: Number) -> asserts {x | x > 1} = (x) -> assert(x > 1);
      let assertPositive: (x: Number) -> asserts {x | x > 0} = (x) -> assertStrictlyPositive(x);
      1
    `),
    )

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

  // `match` bodies are now path-checked: every case's body must prove
  // the asserted predicate, mirroring how `if` requires both branches
  // to prove. Sibling tests below cover positive + rejection paths.
  it('accepts match-bodied assertion when every case body proves the predicate', () => {
    const ast = parseProgram(`
      let assertPositive: (x: Number) -> asserts {x | x > 0} = (x) ->
        match x
          case _ then assert(x > 0)
        end;
      1
    `)
    const diagnostics = verifyAssertionFunctionBodies(ast)
    expect(diagnostics.filter(d => d.severity === 'error')).toHaveLength(0)
  })

  // Exercises the `statementGuarantees` path (vs `terminalProves`).
  // The match is mid-sequence — every case body proves P, then a
  // trailing expression continues. Without `matchProves` being
  // called from `statementGuarantees`, the trailing statement would
  // start with proven=false and the function as a whole would be
  // rejected. With it, the loop in `sequenceProves` correctly
  // inherits proven=true into the next statement.
  it('accepts match in non-terminal position when every case proves the predicate', () => {
    const ast = parseProgram(`
      let assertPositive: (x: Number) -> asserts {x | x > 0} = (x) -> do
        match x
          case _ then assert(x > 0)
        end;
        x
      end;
      1
    `)
    const diagnostics = verifyAssertionFunctionBodies(ast)
    expect(diagnostics.filter(d => d.severity === 'error')).toHaveLength(0)
  })

  it('rejects match-bodied assertion when ANY case body fails to prove', () => {
    // First case returns 0 without asserting; the second proves. Match
    // proof requires ALL cases to prove (any case is a possible
    // normal-return path), so this is correctly rejected.
    const ast = parseProgram(`
      let assertPositive: (x: Number) -> asserts {x | x > 0} = (x) ->
        match x
          case 0 then 0
          case _ then assert(x > 0)
        end;
      1
    `)
    const diagnostics = verifyAssertionFunctionBodies(ast)
    expect(diagnostics.some(d => d.message.includes('does not prove'))).toBe(true)
  })

  // Pattern-binding-aware substitution: when the scrutinee is the
  // outer asserted parameter and the case binds a single Sym, the
  // bound name is recognised as a local alias and predicates that
  // reference it match as if they referenced the outer parameter.
  it('accepts assertion that references case-binding name (pattern-binding alias)', () => {
    const ast = parseProgram(`
      let assertPositive: (x: Number) -> asserts {x | x > 0} = (x) ->
        match x
          case n then assert(n > 0)
        end;
      1
    `)
    const diagnostics = verifyAssertionFunctionBodies(ast)
    expect(diagnostics.filter(d => d.severity === 'error')).toHaveLength(0)
  })

  // Pattern-binding alias only fires when the scrutinee IS the outer
  // asserted parameter. Matching on a different expression doesn't
  // establish that the case binding aliases the asserted parameter,
  // so `assert(n > 0)` is correctly rejected.
  it('rejects pattern-binding alias when scrutinee is not the asserted parameter', () => {
    const ast = parseProgram(`
      let assertPositive: (x: Number) -> asserts {x | x > 0} = (x) ->
        match x + 1
          case n then assert(n > 0)
        end;
      1
    `)
    const diagnostics = verifyAssertionFunctionBodies(ast)
    expect(diagnostics.some(d => d.message.includes('does not prove'))).toBe(true)
  })

  // Guard narrowing: a guard whose condition matches the target
  // predicate establishes proven=true for the case body — same as
  // an `If` whose condition matches the target.
  it('accepts guard whose condition matches the target predicate', () => {
    const ast = parseProgram(`
      let assertPositive: (x: Number) -> asserts {x | x > 0} = (x) ->
        match x
          case _ when x > 0 then x
        end;
      1
    `)
    const diagnostics = verifyAssertionFunctionBodies(ast)
    expect(diagnostics.filter(d => d.severity === 'error')).toHaveLength(0)
  })

  it('rejects guard whose condition does not match the target predicate', () => {
    const ast = parseProgram(`
      let assertPositive: (x: Number) -> asserts {x | x > 0} = (x) ->
        match x
          case _ when x < 0 then x
        end;
      1
    `)
    const diagnostics = verifyAssertionFunctionBodies(ast)
    expect(diagnostics.some(d => d.message.includes('does not prove'))).toBe(true)
  })

  // Combined: guard narrowing should also use the substituted info,
  // so a guard referencing the case-binding name should narrow when
  // its predicate matches the (per-case) target.
  it('accepts guard referencing case-binding name when the alias predicate matches', () => {
    const ast = parseProgram(`
      let assertPositive: (x: Number) -> asserts {x | x > 0} = (x) ->
        match x
          case n when n > 0 then n
        end;
      1
    `)
    const diagnostics = verifyAssertionFunctionBodies(ast)
    expect(diagnostics.filter(d => d.severity === 'error')).toHaveLength(0)
  })

  // Helper-call path under pattern-binding alias. The case body
  // calls another verified assertion helper using the case-binding
  // name. Without `source` being rewritten in `applyCaseBinderAlias`,
  // `establishesTargetPredicate`'s `helper.asserts.source !==
  // info.asserts.source` guard would over-reject this — even though
  // the call structurally proves the assertion under the alias.
  it('accepts case-aliased helper call (binder-rewrite covers `source` too)', () => {
    const ast = parseProgram(`
      let assertPositive: (x: Number) -> asserts {x | x > 0} = (x) -> assert(x > 0);
      let outer: (y: Number) -> asserts {y | y > 0} = (y) ->
        match y
          case n then assertPositive(n)
        end;
      1
    `)
    const diagnostics = verifyAssertionFunctionBodies(ast)
    expect(diagnostics.filter(d => d.severity === 'error')).toHaveLength(0)
  })

  // Nested match — match inside another match. Verifies recursion
  // works through the matchProves helper for both outer and inner.
  it('accepts nested match where every leaf case proves the predicate', () => {
    const ast = parseProgram(`
      let assertPositive: (x: Number) -> asserts {x | x > 0} = (x) ->
        match x
          case _ then match x
            case _ then assert(x > 0)
          end
        end;
      1
    `)
    const diagnostics = verifyAssertionFunctionBodies(ast)
    expect(diagnostics.filter(d => d.severity === 'error')).toHaveLength(0)
  })

  // Empty match — no cases — is structurally degenerate. Reject so
  // the user sees a diagnostic rather than a silent accept. The
  // parser likely rejects empty match upstream (parseMatch requires
  // at least one `case` token); this test mutates a parsed AST
  // synthetically to exercise the verifier's defensive path. End-to-
  // end parse-and-verify of an empty match shouldn't be reachable.
  it('rejects synthetically-empty match (defensive verifier path)', () => {
    const ast = parseProgram(`
      let assertPositive: (x: Number) -> asserts {x | x > 0} = (x) ->
        match x
          case _ then assert(x > 0)
        end;
      1
    `)
    // Drop the cases array to construct an empty match for the test.
    const valueNode = (ast.body[0]![1] as [BindingTarget, AstNode])[1]
    const bodyMatch = (valueNode[1] as [AstNode[], AstNode[]])[1][0] as AstNode
    if (bodyMatch[0] === NodeTypes.Match) {
      ;(bodyMatch[1] as [AstNode, AstNode[]])[1] = []
    }
    const diagnostics = verifyAssertionFunctionBodies(ast)
    expect(diagnostics.some(d => d.message.includes('does not prove'))).toBe(true)
  })
})
