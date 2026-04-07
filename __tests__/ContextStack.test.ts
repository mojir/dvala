import { describe, expect, it } from 'vitest'
import { NodeTypes } from '../src/constants/constants'
import { createContextStack } from '../src/evaluator/ContextStack'
import type { SpecialSymbolNode } from '../src/parser/types'

describe('contextStack', () => {
  it('should throw if adding duplicate', () => {
    const contextStack = createContextStack()

    contextStack.addValues({ foo: 'bar' }, undefined)
    expect(() => contextStack.addValues({ foo: 'bar' }, undefined)).toThrow()
  })
  it('should throw if storing special expression', () => {
    const contextStack = createContextStack()

    expect(() => contextStack.addValues({ recur: 'bar' }, undefined)).toThrow()
  })
  it('should allow shadowing normal builtins', () => {
    const contextStack = createContextStack()

    expect(() => contextStack.addValues({ reduce: 'bar' }, undefined)).not.toThrow()
  })
  it('should allow shadowing self', () => {
    const contextStack = createContextStack()

    expect(() => contextStack.addValues({ self: 'bar' }, undefined)).not.toThrow()
  })
  it('should accept contexts parameter', () => {
    const contextStack = createContextStack({ contexts: [{ x: { value: 42 } }] })
    expect(contextStack).toBeDefined()
  })
  it('should return unwrapped contextStack when globalModuleScope is true', () => {
    const contextStack = createContextStack({ globalModuleScope: true })
    expect(contextStack).toBeDefined()
  })
  it('throws for a special symbol type not usable as a first-class value', () => {
    const contextStack = createContextStack()
    // 'for' is a SpecialExpressionType but not handled in the evaluateSymbol switch —
    // it can appear as a SpecialSymbolNode if written in operand position (e.g. `let f = for`)
    const node = [NodeTypes.Special, 'for', 0] as unknown as SpecialSymbolNode
    expect(() => contextStack.evaluateSymbol(node)).toThrow()
  })
})
