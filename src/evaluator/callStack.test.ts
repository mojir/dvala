import { describe, expect, it } from 'vitest'
import { createDvala } from '../createDvala'
import { DvalaError } from '../errors'

describe('callStack', () => {
  const d = createDvala()

  it('error in nested function call includes call stack', () => {
    const code = 'let inner = () -> 1 + "a"; let outer = () -> inner(); outer()'
    try {
      d.run(code)
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(DvalaError)
      const err = e as DvalaError
      expect(err.callStack).toBeDefined()
      expect(err.callStack!.length).toBeGreaterThanOrEqual(2)
      // The call stack should include the function names
      const names = err.callStack!.map(entry => entry.name)
      expect(names).toContain('inner')
      expect(names).toContain('outer')
    }
  })

  it('error in deeply nested calls shows full stack', () => {
    const code = 'let a = () -> 1 + "x"; let b = () -> a(); let c = () -> b(); c()'
    try {
      d.run(code)
      expect.unreachable('should have thrown')
    } catch (e) {
      const err = e as DvalaError
      expect(err.callStack).toBeDefined()
      const names = err.callStack!.map(entry => entry.name)
      expect(names).toContain('a')
      expect(names).toContain('b')
      expect(names).toContain('c')
    }
  })

  it('error in builtin function includes calling function in stack', () => {
    // Builtins throw synchronously and don't push frames, so the builtin name
    // itself won't appear — but the calling user-defined function should.
    const code = 'let wrapper = () -> first(42); wrapper()'
    try {
      d.run(code)
      expect.unreachable('should have thrown')
    } catch (e) {
      const err = e as DvalaError
      expect(err.callStack).toBeDefined()
      const names = err.callStack!.map(entry => entry.name)
      expect(names).toContain('wrapper')
    }
  })

  it('error message includes stack trace text', () => {
    const code = 'let foo = () -> 1 + "a"; foo()'
    try {
      d.run(code)
      expect.unreachable('should have thrown')
    } catch (e) {
      const err = e as DvalaError
      expect(err.message).toContain('at foo')
    }
  })

  it('handled errors do not get a call stack attached', () => {
    // Errors caught by algebraic handlers should not have call stacks
    const code = 'do with handler @dvala.error(e) -> resume(e.message) end; 1 + "a" end'
    // Should not throw — the error is handled
    const result = d.run(code)
    expect(result).toBe('Invalid parameter type: string')
  })
})
