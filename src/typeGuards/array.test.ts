import { describe, it } from 'vitest'
import { testTypeGuars } from '../../__tests__/testUtils'
import { PersistentVector } from '../utils/persistent'
import {
  asArray,
  asCharArray,
  asStringArray,
  assertArray,
  assertCharArray,
  assertStringArray,
  isCharArray,
  isStringArray,
} from './array'

describe('array type guards', () => {
  const nonArrays: unknown[] = [0, 1, true, false, null, undefined, {}, { 1: 1 }, /foo/, 'bar', '']
  const stringArrays = [PersistentVector.from(['foo']), PersistentVector.from(['foo', 'c'])]
  const charArrays = [PersistentVector.from(['f']), PersistentVector.from(['f', 'c'])]
  const unknownArray = PersistentVector.from(['foo', null])

  const allStringArrays = [PersistentVector.empty(), ...stringArrays, ...charArrays]
  const allArrays = [...allStringArrays, unknownArray]

  it('array', () => {
    testTypeGuars(
      {
        valid: allArrays,
        invalid: nonArrays,
      },
      { is: undefined, as: asArray, assert: assertArray },
    )
  })

  it('stringArray', () => {
    testTypeGuars(
      {
        valid: allStringArrays,
        invalid: [...nonArrays, unknownArray],
      },
      { is: isStringArray, as: asStringArray, assert: assertStringArray },
    )
  })

  it('charArray', () => {
    testTypeGuars(
      {
        valid: [PersistentVector.empty(), ...charArrays],
        invalid: [...nonArrays, unknownArray, ...stringArrays],
      },
      { is: isCharArray, as: asCharArray, assert: assertCharArray },
    )
  })
})
