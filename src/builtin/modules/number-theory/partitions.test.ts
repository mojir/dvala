import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../createDvala'
import { DvalaError } from '../../../errors'
import { numberTheoryModule } from './'

const dvala = createDvala({ modules: [numberTheoryModule] })

function runNth(code: string) {
  return dvala.run(`let nt = import(number-theory); ${code.replace(/nth:/g, 'nt.')}`)
}
describe('partitions', () => {
  describe('nth:partitions', () => {
    it('should return the partitions of a number', () => {
      expect(runNth('nth:partitions(0)')).toEqual([[]])
      expect(runNth('nth:partitions(1)')).toEqual([[1]])
      expect(runNth('nth:partitions(4)')).toEqual([
        [4],
        [3, 1],
        [2, 2],
        [2, 1, 1],
        [1, 1, 1, 1],
      ])
      expect(runNth('nth:partitions(5)')).toEqual([
        [5],
        [4, 1],
        [3, 2],
        [3, 1, 1],
        [2, 2, 1],
        [2, 1, 1, 1],
        [1, 1, 1, 1, 1],
      ])
      expect(runNth('nth:partitions(0)')).toEqual([[]])
    })
  })
  describe('nth:countPartitions', () => {
    it('should return the number of partitions from n', () => {
      expect(runNth('nth:countPartitions(0)')).toEqual(1)
      expect(runNth('nth:countPartitions(1)')).toEqual(1)
      expect(runNth('nth:countPartitions(2)')).toEqual(2)
      expect(runNth('nth:countPartitions(3)')).toEqual(3)
      expect(runNth('nth:countPartitions(4)')).toEqual(5)
      expect(runNth('nth:countPartitions(5)')).toEqual(7)
      expect(runNth('nth:countPartitions(6)')).toEqual(11)
      expect(() => runNth('nth:countPartitions(300)')).toThrow(DvalaError)
    })
  })
})
