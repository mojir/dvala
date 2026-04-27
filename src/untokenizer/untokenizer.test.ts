import { describe, expect, it } from 'vitest'
import { tokenizeSource, untokenize } from '../tooling'

const examples = ['1 + 2', '-1 * (2 - 3)']

describe('untokenizer', () => {
  describe('untokenize', () => {
    it('should untokenize Examples', () => {
      for (const example of examples) {
        const tokenStream = tokenizeSource(example)
        const result = untokenize(tokenStream)
        expect(result).toBe(example)
      }
    })
  })
})
