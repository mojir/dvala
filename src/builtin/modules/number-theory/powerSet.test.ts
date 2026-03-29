import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../createDvala'
import { numberTheoryModule } from './'

const dvala = createDvala({ modules: [numberTheoryModule] })

function runNth(code: string) {
  return dvala.run(`let nt = import("numberTheory"); ${code.replace(/nth:/g, 'nt.')}`)
}
describe('powerSet', () => {
  describe('nth:powerSet', () => {
    it('should return the power set of a set', () => {
      expect(runNth('nth:powerSet([1, 2, 3])')).toEqual([
        [],
        [1],
        [2],
        [1, 2],
        [3],
        [1, 3],
        [2, 3],
        [1, 2, 3],
      ])
    })
  })
  describe('nth:countPowerSet', () => {
    it('should return the size of a power set from a set with length n', () => {
      expect(runNth('nth:countPowerSet(0)')).toEqual(1)
      expect(runNth('nth:countPowerSet(1)')).toEqual(2)
      expect(runNth('nth:countPowerSet(2)')).toEqual(4)
      expect(runNth('nth:countPowerSet(3)')).toEqual(8)
      expect(runNth('nth:countPowerSet(4)')).toEqual(16)
      expect(runNth('nth:countPowerSet(5)')).toEqual(32)
      expect(runNth('nth:countPowerSet(54)')).toBe(Number.POSITIVE_INFINITY)
    })
  })
})
