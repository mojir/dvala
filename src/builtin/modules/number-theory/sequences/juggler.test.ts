import { describe, expect, it } from 'vitest'
import { Dvala } from '../../../../Dvala/Dvala'
import { numberTheoryModule } from '..'
import { DvalaError } from '../../../../errors'

const dvala = new Dvala({ modules: [numberTheoryModule] })

function runNth(code: string) {
  return dvala.run(`let nt = import(number-theory); ${code.replace(/nth:/g, 'nt.')}`)
}
describe('juggler', () => {
  it('should return the correct sequence', () => {
    expect(runNth('nth:juggler-seq(10)')).toEqual([
      10,
      3,
      5,
      11,
      36,
      6,
      2,
      1,
    ])
    expect(() => runNth('nth:juggler-seq(0)')).toThrow(DvalaError)
    expect(() => runNth('nth:juggler-seq(58025)')).toThrow(DvalaError)
  })
})
