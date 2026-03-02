import { describe, expect, it } from 'vitest'
import { Dvala } from '../../../../Dvala/Dvala'
import { vectorModule } from '..'
import { DvalaError } from '../../../../errors'

const dvala = new Dvala({ modules: [vectorModule] })

describe('min', () => {
  it('should calculate min of a vector', () => {
    expect(dvala.run('min([1, 2, 3])')).toEqual(1)
    expect(dvala.run('min([1, -2, 3])')).toEqual(-2)
    expect(dvala.run('min([-1, -2, -3])')).toEqual(-3)
    expect(dvala.run('min([0])')).toEqual(0)
    expect(() => dvala.run('min([])')).toThrow(DvalaError)
  })
})
