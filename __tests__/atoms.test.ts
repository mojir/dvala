/**
 * Atom value type tests.
 *
 * Covers: literals, equality, typeOf, str, isAtom, compare,
 * pattern matching, arrays with atoms.
 */

import { describe, expect, it } from 'vitest'
import { createDvala } from '../src/createDvala'

const dvala = createDvala()

describe('atom literals', () => {
  it('atom evaluates to itself', () => {
    const result = dvala.run(':ok')
    expect(result).toEqual(expect.objectContaining({ name: 'ok' }))
  })

  it('different atoms have different names', () => {
    expect(dvala.run(':ok')).toEqual(expect.objectContaining({ name: 'ok' }))
    expect(dvala.run(':error')).toEqual(expect.objectContaining({ name: 'error' }))
    expect(dvala.run(':pending')).toEqual(expect.objectContaining({ name: 'pending' }))
  })
})

describe('atom equality', () => {
  it('same atoms are equal', () => {
    expect(dvala.run(':ok == :ok')).toBe(true)
  })

  it('different atoms are not equal', () => {
    expect(dvala.run(':ok != :error')).toBe(true)
    expect(dvala.run(':ok == :error')).toBe(false)
  })

  it('atoms are not equal to strings', () => {
    expect(dvala.run(':ok != "ok"')).toBe(true)
    expect(dvala.run(':ok == "ok"')).toBe(false)
  })

  it('atoms are not equal to numbers or booleans', () => {
    expect(dvala.run(':ok != 42')).toBe(true)
    expect(dvala.run(':ok != true')).toBe(true)
    expect(dvala.run(':ok != null')).toBe(true)
  })
})

describe('atom builtins', () => {
  it('typeOf returns "atom"', () => {
    expect(dvala.run('typeOf(:ok)')).toBe('atom')
  })

  it('str returns ":name"', () => {
    expect(dvala.run('str(:ok)')).toBe(':ok')
    expect(dvala.run('str(:hello)')).toBe(':hello')
  })

  it('isAtom returns true for atoms', () => {
    expect(dvala.run('isAtom(:ok)')).toBe(true)
    expect(dvala.run('isAtom(:error)')).toBe(true)
  })

  it('isAtom returns false for non-atoms', () => {
    expect(dvala.run('isAtom("ok")')).toBe(false)
    expect(dvala.run('isAtom(42)')).toBe(false)
    expect(dvala.run('isAtom(true)')).toBe(false)
    expect(dvala.run('isAtom(null)')).toBe(false)
    expect(dvala.run('isAtom([1, 2])')).toBe(false)
  })

  it('compare orders atoms alphabetically', () => {
    expect(dvala.run('compare(:apple, :banana)')).toBe(-1)
    expect(dvala.run('compare(:banana, :apple)')).toBe(1)
    expect(dvala.run('compare(:ok, :ok)')).toBe(0)
  })
})

describe('atoms in collections', () => {
  it('atoms in arrays', () => {
    const result = dvala.run('[:ok, 42]')
    expect(result).toEqual([expect.objectContaining({ name: 'ok' }), 42])
  })

  it('atoms as object values', () => {
    const result = dvala.run('{ status: :ok }') as Record<string, unknown>
    expect(result.status).toEqual(expect.objectContaining({ name: 'ok' }))
  })
})

describe('atoms in pattern matching', () => {
  it('atom literal pattern', () => {
    expect(dvala.run('match :ok case :ok then "yes" case :error then "no" end')).toBe('yes')
    expect(dvala.run('match :error case :ok then "yes" case :error then "no" end')).toBe('no')
  })

  it('atom in array destructuring pattern', () => {
    expect(dvala.run('match [:ok, 42] case [ :ok, v] then v case [ :error, e] then e end')).toBe(42)
  })

  it('no match returns null', () => {
    expect(dvala.run('match :pending case :ok then "yes" case :error then "no" end')).toBe(null)
  })
})

describe('atom in let bindings', () => {
  it('can bind atom to variable', () => {
    expect(dvala.run('let x = :ok; x == :ok')).toBe(true)
  })

  it('can pass atom to function', () => {
    expect(dvala.run('let f = (x) -> x == :ok; f(:ok)')).toBe(true)
  })
})
