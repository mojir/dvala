/**
 * Unit tests for `tryFoldBuiltinCall`. Exercises the primitive-only fold
 * path directly (without going through `inferExpr`). Integration with
 * `inferExpr` is gated by `FOLD_ENABLED` (env-var toggle); see
 * `src/typechecker/fold.test.ts` for the integrated flow.
 */

import { describe, expect, it } from 'vitest'
import { NodeTypes } from '../constants/constants'
import type { AstNode } from '../parser/types'
import { tryFoldBuiltinCall } from './constantFold'
import type { Type } from './types'
import { NumberType, Unknown, atom, literal } from './types'

function builtinNode(name: string): AstNode {
  return [NodeTypes.Builtin, name, 0] as unknown as AstNode
}

describe('tryFoldBuiltinCall', () => {
  it('folds a pure binary builtin with primitive-literal args', () => {
    const result = tryFoldBuiltinCall(builtinNode('+'), [literal(2), literal(3)])
    expect(result).toEqual({ type: literal(5) })
  })

  it('folds a variadic call', () => {
    const result = tryFoldBuiltinCall(builtinNode('+'), [literal(1), literal(2), literal(3), literal(4)])
    expect(result).toEqual({ type: literal(10) })
  })

  it('folds a predicate to a literal bool', () => {
    expect(tryFoldBuiltinCall(builtinNode('isNumber'), [literal(42)]))
      .toEqual({ type: literal(true) })
    expect(tryFoldBuiltinCall(builtinNode('isNumber'), [literal('hi')]))
      .toEqual({ type: literal(false) })
  })

  it('folds a string builtin', () => {
    expect(tryFoldBuiltinCall(builtinNode('count'), [literal('hello')]))
      .toEqual({ type: literal(5) })
    expect(tryFoldBuiltinCall(builtinNode('upperCase'), [literal('abc')]))
      .toEqual({ type: literal('ABC') })
  })

  it('supports Atom literals as args', () => {
    // typeOf(:ok) — pass the atom type in, expect a folded string.
    expect(tryFoldBuiltinCall(builtinNode('typeOf'), [atom('ok')]))
      .toEqual({ type: literal('atom') })
  })

  it('supports Null as an arg', () => {
    const nullArg: Type = { tag: 'Primitive', name: 'Null' }
    expect(tryFoldBuiltinCall(builtinNode('isNull'), [nullArg]))
      .toEqual({ type: literal(true) })
  })

  it('surfaces @dvala.error when a partial builtin fails on literal input', () => {
    const result = tryFoldBuiltinCall(builtinNode('/'), [literal(1), literal(0)])
    expect(result).toEqual({ effectName: 'dvala.error' })
  })

  it('returns null for non-Builtin callees (Phase C v1 restriction)', () => {
    const symNode: AstNode = [NodeTypes.Sym, 'myFn', 0] as unknown as AstNode
    expect(tryFoldBuiltinCall(symNode, [literal(1)])).toBeNull()
  })

  it('returns null when any arg is non-primitive-literal', () => {
    // Unknown arg → bail.
    expect(tryFoldBuiltinCall(builtinNode('+'), [literal(1), Unknown])).toBeNull()
    // Plain `Number` (not a literal) → bail.
    expect(tryFoldBuiltinCall(builtinNode('+'), [literal(1), NumberType])).toBeNull()
  })
})
