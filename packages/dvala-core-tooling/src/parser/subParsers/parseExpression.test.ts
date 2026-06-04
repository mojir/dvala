import { describe, expect, it } from 'vitest'

import type { AstNode, SourceMap, SourceMapPosition } from '@mojir/dvala-types'
import { NodeTypes } from '@mojir/dvala-types'
import { parseToAst } from '../index'
import { tokenize } from '../../tokenizer/tokenize'
import { minifyTokenStream } from '../../tokenizer/minifyTokenStream'

function parseWithSourceMap(source: string): { body: AstNode[]; sourceMap?: SourceMap } {
  return parseToAst(minifyTokenStream(tokenize(source, true, '<test>'), { removeWhiteSpace: true }))
}

function findNode(node: AstNode | AstNode[], predicate: (n: AstNode) => boolean): AstNode | null {
  if (!Array.isArray(node)) return null
  if (typeof node[0] === 'string' && predicate(node as AstNode)) return node as AstNode
  for (const child of node) {
    if (Array.isArray(child)) {
      const result = findNode(child as AstNode, predicate)
      if (result) return result
    }
  }
  return null
}

function positionOf(node: AstNode, sourceMap?: SourceMap): SourceMapPosition | undefined {
  return sourceMap?.positions.get(node[node.length - 1] as number)
}

describe('parseExpression — source-map ranges for binary ops', () => {
  it('Call node for `1 + 2` spans from the left operand through the right (not just the operator)', () => {
    // Before the fix, the Call's range started at `+` (col 15) and missed
    // the `1`. With the fix it covers the full `1 + 2` expression.
    const { body, sourceMap } = parseWithSourceMap('let answer = 1 + 2')
    const call = findNode(body, n => n[0] === NodeTypes.Call)
    expect(call).not.toBeNull()
    const pos = positionOf(call!, sourceMap)
    expect(pos).toBeDefined()
    // Source-map columns are 0-based; `1` starts at column 13 and `2` ends
    // at column 18 (exclusive end).
    expect(pos!.start).toEqual([0, 13])
    expect(pos!.end).toEqual([0, 18])
  })

  it('chained binary ops keep the wrapping Call/And/Or range anchored at the leftmost operand', () => {
    // `1 + 2 + 3` parses left-associatively as `(1 + 2) + 3`. The outer
    // Call should still span from `1` through `3` because the LEFT operand
    // (the inner `1 + 2` Call) already starts at column 13.
    const { body, sourceMap } = parseWithSourceMap('let x = 1 + 2 + 3')
    const outerCall = findNode(body, n => n[0] === NodeTypes.Call)
    const pos = positionOf(outerCall!, sourceMap)
    expect(pos!.start).toEqual([0, 8])
    expect(pos!.end).toEqual([0, 17])
  })

  it('And node for `a && b` spans both operands', () => {
    const { body, sourceMap } = parseWithSourceMap('let p = a && b')
    const andNode = findNode(body, n => n[0] === NodeTypes.And)
    const pos = positionOf(andNode!, sourceMap)
    expect(pos!.start).toEqual([0, 8])
    expect(pos!.end).toEqual([0, 14])
  })

  it('Or node for `a || b` spans both operands', () => {
    const { body, sourceMap } = parseWithSourceMap('let p = a || b')
    const orNode = findNode(body, n => n[0] === NodeTypes.Or)
    const pos = positionOf(orNode!, sourceMap)
    expect(pos!.start).toEqual([0, 8])
    expect(pos!.end).toEqual([0, 14])
  })

  it('Qq (nullish) node for `a ?? b` spans both operands', () => {
    const { body, sourceMap } = parseWithSourceMap('let p = a ?? b')
    const qqNode = findNode(body, n => n[0] === NodeTypes.Qq)
    const pos = positionOf(qqNode!, sourceMap)
    expect(pos!.start).toEqual([0, 8])
    expect(pos!.end).toEqual([0, 14])
  })

  it('pipe `a |> f` desugars to a Call whose range covers both sides', () => {
    // `a |> f` becomes `f(a)` at parse time; the synthesized Call's range
    // should still cover from `a` (the source-side LEFT) through `f`.
    const { body, sourceMap } = parseWithSourceMap('let p = a |> f')
    const callNode = findNode(body, n => n[0] === NodeTypes.Call)
    const pos = positionOf(callNode!, sourceMap)
    expect(pos!.start).toEqual([0, 8])
    expect(pos!.end).toEqual([0, 14])
  })
})
