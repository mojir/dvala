import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../../createDvala'
import { numberTheoryModule } from '..'

const dvala = createDvala({ modules: [numberTheoryModule] })

function runNth(code: string) {
  return dvala.run(`let nt = import(numberTheory); ${code.replace(/nth:/g, 'nt.')}`)
}
describe('thueMore', () => {
  it('should return the correct sequence', () => {
    expect(runNth('nth:thueMorseSeq(1)')).toEqual([0])
    expect(runNth('nth:thueMorseSeq(2)')).toEqual([0, 1])
    expect(runNth('nth:thueMorseSeq(3)')).toEqual([0, 1, 1])
    expect(runNth('nth:thueMorseSeq(4)')).toEqual([0, 1, 1, 0])
    expect(runNth('nth:thueMorseSeq(5)')).toEqual([0, 1, 1, 0, 1])
  })

  it('should return the correct nth term', () => {
    expect(runNth('nth:thueMorseNth(1)')).toEqual(0)
    expect(runNth('nth:thueMorseNth(2)')).toEqual(1)
    expect(runNth('nth:thueMorseNth(3)')).toEqual(1)
    expect(runNth('nth:thueMorseNth(4)')).toEqual(0)
    expect(runNth('nth:thueMorseNth(5)')).toEqual(1)
  })

  it('should return the correct takeWhile sequence', () => {
    expect(runNth('nth:thueMorseTakeWhile(-> $2 < 5)')).toEqual([0, 1, 1, 0, 1])
  })

  it('should determine if numbers are in the sequence', () => {
    expect(runNth('nth:isThueMorse(0)')).toEqual(true)
    expect(runNth('nth:isThueMorse(1)')).toEqual(true)
    expect(runNth('nth:isThueMorse(2)')).toEqual(false)
  })
})
