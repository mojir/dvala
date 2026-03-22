import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../../createDvala'
import { numberTheoryModule } from '..'
import { DvalaError } from '../../../../errors'

const dvala = createDvala({ modules: [numberTheoryModule] })

function runNth(code: string) {
  return dvala.run(`let nt = import(number-theory); ${code.replace(/nth:/g, 'nt.')}`)
}
describe('sylvester', () => {
  it('should return the correct sequence', () => {
    expect(runNth('nth:sylvesterSeq(1)')).toEqual([2])
    expect(runNth('nth:sylvesterSeq(2)')).toEqual([2, 6])
    expect(runNth('nth:sylvesterSeq(3)')).toEqual([2, 6, 42])
    expect(runNth('nth:sylvesterSeq(4)')).toEqual([2, 6, 42, 1806])
    expect(runNth('nth:sylvesterSeq(5)')).toEqual([2, 6, 42, 1806, 3263442])
    expect(runNth('nth:sylvesterSeq(6)')).toEqual([2, 6, 42, 1806, 3263442, 10650056950806])
    expect(() => runNth('nth:sylvesterSeq(0)')).toThrow(DvalaError)
    expect(() => runNth('nth:sylvesterSeq(7)')).toThrow(DvalaError)
  })

  it('should return the correct nth term', () => {
    expect(runNth('nth:sylvesterNth(1)')).toEqual(2)
    expect(runNth('nth:sylvesterNth(2)')).toEqual(6)
    expect(runNth('nth:sylvesterNth(3)')).toEqual(42)
    expect(runNth('nth:sylvesterNth(4)')).toEqual(1806)
    expect(runNth('nth:sylvesterNth(5)')).toEqual(3263442)
    expect(runNth('nth:sylvesterNth(6)')).toEqual(10650056950806)
    expect(() => runNth('nth:sylvesterNth(0)')).toThrow(DvalaError)
    expect(() => runNth('nth:sylvesterNth(7)')).toThrow(DvalaError)
  })

  it('should return the correct takeWhile sequence', () => {
    expect(runNth('nth:sylvesterTakeWhile(-> $ < 1000)')).toEqual([2, 6, 42])
  })

  it('should determine if numbers are in the sequence', () => {
    expect(runNth('nth:isSylvester(0)')).toEqual(false)
    expect(runNth('nth:isSylvester(1)')).toEqual(false)
    expect(runNth('nth:isSylvester(2)')).toEqual(true)
    expect(runNth('nth:isSylvester(3)')).toEqual(false)
    expect(runNth('nth:isSylvester(4)')).toEqual(false)
    expect(runNth('nth:isSylvester(5)')).toEqual(false)
    expect(runNth('nth:isSylvester(6)')).toEqual(true)
    expect(runNth('nth:isSylvester(7)')).toEqual(false)
    expect(runNth('nth:isSylvester(8)')).toEqual(false)
    expect(runNth('nth:isSylvester(9)')).toEqual(false)
    expect(runNth('nth:isSylvester(10650056950806)')).toEqual(true)
  })
})
