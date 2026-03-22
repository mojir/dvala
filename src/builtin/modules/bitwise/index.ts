import { assertNumber } from '../../../typeGuards/number'
import { toFixedArity } from '../../../utils/arity'
import type { Argument, BuiltinNormalExpressions } from '../../interface'
import { moduleDocsFromFunctions } from '../interface'
import type { DvalaModule } from '../interface'
import bitwiseModuleSource from './bitwise.dvala'

function getOperatorArgs(a: 'integer', b: 'integer'): Record<string, Argument> {
  return { a: { type: a }, b: { type: b } }
}

const bitwiseUtilsNormalExpression: BuiltinNormalExpressions = {
  'bitNot': {
    evaluate: ([num], sourceCodeInfo): number => {
      assertNumber(num, sourceCodeInfo, { integer: true })
      return ~num
    },
    arity: toFixedArity(1),
    docs: {
      category: 'bitwise',
      returns: { type: 'integer' },
      args: { a: { type: 'integer' } },
      variants: [{ argumentNames: ['a'] }],
      description: 'Returns bitwise `not` of $a.',
      seeAlso: ['&', '|', 'xor', 'bitwise.bitAndNot'],
      examples: [
        'let { bitNot } = import(bitwise);\nbitNot(0)',
        'let { bitNot } = import(bitwise);\nbitNot(255)',
      ],
    },
  },
  'bitAndNot': {
    evaluate: ([first, ...rest], sourceCodeInfo): number => {
      assertNumber(first, sourceCodeInfo, { integer: true })

      return rest.reduce((result: number, value) => {
        assertNumber(value, sourceCodeInfo, { integer: true })
        return result & ~value
      }, first)
    },
    arity: { min: 2 },
    docs: {
      category: 'bitwise',
      returns: { type: 'integer' },
      args: {
        ...getOperatorArgs('integer', 'integer'),
        c: { type: 'integer', rest: true },
      },
      variants: [
        { argumentNames: ['a', 'b'] },
        { argumentNames: ['a', 'b', 'c'] },
      ],
      description: 'Returns bitwise `and` with complement.',
      seeAlso: ['&', '|', 'xor', 'bitwise.bitNot'],
      examples: [
        'let { bitAndNot } = import(bitwise);\n0b0011 bitAndNot 0b0110',
        'let { bitAndNot } = import(bitwise);\nbitAndNot(0b0011, 0b0110)',
        'let { bitAndNot } = import(bitwise);\nbitAndNot(0b0011, 0b0110, 0b1001)',
      ],
    },
  },
  'bitFlip': {
    evaluate: ([num, index], sourceCodeInfo): number => {
      assertNumber(num, sourceCodeInfo, { integer: true })
      assertNumber(index, sourceCodeInfo, { integer: true, nonNegative: true })

      const mask = 1 << index
      return num ^ mask
    },
    arity: toFixedArity(2),
    docs: {
      category: 'bitwise',
      returns: { type: 'integer' },
      args: { ...getOperatorArgs('integer', 'integer') },
      variants: [{ argumentNames: ['a', 'b'] }],
      description: 'Flips bit number $b.',
      seeAlso: ['bitwise.bitSet', 'bitwise.bitClear', 'bitwise.bitTest'],
      examples: [
        'let { bitFlip } = import(bitwise);\n0b0011 bitFlip 1',
        'let { bitFlip } = import(bitwise);\nbitFlip(0b0011, 1)',
        'let { bitFlip } = import(bitwise);\nbitFlip(0b1100, 1)',
      ],
    },
  },
  'bitSet': {
    evaluate: ([num, index], sourceCodeInfo): number => {
      assertNumber(num, sourceCodeInfo, { integer: true })
      assertNumber(index, sourceCodeInfo, { integer: true, nonNegative: true })

      const mask = 1 << index
      return num | mask
    },
    arity: toFixedArity(2),
    docs: {
      category: 'bitwise',
      returns: { type: 'integer' },
      args: { ...getOperatorArgs('integer', 'integer') },
      variants: [{ argumentNames: ['a', 'b'] }],
      description: 'Sets bit number $b.',
      seeAlso: ['bitwise.bitFlip', 'bitwise.bitClear', 'bitwise.bitTest'],
      examples: [
        'let { bitSet } = import(bitwise);\n0b0010 bitSet 1',
        'let { bitSet } = import(bitwise);\nbitSet(0b0011, 1)',
        'let { bitSet } = import(bitwise);\nbitSet(0b1100, 1)',
      ],
    },
  },
  'bitClear': {
    evaluate: ([num, index], sourceCodeInfo): number => {
      assertNumber(num, sourceCodeInfo, { integer: true })
      assertNumber(index, sourceCodeInfo, { integer: true, nonNegative: true })

      const mask = 1 << index
      return num & ~mask
    },
    arity: toFixedArity(2),
    docs: {
      category: 'bitwise',
      returns: { type: 'integer' },
      args: { ...getOperatorArgs('integer', 'integer') },
      variants: [{ argumentNames: ['a', 'b'] }],
      description: 'Clears bit number $b.',
      seeAlso: ['bitwise.bitFlip', 'bitwise.bitSet', 'bitwise.bitTest'],
      examples: [
        'let { bitClear } = import(bitwise);\n0b0011 bitClear 1',
        'let { bitClear } = import(bitwise);\nbitClear(0b0011, 1)',
        'let { bitClear } = import(bitwise);\nbitClear(0b1100, 1)',
      ],
    },
  },
  'bitTest': {
    evaluate: ([num, index], sourceCodeInfo): boolean => {
      assertNumber(num, sourceCodeInfo, { integer: true })
      assertNumber(index, sourceCodeInfo, { integer: true, nonNegative: true })

      const mask = 1 << index
      return !!(num & mask)
    },
    arity: toFixedArity(2),
    docs: {
      category: 'bitwise',
      returns: { type: 'boolean' },
      args: { ...getOperatorArgs('integer', 'integer') },
      variants: [{ argumentNames: ['a', 'b'] }],
      description: 'Checks if bit number $b is set.',
      seeAlso: ['bitwise.bitFlip', 'bitwise.bitSet', 'bitwise.bitClear'],
      examples: [
        'let { bitTest } = import(bitwise);\n0b0011 bitTest 1',
        'let { bitTest } = import(bitwise);\nbitTest(0b0011, 1)',
        'let { bitTest } = import(bitwise);\nbitTest(0b1100, 1)',
      ],
    },
  },
}

export const bitwiseUtilsModule: DvalaModule = {
  name: 'bitwise',
  functions: bitwiseUtilsNormalExpression,
  source: bitwiseModuleSource,
  docs: moduleDocsFromFunctions(bitwiseUtilsNormalExpression),
}
