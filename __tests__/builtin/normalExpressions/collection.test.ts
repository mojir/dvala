import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../src/createDvala'
import { DvalaError, KeyError } from '../../../src/errors'
import { collectionUtilsModule } from '../../../src/builtin/modules/collection'

const dvala = createDvala()

describe('collection functions', () => {
  describe('filter', () => {
    it('samples', () => {
      expect(dvala.run('filter([1, "2", 3], isNumber)')).toEqual([1, 3])
      expect(dvala.run('filter([], isNumber)')).toEqual([])
      expect(dvala.run('filter([1, "2", 3], isNull)')).toEqual([])
      expect(dvala.run('filter([0, 1, 2, 3, 4, 5, 6, 7], -> isZero($ mod 3))')).toEqual([0, 3, 6])
      expect(dvala.run('filter("aAbBcC", -> $ >= "a")')).toBe('abc')
      expect(dvala.run('filter({ a: 1, b: 2 }, isOdd)')).toEqual({ a: 1 })
      expect(() => dvala.run('filter(+)')).toThrow(DvalaError)
      expect(() => dvala.run('filter()')).toThrow(DvalaError)
      expect(() => dvala.run('filter([1], isNumber 2)')).toThrow(DvalaError)
    })
  })

  describe('map', () => {
    it('samples', () => {
      expect(dvala.run('map([1, "2", 3], isNumber)')).toEqual([true, false, true])
      expect(dvala.run('map([], isNumber)')).toEqual([])
      expect(dvala.run('map([1, 2, 3], -> 2 * $)')).toEqual([2, 4, 6])
      expect(dvala.run('map("ABCDE", "12345", ++)')).toBe('A1B2C3D4E5')
      expect(dvala.run('map([1, 2, 3], [1, 2], +)')).toEqual([2, 4])
      expect(dvala.run('map("AaBbCc", -> if $ >= "a" then "-" else "+" end)')).toBe('+-+-+-')
      expect(() => dvala.run('map("AaBbCc", -> if $ >= "a" 0 else 1 end)')).toThrow(DvalaError)
      expect(dvala.run('map([1, "2", 3], isNull)')).toEqual([false, false, false])
      expect(dvala.run('map([0, 1, 2, 3, 4, 5, 6, 7], -> isZero($ mod 3))')).toEqual([
        true,
        false,
        false,
        true,
        false,
        false,
        true,
        false,
      ])
      expect(dvala.run('map([0, 1, 2, 3, 4, 5, 6, 7], inc)')).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
      expect(dvala.run('map({ a: 1, b: 2 }, inc)')).toEqual({ a: 2, b: 3 })
      expect(dvala.run('map({ a: 1, b: 2 }, { a: 10, b: 20 }, +)')).toEqual({ a: 11, b: 22 })
      expect(() => dvala.run('map({ a: 1, b: 2 }, { c: 10, b: 20 }, +)')).toThrow(DvalaError)
      expect(() => dvala.run('map({ a: 1, b: 2 }, { b: 20 }, +)')).toThrow(DvalaError)
      expect(() => dvala.run('map(+)')).toThrow(DvalaError)
      expect(() => dvala.run('map()')).toThrow(DvalaError)
      expect(() => dvala.run('map(1 isNumber)')).toThrow(DvalaError)
    })
  })

  describe('reduce', () => {
    it('samples', () => {
      let program = `
      let countChars = (stringArray) -> do
        reduce(
          stringArray,
          (acc, s) -> acc + count(s),
          0
        )
      end;

      countChars(["First", "Second", "Third"])
      `
      expect(dvala.run(program)).toBe(16)

      program = `
      let longestLength = (stringArray) -> do
        reduce(
          stringArray,
          (acc, s) ->
            if acc > count(s) then
              acc
            else
              count(s)
            end,
            0
          )
      end;

      longestLength(["First", "Second", "Third"])
      // `
      expect(dvala.run(program)).toBe(6)

      expect(dvala.run('reduce([1, 2, 3, 4, 5], +, 0)')).toBe(15)
      expect(dvala.run('reduce([], +, 0)')).toBe(0)
      expect(dvala.run('reduce([1], +, 0)')).toBe(1)
      expect(dvala.run('reduce([1, 2], +, 0)')).toBe(3)
      expect(dvala.run('reduce([], +, 1)')).toBe(1)
      expect(dvala.run('reduce([2, 3], +, 1)')).toBe(6)
      expect(dvala.run('reduce([1, 2, 3], +, 0)')).toBe(6)
      expect(dvala.run('reduce([], +, 0)')).toBe(0)
      expect(dvala.run('reduce([], +, 1)')).toBe(1)

      expect(dvala.run('reduce("Albert", (x, y) -> ++(x, "-", y), "")')).toBe('-A-l-b-e-r-t')
      expect(dvala.run('reduce("Albert", (x, y) -> ++(x, "-", y), ">")')).toBe('>-A-l-b-e-r-t')
      expect(dvala.run('reduce("", (x, y) -> ++(x, "-", y), ">")')).toBe('>')

      expect(dvala.run('reduce({ a: 1, b: 2 }, +, 0)')).toBe(3)
      expect(dvala.run('reduce({}, +, 0)')).toBe(0)

      expect(() => dvala.run('reduce([1, 2, 3], +)')).toThrow(DvalaError)
      expect(() => dvala.run('reduce(+)')).toThrow(DvalaError)
      expect(() => dvala.run('reduce()')).toThrow(DvalaError)
      expect(() => dvala.run('reduce(1, +2)')).toThrow(DvalaError)
    })
  })

  describe('count', () => {
    it('samples', () => {
      expect(dvala.run('count([])')).toBe(0)
      expect(dvala.run('count([1])')).toBe(1)
      expect(dvala.run('count([1, 2, 3])')).toBe(3)
      expect(dvala.run('count({})')).toBe(0)
      expect(dvala.run('count({ a: 1, b: 2, })')).toBe(2)
      expect(dvala.run('count("")')).toBe(0)
      expect(dvala.run('count("Albert")')).toBe(6)
      expect(dvala.run('count(null)')).toBe(0)

      expect(() => dvala.run('count()')).toThrow(DvalaError)
      expect(() => dvala.run('count([], [])')).toThrow(DvalaError)
      expect(() => dvala.run('count(12)')).toThrow(DvalaError)
      expect(() => dvala.run('count(false)')).toThrow(DvalaError)
      expect(() => dvala.run('count(true)')).toThrow(DvalaError)
    })
  })

  describe('get', () => {
    it('samples', () => {
      expect(dvala.run('[1, 2, 3] get 1')).toBe(2)
      expect(dvala.run('"Albert" get 7')).toBeNull()

      expect(dvala.run('get([], 1)')).toBeNull()
      expect(dvala.run('get([1], 1)')).toBeNull()
      expect(dvala.run('get([1, 2, 3], 1)')).toBe(2)
      expect(dvala.run('get([], 1, "x")')).toBe('x')
      expect(dvala.run('get([1], 1, "x")')).toBe('x')
      expect(dvala.run('get([1, 2, 3], 1, "x")')).toBe(2)
      expect(dvala.run('get([1, 2, 3], -1)')).toBeNull()
      expect(dvala.run('get([1, 2, 3], -1, "x")')).toBe('x')

      expect(dvala.run('get("Albert", 1)')).toBe('l')
      expect(dvala.run('get("Albert", 7)')).toBeNull()
      expect(dvala.run('get("Albert", -1)')).toBeNull()
      expect(dvala.run('get("Albert", -1, "x")')).toBe('x')
      expect(dvala.run('get("", 0)')).toBeNull()

      expect(dvala.run('get({}, "a")')).toBeNull()
      expect(dvala.run('get({ a: 1, b: 2, }, "a")')).toBe(1)
      expect(dvala.run('get({}, "a", "x")')).toBe('x')
      expect(dvala.run('get({ a: 1, b: 2, }, "a")')).toBe(1)

      expect(dvala.run('get(null, 1)')).toBeNull()
      expect(dvala.run('get(null, 1, 99)')).toBe(99)

      expect(() => dvala.run('get()')).toThrow(DvalaError)
      expect(() => dvala.run('get([])')).toThrow(DvalaError)
      expect(() => dvala.run('get(12)')).toThrow(DvalaError)
      expect(() => dvala.run('get(12, 1)')).toThrow(DvalaError)
      expect(() => dvala.run('get(false)')).toThrow(DvalaError)
      expect(() => dvala.run('get(false, 2)')).toThrow(DvalaError)
      expect(() => dvala.run('get(true)')).toThrow(DvalaError)
      expect(() => dvala.run('get(null)')).toThrow(DvalaError)
    })
  })

  describe('contains', () => {
    it('samples', () => {
      expect(dvala.run('[1, 2, 3] contains 3')).toBe(true)
      expect(dvala.run('[1, 2, [3]] contains [3]')).toBe(true)
      expect(dvala.run('"Albert" contains "bert"')).toBe(true)

      expect(dvala.run('contains([], 1)')).toBe(false)
      expect(dvala.run('contains([1], 1)')).toBe(true)
      expect(dvala.run('contains([1, 2, 3], 1)')).toBe(true)
      expect(dvala.run('contains({}, "a")')).toBe(false)
      expect(dvala.run('contains(object("a", 1, "b", 2), "a")')).toBe(true)
      expect(dvala.run('contains([], "1")')).toBe(false)
      expect(dvala.run('contains([1], "1")')).toBe(false)
      expect(dvala.run('contains([1, 2, 3], "1")')).toBe(false)
      expect(dvala.run('contains({}, "1")')).toBe(false)
      expect(dvala.run('contains(object("a", 1, "b", "2"), "2")')).toBe(false)
      expect(dvala.run('contains(object("a", 1, "b", "2"), "a")')).toBe(true)
      expect(dvala.run('contains("Albert", "A")')).toBe(true)
      expect(dvala.run('contains("Albert", "lb")')).toBe(true)
      expect(dvala.run('contains("Albert", "al")')).toBe(false)
      expect(dvala.run('contains("Albert", "xxx")')).toBe(false)

      expect(dvala.run('contains(null, 1)')).toBe(false)
      expect(dvala.run('contains(null, "foo")')).toBe(false)

      expect(() => dvala.run('contains("")')).toThrow(DvalaError)
      expect(() => dvala.run('contains([])')).toThrow(DvalaError)
      expect(() => dvala.run('contains("123")')).toThrow(DvalaError)
      expect(() => dvala.run('contains()')).toThrow(DvalaError)
      expect(() => dvala.run('contains(12)')).toThrow(DvalaError)
      expect(() => dvala.run('contains(false)')).toThrow(DvalaError)
      expect(() => dvala.run('contains(true)')).toThrow(DvalaError)
      expect(() => dvala.run('contains(null)')).toThrow(DvalaError)
    })
  })

  describe('assoc', () => {
    it('samples', () => {
      expect(dvala.run('assoc([1, 2, 3], 0, "1")')).toEqual(['1', 2, 3])
      expect(dvala.run('assoc([1, 2, 3], 1, "2")')).toEqual([1, '2', 3])
      expect(dvala.run('let a = [1, 2, 3]; assoc(a, 1, "2")')).toEqual([1, '2', 3])
      expect(dvala.run('let a = [1, 2, 3]; assoc(a, 1, "2"); a')).toEqual([1, 2, 3])
      expect(dvala.run('assoc([1, 2, 3], 3, "4")')).toEqual([1, 2, 3, '4'])

      expect(dvala.run('assoc({}, "a", "1")')).toEqual({ a: '1' })

      expect(dvala.run('assoc({a: 1, b: 2}, "a", "1")')).toEqual({ a: '1', b: 2 })
      expect(dvala.run('assoc({a: 1, b: 2}, "b", "2")')).toEqual({ a: 1, b: '2' })
      expect(dvala.run('let o = {a: 1, b: 2}; assoc(o, "a", "1")')).toEqual({ a: '1', b: 2 })
      expect(dvala.run('let o = {a: 1, b: 2}; assoc(o, "a", "1"); o')).toEqual({ a: 1, b: 2 })

      expect(dvala.run('assoc("1", 0, "2")')).toBe('2')
      expect(dvala.run('assoc("Albert", 6, "!")')).toBe('Albert!')

      expect(() => dvala.run('assoc("Albert", 7, "!")')).toThrow(DvalaError)
      expect(() => dvala.run('assoc([1, 2, 3], 4, "4")')).toThrow(DvalaError)
      expect(() => dvala.run('assoc({}, 0, "2")')).toThrow(DvalaError)
      expect(() => dvala.run('assoc(null, 0, "2")')).toThrow(DvalaError)
      expect(() => dvala.run('assoc(true, 0, "2")')).toThrow(DvalaError)
      expect(() => dvala.run('assoc(false, 0, "2")')).toThrow(DvalaError)
      expect(() => dvala.run('assoc(1, 0, "2")')).toThrow(DvalaError)
      expect(() => dvala.run('assoc("1", 0, "22")')).toThrow(DvalaError)
      expect(() => dvala.run('assoc([1], "0", "2")')).toThrow(DvalaError)
      expect(() => dvala.run('assoc([1], true, "2")')).toThrow(DvalaError)
      expect(() => dvala.run('assoc([1], false, "2")')).toThrow(DvalaError)
      expect(() => dvala.run('assoc([1], [], "2")')).toThrow(DvalaError)
      expect(() => dvala.run('assoc([1], null, "2")')).toThrow(DvalaError)
      expect(() => dvala.run('assoc(0, "2")')).toThrow(DvalaError)
      expect(() => dvala.run('assoc([1, 2, 3], -1, "x")')).toThrow(DvalaError)
      expect(() => dvala.run('assoc([1, 2, 3], 4, "x")')).toThrow(DvalaError)
      expect(() => dvala.run('assoc()')).toThrow(DvalaError)
      expect(() => dvala.run('assoc([])')).toThrow(DvalaError)
      expect(() => dvala.run('assoc([], 0)')).toThrow(DvalaError)
      expect(() => dvala.run('assoc([], 0, "x", "y")')).toThrow(DvalaError)
      expect(() => dvala.run('assoc([],, "a", "1")')).toThrow(DvalaError)
    })
  })

  describe('++', () => {
    it('samples', () => {
      expect(dvala.run('"Albert" ++ "Mojir"')).toBe('AlbertMojir')
      expect(dvala.run('"Albert" ++ " Mojir"')).toBe('Albert Mojir')
      expect(dvala.run('++("Albert", "Mojir", " ")')).toBe('AlbertMojir ')
      expect(dvala.run('++("Albert", " ", "Mojir", 1)')).toBe('Albert Mojir1')
      expect(dvala.run('++("Albert", "Mojir", " and ")')).toBe('AlbertMojir and ')
      expect(dvala.run('++("Albert")')).toBe('Albert')

      expect(dvala.run('[1, 2] ++ [3, 4]')).toEqual([1, 2, 3, 4])
      expect(dvala.run('{ a: 1, b: 2 } ++ { b: 20, c: 30 }')).toEqual({ a: 1, b: 20, c: 30 })
      expect(dvala.run('"Al" ++ "bert"')).toEqual('Albert')

      expect(dvala.run('++([])')).toEqual([])
      expect(dvala.run('++([1])')).toEqual([1])
      expect(dvala.run('++([1], [2], [3, 4])')).toEqual([1, 2, 3, 4])
      expect(dvala.run('++([1, 2, 3], [])')).toEqual([1, 2, 3])

      expect(dvala.run('++({a: 1, b: 2}, {b: 1, c: 2})')).toEqual({ a: 1, b: 1, c: 2 })
      expect(dvala.run('++({}, {a: 1, b: 2})')).toEqual({ a: 1, b: 2 })

      expect(dvala.run('++("1", "23")')).toBe('123')
      expect(dvala.run('++("1", "")')).toBe('1')
      expect(dvala.run('++("1")')).toBe('1')
      expect(dvala.run('++(0)')).toBe('0')

      expect(() => dvala.run('++()')).toThrow(DvalaError)
      expect(() => dvala.run('++([1], "2")')).toThrow(DvalaError)
      expect(() => dvala.run('++("1", ["2"])')).toThrow(DvalaError)
      expect(() => dvala.run('++(true)')).toThrow(DvalaError)
      expect(() => dvala.run('++("1", false)')).toThrow(DvalaError)
      expect(() => dvala.run('++(null, "m")')).toThrow(DvalaError)
    })
  })
})

describe('collection-Utils module functions', () => {
  const imp = 'let cu = import("collection"); '
  for (const mdvala of [createDvala({ modules: [collectionUtilsModule] }), createDvala({ modules: [collectionUtilsModule], debug: true })]) {
    describe('filteri', () => {
      it('samples', () => {
        expect(mdvala.run(`${imp}cu.filteri([1, "2", 3], -> isOdd($2))`)).toEqual(['2'])
        expect(mdvala.run(`${imp}cu.filteri([], -> isOdd($2))`)).toEqual([])
        expect(mdvala.run(`${imp}cu.filteri("Albert", -> isOdd($2))`)).toEqual('let')
        expect(mdvala.run(`${imp}cu.filteri({ a: 1, b: 2 }, -> $2 == "a")`)).toEqual({ a: 1 })
        expect(() => mdvala.run(`${imp}cu.filteri(+)`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}cu.filteri()`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}cu.filteri([1], isNumber 2)`)).toThrow(DvalaError)
      })
    })

    describe('mapi', () => {
      it('samples', () => {
        expect(mdvala.run(`${imp}cu.mapi([1, "2", 3], -> $2)`)).toEqual([0, 1, 2])
        expect(mdvala.run(`${imp}cu.mapi([], isNumber)`)).toEqual([])
        expect(mdvala.run(`${imp}cu.mapi([1, 2, 3], -> $ + $2)`)).toEqual([1, 3, 5])
        expect(mdvala.run(`${imp}cu.mapi("ABCDE", -> $2 ++ $)`)).toBe('0A1B2C3D4E')
        expect(mdvala.run(`${imp}cu.mapi({ a: 1, b: 2 }, -> $2 ++ $)`)).toEqual({ a: 'a1', b: 'b2' })
        expect(() => mdvala.run(`${imp}cu.mapi({ a: 1, b: 2 }, { b: 20 }, +)`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}cu.mapi(+)`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}cu.mapi()`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}cu.mapi(1 isNumber)`)).toThrow(DvalaError)
      })
    })

    describe('reducei', () => {
      it('samples', () => {
        expect(mdvala.run(`${imp}cu.reducei([1, 2, 3, 4, 5], -> $ + $3, 0)`)).toBe(10)
        expect(mdvala.run(`${imp}cu.reducei([], -> $ + $3, 0)`)).toBe(0)
        expect(mdvala.run(`${imp}cu.reducei("Albert", (acc, char, index) -> acc ++ index ++ char, "")`)).toBe('0A1l2b3e4r5t')
        expect(mdvala.run(`${imp}cu.reducei("", (acc, char, index) -> acc ++ index ++ char, "")`)).toBe('')
        expect(mdvala.run(`${imp}cu.reducei({ a: 1, b: 2 }, -> $ ++ $3, "")`)).toBe('ab')
        expect(mdvala.run(`${imp}cu.reducei({}, -> $ ++ $3, "")`)).toBe('')

        expect(() => mdvala.run(`${imp}cu.reducei([1, 2, 3], +)`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}cu.reducei(+)`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}cu.reducei()`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}cu.reducei(1, +2)`)).toThrow(DvalaError)
      })
    })

    describe('reduceRight', () => {
      it('samples', () => {
        expect(mdvala.run(`${imp}cu.reduceRight([1, 2, 3, 4, 5], +, 0)`)).toBe(15)
        expect(mdvala.run(`${imp}cu.reduceRight([], +, 0)`)).toBe(0)
        expect(mdvala.run(`${imp}cu.reduceRight([1], +, 0)`)).toBe(1)
        expect(mdvala.run(`${imp}cu.reduceRight([1, 2], +, 0)`)).toBe(3)
        expect(mdvala.run(`${imp}cu.reduceRight([1, 2, 3], +, 0)`)).toBe(6)
        expect(mdvala.run(`${imp}cu.reduceRight([], +, 0)`)).toBe(0)
        expect(mdvala.run(`${imp}cu.reduceRight([], +, 0)`)).toBe(0)
        expect(mdvala.run(`${imp}cu.reduceRight(["1", "2", "3"], str, "")`)).toBe('321')

        expect(mdvala.run(`${imp}cu.reduceRight("Albert", (x, y) -> ++(x, "-", y), "")`)).toBe('-t-r-e-b-l-A')
        expect(mdvala.run(`${imp}cu.reduceRight("Albert", (x, y) -> ++(x, "-", y), ">")`)).toBe('>-t-r-e-b-l-A')
        expect(mdvala.run(`${imp}cu.reduceRight("", (x, y) -> ++(x, "-", y), ">")`)).toBe('>')

        expect(mdvala.run(`${imp}cu.reduceRight({ a: 1, b: 2 }, +, 0)`)).toBe(3)
        expect(mdvala.run(`${imp}cu.reduceRight({}, +, 0)`)).toBe(0)

        expect(() => mdvala.run(`${imp}cu.reduceRight(+)`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}cu.reduceRight()`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}cu.reduceRight(1, +, 2)`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}cu.reduceRight([1, 2], +)`)).toThrow(DvalaError)
      })
    })

    describe('reduceiRight', () => {
      it('samples', () => {
        expect(mdvala.run(`${imp}cu.reduceiRight([1, 2, 3, 4, 5], -> $ + $3, 0)`)).toBe(10)
        expect(mdvala.run(`${imp}cu.reduceiRight([], -> $ + $3, 0)`)).toBe(0)
        expect(mdvala.run(`${imp}cu.reduceiRight("Albert", (acc, char, index) -> acc ++ index ++ char, "")`)).toBe('5t4r3e2b1l0A')
        expect(mdvala.run(`${imp}cu.reduceiRight("", (acc, char, index) -> acc ++ index ++ char, "")`)).toBe('')
        expect(mdvala.run(`${imp}cu.reduceiRight({ a: 1, b: 2 }, -> $ ++ $3, "")`)).toBe('ba')
        expect(mdvala.run(`${imp}cu.reduceiRight({}, -> $ ++ $3, "")`)).toBe('')

        expect(() => mdvala.run(`${imp}cu.reduceiRight([1, 2, 3], +)`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}cu.reduceiRight(+)`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}cu.reduceiRight()`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}cu.reduceiRight(1, +2)`)).toThrow(DvalaError)
      })
    })

    describe('reductions', () => {
      it('samples', () => {
        expect(mdvala.run(`${imp}cu.reductions([1, 2, 3, 4, 5], +, 0)`)).toEqual([0, 1, 3, 6, 10, 15])
        expect(mdvala.run(`${imp}cu.reductions([], +, 0)`)).toEqual([0])
        expect(mdvala.run(`${imp}cu.reductions([1], +, 0)`)).toEqual([0, 1])
        expect(mdvala.run(`${imp}cu.reductions([1, 2], +, 0)`)).toEqual([0, 1, 3])
        expect(mdvala.run(`${imp}cu.reductions([], +, 1)`)).toEqual([1])
        expect(mdvala.run(`${imp}cu.reductions([2, 3], +, 1)`)).toEqual([1, 3, 6])
        expect(mdvala.run(`${imp}cu.reductions([1, 2, 3], +, 0)`)).toEqual([0, 1, 3, 6])
        expect(mdvala.run(`${imp}cu.reductions([], +, 0)`)).toEqual([0])
        expect(mdvala.run(`${imp}cu.reductions([], +, 1)`)).toEqual([1])

        expect(mdvala.run(`${imp}cu.reductions("Albert", (x, y) -> ++(x, "-", y), "")`)).toEqual([
          '',
          '-A',
          '-A-l',
          '-A-l-b',
          '-A-l-b-e',
          '-A-l-b-e-r',
          '-A-l-b-e-r-t',
        ])
        expect(mdvala.run(`${imp}cu.reductions("Albert", (x, y) -> ++(x, "-", y), ">")`)).toEqual([
          '>',
          '>-A',
          '>-A-l',
          '>-A-l-b',
          '>-A-l-b-e',
          '>-A-l-b-e-r',
          '>-A-l-b-e-r-t',
        ])
        expect(mdvala.run(`${imp}cu.reductions("", (x, y) -> ++(x, "-", y), ">")`)).toEqual(['>'])

        expect(mdvala.run(`${imp}cu.reductions({ a: 1, b: 2 }, +, 0)`)).toEqual([0, 1, 3])
        expect(mdvala.run(`${imp}cu.reductions({}, +, 0)`)).toEqual([0])

        expect(() => mdvala.run(`${imp}cu.reductions(null +)`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}cu.reductions(+)`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}cu.reductions()`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}cu.reductions(1, +, 2)`)).toThrow(DvalaError)
      })
    })

    describe('reductionsi', () => {
      it('samples', () => {
        expect(mdvala.run(`${imp}cu.reductionsi([1, 2, 3, 4, 5], -> $ + $3, 0)`)).toEqual([0, 0, 1, 3, 6, 10])
        expect(mdvala.run(`${imp}cu.reductionsi([], -> $ + $3, 0)`)).toEqual([0])
        expect(mdvala.run(`${imp}cu.reductionsi("Albert", (x, v, i) -> x ++ i ++ v, "")`)).toEqual([
          '',
          '0A',
          '0A1l',
          '0A1l2b',
          '0A1l2b3e',
          '0A1l2b3e4r',
          '0A1l2b3e4r5t',
        ])
        expect(mdvala.run(`${imp}cu.reductionsi("", (x, v, i) -> x ++ i ++ v, "")`)).toEqual([''])
        expect(mdvala.run(`${imp}cu.reductionsi({ a: 1, b: 2 }, -> $ ++ $3, "")`)).toEqual(['', 'a', 'ab'])
        expect(mdvala.run(`${imp}cu.reductionsi({}, -> $ ++ $3, "")`)).toEqual([''])
      })
    })

    describe('getIn', () => {
      it('samples', () => {
        expect(mdvala.run(`${imp}cu.getIn({a: ["Albert", "Mojir"]}, ["a", 0])`)).toBe('Albert')
        expect(mdvala.run(`${imp}cu.getIn([1, 2, 3], [1])`)).toBe(2)

        expect(mdvala.run(`${imp}cu.getIn([], [1])`)).toBeNull()
        expect(mdvala.run(`${imp}cu.getIn([1], [1])`)).toBeNull()
        expect(mdvala.run(`${imp}cu.getIn([1, 2, 3], [1])`)).toBe(2)
        expect(mdvala.run(`${imp}cu.getIn([[1, 2, 3], [4, {a: 2}, 6]], [1, 1, "a"])`)).toBe(2)
        expect(mdvala.run(`${imp}cu.getIn({a: ["Albert", "Mojir"]}, ["a", 0])`)).toBe('Albert')
        expect(mdvala.run(`${imp}cu.getIn({a: ["Albert", "Mojir"]}, ["a", 0, 5])`)).toBe('t')
        expect(mdvala.run(`${imp}cu.getIn({a: ["Albert", "Mojir"]}, ["a", 0, 5, 0, 0, 0, 0, 0, 0])`)).toBe('t')
        expect(mdvala.run(`${imp}cu.getIn({a: ["Albert", "Mojir"]}, ["a", 2], "DEFAULT")`)).toBe('DEFAULT')
        expect(mdvala.run(`${imp}cu.getIn({a: ["Albert", "Mojir"]}, ["a", 2, "x"], "DEFAULT")`)).toBe('DEFAULT')

        expect(mdvala.run(`${imp}cu.getIn(null, [], "DEFAULT")`)).toBeNull()
        expect(mdvala.run(`${imp}cu.getIn(null, [1], "DEFAULT")`)).toBe('DEFAULT')
        expect(mdvala.run(`${imp}cu.getIn([], [], "DEFAULT")`)).toEqual([])
        expect(mdvala.run(`${imp}cu.getIn([1, 2], [1], "DEFAULT")`)).toBe(2)
        expect(mdvala.run(`${imp}cu.getIn([1, 2], [1, 2], "DEFAULT")`)).toBe('DEFAULT')
        expect(mdvala.run(`${imp}cu.getIn([], [1], "DEFAULT")`)).toBe('DEFAULT')
        expect(mdvala.run(`${imp}cu.getIn(2, [1], "DEFAULT")`)).toBe('DEFAULT')
        expect(mdvala.run(`${imp}cu.getIn(2, [], "DEFAULT")`)).toBe(2)

        expect(mdvala.run(`${imp}cu.getIn(null, [])`)).toBeNull()
        expect(mdvala.run(`${imp}cu.getIn(null, [1])`)).toBeNull()
        expect(mdvala.run(`${imp}cu.getIn([], [])`)).toEqual([])
        expect(mdvala.run(`${imp}cu.getIn([1, 2], [1])`)).toBe(2)
        expect(mdvala.run(`${imp}cu.getIn([1, 2], [1, 2])`)).toBeNull()
        expect(mdvala.run(`${imp}cu.getIn([], [1])`)).toBeNull()
        expect(mdvala.run(`${imp}cu.getIn(2, [1])`)).toBeNull()
        expect(mdvala.run(`${imp}cu.getIn(2, [])`)).toBe(2)

        expect(mdvala.run(`${imp}cu.getIn("Albert", [])`)).toBe('Albert')
        expect(mdvala.run(`${imp}cu.getIn("Albert", [0])`)).toBe('A')
        expect(mdvala.run(`${imp}cu.getIn("Albert", ["0"])`)).toBeNull()

        expect(mdvala.run(`${imp}cu.getIn("Albert", null, "DEFAULT")`)).toBe('Albert')

        expect(() => mdvala.run(`${imp}cu.getIn()`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}cu.getIn([])`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}cu.getIn(12)`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}cu.getIn(false)`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}cu.getIn(true)`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}cu.getIn(null)`)).toThrow(DvalaError)
      })
    })

    describe('assocIn', () => {
      it('samples', () => {
        expect(mdvala.run(`${imp}cu.assocIn("Albert", [0], "a")`)).toEqual('albert')
        expect(mdvala.run(`${imp}cu.assocIn("Albert", [6], "!")`)).toEqual('Albert!')
        expect(() => mdvala.run(`${imp}cu.assocIn("Albert", [7], "!")`)).toThrow(DvalaError)
        expect(mdvala.run(`${imp}cu.assocIn({}, ["a", "b", "c"], "Albert")`)).toEqual({ a: { b: { c: 'Albert' } } })
        expect(mdvala.run(`${imp}cu.assocIn([1, 2, 3], [0], "1")`)).toEqual(['1', 2, 3])
        expect(mdvala.run(`${imp}cu.assocIn([1, 2, [1, 2, 3]], [2, 1], "2")`)).toEqual([1, 2, [1, '2', 3]])
        expect(mdvala.run(`${imp}cu.assocIn([1, 2, "albert"], [2, 0], "A")`)).toEqual([1, 2, 'Albert'])
        expect(mdvala.run(`${imp}cu.assocIn([1, 2, {name: "albert"}], [2, "name"], "A")`)).toEqual([1, 2, { name: 'A' }])
        expect(mdvala.run(`${imp}cu.assocIn([1, 2, {name: "albert"}], [2, "name", 0], "A")`)).toEqual([1, 2, { name: 'Albert' }])
        expect(() => mdvala.run(`${imp}cu.assocIn([1, 2, {name: "albert"}], ["2", "name", 0], "A")`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}cu.assocIn([1, 2, {name: "albert"}], [2, 1, 0], "A")`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}cu.assocIn([1, 2, {name: "albert"}], [2, "name", "a"], "A")`)).toThrow(DvalaError)
      })
    })

    describe('notEmpty', () => {
      it('samples', () => {
        expect(mdvala.run(`${imp}cu.notEmpty([])`)).toBeNull()
        expect(mdvala.run(`${imp}cu.notEmpty([0])`)).toEqual([0])
        expect(mdvala.run(`${imp}cu.notEmpty({})`)).toBeNull()
        expect(mdvala.run(`${imp}cu.notEmpty({a: 2})`)).toEqual({ a: 2 })
        expect(mdvala.run(`${imp}cu.notEmpty("")`)).toBeNull()
        expect(mdvala.run(`${imp}cu.notEmpty("Albert")`)).toEqual('Albert')

        expect(mdvala.run(`${imp}cu.notEmpty(null)`)).toBeNull()

        expect(() => mdvala.run(`${imp}cu.notEmpty()`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}cu.notEmpty(true)`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}cu.notEmpty(false)`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}cu.notEmpty(10)`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}cu.notEmpty((regexp "^start"))`)).toThrow(DvalaError)
      })
    })

    describe('isEvery', () => {
      it('samples', () => {
        expect(mdvala.run(`${imp}cu.isEvery([1, 2, 3], isNumber)`)).toBe(true)
        expect(mdvala.run(`${imp}cu.isEvery("abc", x -> x >= "a")`)).toBe(true)

        expect(mdvala.run(`${imp}cu.isEvery([1, 2, 3], isNumber)`)).toBe(true)
        expect(mdvala.run(`${imp}cu.isEvery(["1", "2", "3"], isNumber)`)).toBe(false)
        expect(mdvala.run(`${imp}cu.isEvery([], isNumber)`)).toBe(true)
        expect(mdvala.run(`${imp}cu.isEvery("", isNumber)`)).toBe(true)
        expect(mdvala.run(`${imp}cu.isEvery({}, isNumber)`)).toBe(true)
        expect(mdvala.run(`${imp}cu.isEvery([2, 4, 6], (x -> isZero(x mod 2)))`)).toBe(true)

        expect(mdvala.run(`${imp}cu.isEvery("abc", x -> x >= "a")`)).toBe(true)
        expect(mdvala.run(`${imp}cu.isEvery("abC", x -> x >= "a")`)).toBe(false)
        expect(mdvala.run(`${imp}cu.isEvery({a: 2, b: 4}, -> isEven(second($)))`)).toBe(true)
        expect(mdvala.run(`${imp}cu.isEvery({a: 2, b: 3}, -> isEven(second($)))`)).toBe(false)
        expect(mdvala.run(`${imp}cu.isEvery({a: 2, b: 3}, -> isEven(second($)))`)).toBe(false)
        expect(() => mdvala.run(`${imp}cu.isEvery(+)`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}cu.isEvery([])`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}cu.isEvery()`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}cu.isEvery([1], isNumber, 2)`)).toThrow(DvalaError)
      })
    })

    describe('notEvery', () => {
      it('samples', () => {
        expect(mdvala.run(`${imp}cu.notEvery(["1", "2", "3"], isNumber)`)).toBe(true)
        expect(mdvala.run(`${imp}cu.notEvery(["1", 2, "3"], isNumber)`)).toBe(true)

        expect(mdvala.run(`${imp}cu.notEvery([1, 2, 3], isNumber)`)).toBe(false)
        expect(mdvala.run(`${imp}cu.notEvery(["1", "2", "3"], isNumber)`)).toBe(true)
        expect(mdvala.run(`${imp}cu.notEvery([], isNumber)`)).toBe(false)
        expect(mdvala.run(`${imp}cu.notEvery("", isNumber)`)).toBe(false)
        expect(mdvala.run(`${imp}cu.notEvery({}, isNumber)`)).toBe(false)
        expect(mdvala.run(`${imp}cu.notEvery([2, 4, 6], x -> isZero(x mod 2))`)).toBe(false)
        expect(mdvala.run(`${imp}cu.notEvery("abc", x -> x >= "a")`)).toBe(false)
        expect(mdvala.run(`${imp}cu.notEvery("abC", x -> x >= "a")`)).toBe(true)
        expect(mdvala.run(`${imp}cu.notEvery({a: 2, b: 4}, -> isEven(second($)))`)).toBe(false)
        expect(mdvala.run(`${imp}cu.notEvery({a: 2, b: 3}, -> isEven(second($)))`)).toBe(true)
        expect(mdvala.run(`${imp}cu.notEvery({a: 2, b: 3}, -> isEven(second($)))`)).toBe(true)
        expect(() => mdvala.run(`${imp}cu.notEvery(+)`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}cu.notEvery([])`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}cu.notEvery()`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}cu.notEvery([1], isNumber, 2)`)).toThrow(DvalaError)
      })
    })

    describe('isAny', () => {
      it('samples', () => {
        expect(mdvala.run(`${imp}cu.isAny([1, "2", 3], isNumber)`)).toBe(true)

        expect(mdvala.run(`${imp}cu.isAny([1, 2, 3], isNumber)`)).toBe(true)
        expect(mdvala.run(`${imp}cu.isAny([1, "2", 3], isNumber)`)).toBe(true)
        expect(mdvala.run(`${imp}cu.isAny(["1", "2", "3"], isNumber)`)).toBe(false)
        expect(mdvala.run(`${imp}cu.isAny([], isNumber)`)).toBe(false)
        expect(mdvala.run(`${imp}cu.isAny("", isNumber)`)).toBe(false)
        expect(mdvala.run(`${imp}cu.isAny({}, isNumber)`)).toBe(false)
        expect(mdvala.run(`${imp}cu.isAny([1, 3, 6], x -> isZero(x mod 2))`)).toBe(true)
        expect(mdvala.run(`${imp}cu.isAny([1, 3, 5], x -> isZero(x mod 2))`)).toBe(false)
        expect(mdvala.run(`${imp}cu.isAny("abc", x -> x >= "a")`)).toBe(true)
        expect(mdvala.run(`${imp}cu.isAny("abC", x -> x >= "a")`)).toBe(true)
        expect(mdvala.run(`${imp}cu.isAny("ABC", x -> x >= "a")`)).toBe(false)
        expect(mdvala.run(`${imp}cu.isAny({a: 2, b: 4}, -> isEven(second($)))`)).toBe(true)
        expect(mdvala.run(`${imp}cu.isAny({a: 2, b: 3}, -> isEven(second($)))`)).toBe(true)
        expect(mdvala.run(`${imp}cu.isAny({a: 1, b: 3}, -> isEven(second($)))`)).toBe(false)
        expect(() => mdvala.run(`${imp}cu.isAny(+)`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}cu.isAny([])`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}cu.isAny()`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}cu.isAny([1], isNumber, 2)`)).toThrow(DvalaError)
      })
    })

    describe('notAny', () => {
      it('samples', () => {
        expect(mdvala.run(`${imp}cu.notAny(["1", "2", "3"], isNumber)`)).toBe(true)
        expect(mdvala.run(`${imp}cu.notAny(["1", "2", 3], isNumber)`)).toBe(false)

        expect(mdvala.run(`${imp}cu.notAny([1, 2, 3], isNumber)`)).toBe(false)
        expect(mdvala.run(`${imp}cu.notAny([1, "2", 3], isNumber)`)).toBe(false)
        expect(mdvala.run(`${imp}cu.notAny(["1", "2", "3"], isNumber)`)).toBe(true)
        expect(mdvala.run(`${imp}cu.notAny([], isNumber)`)).toBe(true)
        expect(mdvala.run(`${imp}cu.notAny("", isNumber)`)).toBe(true)
        expect(mdvala.run(`${imp}cu.notAny({}, isNumber)`)).toBe(true)
        expect(mdvala.run(`${imp}cu.notAny([1, 3, 6], x -> isZero(x mod 2))`)).toBe(false)
        expect(mdvala.run(`${imp}cu.notAny([1, 3, 5], x -> isZero(x mod 2))`)).toBe(true)
        expect(mdvala.run(`${imp}cu.notAny("abc", x -> x >= "a")`)).toBe(false)
        expect(mdvala.run(`${imp}cu.notAny("abC", x -> x >= "a")`)).toBe(false)
        expect(mdvala.run(`${imp}cu.notAny("ABC", x -> x >= "a")`)).toBe(true)
        expect(mdvala.run(`${imp}cu.notAny({a: 2, b: 4}, -> isEven(second($)))`)).toBe(false)
        expect(mdvala.run(`${imp}cu.notAny({a: 2, b: 3}, -> isEven(second($)))`)).toBe(false)
        expect(mdvala.run(`${imp}cu.notAny({a: 1, b: 3}, -> isEven(second($)))`)).toBe(true)
        expect(() => mdvala.run(`${imp}cu.notAny(+)`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}cu.notAny([])`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}cu.notAny()`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}cu.notAny([1], isNumber, 2)`)).toThrow(DvalaError)
      })
    })

    describe('update', () => {
      it('samples', () => {
        expect(
          mdvala.run(
            `${imp}let x = "Albert"; cu.update(x, 3, val -> if isNull(val) then "!" else upperCase(val) end)`,
          ),
        ).toEqual('AlbErt')
        expect(
          mdvala.run(
            `${imp}let x = "Albert"; cu.update(x, 6, val -> if isNull(val) then "!" else upperCase(val) end)`,
          ),
        ).toEqual('Albert!')

        expect(mdvala.run(`${imp}let x = [0, 1, 2, 3]; cu.update(x, 3, inc)`)).toEqual([0, 1, 2, 4])
        expect(mdvala.run(`${imp}let x = [0, 1, 2, 3]; cu.update(x, 4, identity)`)).toEqual([0, 1, 2, 3, null])

        expect(mdvala.run(`${imp}let x = {a: 1, b: 2}; cu.update(x, "a", inc)`)).toEqual({ a: 2, b: 2 })
        expect(mdvala.run(`${imp}let x = {a: 1, b: 2}; cu.update(x, "a", +, 10)`)).toEqual({ a: 11, b: 2 })
        expect(mdvala.run(`${imp}let x = {a: 1, b: 2}; cu.update(x, "a", val -> if isEven(val) then 0 else inc(val) end)`)).toEqual({
          a: 2,
          b: 2,
        })
        expect(() => mdvala.run(`${imp}let x = {a: 1, b: 2}; "c"(x)`)).toThrow(KeyError)
        expect(mdvala.run(`${imp}cu.update({}, "a", val -> if isNull(val) then 0 else null end)`)).toEqual({ a: 0 })
        expect(mdvala.run(`${imp}let x = {a: 1, b: 2}; cu.update(x, "c", val -> if isNull(val) then 0 else inc(val) end)`)).toEqual({
          a: 1,
          b: 2,
          c: 0,
        })
        expect(() => mdvala.run(`${imp}cu.update(isNumber, [1], 2)`)).toThrow(DvalaError)
      })
    })

    describe('updateIn', () => {
      it('samples', () => {
        expect(
          mdvala.run(
            `${imp}let x = "Albert"; cu.updateIn(x, [3], val -> if isNull(val) then "!" else upperCase(val) end)`,
          ),
        ).toEqual('AlbErt')
        expect(
          mdvala.run(
            `${imp}let x = "Albert"; cu.updateIn(x, [6], val -> if isNull(val) then "!" else upperCase(val) end)`,
          ),
        ).toEqual('Albert!')

        expect(mdvala.run(`${imp}let x = [0, 1, 2, 3]; cu.updateIn(x, [3], inc)`)).toEqual([0, 1, 2, 4])
        expect(mdvala.run(`${imp}let x = [0, 1, 2, 3]; cu.updateIn(x, [4], identity)`)).toEqual([0, 1, 2, 3, null])

        expect(mdvala.run(`${imp}let x = {a: 1, b: 2}; cu.updateIn(x, ["a"], inc)`)).toEqual({ a: 2, b: 2 })
        expect(mdvala.run(`${imp}let x = {a: 1, b: 2}; cu.updateIn(x, ["a"], +, 10)`)).toEqual({ a: 11, b: 2 })
        expect(mdvala.run(`${imp}let x = {a: 1, b: 2}; cu.updateIn(x, ["a"], val -> if isEven(val) then 0 else inc(val) end)`)).toEqual({
          a: 2,
          b: 2,
        })
        expect(mdvala.run(`${imp}cu.updateIn({}, ["a"], val -> if isNull(val) then 0 else null end)`)).toEqual({ a: 0 })
        expect(mdvala.run(`${imp}let x = {a: 1, b: 2}; cu.updateIn(x, ["c"], val -> if isNull(val) then 0 else inc(val) end)`)).toEqual({
          a: 1,
          b: 2,
          c: 0,
        })
        expect(mdvala.run(`${imp}cu.updateIn({a: [1, 2, 3]}, ["a", 1], val -> if isNull(val) then 0 else null end)`)).toEqual({
          a: [1, null, 3],
        })
        expect(mdvala.run(`${imp}cu.updateIn({a: [1, null, 3]}, ["a", 1], val -> if isNull(val) then 0 else null end)`)).toEqual({
          a: [1, 0, 3],
        })
        expect(mdvala.run(`${imp}cu.updateIn({a: [1, "Albert", 3]}, ["a", 1, 0], val -> if isNull(val) then "?" else "!" end)`)).toEqual({
          a: [1, '!lbert', 3],
        })
        expect(mdvala.run(`${imp}cu.updateIn({a: [1, "", 3]}, ["a", 1, 0], val -> if isNull(val) then "?" else "!" end)`)).toEqual({
          a: [1, '?', 3],
        })
      })
    })
  }
})
