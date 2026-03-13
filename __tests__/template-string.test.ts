import { describe, expect, it } from 'vitest'
import { createDvala } from '../src/createDvala'
import { getUndefinedSymbols, tokenizeSource } from '../src/tooling'

const d = createDvala()
const run = (src: string, bindings?: Record<string, unknown>) => d.run(src, { bindings })

describe('template strings', () => {
  describe('tokenizer', () => {
    it('produces a TemplateString token for a backtick string', () => {
      const stream = tokenizeSource('`hello`')
      expect(stream.tokens[0]![0]).toBe('TemplateString')
      expect(stream.tokens[0]![1]).toBe('`hello`')
    })

    it('handles interpolation in token value', () => {
      const stream = tokenizeSource('`hello ${name}`')
      expect(stream.tokens[0]![0]).toBe('TemplateString')
      expect(stream.tokens[0]![1]).toBe('`hello ${name}`')
    })

    it('handles nested braces inside interpolation', () => {
      const stream = tokenizeSource('`${{a: 1}.a}`')
      expect(stream.tokens[0]![0]).toBe('TemplateString')
    })

    it('errors on unclosed template string', () => {
      const stream = tokenizeSource('`hello')
      expect(stream.tokens[0]![0]).toBe('Error')
    })
  })

  describe('basic interpolation', () => {
    it('evaluates a plain template string', () => {
      expect(run('`hello world`')).toBe('hello world')
    })

    it('empty template string returns empty string', () => {
      expect(run('``')).toBe('')
    })

    it('interpolates a number binding', () => {
      expect(run('`value is ${x}`', { x: 42 })).toBe('value is 42')
    })

    it('interpolates a string binding', () => {
      expect(run('`hello ${name}!`', { name: 'world' })).toBe('hello world!')
    })

    it('interpolates an arithmetic expression', () => {
      expect(run('`1 + 1 = ${1 + 1}`')).toBe('1 + 1 = 2')
    })

    it('interpolates multiple expressions', () => {
      expect(run('`${fname} ${lname}`', { fname: 'John', lname: 'Doe' })).toBe('John Doe')
    })

    it('only interpolation, no surrounding text', () => {
      expect(run('`${42}`')).toBe('42')
    })

    it('adjacent interpolations', () => {
      expect(run('`${1}${2}${3}`')).toBe('123')
    })
  })

  describe('expression types in interpolation', () => {
    it('function call', () => {
      expect(run('`length: ${count([1, 2, 3])}`')).toBe('length: 3')
    })

    it('conditional expression', () => {
      expect(run('`${if x > 0 then "pos" else "neg" end}`', { x: 5 })).toBe('pos')
    })

    it('string inside interpolation', () => {
      expect(run('`prefix-${"middle"}-suffix`')).toBe('prefix-middle-suffix')
    })

    it('object literal inside interpolation', () => {
      expect(run('`val=${get({a: 99}, "a")}`')).toBe('val=99')
    })

    it('null coerces to "null"', () => {
      expect(run('`${null}`')).toBe('null')
    })

    it('boolean coerces to string', () => {
      expect(run('`${true}`')).toBe('true')
    })
  })

  describe('multiline', () => {
    it('supports newlines in template string', () => {
      expect(run('`line1\nline2`')).toBe('line1\nline2')
    })
  })

  describe('nested template strings', () => {
    it('nested template inside interpolation', () => {
      expect(run('`outer ${`inner`}`')).toBe('outer inner')
    })

    it('nested template with interpolation', () => {
      expect(run('`a ${`b ${x}`} c`', { x: 'X' })).toBe('a b X c')
    })
  })

  describe('getUndefinedSymbols', () => {
    it('reports undefined symbols inside interpolation', () => {
      const undefs = getUndefinedSymbols('`hello ${missingVar}`')
      expect(undefs.has('missingVar')).toBe(true)
    })

    it('does not report defined symbols', () => {
      const undefs = getUndefinedSymbols('`hello ${x}`', { bindings: { x: 1 } })
      expect(undefs.has('x')).toBe(false)
    })

    it('reports no undefined symbols for plain template', () => {
      const undefs = getUndefinedSymbols('`hello world`')
      expect(undefs.size).toBe(0)
    })
  })

  describe('edge cases', () => {
    it('template string as function argument', () => {
      expect(run('count(`hello`)')).toBe(5)
    })

    it('template string in let binding', () => {
      expect(run('let msg = `hi ${name}`; msg', { name: 'Alice' })).toBe('hi Alice')
    })

    it('template string in array', () => {
      expect(run('[`a${1}`, `b${2}`]')).toEqual(['a1', 'b2'])
    })
  })
})
