import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../../createDvala'
import { numberTheoryModule } from '..'
import { DvalaError } from '../../../../errors'

const dvala = createDvala({ modules: [numberTheoryModule] })

function runNth(code: string) {
  return dvala.run(`let nt = import("numberTheory"); ${code.replace(/nth:/g, 'nt.')}`)
}
describe('perfect-power', () => {
  it('should return the correct sequence', () => {
    expect(runNth('nth:perfectPowerSeq(1)')).toEqual([1])
    expect(runNth('nth:perfectPowerSeq(2)')).toEqual([1, 4])
    expect(runNth('nth:perfectPowerSeq(3)')).toEqual([1, 4, 8])
    expect(runNth('nth:perfectPowerSeq(10)')).toEqual([1, 4, 8, 9, 16, 25, 27, 32, 36, 49])
    expect(() => runNth('nth:perfectPowerSeq(0)')).toThrow(DvalaError)
  })

  it('should return the correct nth term', () => {
    expect(runNth('nth:perfectPowerNth(1)')).toEqual(1)
    expect(runNth('nth:perfectPowerNth(2)')).toEqual(4)
    expect(runNth('nth:perfectPowerNth(3)')).toEqual(8)
    expect(runNth('nth:perfectPowerNth(4)')).toEqual(9)
    expect(runNth('nth:perfectPowerNth(5)')).toEqual(16)
    expect(runNth('nth:perfectPowerNth(6)')).toEqual(25)
  })

  it('should return the correct takeWhile sequence', () => {
    expect(runNth('nth:perfectPowerTakeWhile(-> $ <= 100)')).toEqual([1, 4, 8, 9, 16, 25, 27, 32, 36, 49, 64, 81, 100])
  })

  it('should determine if numbers are in the sequence', () => {
    expect(runNth('nth:isPerfectPower(0)')).toEqual(false)
    expect(runNth('nth:isPerfectPower(1)')).toEqual(true)
    expect(runNth('nth:isPerfectPower(2)')).toEqual(false)
    expect(runNth('nth:isPerfectPower(3)')).toEqual(false)
    expect(runNth('nth:isPerfectPower(4)')).toEqual(true)
    expect(runNth('nth:isPerfectPower(5)')).toEqual(false)
    expect(runNth('nth:isPerfectPower(6)')).toEqual(false)
    expect(runNth('nth:isPerfectPower(7)')).toEqual(false)
    expect(runNth('nth:isPerfectPower(8)')).toEqual(true)
    expect(runNth('nth:isPerfectPower(9)')).toEqual(true)
    expect(runNth('nth:isPerfectPower(100)')).toEqual(true)
  })

  it('should return tuple with base and exponent', () => {
    expect(runNth('nth:perfectPower(1)')).toEqual([1, 2])
    expect(runNth('nth:perfectPower(4)')).toEqual([2, 2])
    expect(runNth('nth:perfectPower(8)')).toEqual([2, 3])
    expect(runNth('nth:perfectPower(9)')).toEqual([3, 2])
    expect(runNth('nth:perfectPower(16)')).toEqual([4, 2])
    expect(runNth('nth:perfectPower(25)')).toEqual([5, 2])
    expect(runNth('nth:perfectPower(27)')).toEqual([3, 3])
    expect(runNth('nth:perfectPower(32)')).toEqual([2, 5])
    expect(runNth('nth:perfectPower(36)')).toEqual([6, 2])
    expect(runNth('nth:perfectPower(49)')).toEqual([7, 2])
    expect(runNth('nth:perfectPower(64)')).toEqual([8, 2])
    expect(runNth('nth:perfectPower(81)')).toEqual([9, 2])
    expect(runNth('nth:perfectPower(99)')).toEqual(null)
  })
})
