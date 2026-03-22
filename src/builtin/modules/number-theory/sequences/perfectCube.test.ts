import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../../createDvala'
import { numberTheoryModule } from '..'
import { DvalaError } from '../../../../errors'

const dvala = createDvala({ modules: [numberTheoryModule] })

function runNth(code: string) {
  return dvala.run(`let nt = import(number-theory); ${code.replace(/nth:/g, 'nt.')}`)
}
describe('perfect-cube', () => {
  it('should return the correct sequence', () => {
    expect(runNth('nth:perfectCubeSeq(1)')).toEqual([1])
    expect(runNth('nth:perfectCubeSeq(2)')).toEqual([1, 8])
    expect(runNth('nth:perfectCubeSeq(3)')).toEqual([1, 8, 27])
    expect(runNth('nth:perfectCubeSeq(4)')).toEqual([1, 8, 27, 64])
    expect(() => runNth('nth:perfectCubeSeq(0)')).toThrow(DvalaError)
  })

  it('should return the correct nth term', () => {
    expect(runNth('nth:perfectCubeNth(1)')).toEqual(1)
    expect(runNth('nth:perfectCubeNth(2)')).toEqual(8)
    expect(runNth('nth:perfectCubeNth(3)')).toEqual(27)
    expect(runNth('nth:perfectCubeNth(4)')).toEqual(64)
    expect(runNth('nth:perfectCubeNth(5)')).toEqual(125)
    expect(runNth('nth:perfectCubeNth(100)')).toEqual(1000000)
  })

  it('should return the correct takeWhile sequence', () => {
    expect(runNth('nth:perfectCubeTakeWhile(-> $ < 100)')).toEqual([
      1,
      8,
      27,
      64,
    ])
  })

  it('should determine if numbers are in the sequence', () => {
    expect(runNth('nth:isPerfectCube(0)')).toEqual(false)
    expect(runNth('nth:isPerfectCube(1)')).toEqual(true)
    expect(runNth('nth:isPerfectCube(2)')).toEqual(false)
    expect(runNth('nth:isPerfectCube(3)')).toEqual(false)
    expect(runNth('nth:isPerfectCube(4)')).toEqual(false)
    expect(runNth('nth:isPerfectCube(5)')).toEqual(false)
    expect(runNth('nth:isPerfectCube(6)')).toEqual(false)
    expect(runNth('nth:isPerfectCube(7)')).toEqual(false)
    expect(runNth('nth:isPerfectCube(8)')).toEqual(true)
    expect(runNth('nth:isPerfectCube(9)')).toEqual(false)
    expect(runNth('nth:isPerfectCube(1000)')).toEqual(true)
    expect(runNth('nth:isPerfectCube(10000)')).toEqual(false)
  })
})
