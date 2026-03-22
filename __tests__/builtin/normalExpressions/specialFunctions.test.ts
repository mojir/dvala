import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../src/createDvala'
import { DvalaError } from '../../../src/errors'

describe('specialFunctions', () => {
  for (const dvala of [createDvala(), createDvala({ debug: true })]) {
    describe('string as function', () => {
      it('samples', () => {
        expect(dvala.run('let person = { firstName: "Albert", lastName: "Mojir" }; "firstName"(person)')).toBe('Albert')
        expect(dvala.run('"firstName"({ firstName: "Albert", lastName: "Mojir" })')).toBe('Albert')
        expect(dvala.run('"lastName"({ firstName: "Albert", lastName: "Mojir" })')).toBe('Mojir')
        expect(dvala.run('"x"({ firstName: "Albert", lastName: "Mojir" })')).toBeNull()
        expect(dvala.run('"Albert"(2)')).toBe('b')
        expect(dvala.run('"Albert"(12)')).toBeNull()
        expect(() => dvala.run('"firstName"({ firstName: "Albert", lastName: "Mojir" }, 1)')).toThrow(DvalaError)
        expect(() => dvala.run('{ firstName: "Albert", lastName: "Mojir" }()')).toThrow(DvalaError)
        expect(() => dvala.run('0({ firstName: "Albert", lastName: "Mojir" })')).toThrow(DvalaError)
        expect(() => dvala.run('{}({ firstName: "Albert", lastName: "Mojir" })')).toThrow(DvalaError)
        expect(() => dvala.run('[]({ firstName: "Albert", lastName: "Mojir" })')).toThrow(DvalaError)
      })
    })

    describe('object as function', () => {
      it('samples', () => {
        expect(dvala.run('let person = { firstName: "Albert", lastName: "Mojir" }; person("firstName")')).toBe('Albert')
        expect(dvala.run('{ firstName: "Albert", lastName: "Mojir" }("firstName")')).toBe('Albert')
        expect(dvala.run('{ firstName: "Albert", lastName: "Mojir" }("lastName")')).toBe('Mojir')
        expect(dvala.run('{ firstName: "Albert", lastName: "Mojir" }("x")')).toBeNull()
        expect(() => dvala.run('{ firstName: "Albert", lastName: "Mojir" }()')).toThrow(DvalaError)
        expect(() => dvala.run('{ firstName: "Albert", lastName: "Mojir" }(1)')).toThrow(DvalaError)
        expect(() => dvala.run('{ firstName: "Albert", lastName: "Mojir" }(null)')).toThrow(DvalaError)
        expect(() => dvala.run('{ firstName: "Albert", lastName: "Mojir" }(true)')).toThrow(DvalaError)
        expect(() => dvala.run('{ firstName: "Albert", lastName: "Mojir" }(false)')).toThrow(DvalaError)
        expect(() => dvala.run('{ firstName: "Albert", lastName: "Mojir" }({})')).toThrow(DvalaError)
        expect(() => dvala.run('{ firstName: "Albert", lastName: "Mojir" }([])')).toThrow(DvalaError)
      })
    })

    describe('array as function', () => {
      it('samples', () => {
        expect(dvala.run('let nameArray = ["Albert", "Mojir"]; nameArray(0)')).toBe('Albert')
        expect(dvala.run('["Albert", "Mojir"](0)')).toBe('Albert')
        expect(dvala.run('push([1], 2, 3)(1)')).toBe(2)
        expect(dvala.run('"Albert"(0)')).toBe('A')
        expect(dvala.run('"Albert"(10)')).toBeNull()
        expect(() => dvala.run('["Albert", "Mojir"]()')).toThrow(DvalaError)
        expect(() => dvala.run('["Albert", "Mojir"]("0")')).toThrow(DvalaError)
        expect(() => dvala.run('["Albert", "Mojir"](0, 1)')).toThrow(DvalaError)
      })
    })

    describe('number as function', () => {
      it('samples', () => {
        expect(dvala.run('let nameArray = ["Albert", "Mojir"]; 0(nameArray)')).toBe('Albert')
        expect(dvala.run('0(["Albert", "Mojir"])')).toBe('Albert')
        expect(dvala.run('3(["Albert", "Mojir"])')).toBeNull()
        expect(dvala.run('1(push([1], 2, 3))')).toBe(2)
        expect(dvala.run('1("Albert")')).toBe('l')
        expect(dvala.run('10("Albert")')).toBeNull()
        expect(() => dvala.run('"0"(["Albert", "Mojir"])')).toThrow(DvalaError)
        expect(() => dvala.run('0(1, ["Albert", "Mojir"])')).toThrow(DvalaError)
        expect(() => dvala.run('0(1 + 2)')).toThrow(DvalaError)
      })
    })
  }
})
