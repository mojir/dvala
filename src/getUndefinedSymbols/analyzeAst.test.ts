import { describe, expect, it } from 'vitest'
import { Dvala } from '../Dvala/Dvala'

describe('analyze', () => {
  describe('getUndefinedSymbols.', () => {
    for (const dvala of [new Dvala(), new Dvala({ debug: true })]) {
      it('example', () => {
        const program = 'a + b'
        const tokens = dvala.tokenize(program, { minify: true })
        const ast = dvala.parse(tokens)
        expect(dvala.getUndefinedSymbols(ast)).toEqual(new Set(['a', 'b']))
      })
    }
  })
})
