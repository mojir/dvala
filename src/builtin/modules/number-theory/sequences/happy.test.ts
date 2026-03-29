import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../../createDvala'
import { numberTheoryModule } from '..'
import { DvalaError } from '../../../../errors'

const dvala = createDvala({ modules: [numberTheoryModule] })

function runNth(code: string) {
  return dvala.run(`let nt = import("numberTheory"); ${code.replace(/nth:/g, 'nt.')}`)
}
describe('happy', () => {
  it('should return the correct sequence', () => {
    expect(runNth('nth:happySeq(1)')).toEqual([1])
    expect(runNth('nth:happySeq(2)')).toEqual([1, 7])
    expect(runNth('nth:happySeq(3)')).toEqual([1, 7, 10])
    expect(runNth('nth:happySeq(4)')).toEqual([1, 7, 10, 13])
    expect(runNth('nth:happySeq(20)')).toEqual([1, 7, 10, 13, 19, 23, 28, 31, 32, 44, 49, 68, 70, 79, 82, 86, 91, 94, 97, 100])
    expect(() => runNth('nth:happySeq(0)')).toThrow(DvalaError)
  })

  it('should return the correct nth term', () => {
    expect(runNth('nth:happyNth(1)')).toEqual(1)
    expect(runNth('nth:happyNth(2)')).toEqual(7)
    expect(runNth('nth:happyNth(3)')).toEqual(10)
    expect(runNth('nth:happyNth(4)')).toEqual(13)
    expect(runNth('nth:happyNth(5)')).toEqual(19)
    expect(runNth('nth:happyNth(6)')).toEqual(23)
    expect(runNth('nth:happyNth(7)')).toEqual(28)
    expect(runNth('nth:happyNth(8)')).toEqual(31)
    expect(runNth('nth:happyNth(20)')).toEqual(100)
  })

  it('should return the correct takeWhile sequence', () => {
    expect(runNth('nth:happyTakeWhile(-> $ < 100)')).toEqual([1, 7, 10, 13, 19, 23, 28, 31, 32, 44, 49, 68, 70, 79, 82, 86, 91, 94, 97])
  })

  it('should determine if numbers are in the sequence', () => {
    expect(runNth('nth:isHappy(0)')).toEqual(false)
    expect(runNth('nth:isHappy(1)')).toEqual(true)
    expect(runNth('nth:isHappy(2)')).toEqual(false)
    expect(runNth('nth:isHappy(3)')).toEqual(false)
    expect(runNth('nth:isHappy(4)')).toEqual(false)
    expect(runNth('nth:isHappy(5)')).toEqual(false)
    expect(runNth('nth:isHappy(6)')).toEqual(false)
    expect(runNth('nth:isHappy(7)')).toEqual(true)
    expect(runNth('nth:isHappy(8)')).toEqual(false)
    expect(runNth('nth:isHappy(100)')).toEqual(true)
    expect(runNth('nth:isHappy(101)')).toEqual(false)
  })
})
