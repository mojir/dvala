import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../createDvala'
import { numberTheoryModule } from './'

const dvala = createDvala({ modules: [numberTheoryModule] })

function runNth(code: string) {
  return dvala.run(`let nt = import(numberTheory); ${code.replace(/nth:/g, 'nt.')}`)
}
describe('derangements', () => {
  describe('nth:derangements', () => {
    it('should return all derangements of a set', () => {
      expect(runNth('nth:derangements([1, 2, 3])')).toEqual([
        [2, 3, 1],
        [3, 1, 2],
      ])
      expect(runNth('nth:derangements(["a", "b", "c", "d"])')).toEqual([
        ['b', 'a', 'd', 'c'],
        ['b', 'c', 'd', 'a'],
        ['b', 'd', 'a', 'c'],
        ['c', 'a', 'd', 'b'],
        ['c', 'd', 'a', 'b'],
        ['c', 'd', 'b', 'a'],
        ['d', 'a', 'b', 'c'],
        ['d', 'c', 'a', 'b'],
        ['d', 'c', 'b', 'a'],
      ])
    })
  })
  describe('nth:countDerangements', () => {
    it('should return the number of derangements from n', () => {
      expect(runNth('nth:countDerangements(1)')).toEqual(0)
      expect(runNth('nth:countDerangements(2)')).toEqual(1)
      expect(runNth('nth:countDerangements(3)')).toEqual(2)
      expect(runNth('nth:countDerangements(4)')).toEqual(9)
      expect(runNth('nth:countDerangements(5)')).toEqual(44)
      expect(runNth('nth:countDerangements(6)')).toEqual(265)
    })
  })
})
