import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../../createDvala'
import { numberTheoryModule } from '..'
import { DvalaError } from '../../../../errors'

const dvala = createDvala({ modules: [numberTheoryModule] })

function runNth(code: string) {
  return dvala.run(`let nt = import(number-theory); ${code.replace(/nth:/g, 'nt.')}`)
}
describe('bell', () => {
  it('should return the correct sequence', () => {
    expect(runNth('nth:bellSeq(1)')).toEqual([1])
    expect(runNth('nth:bellSeq(2)')).toEqual([1, 2])
    expect(runNth('nth:bellSeq(3)')).toEqual([1, 2, 5])
    expect(runNth('nth:bellSeq(4)')).toEqual([1, 2, 5, 15])
    expect(runNth('nth:bellSeq(22)')).toEqual([
      1,
      2,
      5,
      15,
      52,
      203,
      877,
      4140,
      21147,
      115975,
      678570,
      4213597,
      27644437,
      190899322,
      1382958545,
      10480142147,
      82864869804,
      682076806159,
      5832742205057,
      51724158235372,
      474869816156751,
      4506715738447323,
    ])
    expect(() => runNth('nth:bellSeq(0)')).toThrow(DvalaError)
    expect(() => runNth('nth:bellSeq(23)')).toThrow(DvalaError)
  })

  it('should return the correct nth term', () => {
    expect(runNth('nth:bellNth(1)')).toEqual(1)
    expect(runNth('nth:bellNth(2)')).toEqual(2)
    expect(runNth('nth:bellNth(3)')).toEqual(5)
    expect(runNth('nth:bellNth(22)')).toEqual(4506715738447323)
  })

  it('should return the correct takeWhile sequence', () => {
    expect(runNth('nth:bellTakeWhile(-> $ < 1000)')).toEqual([1, 2, 5, 15, 52, 203, 877])
  })

  it('should determine if numbers are in the sequence', () => {
    expect(runNth('nth:isBell(0)')).toEqual(false)
    expect(runNth('nth:isBell(1)')).toEqual(true)
    expect(runNth('nth:isBell(2)')).toEqual(true)
    expect(runNth('nth:isBell(3)')).toEqual(false)
    expect(runNth('nth:isBell(4)')).toEqual(false)
    expect(runNth('nth:isBell(5)')).toEqual(true)
    expect(runNth('nth:isBell(6)')).toEqual(false)
    expect(runNth('nth:isBell(7)')).toEqual(false)
    expect(runNth('nth:isBell(8)')).toEqual(false)
    expect(runNth('nth:isBell(9)')).toEqual(false)
  })
})
