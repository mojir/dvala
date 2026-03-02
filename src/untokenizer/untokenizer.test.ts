import { describe, expect, it } from 'vitest'
import { Dvala } from '../Dvala/Dvala'

const examples = [
  '1 + 2',
  '-1 * (2 - 3)',
]

describe('untokenizer', () => {
  describe('untokenize', () => {
    it('should untokenize Examples', () => {
      const dvala = new Dvala()
      for (const example of examples) {
        const tokenStream = dvala.tokenize(example)
        const result = dvala.untokenize(tokenStream)
        expect(result).toBe(example)
      }
    })
  })
})
