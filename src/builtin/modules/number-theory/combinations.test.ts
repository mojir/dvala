import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../createDvala'
import { numberTheoryModule } from './'

const dvala = createDvala({ modules: [numberTheoryModule] })

function runNth(code: string) {
  return dvala.run(`let nt = import("numberTheory"); ${code.replace(/nth:/g, 'nt.')}`)
}
describe('combinations', () => {
  describe('nth:combinations', () => {
    it('should return the combinations of n elements from a set', () => {
      expect(runNth('nth:combinations(["a", "b", "c"], 0)')).toEqual([[]])
      expect(runNth('nth:combinations(["a", "b", "c"], 2)')).toEqual([
        ['a', 'b'],
        ['a', 'c'],
        ['b', 'c'],
      ])
      expect(runNth('nth:combinations(["a", "b", "c"], 3)')).toEqual([
        ['a', 'b', 'c'],
      ])
      expect(runNth('nth:combinations(["a", "b", "c"], 1)')).toEqual([
        ['a'],
        ['b'],
        ['c'],
      ])
      expect(runNth('nth:combinations(["a", "b", "c"], 0)')).toEqual([
        [],
      ])
    })
  })
  describe('nth:countCombinations', () => {
    it('should return the number of combinations from n, k', () => {
      expect(runNth('nth:countCombinations(2, 2)')).toEqual(1)
      expect(runNth('nth:countCombinations(3, 2)')).toEqual(3)
      expect(runNth('nth:countCombinations(4, 2)')).toEqual(6)
      expect(runNth('nth:countCombinations(5, 3)')).toEqual(10)
    })
  })
})
