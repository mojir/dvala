import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../../createDvala'
import { numberTheoryModule } from '..'
import { DvalaError } from '../../../../errors'

const dvala = createDvala({ modules: [numberTheoryModule] })

function runNth(code: string) {
  return dvala.run(`let nt = import(numberTheory); ${code.replace(/nth:/g, 'nt.')}`)
}
describe('lucky', () => {
  it('should return the correct sequence', () => {
    expect(runNth('nth:luckySeq(1)')).toEqual([1])
    expect(runNth('nth:luckySeq(2)')).toEqual([1, 3])
    expect(runNth('nth:luckySeq(3)')).toEqual([1, 3, 7])
    expect(runNth('nth:luckySeq(4)')).toEqual([1, 3, 7, 9])
    expect(runNth('nth:luckySeq(20)')).toEqual([1, 3, 7, 9, 13, 15, 21, 25, 31, 33, 37, 43, 49, 51, 63, 67, 69, 73, 75, 79])
    expect(() => runNth('nth:luckySeq(0)')).toThrow(DvalaError)
  })

  it('should return the correct nth term', () => {
    expect(runNth('nth:luckyNth(1)')).toEqual(1)
    expect(runNth('nth:luckyNth(2)')).toEqual(3)
    expect(runNth('nth:luckyNth(3)')).toEqual(7)
    expect(runNth('nth:luckyNth(4)')).toEqual(9)
    expect(runNth('nth:luckyNth(5)')).toEqual(13)
    expect(runNth('nth:luckyNth(6)')).toEqual(15)
    expect(runNth('nth:luckyNth(7)')).toEqual(21)
    expect(runNth('nth:luckyNth(8)')).toEqual(25)
    expect(runNth('nth:luckyNth(20)')).toEqual(79)
    expect(runNth('nth:luckyNth(3000)')).toEqual(30367)
  })

  it('should return the correct takeWhile sequence', () => {
    expect(runNth('nth:luckyTakeWhile(-> $ < 100)')).toEqual([1, 3, 7, 9, 13, 15, 21, 25, 31, 33, 37, 43, 49, 51, 63, 67, 69, 73, 75, 79, 87, 93, 99])
    expect(runNth('nth:luckyTakeWhile(-> $2 < 3000)')).toBeDefined()
  })

  it('should determine if numbers are in the sequence', () => {
    expect(runNth('nth:isLucky(0)')).toEqual(false)
    expect(runNth('nth:isLucky(1)')).toEqual(true)
    expect(runNth('nth:isLucky(2)')).toEqual(false)
    expect(runNth('nth:isLucky(3)')).toEqual(true)
    expect(runNth('nth:isLucky(4)')).toEqual(false)
    expect(runNth('nth:isLucky(5)')).toEqual(false)
    expect(runNth('nth:isLucky(6)')).toEqual(false)
    expect(runNth('nth:isLucky(7)')).toEqual(true)
    expect(runNth('nth:isLucky(8)')).toEqual(false)
    expect(runNth('nth:isLucky(99)')).toEqual(true)
    expect(runNth('nth:isLucky(100)')).toEqual(false)
  })
})
