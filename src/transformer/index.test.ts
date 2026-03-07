import { describe, expect, test } from 'vitest'
import { tokenizeSource, transformSymbols } from '../tooling'

describe('typeGuards index file', () => {
  test('transformSymbolTokens', () => {
    const tokenStream = tokenizeSource('a + b')
    expect(transformSymbols(tokenStream, s => s.toUpperCase()).tokens).toEqual([
      ['Symbol', 'A'],
      ['Whitespace', ' '],
      ['Operator', '+'],
      ['Whitespace', ' '],
      ['Symbol', 'B'],
    ])
  })
})
