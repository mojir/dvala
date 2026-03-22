import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../../createDvala'
import { numberTheoryModule } from '..'
import { DvalaError } from '../../../../errors'

const dvala = createDvala({ modules: [numberTheoryModule] })

function runNth(code: string) {
  return dvala.run(`let nt = import(number-theory); ${code.replace(/nth:/g, 'nt.')}`)
}
describe('composite', () => {
  it('should return the correct sequence', () => {
    expect(runNth('nth:compositeSeq(1)')).toEqual([4])
    expect(runNth('nth:compositeSeq(2)')).toEqual([4, 6])
    expect(runNth('nth:compositeSeq(3)')).toEqual([4, 6, 8])
    expect(runNth('nth:compositeSeq(4)')).toEqual([4, 6, 8, 9])
    expect(() => runNth('nth:compositeSeq(0)')).toThrow(DvalaError)
  })

  it('should return the correct nth term', () => {
    expect(runNth('nth:compositeNth(1)')).toEqual(4)
    expect(runNth('nth:compositeNth(2)')).toEqual(6)
    expect(runNth('nth:compositeNth(3)')).toEqual(8)
    expect(runNth('nth:compositeNth(4)')).toEqual(9)
  })

  it('should return the correct takeWhile sequence', () => {
    expect(runNth('nth:compositeTakeWhile(-> $ < 20)')).toEqual([
      4,
      6,
      8,
      9,
      10,
      12,
      14,
      15,
      16,
      18,
    ])
  })

  it('should determine if numbers are in the sequence', () => {
    expect(runNth('nth:isComposite(0)')).toEqual(false)
    expect(runNth('nth:isComposite(1)')).toEqual(false)
    expect(runNth('nth:isComposite(2)')).toEqual(false)
    expect(runNth('nth:isComposite(3)')).toEqual(false)
    expect(runNth('nth:isComposite(4)')).toEqual(true)
    expect(runNth('nth:isComposite(5)')).toEqual(false)
    expect(runNth('nth:isComposite(6)')).toEqual(true)
    expect(runNth('nth:isComposite(7)')).toEqual(false)
    expect(runNth('nth:isComposite(8)')).toEqual(true)
    expect(runNth('nth:isComposite(9)')).toEqual(true)
    expect(runNth('nth:isComposite(997)')).toEqual(false)
    expect(runNth('nth:isComposite(1001)')).toEqual(true)
  })
})
