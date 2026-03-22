import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../../createDvala'
import { numberTheoryModule } from '..'
import { DvalaError } from '../../../../errors'

const dvala = createDvala({ modules: [numberTheoryModule] })

function runNth(code: string) {
  return dvala.run(`let nt = import(numberTheory); ${code.replace(/nth:/g, 'nt.')}`)
}
describe('factorial', () => {
  it('should return the correct sequence', () => {
    expect(runNth('nth:factorialSeq(1)')).toEqual([1])
    expect(runNth('nth:factorialSeq(2)')).toEqual([1, 1])
    expect(runNth('nth:factorialSeq(3)')).toEqual([1, 1, 2])
    expect(runNth('nth:factorialSeq(4)')).toEqual([1, 1, 2, 6])
    expect(runNth('nth:factorialSeq(19)')).toEqual([
      1,
      1,
      2,
      6,
      24,
      120,
      720,
      5040,
      40320,
      362880,
      3628800,
      39916800,
      479001600,
      6227020800,
      87178291200,
      1307674368000,
      20922789888000,
      355687428096000,
      6402373705728000,
    ])
    expect(() => runNth('nth:factorialSeq(0)')).toThrow(DvalaError)
    expect(() => runNth('nth:factorialSeq(20)')).toThrow(DvalaError)
  })

  it('should return the correct nth term', () => {
    expect(runNth('nth:factorialNth(1)')).toEqual(1)
    expect(runNth('nth:factorialNth(2)')).toEqual(1)
    expect(runNth('nth:factorialNth(3)')).toEqual(2)
    expect(runNth('nth:factorialNth(4)')).toEqual(6)
    expect(runNth('nth:factorialNth(19)')).toEqual(6402373705728000)
  })

  it('should return the correct takeWhile sequence', () => {
    expect(runNth('nth:factorialTakeWhile(-> $ < 1000)')).toEqual([1, 1, 2, 6, 24, 120, 720])
  })

  it('should determine if numbers are in the sequence', () => {
    expect(runNth('nth:isFactorial(0)')).toEqual(false)
    expect(runNth('nth:isFactorial(1)')).toEqual(true)
    expect(runNth('nth:isFactorial(2)')).toEqual(true)
    expect(runNth('nth:isFactorial(3)')).toEqual(false)
    expect(runNth('nth:isFactorial(4)')).toEqual(false)
    expect(runNth('nth:isFactorial(5)')).toEqual(false)
    expect(runNth('nth:isFactorial(6)')).toEqual(true)
    expect(runNth('nth:isFactorial(7)')).toEqual(false)
    expect(runNth('nth:isFactorial(8)')).toEqual(false)
    expect(runNth('nth:isFactorial(9)')).toEqual(false)
    expect(runNth('nth:isFactorial(6402373705728000)')).toEqual(true)
    expect(runNth('nth:isFactorial(6402373705728001)')).toEqual(false)
  })
})
