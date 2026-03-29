import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../src/createDvala'
import { DvalaError } from '../../../src/errors'
import { sequenceUtilsModule } from '../../../src/builtin/modules/sequence'

const dvala = createDvala()
const dvalaInstances = [dvala, createDvala({ debug: true })]
describe('sequence functions', () => {
  describe('nth', () => {
    it('array samples', () => {
      for (const dvala2 of dvalaInstances) {
        expect(dvala2.run('nth([1, 2, 3], 1)')).toBe(2)
        expect(dvala2.run('nth([], 0)')).toBeNull()
        expect(dvala2.run('nth([1, 2, 3], 3)')).toBeNull()
        expect(dvala2.run('nth([1, 2, 3], -1)')).toBeNull()
        expect(dvala2.run('nth([1, 2, 3], -4)')).toBeNull()
        expect(() => dvala2.run('nth()')).toThrow(DvalaError)
        expect(() => dvala2.run('nth({}, 1)')).toThrow(DvalaError)
        expect(() => dvala2.run('nth([1, 2, 3])')).toThrow(DvalaError)
        expect(() => dvala2.run('nth([1, 2, 3], 1, 2, 3)')).toThrow(DvalaError)
      }
    })

    it('string samples', () => {
      expect(dvala.run('nth("A string", 1)')).toBe(' ')
      expect(dvala.run('nth("A string", 3)')).toBe('t')
      expect(dvala.run('nth("A string", -3)')).toBeNull()
      expect(dvala.run('nth("A string", 30)')).toBeNull()
      expect(dvala.run('nth("A string", -30)')).toBeNull()
      expect(() => dvala.run('nth("A string")')).toThrow(DvalaError)
      expect(() => dvala.run('nth("A string", 1, 2, 3)')).toThrow(DvalaError)
    })

    it('default values', () => {
      expect(dvala.run('nth([1, 2, 3], 1, 99)')).toBe(2)
      expect(dvala.run('nth([1, 2, 3], 3, 99)')).toBe(99)
      expect(dvala.run('nth([1, 2, 3], -1, 99)')).toBe(99)
      expect(dvala.run('nth([1, 2, 3], -4, 99)')).toBe(99)
      expect(dvala.run('nth("A string", 1, 99)')).toBe(' ')
      expect(dvala.run('nth("A string", 3, 99)')).toBe('t')
      expect(dvala.run('nth("A string", -3, 99)')).toBe(99)
      expect(dvala.run('nth("A string", 30, 99)')).toBe(99)
      expect(dvala.run('nth("A string", -30, 99)')).toBe(99)
    })

    it('null sequence', () => {
      expect(dvala.run('nth(null, 0)')).toBeNull()
      expect(dvala.run('nth(null, 0, 99)')).toBe(99)
    })
  })

  describe('slice', () => {
    it('samples', () => {
      expect(dvala.run('slice([1, 2, 3], 0)')).toEqual([1, 2, 3])
      expect(dvala.run('slice([1, 2, 3], 1)')).toEqual([2, 3])
      expect(dvala.run('slice([1, 2, 3], -1)')).toEqual([3])
      expect(dvala.run('slice([1, 2, 3], -3)')).toEqual([1, 2, 3])
      expect(dvala.run('slice([1, 2, 3], -4)')).toEqual([1, 2, 3])
      expect(dvala.run('slice([1, 2, 3], 3)')).toEqual([])
      expect(dvala.run('slice([1, 2, 3], 4)')).toEqual([])
      expect(dvala.run('slice([1, 2, 3], 0, 0)')).toEqual([])
      expect(dvala.run('slice([1, 2, 3], 0, 1)')).toEqual([1])
      expect(dvala.run('slice([1, 2, 3], 0, 10)')).toEqual([1, 2, 3])
      expect(dvala.run('slice([1, 2, 3], 0, -1)')).toEqual([1, 2])

      expect(dvala.run('slice("Albert", 0)')).toBe('Albert')
      expect(dvala.run('slice("Albert", 1)')).toBe('lbert')
      expect(dvala.run('slice("Albert", -1)')).toBe('t')
      expect(dvala.run('slice("Albert", -3)')).toBe('ert')
      expect(dvala.run('slice("Albert", -4)')).toBe('bert')
      expect(dvala.run('slice("Albert", -5)')).toBe('lbert')
      expect(dvala.run('slice("Albert", -6)')).toBe('Albert')
      expect(dvala.run('slice("Albert", -7)')).toBe('Albert')
      expect(dvala.run('slice("Albert", 4)')).toBe('rt')
      expect(dvala.run('slice("Albert", 5)')).toBe('t')
      expect(dvala.run('slice("Albert", 6)')).toBe('')
      expect(dvala.run('slice("Albert", 0, 0)')).toBe('')
      expect(dvala.run('slice("Albert", 0, 1)')).toBe('A')
      expect(dvala.run('slice("Albert", 0, 10)')).toBe('Albert')
      expect(dvala.run('slice("Albert", 0, -1)')).toBe('Alber')

      expect(() => dvala.run('slice([1, 2, 3], 1, 2, 3)')).toThrow(DvalaError)
      expect(() => dvala.run('slice()')).toThrow(DvalaError)
      expect(() => dvala.run('slice("Albert")')).toThrow(DvalaError)
      expect(() => dvala.run('slice({},)')).toThrow(DvalaError)
      expect(() => dvala.run('slice(null, 2)')).toThrow(DvalaError)
    })
  })

  describe('indexOf', () => {
    it('samples', () => {
      expect(dvala.run('indexOf(["1", "2", 3], "2")')).toEqual(1)
      expect(dvala.run('indexOf(["1", "2", "3"], "4")')).toBeNull()
      expect(dvala.run('indexOf([], 1)')).toBeNull()
      expect(dvala.run('indexOf(null, 1)')).toBeNull()
      expect(dvala.run('indexOf("AlbertAlbert", "l")')).toBe(1)
      expect(dvala.run('indexOf("Albert", "ert")')).toBe(3)
      expect(dvala.run('indexOf("Albert", "z")')).toBeNull()
      expect(dvala.run('indexOf([1], 2)')).toBeNull()
      expect(() => dvala.run('indexOf(+)')).toThrow(DvalaError)
      expect(() => dvala.run('indexOf()')).toThrow(DvalaError)
    })
  })

  describe('some', () => {
    it('samples', () => {
      expect(dvala.run('some("Albert", -> "l" == $)')).toBe('l')

      expect(dvala.run('some(null, isNumber)')).toBeNull()
      expect(dvala.run('some(["1", "2", 3], isNumber)')).toBe(3)
      expect(dvala.run('some(["1", "2", "3"], isNumber)')).toBeNull()
      expect(dvala.run('some([], isNumber)')).toBeNull()
      expect(dvala.run('some([1, 2, 3, 4, 5, 6, 7], -> isZero($ mod 3))')).toBe(3)

      expect(dvala.run('some("Aa", -> $ >= "a")')).toBe('a')
      expect(dvala.run('some("Aa", -> $ >= "z")')).toBeNull()

      expect(() => dvala.run('some(+)')).toThrow(DvalaError)
      expect(() => dvala.run('some()')).toThrow(DvalaError)
      expect(() => dvala.run('some([1], isNumber 2)')).toThrow(DvalaError)
    })
  })

  describe('first', () => {
    it('samples', () => {
      expect(dvala.run('first([1, 2, 3])')).toEqual(1)
      expect(dvala.run('first(["1"])')).toEqual('1')
      expect(dvala.run('first([])')).toBeNull()
      expect(dvala.run('first("AB")')).toBe('A')
      expect(dvala.run('first("A")')).toBe('A')
      expect(dvala.run('first("")')).toBeNull()
      expect(dvala.run('first(null)')).toBeNull()

      expect(() => dvala.run('first()')).toThrow(DvalaError)
      expect(() => dvala.run('first(true)')).toThrow(DvalaError)
      expect(() => dvala.run('first(false)')).toThrow(DvalaError)
      expect(() => dvala.run('first(object())')).toThrow(DvalaError)
      expect(() => dvala.run('first(10)')).toThrow(DvalaError)
    })
  })

  describe('second', () => {
    it('samples', () => {
      expect(dvala.run('second([1, 2, 3])')).toEqual(2)
      expect(dvala.run('second(["1"])')).toBeNull()
      expect(dvala.run('second([])')).toBeNull()

      expect(dvala.run('second("ABC")')).toBe('B')
      expect(dvala.run('second("AB")')).toBe('B')
      expect(dvala.run('second("A")')).toBeNull()
      expect(dvala.run('second("")')).toBeNull()

      expect(dvala.run('second(null)')).toBeNull()

      expect(() => dvala.run('second()')).toThrow(DvalaError)
      expect(() => dvala.run('second(true)')).toThrow(DvalaError)
      expect(() => dvala.run('second(false)')).toThrow(DvalaError)
      expect(() => dvala.run('second(object())')).toThrow(DvalaError)
      expect(() => dvala.run('second(10)')).toThrow(DvalaError)
    })
  })

  describe('reverse', () => {
    it('samples', () => {
      expect(dvala.run('reverse([1, 2, 3])')).toEqual([3, 2, 1])
      expect(dvala.run('reverse(["1"])')).toEqual(['1'])
      expect(dvala.run('reverse([])')).toEqual([])
      expect(dvala.run('reverse("albert")')).toBe('trebla')
      expect(dvala.run('reverse("A 1")')).toBe('1 A')
      expect(dvala.run('reverse("")')).toBe('')

      expect(dvala.run('reverse(null)')).toBeNull()

      expect(() => dvala.run('reverse()')).toThrow(DvalaError)
      expect(() => dvala.run('reverse("word1", "word2")')).toThrow(DvalaError)
      expect(() => dvala.run('reverse()')).toThrow(DvalaError)
      expect(() => dvala.run('reverse(true)')).toThrow(DvalaError)
      expect(() => dvala.run('reverse(false)')).toThrow(DvalaError)
      expect(() => dvala.run('reverse(object())')).toThrow(DvalaError)
      expect(() => dvala.run('reverse(10)')).toThrow(DvalaError)
    })
    it('returns a new array instance', () => {
      const program = `
        let l = [1, 2, 3];
        not(l == reverse(l))
      `
      expect(dvala.run(program)).toBe(true)
    })
  })

  describe('last', () => {
    it('samples', () => {
      expect(dvala.run('last([1, 2, 3])')).toEqual(3)
      expect(dvala.run('last(["1"])')).toEqual('1')
      expect(dvala.run('last([])')).toBeNull()
      expect(dvala.run('last("Albert")')).toBe('t')
      expect(dvala.run('last("1")')).toBe('1')
      expect(dvala.run('last("")')).toBeNull()

      expect(dvala.run('last(null)')).toBeNull()

      expect(() => dvala.run('last()')).toThrow(DvalaError)
      expect(() => dvala.run('last(true)')).toThrow(DvalaError)
      expect(() => dvala.run('last(false)')).toThrow(DvalaError)
      expect(() => dvala.run('last(object())')).toThrow(DvalaError)
      expect(() => dvala.run('last(10)')).toThrow(DvalaError)
    })
  })

  describe('rest', () => {
    it('samples', () => {
      expect(dvala.run('rest([1, 2, 3])')).toEqual([2, 3])
      expect(dvala.run('rest([1, 2])')).toEqual([2])
      expect(dvala.run('rest(["1"])')).toEqual([])
      expect(dvala.run('rest([])')).toEqual([])
      expect(dvala.run('rest("Albert")')).toEqual('lbert')
      expect(dvala.run('rest("A")')).toEqual('')
      expect(dvala.run('rest("")')).toEqual('')

      expect(() => dvala.run('rest()')).toThrow(DvalaError)
      expect(() => dvala.run('rest(true)')).toThrow(DvalaError)
      expect(() => dvala.run('rest(false)')).toThrow(DvalaError)
      expect(() => dvala.run('rest(null)')).toThrow(DvalaError)
      expect(() => dvala.run('rest(object())')).toThrow(DvalaError)
      expect(() => dvala.run('rest(10)')).toThrow(DvalaError)
    })
  })

  describe('next', () => {
    it('samples', () => {
      expect(dvala.run('next([1, 2, 3])')).toEqual([2, 3])
      expect(dvala.run('next([1, 2])')).toEqual([2])
      expect(dvala.run('next(["1"])')).toBeNull()
      expect(dvala.run('next([])')).toBeNull()
      expect(dvala.run('next("Albert")')).toEqual('lbert')
      expect(dvala.run('next("A")')).toBeNull()
      expect(dvala.run('next("")')).toBeNull()

      expect(() => dvala.run('next()')).toThrow(DvalaError)
      expect(() => dvala.run('next(true)')).toThrow(DvalaError)
      expect(() => dvala.run('next(false)')).toThrow(DvalaError)
      expect(() => dvala.run('next(null)')).toThrow(DvalaError)
      expect(() => dvala.run('next(object())')).toThrow(DvalaError)
      expect(() => dvala.run('next(10)')).toThrow(DvalaError)
    })
  })

  describe('push', () => {
    it('samples', () => {
      expect(dvala.run('push([1, 2, 3], 0)')).toEqual([1, 2, 3, 0])
      expect(dvala.run('push([1, 2, 3], 1, "2")')).toEqual([1, 2, 3, 1, '2'])
      expect(dvala.run('let l = [1, 2, 3]; push(l, 1, "2")')).toEqual([1, 2, 3, 1, '2'])
      expect(dvala.run('let l = [1, 2, 3]; push(l, 1, "2"); l')).toEqual([1, 2, 3])
      expect(dvala.run('push("Albert", "!")')).toBe('Albert!')
      expect(dvala.run('push("Albert", "!", "?")')).toBe('Albert!?')
      expect(dvala.run('push("", "!", "?")')).toBe('!?')

      expect(() => dvala.run('push("Albert", "!?")')).toThrow(DvalaError)
      expect(() => dvala.run('push([1, 2, 3])')).toThrow(DvalaError)
      expect(() => dvala.run('push({}, "2")')).toThrow(DvalaError)
      expect(() => dvala.run('push(null, 0 "2")')).toThrow(DvalaError)
      expect(() => dvala.run('push(true 0 "2")')).toThrow(DvalaError)
      expect(() => dvala.run('push(false 0 "2")')).toThrow(DvalaError)
      expect(() => dvala.run('push(1, 0 "2")')).toThrow(DvalaError)
      expect(() => dvala.run('push("1", 0 "2")')).toThrow(DvalaError)
      expect(() => dvala.run('push(0 "2")')).toThrow(DvalaError)
      expect(() => dvala.run('push()')).toThrow(DvalaError)
    })
  })

  describe('pop', () => {
    it('samples', () => {
      expect(dvala.run('pop([1, 2, 3])')).toEqual([1, 2])
      expect(dvala.run('pop([])')).toEqual([])
      expect(dvala.run('let l = [1, 2, 3]; pop(l); l')).toEqual([1, 2, 3])
      expect(dvala.run('let l = [1, 2, 3]; pop(l)')).toEqual([1, 2])
      expect(dvala.run('let l = []; pop(l); l')).toEqual([])
      expect(dvala.run('pop("Albert")')).toBe('Alber')
      expect(dvala.run('pop("1")')).toBe('')
      expect(dvala.run('pop("")')).toBe('')

      expect(() => dvala.run('pop(object())')).toThrow(DvalaError)
      expect(() => dvala.run('pop(null)')).toThrow(DvalaError)
      expect(() => dvala.run('pop(true)')).toThrow(DvalaError)
      expect(() => dvala.run('pop(false)')).toThrow(DvalaError)
      expect(() => dvala.run('pop(1)')).toThrow(DvalaError)
      expect(() => dvala.run('pop()')).toThrow(DvalaError)
    })
  })

  describe('sort', () => {
    it('samples', () => {
      expect(dvala.run('sort([3, 1, 2], (a, b) -> if a < b then -1 else if a > b then 1 else 0 end)')).toEqual([1, 2, 3])
      expect(dvala.run('sort([3, 1, 2], (a, b) -> if a > b then -1 else if a < b then 1 else 0 end)')).toEqual([3, 2, 1])
      expect(dvala.run('sort([], (a, b) -> if a > b then -1 else if a < b then 1 else 0 end)')).toEqual([])

      expect(dvala.run('sort("Albert", (a, b) -> if a < b then 1 else if a > b then -1 else 0 end)')).toBe('trlebA')

      expect(dvala.run('sort("Albert")')).toBe('Abelrt')

      expect(() => dvala.run('sort(10, (a, b) -> if a > b then -1 else if a < b then 1 else -1 end)')).toThrow(DvalaError)
      expect(() => dvala.run('sort((a, b) -> if a > b then -1 else if a < b then 1 else -1 end)')).toThrow(DvalaError)
      expect(() => dvala.run('sort()')).toThrow(DvalaError)
    })
  })

  describe('join', () => {
    it('samples', () => {
      expect(dvala.run('join(["Albert", "Mojir"], ", ")')).toBe('Albert, Mojir')
      expect(dvala.run('join(["Albert", 10], ", ")')).toBe('Albert, 10')
      expect(dvala.run('join(map([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], str), ", ")')).toBe('0, 1, 2, 3, 4, 5, 6, 7, 8, 9')
      expect(() => dvala.run('join((map [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], str) ", ", 5)')).toThrow(DvalaError)
      expect(() => dvala.run('join(["Albert", "Mojir"], ", ", -1)')).toThrow(DvalaError)
      expect(() => dvala.run('join(["Albert", "Mojir"])')).toThrow(DvalaError)
    })
  })

  describe('take', () => {
    it('samples', () => {
      expect(dvala.run('take([1, 2, 3], 2)')).toEqual([1, 2])
      expect(dvala.run('take([], 2)')).toEqual([])
      expect(dvala.run('take([1, 2, 3], 20)')).toEqual([1, 2, 3])
      expect(dvala.run('take([1, 2, 3], 0)')).toEqual([])
      expect(dvala.run('take("Albert", 2)')).toEqual('Al')
      expect(dvala.run('take("Albert", 2.01)')).toEqual('Alb')

      expect(() => dvala.run('take({},)')).toThrow(DvalaError)
      expect(() => dvala.run('take(null, 1)')).toThrow(DvalaError)
      expect(() => dvala.run('take(true 1)')).toThrow(DvalaError)
      expect(() => dvala.run('take(false 1)')).toThrow(DvalaError)
      expect(() => dvala.run('take("Hej", "1")')).toThrow(DvalaError)
      expect(() => dvala.run('take()')).toThrow(DvalaError)
      expect(() => dvala.run('take([1, 2, 3])')).toThrow(DvalaError)
      expect(() => dvala.run('take([1, 2, 3], 1, 2)')).toThrow(DvalaError)
    })

    it('new array created', () => {
      const program = `
        let l1 = [1, 2, 3];
        let l2 = take(l1, 2);
        l1 != l2
      `
      expect(dvala.run(program)).toBe(true)
    })
  })

  describe('takeLast', () => {
    it('samples', () => {
      expect(dvala.run('takeLast([1, 2, 3], 2)')).toEqual([2, 3])
      expect(dvala.run('takeLast([1, 2, 3], 20)')).toEqual([1, 2, 3])
      expect(dvala.run('takeLast([1, 2, 3], 0)')).toEqual([])
      expect(dvala.run('takeLast([1, 2, 3], 0.01)')).toEqual([3])

      expect(() => dvala.run('takeLast(object())')).toThrow(DvalaError)
      expect(() => dvala.run('takeLast(null)')).toThrow(DvalaError)
      expect(() => dvala.run('takeLast(true)')).toThrow(DvalaError)
      expect(() => dvala.run('takeLast(false)')).toThrow(DvalaError)
      expect(() => dvala.run('takeLast("1")')).toThrow(DvalaError)
      expect(() => dvala.run('takeLast()')).toThrow(DvalaError)
      expect(() => dvala.run('takeLast([1, 2, 3])')).toThrow(DvalaError)
      expect(() => dvala.run('takeLast([1, 2, 3], 1, 2)')).toThrow(DvalaError)
    })

    it('new array created', () => {
      const program = `
        let l1 = [1, 2, 3];
        let l2 = takeLast(l1, 2);
        l1 != l2
      `
      expect(dvala.run(program)).toBe(true)
    })
  })

  describe('drop', () => {
    it('samples', () => {
      expect(dvala.run('drop([1, 2, 3], 2)')).toEqual([3])
      expect(dvala.run('drop([1, 2, 3], 20)')).toEqual([])
      expect(dvala.run('drop([1, 2, 3], 0)')).toEqual([1, 2, 3])
      expect(dvala.run('drop("Albert", 2)')).toEqual('bert')
      expect(dvala.run('drop([1, 2, 3], 0.5)')).toEqual([2, 3])
      expect(dvala.run('drop("Albert", -2)')).toEqual('Albert')

      expect(() => dvala.run('drop({},)')).toThrow(DvalaError)
      expect(() => dvala.run('drop(null, 1)')).toThrow(DvalaError)
      expect(() => dvala.run('drop(true 1)')).toThrow(DvalaError)
      expect(() => dvala.run('drop(false 1)')).toThrow(DvalaError)
      expect(() => dvala.run('drop("Hej", "1")')).toThrow(DvalaError)
      expect(() => dvala.run('drop()')).toThrow(DvalaError)
      expect(() => dvala.run('drop([1, 2, 3])')).toThrow(DvalaError)
      expect(() => dvala.run('drop([1, 2, 3], 1, 2)')).toThrow(DvalaError)
    })

    it('new array created', () => {
      const program = `
        let l1 = [1, 2, 3];
        let l2 = drop(l1, 2);
        l1 != l2
      `
      expect(dvala.run(program)).toBe(true)
    })
  })

  describe('dropLast', () => {
    it('samples', () => {
      expect(dvala.run('dropLast([1, 2, 3], 2)')).toEqual([1])
      expect(dvala.run('dropLast([1, 2, 3], 20)')).toEqual([])
      expect(dvala.run('dropLast([1, 2, 3], 0)')).toEqual([1, 2, 3])
      expect(dvala.run('dropLast("Albert", 2)')).toEqual('Albe')
      expect(dvala.run('dropLast([1, 2, 3], 0.5)')).toEqual([1, 2])
      expect(dvala.run('dropLast("Albert", -2)')).toEqual('Albert')

      expect(() => dvala.run('dropLast({},)')).toThrow(DvalaError)
      expect(() => dvala.run('dropLast(null, 1)')).toThrow(DvalaError)
      expect(() => dvala.run('dropLast(true 1)')).toThrow(DvalaError)
      expect(() => dvala.run('dropLast(false 1)')).toThrow(DvalaError)
      expect(() => dvala.run('dropLast("Hej", "1")')).toThrow(DvalaError)
      expect(() => dvala.run('dropLast()')).toThrow(DvalaError)
      expect(() => dvala.run('dropLast([1, 2, 3])')).toThrow(DvalaError)
      expect(() => dvala.run('dropLast([1, 2, 3], 1, 2)')).toThrow(DvalaError)
    })
  })

  describe('takeWhile', () => {
    it('samples', () => {
      expect(dvala.run('takeWhile([1, 2, 3, 2, 1], -> $ < 3)')).toEqual([1, 2])
      expect(dvala.run('takeWhile([1, 2, 3, 2, 1], -> $ > 3)')).toEqual([])
      expect(dvala.run('takeWhile("abcdabcd", -> $ <= "c")')).toEqual('abc')
      expect(dvala.run('takeWhile([1, 2, 3], -> $ < 10)')).toEqual([1, 2, 3])

      expect(() => dvala.run('takeWhile({}, -> $ < 3))')).toThrow(DvalaError)
      expect(() => dvala.run('takeWhile(null, -> $ < 3)')).toThrow(DvalaError)
      expect(() => dvala.run('takeWhile(true, -> $ < 3)')).toThrow(DvalaError)
      expect(() => dvala.run('takeWhile(false, -> $ < 3)')).toThrow(DvalaError)
      expect(() => dvala.run('takeWhile([1, 2, 3], 10)')).toThrow(DvalaError)
      expect(() => dvala.run('takeWhile()')).toThrow(DvalaError)
      expect(() => dvala.run('takeWhile([1, 2, 3])')).toThrow(DvalaError)
      expect(() => dvala.run('takeWhile([1, 2, 3], -> $ < 3 1)')).toThrow(DvalaError)
    })
    it('new array created', () => {
      const program = `
        let l1 = [1, 2, 3];
        let l2 = takeWhile(l1, -> $ < 3);
        l1 != l2
      `
      expect(dvala.run(program)).toBe(true)
    })
  })

  describe('dropWhile', () => {
    it('samples', () => {
      expect(dvala.run('dropWhile([1, 2, 3, 2, 1], -> $ < 3)')).toEqual([3, 2, 1])
      expect(dvala.run('dropWhile([1, 2, 3, 2, 1], -> $ > 3)')).toEqual([1, 2, 3, 2, 1])
      expect(dvala.run('dropWhile("abcdab", -> $ <= "c")')).toEqual('dab')
      expect(dvala.run('dropWhile([1, 2, 3], -> $ < 10)')).toEqual([])
      expect(dvala.run('dropWhile("abc", -> true)')).toEqual('')

      expect(() => dvala.run('dropWhile({}, -> $ < 3))')).toThrow(DvalaError)
      expect(() => dvala.run('dropWhile(null, -> $ < 3)')).toThrow(DvalaError)
      expect(() => dvala.run('dropWhile(true, -> $ < 3)')).toThrow(DvalaError)
      expect(() => dvala.run('dropWhile(false, -> $ < 3)')).toThrow(DvalaError)
      expect(() => dvala.run('dropWhile([1, 2, 3], 10)')).toThrow(DvalaError)
      expect(() => dvala.run('dropWhile()')).toThrow(DvalaError)
      expect(() => dvala.run('dropWhile([1, 2, 3])')).toThrow(DvalaError)
      expect(() => dvala.run('dropWhile([1, 2, 3], -> $ < 3 1)')).toThrow(DvalaError)
    })
    it('new array created', () => {
      const program = `
        let l1 = [1, 2, 3];
        let l2 = takeWhile(l1, -> $ < 3);
        l1 != l2
      `
      expect(dvala.run(program)).toBe(true)
    })
  })
})

describe('sequence-Utils module functions', () => {
  const imp = 'let su = import("sequence"); '
  for (const mdvala of [createDvala({ modules: [sequenceUtilsModule] }), createDvala({ modules: [sequenceUtilsModule], debug: true })]) {
    describe('position', () => {
      it('samples', () => {
        expect(mdvala.run(`${imp}su.position(["1", "2", 3], isNumber)`)).toEqual(2)
        expect(mdvala.run(`${imp}su.position(["1", "2", "3"], isNumber)`)).toBeNull()
        expect(mdvala.run(`${imp}su.position([], isNumber)`)).toBeNull()
        expect(mdvala.run(`${imp}su.position(null, isNumber)`)).toBeNull()
        expect(mdvala.run(`${imp}su.position([1, 2, 3, 4, 5, 6, 7], -> isZero($ mod 3))`)).toEqual(2)
        expect(mdvala.run(`${imp}su.position("Aa", -> $ >= "a")`)).toBe(1)
        expect(mdvala.run(`${imp}su.position("Aa", -> $ == "z")`)).toBeNull()
        expect(() => mdvala.run(`${imp}su.position(+)`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}su.position()`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}su.position([1], isNumber 2)`)).toThrow(DvalaError)
      })
    })

    describe('lastIndexOf', () => {
      it('samples', () => {
        expect(mdvala.run(`${imp}su.lastIndexOf(["1", "2", 3], "2")`)).toEqual(1)
        expect(mdvala.run(`${imp}su.lastIndexOf(["1", "2", "3"], "4")`)).toBeNull()
        expect(mdvala.run(`${imp}su.lastIndexOf([], 1)`)).toBeNull()
        expect(mdvala.run(`${imp}su.lastIndexOf(null, 1)`)).toBeNull()
        expect(mdvala.run(`${imp}su.lastIndexOf("AlbertAlbert", "l")`)).toBe(7)
        expect(mdvala.run(`${imp}su.lastIndexOf("Albert", "ert")`)).toBe(3)
        expect(mdvala.run(`${imp}su.lastIndexOf("Albert", "z")`)).toBeNull()
        expect(mdvala.run(`${imp}su.lastIndexOf([1], 2)`)).toBeNull()
        expect(() => mdvala.run(`${imp}su.lastIndexOf(+)`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}su.lastIndexOf()`)).toThrow(DvalaError)
      })
    })

    describe('unshift', () => {
      it('samples', () => {
        expect(mdvala.run(`${imp}su.unshift([1, 2, 3], 0)`)).toEqual([0, 1, 2, 3])
        expect(mdvala.run(`${imp}su.unshift([1, 2, 3], 1, "2")`)).toEqual([1, '2', 1, 2, 3])
        expect(mdvala.run(`${imp}let l = [1, 2, 3]; su.unshift(l, 1, "2"); l`)).toEqual([1, 2, 3])
        expect(mdvala.run(`${imp}let l = [1, 2, 3]; su.unshift(l, 1, "2")`)).toEqual([1, '2', 1, 2, 3])
        expect(mdvala.run(`${imp}su.unshift("lbert", "A")`)).toBe('Albert')

        expect(() => mdvala.run(`${imp}su.unshift([1, 2, 3])`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}su.unshift({}, "2")`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}su.unshift(null, 0 "2")`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}su.unshift(true 0 "2")`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}su.unshift(false 0 "2")`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}su.unshift(1, 0 "2")`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}su.unshift("1", 0 "2")`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}su.unshift(0 "2")`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}su.unshift()`)).toThrow(DvalaError)
      })
    })

    describe('sortBy', () => {
      it('samples', () => {
        expect(mdvala.run(`${imp}su.sortBy(["Albert", "Mojir", "Nina"], count)`)).toEqual(['Nina', 'Mojir', 'Albert'])
        expect(mdvala.run(`${imp}su.sortBy(["Albert", "Mojir", "Nina"], count, (a, b) -> b - a)`)).toEqual([
          'Albert',
          'Mojir',
          'Nina',
        ])
        expect(mdvala.run(`${imp}su.sortBy("Albert", lowerCase)`)).toEqual('Abelrt')
        expect(mdvala.run(`${imp}su.sortBy("Albert", lowerCase, (a, b) -> compare(b, a))`)).toEqual(
          'trlebA',
        )
        expect(() => mdvala.run(`${imp}su.sortBy()`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}su.sortBy("a")`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}su.sortBy({} "a")`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}su.sortBy(3 "a")`)).toThrow(DvalaError)
      })
    })

    describe('distinct', () => {
      it('samples', () => {
        expect(mdvala.run(`${imp}su.distinct([1, 2, 3, 1, 3, 5])`)).toEqual([1, 2, 3, 5])
        expect(mdvala.run(`${imp}su.distinct([])`)).toEqual([])
        expect(mdvala.run(`${imp}su.distinct("Albert Mojir")`)).toBe('Albert Moji')
        expect(mdvala.run(`${imp}su.distinct("")`)).toBe('')
        expect(() => mdvala.run(`${imp}su.distinct()`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}su.distinct([], [])`)).toThrow(DvalaError)
      })
    })

    describe('remove', () => {
      it('samples', () => {
        expect(mdvala.run(`${imp}su.remove([1, 2, 3, 1, 3, 5], isEven)`)).toEqual([1, 3, 1, 3, 5])
        expect(mdvala.run(`${imp}su.remove("Albert Mojir", -> contains("aoueiyAOUEIY", $))`)).toBe('lbrt Mjr')
        expect(() => mdvala.run(`${imp}su.remove()`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}su.remove("Albert Mojir")`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}su.remove(=> contains("aoueiyAOUEIY", $))`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}su.remove("Albert", => contains("aoueiyAOUEIY", $) "Mojir")`)).toThrow(DvalaError)
      })
    })

    describe('removeAt', () => {
      it('samples', () => {
        expect(mdvala.run(`${imp}su.removeAt([1, 2, 3, 4, 5], -1)`)).toEqual([1, 2, 3, 4])
        expect(mdvala.run(`${imp}su.removeAt([1, 2, 3, 4, 5], 0)`)).toEqual([2, 3, 4, 5])
        expect(mdvala.run(`${imp}su.removeAt([1, 2, 3, 4, 5], 2)`)).toEqual([1, 2, 4, 5])
        expect(mdvala.run(`${imp}su.removeAt([1, 2, 3, 4, 5], 4)`)).toEqual([1, 2, 3, 4])
        expect(mdvala.run(`${imp}su.removeAt([1, 2, 3, 4, 5], 5)`)).toEqual([1, 2, 3, 4, 5])
        expect(mdvala.run(`${imp}su.removeAt("Mojir", -1)`)).toEqual('Moji')
        expect(mdvala.run(`${imp}su.removeAt("Mojir", 0)`)).toEqual('ojir')
        expect(mdvala.run(`${imp}su.removeAt("Mojir", 2)`)).toEqual('Moir')
        expect(mdvala.run(`${imp}su.removeAt("Mojir", 4)`)).toEqual('Moji')
        expect(mdvala.run(`${imp}su.removeAt("Mojir", 5)`)).toEqual('Mojir')
        expect(() => mdvala.run(`${imp}su.removeAt()`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}su.removeAt("Albert Mojir")`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}su.removeAt(1)`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}su.removeAt("Albert", 1, 2`)).toThrow(DvalaError)
      })
    })

    describe('splitAt', () => {
      it('samples', () => {
        expect(mdvala.run(`${imp}su.splitAt([1, 2, 3, 4, 5], 2)`)).toEqual([
          [1, 2],
          [3, 4, 5],
        ])
        expect(mdvala.run(`${imp}su.splitAt([1, 2, 3, 4, 5], 0)`)).toEqual([[], [1, 2, 3, 4, 5]])
        expect(mdvala.run(`${imp}su.splitAt([1, 2, 3, 4, 5], -1)`)).toEqual([[1, 2, 3, 4], [5]])
        expect(mdvala.run(`${imp}su.splitAt([1, 2, 3, 4, 5], 100)`)).toEqual([[1, 2, 3, 4, 5], []])
        expect(mdvala.run(`${imp}su.splitAt("Albert", 2)`)).toEqual(['Al', 'bert'])
        expect(mdvala.run(`${imp}su.splitAt("Albert", 0)`)).toEqual(['', 'Albert'])
        expect(mdvala.run(`${imp}su.splitAt("Albert", -2)`)).toEqual(['Albe', 'rt'])
        expect(mdvala.run(`${imp}su.splitAt("Albert", 100)`)).toEqual(['Albert', ''])

        expect(() => mdvala.run(`${imp}su.splitAt([1, 2, 3, 4, 5], 0.01)`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}su.splitAt()`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}su.splitAt(3)`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}su.splitAt("Albert", 3 "Mojir")`)).toThrow(DvalaError)
      })
    })

    describe('splitWith', () => {
      it('samples', () => {
        expect(mdvala.run(`${imp}su.splitWith([1, 2, 3, 4, 5], -> $ < 3)`)).toEqual([
          [1, 2],
          [3, 4, 5],
        ])
        expect(mdvala.run(`${imp}su.splitWith([1, 2, 3, 4, 5], -> $ > 3)`)).toEqual([[], [1, 2, 3, 4, 5]])
        expect(mdvala.run(`${imp}su.splitWith([1, 2, 3, 4, 5], -> $ < 10)`)).toEqual([[1, 2, 3, 4, 5], []])

        expect(mdvala.run(`${imp}su.splitWith("Albert", -> $ <= "Z")`)).toEqual(['A', 'lbert'])
        expect(mdvala.run(`${imp}su.splitWith("Albert", -> $ > "Z")`)).toEqual(['', 'Albert'])
        expect(mdvala.run(`${imp}su.splitWith("Albert", -> $ <= "z")`)).toEqual(['Albert', ''])

        expect(() => mdvala.run(`${imp}su.splitWith()`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}su.splitWith(-> $ <= "Z")`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}su.splitWith("Albert", -> $ <= "Z", "Mojir")`)).toThrow(DvalaError)
      })
    })

    describe('frequencies', () => {
      it('samples', () => {
        expect(mdvala.run(`${imp}su.frequencies(["Albert", "Mojir", "Nina", "Mojir"])`)).toEqual({ Albert: 1, Nina: 1, Mojir: 2 })
        expect(mdvala.run(`${imp}su.frequencies("Pneumonoultramicroscopicsilicovolcanoconiosis")`)).toEqual({
          P: 1,
          a: 2,
          c: 6,
          e: 1,
          i: 6,
          l: 3,
          m: 2,
          n: 4,
          o: 9,
          p: 1,
          r: 2,
          s: 4,
          t: 1,
          u: 2,
          v: 1,
        })
        expect(() => mdvala.run(`${imp}su.frequencies()`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}su.frequencies({})`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}su.frequencies(3)`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}su.frequencies("", "")`)).toThrow(DvalaError)
      })
    })

    describe('groupBy', () => {
      it('samples', () => {
        expect(mdvala.run(`${imp}su.groupBy([{name: "Albert"}, {name: "Albert"}, {name: "Mojir"}], "name")`)).toEqual({
          Albert: [{ name: 'Albert' }, { name: 'Albert' }],
          Mojir: [{ name: 'Mojir' }],
        })
        expect(mdvala.run(`${imp}su.groupBy("Albert Mojir", -> if "aoueiAOUEI" contains $ then "vowel" else "other" end)`)).toEqual({
          other: ['l', 'b', 'r', 't', ' ', 'M', 'j', 'r'],
          vowel: ['A', 'e', 'o', 'i'],
        })
        expect(() => mdvala.run(`${imp}su.groupBy()`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}su.groupBy("a")`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}su.groupBy("a" {})`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}su.groupBy("a" 3)`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}su.groupBy("", "a", "")`)).toThrow(DvalaError)
      })
    })

    describe('partition', () => {
      it('samples', () => {
        expect(mdvala.run(`${imp}su.partition(range(20), 4)`)).toEqual([
          [0, 1, 2, 3],
          [4, 5, 6, 7],
          [8, 9, 10, 11],
          [12, 13, 14, 15],
          [16, 17, 18, 19],
        ])
        expect(mdvala.run(`${imp}su.partition(range(22), 4)`)).toEqual([
          [0, 1, 2, 3],
          [4, 5, 6, 7],
          [8, 9, 10, 11],
          [12, 13, 14, 15],
          [16, 17, 18, 19],
        ])
        expect(mdvala.run(`${imp}su.partition(range(20), 4, 6)`)).toEqual([
          [0, 1, 2, 3],
          [6, 7, 8, 9],
          [12, 13, 14, 15],
        ])
        expect(mdvala.run(`${imp}su.partition(range(20), 4, 3)`)).toEqual([
          [0, 1, 2, 3],
          [3, 4, 5, 6],
          [6, 7, 8, 9],
          [9, 10, 11, 12],
          [12, 13, 14, 15],
          [15, 16, 17, 18],
        ])
        expect(mdvala.run(`${imp}su.partition(range(20), 3, 6, ["a"])`)).toEqual([
          [0, 1, 2],
          [6, 7, 8],
          [12, 13, 14],
          [18, 19, 'a'],
        ])
        expect(mdvala.run(`${imp}su.partition(range(20), 4, 6, ["a"])`)).toEqual([
          [0, 1, 2, 3],
          [6, 7, 8, 9],
          [12, 13, 14, 15],
          [18, 19, 'a'],
        ])
        expect(mdvala.run(`${imp}su.partition(range(20), 4, 6, ["a", "b", "c", "d"])`)).toEqual([
          [0, 1, 2, 3],
          [6, 7, 8, 9],
          [12, 13, 14, 15],
          [18, 19, 'a', 'b'],
        ])
        expect(mdvala.run(`${imp}su.partition(["a", "b", "c", "d", "e", "f"], 3, 1)`)).toEqual([
          ['a', 'b', 'c'],
          ['b', 'c', 'd'],
          ['c', 'd', 'e'],
          ['d', 'e', 'f'],
        ])
        expect(mdvala.run(`${imp}su.partition([1, 2, 3, 4], 10)`)).toEqual([])
        expect(mdvala.run(`${imp}su.partition([1, 2, 3, 4], 10, 10)`)).toEqual([])
        expect(mdvala.run(`${imp}su.partition([1, 2, 3, 4], 10, 10, [])`)).toEqual([[1, 2, 3, 4]])
        expect(mdvala.run(`${imp}su.partition([1, 2, 3, 4], 10, 10, null)`)).toEqual([[1, 2, 3, 4]])
        expect(mdvala.run(`${imp}su.partition("superfragilistic", 5)`)).toEqual(['super', 'fragi', 'listi'])
        expect(mdvala.run(`${imp}su.partition("superfragilistic", 5, 5, null)`)).toEqual(['super', 'fragi', 'listi', 'c'])
        expect(mdvala.run(`${imp}let foo = [5, 6, 7, 8]; su.partition(foo, 2, 1, foo)`)).toEqual([
          [5, 6],
          [6, 7],
          [7, 8],
          [8, 5],
        ])
        expect(() => mdvala.run(`${imp}su.partition[1, 2, 3, 4], 0)`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}su.partition1)`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}su.partition[1])`)).toThrow(DvalaError)
      })
    })

    describe('partitionAll', () => {
      it('samples', () => {
        expect(mdvala.run(`${imp}su.partitionAll([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 4)`)).toEqual([
          [0, 1, 2, 3],
          [4, 5, 6, 7],
          [8, 9],
        ])
        expect(mdvala.run(`${imp}su.partitionAll([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 2, 4)`)).toEqual([
          [0, 1],
          [4, 5],
          [8, 9],
        ])
        expect(() => mdvala.run(`${imp}su.partitionAll(1)`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}su.partitionAll([1])`)).toThrow(DvalaError)
      })
    })

    describe('partitionBy', () => {
      it('samples', () => {
        expect(mdvala.run(`${imp}su.partitionBy([1, 2, 3, 4, 5], -> 3 == $)`)).toEqual([[1, 2], [3], [4, 5]])
        expect(mdvala.run(`${imp}su.partitionBy([1, 1, 1, 2, 2, 3, 3], isOdd)`)).toEqual([
          [1, 1, 1],
          [2, 2],
          [3, 3],
        ])
        expect(mdvala.run(`${imp}su.partitionBy("Leeeeeerrroyyy", identity)`)).toEqual(['L', 'eeeeee', 'rrr', 'o', 'yyy'])
        expect(() => mdvala.run(`${imp}su.partitionBy(isOdd)`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}su.partitionBy([1, 2, 3])`)).toThrow(DvalaError)
      })
    })

    describe('isStartsWith', () => {
      it('samples', () => {
        expect(mdvala.run(`${imp}su.isStartsWith([1, 2, 3], 1)`)).toBe(true)
        expect(mdvala.run(`${imp}su.isStartsWith([1, 2, 3], 2)`)).toBe(false)
        expect(mdvala.run(`${imp}su.isStartsWith([1, 2, 3], [1])`)).toBe(false)

        expect(mdvala.run(`${imp}su.isStartsWith("Albert", "Al")`)).toBe(true)
        expect(mdvala.run(`${imp}su.isStartsWith("Albert", "al")`)).toBe(false)
        expect(mdvala.run(`${imp}su.isStartsWith("Albert", "")`)).toBe(true)
        expect(mdvala.run(`${imp}su.isStartsWith("", "")`)).toBe(true)
        expect(mdvala.run(`${imp}su.isStartsWith("Albert", "Albert")`)).toBe(true)
        expect(mdvala.run(`${imp}su.isStartsWith("Albert", "Albert ")`)).toBe(false)
        expect(() => mdvala.run(`${imp}su.isStartsWith("Albert", "foo", 2)`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}su.isStartsWith("Albert")`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}su.isStartsWith(`)).toThrow(DvalaError)
      })
    })

    describe('isEndsWith', () => {
      it('samples', () => {
        expect(mdvala.run(`${imp}su.isEndsWith([1, 2, 3], 3)`)).toBe(true)
        expect(mdvala.run(`${imp}su.isEndsWith([1, 2, 3], 2)`)).toBe(false)
        expect(mdvala.run(`${imp}su.isEndsWith([1, 2, 3], [3])`)).toBe(false)

        expect(mdvala.run(`${imp}su.isEndsWith("Albert", "rt")`)).toBe(true)
        expect(mdvala.run(`${imp}su.isEndsWith("Albert", "RT")`)).toBe(false)
        expect(mdvala.run(`${imp}su.isEndsWith("Albert", "")`)).toBe(true)
        expect(mdvala.run(`${imp}su.isEndsWith("", "")`)).toBe(true)
        expect(mdvala.run(`${imp}su.isEndsWith("Albert", "Albert")`)).toBe(true)
        expect(mdvala.run(`${imp}su.isEndsWith("Albert", ", Albert")`)).toBe(false)
        expect(() => mdvala.run(`${imp}su.isEndsWith("Albert", "foo", 2)`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}su.isEndsWith("Albert")`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}su.isEndsWith()`)).toThrow(DvalaError)
      })
    })
    describe('interleave', () => {
      it('samples', () => {
        expect(mdvala.run(`${imp}su.interleave([1, 2, 3], [4, 5, 6])`)).toEqual([1, 4, 2, 5, 3, 6])
        expect(mdvala.run(`${imp}su.interleave([1, 2, 3], [4, 5, 6], [7, 8, 9])`)).toEqual([1, 4, 7, 2, 5, 8, 3, 6, 9])
        expect(mdvala.run(`${imp}su.interleave([1, 2, 3], [4, 5, 6], [7, 8])`)).toEqual([1, 4, 7, 2, 5, 8])
        expect(mdvala.run(`${imp}su.interleave([1, 2, 3], [4, 5, 6], [7])`)).toEqual([1, 4, 7])
        expect(mdvala.run(`${imp}su.interleave([1, 2, 3], [4, 5, 6], [7], [8, 9])`)).toEqual([1, 4, 7, 8])
        expect(mdvala.run(`${imp}su.interleave([], [4, 5, 6], [7], [8, 9])`)).toEqual([])
        expect(mdvala.run(`${imp}su.interleave("Albert", "Mojir")`)).toEqual('AMlobjeirr')

        expect(() => mdvala.run(`${imp}su.interleave()`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}su.interleave(1)`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}su.interleave([1, 2, 3], "asd")`)).toThrow(DvalaError)
      })
    })
    describe('interpose', () => {
      it('samples', () => {
        expect(mdvala.run(`${imp}su.interpose([1, 2, 3, 4], "a")`)).toEqual([1, 'a', 2, 'a', 3, 'a', 4])
        expect(mdvala.run(`${imp}su.interpose([1, 2, 3], "a")`)).toEqual([1, 'a', 2, 'a', 3])
        expect(mdvala.run(`${imp}su.interpose([1], "a")`)).toEqual([1])
        expect(mdvala.run(`${imp}su.interpose([], "a")`)).toEqual([])
        expect(mdvala.run(`${imp}su.interpose("Albert", ":")`)).toEqual('A:l:b:e:r:t')
        expect(() => mdvala.run(`${imp}su.interpose()`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}su.interpose(1)`)).toThrow(DvalaError)
        expect(() => mdvala.run(`${imp}su.interpose("a", 1)`)).toThrow(DvalaError)
      })
    })
  }
})
