import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../src/createDvala'
import { DvalaError } from '../../../src/errors'

describe('object functions', () => {
  for (const dvala of [createDvala(), createDvala({ debug: true })]) {
    describe('keys', () => {
      it('samples', () => {
        expect(dvala.run('object()')).toEqual({})
        // expect(dvala.run('keys(object())')).toEqual([])
        // expect(dvala.run('keys(object("x", 1))')).toEqual(['x'])
        // expect(dvala.run('keys(object("x", null, "y", 2))')).toEqual(['x', 'y'])
        // expect(() => dvala.run('keys()')).toThrow(DvalaError)
        // expect(() => dvala.run('keys(0)')).toThrow(DvalaError)
        // expect(() => dvala.run('keys(true)')).toThrow(DvalaError)
        // expect(() => dvala.run('keys(false)')).toThrow(DvalaError)
        // expect(() => dvala.run('keys(null)')).toThrow(DvalaError)
        // expect(() => dvala.run('keys([1])')).toThrow(DvalaError)
      })
    })

    describe('vals', () => {
      it('samples', () => {
        expect(dvala.run('vals(object())')).toEqual([])
        expect(dvala.run('vals(object("x", 1))')).toEqual([1])
        expect(dvala.run('vals(object("x", null, "y", 2))')).toEqual([null, 2])
        expect(() => dvala.run('vals()')).toThrow(DvalaError)
        expect(() => dvala.run('vals(object("x") object("x"))')).toThrow(DvalaError)
        expect(() => dvala.run('vals(0)')).toThrow(DvalaError)
        expect(() => dvala.run('vals(true)')).toThrow(DvalaError)
        expect(() => dvala.run('vals(false)')).toThrow(DvalaError)
        expect(() => dvala.run('vals(null)')).toThrow(DvalaError)
        expect(() => dvala.run('vals([1])')).toThrow(DvalaError)
      })
    })

    describe('entries', () => {
      it('samples', () => {
        expect(dvala.run('entries(object())')).toEqual([])
        expect(dvala.run('entries(object("x", 1))')).toEqual([['x', 1]])
        expect(dvala.run('entries(object("x", null, "y", 2))')).toEqual([
          ['x', null],
          ['y', 2],
        ])
        expect(() => dvala.run('entries()')).toThrow(DvalaError)
        expect(() => dvala.run('entries(object("x") object("x"))')).toThrow(DvalaError)
        expect(() => dvala.run('entries(0)')).toThrow(DvalaError)
        expect(() => dvala.run('entries(true)')).toThrow(DvalaError)
        expect(() => dvala.run('entries(false)')).toThrow(DvalaError)
        expect(() => dvala.run('entries(null)')).toThrow(DvalaError)
        expect(() => dvala.run('entries([1])')).toThrow(DvalaError)
      })
    })

    describe('find', () => {
      it('samples', () => {
        expect(dvala.run('find(object("x", 1), "a")')).toBeNull()
        expect(dvala.run('find(object("x", 1), "x")')).toEqual(['x', 1])
        expect(dvala.run('find(object("x", 1, "y", 2), "x")')).toEqual(['x', 1])
        expect(() => dvala.run('find()')).toThrow(DvalaError)
        expect(() => dvala.run('find(object("x"), object("x"))')).toThrow(DvalaError)
        expect(() => dvala.run('find(object("x"), null)')).toThrow(DvalaError)
        expect(() => dvala.run('find(object("x"), true)')).toThrow(DvalaError)
        expect(() => dvala.run('find(object("x"), false)')).toThrow(DvalaError)
        expect(() => dvala.run('find(object("x"), "x" "y")')).toThrow(DvalaError)
        expect(() => dvala.run('find(object("x"))')).toThrow(DvalaError)
        expect(() => dvala.run('find([], "x")')).toThrow(DvalaError)
        expect(() => dvala.run('find(null, "x")')).toThrow(DvalaError)
        expect(() => dvala.run('find(false, "x")')).toThrow(DvalaError)
        expect(() => dvala.run('find(4, "x")')).toThrow(DvalaError)
      })
    })

    describe('dissoc', () => {
      it('samples', () => {
        expect(dvala.run('dissoc(object(), "x")')).toEqual({})
        expect(dvala.run('dissoc(object("x", 1, "y", 2), "x")')).toEqual({ y: 2 })
        expect(dvala.run('dissoc(object("x", 1), "")')).toEqual({ x: 1 })
        expect(dvala.run('dissoc(object("x", object()), "x")')).toEqual({})
        expect(() => dvala.run('dissoc()')).toThrow(DvalaError)
        expect(() => dvala.run('dissoc(object("x", 1) 1)')).toThrow(DvalaError)
        expect(() => dvala.run('dissoc(object("x"), object("x"))')).toThrow(DvalaError)
        expect(() => dvala.run('dissoc(0, "x")')).toThrow(DvalaError)
        expect(() => dvala.run('dissoc(true, "x")')).toThrow(DvalaError)
        expect(() => dvala.run('dissoc(false, "x")')).toThrow(DvalaError)
        expect(() => dvala.run('dissoc(null, "x")')).toThrow(DvalaError)
        expect(() => dvala.run('dissoc([1], "x")')).toThrow(DvalaError)
      })
      it('delete atribute', () => {
        const program = `
        let obj = { x: 10 };
        dissoc(obj, "x");
        obj
      `
        expect(dvala.run(program)).toEqual({ x: 10 })
      })

      it('delete unexisting attribute', () => {
        const program = `
        let obj = { x: 10 };
        dissoc(obj, "y");
        obj
      `
        expect(dvala.run(program)).toEqual({ x: 10 })
      })
    })

    describe('merge', () => {
      it('samples', () => {
        expect(dvala.run('merge(object("x", 10))')).toEqual({ x: 10 })
        expect(dvala.run('merge(object("x", 10), object("y", 20))')).toEqual({ x: 10, y: 20 })
        expect(dvala.run('merge(object("x", 10), object("x", 5))')).toEqual({ x: 5 })
        expect(dvala.run('merge({}, { x: 10 }, { y: 10 }, { z: 10 })')).toEqual({
          x: 10,
          y: 10,
          z: 10,
        })
        expect(dvala.run('merge()')).toBeNull()
        expect(() => dvala.run('merge(1)')).toThrow(DvalaError)
        expect(() => dvala.run('merge(:1)')).toThrow(DvalaError)
        expect(() => dvala.run('merge(true)')).toThrow(DvalaError)
        expect(() => dvala.run('merge(false)')).toThrow(DvalaError)
        expect(() => dvala.run('merge(null)')).toThrow(DvalaError)
        expect(() => dvala.run('merge((array))')).toThrow(DvalaError)
      })

      describe('mergeWith', () => {
        it('samples', () => {
          expect(dvala.run('mergeWith(object("x", 10), object("y", 20), +)')).toEqual({
            x: 10,
            y: 20,
          })
          expect(dvala.run('mergeWith(object("x", 10), object("x", 15, "y", 20), +)')).toEqual({
            x: 25,
            y: 20,
          })
          expect(dvala.run('mergeWith(object("x", 10), object("x", 20), object("x", 30), object("x", 40), -)')).toEqual({
            x: -80,
          })
          expect(() => dvala.run('mergeWith(+)')).toThrow(DvalaError)
          expect(() => dvala.run('mergeWith()')).toThrow(DvalaError)
          expect(() => dvala.run('mergeWith(+, "kjh")')).toThrow(DvalaError)
          expect(() => dvala.run('mergeWith(+, [1, 2, 3])')).toThrow(DvalaError)
        })
      })

      it('merge returns equal object', () => {
        const program = `
        let obj1 = object("x", 10);
        let obj2 = merge(obj1);
        ==(obj1, obj2)
      `
        expect(dvala.run(program)).toBe(true)
      })
    })

    describe('zipmap', () => {
      it('samples', () => {
        expect(dvala.run('zipmap(["a", "b", "c"], [10, null, [1, 2, 3]])')).toEqual({ a: 10, b: null, c: [1, 2, 3] })
        expect(dvala.run('zipmap(["a", "b"], [10, null, [1, 2, 3]])')).toEqual({ a: 10, b: null })
        expect(dvala.run('zipmap(["a", "b", "c"], [10, null])')).toEqual({ a: 10, b: null })
        expect(dvala.run('zipmap(["a", "b", "c"], [])')).toEqual({})
        expect(dvala.run('zipmap([], [10, null, [1, 2, 3]])')).toEqual({})
        expect(dvala.run('zipmap([], [])')).toEqual({})
        expect(() => dvala.run('zipmap([])')).toThrow(DvalaError)
        expect(() => dvala.run('zipmap("abc", [])')).toThrow(DvalaError)
        expect(() => dvala.run('zipmap([], "abc)')).toThrow(DvalaError)
        expect(() => dvala.run('zipmap([], [], [])')).toThrow(DvalaError)
      })
    })

    describe('selectKeys', () => {
      it('samples', () => {
        expect(dvala.run('selectKeys({a: 1, b: 2, c: 3}, ["a", "b"])')).toEqual({ a: 1, b: 2 })
        expect(dvala.run('selectKeys({a: 1}, ["a", "b"])')).toEqual({ a: 1 })
        expect(() => dvala.run('selectKeys({a: 1})')).toThrow(DvalaError)
        expect(() => dvala.run('selectKeys({a: 1}, "a")')).toThrow(DvalaError)
        expect(() => dvala.run('selectKeys({a: 1}, ["a"], ["a"])')).toThrow(DvalaError)
      })
    })
  }
})
