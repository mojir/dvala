/* eslint-disable no-console */
import { afterEach, beforeEach, describe, expect, it, vitest } from 'vitest'
import { createDvala } from '../../../src/createDvala'
import { DvalaError } from '../../../src/errors'

describe('misc functions', () => {
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
  for (const dvala of [createDvala(), createDvala({ debug: true })]) {
    describe('epoch->iso-date', () => {
      it('samples', () => {
        expect(dvala.run('epoch->iso-date(1649756230899)')).toBe('2022-04-12T09:37:10.899Z')
        expect(dvala.run('epoch->iso-date(-1649756230899)')).toBe('1917-09-21T14:22:49.101Z')
        expect(dvala.run('epoch->iso-date(0)')).toBe('1970-01-01T00:00:00.000Z')
        expect(dvala.run('epoch->iso-date(0.999)')).toBe('1970-01-01T00:00:00.000Z')
        expect(dvala.run('epoch->iso-date(0.999)')).toBe('1970-01-01T00:00:00.000Z')
        expect(() => dvala.run('epoch->iso-date(1649756230899 1649756230899)')).toThrow(DvalaError)
        expect(() => dvala.run('epoch->iso-date()')).toThrow(DvalaError)
        expect(() => dvala.run('epoch->iso-date("1649756230899")')).toThrow(DvalaError)
        expect(() => dvala.run('epoch->iso-date(null)')).toThrow(DvalaError)
        expect(() => dvala.run('epoch->iso-date(true)')).toThrow(DvalaError)
      })
    })

    describe('iso-date->epoch', () => {
      it('samples', () => {
        expect(dvala.run('iso-date->epoch("2022-04-12T09:37:10.899Z")')).toBe(1649756230899)
        expect(dvala.run('iso-date->epoch("2022-04-12")')).toBeGreaterThan(1649548800000)
        expect(() =>
          dvala.run('iso-date->epoch("2022-04-12T09:37:10.899Z", "2022-04-12T09:37:10.899Z")'),
        ).toThrow()
        expect(() => dvala.run('iso-date->epoch()')).toThrow(DvalaError)
        expect(() => dvala.run('iso-date->epoch(1649756230899)')).toThrow(DvalaError)
        expect(() => dvala.run('iso-date->epoch(null)')).toThrow(DvalaError)
        expect(() => dvala.run('iso-date->epoch(true)')).toThrow(DvalaError)
        expect(() => dvala.run('iso-date->epoch("2022-04-1X")')).toThrow(DvalaError)
        expect(() => dvala.run('iso-date->epoch("")')).toThrow(DvalaError)
      })
    })

    describe('!=', () => {
      it('samples', () => {
        expect(dvala.run('1 != 1')).toBe(!dvala.run('1 == 1'))
        expect(dvala.run('1 != 2')).toBe(!dvala.run('1 == 2'))

        expect(dvala.run('!=(1)')).toBe(!dvala.run('==(1)'))
        expect(dvala.run('!=(1, 1)')).toBe(!dvala.run('==(1, 1)'))
        expect(dvala.run('!=(1, 2)')).toBe(!dvala.run('==(1, 2)'))
        expect(dvala.run('!=(1, 2, 1)')).toBe(!dvala.run('==(1, 2, 1)'))
        expect(dvala.run('!=(1, 2, 3)')).toBe(!dvala.run('==(1, 2, 3)'))
        expect(dvala.run('!=("1")')).toBe(!dvala.run('==("1")'))
        expect(dvala.run('!=("1", "1")')).toBe(!dvala.run('==("1", "1")'))
        expect(dvala.run('!=("1", "2")')).toBe(!dvala.run('==("1", "2")'))
        expect(dvala.run('!=("1", "2", "1")')).toBe(!dvala.run('==("1", "2", "1")'))
        expect(dvala.run('!=("1", "2", 3)')).toBe(!dvala.run('==("1", "2", 3)'))
        expect(dvala.run('!=(null, 0)')).toBe(!dvala.run('==(null, 0)'))
        expect(dvala.run('!=(1, true, 3)')).toBe(!dvala.run('==(1, true, 3)'))
        expect(dvala.run('!=(1, false, 3)')).toBe(!dvala.run('==(1, false, 3)'))
        expect(() => dvala.run('!=()')).toThrow(DvalaError)
        expect(dvala.run('!=([1, 2, { a: 10, b: [null]}], [1, 2, { b: [null], a: 10}])')).toBe(!dvala.run('==([1, 2, { a: 10, b: [null]}], [1, 2, { b: [null], a: 10}])'))
        expect(dvala.run('!=([1, 2, { a: 10, b: [null]}], [1, 2, { b: [0], a: 10}])')).toBe(!dvala.run('==([1, 2, { a: 10, b: [null]}], [1, 2, { b: [0], a: 10}])'))
        expect(dvala.run('!=({ a: 10, b: 20}, { b: 20, a: 10})')).toBe(!dvala.run('==({ a: 10, b: 20}, { b: 20, a: 10})'))
        expect(dvala.run('!=([1, true, null], [1, true, null])')).toBe(!dvala.run('==([1, true, null], [1, true, null])'))
        expect(dvala.run('!=({ a: 10, b: [1, 2, { b: 20}]}, { b: [1, 2, { b: 20}], a: 10})')).toBe(!dvala.run('==({ a: 10, b: [1, 2, { b: 20}]}, { b: [1, 2, { b: 20}], a: 10})'))
        expect(dvala.run('!=({ a: 10, b: [1, 2, { b: 20}]}, { b: [1, 2, { b: 21}], a: 10})')).toBe(!dvala.run('==({ a: 10, b: [1, 2, { b: 20}]}, { b: [1, 2, { b: 21}], a: 10})'))
        expect(dvala.run('!=([1, 2, 3], [1, 2, 3, 4])')).toBe(!dvala.run('==([1, 2, 3], [1, 2, 3, 4])'))
        expect(dvala.run('!=({ a: 10}, { a: 10, b: 20})')).toBe(!dvala.run('==({ a: 10}, { a: 10, b: 20})'))
      })
    })

    describe('identical?', () => {
      it('samples', () => {
        expect(dvala.run('1 identical? 1')).toBe(true)
        expect(dvala.run('1 identical? 2')).toBe(false)

        expect(dvala.run('identical?(1, 1)')).toBe(true)
        expect(dvala.run('identical?(1, 2)')).toBe(false)
        expect(dvala.run('identical?("1", "1")')).toBe(true)
        expect(dvala.run('identical?("1", "2")')).toBe(false)
        expect(dvala.run('identical?(null, 0)')).toBe(false)
        expect(dvala.run('identical?([1], [1])')).toBe(false)
        expect(dvala.run('identical?({}, {})')).toBe(false)
        expect(() => dvala.run('identical?()')).toThrow(DvalaError)
      })
    })

    describe('==', () => {
      it('samples', () => {
        expect(dvala.run('1 == 1')).toBe(true)
        expect(dvala.run('1 == 2')).toBe(false)

        expect(dvala.run('==(1)')).toBe(true)
        expect(dvala.run('==(1, 1)')).toBe(true)
        expect(dvala.run('==(1, 2)')).toBe(false)
        expect(dvala.run('==(1, 2, 1)')).toBe(false)
        expect(dvala.run('==(1, 2, 3)')).toBe(false)
        expect(dvala.run('==("1")')).toBe(true)
        expect(dvala.run('==("1", "1")')).toBe(true)
        expect(dvala.run('==("1", "2")')).toBe(false)
        expect(dvala.run('==("1", "2", "1")')).toBe(false)
        expect(dvala.run('==("1", "2", "3")')).toBe(false)
        expect(dvala.run('==("2", "2", "2")')).toBe(true)
        expect(dvala.run('==(1, "2", 3)')).toBe(false)
        expect(dvala.run('==(1, null, 3)')).toBe(false)
        expect(dvala.run('==(1, true, 3)')).toBe(false)
        expect(dvala.run('==(1, false, 3)')).toBe(false)
        expect(dvala.run('==(null, null)')).toBe(true)
        expect(dvala.run('==(true, true)')).toBe(true)
        expect(dvala.run('==(false, false)')).toBe(true)
        expect(dvala.run('==([1, 2, { a: 10, b: [null]}], [1, 2, { b: [null], a: 10}])')).toBe(true)
        expect(dvala.run('==([1, 2, { a: 10, b: [null]}], [1, 2, { b: [0], a: 10}])')).toBe(false)
        expect(dvala.run('==({ a: 10, b: 20}, { b: 20, a: 10})')).toBe(true)
        expect(dvala.run('==([1, true, null], [1, true, null])')).toBe(true)
        expect(dvala.run('==({ a: 10, b: [1, 2, { b: 20}]}, { b: [1, 2, { b: 20}], a: 10})')).toBe(true)
        expect(dvala.run('==({ a: 10, b: [1, 2, { b: 20}]}, { b: [1, 2, { b: 21}], a: 10})')).toBe(false)
        expect(dvala.run('==([1, 2, 3], [1, 2, 3, 4])')).toBe(false)
        expect(dvala.run('==({ a: 10}, { a: 10, b: 20})')).toBe(false)
        expect(() => dvala.run('==()')).toThrow(DvalaError)
      })
    })

    describe('>', () => {
      it('samples', () => {
        expect(dvala.run('1 > 2')).toBe(false)
        expect(dvala.run('1 > 1')).toBe(false)
        expect(dvala.run('2 > 1')).toBe(true)

        expect(dvala.run('>(1)')).toBe(true)
        expect(dvala.run('>(1, 2)')).toBe(false)
        expect(dvala.run('>(1, 1)')).toBe(false)
        expect(dvala.run('>(2, 1)')).toBe(true)
        expect(dvala.run('>(2, 1, 2)')).toBe(false)
        expect(dvala.run('>(2, 1, 0)')).toBe(true)
        expect(dvala.run('>("albert", "ALBERT")')).toBe(true)
        expect(dvala.run('>("ALBERT", "albert")')).toBe(false)
        expect(dvala.run('>("albert", "alber")')).toBe(true)
        expect(dvala.run('>("albert", "albert")')).toBe(false)
        expect(dvala.run('>("alber", "albert")')).toBe(false)

        expect(dvala.run('>("1")')).toBe(true)
        expect(dvala.run('>("1", "2")')).toBe(false)
        expect(dvala.run('>("1", "1")')).toBe(false)
        expect(dvala.run('>("2", "1")')).toBe(true)
        expect(dvala.run('>("2", "1", "2")')).toBe(false)

        expect(() => dvala.run('1 > "a"')).toThrow(DvalaError)
        expect(() => dvala.run('>()')).toThrow(DvalaError)
      })
    })

    describe('<', () => {
      it('samples', () => {
        expect(dvala.run('1 < 2')).toBe(true)
        expect(dvala.run('1 < 1')).toBe(false)
        expect(dvala.run('2 < 1')).toBe(false)

        expect(dvala.run('<(1)')).toBe(true)
        expect(dvala.run('<(1, 2)')).toBe(true)
        expect(dvala.run('<(1, 1)')).toBe(false)
        expect(dvala.run('<(2, 1)')).toBe(false)
        expect(dvala.run('<(1, 2, 1)')).toBe(false)
        expect(dvala.run('<(0, 1, 2)')).toBe(true)
        expect(dvala.run('<("albert", "ALBERT")')).toBe(false)
        expect(dvala.run('<("ALBERT", "albert")')).toBe(true)
        expect(dvala.run('<("albert", "alber")')).toBe(false)
        expect(dvala.run('<("albert", "albert")')).toBe(false)
        expect(dvala.run('<("alber", "albert")')).toBe(true)

        expect(dvala.run('<("1")')).toBe(true)
        expect(dvala.run('<("1", "2")')).toBe(true)
        expect(dvala.run('<("1", "1")')).toBe(false)
        expect(dvala.run('<("2", "1")')).toBe(false)
        expect(dvala.run('<("1", "2", "1")')).toBe(false)

        expect(() => dvala.run('1 < "a"')).toThrow(DvalaError)
        expect(() => dvala.run('<()')).toThrow(DvalaError)
      })
    })

    describe('>=', () => {
      it('samples', () => {
        expect(dvala.run('1 >= 2')).toBe(false)
        expect(dvala.run('1 >= 1')).toBe(true)
        expect(dvala.run('2 >= 1')).toBe(true)

        expect(dvala.run('>=(1)')).toBe(true)
        expect(dvala.run('>=(1, 2)')).toBe(false)
        expect(dvala.run('>=(1, 1)')).toBe(true)
        expect(dvala.run('>=(2, 1)')).toBe(true)
        expect(dvala.run('>=(2, 1, 2)')).toBe(false)
        expect(dvala.run('>=(2, 1, 1)')).toBe(true)
        expect(dvala.run('>=("albert", "ALBERT")')).toBe(true)
        expect(dvala.run('>=("ALBERT", "albert")')).toBe(false)
        expect(dvala.run('>=("albert", "alber")')).toBe(true)
        expect(dvala.run('>=("albert", "albert")')).toBe(true)
        expect(dvala.run('>=("alber", "albert")')).toBe(false)

        expect(dvala.run('>=("1")')).toBe(true)
        expect(dvala.run('>=("1", "2")')).toBe(false)
        expect(dvala.run('>=("1", "1")')).toBe(true)
        expect(dvala.run('>=("2", "1")')).toBe(true)
        expect(dvala.run('>=("2", "1", "2")')).toBe(false)
        expect(dvala.run('>=("2", "1", "1")')).toBe(true)

        expect(() => dvala.run('>=()')).toThrow(DvalaError)
      })
    })

    describe('<=', () => {
      it('samples', () => {
        expect(dvala.run('1 <= 2')).toBe(true)
        expect(dvala.run('1 <= 1')).toBe(true)
        expect(dvala.run('2 <= 1')).toBe(false)

        expect(dvala.run('<=(1)')).toBe(true)
        expect(dvala.run('<=(1, 2)')).toBe(true)
        expect(dvala.run('<=(1, 1)')).toBe(true)
        expect(dvala.run('<=(2, 1)')).toBe(false)
        expect(dvala.run('<=(1, 2, 1)')).toBe(false)
        expect(dvala.run('<=(1, 2, 2)')).toBe(true)
        expect(dvala.run('<=("albert", "ALBERT")')).toBe(false)
        expect(dvala.run('<=("ALBERT", "albert")')).toBe(true)
        expect(dvala.run('<=("albert", "alber")')).toBe(false)
        expect(dvala.run('<=("albert", "albert")')).toBe(true)
        expect(dvala.run('<=("alber", "albert")')).toBe(true)

        expect(dvala.run('<=("1")')).toBe(true)
        expect(dvala.run('<=("1", "2")')).toBe(true)
        expect(dvala.run('<=("1", "1")')).toBe(true)
        expect(dvala.run('<=("2", "1")')).toBe(false)
        expect(dvala.run('<=("1", "2", "1")')).toBe(false)
        expect(dvala.run('<=("1", "2", "2")')).toBe(true)

        expect(() => dvala.run('<=()')).toThrow(DvalaError)
      })
    })

    describe('not', () => {
      it('samples', () => {
        expect(dvala.run('not(0)')).toBe(true)
        expect(dvala.run('not("")')).toBe(true)
        expect(dvala.run('not("0")')).toBe(false)
        expect(dvala.run('not(1)')).toBe(false)
        expect(dvala.run('not(-1)')).toBe(false)
        expect(dvala.run('not([])')).toBe(false)
        expect(dvala.run('not(false)')).toBe(true)
        expect(dvala.run('not(true)')).toBe(false)
        expect(dvala.run('not(null)')).toBe(true)
        expect(() => dvala.run('not(0, 1)')).toThrow(DvalaError)
        expect(() => dvala.run('not()')).toThrow(DvalaError)
      })
    })

    describe('boolean', () => {
      it('samples', () => {
        expect(dvala.run('boolean(0)')).toBe(false)
        expect(dvala.run('boolean(1)')).toBe(true)
        expect(dvala.run('boolean("Albert")')).toBe(true)
        expect(dvala.run('boolean("")')).toBe(false)
        expect(dvala.run('boolean(true)')).toBe(true)
        expect(dvala.run('boolean(false)')).toBe(false)
        expect(dvala.run('boolean(null)')).toBe(false)
        expect(dvala.run('boolean([])')).toBe(true)
        expect(dvala.run('boolean({})')).toBe(true)
        expect(() => dvala.run('boolean()')).toThrow(DvalaError)
        expect(() => dvala.run('boolean(2, 3)')).toThrow(DvalaError)
      })
    })

    describe('compare', () => {
      it('samples', () => {
        expect(dvala.run('compare(0, 1)')).toBe(-1)
        expect(dvala.run('compare(3, 1)')).toBe(1)
        expect(dvala.run('compare("A", "a")')).toBe(-1)
        expect(dvala.run('compare("A", "A")')).toBe(0)
      })
    })

    describe('json-stringify', () => {
      it('samples', () => {
        expect(dvala.run('json-stringify({ a: 10, b: 20})')).toBe('{"a":10,"b":20}')
        expect(dvala.run('json-stringify({ a: 10, b: 20}, 2)')).toBe('{\n  "a": 10,\n  "b": 20\n}')
      })
    })
    describe('json-parse', () => {
      it('samples', () => {
        expect(dvala.run('json-parse("[1,2,3]")')).toEqual([1, 2, 3])
      })
    })

    describe('import', () => {
      it('should throw for unknown entire module', () => {
        expect(() => dvala.run('import(UnknownModule)')).toThrow(DvalaError)
      })
    })
  }
})
