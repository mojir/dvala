import type { Arr } from '../../interface'
import { assertArray } from '../../typeGuards/array'
import { asNumber, assertNumber } from '../../typeGuards/number'
import type { BuiltinNormalExpressions } from '../interface'
import { toFixedArity } from '../../utils/arity'

export const arrayNormalExpression: BuiltinNormalExpressions = {
  'range': {
    evaluate: (params, sourceCodeInfo): Arr => {
      const [first, second, third] = params
      let from: number
      let to: number
      let step: number
      assertNumber(first, sourceCodeInfo, { finite: true })

      if (params.length === 1) {
        from = 0
        to = first
        step = to >= 0 ? 1 : -1
      } else if (params.length === 2) {
        assertNumber(second, sourceCodeInfo, { finite: true })
        from = first
        to = second
        step = to >= from ? 1 : -1
      } else {
        assertNumber(second, sourceCodeInfo, { finite: true })
        assertNumber(third, sourceCodeInfo, { finite: true })
        from = first
        to = second
        step = third
        if (to > from)
          assertNumber(step, sourceCodeInfo, { positive: true })
        else if (to < from)
          assertNumber(step, sourceCodeInfo, { negative: true })
        else
          assertNumber(step, sourceCodeInfo, { nonZero: true })
      }

      const result: number[] = []

      for (let i = from; step < 0 ? i > to : i < to; i += step)
        result.push(i)

      return result
    },
    arity: { min: 1, max: 3 },
    docs: {
      category: 'array',
      returns: { type: 'number', array: true },
      args: {
        a: { type: 'number' },
        b: { type: 'number' },
        step: { type: 'number' },
      },
      variants: [
        { argumentNames: ['b'] },
        { argumentNames: ['a', 'b'] },
        { argumentNames: ['a', 'b', 'step'] },
      ],
      description: `$range creates an array with a range of numbers from $a to $b (exclusive), by $step.

$a defaults to 0.
$step defaults to 1.`,
      seeAlso: ['repeat', 'vector.linspace'],
      examples: [
        'range(4)',
        'range(1, 4)',
        '1 range 10',
        'range(0.4, 4.9)',
        `
range(
  0.25, // start value
  1,    // end value (exclusive)
  0.25, // step value
)`,
      ],
    },
  },

  'repeat': {
    evaluate: ([value, count], sourceCodeInfo): Arr => {
      assertNumber(count, sourceCodeInfo, { integer: true, nonNegative: true })
      const result: Arr = []
      for (let i = 0; i < count; i += 1)
        result.push(value)

      return result
    },
    arity: toFixedArity(2),
    docs: {
      category: 'array',
      returns: { type: 'any', array: true },
      args: {
        a: { type: 'any' },
        b: { type: 'integer' },
      },
      variants: [{ argumentNames: ['a', 'b'] }],
      description: 'Returns an array with $a repeated $b times.',
      seeAlso: ['range', 'string.stringRepeat'],
      examples: [
        'repeat(10, 3)',
        'repeat(10, 0)',
        '"Albert" repeat 5',
      ],
    },
  },

  'flatten': {
    evaluate: ([seq, depth], sourceCodeInfo): Arr => {
      assertArray(seq, sourceCodeInfo)

      const actualDepth = depth === undefined || depth === Number.POSITIVE_INFINITY
        ? Number.POSITIVE_INFINITY
        : asNumber(depth, sourceCodeInfo, { integer: true, nonNegative: true })

      return seq.flat(actualDepth)
    },
    arity: { min: 1, max: 2 },
    docs: {
      category: 'array',
      returns: { type: 'any', array: true },
      args: {
        x: { type: ['array', 'any'], description: 'If $x is not an array, `[ ]` is returned.' },
        depth: { type: 'integer', description: 'The depth level specifying how deep a nested array structure should be flattened. Defaults to `Infinity`.' },
      },
      variants: [{ argumentNames: ['x'] }, { argumentNames: ['x', 'depth'] }],
      description: 'Takes a nested array $x and flattens it.',
      seeAlso: ['sequence.mapcat'],
      examples: [
        'flatten([1, 2, [3, 4], 5])',
        'flatten([1, [2, [3, [4]]]], 1)',
        'flatten([1, [2, [3, [4]]]], 2)',
        `
let foo = "bar";
flatten([
  1,
  " 2 A ",
  [foo, [4, ["ABC"]]],
  6,
])`,
      ],
      hideOperatorForm: true,
    },
  },
}
