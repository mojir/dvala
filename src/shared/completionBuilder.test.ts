import { describe, expect, it } from 'vitest'
import type { Reference } from '../../reference/index'
import type { SymbolDef } from '../languageService/types'
import { buildBuiltinCompletions, referenceToCompletion, symbolDefToCompletion } from './completionBuilder'

const baseRef = {
  title: 'foo',
  examples: [],
  description: '',
} as const

describe('referenceToCompletion', () => {
  it('maps special-expression to keyword', () => {
    const ref: Reference = {
      ...baseRef,
      category: 'special-expression',
      args: {},
      returns: { type: 'Number' },
      variants: [],
    } as unknown as Reference
    expect(referenceToCompletion('let', ref).kind).toBe('keyword')
  })

  it('maps effect to event', () => {
    const ref: Reference = {
      ...baseRef,
      category: 'effect',
      args: {},
      returns: { type: 'Number' },
      variants: [{ argumentNames: ['x'] }],
      effect: true,
    } as unknown as Reference
    expect(referenceToCompletion('@io.print', ref).kind).toBe('event')
  })

  it('maps shorthand to operator', () => {
    const ref: Reference = {
      ...baseRef,
      category: 'shorthand',
      shorthand: true,
    } as unknown as Reference
    expect(referenceToCompletion('+', ref).kind).toBe('operator')
  })

  it('maps datatype to class', () => {
    const ref: Reference = {
      ...baseRef,
      category: 'datatype',
      datatype: true,
    } as unknown as Reference
    expect(referenceToCompletion('Integer', ref).kind).toBe('class')
  })

  it('maps prelude to class', () => {
    const ref: Reference = {
      ...baseRef,
      category: 'prelude',
      prelude: true,
      definition: 'Integer & { x => x > 0 }',
    } as unknown as Reference
    expect(referenceToCompletion('Positive', ref).kind).toBe('class')
  })

  it('defaults function-like categories to function kind', () => {
    const ref: Reference = {
      ...baseRef,
      category: 'array',
      args: { x: { type: 'Number' } },
      returns: { type: 'Number' },
      variants: [{ argumentNames: ['x'] }],
    } as unknown as Reference
    expect(referenceToCompletion('inc', ref).kind).toBe('function')
  })

  it('emits a parametrized snippet for function references with args', () => {
    const ref: Reference = {
      ...baseRef,
      category: 'array',
      args: { a: { type: 'Number' }, b: { type: 'Number' } },
      returns: { type: 'Number' },
      variants: [{ argumentNames: ['a', 'b'] }],
    } as unknown as Reference
    const item = referenceToCompletion('add', ref)
    expect(item.params).toEqual(['a', 'b'])
    expect(item.insertText).toBe('add(${1:a}, ${2:b})')
  })

  it('emits an empty-arg snippet for nullary function references', () => {
    const ref: Reference = {
      ...baseRef,
      category: 'array',
      args: {},
      returns: { type: 'Number' },
      variants: [{ argumentNames: [] }],
    } as unknown as Reference
    const item = referenceToCompletion('now', ref)
    expect(item.insertText).toBe('now($0)')
    expect(item.params).toEqual([])
  })

  it('omits insertText for non-function references', () => {
    const ref: Reference = {
      ...baseRef,
      category: 'datatype',
      datatype: true,
    } as unknown as Reference
    const item = referenceToCompletion('Integer', ref)
    expect(item.insertText).toBeUndefined()
    expect(item.params).toBeUndefined()
  })
})

describe('symbolDefToCompletion', () => {
  function def(overrides: Partial<SymbolDef>): SymbolDef {
    return {
      name: 'x',
      kind: 'variable',
      nodeId: 0,
      location: { file: 'test.dvala', line: 1, column: 1 },
      scope: 0,
      ...overrides,
    }
  }

  it('maps each SymbolDef.kind to a portable kind', () => {
    expect(symbolDefToCompletion(def({ kind: 'variable' })).kind).toBe('variable')
    expect(symbolDefToCompletion(def({ kind: 'function' })).kind).toBe('function')
    expect(symbolDefToCompletion(def({ kind: 'macro' })).kind).toBe('method')
    expect(symbolDefToCompletion(def({ kind: 'handler' })).kind).toBe('event')
    expect(symbolDefToCompletion(def({ kind: 'parameter' })).kind).toBe('variable')
    expect(symbolDefToCompletion(def({ kind: 'import' })).kind).toBe('module')
  })

  it('sorts symbols after builtins via 1_ prefix', () => {
    expect(symbolDefToCompletion(def({ name: 'foo' })).sortText).toBe('1_foo')
  })

  it('emits a parametrized snippet for callables', () => {
    const item = symbolDefToCompletion(def({ name: 'sum', kind: 'function', params: ['a', 'b'] }))
    expect(item.params).toEqual(['a', 'b'])
    expect(item.insertText).toBe('sum(${1:a}, ${2:b})')
  })

  it('skips snippet generation when params is empty or absent', () => {
    expect(symbolDefToCompletion(def({ kind: 'variable' })).insertText).toBeUndefined()
    expect(symbolDefToCompletion(def({ kind: 'function', params: [] })).insertText).toBeUndefined()
  })

  it('exposes detail as the symbol kind', () => {
    expect(symbolDefToCompletion(def({ kind: 'macro' })).detail).toBe('macro')
  })
})

describe('buildBuiltinCompletions', () => {
  it('returns at least one completion item from the reference catalog', () => {
    const items = buildBuiltinCompletions()
    expect(items.length).toBeGreaterThan(0)
  })

  it('produces unique labels (deduplication holds)', () => {
    const items = buildBuiltinCompletions()
    const labels = new Set(items.map(i => i.label))
    expect(labels.size).toBe(items.length)
  })

  it('attaches a non-empty detail (category) to every item', () => {
    const items = buildBuiltinCompletions()
    for (const item of items) {
      expect(item.detail).toBeTruthy()
    }
  })
})
