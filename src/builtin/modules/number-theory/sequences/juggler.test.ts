import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../../createDvala'
import { numberTheoryModule } from '..'
import { DvalaError } from '../../../../errors'

const dvala = createDvala({ modules: [numberTheoryModule] })

function runNth(code: string) {
  return dvala.run(`let nt = import(numberTheory); ${code.replace(/nth:/g, 'nt.')}`)
}
describe('juggler', () => {
  it('should return the correct sequence', () => {
    expect(runNth('nth:jugglerSeq(10)')).toEqual([
      10,
      3,
      5,
      11,
      36,
      6,
      2,
      1,
    ])
    expect(() => runNth('nth:jugglerSeq(0)')).toThrow(DvalaError)
    expect(() => runNth('nth:jugglerSeq(58025)')).toThrow(DvalaError)
  })
})
