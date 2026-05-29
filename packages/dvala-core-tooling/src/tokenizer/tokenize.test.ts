import { describe, expect, test } from 'vitest'
import { minifyTokenStream } from './minifyTokenStream'
import { tokenize } from './tokenize'

describe('tokenenizers', () => {
  test('tokenize errors', () => {
    expect(tokenize('1.e0', false, undefined).tokens[0]).toEqual([
      'Error',
      '1.e',
      undefined,
      'Invalid number format at position 3',
    ])
    expect(tokenize('0o8', false, undefined).tokens[0]).toEqual([
      'Error',
      '0o',
      undefined,
      'Invalid number format at position 2',
    ])
    expect(tokenize('0xfg', false, undefined).tokens[0]).toEqual([
      'Error',
      '0x',
      undefined,
      'Invalid number format at position 2',
    ])
    expect(tokenize('0a', false, undefined).tokens[0]).toEqual([
      'Error',
      '0a',
      undefined,
      'Invalid number format at position 2',
    ])
    expect(tokenize('"0a', false, undefined).tokens[0]).toEqual([
      'Error',
      '"0a',
      undefined,
      'Unclosed string at position 0',
    ])
    expect(tokenize('10_.0', false, undefined).tokens[0]).toEqual([
      'Error',
      '10_',
      undefined,
      'Invalid number format at position 3',
    ])
    expect(tokenize('#"ads', false, undefined).tokens[0]).toEqual([
      'Error',
      '#"ads',
      undefined,
      'Unclosed regexp at position 0',
    ])
    expect(tokenize('/* ', false, undefined).tokens[0]).toEqual([
      'Error',
      '/*',
      undefined,
      'Unclosed multi-line comment at position 0',
    ])
    expect(tokenize("' ", false, undefined).tokens[0]).toEqual([
      'Error',
      "' ",
      undefined,
      'Unclosed quoted symbol at position 0',
    ])
  })
  test('numbers followed by operators without spaces', () => {
    const tokens0div1 = tokenize('0/1', false, undefined).tokens
    expect(tokens0div1[0]).toEqual(['Number', '0'])
    expect(tokens0div1[1]).toEqual(['Operator', '/'])
    expect(tokens0div1[2]).toEqual(['Number', '1'])

    const tokens2minus1 = tokenize('2-1', false, undefined).tokens
    expect(tokens2minus1[0]).toEqual(['Number', '2'])
    expect(tokens2minus1[1]).toEqual(['Operator', '-'])
    expect(tokens2minus1[2]).toEqual(['Number', '1'])

    const tokens5star3 = tokenize('5*3', false, undefined).tokens
    expect(tokens5star3[0]).toEqual(['Number', '5'])
    expect(tokens5star3[1]).toEqual(['Operator', '*'])
    expect(tokens5star3[2]).toEqual(['Number', '3'])
  })
  test('tokenize shebang', () => {
    expect(tokenize('#!...\n10', false, undefined).tokens.length).toBe(3)
    expect(tokenize('#!...', false, undefined).tokens.length).toBe(1)
  })
  test('shebang token is filtered out by minifyTokenStream', () => {
    // Regression: tokenizeShebang previously emitted 'SingleLineComment' instead
    // of 'Shebang', causing isShebangToken to always return false and the shebang
    // to pass through minification as a comment token rather than being stripped.
    const stream = tokenize('#!/usr/bin/env dvala\nlet x = 1', false, undefined)
    expect(stream.tokens[0]![0]).toBe('Shebang')
    const minified = minifyTokenStream(stream, { removeWhiteSpace: true })
    const types = minified.tokens.map(t => t[0])
    expect(types).not.toContain('Shebang')
    expect(types).not.toContain('SingleLineComment')
  })

  test('tokenize effect names before bare @ operator', () => {
    const tokens = minifyTokenStream(
      tokenize('perform(@test.log, x); let t: () -> @{test.log} Null = f', false, undefined),
      { removeWhiteSpace: true },
    ).tokens

    expect(tokens).toContainEqual(['EffectName', 'test.log'])
    expect(tokens).toContainEqual(['Operator', '@'])
    expect(tokens).toContainEqual(['LBrace', '{'])
  })
})
