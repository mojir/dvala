import { describe, expect, it } from 'vitest'
import { Dvala } from '../../../src/Dvala/Dvala'
import { DvalaError } from '../../../src/errors'
import { stringUtilsModule } from '../../../src/builtin/modules/string'

describe('string functions', () => {
  for (const dvala of [new Dvala({}), new Dvala({ debug: true })]) {
    describe('str', () => {
      it('samples', () => {
        expect(dvala.run('str({})')).toBe('{}')
        expect(dvala.run('str(x)', { bindings: { x: null } })).toBe('')
        expect(dvala.run('str()')).toBe('')
        expect(dvala.run('str("")')).toBe('')
        expect(dvala.run('str("1")')).toBe('1')
        expect(dvala.run('str("1", "2")')).toBe('12')
        expect(dvala.run('str("1", "2", "three", "4")')).toBe('12three4')
        expect(dvala.run('str(0)')).toBe('0')
        expect(dvala.run('str(true)')).toBe('true')
        expect(dvala.run('str("1", false)')).toBe('1false')
        expect(dvala.run('str(null, "m")')).toBe('m')
        expect(dvala.run('str(null)')).toBe('')
        expect(dvala.run('str([])')).toBe('[]')
        expect(dvala.run('str([1, 2, 3])')).toBe('[1,2,3]')
        expect(dvala.run('str({a: 1})')).toBe('{"a":1}')
      })

      it('regressions', () => {
        expect(dvala.run('str(")")')).toBe(')')
      })
    })

    describe('number', () => {
      it('samples', () => {
        expect(dvala.run('number("123.25")')).toBe(123.25)
        expect(dvala.run('number("0b1111")')).toBe(15)
        expect(dvala.run('number("0Xf")')).toBe(15)
        expect(dvala.run('number("0o17")')).toBe(15)
        expect(dvala.run('number("-0.125")')).toBe(-0.125)
        expect(() => dvala.run('number()')).toThrow(DvalaError)
        expect(() => dvala.run('number("987", "65")')).toThrow(DvalaError)
        expect(() => dvala.run('number("non parsable number")')).toThrow(DvalaError)
      })
    })

    describe('lower-case', () => {
      it('samples', () => {
        expect(dvala.run('lower-case("Albert!")')).toBe('albert!')
        expect(dvala.run('lower-case("")')).toBe('')
        expect(() => dvala.run('lower-case()')).toThrow(DvalaError)
        expect(() => dvala.run('lower-case("First", "Second")')).toThrow(DvalaError)
      })
    })

    describe('upper-case', () => {
      it('samples', () => {
        expect(dvala.run('upper-case("Albert!")')).toBe('ALBERT!')
        expect(dvala.run('upper-case("")')).toBe('')
        expect(() => dvala.run('upper-case()')).toThrow(DvalaError)
        expect(() => dvala.run('upper-case("First", "Second")')).toThrow(DvalaError)
      })
    })

    describe('trim', () => {
      it('samples', () => {
        expect(dvala.run('trim("  Albert!  ")')).toBe('Albert!')
        expect(dvala.run('trim(" ")')).toBe('')
        expect(dvala.run('trim("")')).toBe('')
        expect(() => dvala.run('trim()')).toThrow(DvalaError)
        expect(() => dvala.run('trim("First", "Second")')).toThrow(DvalaError)
      })
    })

    describe('blank?', () => {
      it('samples', () => {
        expect(dvala.run('blank?("")')).toBe(true)
        expect(dvala.run('blank?(" ")')).toBe(true)
        expect(dvala.run('blank?("\n")')).toBe(true)
        expect(dvala.run('blank?("  ")')).toBe(true)
        expect(dvala.run('blank?("  a")')).toBe(false)
        expect(dvala.run('blank?("a  ")')).toBe(false)
        expect(dvala.run('blank?(" a ")')).toBe(false)
        expect(dvala.run('blank?(" a b ")')).toBe(false)
        expect(dvala.run('blank?(null)')).toBe(true)
        expect(() => dvala.run('blank?(true)')).toThrow(DvalaError)
        expect(() => dvala.run('blank?(false)')).toThrow(DvalaError)
        expect(() => dvala.run('blank?(0)')).toThrow(DvalaError)
        expect(() => dvala.run('blank?([])')).toThrow(DvalaError)
        expect(() => dvala.run('blank?({})')).toThrow(DvalaError)
        expect(() => dvala.run('blank?()')).toThrow(DvalaError)
        expect(() => dvala.run('blank?("a", "b")')).toThrow(DvalaError)
      })
    })
  }
})

describe('string-Utils module functions', () => {
  const imp = 'let su = import(string); '
  for (const dvala of [new Dvala({ modules: [stringUtilsModule] }), new Dvala({ modules: [stringUtilsModule], debug: true })]) {
    describe('trim-left', () => {
      it('samples', () => {
        expect(dvala.run(`${imp}su.trim-left("  Albert!  ")`)).toBe('Albert!  ')
        expect(dvala.run(`${imp}su.trim-left(" ")`)).toBe('')
        expect(dvala.run(`${imp}su.trim-left("")`)).toBe('')
        expect(() => dvala.run(`${imp}su.trim-left()`)).toThrow(DvalaError)
        expect(() => dvala.run(`${imp}su.trim-left("First", "Second")`)).toThrow(DvalaError)
      })
    })

    describe('trim-right', () => {
      it('samples', () => {
        expect(dvala.run(`${imp}su.trim-right("  Albert!  ")`)).toBe('  Albert!')
        expect(dvala.run(`${imp}su.trim-right(" ")`)).toBe('')
        expect(dvala.run(`${imp}su.trim-right("")`)).toBe('')
        expect(() => dvala.run(`${imp}su.trim-right()`)).toThrow(DvalaError)
        expect(() => dvala.run(`${imp}su.trim-right("First", "Second")`)).toThrow(DvalaError)
      })
    })

    describe('pad-left', () => {
      it('samples', () => {
        expect(dvala.run(`${imp}su.pad-left("Albert", 10)`)).toBe('    Albert')
        expect(dvala.run(`${imp}su.pad-left("Albert", 10, "*")`)).toBe('****Albert')
        expect(dvala.run(`${imp}su.pad-left("Albert", 10, "123")`)).toBe('1231Albert')
        expect(dvala.run(`${imp}su.pad-left("Albert", 5)`)).toBe('Albert')
        expect(dvala.run(`${imp}su.pad-left("Albert", -1)`)).toBe('Albert')
        expect(() => dvala.run(`${imp}su.pad-left()`)).toThrow(DvalaError)
        expect(() => dvala.run(`${imp}su.pad-left("First", "Second")`)).toThrow(DvalaError)
      })
    })

    describe('pad-right', () => {
      it('samples', () => {
        expect(dvala.run(`${imp}su.pad-right("Albert", 10)`)).toBe('Albert    ')
        expect(dvala.run(`${imp}su.pad-right("Albert", 10, "*")`)).toBe('Albert****')
        expect(dvala.run(`${imp}su.pad-right("Albert", 10, "123")`)).toBe('Albert1231')
        expect(dvala.run(`${imp}su.pad-right("Albert", 5)`)).toBe('Albert')
        expect(dvala.run(`${imp}su.pad-right("Albert", -1)`)).toBe('Albert')
        expect(() => dvala.run(`${imp}su.pad-right()`)).toThrow(DvalaError)
        expect(() => dvala.run(`${imp}su.pad-right("First", "Second")`)).toThrow(DvalaError)
      })
    })

    describe('split-lines', () => {
      it('samples', () => {
        expect(dvala.run(`${imp}su.split-lines("Albert\\nMojir")`)).toEqual(['Albert', 'Mojir'])
        expect(dvala.run(`${imp}su.split-lines("Albert\\nMojir\\n")`)).toEqual(['Albert', 'Mojir'])
        expect(dvala.run(`${imp}su.split-lines("\\n\\nAlbert\\n\\n\\nMojir\\n")`)).toEqual(['Albert', 'Mojir'])
      })
    })

    describe('string-repeat', () => {
      it('samples', () => {
        expect(dvala.run(`${imp}su.string-repeat("*", 10)`)).toBe('**********')
        expect(dvala.run(`${imp}su.string-repeat("*", 0)`)).toBe('')
        expect(dvala.run(`${imp}su.string-repeat("Hello, ", 3)`)).toBe('Hello, Hello, Hello, ')
        expect(() => dvala.run(`${imp}su.string-repeat()`)).toThrow(DvalaError)
        expect(() => dvala.run(`${imp}su.string-repeat("Hello, ")`)).toThrow(DvalaError)
        expect(() => dvala.run(`${imp}su.string-repeat("Hello, ", 3, 3)`)).toThrow(DvalaError)
        expect(() => dvala.run(`${imp}su.string-repeat("Hello, ", "3")`)).toThrow(DvalaError)
        expect(() => dvala.run(`${imp}su.string-repeat(true, 1)`)).toThrow(DvalaError)
      })
    })

    describe('template', () => {
      it('samples', () => {
        expect(dvala.run(`${imp}su.template("Hi")`)).toBe('Hi')
        expect(dvala.run(`${imp}su.template("Hi", "Carl")`)).toBe('Hi')
        expect(dvala.run(`${imp}su.template("Hi, $1", "Carl")`)).toBe('Hi, Carl')
        expect(dvala.run(`${imp}su.template("Hi, $$$1", "Carl")`)).toBe('Hi, $Carl')
        expect(dvala.run(`${imp}su.template("Hi, $$1", "Carl")`)).toBe('Hi, $1')
        expect(dvala.run(`${imp}su.template("Hi, $1", "Carl")`)).toBe('Hi, Carl')
        expect(dvala.run(`${imp}su.template("Hi, $1", "Carl", "Larry")`)).toBe('Hi, Carl')
        expect(dvala.run(`${imp}su.template("Hi, $1 and $2", "Carl", "Larry")`)).toBe('Hi, Carl and Larry')
        expect(dvala.run(`${imp}su.template("Hi, $1 and $3", "Carl", "Larry", "Sofi")`)).toBe('Hi, Carl and Sofi')
        expect(dvala.run(`${imp}su.template("$1", "Carl")`)).toBe('Carl')
        expect(dvala.run(`${imp}su.template("$$1", "Carl")`)).toBe('$1')
        expect(dvala.run(`${imp}su.template("$$$1", "Carl")`)).toBe('$Carl')
        expect(dvala.run(`${imp}su.template("Hi $1, $2, $3, $4, $5, $6, $7, $8 and $9", "A", "B", "C", "D", "E", "F", "G", "H", "I")`)).toBe(
          'Hi A, B, C, D, E, F, G, H and I',
        )
        expect(() =>
          dvala.run(`${imp}su.template("Hi $1, $2, $3, $4, $5, $6, $7, $8 and $9", "A", "B", "C", "D", "E", "F", "G", "H")`),
        ).toThrow()
        expect(dvala.run(`${imp}su.template("Hi $1, $2, $3, $4, $5, $6, $7, $8, $9 and $10", "A", "B", "C", "D", "E", "F", "G", "H", "I")`)).toBe(
          'Hi A, B, C, D, E, F, G, H, I and A0',
        )
        expect(dvala.run(`${imp}su.template("$1", 0)`)).toBe('0')
        expect(() =>
          dvala.run(`${imp}su.template("Hi $1, $2, $3, $4, $5, $6, $7, $8, $9 $10", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J")`),
        ).toThrow()
        expect(() => dvala.run(`${imp}su.template()`)).toThrow(DvalaError)
        expect(() => dvala.run(`${imp}su.template("$1", true)`)).toThrow(DvalaError)
        expect(() => dvala.run(`${imp}su.template("$1", false)`)).toThrow(DvalaError)
        expect(() => dvala.run(`${imp}su.template("$1", null)`)).toThrow(DvalaError)
        expect(() => dvala.run(`${imp}su.template("$1", undefined)`)).toThrow(DvalaError)
        expect(() => dvala.run(`${imp}su.template("$1", [])`)).toThrow(DvalaError)
        expect(() => dvala.run(`${imp}su.template("$1", object())`)).toThrow(DvalaError)
        expect(() => dvala.run(`${imp}su.template(true)`)).toThrow(DvalaError)
        expect(() => dvala.run(`${imp}su.template(false)`)).toThrow(DvalaError)
        expect(() => dvala.run(`${imp}su.template(null)`)).toThrow(DvalaError)
        expect(() => dvala.run(`${imp}su.template(undefined)`)).toThrow(DvalaError)
        expect(() => dvala.run(`${imp}su.template(1)`)).toThrow(DvalaError)
        expect(() => dvala.run(`${imp}su.template([]`)).toThrow(DvalaError)
        expect(() => dvala.run(`${imp}su.template(object())`)).toThrow(DvalaError)
      })
      it('pluralization samples', () => {
        expect(dvala.run(`${imp}su.template("", 0)`)).toBe('')
        expect(dvala.run(`${imp}su.template("$1 book||||$1 books", 0)`)).toBe('0 books')
        expect(dvala.run(`${imp}su.template("$1 book||||$1 books", 1)`)).toBe('1 book')
        expect(dvala.run(`${imp}su.template("$1 book||||$1 books", 2)`)).toBe('2 books')
        expect(dvala.run(`${imp}su.template("No books||||$1 book||||$1 books", 0)`)).toBe('No books')
        expect(dvala.run(`${imp}su.template("No books||||$1 book||||$1 books", 1)`)).toBe('1 book')
        expect(dvala.run(`${imp}su.template("No books||||$1 book||||$1 books", 3)`)).toBe('3 books')
        expect(dvala.run(`${imp}su.template("No books||||One book||||Two books||||Three books||||$1 books", 0)`)).toBe('No books')
        expect(dvala.run(`${imp}su.template("No books||||One book||||Two books||||Three books||||$1 books", 1)`)).toBe('One book')
        expect(dvala.run(`${imp}su.template("No books||||One book||||Two books||||Three books||||$1 books", 2)`)).toBe(
          'Two books',
        )
        expect(dvala.run(`${imp}su.template("No books||||One book||||Two books||||Three books||||$1 books", 3)`)).toBe(
          'Three books',
        )
        expect(dvala.run(`${imp}su.template("No books||||One book||||Two books||||Three books||||$1 books", 4)`)).toBe('4 books')
        expect(dvala.run(`${imp}su.template("No books||||One book||||Two books||||Three books||||$1 books", 14)`)).toBe(
          '14 books',
        )
        expect(() => dvala.run(`${imp}su.template("No books||||$1 book||||$1 books||||$1books", -3)`)).toThrow(DvalaError)
        expect(() => dvala.run(`${imp}su.template("$1 book||||$1 books")`)).toThrow(DvalaError)
        expect(() => dvala.run(`${imp}su.template("$1 book||||$1 books", "1")`)).toThrow(DvalaError)
        expect(() => dvala.run(`${imp}su.template("$1 book||||$1 books||||$1 chairs", )`)).toThrow(DvalaError)
        expect(dvala.run(`${imp}su.template("$2 got $1 book||||$2 got $1 books", 1, "Carl")`)).toBe('Carl got 1 book')
        expect(dvala.run(`${imp}su.template("$2 got $1 book||||$2 got $1 books", 2, "Carl")`)).toBe('Carl got 2 books')
      })
    })

    describe('to-char-code', () => {
      it('samples', () => {
        expect(dvala.run(`${imp}su.to-char-code("a")`)).toBe(97)
        expect(dvala.run(`${imp}su.to-char-code("abc")`)).toBe(97)
        expect(() => dvala.run(`${imp}su.to-char-code()`)).toThrow(DvalaError)
        expect(() => dvala.run(`${imp}su.to-char-code("A" "B")`)).toThrow(DvalaError)
      })
    })

    describe('from-char-code', () => {
      it('samples', () => {
        expect(dvala.run(`${imp}su.from-char-code(97)`)).toBe('a')
        expect(() => dvala.run(`${imp}su.from-char-code(9700000)`)).toThrow(DvalaError)
        expect(() => dvala.run(`${imp}su.from-char-code()`)).toThrow(DvalaError)
        expect(() => dvala.run(`${imp}su.from-char-code(65, 66)`)).toThrow(DvalaError)
      })
    })

    describe('encode-base64', () => {
      it('samples', () => {
        expect(dvala.run(`${imp}su.encode-base64("Albert")`)).toBe('QWxiZXJ0')
        expect(dvala.run(`${imp}su.encode-base64("Albert is a 🐻")`)).toBe('QWxiZXJ0IGlzIGEg8J+Quw==')
        expect(() => dvala.run(`${imp}su.encode-base64()`)).toThrow(DvalaError)
        expect(() => dvala.run(`${imp}su.encode-base64("X" "Y")`)).toThrow(DvalaError)
      })
    })

    describe('decode-base64', () => {
      it('samples', () => {
        expect(dvala.run(`${imp}su.decode-base64("QWxiZXJ0")`)).toBe('Albert')
        expect(dvala.run(`${imp}su.decode-base64("QWxiZXJ0IGlzIGEg8J+Quw==")`)).toBe('Albert is a 🐻')
        expect(() => dvala.run(`${imp}su.decode-base64("Illegal string ~")`)).toThrow(DvalaError)
        expect(() => dvala.run(`${imp}su.decode-base64()`)).toThrow(DvalaError)
        expect(() => dvala.run(`${imp}su.decode-base64("X" "Y")`)).toThrow(DvalaError)
      })
    })

    describe('encode-uri-component', () => {
      it('samples', () => {
        expect(dvala.run(`${imp}su.encode-uri-component("a string")`)).toBe('a%20string')
        expect(() => dvala.run(`${imp}su.encode-uri-component()`)).toThrow(DvalaError)
        expect(() => dvala.run(`${imp}su.encode-uri-component("X" "Y")`)).toThrow(DvalaError)
      })
    })

    describe('decode-uri-component', () => {
      it('samples', () => {
        expect(dvala.run(`${imp}su.decode-uri-component("a%20string")`)).toBe('a string')
        expect(() => dvala.run(`${imp}su.decode-uri-component("a%AFc")`)).toThrow(DvalaError)
        expect(() => dvala.run(`${imp}su.decode-uri-component()`)).toThrow(DvalaError)
        expect(() => dvala.run(`${imp}su.decode-uri-component("X" "Y")`)).toThrow(DvalaError)
      })
    })

    describe('capitalize', () => {
      it('samples', () => {
        expect(dvala.run(`${imp}su.capitalize("albert")`)).toBe('Albert')
        expect(dvala.run(`${imp}su.capitalize("Albert")`)).toBe('Albert')
        expect(dvala.run(`${imp}su.capitalize("ALBERT")`)).toBe('Albert')
        expect(dvala.run(`${imp}su.capitalize("")`)).toBe('')
        expect(() => dvala.run(`${imp}su.capitalize()`)).toThrow(DvalaError)
        expect(() => dvala.run(`${imp}su.capitalize("First", "Second")`)).toThrow(DvalaError)
      })
    })
  }
})
