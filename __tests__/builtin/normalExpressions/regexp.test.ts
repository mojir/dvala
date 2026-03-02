import { describe, expect, it } from 'vitest'
import { Dvala } from '../../../src/Dvala/Dvala'
import { regexpEquals } from '../../testUtils'
import { DvalaError } from '../../../src/errors'

describe('regexp functions', () => {
  for (const dvala of [new Dvala(), new Dvala({ debug: true })]) {
    describe('regexp', () => {
      it('samples', () => {
        expect(regexpEquals(dvala.run('regexp("^abc$")'), /^abc$/)).toBe(true)
        expect(regexpEquals(dvala.run('#"^abc$"'), /^abc$/)).toBe(true)
        expect(regexpEquals(dvala.run('regexp("^abc$", "gi")'), /^abc$/gi)).toBe(true)
        expect(regexpEquals(dvala.run('regexp("^abc$", "ig")'), /^abc$/gi)).toBe(true)
        // eslint-disable-next-line prefer-regex-literals
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
          let email? = (string) -> do
            boolean(
              re-match(
                string,
                #"^(?:[a-z0-9!#$%&'*+/=?^_\`{|}~-]+(?:\\.[a-z0-9!#$%&'*+/=?^_\`{|}~-]+)*|'(?:[\\x01-\\x08\\x0b\\x0c\\x0e-\\x1f\\x21\\x23-\\x5b\\x5d-\\x7f]|\\\\[\\x01-\\x09\\x0b\\x0c\\x0e-\\x7f])*')@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\\x01-\\x08\\x0b\\x0c\\x0e-\\x1f\\x21-\\x5a\\x53-\\x7f]|\\\\[\\x01-\\x09\\x0b\\x0c\\x0e-\\x7f])+)\\])$"))
          end;
          email?("albert.mojir@gmail.com");
          `,
          ),
        ).toBe(true)
      })
      it('regexp mathcing .', () => {
        expect(
          dvala.run(
            `
          let dot? = (string) -> do
            boolean(re-match(string, #"^\\.$"))
          end;
          [dot?("."), dot?(",")];
          `,
          ),
        ).toEqual([true, false])
      })
    })

    describe('re-match', () => {
      it('samples', () => {
        expect(dvala.run('re-match("abc", regexp("^abc$"))')).toEqual(['abc'])
        expect(dvala.run('re-match("abx", regexp("^abc$"))')).toBeNull()
        expect(dvala.run('re-match("abc", regexp("^(a)bc$"))')).toEqual(['abc', 'a'])
        expect(dvala.run('re-match("abc", regexp("^(A)BC$", "i"))')).toEqual(['abc', 'a'])
        expect(dvala.run('re-match(null, regexp("^abc$"))')).toBeNull()
        expect(dvala.run('re-match(1, regexp("^abc$"))')).toBeNull()
        expect(dvala.run('re-match(true, regexp("^abc$"))')).toBeNull()
        expect(dvala.run('re-match(false, regexp("^abc$"))')).toBeNull()
        expect(dvala.run('re-match([], regexp("^abc$"))')).toBeNull()
        expect(dvala.run('re-match(object(), regexp("^abc$"))')).toBeNull()

        expect(() => dvala.run('re-match(regexp("^abc$"))')).toThrow(DvalaError)
        expect(() => dvala.run('re-match("asd")')).toThrow(DvalaError)
        expect(() => dvala.run('re-match("x" regexp("^abc$") "x")')).toThrow(DvalaError)
      })
    })

    describe('replace-all', () => {
      it('samples', () => {
        expect(dvala.run('replace-all("abcabcABCABC", "abc", "ABC")')).toEqual('ABCABCABCABC')
        expect(dvala.run('replace-all("abcabcABCABC", regexp("^abc"), "ABC")')).toEqual('ABCabcABCABC')
        expect(dvala.run('replace-all("abcabcABCABC", regexp("a"), "A")')).toEqual('AbcAbcABCABC')
        expect(dvala.run('replace-all("abcabcABCABC", regexp("a", "g"), "A")')).toEqual('AbcAbcABCABC')
        expect(dvala.run('replace-all("abcabcABCABC", regexp("a", "gi"), "-")')).toEqual('-bc-bc-BC-BC')
        expect(() => dvala.run('replace-all("abcabcABCABC", regexp("^abc$"), 1)')).toThrow(DvalaError)
        expect(() => dvala.run('replace-all("abcabcABCABC", regexp("^abc$"), null)')).toThrow(DvalaError)
        expect(() => dvala.run('replace-all("abcabcABCABC", regexp("^abc$"), true)')).toThrow(DvalaError)
        expect(() => dvala.run('replace-all("abcabcABCABC", regexp("^abc$"), false)')).toThrow(DvalaError)
        expect(() => dvala.run('replace-all("abcabcABCABC", regexp("^abc$"), [])')).toThrow(DvalaError)
        expect(() => dvala.run('replace-all("abcabcABCABC", regexp("^abc$"), {})')).toThrow(DvalaError)
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
