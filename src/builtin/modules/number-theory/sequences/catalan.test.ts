import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../../createDvala'
import { numberTheoryModule } from '..'
import { DvalaError } from '../../../../errors'

const dvala = createDvala({ modules: [numberTheoryModule] })

function runNth(code: string) {
  return dvala.run(`let nt = import(numberTheory); ${code.replace(/nth:/g, 'nt.')}`)
}
describe('catalan', () => {
  it('should return the correct sequence', () => {
    expect(runNth('nth:catalanSeq(1)')).toEqual([1])
    expect(runNth('nth:catalanSeq(2)')).toEqual([1, 2])
    expect(runNth('nth:catalanSeq(3)')).toEqual([1, 2, 5])
    expect(runNth('nth:catalanSeq(4)')).toEqual([1, 2, 5, 14])
    expect(runNth('nth:catalanSeq(30)')).toEqual([
      1,
      2,
      5,
      14,
      42,
      132,
      429,
      1430,
      4862,
      16796,
      58786,
      208012,
      742900,
      2674440,
      9694845,
      35357670,
      129644790,
      477638700,
      1767263190,
      6564120420,
      24466267020,
      91482563640,
      343059613650,
      1289904147324,
      4861946401452,
      18367353072152,
      69533550916004,
      263747951750360,
      1002242216651368,
      3814986502092304,
    ])
    expect(() => runNth('nth:catalanSeq(0)')).toThrow(DvalaError)
    expect(() => runNth('nth:catalanSeq(32)')).toThrow(DvalaError)
  })

  it('should return the correct nth term', () => {
    expect(runNth('nth:catalanNth(1)')).toEqual(1)
    expect(runNth('nth:catalanNth(2)')).toEqual(2)
    expect(runNth('nth:catalanNth(3)')).toEqual(5)
    expect(runNth('nth:catalanNth(4)')).toEqual(14)
    expect(runNth('nth:catalanNth(30)')).toEqual(3814986502092304)
  })

  it('should return the correct takeWhile sequence', () => {
    expect(runNth('nth:catalanTakeWhile(-> $ < 1000)')).toEqual([1, 2, 5, 14, 42, 132, 429])
  })

  it('should determine if numbers are in the sequence', () => {
    expect(runNth('nth:isCatalan(0)')).toEqual(false)
    expect(runNth('nth:isCatalan(1)')).toEqual(true)
    expect(runNth('nth:isCatalan(2)')).toEqual(true)
    expect(runNth('nth:isCatalan(3)')).toEqual(false)
    expect(runNth('nth:isCatalan(4)')).toEqual(false)
    expect(runNth('nth:isCatalan(5)')).toEqual(true)
    expect(runNth('nth:isCatalan(6)')).toEqual(false)
    expect(runNth('nth:isCatalan(7)')).toEqual(false)
    expect(runNth('nth:isCatalan(8)')).toEqual(false)
    expect(runNth('nth:isCatalan(9)')).toEqual(false)
    expect(runNth('nth:isCatalan(3814986502092303)')).toEqual(false)
    expect(runNth('nth:isCatalan(3814986502092304)')).toEqual(true)
  })
})
