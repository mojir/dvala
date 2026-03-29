import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../../createDvala'
import { numberTheoryModule } from '..'
import { DvalaError } from '../../../../errors'

const dvala = createDvala({ modules: [numberTheoryModule] })

function runNth(code: string) {
  return dvala.run(`let nt = import("numberTheory"); ${code.replace(/nth:/g, 'nt.')}`)
}
describe('perfect-square', () => {
  it('should return the correct sequence', () => {
    expect(runNth('nth:perfectSquareSeq(1)')).toEqual([1])
    expect(runNth('nth:perfectSquareSeq(2)')).toEqual([1, 4])
    expect(runNth('nth:perfectSquareSeq(3)')).toEqual([1, 4, 9])
    expect(runNth('nth:perfectSquareSeq(4)')).toEqual([1, 4, 9, 16])
    expect(() => runNth('nth:perfectSquareSeq(0)')).toThrow(DvalaError)
  })

  it('should return the correct nth term', () => {
    expect(runNth('nth:perfectSquareNth(1)')).toEqual(1)
    expect(runNth('nth:perfectSquareNth(2)')).toEqual(4)
    expect(runNth('nth:perfectSquareNth(3)')).toEqual(9)
    expect(runNth('nth:perfectSquareNth(4)')).toEqual(16)
    expect(runNth('nth:perfectSquareNth(5)')).toEqual(25)
    expect(runNth('nth:perfectSquareNth(100)')).toEqual(10000)
  })

  it('should return the correct takeWhile sequence', () => {
    expect(runNth('nth:perfectSquareTakeWhile(-> $ < 100)')).toEqual([
      1,
      4,
      9,
      16,
      25,
      36,
      49,
      64,
      81,
    ])
  })

  it('should determine if numbers are in the sequence', () => {
    expect(runNth('nth:isPerfectSquare(0)')).toEqual(false)
    expect(runNth('nth:isPerfectSquare(1)')).toEqual(true)
    expect(runNth('nth:isPerfectSquare(2)')).toEqual(false)
    expect(runNth('nth:isPerfectSquare(3)')).toEqual(false)
    expect(runNth('nth:isPerfectSquare(4)')).toEqual(true)
    expect(runNth('nth:isPerfectSquare(5)')).toEqual(false)
    expect(runNth('nth:isPerfectSquare(6)')).toEqual(false)
    expect(runNth('nth:isPerfectSquare(7)')).toEqual(false)
    expect(runNth('nth:isPerfectSquare(8)')).toEqual(false)
    expect(runNth('nth:isPerfectSquare(9)')).toEqual(true)
    expect(runNth('nth:isPerfectSquare(100)')).toEqual(true)
    expect(runNth('nth:isPerfectSquare(1000)')).toEqual(false)
  })
})
