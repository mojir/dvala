import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../../createDvala'
import { numberTheoryModule } from '..'
import { DvalaError } from '../../../../errors'

const dvala = createDvala({ modules: [numberTheoryModule] })

function runNth(code: string) {
  return dvala.run(`let nt = import(number-theory); ${code.replace(/nth:/g, 'nt.')}`)
}
describe('golomb', () => {
  it('should return the correct sequence', () => {
    expect(runNth('nth:golombSeq(1)')).toEqual([1])
    expect(runNth('nth:golombSeq(2)')).toEqual([1, 2])
    expect(runNth('nth:golombSeq(3)')).toEqual([1, 2, 2])
    expect(runNth('nth:golombSeq(4)')).toEqual([1, 2, 2, 3])
    expect(runNth('nth:golombSeq(84)')).toEqual([
      1,
      2,
      2,
      3,
      3,
      4,
      4,
      4,
      5,
      5,
      5,
      6,
      6,
      6,
      6,
      7,
      7,
      7,
      7,
      8,
      8,
      8,
      8,
      9,
      9,
      9,
      9,
      9,
      10,
      10,
      10,
      10,
      10,
      11,
      11,
      11,
      11,
      11,
      12,
      12,
      12,
      12,
      12,
      12,
      13,
      13,
      13,
      13,
      13,
      13,
      14,
      14,
      14,
      14,
      14,
      14,
      15,
      15,
      15,
      15,
      15,
      15,
      16,
      16,
      16,
      16,
      16,
      16,
      16,
      17,
      17,
      17,
      17,
      17,
      17,
      17,
      18,
      18,
      18,
      18,
      18,
      18,
      18,
      19,
    ])
    expect(() => runNth('nth:golombSeq(0)')).toThrow(DvalaError)
  })

  it('should return the correct nth term', () => {
    expect(runNth('nth:golombNth(1)')).toEqual(1)
    expect(runNth('nth:golombNth(2)')).toEqual(2)
    expect(runNth('nth:golombNth(3)')).toEqual(2)
    expect(runNth('nth:golombNth(4)')).toEqual(3)
    expect(runNth('nth:golombNth(5)')).toEqual(3)
    expect(runNth('nth:golombNth(6)')).toEqual(4)
    expect(runNth('nth:golombNth(7)')).toEqual(4)
    expect(runNth('nth:golombNth(8)')).toEqual(4)
    expect(runNth('nth:golombNth(20)')).toEqual(8)
  })

  it('should return the correct takeWhile sequence', () => {
    expect(runNth('nth:golombTakeWhile(-> $ < 10)')).toEqual([1, 2, 2, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 6, 7, 7, 7, 7, 8, 8, 8, 8, 9, 9, 9, 9, 9])
    expect(runNth('nth:golombTakeWhile(-> $2 != 0)')).toEqual([])
  })

  it('should determine if numbers are in the sequence', () => {
    expect(runNth('nth:isGolomb(0)')).toEqual(true)
    expect(runNth('nth:isGolomb(1)')).toEqual(true)
    expect(runNth('nth:isGolomb(2)')).toEqual(true)
    expect(runNth('nth:isGolomb(3)')).toEqual(true)
    expect(runNth('nth:isGolomb(4)')).toEqual(true)
    expect(runNth('nth:isGolomb(5)')).toEqual(true)
    expect(runNth('nth:isGolomb(6)')).toEqual(true)
    expect(runNth('nth:isGolomb(7)')).toEqual(true)
    expect(runNth('nth:isGolomb(8)')).toEqual(true)
    expect(runNth('nth:isGolomb(100)')).toEqual(true)
    expect(runNth('nth:isGolomb(101)')).toEqual(true)
  })
})
