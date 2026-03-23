import { describe, expect, it } from 'vitest'
import type { ArrayBindingTarget, BindingTarget } from '../parser/types'
import { bindingTargetTypes } from '../parser/types'
import { NodeTypes } from '../constants/constants'
import { getAllBindingTargetNames } from './bindingNode'

describe('getAllBindingTargetNames', () => {
  it('should return an empty array for an empty binding node', () => {
    const bindingTarget: BindingTarget = [bindingTargetTypes.array, [[], undefined], 0]

    const result = getAllBindingTargetNames(bindingTarget)
    expect(result).toEqual({})
  })

  it('should return a single name for a symbol target', () => {
    const bindingTarget: BindingTarget = [bindingTargetTypes.symbol, [[NodeTypes.UserDefinedSymbol, 'x', 0], undefined], 0]

    const result = getAllBindingTargetNames(bindingTarget)
    expect(result).toEqual({ x: true })
  })

  it('should return all names for an object target', () => {
    const bindingTarget: BindingTarget = [bindingTargetTypes.object, [
      {
        a: [bindingTargetTypes.symbol, [[NodeTypes.UserDefinedSymbol, 'a', 0], undefined], 0],
        b: [bindingTargetTypes.symbol, [[NodeTypes.UserDefinedSymbol, 'b', 0], undefined], 0],
      },
      undefined,
    ], 0]
    const result = getAllBindingTargetNames(bindingTarget)
    expect(result).toEqual({ a: true, b: true })
  })

  it('should return all names for a nested object target', () => {
    const bindingTarget: BindingTarget = [bindingTargetTypes.object, [{ a: [bindingTargetTypes.object, [
      {
        x: [bindingTargetTypes.symbol, [[NodeTypes.UserDefinedSymbol, 'x', 0], undefined], 0],
        y: [bindingTargetTypes.symbol, [[NodeTypes.UserDefinedSymbol, 'y', 0], undefined], 0],
      },
      undefined,
    ], 0], z: [bindingTargetTypes.symbol, [[NodeTypes.UserDefinedSymbol, 'z', 0], undefined], 0] }, undefined], 0]

    const result = getAllBindingTargetNames(bindingTarget)
    expect(result).toEqual({ x: true, y: true, z: true })
  })

  it('should return all names for an array target', () => {
    const bindingTarget: ArrayBindingTarget = [bindingTargetTypes.array, [
      [
        [bindingTargetTypes.symbol, [[NodeTypes.UserDefinedSymbol, 'a', 0], undefined], 0],
        [bindingTargetTypes.symbol, [[NodeTypes.UserDefinedSymbol, 'b', 0], undefined], 0],
      ],
      undefined,
    ], 0]

    const result = getAllBindingTargetNames(bindingTarget)
    expect(result).toEqual({ a: true, b: true })
  })

  it('should return all names for a deeply nested structure', () => {
    const bindingTarget: BindingTarget = [bindingTargetTypes.object, [
      {
        a: [bindingTargetTypes.array, [
          [
            [bindingTargetTypes.symbol, [[NodeTypes.UserDefinedSymbol, 'x', 0], undefined], 0],
            [bindingTargetTypes.object, [
              {
                y: [bindingTargetTypes.symbol, [[NodeTypes.UserDefinedSymbol, 'y', 0], undefined], 0],
                z: [bindingTargetTypes.symbol, [[NodeTypes.UserDefinedSymbol, 'z', 0], undefined], 0],
              },
              undefined,
            ], 0],
          ],
          undefined,
        ], 0],
      },
      undefined,
    ], 0]

    const result = getAllBindingTargetNames(bindingTarget)
    expect(result).toEqual({ x: true, y: true, z: true })
  })
})
