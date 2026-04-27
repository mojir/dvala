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
import { NumberType, Unknown, atom, literal, record, tuple } from './types'

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
    expect(tryFoldBuiltinCall(builtinNode('isNumber'), [literal(42)])).toEqual({ type: literal(true) })
    expect(tryFoldBuiltinCall(builtinNode('isNumber'), [literal('hi')])).toEqual({ type: literal(false) })
  })

  it('folds a string builtin', () => {
    expect(tryFoldBuiltinCall(builtinNode('count'), [literal('hello')])).toEqual({ type: literal(5) })
    expect(tryFoldBuiltinCall(builtinNode('upperCase'), [literal('abc')])).toEqual({ type: literal('ABC') })
  })

  it('supports Atom literals as args', () => {
    // typeOf(:ok) — pass the atom type in, expect a folded string.
    expect(tryFoldBuiltinCall(builtinNode('typeOf'), [atom('ok')])).toEqual({ type: literal('atom') })
  })

  it('supports Null as an arg', () => {
    const nullArg: Type = { tag: 'Primitive', name: 'Null' }
    expect(tryFoldBuiltinCall(builtinNode('isNull'), [nullArg])).toEqual({ type: literal(true) })
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

  // --- Composite reconstruction (decision #10) ---
  describe('composite arg reconstruction', () => {
    it('folds a builtin taking a literal Tuple', () => {
      // count([1, 2, 3]) — reconstructible Tuple arg.
      const result = tryFoldBuiltinCall(builtinNode('count'), [tuple([literal(1), literal(2), literal(3)])])
      expect(result).toEqual({ type: literal(3) })
    })

    it('folds a builtin taking a Tuple containing mixed primitives', () => {
      const result = tryFoldBuiltinCall(builtinNode('count'), [
        tuple([literal(1), literal('two'), literal(true), atom('ok')]),
      ])
      expect(result).toEqual({ type: literal(4) })
    })

    it('folds nested Tuples (Tuple of Tuples)', () => {
      // first([[1, 2], [3, 4]]) → [1, 2]. The fold lifts back to a
      // closed Tuple<Literal(1), Literal(2)>.
      const result = tryFoldBuiltinCall(builtinNode('first'), [
        tuple([tuple([literal(1), literal(2)]), tuple([literal(3), literal(4)])]),
      ])
      expect(result).toEqual({ type: tuple([literal(1), literal(2)]) })
    })

    it('folds a builtin taking a closed Record arg', () => {
      // count({a: 1, b: 2}) → 2.
      const result = tryFoldBuiltinCall(builtinNode('count'), [record({ a: literal(1), b: literal(2) })])
      expect(result).toEqual({ type: literal(2) })
    })

    it('folds keys({...}) back into a Tuple of string literals', () => {
      const result = tryFoldBuiltinCall(builtinNode('keys'), [record({ a: literal(1), b: literal(2) })])
      expect(result).toEqual({ type: tuple([literal('a'), literal('b')]) })
    })

    it('bails on open records', () => {
      const openRec = record({ a: literal(1) }, true)
      expect(tryFoldBuiltinCall(builtinNode('count'), [openRec])).toBeNull()
    })

    it('bails on Tuples containing non-literal elements', () => {
      // Tuple([Number, Literal(1)]) — first element has no concrete value.
      const result = tryFoldBuiltinCall(builtinNode('count'), [tuple([NumberType, literal(1)])])
      expect(result).toBeNull()
    })

    it('bails on Records containing non-literal field values', () => {
      const result = tryFoldBuiltinCall(builtinNode('count'), [record({ a: NumberType })])
      expect(result).toBeNull()
    })
  })
})

// ---------------------------------------------------------------------------
// collectSymRefs — scope-aware free-variable collection
// ---------------------------------------------------------------------------

import { collectSymRefs } from './constantFold'
import { parse } from '../parser'
import { tokenize } from '../tokenizer/tokenize'
import { minifyTokenStream } from '../tokenizer/minifyTokenStream'

/**
 * Helper: parse a Dvala source string, pull out the first Function node
 * found (directly at top level, or as the value of a `let` binding), and
 * hand to `collectSymRefs`.
 */
function collectSymRefsFromFunction(source: string): Set<string> {
  const ast = parse(minifyTokenStream(tokenize(source, false, undefined), { removeWhiteSpace: true }))
  for (const node of ast) {
    if (!Array.isArray(node)) continue
    if (node[0] === 'Let' && Array.isArray(node[1])) {
      const valueNode = (node[1] as unknown[])[1]
      if (Array.isArray(valueNode) && valueNode[0] === 'Function') {
        return collectSymRefs(valueNode as AstNode)
      }
    }
    if (node[0] === 'Function') {
      return collectSymRefs(node as AstNode)
    }
  }
  throw new Error(`No Function node found in: ${source}`)
}

describe('collectSymRefs — free variable collection', () => {
  it('excludes function parameters', () => {
    // `x` is a param → not free; `+` is Builtin (not Sym) → not collected.
    const refs = collectSymRefsFromFunction('let f = (x) -> x + 1; f')
    expect(refs.has('x')).toBe(false)
  })

  it('includes free outer references', () => {
    const refs = collectSymRefsFromFunction('let f = (x) -> x + base; f')
    expect(refs.has('base')).toBe(true)
    expect(refs.has('x')).toBe(false)
  })

  it('excludes names bound by let inside the body', () => {
    // `y` is locally bound via `let y = x + 1` — not free.
    // Only `base` should be collected as free.
    const refs = collectSymRefsFromFunction('let f = (x) -> do let y = x + 1; y + base end; f')
    expect(refs.has('y')).toBe(false)
    expect(refs.has('base')).toBe(true)
    expect(refs.has('x')).toBe(false)
  })

  it('excludes names shadowed by an inner let even when referenced before the let', () => {
    // `y` shadowed by the let (in Dvala the let extends for the rest of
    // the block). Uses of y in the let's rhs refer to the outer scope;
    // since there is no outer `y` in this expression, this is a free
    // reference — but uses AFTER the let are local.
    const refs = collectSymRefsFromFunction('let f = () -> do let y = 1; y + 2 end; f')
    // `y` is bound via the let by the time `y + 2` runs.
    expect(refs.has('y')).toBe(false)
  })

  it('does not leak inner function params to the outer scope', () => {
    // The inner `(y) -> y + 1` binds `y` within that function, not in
    // the outer function's body.
    const refs = collectSymRefsFromFunction('let outer = (x) -> do let inner = (y) -> y + 1; inner(x) end; outer')
    expect(refs.has('y')).toBe(false)
    expect(refs.has('x')).toBe(false)
    expect(refs.has('inner')).toBe(false)
  })

  it('treats destructuring params as bound', () => {
    const refs = collectSymRefsFromFunction('let f = ({ a, b }) -> a + b + outerThing; f')
    expect(refs.has('a')).toBe(false)
    expect(refs.has('b')).toBe(false)
    expect(refs.has('outerThing')).toBe(true)
  })
})
