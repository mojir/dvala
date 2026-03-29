import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../../createDvala'
import { numberTheoryModule } from '..'

const dvala = createDvala({ modules: [numberTheoryModule] })

function runNth(code: string) {
  return dvala.run(`let nt = import("numberTheory"); ${code.replace(/nth:/g, 'nt.')}`)
}
describe('lookAndSay', () => {
  it('should return the correct sequence', () => {
    expect(runNth('nth:lookAndSaySeq(1)')).toEqual(['1'])
    expect(runNth('nth:lookAndSaySeq(2)')).toEqual(['1', '11'])
    expect(runNth('nth:lookAndSaySeq(3)')).toEqual(['1', '11', '21'])
    expect(runNth('nth:lookAndSaySeq(4)')).toEqual(['1', '11', '21', '1211'])
    expect(runNth('nth:lookAndSaySeq(5)')).toEqual(['1', '11', '21', '1211', '111221'])
  })

  it('should return the correct nth term', () => {
    expect(runNth('nth:lookAndSayNth(1)')).toEqual('1')
    expect(runNth('nth:lookAndSayNth(2)')).toEqual('11')
    expect(runNth('nth:lookAndSayNth(3)')).toEqual('21')
    expect(runNth('nth:lookAndSayNth(4)')).toEqual('1211')
    expect(runNth('nth:lookAndSayNth(5)')).toEqual('111221')
  })

  it('should return the correct takeWhile sequence', () => {
    expect(runNth('nth:lookAndSayTakeWhile(-> $2 < 5)')).toEqual(['1', '11', '21', '1211', '111221'])
    expect(runNth('nth:lookAndSayTakeWhile(-> false)')).toEqual([])
  })

  it('should determine if numbers are in the sequence', () => {
    expect(runNth('nth:isLookAndSay("1")')).toEqual(true)
    expect(runNth('nth:isLookAndSay("11")')).toEqual(true)
    expect(runNth('nth:isLookAndSay("21")')).toEqual(true)
    expect(runNth('nth:isLookAndSay("1211")')).toEqual(true)
    expect(runNth('nth:isLookAndSay("111221")')).toEqual(true)
    expect(runNth('nth:isLookAndSay("12345")')).toEqual(false)
  })
})
