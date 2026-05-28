import { describe, expect, it } from 'vitest'
import { getCodeMarker } from '@mojir/dvala-types'

describe('debugTools', () => {
  it('getCodeMarker', () => {
    expect(getCodeMarker({ code: '', position: { line: 1, column: 2 } })).toBe('')
    expect(getCodeMarker({ code: 'foo', position: { line: 1, column: 2 } })).toBe(' ^ ')
  })
})
