import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../../createDvala'
import { numberTheoryModule } from '..'
import { DvalaError } from '../../../../errors'

const dvala = createDvala({ modules: [numberTheoryModule] })

function runNth(code: string) {
  return dvala.run(`let nt = import(number-theory); ${code.replace(/nth:/g, 'nt.')}`)
}
describe('mersenne', () => {
  it('should return the correct sequence', () => {
    expect(runNth('nth:mersenneSeq(1)')).toEqual([3])
    expect(runNth('nth:mersenneSeq(2)')).toEqual([3, 7])
    expect(runNth('nth:mersenneSeq(3)')).toEqual([3, 7, 31])
    expect(runNth('nth:mersenneSeq(4)')).toEqual([3, 7, 31, 127])
    expect(runNth('nth:mersenneSeq(9)')).toEqual([3, 7, 31, 127, 2047, 8191, 131071, 524287, 2147483647])
    expect(() => runNth('nth:mersenneSeq(0)')).toThrow(DvalaError)
    expect(() => runNth('nth:mersenneSeq(20)')).toThrow(DvalaError)
  })

  it('should return the correct nth term', () => {
    expect(runNth('nth:mersenneNth(1)')).toEqual(3)
    expect(runNth('nth:mersenneNth(2)')).toEqual(7)
    expect(runNth('nth:mersenneNth(3)')).toEqual(31)
    expect(runNth('nth:mersenneNth(4)')).toEqual(127)
    expect(runNth('nth:mersenneNth(9)')).toEqual(2147483647)
  })

  it('should return the correct takeWhile sequence', () => {
    expect(runNth('nth:mersenneTakeWhile(-> $ < 1000)')).toEqual([3, 7, 31, 127])
  })

  it('should determine if numbers are in the sequence', () => {
    expect(runNth('nth:isMersenne(0)')).toEqual(false)
    expect(runNth('nth:isMersenne(1)')).toEqual(false)
    expect(runNth('nth:isMersenne(2)')).toEqual(false)
    expect(runNth('nth:isMersenne(3)')).toEqual(true)
    expect(runNth('nth:isMersenne(4)')).toEqual(false)
    expect(runNth('nth:isMersenne(5)')).toEqual(false)
    expect(runNth('nth:isMersenne(6)')).toEqual(false)
    expect(runNth('nth:isMersenne(7)')).toEqual(true)
    expect(runNth('nth:isMersenne(8)')).toEqual(false)
    expect(runNth('nth:isMersenne(9)')).toEqual(false)
    expect(runNth('nth:isMersenne(2147483647)')).toEqual(true)
    expect(runNth('nth:isMersenne(2147483648)')).toEqual(false)
  })
})
