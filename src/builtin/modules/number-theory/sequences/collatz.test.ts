import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../../createDvala'
import { numberTheoryModule } from '..'
import { DvalaError } from '../../../../errors'

const dvala = createDvala({ modules: [numberTheoryModule] })

function runNth(code: string) {
  return dvala.run(`let nt = import("numberTheory"); ${code.replace(/nth:/g, 'nt.')}`)
}
describe('collatz', () => {
  it('should return the correct sequence', () => {
    expect(runNth('nth:collatzSeq(11)')).toEqual([
      11,
      34,
      17,
      52,
      26,
      13,
      40,
      20,
      10,
      5,
      16,
      8,
      4,
      2,
      1,
    ])
    expect(() => runNth('nth:collatzSeq(0)')).toThrow(DvalaError)
  })
})
