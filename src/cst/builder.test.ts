import { describe, expect, it } from 'vitest'
import type { CstToken } from './types'
import { CstBuilder } from './builder'

// Helper to create a minimal CstToken
function tok(text: string): CstToken {
  return { leadingTrivia: [], text, trailingTrivia: [] }
}

describe('CstBuilder', () => {
  it('builds a single root node with tokens', () => {
    const b = new CstBuilder()
    b.startNode('Program')
    b.token(tok('42'))
    b.endNode()
    const tree = b.finish()

    expect(tree.kind).toBe('Program')
    expect(tree.children).toHaveLength(1)
    expect(tree.children[0]).toEqual(tok('42'))
  })

  it('builds nested nodes', () => {
    const b = new CstBuilder()
    b.startNode('Program')
    b.startNode('BinaryOp')
    b.token(tok('1'))
    b.token(tok('+'))
    b.token(tok('2'))
    b.endNode()
    b.endNode()
    const tree = b.finish()

    expect(tree.kind).toBe('Program')
    expect(tree.children).toHaveLength(1)
    const binOp = tree.children[0] as { kind: string; children: unknown[] }
    expect(binOp.kind).toBe('BinaryOp')
    expect(binOp.children).toHaveLength(3)
  })

  it('builds siblings at the same level', () => {
    const b = new CstBuilder()
    b.startNode('Program')
    b.token(tok('a'))
    b.token(tok(';'))
    b.token(tok('b'))
    b.endNode()
    const tree = b.finish()

    expect(tree.children).toHaveLength(3)
  })

  it('builds deeply nested nodes', () => {
    const b = new CstBuilder()
    b.startNode('Program')
    b.startNode('Let')
    b.token(tok('let'))
    b.startNode('SymbolBinding')
    b.token(tok('x'))
    b.endNode()
    b.token(tok('='))
    b.startNode('NumberLiteral')
    b.token(tok('42'))
    b.endNode()
    b.endNode()
    b.endNode()
    const tree = b.finish()

    expect(tree.kind).toBe('Program')
    expect(tree.children).toHaveLength(1)
    const letNode = tree.children[0] as { kind: string; children: unknown[] }
    expect(letNode.kind).toBe('Let')
    expect(letNode.children).toHaveLength(4)
  })

  it('throws if finish() called with no open nodes', () => {
    const b = new CstBuilder()
    expect(() => b.finish()).toThrow('expected exactly 1 node on stack, found 0')
  })

  it('throws if finish() called with unclosed nodes', () => {
    const b = new CstBuilder()
    b.startNode('Program')
    b.startNode('BinaryOp')
    expect(() => b.finish()).toThrow('expected exactly 1 node on stack, found 2')
  })

  it('throws if finish() called twice', () => {
    const b = new CstBuilder()
    b.startNode('Program')
    b.endNode()
    b.finish()
    expect(() => b.finish()).toThrow('called more than once')
  })

  it('throws if token() called with no open node', () => {
    const b = new CstBuilder()
    expect(() => b.token(tok('x'))).toThrow('no open node')
  })
})
