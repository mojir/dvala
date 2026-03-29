import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../createDvala'
import { numberTheoryModule } from './'

const dvala = createDvala({ modules: [numberTheoryModule] })

function runNth(code: string) {
  return dvala.run(`let nt = import("numberTheory"); ${code.replace(/nth:/g, 'nt.')}`)
}
describe('divisors', () => {
  describe('nth:divisors', () => {
    it('should return divisors of a number', () => {
      expect(runNth('nth:divisors(1)')).toEqual([1])
      expect(runNth('nth:divisors(2)')).toEqual([1, 2])
      expect(runNth('nth:divisors(3)')).toEqual([1, 3])
      expect(runNth('nth:divisors(4)')).toEqual([1, 2, 4])
      expect(runNth('nth:divisors(5)')).toEqual([1, 5])
      expect(runNth('nth:divisors(6)')).toEqual([1, 2, 3, 6])
      expect(runNth('nth:divisors(7)')).toEqual([1, 7])
      expect(runNth('nth:divisors(8)')).toEqual([1, 2, 4, 8])
      expect(runNth('nth:divisors(9)')).toEqual([1, 3, 9])
      expect(runNth('nth:divisors(10)')).toEqual([1, 2, 5, 10])
      expect(runNth('nth:divisors(100)')).toEqual([1, 2, 4, 5, 10, 20, 25, 50, 100])
    })
  })
  describe('nth:countDivisors', () => {
    it('should return the number of divisors of a number', () => {
      expect(runNth('nth:countDivisors(1)')).toEqual(1)
      expect(runNth('nth:countDivisors(2)')).toEqual(2)
      expect(runNth('nth:countDivisors(3)')).toEqual(2)
      expect(runNth('nth:countDivisors(4)')).toEqual(3)
      expect(runNth('nth:countDivisors(5)')).toEqual(2)
      expect(runNth('nth:countDivisors(6)')).toEqual(4)
      expect(runNth('nth:countDivisors(7)')).toEqual(2)
      expect(runNth('nth:countDivisors(8)')).toEqual(4)
      expect(runNth('nth:countDivisors(9)')).toEqual(3)
      expect(runNth('nth:countDivisors(10)')).toEqual(4)
      expect(runNth('nth:countDivisors(100)')).toEqual(9)
    })
  })
  describe('nth:properDivisors', () => {
    it('should return proper divisors of a number', () => {
      expect(runNth('nth:properDivisors(1)')).toEqual([])
      expect(runNth('nth:properDivisors(2)')).toEqual([1])
      expect(runNth('nth:properDivisors(3)')).toEqual([1])
      expect(runNth('nth:properDivisors(4)')).toEqual([1, 2])
      expect(runNth('nth:properDivisors(5)')).toEqual([1])
      expect(runNth('nth:properDivisors(6)')).toEqual([1, 2, 3])
      expect(runNth('nth:properDivisors(7)')).toEqual([1])
      expect(runNth('nth:properDivisors(8)')).toEqual([1, 2, 4])
      expect(runNth('nth:properDivisors(9)')).toEqual([1, 3])
      expect(runNth('nth:properDivisors(10)')).toEqual([1, 2, 5])
      expect(runNth('nth:properDivisors(100)')).toEqual([1, 2, 4, 5, 10, 20, 25, 50])
    })
  })
  describe('nth:countProperDivisors', () => {
    it('should return the number of proper divisors of a number', () => {
      expect(runNth('nth:countProperDivisors(1)')).toEqual(0)
      expect(runNth('nth:countProperDivisors(2)')).toEqual(1)
      expect(runNth('nth:countProperDivisors(3)')).toEqual(1)
      expect(runNth('nth:countProperDivisors(4)')).toEqual(2)
      expect(runNth('nth:countProperDivisors(5)')).toEqual(1)
      expect(runNth('nth:countProperDivisors(6)')).toEqual(3)
      expect(runNth('nth:countProperDivisors(7)')).toEqual(1)
      expect(runNth('nth:countProperDivisors(8)')).toEqual(3)
      expect(runNth('nth:countProperDivisors(9)')).toEqual(2)
      expect(runNth('nth:countProperDivisors(10)')).toEqual(3)
      expect(runNth('nth:countProperDivisors(100)')).toEqual(8)
    })
  })
})
