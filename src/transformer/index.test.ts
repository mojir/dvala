import { describe, expect, test } from 'vitest'
import { tokenize } from '../tokenizer/tokenize'
import { Dvala } from '../Dvala/Dvala'

describe('typeGuards index file', () => {
  test('transformSymbolTokens', () => {
    const dvala = new Dvala()
    const tokenStream = tokenize('a + b', false, undefined)
    expect(dvala.transformSymbols(tokenStream, s => s.toUpperCase()).tokens).toEqual([
      ['Symbol', 'A'],
      ['Whitespace', ' '],
      ['Operator', '+'],
      ['Whitespace', ' '],
      ['Symbol', 'B'],
    ])
  })
})
