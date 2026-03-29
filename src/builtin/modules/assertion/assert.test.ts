import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../createDvala'
import { AssertionError, DvalaError } from '../../../errors'
import { assertModule } from './'

describe('assert functions', () => {
  for (const dvala of [createDvala({ modules: [assertModule] }), createDvala({ debug: true, modules: [assertModule] })]) {
    // Helper to run assert module functions with the new import syntax
    const runWithAssert = (code: string): unknown => {
      const modifiedCode = `let a = import("assertion"); ${code}`
      return dvala.run(modifiedCode)
    }
    describe('assert (core)', () => {
      it('samples', () => {
        expect(() => dvala.run('assert(false)')).toThrowError(AssertionError)
        expect(() => dvala.run('assert(false, "Expected true")')).toThrowError(AssertionError)
        expect(() => dvala.run('assert(null)')).toThrowError(AssertionError)
        expect(() => dvala.run('assert(0)')).toThrowError(AssertionError)
        expect(() => dvala.run('assert("")')).toThrowError(AssertionError)
        expect(dvala.run('assert([])')).toEqual([])
        expect(dvala.run('assert(true)')).toBe(true)
        expect(dvala.run('assert(1)')).toBe(1)
        expect(dvala.run('assert("0")')).toBe('0')
      })
    })
    describe('assertEqual', () => {
      it('samples', () => {
        expect(() => runWithAssert('a.assertEqual(1, 0)')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertEqual({ a: 1 }, { a: 2 })')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertEqual({ a: 1 }, { a: 2 }, "Expected deep equal")')).toThrowError(AssertionError)
        expect(runWithAssert('a.assertEqual({ a: 1 }, { a: 1 })')).toBeNull()
      })
    })
    describe('assertNotEqual', () => {
      it('samples', () => {
        expect(() => runWithAssert('a.assertNotEqual(0, 0)')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertNotEqual({ a: 2 }, { a: 2 })')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertNotEqual({ a: 2 }, { a: 2 }, "Expected not deep equal")')).toThrowError(
          AssertionError,
        )
        expect(runWithAssert('a.assertNotEqual({ a: 2 }, { a: 1 })')).toBeNull()
      })
    })
    describe('assertGt', () => {
      it('samples', () => {
        expect(() => runWithAssert('a.assertGt(0, 0)')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertGt(0, 1)')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertGt("Albert", "albert")')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertGt("Albert", "albert", "Expected greater than")')).toThrowError(AssertionError)
        expect(runWithAssert('a.assertGt(1, 0)')).toBeNull()
        expect(runWithAssert('a.assertGt("albert", "Albert")')).toBeNull()
      })
    })
    describe('assertLt', () => {
      it('samples', () => {
        expect(() => runWithAssert('a.assertLt(0, 0)')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertLt(1, 0)')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertLt("albert", "Albert")')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertLt("albert", "Albert", "Expected less than")')).toThrowError(AssertionError)
        expect(runWithAssert('a.assertLt(0, 1)')).toBeNull()
        expect(runWithAssert('a.assertLt("Albert", "albert")')).toBeNull()
      })
    })
    describe('assertGte', () => {
      it('samples', () => {
        expect(() => runWithAssert('a.assertGte(0, 1)')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertGte("Albert", "albert")')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertGte("Albert", "albert", "Expected greater than or equal")')).toThrowError(
          AssertionError,
        )
        expect(runWithAssert('a.assertGte(1, 0)')).toBeNull()
        expect(runWithAssert('a.assertGte(1, 1)')).toBeNull()
        expect(runWithAssert('a.assertGte("albert", "albert")')).toBeNull()
        expect(runWithAssert('a.assertGte("albert", "Albert")')).toBeNull()
      })
    })
    describe('assertLte', () => {
      it('samples', () => {
        expect(() => runWithAssert('a.assertLte(1, 0)')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertLte("albert", "Albert")')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertLte("albert", "Albert", "Expected less than or equal")')).toThrowError(AssertionError)
        expect(runWithAssert('a.assertLte(0, 1)')).toBeNull()
        expect(runWithAssert('a.assertLte(1, 1)')).toBeNull()
        expect(runWithAssert('a.assertLte("albert", "albert")')).toBeNull()
        expect(runWithAssert('a.assertLte("Albert", "albert")')).toBeNull()
      })
    })
    describe('assertTrue', () => {
      it('samples', () => {
        expect(() => runWithAssert('a.assertTrue(false)')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertTrue(false, "Expected false")')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertTrue(1)')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertTrue(null)')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertTrue("x")')).toThrowError(AssertionError)
        expect(runWithAssert('a.assertTrue(true)')).toBeNull()
      })
    })
    describe('assertFalse', () => {
      it('samples', () => {
        expect(() => runWithAssert('a.assertFalse(true)')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertFalse(true, "Expected false")')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertFalse(null)')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertFalse(0)')).toThrowError(AssertionError)
        expect(runWithAssert('a.assertFalse(false)')).toBeNull()
      })
    })

    describe('assertTruthy', () => {
      it('samples', () => {
        expect(runWithAssert('a.assertTruthy(true)')).toBeNull()
        expect(runWithAssert('a.assertTruthy([])')).toBeNull()
        expect(runWithAssert('a.assertTruthy({})')).toBeNull()
        expect(runWithAssert('a.assertTruthy(1)')).toBeNull()
        expect(runWithAssert('a.assertTruthy("hej")')).toBeNull()
        expect(runWithAssert('a.assertTruthy(-> $ + $)')).toBeNull()
        expect(() => runWithAssert('a.assertTruthy(false)')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertTruthy(null, "Expected true")')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertTruthy(0)')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertTruthy("")')).toThrowError(AssertionError)
      })
    })

    describe('assertFalsy', () => {
      it('samples', () => {
        expect(() => runWithAssert('a.assertFalsy(true)')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertFalsy([])')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertFalsy({})')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertFalsy(1)')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertFalsy("hej")')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertFalsy(-> $ + $)')).toThrowError(AssertionError)
        expect(runWithAssert('a.assertFalsy(false)')).toBeNull()
        expect(runWithAssert('a.assertFalsy(null, "Expected true")')).toBeNull()
        expect(runWithAssert('a.assertFalsy(0)')).toBeNull()
        expect(runWithAssert('a.assertFalsy("")')).toBeNull()
      })
    })

    describe('assertNull', () => {
      it('samples', () => {
        expect(() => runWithAssert('a.assertNull(false)')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertNull(0)')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertNull("")')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertNull("hej")')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertNull([])')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertNull({})')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertNull(-> $ + $)')).toThrowError(AssertionError)
        expect(runWithAssert('a.assertNull(null, "Should be null")')).toBeNull()
      })
    })

    describe('assertFails', () => {
      it('samples', () => {
        expect(() => runWithAssert('a.assertFails(-> identity("X"), "Should fail")')).toThrow(DvalaError)
        expect(() => runWithAssert('a.assertFails(-> perform(@dvala.error, "X"))')).not.toThrow()
        expect(() => runWithAssert('a.assertFails(-> perform(@dvala.error, "X"), "I knew it")')).not.toThrow()
        expect(() => runWithAssert('a.assertFails(-> perform(@dvala.error, "X"), 10)')).toThrow(DvalaError)
      })
    })

    describe('assertSucceeds', () => {
      it('samples', () => {
        expect(() => runWithAssert('a.assertSucceeds(-> identity("X"), "Should succeed")')).not.toThrow()
        expect(() => runWithAssert('a.assertSucceeds(-> perform(@dvala.error, "X"))')).toThrow(DvalaError)
      })
    })

    describe('assertFailsWith', () => {
      it('samples', () => {
        expect(() => runWithAssert('a.assertFailsWith(-> identity("X"), "X", "Should fail with X")')).toThrow(DvalaError)
        expect(() => runWithAssert('a.assertFailsWith(-> perform(@dvala.error, { message: "Y" }), "X")')).toThrow(DvalaError)
        expect(() => runWithAssert('a.assertFailsWith(-> perform(@dvala.error, { message: "X" }), "X")')).not.toThrow()
      })
    })

    describe('assertArray', () => {
      it('samples', () => {
        expect(runWithAssert('a.assertArray([])')).toBeNull()
        expect(runWithAssert('a.assertArray([1, 2, 3])')).toBeNull()
        expect(() => runWithAssert('a.assertArray("string")')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertArray(42)')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertArray(true)')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertArray(null)')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertArray({}, "Expected an array")')).toThrowError(AssertionError)
      })
    })

    describe('assertBoolean', () => {
      it('samples', () => {
        expect(runWithAssert('a.assertBoolean(true)')).toBeNull()
        expect(runWithAssert('a.assertBoolean(false)')).toBeNull()
        expect(() => runWithAssert('a.assertBoolean(1)')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertBoolean(0)')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertBoolean("true")')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertBoolean(null)')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertBoolean([], "Expected a boolean")')).toThrowError(AssertionError)
      })
    })

    describe('assertCollection', () => {
      it('samples', () => {
        expect(runWithAssert('a.assertCollection([])')).toBeNull()
        expect(runWithAssert('a.assertCollection([1, 2])')).toBeNull()
        expect(runWithAssert('a.assertCollection({})')).toBeNull()
        expect(runWithAssert('a.assertCollection({ a: 1 })')).toBeNull()
        expect(runWithAssert('a.assertCollection("hello")')).toBeNull()
        expect(() => runWithAssert('a.assertCollection(42)')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertCollection(true)')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertCollection(null, "Expected a collection")')).toThrowError(AssertionError)
      })
    })

    describe('assertFunction', () => {
      it('samples', () => {
        expect(runWithAssert('a.assertFunction(-> $ + 1)')).toBeNull()
        expect(runWithAssert('a.assertFunction((x, y) -> x + y)')).toBeNull()
        expect(() => runWithAssert('a.assertFunction(42)')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertFunction("string")')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertFunction([], "Expected a function")')).toThrowError(AssertionError)
      })
    })

    describe('assertGrid', () => {
      it('samples', () => {
        expect(runWithAssert('a.assertGrid([[1, 2], [3, 4]])')).toBeNull()
        expect(runWithAssert('a.assertGrid([["a", "b"], ["c", "d"]])')).toBeNull()
        expect(() => runWithAssert('a.assertGrid([[1, 2], [3]])')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertGrid([1, 2])')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertGrid(42, "Expected a grid")')).toThrowError(AssertionError)
      })
    })

    describe('assertInteger', () => {
      it('samples', () => {
        expect(runWithAssert('a.assertInteger(42)')).toBeNull()
        expect(runWithAssert('a.assertInteger(0)')).toBeNull()
        expect(runWithAssert('a.assertInteger(-7)')).toBeNull()
        expect(() => runWithAssert('a.assertInteger(3.14)')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertInteger("42")')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertInteger(true, "Expected an integer")')).toThrowError(AssertionError)
      })
    })

    describe('assertMatrix', () => {
      it('samples', () => {
        expect(runWithAssert('a.assertMatrix([[1, 2], [3, 4]])')).toBeNull()
        expect(() => runWithAssert('a.assertMatrix([["a", "b"], ["c", "d"]])')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertMatrix([[1, 2], [3]])')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertMatrix([1, 2])')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertMatrix(42, "Expected a matrix")')).toThrowError(AssertionError)
      })
    })

    describe('assertNumber', () => {
      it('samples', () => {
        expect(runWithAssert('a.assertNumber(42)')).toBeNull()
        expect(runWithAssert('a.assertNumber(3.14)')).toBeNull()
        expect(runWithAssert('a.assertNumber(0)')).toBeNull()
        expect(runWithAssert('a.assertNumber(-1)')).toBeNull()
        expect(() => runWithAssert('a.assertNumber("42")')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertNumber(true)')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertNumber(null, "Expected a number")')).toThrowError(AssertionError)
      })
    })

    describe('assertObject', () => {
      it('samples', () => {
        expect(runWithAssert('a.assertObject({})')).toBeNull()
        expect(runWithAssert('a.assertObject({ a: 1 })')).toBeNull()
        expect(() => runWithAssert('a.assertObject([])')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertObject("string")')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertObject(42, "Expected an object")')).toThrowError(AssertionError)
      })
    })

    describe('assertRegexp', () => {
      it('samples', () => {
        expect(runWithAssert('a.assertRegexp(#"^start")')).toBeNull()
        expect(runWithAssert('a.assertRegexp(regexp("test"))')).toBeNull()
        expect(() => runWithAssert('a.assertRegexp("string")')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertRegexp(42, "Expected a regexp")')).toThrowError(AssertionError)
      })
    })

    describe('assertSequence', () => {
      it('samples', () => {
        expect(runWithAssert('a.assertSequence([])')).toBeNull()
        expect(runWithAssert('a.assertSequence([1, 2])')).toBeNull()
        expect(runWithAssert('a.assertSequence("hello")')).toBeNull()
        expect(() => runWithAssert('a.assertSequence({})')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertSequence(42)')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertSequence(null, "Expected a sequence")')).toThrowError(AssertionError)
      })
    })

    describe('assertString', () => {
      it('samples', () => {
        expect(runWithAssert('a.assertString("")')).toBeNull()
        expect(runWithAssert('a.assertString("hello")')).toBeNull()
        expect(() => runWithAssert('a.assertString(42)')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertString(true)')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertString([], "Expected a string")')).toThrowError(AssertionError)
      })
    })

    describe('assertVector', () => {
      it('samples', () => {
        expect(runWithAssert('a.assertVector([])')).toBeNull()
        expect(runWithAssert('a.assertVector([1, 2, 3])')).toBeNull()
        expect(() => runWithAssert('a.assertVector(["a", "b"])')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertVector("string")')).toThrowError(AssertionError)
        expect(() => runWithAssert('a.assertVector(42, "Expected a vector")')).toThrowError(AssertionError)
      })
    })
  }
})
