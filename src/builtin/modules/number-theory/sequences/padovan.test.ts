import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../../createDvala'
import { numberTheoryModule } from '..'

const dvala = createDvala({ modules: [numberTheoryModule] })

function runNth(code: string) {
  return dvala.run(`let nt = import("numberTheory"); ${code.replace(/nth:/g, 'nt.')}`)
}
describe('padovan', () => {
  it('should return the correct sequence', () => {
    expect(runNth('nth:padovanSeq(1)')).toEqual([1])
    expect(runNth('nth:padovanSeq(2)')).toEqual([1, 1])
    expect(runNth('nth:padovanSeq(3)')).toEqual([1, 1, 1])
    expect(runNth('nth:padovanSeq(4)')).toEqual([1, 1, 1, 2])
    expect(runNth('nth:padovanSeq(22)')).toEqual([
      1, 1, 1, 2, 2, 3, 4, 5, 7, 9, 12, 16, 21, 28, 37, 49, 65, 86, 114, 151, 200, 265,
    ])
  })

  it('should return the correct nth term', () => {
    expect(runNth('nth:padovanNth(1)')).toEqual(1)
    expect(runNth('nth:padovanNth(2)')).toEqual(1)
    expect(runNth('nth:padovanNth(3)')).toEqual(1)
    expect(runNth('nth:padovanNth(4)')).toEqual(2)
    expect(runNth('nth:padovanNth(5)')).toEqual(2)
    expect(runNth('nth:padovanNth(6)')).toEqual(3)
    expect(runNth('nth:padovanNth(7)')).toEqual(4)
    expect(runNth('nth:padovanNth(8)')).toEqual(5)
    expect(runNth('nth:padovanNth(22)')).toEqual(265)
  })

  it('should return the correct takeWhile sequence', () => {
    expect(runNth('nth:padovanTakeWhile(-> $ < 8)')).toEqual([1, 1, 1, 2, 2, 3, 4, 5, 7])
    expect(runNth('nth:padovanTakeWhile(-> $2 < 10)')).toEqual([1, 1, 1, 2, 2, 3, 4, 5, 7, 9])
    expect(runNth('nth:padovanTakeWhile(-> $2 < 0)')).toEqual([])
    expect(runNth('nth:padovanTakeWhile(-> $2 < 1)')).toEqual([1])
    expect(runNth('nth:padovanTakeWhile(-> $2 < 2)')).toEqual([1, 1])
  })

  it('should determine if numbers are in the sequence', () => {
    expect(runNth('nth:isPadovan(0)')).toEqual(false)
    expect(runNth('nth:isPadovan(1)')).toEqual(true)
    expect(runNth('nth:isPadovan(2)')).toEqual(true)
    expect(runNth('nth:isPadovan(3)')).toEqual(true)
    expect(runNth('nth:isPadovan(4)')).toEqual(true)
    expect(runNth('nth:isPadovan(5)')).toEqual(true)
    expect(runNth('nth:isPadovan(6)')).toEqual(false)
    expect(runNth('nth:isPadovan(7)')).toEqual(true)
    expect(runNth('nth:isPadovan(8)')).toEqual(false)
    expect(runNth('nth:isPadovan(265)')).toEqual(true)
    expect(runNth('nth:isPadovan(922111)')).toEqual(true)
    expect(runNth(`nth:isPadovan(${Number.MAX_SAFE_INTEGER - 1})`)).toEqual(false)
  })
})
