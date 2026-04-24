import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../src/createDvala'
import { regexpEquals } from '../../testUtils'
import { DvalaError } from '../../../src/errors'

describe('regexp functions', () => {
  for (const dvala of [createDvala(), createDvala({ debug: true })]) {
    describe('regexp', () => {
      it('samples', () => {
        expect(regexpEquals(dvala.run('regexp("^abc$")'), /^abc$/)).toBe(true)
        expect(regexpEquals(dvala.run('#"^abc$"'), /^abc$/)).toBe(true)
        expect(regexpEquals(dvala.run('regexp("^abc$", "gi")'), /^abc$/gi)).toBe(true)
        expect(regexpEquals(dvala.run('regexp("^abc$", "ig")'), /^abc$/gi)).toBe(true)

        expect(regexpEquals(dvala.run('regexp("")'), new RegExp(''))).toBe(true)
        expect(() => dvala.run('regexp("(")')).toThrow(DvalaError)
        expect(() => dvala.run('regexp()')).toThrow(DvalaError)
        expect(() => dvala.run('regexp(1)')).toThrow(DvalaError)
        expect(() => dvala.run('regexp(null)')).toThrow(DvalaError)
        expect(() => dvala.run('regexp(undefined)')).toThrow(DvalaError)
        expect(() => dvala.run('regexp(true)')).toThrow(DvalaError)
        expect(() => dvala.run('regexp(false)')).toThrow(DvalaError)
        expect(() => dvala.run('regexp([])')).toThrow(DvalaError)
        expect(() => dvala.run('regexp(object())')).toThrow(DvalaError)
        expect(() => dvala.run('regexp("" "ab")')).toThrow(DvalaError)
        expect(() => dvala.run('regexp("abc" "g" "extra")')).toThrow(DvalaError)
      })

      it('email regexp', () => {
        expect(
          dvala.run(
            `
          let isEmail = (string) -> do
            reMatch(
              string,
              #"^(?:[a-z0-9!#$%&'*+/=?^_\`{|}~-]+(?:\\.[a-z0-9!#$%&'*+/=?^_\`{|}~-]+)*|'(?:[\\x01-\\x08\\x0b\\x0c\\x0e-\\x1f\\x21\\x23-\\x5b\\x5d-\\x7f]|\\\\[\\x01-\\x09\\x0b\\x0c\\x0e-\\x7f])*')@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\\x01-\\x08\\x0b\\x0c\\x0e-\\x1f\\x21-\\x5a\\x53-\\x7f]|\\\\[\\x01-\\x09\\x0b\\x0c\\x0e-\\x7f])+)\\])$") != null
          end;
          isEmail("albert.mojir@gmail.com");
          `,
          ),
        ).toBe(true)
      })
      it('regexp mathcing .', () => {
        expect(
          dvala.run(
            `
          let isDot = (string) -> do
            reMatch(string, #"^\\.$") != null
          end;
          [isDot("."), isDot(",")];
          `,
          ),
        ).toEqual([true, false])
      })
    })

    describe('reMatch', () => {
      it('samples', () => {
        expect(dvala.run('reMatch("abc", regexp("^abc$"))')).toEqual(['abc'])
        expect(dvala.run('reMatch("abx", regexp("^abc$"))')).toBeNull()
        expect(dvala.run('reMatch("abc", regexp("^(a)bc$"))')).toEqual(['abc', 'a'])
        expect(dvala.run('reMatch("abc", regexp("^(A)BC$", "i"))')).toEqual(['abc', 'a'])
        expect(dvala.run('reMatch(null, regexp("^abc$"))')).toBeNull()
        expect(dvala.run('reMatch(1, regexp("^abc$"))')).toBeNull()
        expect(dvala.run('reMatch(true, regexp("^abc$"))')).toBeNull()
        expect(dvala.run('reMatch(false, regexp("^abc$"))')).toBeNull()
        expect(dvala.run('reMatch([], regexp("^abc$"))')).toBeNull()
        expect(dvala.run('reMatch(object(), regexp("^abc$"))')).toBeNull()

        expect(() => dvala.run('reMatch(regexp("^abc$"))')).toThrow(DvalaError)
        expect(() => dvala.run('reMatch("asd")')).toThrow(DvalaError)
        expect(() => dvala.run('reMatch("x" regexp("^abc$") "x")')).toThrow(DvalaError)
      })
    })

    describe('replaceAll', () => {
      it('samples', () => {
        expect(dvala.run('replaceAll("abcabcABCABC", "abc", "ABC")')).toEqual('ABCABCABCABC')
        expect(dvala.run('replaceAll("abcabcABCABC", regexp("^abc"), "ABC")')).toEqual('ABCabcABCABC')
        expect(dvala.run('replaceAll("abcabcABCABC", regexp("a"), "A")')).toEqual('AbcAbcABCABC')
        expect(dvala.run('replaceAll("abcabcABCABC", regexp("a", "g"), "A")')).toEqual('AbcAbcABCABC')
        expect(dvala.run('replaceAll("abcabcABCABC", regexp("a", "gi"), "-")')).toEqual('-bc-bc-BC-BC')
        expect(() => dvala.run('replaceAll("abcabcABCABC", regexp("^abc$"), 1)')).toThrow(DvalaError)
        expect(() => dvala.run('replaceAll("abcabcABCABC", regexp("^abc$"), null)')).toThrow(DvalaError)
        expect(() => dvala.run('replaceAll("abcabcABCABC", regexp("^abc$"), true)')).toThrow(DvalaError)
        expect(() => dvala.run('replaceAll("abcabcABCABC", regexp("^abc$"), false)')).toThrow(DvalaError)
        expect(() => dvala.run('replaceAll("abcabcABCABC", regexp("^abc$"), [])')).toThrow(DvalaError)
        expect(() => dvala.run('replaceAll("abcabcABCABC", regexp("^abc$"), {})')).toThrow(DvalaError)
      })
    })
    describe('replace', () => {
      it('samples', () => {
        expect(dvala.run('replace("abcabcABCABC", "abc", "ABC")')).toEqual('ABCabcABCABC')
        expect(dvala.run('replace("abcabcABCABC", regexp("^abc"), "ABC")')).toEqual('ABCabcABCABC')
        expect(dvala.run('replace("abcabcABCABC", regexp("a"), "A")')).toEqual('AbcabcABCABC')
        expect(dvala.run('replace("abcabcABCABC", regexp("a", "g"), "A")')).toEqual('AbcAbcABCABC')
        expect(dvala.run('replace("abcabcABCABC", regexp("a", "gi"), "-")')).toEqual('-bc-bc-BC-BC')
        expect(() => dvala.run('replace("abcabcABCABC", regexp("^abc$") 1)')).toThrow(DvalaError)
        expect(() => dvala.run('replace("abcabcABCABC", regexp("^abc$") null)')).toThrow(DvalaError)
        expect(() => dvala.run('replace("abcabcABCABC", regexp("^abc$") undefined)')).toThrow(DvalaError)
        expect(() => dvala.run('replace("abcabcABCABC", regexp("^abc$") true)')).toThrow(DvalaError)
        expect(() => dvala.run('replace("abcabcABCABC", regexp("^abc$") false)')).toThrow(DvalaError)
        expect(() => dvala.run('replace("abcabcABCABC", regexp("^abc$") [])')).toThrow(DvalaError)
        expect(() => dvala.run('replace("abcabcABCABC", regexp("^abc$") object())')).toThrow(DvalaError)
      })
    })
  }
})
