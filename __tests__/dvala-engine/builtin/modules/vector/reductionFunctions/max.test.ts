import { describe, expect, it } from 'vitest'
import { createDvala } from '@mojir/dvala-core-tooling'
import { vectorModule } from '@mojir/dvala-engine'
import { DvalaError } from '@mojir/dvala-types'

const dvala = createDvala({ modules: [vectorModule] })

describe('max', () => {
  it('should calculate max of a vector', () => {
    expect(dvala.run('max([1, 2, 3])')).toEqual(3)
    expect(dvala.run('max([1, -2, 3])')).toEqual(3)
    expect(dvala.run('max([-1, -2, -3])')).toEqual(-1)
    expect(dvala.run('max([0])')).toEqual(0)
    expect(() => dvala.run('max([])')).toThrowError(DvalaError)
  })
})
