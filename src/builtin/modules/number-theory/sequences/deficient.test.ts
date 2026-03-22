import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../../createDvala'
import { numberTheoryModule } from '..'
import { DvalaError } from '../../../../errors'

const dvala = createDvala({ modules: [numberTheoryModule] })

function runNth(code: string) {
  return dvala.run(`let nt = import(number-theory); ${code.replace(/nth:/g, 'nt.')}`)
}
describe('deficient', () => {
  it('should return the correct sequence', () => {
    expect(runNth('nth:deficientSeq(1)')).toEqual([1])
    expect(runNth('nth:deficientSeq(2)')).toEqual([1, 2])
    expect(runNth('nth:deficientSeq(3)')).toEqual([1, 2, 3])
    expect(runNth('nth:deficientSeq(18)')).toEqual([1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 19, 21, 22])
    expect(() => runNth('nth:deficientSeq(0)')).toThrow(DvalaError)
  })

  it('should return the correct nth term', () => {
    expect(runNth('nth:deficientNth(1)')).toEqual(1)
    expect(runNth('nth:deficientNth(2)')).toEqual(2)
    expect(runNth('nth:deficientNth(3)')).toEqual(3)
    expect(runNth('nth:deficientNth(4)')).toEqual(4)
    expect(runNth('nth:deficientNth(20)')).toEqual(25)
  })

  it('should return the correct takeWhile sequence', () => {
    expect(runNth('nth:deficientTakeWhile(-> $ < 20)')).toEqual([
      1,
      2,
      3,
      4,
      5,
      7,
      8,
      9,
      10,
      11,
      13,
      14,
      15,
      16,
      17,
      19,
    ])
  })

  it('should determine if numbers are in the sequence', () => {
    expect(runNth('nth:isDeficient(0)')).toEqual(false)
    expect(runNth('nth:isDeficient(1)')).toEqual(true)
    expect(runNth('nth:isDeficient(2)')).toEqual(true)
    expect(runNth('nth:isDeficient(3)')).toEqual(true)
    expect(runNth('nth:isDeficient(12)')).toEqual(false)
    expect(runNth('nth:isDeficient(15)')).toEqual(true)
    expect(runNth('nth:isDeficient(18)')).toEqual(false)
  })
})
