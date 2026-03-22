import { describe, expect, it } from 'vitest'
import { createContextStack } from '../src/evaluator/ContextStack'

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
})
