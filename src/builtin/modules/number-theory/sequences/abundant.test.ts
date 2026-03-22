import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../../createDvala'
import { numberTheoryModule } from '..'
import { DvalaError } from '../../../../errors'

const dvala = createDvala({ modules: [numberTheoryModule] })

function runNth(code: string) {
  return dvala.run(`let nt = import(numberTheory); ${code.replace(/nth:/g, 'nt.')}`)
}
describe('abundant', () => {
  it('should return the correct sequence', () => {
    expect(runNth('nth:abundantSeq(1)')).toEqual([12])
    expect(runNth('nth:abundantSeq(2)')).toEqual([12, 18])
    expect(runNth('nth:abundantSeq(3)')).toEqual([12, 18, 20])
    expect(runNth('nth:abundantSeq(21)')).toEqual([12, 18, 20, 24, 30, 36, 40, 42, 48, 54, 56, 60, 66, 70, 72, 78, 80, 84, 88, 90, 96])
    expect(() => runNth('nth:abundantSeq(0)')).toThrow(DvalaError)
  })

  it('should return the correct nth term', () => {
    expect(runNth('nth:abundantNth(1)')).toEqual(12)
    expect(runNth('nth:abundantNth(2)')).toEqual(18)
    expect(runNth('nth:abundantNth(3)')).toEqual(20)
    expect(runNth('nth:abundantNth(4)')).toEqual(24)
  })

  it('should return the correct takeWhile sequence', () => {
    expect(runNth('nth:abundantTakeWhile(-> $ < 20)')).toEqual([
      12,
      18,
    ])
  })

  it('should determine if numbers are in the sequence', () => {
    expect(runNth('nth:isAbundant(0)')).toEqual(false)
    expect(runNth('nth:isAbundant(1)')).toEqual(false)
    expect(runNth('nth:isAbundant(2)')).toEqual(false)
    expect(runNth('nth:isAbundant(3)')).toEqual(false)
    expect(runNth('nth:isAbundant(12)')).toEqual(true)
    expect(runNth('nth:isAbundant(15)')).toEqual(false)
    expect(runNth('nth:isAbundant(18)')).toEqual(true)
  })
})
