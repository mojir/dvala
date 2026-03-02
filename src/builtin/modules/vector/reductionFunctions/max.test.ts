import { describe, expect, it } from 'vitest'
import { Dvala } from '../../../../Dvala/Dvala'
import { vectorModule } from '..'
import { DvalaError } from '../../../../errors'

const dvala = new Dvala({ modules: [vectorModule] })

describe('max', () => {
  it('should calculate max of a vector', () => {
    expect(dvala.run('max([1, 2, 3])')).toEqual(3)
    expect(dvala.run('max([1, -2, 3])')).toEqual(3)
    expect(dvala.run('max([-1, -2, -3])')).toEqual(-1)
    expect(dvala.run('max([0])')).toEqual(0)
    expect(() => dvala.run('max([])')).toThrowError(DvalaError)
  })
})
