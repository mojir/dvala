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
    const bindingTarget: BindingTarget = [bindingTargetTypes.symbol, [[NodeTypes.Sym, 'x', 0], undefined], 0]

    const result = getAllBindingTargetNames(bindingTarget)
    expect(result).toEqual({ x: true })
  })

  it('should return all names for an object target', () => {
    const bindingTarget: BindingTarget = [bindingTargetTypes.object, [
      [
        { key: 'a', keyNodeId: 0, target: [bindingTargetTypes.symbol, [[NodeTypes.Sym, 'a', 0], undefined], 0] },
        { key: 'b', keyNodeId: 0, target: [bindingTargetTypes.symbol, [[NodeTypes.Sym, 'b', 0], undefined], 0] },
      ],
      undefined,
    ], 0]
    const result = getAllBindingTargetNames(bindingTarget)
    expect(result).toEqual({ a: true, b: true })
  })

  it('should return all names for a nested object target', () => {
    const bindingTarget: BindingTarget = [bindingTargetTypes.object, [
      [
        { key: 'a', keyNodeId: 0, target: [bindingTargetTypes.object, [
          [
            { key: 'x', keyNodeId: 0, target: [bindingTargetTypes.symbol, [[NodeTypes.Sym, 'x', 0], undefined], 0] },
            { key: 'y', keyNodeId: 0, target: [bindingTargetTypes.symbol, [[NodeTypes.Sym, 'y', 0], undefined], 0] },
          ],
          undefined,
        ], 0] },
        { key: 'z', keyNodeId: 0, target: [bindingTargetTypes.symbol, [[NodeTypes.Sym, 'z', 0], undefined], 0] },
      ],
      undefined,
    ], 0]

    const result = getAllBindingTargetNames(bindingTarget)
    expect(result).toEqual({ x: true, y: true, z: true })
  })

  it('should return all names for an array target', () => {
    const bindingTarget: ArrayBindingTarget = [bindingTargetTypes.array, [
      [
        [bindingTargetTypes.symbol, [[NodeTypes.Sym, 'a', 0], undefined], 0],
        [bindingTargetTypes.symbol, [[NodeTypes.Sym, 'b', 0], undefined], 0],
      ],
      undefined,
    ], 0]

    const result = getAllBindingTargetNames(bindingTarget)
    expect(result).toEqual({ a: true, b: true })
  })

  it('should return all names for a deeply nested structure', () => {
    const bindingTarget: BindingTarget = [bindingTargetTypes.object, [
      [
        { key: 'a', keyNodeId: 0, target: [bindingTargetTypes.array, [
          [
            [bindingTargetTypes.symbol, [[NodeTypes.Sym, 'x', 0], undefined], 0],
            [bindingTargetTypes.object, [
              [
                { key: 'y', keyNodeId: 0, target: [bindingTargetTypes.symbol, [[NodeTypes.Sym, 'y', 0], undefined], 0] },
                { key: 'z', keyNodeId: 0, target: [bindingTargetTypes.symbol, [[NodeTypes.Sym, 'z', 0], undefined], 0] },
              ],
              undefined,
            ], 0],
          ],
          undefined,
        ], 0] },
      ],
      undefined,
    ], 0]

    const result = getAllBindingTargetNames(bindingTarget)
    expect(result).toEqual({ x: true, y: true, z: true })
  })
})
