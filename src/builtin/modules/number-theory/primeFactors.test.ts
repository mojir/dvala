import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../createDvala'
import { numberTheoryModule } from './'

const dvala = createDvala({ modules: [numberTheoryModule] })

function runNth(code: string) {
  return dvala.run(`let nt = import("numberTheory"); ${code.replace(/nth:/g, 'nt.')}`)
}
describe('primeFactors', () => {
  describe('nth:primeFactors', () => {
    it('should return find prime factors', () => {
      expect(runNth('nth:primeFactors(1)')).toEqual([])
      expect(runNth('nth:primeFactors(2)')).toEqual([2])
      expect(runNth('nth:primeFactors(3)')).toEqual([3])
      expect(runNth('nth:primeFactors(4)')).toEqual([2, 2])
      expect(runNth('nth:primeFactors(5)')).toEqual([5])
      expect(runNth('nth:primeFactors(6)')).toEqual([2, 3])
      expect(runNth('nth:primeFactors(7)')).toEqual([7])
      expect(runNth('nth:primeFactors(8)')).toEqual([2, 2, 2])
      expect(runNth('nth:primeFactors(9)')).toEqual([3, 3])
      expect(runNth('nth:primeFactors(10)')).toEqual([2, 5])
      expect(runNth('nth:primeFactors(100)')).toEqual([2, 2, 5, 5])
      expect(runNth('nth:primeFactors(1484147626962)')).toEqual([2, 3, 7, 11, 13, 17, 19, 23, 29, 31, 37])
    })
  })
  describe('nth:distinctPrimeFactors', () => {
    it('should return distinct prime factors', () => {
      expect(runNth('nth:distinctPrimeFactors(1)')).toEqual([])
      expect(runNth('nth:distinctPrimeFactors(2)')).toEqual([2])
      expect(runNth('nth:distinctPrimeFactors(3)')).toEqual([3])
      expect(runNth('nth:distinctPrimeFactors(4)')).toEqual([2])
      expect(runNth('nth:distinctPrimeFactors(5)')).toEqual([5])
      expect(runNth('nth:distinctPrimeFactors(6)')).toEqual([2, 3])
      expect(runNth('nth:distinctPrimeFactors(7)')).toEqual([7])
      expect(runNth('nth:distinctPrimeFactors(8)')).toEqual([2])
      expect(runNth('nth:distinctPrimeFactors(9)')).toEqual([3])
    })
  })
  describe('nth:countPrimeFactors', () => {
    it('should return the number of prime factors of n', () => {
      expect(runNth('nth:countPrimeFactors(1)')).toEqual(0)
      expect(runNth('nth:countPrimeFactors(2)')).toEqual(1)
      expect(runNth('nth:countPrimeFactors(3)')).toEqual(1)
      expect(runNth('nth:countPrimeFactors(4)')).toEqual(2)
      expect(runNth('nth:countPrimeFactors(5)')).toEqual(1)
      expect(runNth('nth:countPrimeFactors(6)')).toEqual(2)
      expect(runNth('nth:countPrimeFactors(7)')).toEqual(1)
      expect(runNth('nth:countPrimeFactors(8)')).toEqual(3)
      expect(runNth('nth:countPrimeFactors(9)')).toEqual(2)
      expect(runNth('nth:countPrimeFactors(10)')).toEqual(2)
      expect(runNth('nth:countPrimeFactors(100)')).toEqual(4)
    })
  })
  describe('nth:countDistinctPrimeFactors', () => {
    it('should return the number of distinct prime factors of n', () => {
      expect(runNth('nth:countDistinctPrimeFactors(1)')).toEqual(0)
      expect(runNth('nth:countDistinctPrimeFactors(2)')).toEqual(1)
      expect(runNth('nth:countDistinctPrimeFactors(3)')).toEqual(1)
      expect(runNth('nth:countDistinctPrimeFactors(4)')).toEqual(1)
      expect(runNth('nth:countDistinctPrimeFactors(5)')).toEqual(1)
      expect(runNth('nth:countDistinctPrimeFactors(6)')).toEqual(2)
      expect(runNth('nth:countDistinctPrimeFactors(7)')).toEqual(1)
      expect(runNth('nth:countDistinctPrimeFactors(8)')).toEqual(1)
      expect(runNth('nth:countDistinctPrimeFactors(9)')).toEqual(1)
      expect(runNth('nth:countDistinctPrimeFactors(10)')).toEqual(2)
      expect(runNth('nth:countDistinctPrimeFactors(100)')).toEqual(2)
    })
  })
})
