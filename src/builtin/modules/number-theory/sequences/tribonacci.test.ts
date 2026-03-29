import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../../createDvala'
import { numberTheoryModule } from '..'
import { DvalaError } from '../../../../errors'

const dvala = createDvala({ modules: [numberTheoryModule] })

function runNth(code: string) {
  return dvala.run(`let nt = import("numberTheory"); ${code.replace(/nth:/g, 'nt.')}`)
}
describe('tribonacci', () => {
  it('should return the correct sequence', () => {
    expect(runNth('nth:tribonacciSeq(1)')).toEqual([0])
    expect(runNth('nth:tribonacciSeq(2)')).toEqual([0, 1])
    expect(runNth('nth:tribonacciSeq(3)')).toEqual([0, 1, 1])
    expect(runNth('nth:tribonacciSeq(4)')).toEqual([0, 1, 1, 2])
    expect(runNth('nth:tribonacciSeq(11)')).toEqual([
      0,
      1,
      1,
      2,
      4,
      7,
      13,
      24,
      44,
      81,
      149,
    ])
    expect(() => runNth('nth:tribonacciSeq(0)')).toThrow(DvalaError)
  })

  it('should return the correct nth term', () => {
    expect(runNth('nth:tribonacciNth(1)')).toEqual(0)
    expect(runNth('nth:tribonacciNth(2)')).toEqual(1)
    expect(runNth('nth:tribonacciNth(3)')).toEqual(1)
    expect(runNth('nth:tribonacciNth(4)')).toEqual(2)
    expect(runNth('nth:tribonacciNth(11)')).toEqual(149)
  })

  it('should return the correct takeWhile sequence', () => {
    expect(runNth('nth:tribonacciTakeWhile(-> $ < 100)')).toEqual([0, 1, 1, 2, 4, 7, 13, 24, 44, 81])
  })

  it('should determine if numbers are in the sequence', () => {
    expect(runNth('nth:isTribonacci(0)')).toEqual(true)
    expect(runNth('nth:isTribonacci(1)')).toEqual(true)
    expect(runNth('nth:isTribonacci(2)')).toEqual(true)
    expect(runNth('nth:isTribonacci(3)')).toEqual(false)
    expect(runNth('nth:isTribonacci(4)')).toEqual(true)
    expect(runNth('nth:isTribonacci(5)')).toEqual(false)
    expect(runNth('nth:isTribonacci(6)')).toEqual(false)
    expect(runNth('nth:isTribonacci(7)')).toEqual(true)
    expect(runNth('nth:isTribonacci(8)')).toEqual(false)
    expect(runNth('nth:isTribonacci(9)')).toEqual(false)
  })
})
