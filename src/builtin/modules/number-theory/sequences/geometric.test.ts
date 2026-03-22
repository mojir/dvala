import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../../createDvala'
import { numberTheoryModule } from '..'

const dvala = createDvala({ modules: [numberTheoryModule] })

function runNth(code: string) {
  return dvala.run(`let nt = import(number-theory); ${code.replace(/nth:/g, 'nt.')}`)
}
describe('geometric', () => {
  it('should return the correct sequence', () => {
    expect(runNth('nth:geometricSeq(3, 2, 2)')).toEqual([3, 6])
    expect(runNth('nth:geometricSeq(2, 3, 2)')).toEqual([2, 6])
    expect(runNth('nth:geometricSeq(1, 2, 2)')).toEqual([1, 2])
    expect(runNth('nth:geometricSeq(1, 1.5, 4)')).toEqual([1, 1.5, 2.25, 3.375])
  })

  it('should return the correct nth term', () => {
    expect(runNth('nth:geometricNth(3, 2, 2)')).toEqual(6)
    expect(runNth('nth:geometricNth(2, 3, 2)')).toEqual(6)
    expect(runNth('nth:geometricNth(1, 2, 2)')).toEqual(2)
    expect(runNth('nth:geometricNth(1, 1.5, 4)')).toEqual(3.375)
  })

  it('should return the correct takeWhile sequence', () => {
    expect(runNth('nth:geometricTakeWhile(1, 1.5, -> $ < 10)')).toEqual([1, 1.5, 2.25, 3.375, 5.0625, 7.59375])
  })

  it('should determine if numbers are in the sequence', () => {
    expect(runNth('nth:isGeometric(0, 2, 0)')).toEqual(true)
    expect(runNth('nth:isGeometric(0, 2, 1)')).toEqual(false)
    expect(runNth('nth:isGeometric(2, 1, 2)')).toEqual(true)
    expect(runNth('nth:isGeometric(2, 1, 3)')).toEqual(false)
    expect(runNth('nth:isGeometric(2, 0, 3)')).toEqual(false)
    expect(runNth('nth:isGeometric(2, 0, 2)')).toEqual(true)
    expect(runNth('nth:isGeometric(2, 0, 0)')).toEqual(true)
    expect(runNth('nth:isGeometric(1, 2, 1)')).toEqual(true)
    expect(runNth('nth:isGeometric(2, 3, 2)')).toEqual(true)
    expect(runNth('nth:isGeometric(3, 2, 2)')).toEqual(false)
    expect(runNth('nth:isGeometric(1, 1.5, 2.25)')).toEqual(true)
    expect(runNth('nth:isGeometric(1, 1.5, -4)')).toEqual(false)
    expect(runNth('nth:isGeometric(1, 0.1, 0.01)')).toEqual(true)
    expect(runNth('nth:isGeometric(3, -1, 3)')).toEqual(true)
    expect(runNth('nth:isGeometric(3, -1, -3)')).toEqual(true)
    expect(runNth('nth:isGeometric(3, -2, -6)')).toEqual(true)
    expect(runNth('nth:isGeometric(3, -2, 6)')).toEqual(false)
    expect(runNth('nth:isGeometric(3, -2, -9)')).toEqual(false)
    expect(runNth('nth:isGeometric(3, -2, -7)')).toEqual(false)
    expect(runNth('nth:isGeometric(3, -2, 12)')).toEqual(true)
    // Test cases for "not close to an integer"
    expect(runNth('nth:isGeometric(2, 2, 9)')).toEqual(false)
    expect(runNth('nth:isGeometric(3, 3, 10)')).toEqual(false)
    expect(runNth('nth:isGeometric(5, -2, 13)')).toEqual(false)

    // Test cases for "negative power"
    expect(runNth('nth:isGeometric(8, 2, 2)')).toEqual(false)
    expect(runNth('nth:isGeometric(16, 4, 1)')).toEqual(false)
    expect(runNth('nth:isGeometric(25, -5, 1)')).toEqual(false)

    // Test case that hits both conditions
    expect(runNth('nth:isGeometric(100, 10, 3)')).toEqual(false)
  })
})
