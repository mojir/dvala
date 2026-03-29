import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../../createDvala'
import { numberTheoryModule } from '..'
import { DvalaError } from '../../../../errors'

const dvala = createDvala({ modules: [numberTheoryModule] })

function runNth(code: string) {
  return dvala.run(`let nt = import("numberTheory"); ${code.replace(/nth:/g, 'nt.')}`)
}
describe('perfect', () => {
  it('should return the correct sequence', () => {
    expect(runNth('nth:perfectSeq(1)')).toEqual([6])
    expect(runNth('nth:perfectSeq(2)')).toEqual([6, 28])
    expect(runNth('nth:perfectSeq(3)')).toEqual([6, 28, 496])
    expect(runNth('nth:perfectSeq(4)')).toEqual([6, 28, 496, 8128])
    expect(runNth('nth:perfectSeq(7)')).toEqual([6, 28, 496, 8128, 33550336, 8589869056, 137438691328])
    expect(runNth('nth:perfectSeq()')).toEqual([6, 28, 496, 8128, 33550336, 8589869056, 137438691328])
    expect(() => runNth('nth:perfectSeq(0)')).toThrow(DvalaError)
    expect(() => runNth('nth:perfectSeq(20)')).toThrow(DvalaError)
  })

  it('should return the correct nth term', () => {
    expect(runNth('nth:perfectNth(1)')).toEqual(6)
    expect(runNth('nth:perfectNth(2)')).toEqual(28)
    expect(runNth('nth:perfectNth(3)')).toEqual(496)
    expect(runNth('nth:perfectNth(4)')).toEqual(8128)
    expect(runNth('nth:perfectNth(7)')).toEqual(137438691328)
  })

  it('should return the correct takeWhile sequence', () => {
    expect(runNth('nth:perfectTakeWhile(-> $ < 1000)')).toEqual([6, 28, 496])
    expect(runNth('nth:perfectTakeWhile(-> true)')).toEqual([6, 28, 496, 8128, 33550336, 8589869056, 137438691328])
  })

  it('should determine if numbers are in the sequence', () => {
    expect(runNth('nth:isPerfect(0)')).toEqual(false)
    expect(runNth('nth:isPerfect(1)')).toEqual(false)
    expect(runNth('nth:isPerfect(2)')).toEqual(false)
    expect(runNth('nth:isPerfect(3)')).toEqual(false)
    expect(runNth('nth:isPerfect(4)')).toEqual(false)
    expect(runNth('nth:isPerfect(5)')).toEqual(false)
    expect(runNth('nth:isPerfect(6)')).toEqual(true)
    expect(runNth('nth:isPerfect(7)')).toEqual(false)
    expect(runNth('nth:isPerfect(8)')).toEqual(false)
    expect(runNth('nth:isPerfect(9)')).toEqual(false)
    expect(runNth('nth:isPerfect(137438691328)')).toEqual(true)
    expect(runNth('nth:isPerfect(137438691329)')).toEqual(false)
  })
})
