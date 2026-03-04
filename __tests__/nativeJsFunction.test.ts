import { describe, expect, it } from 'vitest'
import { Dvala } from '../src/Dvala/Dvala'
import { DvalaError } from '../src/errors'

describe('nativeJsFunction', () => {
  const dvala = new Dvala()

  it('dotted binding keys are rejected', () => {
    expect(() => dvala.run('1', { bindings: { 'foo.bar': 5 } })).toThrowError(DvalaError)
    expect(() => dvala.run('1', { bindings: { '.bar': 5 } })).toThrowError(DvalaError)
  })
})
