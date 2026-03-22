import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../../createDvala'
import { numberTheoryModule } from '..'
import { DvalaError } from '../../../../errors'

const dvala = createDvala({ modules: [numberTheoryModule] })

function runNth(code: string) {
  return dvala.run(`let nt = import(numberTheory); ${code.replace(/nth:/g, 'nt.')}`)
}
describe('polygonal', () => {
  it('should return the correct sequence', () => {
    expect(runNth('nth:polygonalSeq(3, 2)')).toEqual([1, 3])
    expect(runNth('nth:polygonalSeq(4, 2)')).toEqual([1, 4])
    expect(runNth('nth:polygonalSeq(5, 3)')).toEqual([1, 5, 12])
    expect(runNth('nth:polygonalSeq(6, 5)')).toEqual([1, 6, 15, 28, 45])
    expect(() => runNth('nth:polygonalSeq(2, 1)')).toThrow(DvalaError)
    expect(() => runNth('nth:polygonalSeq(3, 0)')).toThrow(DvalaError)
  })

  it('should return the correct nth term', () => {
    expect(runNth('nth:polygonalNth(3, 9)')).toEqual(45)
    expect(runNth('nth:polygonalNth(4, 5)')).toEqual(25)
    expect(runNth('nth:polygonalNth(5, 5)')).toEqual(35)
  })

  it('should return the correct takeWhile sequence', () => {
    expect(runNth('nth:polygonalTakeWhile(4, -> $ <= 100)')).toEqual([1, 4, 9, 16, 25, 36, 49, 64, 81, 100])
  })

  it('should determine if numbers are in the sequence', () => {
    expect(runNth('nth:isPolygonal(3, 10)')).toEqual(true)
    expect(runNth('nth:isPolygonal(3, 9)')).toEqual(false)
    expect(runNth('nth:isPolygonal(5, 2)')).toEqual(false)
    expect(runNth('nth:isPolygonal(3, -9)')).toEqual(false)
    expect(runNth('nth:isPolygonal(4, 10000)')).toEqual(true)
    expect(runNth('nth:isPolygonal(4, 1000)')).toEqual(false)
    expect(runNth('nth:isPolygonal(6, 45)')).toEqual(true)
  })
})
