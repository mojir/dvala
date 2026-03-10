import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../src/createDvala'
import { getMetaNormalExpression } from '../../../src/builtin/core/meta'
import type { ContextStack } from '../../../src/evaluator/ContextStack'
import { FUNCTION_SYMBOL } from '../../../src/utils/symbols'
import '../../../src/initReferenceData'

describe('misc functions', () => {
  for (const dvala of [createDvala(), createDvala({ debug: true })]) {
    describe('doc', () => {
      it('should return the doc for a function', () => {
        expect((dvala.run('doc(>=)') as string).length).toBeGreaterThan(0)
        expect((dvala.run('doc(>=(_))') as string).length).toBe(0)
        expect((dvala.run('doc(number?)') as string).length).toBeGreaterThan(0)
        expect(dvala.run('doc(2)')).toBe('')
        expect(dvala.run(`
          let add = ((a, b) -> a + b) with-doc "Adds two numbers.";
          doc(add)
        `)).toBe('Adds two numbers.')
      })
    })
    describe('with-doc', () => {
      it('should attach a doc string to a function', () => {
        expect(dvala.run(`
          let add = ((a, b) -> a + b) with-doc "Adds two numbers.";
          doc(add)
        `)).toBe('Adds two numbers.')
      })
      it('should support operator syntax', () => {
        expect(dvala.run(`
          let add = (a, b) -> a + b;
          let documented-add = add with-doc "Adds.";
          doc(documented-add)
        `)).toBe('Adds.')
      })
      it('should not modify the original function', () => {
        expect(dvala.run(`
          let add = (a, b) -> a + b;
          let documented-add = add with-doc "Adds.";
          doc(add)
        `)).toBe('')
      })
      it('should preserve function behavior', () => {
        expect(dvala.run(`
          let add = ((a, b) -> a + b) with-doc "Adds.";
          add(1, 2)
        `)).toBe(3)
      })
    })
    describe('arity', () => {
      it('should return the arity of a function', () => {
        expect(dvala.run('arity(+)')).toEqual({})
        expect(dvala.run('arity(1)')).toEqual({ min: 1, max: 1 })
        expect(dvala.run('arity((...x) -> x)')).toEqual({})
      })
    })
  }

  describe('doc with empty reference', () => {
    it('should return empty string for builtin with no reference data', () => {
      const meta = getMetaNormalExpression({}, {})
      const builtinFn = {
        [FUNCTION_SYMBOL]: true,
        type: 'function' as const,
        functionType: 'Builtin' as const,
        name: '>=',
        overloads: [],
        parameterCount: 2,
        arity: {},
      }
      const result = meta.doc!.evaluate(
        [builtinFn],
        { position: { line: 1, column: 1 }, code: 'doc(>=)' },
        undefined as unknown as ContextStack,
      )
      expect(result).toBe('')
    })
  })
})
