import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../../createDvala'
import { numberTheoryModule } from '..'
import { DvalaError } from '../../../../errors'

const dvala = createDvala({ modules: [numberTheoryModule] })

function runNth(code: string) {
  return dvala.run(`let nt = import(number-theory); ${code.replace(/nth:/g, 'nt.')}`)
}
describe('bernoulli', () => {
  it('should return the correct sequence', () => {
    expect((runNth('nth:bernoulliSeq(7)') as number[])[0]).toBeCloseTo(1, 10)
    expect((runNth('nth:bernoulliSeq(7)') as number[])[1]).toBe(-0.5)
    expect((runNth('nth:bernoulliSeq(7)') as number[])[2]).toBeCloseTo(1 / 6, 10)
    expect((runNth('nth:bernoulliSeq(7)') as number[])[3]).toBe(0)
    expect((runNth('nth:bernoulliSeq(7)') as number[])[4]).toBeCloseTo(-1 / 30, 10)
    expect((runNth('nth:bernoulliSeq(7)') as number[])[5]).toBe(0)
    expect((runNth('nth:bernoulliSeq(7)') as number[])[6]).toBeCloseTo(1 / 42, 10)
    expect(() => runNth('nth:bernoulliSeq(0)')).toThrow(DvalaError)
  })

  it('should return the correct nth term', () => {
    expect(runNth('nth:bernoulliNth(1)')).toBe(1)
    expect(runNth('nth:bernoulliNth(2)')).toBe(-0.5)
    expect(runNth('nth:bernoulliNth(3)')).toBe(1 / 6)
    expect(runNth('nth:bernoulliNth(4)')).toBe(0)
    expect(runNth('nth:bernoulliNth(29)')).toBeCloseTo(-27298230.14735771, 10)
  })

  it('should return the correct takeWhile sequence', () => {
    expect(runNth('nth:bernoulliTakeWhile(-> $ != 0)')).toEqual([1, -0.5, 1 / 6])
  })
})
