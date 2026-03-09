/* eslint-disable no-console */
import { afterEach, beforeEach, describe, expect, it, test, vitest } from 'vitest'
import { createDvala } from '../../../src/createDvala'
import { DvalaError, RecurSignal } from '../../../src/errors'
import { functionalUtilsModule } from '../../../src/builtin/modules/functional'

describe('functional functions.', () => {
  for (const dvala of [createDvala({ modules: [functionalUtilsModule] }), createDvala({ debug: true, modules: [functionalUtilsModule] })]) {
    let oldLog: () => void
    let logSpy: typeof console.log
    beforeEach(() => {
      oldLog = console.log
      logSpy = vitest.fn()
      console.log = logSpy
    })
    afterEach(() => {
      console.log = oldLog
    })
    describe('apply.', () => {
      it('samples.', () => {
        expect(dvala.run('apply(+, [1, 2, 3, 4])')).toBe(10)
        expect(dvala.run('+ apply [1, 2, 3, 4]')).toBe(10)
        expect(dvala.run('apply(+, 1, 2, [3, 4])')).toBe(10)
        expect(() => dvala.run('apply(+)')).toThrow(DvalaError)
        expect(() => dvala.run('apply(+, 2, 3)')).toThrow(DvalaError)
      })
    })

    describe('identity.', () => {
      it('samples.', () => {
        expect(dvala.run('identity("Albert")')).toBe('Albert')
        expect(dvala.run('identity("")')).toBe('')
        expect(dvala.run('identity(null)')).toBe(null)
        expect(dvala.run('identity(false)')).toBe(false)
        expect(dvala.run('identity(true)')).toBe(true)
        expect(dvala.run('identity({ a: 1 })')).toEqual({ a: 1 })
        expect(dvala.run('identity([1, 2, 3])')).toEqual([1, 2, 3])
        expect(() => dvala.run('identity()')).toThrow(DvalaError)
        expect(() => dvala.run('identity(1, 2)')).toThrow(DvalaError)
      })
    })

    describe('partial functions.', () => {
      it('samples.', () => {
        expect(dvala.run('+(1, _)(2)')).toBe(3)
        expect(dvala.run('+(1, _, _)(2, _)(2)')).toBe(5)
        expect(dvala.run('+(_, _)(2, _)(2)')).toBe(4)
        expect(dvala.run('+(_, _)(2, 2)')).toBe(4)
        expect(() => dvala.run('+(_, _)(2)')).toThrow(DvalaError)
        expect(() => dvala.run('+(_, _)(2, 2, 2)')).toThrow(DvalaError)
      })
    })

    describe('pipe |>', () => {
      it('samples.', () => {
        expect(dvala.run('1 |> +(_, 2)')).toBe(3)
        expect(dvala.run('|>(1, +(2, _))')).toBe(3)
        expect(dvala.run(`range(10)
                           |> map(_, -> $ ^ 2) // [0, 1, 4, 9, 16, 25, 36, 49, 64, 81]
                           |> filter(_, odd?)  // [1, 9, 25, 49, 81]
                           |> reduce(_, +, 0)  // 165
                           |> sqrt             // 12.84523257866513
                           |> round(_, 2)`)).toBe(12.85)
      })
    })

    describe('comp.', () => {
      it('samples.', () => {
        expect(dvala.run('let negative-quotient = comp(-, /); negative-quotient(9, 3)')).toBe(-3)
        expect(
          dvala.run(`
        (
          -> apply(
            comp,
            first,
            repeat(rest, $2)
          )($1)
        )([1, 2, 3, 4, 5, 6, 7], 3)
      `),
        ).toBe(4)
        expect(dvala.run('let x = { bar: { foo: 42 }}; comp("foo", "bar")(x)')).toBe(42)

        expect(dvala.run('comp()(10)')).toBe(10)
        expect(dvala.run('comp()(null)')).toBe(null)
        expect(dvala.run('comp()({ "a": 10 })')).toEqual({ a: 10 })
        expect(dvala.run('comp()(["x", 10, null])')).toEqual(['x', 10, null])
        expect(dvala.run(`
let foo = comp(not, odd?);
[2, 3, 4, 5] filter foo`)).toEqual([2, 4])
        expect(() => dvala.run('comp()(1, 2)')).toThrow(DvalaError)
        expect(() => dvala.run('comp(true)()')).toThrow(DvalaError)
      })
    })

    describe('constanty.', () => {
      it('samples.', () => {
        expect(dvala.run('constantly(10)(12, null, "x")')).toBe(10)
        expect(() => dvala.run('constanty()')).toThrow(DvalaError)
        expect(() => dvala.run('constanty(10, 20)')).toThrow(DvalaError)
      })
    })

    describe('juxt.', () => {
      it('samples.', () => {
        expect(dvala.run('let { juxt } = import(functional); juxt(+, *, min, max)(3, 4, 6)')).toEqual([13, 72, 3, 6])
        expect(dvala.run('let { juxt } = import(functional); juxt("a", "b")({ a: 1, b: 2, c: 3, d: 4})')).toEqual([1, 2])
        expect(dvala.run('let { juxt } = import(functional); apply(juxt(+, *, min, max), range(1, 5))')).toEqual([10, 24, 1, 4])
        expect(() => dvala.run('let { juxt } = import(functional); juxt(-> $, -> $2)')).toThrow() // Must accept same number of params

        expect((dvala.run('let { juxt } = import(functional); juxt((x) -> x, (x, y = 1) -> x + y, (...c) -> 0)') as any).arity).toEqual({ min: 1, max: 1 })
        expect(() => dvala.run('let { juxt } = import(functional); juxt()')).toThrow(DvalaError)
      })
    })

    describe('complement.', () => {
      it('samples.', () => {
        expect(dvala.run('let { complement } = import(functional); complement(>)(4, 6)')).toBe(true)
        expect(dvala.run('let { complement } = import(functional); complement(==)(3, 3)')).toBe(false)
        expect(() => dvala.run('let { complement } = import(functional); complement()')).toThrow(DvalaError)
        expect(() => dvala.run('let { complement } = import(functional); complement(>, <)')).toThrow(DvalaError)
      })
    })

    describe('every-pred.', () => {
      it('samples.', () => {
        expect(dvala.run('let { every-pred } = import(functional); every-pred(string?, -> count($1) > 3)("Albert")')).toBe(true)
        expect(dvala.run('let { every-pred } = import(functional); every-pred(string?, -> count($1) > 3)("Albert", "Mojir")')).toBe(true)
        expect(dvala.run('let { every-pred } = import(functional); every-pred(string?, -> count($1) > 3)("Albert", "L", "Mojir")')).toBe(false)
        expect(dvala.run('let { every-pred } = import(functional); every-pred(string?, -> count($1) > 3)("Albert", [1, 2, 3, 4])')).toBe(false)
        expect(() => dvala.run('let { every-pred } = import(functional); every-pred()')).toThrow(DvalaError)
      })
    })

    describe('some-pred.', () => {
      it('samples.', () => {
        expect(dvala.run('let { some-pred } = import(functional); some-pred(string?, -> count($1) > 3)("Albert", "M")')).toBe(true)
        expect(dvala.run('let { some-pred } = import(functional); some-pred(string?, -> count($1) > 3)("A", "M")')).toBe(true)
        expect(dvala.run('let { some-pred } = import(functional); some-pred(string?, -> count($1) > 3)([10, 20], [20, 10])')).toBe(false)
        expect(dvala.run('let { some-pred } = import(functional); some-pred(string?, -> count($1) > 3)("Albert", [10, 20])')).toBe(true)
        expect(() => dvala.run('let { some-pred } = import(functional); some-pred()')).toThrow(DvalaError)
      })
    })

    describe('fnull.', () => {
      it('samples.', () => {
        expect(dvala.run('let { fnull } = import(functional); fnull(+, 1, 2)(0, 0)')).toBe(0)
        expect(dvala.run('let { fnull } = import(functional); fnull(+, 1, 2)(null, 0)')).toBe(1)
        expect(dvala.run('let { fnull } = import(functional); fnull(+, 1, 2)(0, null)')).toBe(2)
        expect(dvala.run('let { fnull } = import(functional); fnull(+, 1, 2)(null, null)')).toBe(3)
        expect(() => dvala.run('let { fnull } = import(functional); fnull()')).toThrow(DvalaError)
        expect(() => dvala.run('let { fnull } = import(functional); fnull(+)')).toThrow(DvalaError)
      })
    })

    describe('spread.', () => {
      it('samples.', () => {
        expect(dvala.run(`
let params = [1, 2, 3];
+(...params)`)).toBe(6)
      })
      expect(() => dvala.run(`
let params = {};
+(...params)`)).toThrow(DvalaError)
    })

    describe('special expressions as normal expressions.', () => {
      test('samples.', () => {
        expect(dvala.run(`
let and = &&;
true and false`)).toBe(false)
        expect(dvala.run(`
let or = ||;
true or false`)).toBe(true)
        expect(dvala.run(`
let obj = object;
obj("a", 1, "b", 2)`)).toEqual({ a: 1, b: 2 })
        expect(dvala.run(`
let obj = object;
obj("a", 1, "b")`)).toEqual({ a: 1, b: null })
        expect(dvala.run(`
let arr = array;
arr(1, 2, 3)`)).toEqual([1, 2, 3])
        expect(dvala.run(`
let qq = ??;
null qq 0`)).toBe(0)
        expect(dvala.run(`
let qq = ??;
0 qq 1`)).toBe(0)
        expect(dvala.run(`
let qq = ??;
qq(null)`)).toBe(null)
        expect(() => dvala.run(`
let r = recur;
r(1)`)).toThrow(RecurSignal)
      })
      expect(() => dvala.run('let t = \'if\';')).toThrow(DvalaError)
      expect(() => dvala.run('let d = defined?; d(+)')).toThrow(DvalaError)
    })
  }
})
