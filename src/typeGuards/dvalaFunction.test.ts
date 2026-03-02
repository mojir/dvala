import { describe, expect, it, test } from 'vitest'
import { testTypeGuars } from '../../__tests__/testUtils'
import type { DvalaFunction, NativeJsFunction } from '../parser/types'
import { FUNCTION_SYMBOL } from '../utils/symbols'
import { normalExpressionTypes } from '../builtin/normalExpressions'
import {
  asDvalaFunction,
  asNativeJsFunction,
  asUserDefinedFunction,
  assertDvalaFunction,
  assertNativeJsFunction,
  assertUserDefinedFunction,
  isBuiltinFunction,
  isDvalaFunction,
  isNativeJsFunction,
  isUserDefinedFunction,
} from './dvalaFunction'

function createNativeJsFunction(fn: (...args: any[]) => unknown, name?: string): NativeJsFunction {
  return {
    [FUNCTION_SYMBOL]: true,
    nativeFn: {
      fn,
    },
    name,
    functionType: 'NativeJsFunction',
    arity: {},
    docString: '',
  }
}

describe('dvalaFunction type guards', () => {
  const lf1: DvalaFunction = {
    [FUNCTION_SYMBOL]: true,
    functionType: 'UserDefined',
    name: undefined,
    evaluatedfunction: [[], [], {}],
    arity: {},
    docString: '',
  }
  const lf2: DvalaFunction = {
    [FUNCTION_SYMBOL]: true,
    functionType: 'Builtin',
    normalBuiltinSymbolType: normalExpressionTypes['+'] as number,
    arity: {},
    name: '+',
  }
  const lf4: DvalaFunction = {
    [FUNCTION_SYMBOL]: true,
    functionType: 'Comp',
    params: ['x'],
    arity: {},
  }
  const lf5: DvalaFunction = {
    [FUNCTION_SYMBOL]: true,
    functionType: 'Constantly',
    value: 10,
    arity: {},
  }
  const lf6 = createNativeJsFunction(() => undefined)
  const lf7 = createNativeJsFunction(() => undefined, 'native')

  it('isDvalaFunction', () => {
    const valid = [lf1, lf2, lf4, lf5, lf6, lf7]
    const invalid = ['', '1', 0, 1, true, false, null, undefined, [], {}]
    testTypeGuars(
      {
        valid,
        invalid,
      },
      { is: isDvalaFunction, as: asDvalaFunction, assert: assertDvalaFunction },
    )
  })

  it('isUserDefinedFunction', () => {
    const valid = [lf1]
    const invalid = [lf2, lf4, lf5, lf6, lf7, '', '1', 0, 1, true, false, null, undefined, [], {}]

    testTypeGuars(
      {
        valid,
        invalid,
      },
      { is: isUserDefinedFunction, as: asUserDefinedFunction, assert: assertUserDefinedFunction },
    )
  })

  it('isNativeJsFunction', () => {
    const valid = [lf6, lf7]
    const invalid = [lf1, lf2, lf4, lf5, '', '1', 0, 1, true, false, null, undefined, [], {}]

    testTypeGuars(
      {
        valid,
        invalid,
      },
      { is: isNativeJsFunction, as: asNativeJsFunction, assert: assertNativeJsFunction },
    )
  })
  test('isBuiltinFunction', () => {
    expect(isBuiltinFunction(lf1)).toBe(false)
    expect(isBuiltinFunction(lf2)).toBe(true)
  })
})
