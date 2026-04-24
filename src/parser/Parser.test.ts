import { describe, expect, it, test } from 'vitest'
import { createDvala } from '../createDvala'
import { getUndefinedSymbols, parseTokenStream, tokenizeSource } from '../tooling'
import { NodeTypes } from '../constants/constants'
import { DvalaError, MatchError } from '../errors'
import { mathUtilsModule } from '../builtin/modules/math'

const dvala = createDvala()
const dvalaDebug = createDvala({ debug: true })
const dvalaWithMathUtils = createDvala({ modules: [mathUtilsModule] })

describe('parser', () => {
  describe('reserved symbol _', () => {
    it('should parse reserved symbol _', () => {
      const result = parseTokenStream(tokenizeSource('as'))
      expect(result.body).toHaveLength(1)
      expect(result.body[0]![0]).toBe(NodeTypes.Reserved)
      expect(result.body[0]![1]).toBe('as')
      expect(result.sourceMap).toBeUndefined()
    })
    expect(() => dvala.run('_')).toThrow(DvalaError)
    expect(() => dvala.run('let _ = 1;')).toThrow(DvalaError)
  })
  describe('const E', () => {
    it('samples', () => {
      expect(dvala.run('E')).toBe(Math.E)
      expect(dvala.run('0 - E')).toBe(-Math.E)
    })
  })

  test('random samples0', () => {
    expect(() => getUndefinedSymbols('let { x, ...x } = {};')).toThrow(DvalaError)
  })

  test('random samples', () => {
    expect(() => dvala.run('"a" object 1')).toThrow(DvalaError)
    expect(() => dvala.run('[1, 2, 3].1')).toThrow(DvalaError)
    expect(() => dvala.run('1 ? 2 ; 3')).toThrow(DvalaError)
    expect(() => dvala.run('1 ? 2')).toThrow(DvalaError)
    expect(() => dvala.run('1 ? 2 :')).toThrow(DvalaError)
    expect(() => dvalaDebug.run('{ x: 1, y: 2 = 3 }')).toThrow(DvalaError)
    expect(() => dvalaDebug.run('let { x, ...x }: {};')).toThrow(DvalaError)
    expect(() => dvalaDebug.run('let [ x as y ]: [];')).toThrow(DvalaError)
    expect(() => dvalaDebug.run('let { ...x as y }: {};')).toThrow(DvalaError)
    expect(() => dvalaDebug.run('let { ...x, y }: {};')).toThrow(DvalaError)
    expect(() => dvalaDebug.run('let [x, y];')).toThrow(DvalaError)
    expect(() => dvalaDebug.run('let [...x, y]: [];')).toThrow(DvalaError)
    expect(() => dvalaDebug.run('let ...x = 1;')).toThrow(DvalaError)
    expect(() => dvalaDebug.run('let { a, ...x = y }: {};')).toThrow(DvalaError)
    expect(() => dvalaDebug.run('let x;')).toThrow(DvalaError)
    expect(() => dvalaDebug.run('0..1')).toThrow(DvalaError)
    expect(() => dvalaDebug.run('1e2e2')).toThrow(DvalaError)
    expect(() => dvalaDebug.run('reMatch("Albert", #"as(d")')).toThrow(DvalaError)
    expect(() => dvalaDebug.run('let _0 = 0;')).not.toThrow()
    expect(() => getUndefinedSymbols('let foo = ([,,a,...a]) -> a; foo([1, 2, 3])')).toThrow(DvalaError)
    expect(() => getUndefinedSymbols('let foo = ([,,a,...a]) -> a; foo([1, 2, 3])')).toThrow(DvalaError)
    expect(() => getUndefinedSymbols('let foo = ([,,a,a]) -> a; foo([1, 2, 3])')).toThrow(DvalaError)
    expect(() => getUndefinedSymbols('let foo = ([,,a]) -> a; foo([1, 2, 3])')).not.toThrow()
    expect(() => dvalaDebug.run('let foo = ([,,a]) -> a; foo([1, 2, 3])')).not.toThrow()
    expect(() => dvalaDebug.run('let foo = ({a}) -> a; foo({})')).not.toThrow()
    expect(() => dvalaDebug.run('let foo = ({a, [a]}) -> a;')).toThrow(DvalaError)
    expect(() => dvalaDebug.run('let foo = ({a a}) -> a;')).toThrow(DvalaError)
    expect(() => dvalaDebug.run('let foo = ({a, a}) -> a;')).toThrow(DvalaError)
    expect(() => dvalaDebug.run('let foo = ({a, b as a}) -> a;')).toThrow(DvalaError)
    expect(() => dvalaDebug.run('let foo = (let a = 1;) -> 1')).toThrow(DvalaError)
    expect(() => dvalaDebug.run('"\\t\\r\\n\\b\\f"')).not.toThrow()
    expect(() => dvalaDebug.run('E')).not.toThrow()
    expect(() => dvalaDebug.run('123')).not.toThrow()
    expect(() => dvalaDebug.run('let \'a\\\\b\' = 1;')).not.toThrow()
    expect(() => dvalaDebug.run('let \'a\\\'b\' = 1;')).not.toThrow()
    expect(() => dvalaDebug.run('let \'a\\ab\' = 1;')).not.toThrow()
    expect(() => dvalaDebug.run('`')).toThrow(DvalaError)
    expect(() => dvalaDebug.run('let a = (b) -> do 1, end;')).toThrow(DvalaError)
    expect(() => dvalaDebug.run('match 1 case 1 then 1; 2 end')).not.toThrow()
    expect(() => dvalaDebug.run('match 1 case 1 then 1, end end')).toThrow(DvalaError)
    expect(() => dvalaDebug.run('if 1 then 1 end; 2')).toThrow(DvalaError)
    expect(() => dvalaDebug.run('if 1 then 1 end,')).toThrow(DvalaError)
    expect(() => dvalaDebug.run('if true then 1 else 1 end; 2')).not.toThrow()
    expect(() => dvalaDebug.run('if true then 1 else 1 end,')).toThrow(DvalaError)
    expect(() => dvalaDebug.run('if true then 1 end; 2')).toThrow(DvalaError)
    expect(() => dvalaDebug.run('if true then 1 end; 2,')).toThrow(DvalaError)
    expect(() => dvalaDebug.run('for (a in [1, 2] when a == 2 when b == 1) -> 1')).toThrow(DvalaError)
    expect(() => dvalaDebug.run('for (a in [1, 2] while a == 2 while a == 1) -> 1')).toThrow(DvalaError)
    expect(() => dvalaDebug.run('for (a in [1, 2] let a = 2, 2) -> 1')).toThrow(DvalaError)
    expect(() => dvalaDebug.run('for (a in [1, 2] let a = 2 let a = 2) -> 1')).toThrow(DvalaError)
    expect(() => dvalaDebug.run('for (a in [1, 2]) -> do 1; 2 end')).not.toThrow()
    expect(() => dvalaDebug.run('for (a in [1, 2] when a == 1,) -> null')).not.toThrow(DvalaError)
    expect(() => dvalaDebug.run('for (a in [1, 2] when a == 1,) -> }')).toThrow(DvalaError)
    expect(() => dvalaDebug.run('for (a in [1, 2]) -> do 1, end')).toThrow(DvalaError)
    expect(() => dvalaDebug.run('for (a in [1, 2] 2) -> do 1 end')).toThrow(DvalaError)
    expect(() => dvalaDebug.run('for (a in [1, 2], 2) -> do 1 end')).toThrow(DvalaError)
    expect(() => dvalaDebug.run('do 1; 2 end')).not.toThrow()
    expect(() => getUndefinedSymbols('loop ([,x] = [1, 2]) -> do 1 end')).not.toThrow()
    expect(() => dvalaDebug.run('loop ([,x] = [1, 2]) -> do 1 end')).not.toThrow()
    expect(() => dvalaDebug.run('loop (x = 2) -> do 1, end')).toThrow(DvalaError)
    expect(() => dvalaDebug.run('loop) -> do 1 end')).toThrow(DvalaError)
    expect(() => dvalaDebug.run('do 1, end')).toThrow(DvalaError)
    expect(() => dvalaDebug.run('do 1 end')).not.toThrow()
    expect(() => dvalaDebug.run('null ?? 1')).not.toThrow()
    expect(() => dvalaDebug.run('-> $1 + $2')).toThrow(DvalaError)
    expect(() => dvalaDebug.run('-> $ + $21')).toThrow(DvalaError)
    expect(() => dvalaDebug.run('(a) -> a')).not.toThrow()
    expect(() => dvalaDebug.run('(...a, ...b) -> a')).toThrow(DvalaError)
    expect(() => dvalaDebug.run('(...a, let a = 1;) -> a')).toThrow(DvalaError)
    expect(() => dvalaDebug.run('(...a, let a = 1,,) -> a')).toThrow(DvalaError)
    expect(dvalaDebug.run('{ a: 1 }.a')).toBe(1)
    expect(() => dvalaDebug.run('fn()')).toThrow(DvalaError)
    expect(() => dvalaDebug.run('do a = 1; b = 2 end')).toThrow(DvalaError)
    expect(() => dvalaDebug.run('do a = 1 end.1')).toThrow(DvalaError)
  })

  describe('const MAX_SAFE_INTEGER', () => {
    it('samples', () => {
      expect(dvala.run('MAX_SAFE_INTEGER')).toBe(Number.MAX_SAFE_INTEGER)
    })
  })

  describe('const MIN_SAFE_INTEGER', () => {
    it('samples', () => {
      expect(dvala.run('MIN_SAFE_INTEGER')).toBe(Number.MIN_SAFE_INTEGER)
    })
  })

  describe('const MAX_VALUE', () => {
    it('samples', () => {
      expect(dvala.run('MAX_VALUE')).toBe(Number.MAX_VALUE)
    })
  })

  describe('const MIN_VALUE', () => {
    it('samples', () => {
      expect(dvala.run('MIN_VALUE')).toBe(Number.MIN_VALUE)
      expect(() => dvala.run('(min_value :1)')).toThrow(DvalaError)
    })
  })

  describe('removed non-finite constants', () => {
    it('should throw on NaN, POSITIVE_INFINITY, NEGATIVE_INFINITY', () => {
      expect(() => dvala.run('NaN')).toThrow()
      expect(() => dvala.run('POSITIVE_INFINITY')).toThrow()
      expect(() => dvala.run('NEGATIVE_INFINITY')).toThrow()
    })
  })

  describe('const PI', () => {
    it('samples', () => {
      expect(dvala.run('PI')).toBe(Math.PI)
    })
  })

  describe('**', () => {
    test('samples', () => {
      expect(dvala.run('2 ^ 3')).toBe(8)
      expect(dvala.run('2 ^ 3 ^ 2')).toBe(512)
    })
  })
  describe('*', () => {
    test('samples', () => {
      expect(dvala.run('-2 * 3')).toBe(-6)
      expect(dvala.run('2 * 3 * 2')).toBe(12)
    })
  })
  describe('/', () => {
    test('samples', () => {
      expect(dvala.run('6 / 3')).toBe(2)
      expect(dvala.run('6 / 3 / 2')).toBe(1)
    })
  })
  describe('%', () => {
    test('samples', () => {
      expect(dvala.run('6 % 3')).toBe(0)
      expect(dvala.run('6 % 4')).toBe(2)
      expect(dvala.run('-6 % 4')).toBe(-2)
      expect(dvala.run('6 % -4')).toBe(2)
      expect(dvala.run('-6 % -4')).toBe(-2)
    })
  })
  describe('+', () => {
    test('samples', () => {
      expect(dvala.run('2 + 3')).toBe(5)
      expect(dvala.run('2 + 3 + 2')).toBe(7)
    })
  })
  describe('-', () => {
    test('samples', () => {
      expect(dvala.run('2 - 3')).toBe(-1)
      expect(dvala.run('2 - 3 - 2')).toBe(-3)
    })
  })
  describe('<<', () => {
    test('samples', () => {
      expect(dvala.run('2 << 3')).toBe(16)
      expect(dvala.run('2 << 3 << 2')).toBe(64)
    })
  })
  describe('>>', () => {
    test('samples', () => {
      expect(dvala.run('16 >> 3')).toBe(2)
      expect(dvala.run('64 >> 3 >> 2')).toBe(2)
      expect(dvala.run('-16 >> 2')).toBe(-4)
    })
  })
  describe('>>>', () => {
    test('samples', () => {
      expect(dvala.run('16 >>> 3')).toBe(2)
      expect(dvala.run('1 >>> 1')).toBe(0)
      expect(dvala.run('1 >>> 2')).toBe(0)
      expect(dvala.run('-16 >>> 2')).toBe(0x3FFFFFFC)
      expect(dvala.run('64 >>> 3 >>> 2')).toBe(2)
    })
  })
  describe('++', () => {
    test('samples', () => {
      expect(dvala.run('"Foo" ++ "Bar"')).toBe('FooBar')
      expect(dvala.run('2 ++ 3')).toBe('23')
      expect(dvala.run('2 ++ 3 * 2')).toBe('26')
      expect(dvala.run('"Hello" ++ " " ++ "World"')).toBe('Hello World')
    })
  })
  describe('<', () => {
    test('samples', () => {
      expect(dvala.run('2 < 3')).toBe(true)
      expect(dvala.run('2 < 2')).toBe(false)
      expect(dvala.run('2 < 1')).toBe(false)
    })
  })
  describe('<=', () => {
    test('samples', () => {
      expect(dvala.run('2 <= 3')).toBe(true)
      expect(dvala.run('2 <= 2')).toBe(true)
      expect(dvala.run('2 <= 1')).toBe(false)
    })
  })
  describe('>', () => {
    test('samples', () => {
      expect(dvala.run('2 > 3')).toBe(false)
      expect(dvala.run('2 > 2')).toBe(false)
      expect(dvala.run('2 > 1')).toBe(true)
    })
  })
  describe('>=', () => {
    test('samples', () => {
      expect(dvala.run('2 >= 3')).toBe(false)
      expect(dvala.run('2 >= 2')).toBe(true)
      expect(dvala.run('2 >= 1')).toBe(true)
    })
  })
  describe('=', () => {
    test('samples', () => {
      expect(dvala.run('2 == 3')).toBe(false)
      expect(dvala.run('2 == 2')).toBe(true)
      expect(dvala.run('2 == 1')).toBe(false)
    })
  })
  // Boolean-surface cleanup: `!` is a unary prefix operator and a
  // first-class function value. Parser has two paths — `!expr` and
  // bare `!` (in a value slot). These tests lock in both plus the
  // tricky precedence / recursion cases.
  describe('!', () => {
    test('unary negation on literals', () => {
      expect(dvala.run('!true')).toBe(false)
      expect(dvala.run('!false')).toBe(true)
    })
    test('double and triple negation', () => {
      expect(dvala.run('!!true')).toBe(true)
      expect(dvala.run('!!false')).toBe(false)
      expect(dvala.run('!!!true')).toBe(false)
    })
    test('parenthesized Boolean expression', () => {
      expect(dvala.run('!(1 == 2)')).toBe(true)
      expect(dvala.run('!(1 == 1)')).toBe(false)
    })
    test('binds tighter than binary operators', () => {
      // `!a && b` is `(!a) && b`, not `!(a && b)`.
      expect(dvala.run('!true && true')).toBe(false)
      expect(dvala.run('!false && true')).toBe(true)
    })
    test('call chaining binds inside `!` — `!f(x).field` is `!(f(x).field)`', () => {
      expect(dvala.run('let o = {ok: true}; let f = (x) -> o; !f(5).ok')).toBe(false)
      expect(dvala.run('let o = {ok: false}; let f = (x) -> o; !f(5).ok')).toBe(true)
    })
    test('bare `!` passable as function value', () => {
      expect(dvala.run('map([true, false, true], !)')).toEqual([false, true, false])
      expect(dvala.run('filter([true, false, true], !)')).toEqual([false])
    })
    test('user alias `let not = !` works', () => {
      expect(dvala.run('let not = !; not(true)')).toBe(false)
      expect(dvala.run('let not = !; not(false)')).toBe(true)
    })
  })

  describe('!=', () => {
    test('samples', () => {
      expect(dvala.run('2 != 3')).toBe(true)
      expect(dvala.run('2 != 2')).toBe(false)
      expect(dvala.run('2 != 1')).toBe(true)
    })
  })
  describe('&', () => {
    test('samples', () => {
      expect(dvala.run('0b1001 & 0b1000')).toBe(0b1000)
      expect(dvala.run('0b1001 & 0b1000 & 0b0001')).toBe(0b0000)
    })
  })
  describe('|', () => {
    test('samples', () => {
      expect(dvala.run('0b1001 | 0b0100')).toBe(0b1101)
      expect(dvala.run('0b1001 | 0b0100 | 0b0010')).toBe(0b1111)
    })
  })
  describe('^', () => {
    test('samples', () => {
      expect(dvala.run('0b1001 xor 0b0100')).toBe(0b1101)
      expect(dvala.run('0b1001 xor 0b0100 xor 0b0010')).toBe(0b1111)
    })
  })
  describe('&&', () => {
    test('samples', () => {
      expect(dvala.run('true && true')).toBe(true)
      expect(dvala.run('true && false')).toBe(false)
      expect(dvala.run('false && true')).toBe(false)
      expect(dvala.run('false && false')).toBe(false)
    })
  })
  describe('||', () => {
    test('samples', () => {
      expect(dvala.run('true || true')).toBe(true)
      expect(dvala.run('true || false')).toBe(true)
      expect(dvala.run('false || true')).toBe(true)
      expect(dvala.run('false || false')).toBe(false)
    })
  })
  describe('??', () => {
    test('samples', () => {
      expect(dvala.run('1 ?? 2')).toBe(1)
      expect(dvala.run('null ?? 2')).toBe(2)
    })
  })
  describe('not', () => {
    test('samples', () => {
      expect(dvala.run('not(true)')).toBe(false)
      expect(dvala.run('not(false)')).toBe(true)
      expect(dvala.run('not(500)')).toBe(false)
      expect(dvala.run('not(0)')).toBe(true)
      expect(dvala.run('not(not(500))')).toBe(true)
      expect(dvala.run('not(not(0))')).toBe(false)
    })
  })
  describe('parenthises', () => {
    test('samples', () => {
      expect(dvala.run('-(2 + 3) * 2')).toBe(-10)
      expect(dvala.run('2 + (3 * 2)')).toBe(8)
    })
  })
  describe('operator presedence', () => {
    test('samples', () => {
      expect(dvala.run('1 / 2 + 1 / 2')).toBe(1)
    })
  })
  describe('objects', () => {
    test('samples', () => {
      expect(dvala.run('{ a: 2 + 3 }')).toEqual({ a: 5 })
      expect(dvala.run('{ a: 10 }')).toEqual({ a: 10 })
      expect(dvala.run('{ " ": 10 }')).toEqual({ ' ': 10 })
      expect(dvala.run('{ a: 10, b: 2 + 3 }')).toEqual({ a: 10, b: 5 })
      expect(dvala.run('{ a: 10, b: 20, c: 2 * (1 - 2) }')).toEqual({ a: 10, b: 20, c: -2 })
    })
  })
  describe('arrays', () => {
    test('samples', () => {
      expect(dvala.run('[]')).toEqual([])
      expect(dvala.run('[2 + 3]')).toEqual([5])
      expect(dvala.run('[10]')).toEqual([10])
      expect(dvala.run('[10, 2 + 3]')).toEqual([10, 5])
      expect(dvala.run('[10, 20, 2 * (1 - 2)]')).toEqual([10, 20, -2])
    })
  })
  describe('numbers', () => {
    test('samples', () => {
      expect(dvala.run('5_000_000')).toBe(5000000)
      expect(dvala.run('5e2')).toBe(500)
      expect(dvala.run('-5.2e-1')).toBe(-0.52)
      expect(dvala.run('5')).toBe(5)
      expect(dvala.run('-10')).toBe(-10)
      expect(tokenizeSource('-10').tokens).toEqual([
        ['Number', '-10'],
      ])
    })
  })
  describe('strings', () => {
    test('samples', () => {
      expect(dvala.run('""')).toBe('')
      expect(dvala.run('"Foo"')).toBe('Foo')
      expect(dvala.run('"Fo\\no"')).toBe('Fo\no')
    })
  })
  describe('propery accessor', () => {
    test('samples', () => {
      expect(dvala.run('{ a: 200 }.a')).toBe(200)
      expect(dvala.run('{ a: { b: 1, c: 2 } }.a.c')).toBe(2)
      expect(dvala.run('[1, 2, 3][1]')).toBe(2)
    })
  })
  describe('propery accessor with brackets', () => {
    test('samples', () => {
      expect(dvala.run('{ a: 200 }["a"]')).toBe(200)
      expect(dvala.run('[1, [10, 20, 30], 3][1][1]')).toBe(20)
      expect(dvala.run('{ foo: [1, 2, 3] }.foo[2 - 1]')).toBe(2)
      expect(dvala.run('{ foo: [1, { bar: 20 }, 3] }.foo[1].bar')).toBe(20)
      expect(dvala.run('[1, { bar: 20 }, 3][1].bar')).toBe(20)
    })
  })

  describe('function call', () => {
    test('samples', () => {
      expect(dvala.run('max(1, 3, 2)')).toBe(3)
      expect(dvala.run('&&(1, 2, 3)')).toBe(3)
      expect(dvala.run('||(0, 1, 2)')).toBe(1)
      expect(dvala.run('slice([1, 2, 3], 1)')).toEqual([2, 3])
    })
  })

  describe('if expression', () => {
    test('samples', () => {
      // expect(dvala.run('if 1 > 2 then 2 end')).toBe(null)
      // expect(dvala.run('if 1 < 2 then 2 end')).toBe(2)
      // expect(dvala.run('if 1 > 2 then 1 else 2 end')).toBe(2)
      // expect(dvala.run('if 1 < 2 then 1 else 2 end')).toBe(1)
      expect(dvala.run('if 1 < 2 then 2; 1; else 2; 2; end')).toBe(1)
    })
  })

  describe('negated if expression', () => {
    test('samples', () => {
      expect(dvala.run('if not(1 < 2) then 1 else 2 end')).toBe(2)
      expect(() => dvala.run('if not(1 < 2) then 1 end')).toThrow('`if` without `else` is not allowed')
      expect(dvala.run('if not(1 > 2) then 1 else 2 end')).toBe(1)
    })
  })

  test('misc', () => {
    expect(dvala.run('3;2;1;')).toBe(1)
    expect(dvala.run('isEmpty([1, 2 ,3] filter -> $ > 10)')).toBe(true)
    expect(dvala.run('isEmpty([1, 2 ,3] filter -> $ > 1)')).toBe(false)
  })

  describe('debug', () => {
    test('samples', () => {
      expect(dvalaDebug.run('2 + 3')).toBe(5)
      expect(tokenizeSource('2 + 3', true).tokens).toEqual([
        [
          'Number',
          '2',
          [0, 0],
        ],
        [
          'Whitespace',
          ' ',
          [0, 1],
        ],
        [
          'Operator',
          '+',
          [0, 2],
        ],
        [
          'Whitespace',
          ' ',
          [0, 3],
        ],
        [
          'Number',
          '3',
          [0, 4],
        ],
      ])
      expect(dvalaDebug.run('-2')).toBe(-2)
      expect(tokenizeSource('-2', true).tokens).toEqual([
        [
          'Number',
          '-2',
          [0, 0],
        ],
      ])
    })
  })

  describe('errors.', () => {
    test('unknown operator', () => {
      expect(() => dvala.run('2 # 3')).toThrow(DvalaError)
      expect(() => dvala.run('(1 + 2]')).toThrow(DvalaError)
      expect(() => dvala.run('abs 2')).toThrow(DvalaError)
      expect(() => dvala.run('{ 2: 1 }')).toThrow(DvalaError)
      expect(() => dvala.run('{ x: 1 y: 2 }')).toThrow(DvalaError)
      expect(() => dvala.run('[1 2]')).toThrow(DvalaError)
      expect(() => dvala.run('if 1 then')).toThrow(DvalaError) // To few parameters
      expect(() => dvala.run(']')).toThrow(DvalaError)
    })
  })

  describe('basic arithmetic operations', () => {
    it('evaluates addition', () => {
      expect(dvala.run('4 + 5')).toBe(9)
      expect(dvala.run('0 + 0')).toBe(0)
      expect(dvala.run('-3 + 3')).toBe(0)
    })

    it('evaluates subtraction', () => {
      expect(dvala.run('10 - 3')).toBe(7)
      expect(dvala.run('3 - 10')).toBe(-7)
      expect(dvala.run('0 - 0')).toBe(0)
    })

    it('evaluates multiplication', () => {
      expect(dvala.run('3 * 4')).toBe(12)
      expect(dvala.run('0 * 5')).toBe(0)
      expect(dvala.run('-2 * 3')).toBe(-6)
    })

    it('evaluates division', () => {
      expect(dvala.run('12 / 3')).toBe(4)
      expect(dvala.run('5 / 2')).toBe(2.5)
      expect(dvala.run('0 / 5')).toBe(0)
    })

    it('evaluates remainder (modulo)', () => {
      expect(dvala.run('10 % 3')).toBe(1)
      expect(dvala.run('10 % 2')).toBe(0)
      expect(dvala.run('10 % 10')).toBe(0)
    })

    it('evaluates exponentiation', () => {
      expect(dvala.run('2 ^ 3')).toBe(8)
      expect(dvala.run('2 ^ 0')).toBe(1)
      expect(dvala.run('0 ^ 0')).toBe(1)
    })
  })

  describe('operator precedence', () => {
    it('respects standard precedence rules', () => {
      expect(dvala.run('2 * 3 % 4')).toBe(2)
      expect(dvala.run('12 % 3 + 4')).toBe(4)
      expect(dvala.run('12 % (3 + 4)')).toBe(5)
      expect(dvala.run('2 + 3 * 4')).toBe(14)
      expect(dvala.run('2 * 3 + 4')).toBe(10)
      expect(dvala.run('2 ^ 3 * 2')).toBe(16)
      expect(dvala.run('2 * 3 ^ 2')).toBe(18)
    })

    it('handles parentheses correctly', () => {
      expect(dvala.run('(2 + 3) * 4')).toBe(20)
      expect(dvala.run('2 * (3 + 4)')).toBe(14)
      expect(dvala.run('(2 + 3) * (4 + 5)')).toBe(45)
    })

    it('handles nested parentheses', () => {
      expect(dvala.run('(2 * (3 + (4 - 2)))')).toBe(10)
      expect(dvala.run('((2 + 3) * 4) / 2')).toBe(10)
    })
  })

  describe('comparison operators', () => {
    it('evaluates equality operators', () => {
      expect(dvala.run('3 == 3')).toBe(true)
      expect(dvala.run('3 == 4')).toBe(false)
      expect(dvala.run('3 != 4')).toBe(true)
      expect(dvala.run('3 != 3')).toBe(false)
    })

    it('evaluates relational operators', () => {
      expect(dvala.run('3 < 4')).toBe(true)
      expect(dvala.run('4 < 3')).toBe(false)
      expect(dvala.run('3 <= 3')).toBe(true)
      expect(dvala.run('3 <= 2')).toBe(false)
      expect(dvala.run('4 > 3')).toBe(true)
      expect(dvala.run('3 > 4')).toBe(false)
      expect(dvala.run('3 >= 3')).toBe(true)
      expect(dvala.run('2 >= 3')).toBe(false)
    })
  })

  describe('logical operators', () => {
    it('evaluates logical AND', () => {
      expect(dvala.run('true && true')).toBe(true)
      expect(dvala.run('true && false')).toBe(false)
      expect(dvala.run('false && true')).toBe(false)
      expect(dvala.run('false && false')).toBe(false)
    })

    it('evaluates logical OR', () => {
      expect(dvala.run('true || true')).toBe(true)
      expect(dvala.run('true || false')).toBe(true)
      expect(dvala.run('false || true')).toBe(true)
      expect(dvala.run('false || false')).toBe(false)
    })

    it('evaluates nullish coalescing', () => {
      expect(dvala.run('null ?? 5')).toBe(5)
      expect(dvala.run('0 ?? 5')).toBe(0)
      expect(dvala.run('false ?? 5')).toBe(false)
      expect(dvala.run('"" ?? 5')).toBe('')
    })

    it('handles precedence between logical operators', () => {
      expect(dvala.run('true && false || true')).toBe(true)
      expect(dvala.run('true || false && true')).toBe(true)
      expect(dvala.run('(true || false) && false')).toBe(false)
    })
  })

  describe('bitwise operators', () => {
    it('evaluates bitwise AND', () => {
      expect(dvala.run('5 & 3')).toBe(1)
      expect(dvala.run('12 & 4')).toBe(4)
    })

    it('evaluates bitwise OR', () => {
      expect(dvala.run('5 | 3')).toBe(7)
      expect(dvala.run('12 | 4')).toBe(12)
    })

    it('evaluates bitwise XOR', () => {
      expect(dvala.run('5 xor 3')).toBe(6)
      expect(dvala.run('12 xor 4')).toBe(8)
    })

    it('evaluates bitwise shifts', () => {
      expect(dvala.run('8 << 2')).toBe(32)
      expect(dvala.run('8 >> 2')).toBe(2)
      expect(dvala.run('-8 >> 2')).toBe(-2)
      expect(dvala.run('-8 >>> 2')).toEqual(expect.any(Number)) // Exact value depends on implementation
    })
  })

  test('multinine comment', () => {
    expect(dvala.run(`
/*******************************************
 *         Simple Dvala program             *
 ******************************************/

10 + 20`)).toBe(30)
  })

  describe('block', () => {
    test('as operand', () => {
      expect(dvala.run(`
        do
          let a = 1 + 2 * 3;
          a
        end + 3`)).toBe(10)
    })
    test('scope', () => {
      expect(dvala.run(`
      let a = 1;
      do
        let a = 2;
      end;
      a`)).toBe(1)

      expect(() => dvala.run(`
      do
        let a = 2;
      end;
      a`)).toThrow(DvalaError) // a is not defined
    })
  })

  describe('data structures', () => {
    it('supports array literals', () => {
      expect(dvala.run('[1, 2, 3]')).toEqual([1, 2, 3])
      expect(dvala.run('[]')).toEqual([])
      expect(dvala.run('[1 + 1, 2 * 2, 3 ^ 2]')).toEqual([2, 4, 9])
    })

    it('supports nested arrays', () => {
      expect(dvala.run('[1, [2, 3], 4]')).toEqual([1, [2, 3], 4])
      expect(dvala.run('[[1, 2], [3, 4]]')).toEqual([[1, 2], [3, 4]])
    })

    it('supports object literals', () => {
      expect(dvala.run('{ a: 10, b: 20 }')).toEqual({ a: 10, b: 20 })
      expect(dvala.run('{}')).toEqual({})
      expect(dvala.run('{ x: 1 + 1, y: 2 * 3 }')).toEqual({ x: 2, y: 6 })
      expect(() => dvala.run('{ 1: 1 + 1, y: 2 * 3 }')).toThrow(DvalaError)
    })

    it('supports nested objects', () => {
      expect(dvala.run('{ a: 10, b: { c: 20, d: 30 } }')).toEqual({ a: 10, b: { c: 20, d: 30 } })
      expect(dvala.run('{ x: [1, 2], y: { z: [3, 4] } }')).toEqual({ x: [1, 2], y: { z: [3, 4] } })
    })

    it('supports property access', () => {
      expect(dvala.run('{ a: 10, b: 20 }.a')).toBe(10)
      expect(dvala.run('{ a: 10, b: { c: 20 } }.b.c')).toBe(20)
    })

    it('supports array access', () => {
      expect(dvala.run('[1, 2, 3][0]')).toBe(1)
      expect(dvala.run('[1, 2, 3][1 + 1]')).toBe(3)
      expect(dvala.run('[[1, 2], [3, 4]][1][0]')).toBe(3)
    })
  })

  describe('function calls', () => {
    it('supports basic function calls', () => {
      // These tests assume your runtime provides these functions
      expect(dvala.run('abs(-5)')).toBe(5)
      expect(dvalaWithMathUtils.run('let { sin, cos } = import("math"); sin(0)')).toBeCloseTo(0)
      expect(dvalaWithMathUtils.run('let { sin, cos } = import("math"); cos(0)')).toBeCloseTo(1)
    })

    it('supports function calls with multiple arguments', () => {
      expect(dvala.run('max(1, 2, 3)')).toBe(3)
      expect(dvala.run('min(1, 2, 3)')).toBe(1)
    })

    it('supports nested function calls', () => {
      expect(dvala.run('abs(min(-5, -10))')).toBe(10)
      expect(dvalaWithMathUtils.run('let { sin } = import("math"); round(sin(3.14159))')).toBeCloseTo(0)
    })

    it('supports function calls with expressions as arguments', () => {
      expect(dvala.run('abs(2 - 5)')).toBe(3)
      expect(dvala.run('max(1 + 1, 2 + 2, 3 * 1)')).toBe(4)
    })
  })

  describe('let', () => {
    it('supports let bindings', () => {
      expect(dvala.run('let a = 10; a')).toBe(10)
      expect(dvala.run('let foo = -> $ + 1; foo(1)')).toBe(2)
    })
  })

  describe('loop expressions', () => {
    it('supports loop expressions', () => {
      expect(dvala.run(`
        loop(n = 10, acc = 0) -> if n == 0 then acc else recur(n - 1, acc + n) end`)).toBe(55)
    })
  })

  describe('function', () => {
    test('basic', () => {
      expect(dvala.run(`
let foo = () -> do
  42
end;

foo()`)).toBe(42)
    })

    test('empty block, no it is an object', () => {
      expect(dvala.run(`
let foo = () -> {};

foo()`)).toEqual({})
    })
    test('with rest arguments///', () => {
      expect(dvala.run(`
let foo = (...x) -> do
  '+' apply (x filter -> $ > 0)
end;

foo(-1, 0, 1, 2, 3)`)).toBe(6)
    })

    test('with default arguments', () => {
      expect(dvala.run(`
let foo = (a = 10, b = 20) -> do
  a + b
end;

foo()`)).toBe(30)
    })

    test('with default arguments 1', () => {
      expect(dvala.run(`
let foo = (a = 10, b = 20) -> do
  a + b
end;

foo(0)`)).toBe(20)
    })

    test('with default arguments 2', () => {
      expect(dvala.run(`
let foo = (a = 10, b = 20) -> do
  a + b
end;

foo(1, 2)`)).toBe(3)
    })
    test('errors', () => {
      expect(() => dvala.run('function foo(...rest = 1) rest end')).toThrow(DvalaError)
      expect(() => dvala.run('function foo(a = 1, b) rest end')).toThrow(DvalaError)
    })
  })

  test('if/else if expression', () => {
    expect(dvala.run(`
      let val = 8;

      if val < 5 then "S"
      else if val < 10 then "M"
      else if val < 15 then "L"
      else null
      end`)).toBe('M')

    expect(dvala.run(`
        let val = 20;

        if val < 5 then "S"
        else if val < 10 then "M"
        else if val < 15 then "L"
        else null
        end`)).toBe(null)
  })
  test('match expression', () => {
    expect(dvala.run(`
    match "-"
      case "-" then 1
    end`)).toBe(1)
    expect(dvala.run(`
      let x = 1;
      match x
        case 0 then "zero"
        case 1 then "one"
        case 2 then "two"
      end`)).toBe('one')
    expect(() => dvala.run(`
      let x = 10;
      match x
        case 0 then "zero"
        case 1 then "one"
        case 2 then "two"
      end`)).toThrow(MatchError)
  })

  test('simple for (formerly doseq).', () => {
    expect(dvala.run(`
      for (x in "Al", y in [1, 2]) -> do
        x repeat y
      end`)).toEqual([['A'], ['A', 'A'], ['l'], ['l', 'l']])
  })

  describe('for', () => {
    test('empty collections', () => {
      expect(() => dvala.run(`
        for (x in [] 1) -> do
          x
        end`)).toThrow(DvalaError)
      expect(() => dvala.run(`
          for (x in [1, 2, 3] while x < 1 1) -> do
            x
          end`)).toThrow(DvalaError)
      expect(dvala.run(`
        for (x in []) -> do
          x
        end`)).toEqual([])
      expect(dvala.run(`
        for (x in [1, 2, 3], y in []) -> do
          x
        end`)).toEqual([])
      expect(dvala.run(`
        for (x in [], y in [1, 2, 3]) -> do
          x
        end`)).toEqual([])
    })
    test('string and object iteration', () => {
      expect(dvala.run(`
        for (x in "Al", y in [1, 2]) -> do
          x repeat y
        end`)).toEqual([['A'], ['A', 'A'], ['l'], ['l', 'l']])
      expect(dvala.run(`
        for (x in { a: 10, b: 20 }, y in [1, 2]) -> do
           repeat(x, y)
        end`)).toEqual([
        [['a', 10]],
        [
          ['a', 10],
          ['a', 10],
        ],
        [['b', 20]],
        [
          ['b', 20],
          ['b', 20],
        ],
      ])
    })
    test('basic iteration with computation', () => {
      expect(dvala.run(`
        for (x in [1, 2], y in [1, 10]) -> do
          x * y
        end`)).toEqual([1, 10, 2, 20])
    })
    test('with computed bindings using let', () => {
      expect(dvala.run(`
        for (x in [1, 2] let z = x * x * x) -> do
          z
        end`)).toEqual([1, 8])
    })
    test('using previous bindings of subsequent iterations', () => {
      expect(dvala.run(`
        for (x in [1, 2], y in [x, 2 * x]) -> do
          x * y
        end`)).toEqual([1, 2, 4, 8])
    })
    test('with when conditions', () => {
      expect(dvala.run(`
        for (x in [0, 1, 2, 3, 4, 5] let a = x * 3 let y = a when isEven(y) while y < 10) -> do
          y
        end`)).toEqual([0, 6])
    })
    test('with while conditions (early termination)', () => {
      expect(dvala.run(`
        for (x in [0, 1, 2, 3, 4, 5] let y = x * 3 while isEven(y)) -> do
          y
        end`)).toEqual([0])
    })
    test('multiple iterations with while', () => {
      expect(dvala.run(`
        for (x in [1, 2, 3], y in [1, 2, 3] while x <= y, z in [1, 2, 3]) -> do
          [x, y, z]
        end`)).toEqual([
        [1, 1, 1],
        [1, 1, 2],
        [1, 1, 3],
        [1, 2, 1],
        [1, 2, 2],
        [1, 2, 3],
        [1, 3, 1],
        [1, 3, 2],
        [1, 3, 3],
      ])
    })
    describe('destructuring — duplicate key detection', () => {
      // Duplicates are tracked on the EXTERNAL (destructured) key, not the
      // local binding name. Before this was corrected, `{ pi as p, q as pi }`
      // erroneously rejected (the second local name `pi` collided with the
      // first local `p` via a mis-written check) while the reverse case
      // `{ pi as p, e as p }` passed despite two bindings claiming the same
      // local name — the wrong invariant being enforced.
      it('rejects duplicate external keys', () => {
        expect(() => dvala.run('let { pi, pi } = { pi: 1 }; pi')).toThrow()
        expect(() => dvala.run('let { pi as p, pi as q } = { pi: 1 }; p')).toThrow()
      })
      it('accepts distinct external keys even when they share a local name', () => {
        // Two different fields aliased to the same local — parser should
        // accept; the runtime semantics are the user's problem.
        expect(() => dvala.run('let { pi as p, e as p } = { pi: 1, e: 2 }; p')).not.toThrow()
      })
      it('accepts external key that matches another entry\'s local name', () => {
        // `{ pi as p, q as pi }` — first external key is `pi`, second is `q`.
        // The second entry's LOCAL is named `pi` but that's not a key, so
        // the external-key dedup passes. Previously this was falsely rejected.
        expect(() => dvala.run('let { pi as p, q as pi } = { pi: 1, q: 2 }; p + pi')).not.toThrow()
      })
    })
    describe('destructuring', () => {
      const values = {
        'anObject': {
          name: 'John Doe',
          age: 42,
          married: true,
          children: [
            { name: 'Alice', age: 10 },
            { name: 'Bob', age: 7 },
          ],
          address: {
            street: '123 Main St',
            city: 'Springfield',
            state: 'IL',
            zip: '62701',
          },
        },
      }
      test('samples.', () => {
        expect(dvala.run(`
          let foo = ({ a as b = 10 }) -> do
            b
          end;

          foo({ b: 1})
        `)).toBe(10)
        expect(dvala.run(`
          let { children: [{ age as firstChildAge }] } = anObject;
          firstChildAge
        `, { scope: values })).toBe(10)

        expect(dvala.run(`
          let { children: [{ age as firstChildAge, name }] } = anObject;
          [firstChildAge, name]
        `, { scope: values })).toEqual([10, 'Alice'])

        expect(dvala.run(`
          let { children: [, { age, name }] } = anObject;
          [age, name]
        `, { scope: values })).toEqual([7, 'Bob'])

        expect(dvala.run(`
          let foo = ([a, b] = [1, 2]) -> do
            a + b
          end;

        foo()
        `, { scope: values })).toEqual(3)

        expect(dvala.run(`
          let foo = ([{ value as a }, { value as b }] = [{ value: 1 }, { value: 2 }]) -> do
            a + b
          end;

          foo()
          `, { scope: values })).toEqual(3)

        expect(dvala.run(`
          let foo = ([{ value as a } = { value: 10 }, { value as b } = { value: 20 }] = [{ value: 1 }, { value: 2 }]) -> do
            a + b
          end;

            foo([])
            `, { scope: values })).toEqual(30)

        expect(dvala.run(`
          let foo = ({ value = 10 }) -> do
            value
          end;

          foo({})
          `, { scope: values })).toEqual(10)

        expect(dvala.run(`
          let foo = ([{ value as a } = { value: 10 }, { value as b = 200 } = { value: 20 }] = [{ value: 1 }, { value: 2 }]) -> do
            a + b
          end;

            foo([{ value: 1 }])
            `, { scope: values })).toEqual(21)

        expect(dvala.run(`
          let foo = ([{ value as a } = { value: 10 }, { value as b = 200 } = { value: 20 }] = [{ value: 1 }, { value: 2 }]) -> do
            a + b
          end;

            foo([{ value: 1 }, { value: 200 }])
            `, { scope: values })).toEqual(201)
      })
    })
    test('complex example with three iterations', () => {
      expect(dvala.run(`
        for (
          x in [1, 2, 3],
          y in [1, 2, 3],
          z in [1, 2, 3] while x <= y
        ) -> do
          [x, y, z]
        end`)).toEqual([
        [1, 1, 1],
        [1, 1, 2],
        [1, 1, 3],
        [1, 2, 1],
        [1, 2, 2],
        [1, 2, 3],
        [1, 3, 1],
        [1, 3, 2],
        [1, 3, 3],
        [2, 2, 1],
        [2, 2, 2],
        [2, 2, 3],
        [2, 3, 1],
        [2, 3, 2],
        [2, 3, 3],
        [3, 3, 1],
        [3, 3, 2],
        [3, 3, 3],
      ])
    })
    test('real world example', () => {
      expect(dvala.run(`// Imagine these are coming from a database
        let products = [
          { id: "P1", name: "Phone", price: 500, category: "electronics", stockLevel: 23 },
          { id: "P2", name: "Headphones", price: 150, category: "electronics", stockLevel: 42 },
          { id: "P3", name: "Case", price: 30, category: "accessories", stockLevel: 56 },
        ];
        let customerPreferences = {
          priceLimit: 700,
          preferredCategories: ["electronics", "accessories"],
          recentViews: ["P1", "P3", "P5"]
        };
        
        // Generate personalized bundle recommendations
        for (
          // Start with main products
          mainProduct in products
          let isInStock = mainProduct.stockLevel > 0
          let isPreferredCategory = contains(customerPreferences.preferredCategories, mainProduct.category)
          let isPriceOk = mainProduct.price <= customerPreferences.priceLimit * 0.8
          when (isInStock && isPreferredCategory && isPriceOk),
            
        
          // Add compatible accessories
          accessory in products
          let isCompatible = mainProduct.id != accessory.id && accessory.stockLevel > 0
          let totalPrice = mainProduct.price + accessory.price
          let isRecentlyViewed = contains(customerPreferences.recentViews, accessory.id)
          when (isCompatible && totalPrice <= customerPreferences.priceLimit)
          while totalPrice <= customerPreferences.priceLimit * 0.9,
        
          // For high-value bundles, consider a third complementary item
          complItem in products
          let isValid = mainProduct.id != complItem.id && accessory.id != complItem.id && complItem.stockLevel > 0
          let finalPrice = mainProduct.price + accessory.price + complItem.price
          let discount = if finalPrice > 500 then 0.1 else 0.05 end
          let discountedPrice = finalPrice * (1 - discount)
          let matchesPreferences = contains(customerPreferences.preferredCategories, complItem.category)
          when (isValid && finalPrice <= customerPreferences.priceLimit && matchesPreferences)
          while discountedPrice <= customerPreferences.priceLimit
        ) -> do
          // Return bundle information object
          {
            bundle: [mainProduct, accessory, complItem],
            originalPrice: finalPrice,
            discountedPrice: discountedPrice,
            savingsAmount: discount * finalPrice,
            savingsPercentage: discount * 100
          }
        end`)).toEqual([
        {
          bundle: [
            {
              category: 'accessories',
              id: 'P3',
              name: 'Case',
              price: 30,
              stockLevel: 56,
            },
            {
              category: 'electronics',
              id: 'P1',
              name: 'Phone',
              price: 500,
              stockLevel: 23,
            },
            {
              category: 'electronics',
              id: 'P2',
              name: 'Headphones',
              price: 150,
              stockLevel: 42,
            },
          ],
          discountedPrice: 612,
          originalPrice: 680,
          savingsAmount: 68,
          savingsPercentage: 10,
        },
        {
          bundle: [
            {
              category: 'accessories',
              id: 'P3',
              name: 'Case',
              price: 30,
              stockLevel: 56,
            },
            {
              category: 'electronics',
              id: 'P2',
              name: 'Headphones',
              price: 150,
              stockLevel: 42,
            },
            {
              category: 'electronics',
              id: 'P1',
              name: 'Phone',
              price: 500,
              stockLevel: 23,
            },
          ],
          discountedPrice: 612,
          originalPrice: 680,
          savingsAmount: 68,
          savingsPercentage: 10,
        },
      ])
    })
  })

  describe('complex expressions', () => {
    it('handles complex arithmetic expressions', () => {
      expect(dvala.run('(2 + 3) * 4 / 2 - 1')).toBe(9)
      expect(dvala.run('2 ^ 3 + 4 * 2 / (1 + 1)')).toBe(12)
    })

    it('handles complex logical expressions', () => {
      expect(dvala.run('(5 > 3) && (10 < 20 || 5 == 5)')).toBe(true)
      expect(dvala.run('not(5 < 3) && (3 <= 3 || 4 >= 5)')).toBe(true)
    })

    it('handles expressions combining different operators', () => {
      expect(dvala.run('5 + 3 * 2 == 11')).toBe(true)
      expect(dvala.run('(5 + 3) * 2 == 16')).toBe(true)
      expect(dvala.run('[1, 2, 3][1 + 1] == 3')).toBe(true)
      expect(dvala.run('{ a: 10, b: 20 }.a + { a: 5, b: 15 }.b == 25')).toBe(true)
    })

    it('handles complex nested expressions', () => {
      expect(dvala.run('{ a: [1, 2, { b: 3 }] }.a[2].b')).toBe(3)
      expect(dvala.run('[[1, 2], [3, 4]][1][abs(-1)]')).toBe(4)
    })

    test('regexp shorthands', () => {
      expect(dvala.run('"abc" reMatch #"a"')).toBeTruthy()
      expect(dvala.run('"abc" reMatch #"d"')).toBeNull()
    })

    it('handles super complex arithmetic expressions', () => {
      const expressions = [
        '((2 + 3) * 4 / 2 - 1) ^ 2 % 5 + 6 - 7 * 8 / 9',
        '2 ^ 3 * 4 + 5 - 6 / 3 % 2 + (7 - 8) * 9',
        '((10 / 2) + 3) * (4 - 1) ^ 2 % 7',
        '2 ^ (3 + 1) - 5 / (1 + 1)',
        '((2 + 3) * (4 - 1)) ^ 2 % 7 + 6 - 7 * 8 / 9',
        '2 ^ (3 * 2) + 4 / (2 - 1) - 5 % 3',
      ]

      for (const expression of expressions) {

        expect(dvala.run(expression)).toBeCloseTo(eval(expression.replace(/\^/g, '**')))
      }
    })
  })

  describe('error handling', () => {
    it('throws on invalid syntax', () => {
      expect(() => dvala.run('4 + ')).toThrow(DvalaError)
      expect(() => dvala.run('(4 + 5')).toThrow(DvalaError)
    })
  })

  describe('lambda functions', () => {
    it('supports basic lambda function definitions', () => {
      // Testing the provided lambda function example
      expect(dvala.run('(() -> 1)()')).toBe(1)
      expect(dvala.run('((x, y) -> x + y)(3, 4)')).toBe(7)
      expect(dvala.run('((x, y) -> x + y)(10, -5)')).toBe(5)
    })

    it('supports recursion via self', () => {
      expect(dvala.run(`
        let fib = (n, a = 0, b = 1) ->
          if n == 0 then a
          else if n == 1 then b
          else self(n - 1, b, a + b)
          end;

        fib(10)`)).toBe(55)
    })

    it('supports recursion via self (with match)', () => {
      expect(dvala.run(`
        let fib = (n, a = 0, b = 1) ->
          match n
            case 0 then a
            case 1 then b
            case _ then self(n - 1, b, a + b)
          end;

        fib(10)`)).toBe(55)
    })
    it('supports single argument without parentheses', () => {
      expect(dvala.run('(x -> x + 1)(1)')).toBe(2)
      expect(dvala.run('((x) -> x + 1)(1)')).toBe(2)
    })

    it('supports shorthand lambda function definitions', () => {
    // Testing the provided lambda function example
      expect(dvala.run('(-> 1)()')).toBe(1)
      expect(dvala.run('(-> $)(1)')).toBe(1)
      expect(dvala.run('(-> do $ + $2 end)(3, 4)')).toBe(7)
    })

    it('supports lambda functions with no parameters', () => {
      expect(dvala.run('(() -> 42)()')).toBe(42)
      expect(dvala.run('(() -> 10 + 5)()')).toBe(15)
    })

    it('supports lambda functions with rest parameters', () => {
      expect(dvala.run('((...args) -> apply(+, args))(1, 2, 3, 4, 5, 6)')).toBe(21)
      expect(dvala.run('((nbr1, ...args) -> nbr1 + apply(+, args))(1, 2, 3, 4, 5, 6)')).toBe(21)
    })

    it('supports lambda function expressions in data structures', () => {
      expect(dvala.run('map([1, 2, 3], (x) -> x * 2)')).toEqual([2, 4, 6])
      expect(dvala.run('{ fun: ((x) -> x + 1) }.fun(5)')).toBe(6)
    })

    it('supports complex expressions in lambda functions', () => {
      expect(dvala.run('((x, y) -> x ^ 2 + y ^ 2)(3, 4)')).toBe(25)
      expect(dvala.run('((a, b) -> ({ sum: a + b, product: a * b }))(3, 4).sum')).toBe(7)
      expect(dvala.run('((a, b) -> ({ sum: a + b, product: a * b }))(3, 4).product')).toBe(12)
    })

    it('supports lambda functions as return values', () => {
      expect(dvala.run('((op) -> if op == "add" then ((x, y) -> x + y) else ((x, y) -> x - y) end)("add")(5, 3)')).toBe(8)
      expect(dvala.run('((op) -> if op == "add" then ((x, y) -> x + y) else ((x, y) -> x - y) end)("subtract")(5, 3)')).toBe(2)
    })
  })
})
