import { describe, expect, it } from 'vitest'
import { createDvala } from '../src/createDvala'
import { DvalaError } from '../src/errors'

describe('nativeJsFunction', () => {
  const dvala = createDvala()

  it('dotted binding keys are rejected', () => {
    expect(() => dvala.run('1', { bindings: { 'foo.bar': 5 } })).toThrowError(DvalaError)
    expect(() => dvala.run('1', { bindings: { '.bar': 5 } })).toThrowError(DvalaError)
  })
})
