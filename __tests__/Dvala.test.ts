import { beforeEach, describe, expect, it } from 'vitest'
import { createDvala } from '../src/createDvala'
import { DvalaError, UndefinedSymbolError } from '../src/errors'
import { Cache } from '../src/Cache'
import { getAutoCompleter, getUndefinedSymbols, tokenizeSource, transformSymbols, untokenize } from '../src/tooling'
import type { Ast } from '../src/parser/types'
import { NodeTypes } from '../src/constants/constants'
import { vectorModule } from '../src/builtin/modules/vector'

describe('all tests', () => {
  describe('auto completer', () => {
    it('should return empty array if no token stream', () => {
      const autoCompleter = getAutoCompleter('', 0)
      expect(autoCompleter.getNextSuggestion()).toBeNull()
    })
    it('should return empty array if invalid token stream', () => {
      const autoCompleter = getAutoCompleter('12s', 3)
      expect(autoCompleter.getNextSuggestion()).toBeNull()
    })
    it('should return xxx', () => {
      const autoCompleter = getAutoCompleter('1 + xx + 2', 6, { bindings: { xxx: 1 } })
      expect(autoCompleter.getNextSuggestion()).toEqual({
        program: '1 + xxx + 2',
        position: 7,
      })
    })
  })

  describe('bindings', () => {
    let dvala: ReturnType<typeof createDvala>
    beforeEach(() => {
      dvala = createDvala({ debug: true })
    })
    it('a function via bindings.', () => {
      dvala = createDvala({ cache: 10 })
      const bindings = dvala.run('let tripple = (x) -> do x * 3 end; {tripple: tripple}') as Record<string, unknown>
      expect(dvala.run('tripple(10)', { bindings })).toBe(30)
      expect(dvala.run('tripple(10)', { bindings })).toBe(30)
    })

    it('a function - no cache', () => {
      dvala = createDvala({ debug: true })
      const bindings = dvala.run('let tripple = (x) -> do x * 3 end; {tripple: tripple}') as Record<string, unknown>
      expect(dvala.run('tripple(10)', { bindings })).toBe(30)
      expect(dvala.run('tripple(10)', { bindings })).toBe(30)
    })

    it('a variable.', () => {
      const bindings = dvala.run('let magicNumber = 42; {magicNumber: magicNumber}') as Record<string, unknown>
      expect(dvala.run('magicNumber', { bindings })).toBe(42)
    })

    it('a variable - again.', () => {
      const bindings = dvala.run(`
    let isZip = (input) -> do boolean(reMatch(input, #"^\\d{5}$")) end;
    let NAME_LENGTH = 100;
    {isZip: isZip, NAME_LENGTH: NAME_LENGTH}
    `) as Record<string, unknown>
      expect(dvala.run('NAME_LENGTH', { bindings })).toBe(100)
    })

    it('a function with a built in normal expression name', () => {
      expect(() => dvala.run('let inc = (x) -> x + 1 end')).toThrow(DvalaError)
    })

    it('a function with a built in special expression name', () => {
      expect(() => dvala.run('let and = (x) -> x + 1 end')).toThrow(DvalaError)
    })

    it('more than one', () => {
      const bindings1 = dvala.run('let tripple = (x) -> do x * 3 end; {tripple: tripple}') as Record<string, unknown>
      const bindings2 = dvala.run('let magicNumber = 42; {magicNumber: magicNumber}') as Record<string, unknown>
      const bindings = { ...bindings1, ...bindings2 }
      expect(dvala.run('tripple(magicNumber)', { bindings })).toBe(126)
    })
  })

  function ast(n: number): Ast {
    return {
      body: [[NodeTypes.Number, n, 0]],
    }
  }

  describe('cache', () => {
    it('cannot set same key twice', () => {
      const cache = new Cache(10)
      cache.set('a', ast(1))
      expect(() => cache.set('a', ast(2))).toThrow()
    })

    it('getContent', () => {
      const cache = new Cache(10)
      cache.set('a', ast(1))
      cache.set('b', ast(2))
      expect(cache.getContent()).toEqual({
        a: ast(1),
        b: ast(2),
      })
    })
    it('getContent (null)', () => {
      const cache = new Cache(null)
      cache.set('a', ast(1))
      cache.set('b', ast(2))
      expect(cache.getContent()).toEqual({
        a: ast(1),
        b: ast(2),
      })
    })

    it('max cache size must be at least 1', () => {
      expect(() => new Cache(-1)).toThrow()
      expect(() => new Cache(0)).toThrow()
      expect(() => new Cache(0.1)).not.toThrow()
      expect(() => new Cache(1)).not.toThrow()
    })

    it('add an entry.', () => {
      const cache = new Cache(10)
      expect(cache.size).toBe(0)
      cache.set('a', ast(1))
      expect(cache.size).toBe(1)
      expect(cache.get('a')).toEqual(ast(1))
      expect(cache.has('a')).toBe(true)
    })

    it('clear cache.', () => {
      const cache = new Cache(10)
      cache.set('a', ast(1))
      cache.set('b', ast(2))
      cache.set('c', ast(3))
      expect(cache.size).toBe(3)
      cache.clear()
      expect(cache.size).toBe(0)
    })

    it('add an entry - cacheSize = 1', () => {
      const cache = new Cache(1)
      expect(cache.size).toBe(0)
      cache.set('a', ast(1))
      expect(cache.size).toBe(1)
      expect(cache.get('a')).toEqual(ast(1))
    })
    it('maxSize.', () => {
      const cache = new Cache(1)
      cache.set('a', ast(1))
      expect(cache.get('a')).toEqual(ast(1))
      cache.set('b', ast(2))
      expect(cache.size).toBe(1)
      expect(cache.get('a')).toBeUndefined()
      expect(cache.has('a')).toBe(false)
      expect(cache.get('b')).toEqual(ast(2))
      expect(cache.has('b')).toBe(true)
    })
  })

  describe('regressions', () => {
    let dvala: ReturnType<typeof createDvala>
    beforeEach(() => {
      dvala = createDvala({ debug: true })
    })
    it('sourceCodeInfo', () => {
      try {
        dvala.run('let n = 3; n + m') // m is undefined
      } catch (error) {
        expect((error as DvalaError).sourceCodeInfo?.position.line).toBe(1)

        expect((error as DvalaError).sourceCodeInfo?.position.column).toBe(16)
      }
    })
    it('name not recognized', () => {
      expect(() => dvala.run('asd()')).toThrowError(UndefinedSymbolError)
      expect(() => dvala.run('asd')).toThrowError(UndefinedSymbolError)
    })

    it('unexpected argument', () => {
      try {
        dvala.run('1 + + 2')
      } catch (error) {

        const anyError = error as any

        expect(anyError.sourceCodeInfo.position.line).toBe(1)

        expect(anyError.sourceCodeInfo.position.column).toBe(7)
      }
    })

    it('shoud handle double quoted in strings', () => {
    // You need to escape double quote with a backslash
      expect(dvala.run('"\\""')).toBe('"')
      // You need to escape backslash with a backslash if it is at the end of the string
      expect(dvala.run('"\\\\"')).toBe('\\')
      // You need to escape backslash with a backslash if it is followed by a double quote
      expect(dvala.run('"\\"\\\\\\""')).toBe('"\\"')
      // Backslash before normal character is returning the character itself
      expect(dvala.run('"\\abc"')).toBe('abc')
    })
  })

  describe('getUndefinedSymbols', () => {
    it('should find undefined symbols from string input', () => {
      const result = getUndefinedSymbols('x + y')
      expect(result).toEqual(new Set(['x', 'y']))
    })

    it('should return empty set when all symbols are defined', () => {
      const result = getUndefinedSymbols('1 + 2')
      expect(result).toEqual(new Set())
    })

    it('should return empty set for import expression', () => {
      const result = getUndefinedSymbols('let v = import(vector); v.sum([1, 2])', { modules: [vectorModule] })
      expect(result).toEqual(new Set())
    })
  })

  describe('transformSymbols', () => {
    it('should transform symbol tokens', () => {
      const tokenStream = tokenizeSource('x + y')
      const transformed = transformSymbols(tokenStream, s => s === 'x' ? 'a' : s)
      const result = untokenize(transformed)
      expect(result).toBe('a + y')
    })
  })

  describe('untokenize', () => {
    it('should convert token stream back to source code', () => {
      const tokenStream = tokenizeSource('1 + 2')
      const result = untokenize(tokenStream)
      expect(result).toBe('1 + 2')
    })
  })
})
