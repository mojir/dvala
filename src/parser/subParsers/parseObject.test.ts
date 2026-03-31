import { describe, expect, it } from 'vitest'
import { NodeTypes } from '../../constants/constants'
import { DvalaError } from '../../errors'
import { tokenize } from '../../tokenizer/tokenize'
import { minifyTokenStream } from '../../tokenizer/minifyTokenStream'
import type { ObjectEntry, ObjectNode } from '../../builtin/specialExpressions/object'
import type { AstNode } from '../types'
import { createParserContext } from './parseExpression'
import { parseObject } from './parseObject'

function createCtx(input: string) {
  const tokenStream = tokenize(input, false, undefined)
  const minified = minifyTokenStream(tokenStream, { removeWhiteSpace: true })
  return createParserContext(minified)
}

function getObjectEntries(node: ObjectNode): ObjectEntry[] {
  return node[1]
}

function asPair(entry: ObjectEntry): [AstNode, AstNode] {
  return entry as [AstNode, AstNode]
}

describe('parseObject', () => {
  describe('empty object', () => {
    it('should return a SpecialExpression node with object type', () => {
      const ctx = createCtx('{}')
      const result = parseObject(ctx)
      expect(result[0]).toBe(NodeTypes.Object)
    })

    it('should have no entries', () => {
      const ctx = createCtx('{}')
      const result = parseObject(ctx)
      expect(getObjectEntries(result)).toEqual([])
    })

    it('should consume all tokens', () => {
      const ctx = createCtx('{}')
      parseObject(ctx)
      expect(ctx.isAtEnd()).toBe(true)
    })
  })

  describe('symbol keys', () => {
    it('should parse a symbol key as a String node', () => {
      const ctx = createCtx('{ a: 1 }')
      const result = parseObject(ctx)
      const entries = getObjectEntries(result)
      expect(entries).toHaveLength(1)
      const [key] = asPair(entries[0]!)
      expect(key[0]).toBe(NodeTypes.Str)
      expect(key[1]).toBe('a')
    })

    it('should parse the value as a Number node', () => {
      const ctx = createCtx('{ a: 1 }')
      const result = parseObject(ctx)
      const entries = getObjectEntries(result)
      const [, value] = asPair(entries[0]!)
      expect(value[0]).toBe(NodeTypes.Num)
      expect(value[1]).toBe(1)
    })

    it('should parse multiple symbol keys', () => {
      const ctx = createCtx('{ a: 1, b: 2 }')
      const result = parseObject(ctx)
      const entries = getObjectEntries(result)
      expect(entries).toHaveLength(2)
      const [key1, val1] = asPair(entries[0]!)
      expect(key1[1]).toBe('a')
      expect(val1[1]).toBe(1)
      const [key2, val2] = asPair(entries[1]!)
      expect(key2[1]).toBe('b')
      expect(val2[1]).toBe(2)
    })

    it('should consume all tokens', () => {
      const ctx = createCtx('{ a: 1, b: 2 }')
      parseObject(ctx)
      expect(ctx.isAtEnd()).toBe(true)
    })
  })

  describe('string keys', () => {
    it('should parse a double-quoted string key', () => {
      const ctx = createCtx('{ "foo": 1 }')
      const result = parseObject(ctx)
      const entries = getObjectEntries(result)
      const [key] = asPair(entries[0]!)
      expect(key[0]).toBe(NodeTypes.Str)
      expect(key[1]).toBe('foo')
    })

    it('should parse a string key with spaces', () => {
      const ctx = createCtx('{ " ": 10 }')
      const result = parseObject(ctx)
      const entries = getObjectEntries(result)
      const [key] = asPair(entries[0]!)
      expect(key[1]).toBe(' ')
    })

    it('should parse a string key with escape sequences', () => {
      const ctx = createCtx('{ "a\\nb": 1 }')
      const result = parseObject(ctx)
      const entries = getObjectEntries(result)
      const [key] = asPair(entries[0]!)
      expect(key[1]).toBe('a\nb')
    })
  })

  describe('quoted symbol keys', () => {
    it('should parse a quoted symbol key and strip quotes', () => {
      const ctx = createCtx('{ \'foo bar\': 1 }')
      const result = parseObject(ctx)
      const entries = getObjectEntries(result)
      const [key] = asPair(entries[0]!)
      expect(key[0]).toBe(NodeTypes.Str)
      expect(key[1]).toBe('foo bar')
    })
  })

  describe('computed keys', () => {
    it('should parse a computed key with a string expression', () => {
      const ctx = createCtx('{ ["a"]: 1 }')
      const result = parseObject(ctx)
      const entries = getObjectEntries(result)
      // Computed key is the parsed expression (String node)
      const [key] = asPair(entries[0]!)
      expect(key[0]).toBe(NodeTypes.Str)
      expect(key[1]).toBe('a')
    })

    it('should parse a computed key with a complex expression', () => {
      const ctx = createCtx('{ ["a" ++ "b"]: 1 }')
      const result = parseObject(ctx)
      const entries = getObjectEntries(result)
      // Computed key is a NormalExpression for ++
      const [key] = asPair(entries[0]!)
      expect(key[0]).toBe(NodeTypes.Call)
    })

    it('should consume the closing bracket', () => {
      const ctx = createCtx('{ ["a"]: 1 }')
      parseObject(ctx)
      expect(ctx.isAtEnd()).toBe(true)
    })
  })

  describe('spread operator', () => {
    it('should parse spread as a Spread node', () => {
      const ctx = createCtx('{ ...x }')
      const result = parseObject(ctx)
      const entries = getObjectEntries(result)
      expect(entries).toHaveLength(1)
      expect((entries[0]! as AstNode)[0]).toBe(NodeTypes.Spread)
    })

    it('should parse spread payload as the expression', () => {
      const ctx = createCtx('{ ...x }')
      const result = parseObject(ctx)
      const entries = getObjectEntries(result)
      // Spread payload is a Sym node for 'x'
      const spreadNode = entries[0]! as AstNode
      const spreadPayload = spreadNode[1] as AstNode
      expect(spreadPayload[0]).toBe(NodeTypes.Sym)
      expect(spreadPayload[1]).toBe('x')
    })

    it('should parse spread mixed with key-value pairs', () => {
      const ctx = createCtx('{ ...x, a: 1 }')
      const result = parseObject(ctx)
      const entries = getObjectEntries(result)
      expect(entries).toHaveLength(2)
      expect((entries[0]! as AstNode)[0]).toBe(NodeTypes.Spread)
      const [key, value] = asPair(entries[1]!)
      expect(key[0]).toBe(NodeTypes.Str)
      expect(key[1]).toBe('a')
      expect(value[0]).toBe(NodeTypes.Num)
      expect(value[1]).toBe(1)
    })

    it('should parse multiple spreads', () => {
      const ctx = createCtx('{ ...x, ...y }')
      const result = parseObject(ctx)
      const entries = getObjectEntries(result)
      expect(entries).toHaveLength(2)
      expect((entries[0]! as AstNode)[0]).toBe(NodeTypes.Spread)
      expect((entries[1]! as AstNode)[0]).toBe(NodeTypes.Spread)
    })
  })

  describe('expression values', () => {
    it('should parse arithmetic expression values', () => {
      const ctx = createCtx('{ a: 2 + 3 }')
      const result = parseObject(ctx)
      const entries = getObjectEntries(result)
      // Value is a NormalExpression node for +
      const [, value] = asPair(entries[0]!)
      expect(value[0]).toBe(NodeTypes.Call)
    })

    it('should parse boolean values', () => {
      const ctx = createCtx('{ a: true }')
      const result = parseObject(ctx)
      const entries = getObjectEntries(result)
      const [, value] = asPair(entries[0]!)
      expect(value[0]).toBe(NodeTypes.Reserved)
      expect(value[1]).toBe('true')
    })

    it('should parse null values', () => {
      const ctx = createCtx('{ a: null }')
      const result = parseObject(ctx)
      const entries = getObjectEntries(result)
      const [, value] = asPair(entries[0]!)
      expect(value[0]).toBe(NodeTypes.Reserved)
      expect(value[1]).toBe('null')
    })

    it('should parse string values', () => {
      const ctx = createCtx('{ a: "hello" }')
      const result = parseObject(ctx)
      const entries = getObjectEntries(result)
      const [, value] = asPair(entries[0]!)
      expect(value[0]).toBe(NodeTypes.Str)
      expect(value[1]).toBe('hello')
    })
  })

  describe('nested objects', () => {
    it('should parse nested object as a SpecialExpression', () => {
      const ctx = createCtx('{ a: { b: 1 } }')
      const result = parseObject(ctx)
      const entries = getObjectEntries(result)
      const [, value] = asPair(entries[0]!)
      expect(value[0]).toBe(NodeTypes.Object)
    })

    it('should parse deeply nested objects', () => {
      const ctx = createCtx('{ a: { b: { c: 1 } } }')
      const result = parseObject(ctx)
      const entries = getObjectEntries(result)
      const [, value] = asPair(entries[0]!)
      const innerEntries = value[1] as ObjectEntry[]
      const [, innerValue] = asPair(innerEntries[0]!)
      expect(innerValue[0]).toBe(NodeTypes.Object)
    })
  })

  describe('trailing comma', () => {
    it('should allow trailing comma', () => {
      const ctx = createCtx('{ a: 1, b: 2, }')
      const result = parseObject(ctx)
      const entries = getObjectEntries(result)
      expect(entries).toHaveLength(2)
      expect(ctx.isAtEnd()).toBe(true)
    })

    it('should allow trailing comma with single entry', () => {
      const ctx = createCtx('{ a: 1, }')
      const result = parseObject(ctx)
      const entries = getObjectEntries(result)
      expect(entries).toHaveLength(1)
    })
  })

  describe('context position advancement', () => {
    it('should advance past the closing brace', () => {
      const ctx = createCtx('{ a: 1 }')
      parseObject(ctx)
      expect(ctx.isAtEnd()).toBe(true)
    })

    it('should leave remaining tokens after the object', () => {
      const ctx = createCtx('{ a: 1 } ;')
      parseObject(ctx)
      expect(ctx.isAtEnd()).toBe(false)
    })
  })

  describe('shorthand properties', () => {
    it('should parse { foo } as { foo: foo }', () => {
      const ctx = createCtx('{ foo }')
      const result = parseObject(ctx)
      const entries = getObjectEntries(result)
      expect(entries).toHaveLength(1)
      const [key, value] = asPair(entries[0]!)
      expect(key[0]).toBe(NodeTypes.Str)
      expect(key[1]).toBe('foo')
      expect(value[0]).toBe(NodeTypes.Sym)
      expect(value[1]).toBe('foo')
    })

    it('should parse multiple shorthand properties', () => {
      const ctx = createCtx('{ a, b, c }')
      const result = parseObject(ctx)
      const entries = getObjectEntries(result)
      expect(entries).toHaveLength(3)
      for (const [i, name] of (['a', 'b', 'c'] as const).entries()) {
        const [key, value] = asPair(entries[i]!)
        expect(key[0]).toBe(NodeTypes.Str)
        expect(key[1]).toBe(name)
        expect(value[0]).toBe(NodeTypes.Sym)
        expect(value[1]).toBe(name)
      }
    })

    it('should mix shorthand and explicit properties', () => {
      const ctx = createCtx('{ a, b: 2, c }')
      const result = parseObject(ctx)
      const entries = getObjectEntries(result)
      expect(entries).toHaveLength(3)
      const [k0, v0] = asPair(entries[0]!)
      expect(k0[1]).toBe('a')
      expect(v0[0]).toBe(NodeTypes.Sym)
      const [k1, v1] = asPair(entries[1]!)
      expect(k1[1]).toBe('b')
      expect(v1[0]).toBe(NodeTypes.Num)
      const [k2, v2] = asPair(entries[2]!)
      expect(k2[1]).toBe('c')
      expect(v2[0]).toBe(NodeTypes.Sym)
    })

    it('should not apply shorthand to quoted symbol keys', () => {
      const ctx = createCtx("{ 'foo bar': 1 }")
      const result = parseObject(ctx)
      const entries = getObjectEntries(result)
      const [key, value] = asPair(entries[0]!)
      expect(key[1]).toBe('foo bar')
      expect(value[0]).toBe(NodeTypes.Num)
    })
  })

  describe('error cases', () => {
    it('should throw on numeric key', () => {
      const ctx = createCtx('{ 1: 1 }')
      expect(() => parseObject(ctx)).toThrow(DvalaError)
    })

    it('should throw on missing colon', () => {
      const ctx = createCtx('{ a 1 }')
      expect(() => parseObject(ctx)).toThrow(DvalaError)
    })

    it('should throw on missing value', () => {
      const ctx = createCtx('{ a: }')
      expect(() => parseObject(ctx)).toThrow(DvalaError)
    })

    it('should throw on missing closing brace', () => {
      const ctx = createCtx('{ a: 1')
      expect(() => parseObject(ctx)).toThrow(DvalaError)
    })

    it('should throw on consecutive commas', () => {
      const ctx = createCtx('{ a: 1,, b: 2 }')
      expect(() => parseObject(ctx)).toThrow(DvalaError)
    })

    it('should throw on missing comma between entries', () => {
      const ctx = createCtx('{ a: 1 b: 2 }')
      expect(() => parseObject(ctx)).toThrow(DvalaError)
    })

    it('should throw on computed key without closing bracket', () => {
      const ctx = createCtx('{ [a: 1 }')
      expect(() => parseObject(ctx)).toThrow(DvalaError)
    })

    it('should throw when first token is not LBrace', () => {
      const ctx = createCtx('a: 1')
      expect(() => parseObject(ctx)).toThrow(DvalaError)
    })
  })
})
