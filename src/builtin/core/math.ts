import { ArithmeticError, RuntimeError } from '../../errors'
import type { Any, Arr } from '../../interface'
import type { SourceCodeInfo } from '../../tokenizer/token'
import { assertNonEmptyVector, isVector } from '../../typeGuards/annotatedCollections'
import { assertNumber, isNumber } from '../../typeGuards/number'
import { toFixedArity } from '../../utils/arity'
import type { BuiltinNormalExpressions } from '../interface'

function getNumberOperands(params: Iterable<unknown>, sourceCodeInfo: SourceCodeInfo | undefined): number[] {
  const operands = Array.from(params)
  operands.forEach(param => {
    if (!isNumber(param)) {
      throw new RuntimeError(`Invalid parameter type: ${typeof param}`, sourceCodeInfo)
    }
  })
  return operands as number[]
}

// Applies fn and throws if the result is not finite (NaN or Infinity).
// Core math is scalar-only, so this keeps the runtime checks aligned with the
// builtin docs and the typechecker.
function checkedFn(fn: (a: number, b: number) => number, a: number, b: number, sourceCodeInfo: SourceCodeInfo | undefined): number
function checkedFn(fn: (a: number) => number, a: number, b: undefined, sourceCodeInfo: SourceCodeInfo | undefined): number
function checkedFn(fn: (...args: number[]) => number, a: number, b: number | undefined, sourceCodeInfo: SourceCodeInfo | undefined): number {
  const result = b === undefined ? fn(a) : fn(a, b)
  if (!Number.isFinite(result)) {
    throw new ArithmeticError('Number is not finite', sourceCodeInfo)
  }
  return result
}

function unaryMathOp(
  fn: (val: number) => number,
): (params: Arr, sourceCodeInfo: SourceCodeInfo | undefined) => Any {
  return (params, sourceCodeInfo) => {
    const operands = getNumberOperands(params, sourceCodeInfo)
    return checkedFn(fn, operands[0]!, undefined, sourceCodeInfo)
  }
}

function binaryMathOp(
  fn: (a: number, b: number) => number,
): (params: Arr, sourceCodeInfo: SourceCodeInfo | undefined) => Any {
  return (params, sourceCodeInfo) => {
    const operands = getNumberOperands(params, sourceCodeInfo)
    return checkedFn(fn, operands[0]!, operands[1]!, sourceCodeInfo)
  }
}

function reduceMathOp(
  identity: number,
  fn: (a: number, b: number) => number,
): (params: Arr, sourceCodeInfo: SourceCodeInfo | undefined) => Any {
  return (params, sourceCodeInfo) => {
    if (params.size === 0)
      return identity
    const operands = getNumberOperands(params, sourceCodeInfo)
    return operands.reduce((a, b) => fn(a, b), identity)
  }
}

export const mathNormalExpression: BuiltinNormalExpressions = {
  'inc': {
    evaluate: unaryMathOp(val => val + 1),
    arity: toFixedArity(1),
    docs: {
      type: '((Number) -> Number)',
      category: 'math',
      returns: { type: 'number' },
      args: {
        x: { type: 'number' },
      },
      variants: [{ argumentNames: ['x'] }],
      description: 'The `inc` function increments a number by 1.',
      seeAlso: ['dec', '+'],
      examples: [
        'inc(0)',
        'inc(1)',
        'inc(100.1)',
        'inc(-2.5)',
      ],
    },
  },
  'dec': {
    evaluate: unaryMathOp(val => val - 1),
    arity: toFixedArity(1),
    docs: {
      type: '((Number) -> Number)',
      category: 'math',
      returns: { type: 'number' },
      args: {
        x: { type: 'number' },
      },
      variants: [{ argumentNames: ['x'] }],
      description: 'The `dec` function decrements a number by 1.',
      seeAlso: ['inc', '-'],
      examples: [
        'dec(0)',
        'dec(1)',
        'dec(100.1)',
        'dec(-2.5)',
      ],
    },
  },
  '+': {
    evaluate: reduceMathOp(0, (a, b) => a + b),
    arity: {},
    docs: {
      type: '(() -> Number) & ((Number, ...Number[]) -> Number)',
      category: 'math',
      returns: { type: 'number' },
      args: {
        a: { type: 'number' },
        b: { type: 'number' },
        xs: { type: 'number', rest: true },
      },
      variants: [{ argumentNames: ['xs'] }],
      description: 'The `+` function adds numbers. With no arguments it returns `0`.',
      seeAlso: ['-', '*', '/', 'inc'],
      examples: [
        '1 + 2',
        '1 + 20 + 30',
        '+(1, 2, 3, 4)',
        '+()',
        '+(1)',
        '-2 + 2',
      ],
    },
  },
  '*': {
    evaluate: reduceMathOp(1, (a, b) => a * b),
    arity: {},
    docs: {
      type: '(() -> Number) & ((Number, ...Number[]) -> Number)',
      category: 'math',
      returns: { type: 'number' },
      args: {
        a: { type: 'number' },
        b: { type: 'number' },
        xs: { type: 'number', rest: true },
      },
      variants: [{ argumentNames: ['xs'] }],
      description: 'The `*` function multiplies numbers. With no arguments it returns `1`.',
      seeAlso: ['/', '+', '-', '^'],
      examples: [
        '6 * 7',
        '-1 * 4',
        '*(4, 7)',
        '*(1, 2, 3, 4, 5)',
        '*()',
        '*(8)',
        '2 * 2',
      ],
    },
  },
  '/': {
    evaluate: (params, sourceCodeInfo): Any => {
      if (params.size === 0) {
        return 1
      }

      const operands = getNumberOperands(params, sourceCodeInfo)

      const [first, ...rest] = operands
      if (rest.length === 0) {
        return checkedFn(val => 1 / val, first!, undefined, sourceCodeInfo)
      }
      return rest.reduce((result, param) => checkedFn((a, b) => a / b, result, param, sourceCodeInfo), first!)
    },
    arity: {},
    docs: {
      type: '(() -> Number) & ((Number, ...Number[]) -> Number)',
      category: 'math',
      returns: { type: 'number' },
      args: {
        a: { type: 'number' },
        b: { type: 'number' },
        xs: { type: 'number', rest: true },
      },
      variants: [{ argumentNames: ['xs'] }],
      description: 'The `/` function divides numbers. With no arguments it returns `1`, and with one argument it returns the reciprocal.',
      seeAlso: ['*', '+', '-', 'quot', 'mod', '%'],
      examples: [
        '12 / 100',
        '-1 / 4',
        '/(7, 4)',
        '/(1, 2, 4, 8)',
        '/()',
        '/(8)',
        '2 / 5',
      ],
    },
  },
  '-': {
    evaluate: (params, sourceCodeInfo): Any => {
      if (params.size === 0) {
        return 0
      }

      const operands = getNumberOperands(params, sourceCodeInfo)

      const [first, ...rest] = operands
      if (rest.length === 0)
        return checkedFn(val => -val, first!, undefined, sourceCodeInfo)

      return rest.reduce((result, param) => checkedFn((a, b) => a - b, result, param, sourceCodeInfo), first!)
    },
    arity: {},
    docs: {
      type: '(() -> Number) & ((Number, ...Number[]) -> Number)',
      category: 'math',
      returns: { type: 'number' },
      args: {
        a: { type: 'number' },
        b: { type: 'number' },
        xs: { type: 'number', rest: true },
      },
      variants: [{ argumentNames: ['xs'] }],
      description: 'Computes the difference between the first number and the rest. With one argument it negates the number.',
      seeAlso: ['+', '*', '/', 'dec', 'abs'],
      examples: [
        '50 - 8',
        '1 - 1 - 1',
        '-()',
        '-(4, 2)',
        '-(4, 3, 2, 1,)',
        'let a = 0; let b = 2; a - b',
      ],
    },
  },
  'quot': {
    evaluate: binaryMathOp((a, b) => Math.trunc(a / b)),
    arity: toFixedArity(2),
    docs: {
      // `quot` truncates (Math.trunc(a/b)) so the result is always integer-
      // valued when the inputs are finite. NaN inputs are rejected by the
      // `isNumber` input guard; Infinity inputs (and any non-finite result
      // like `quot(1, 0)`) are rejected by `checkedFn`'s non-finite result
      // check. Together this means every reachable return value is an integer.
      type: '((Number, Number) -> Integer)',
      category: 'math',
      returns: { type: 'integer' },
      args: {
        a: { type: 'number' },
        b: { type: 'number' },
      },
      variants: [{ argumentNames: ['a', 'b'] }],
      description: 'The `quot` function performs integer division truncated toward zero on two numbers.',
      seeAlso: ['mod', '%', '/', 'trunc'],
      examples: [
        'quot(5, 3)',
        'quot(5.2, 3.1)',
        'quot(-5, 3)',
        '5 quot -3',
        '-5 quot -3',
        'quot(0, 5)',
        'quot(13.75, 3.25)',
      ],
    },
  },
  'mod': {
    evaluate: binaryMathOp((a, b) => a - b * Math.floor(a / b)),
    arity: toFixedArity(2),
    docs: {
      type: '((Number, Number) -> Number)',
      category: 'math',
      returns: { type: 'number' },
      args: {
        a: { type: 'number' },
        b: { type: 'number' },
      },
      variants: [{ argumentNames: ['a', 'b'] }],
      description: 'The `mod` function computes the modulo of division with the same sign as the divisor.',
      seeAlso: ['%', 'quot', '/'],
      examples: [
        'mod(5, 3)',
        'mod(5.2, 3.1)',
        'mod(-5, 3)',
        '5 mod -3',
        '-5 mod -3',
        'mod(13.75, 3.25)',
      ],
    },
  },
  '%': {
    evaluate: binaryMathOp((a, b) => a % b),
    arity: toFixedArity(2),
    docs: {
      type: '((Number, Number) -> Number)',
      category: 'math',
      returns: { type: 'number' },
      args: {
        a: { type: 'number' },
        b: { type: 'number' },
      },
      variants: [{ argumentNames: ['a', 'b'] }],
      description: 'The `%` function computes the remainder of division with the same sign as the dividend.',
      seeAlso: ['mod', 'quot', '/'],
      examples: [
        '5 % 3',
        '5.2 % 3.1',
        '-5 % 3',
        '%(5, -3)',
        '%(-5, -3)',
        '%(13.75, 3.25)',
      ],
    },
  },
  'sqrt': {
    evaluate: unaryMathOp(val => Math.sqrt(val)),
    arity: toFixedArity(1),
    docs: {
      type: '((Number) -> Number)',
      category: 'math',
      returns: { type: 'number' },
      args: {
        x: { type: 'number' },
      },
      variants: [{ argumentNames: ['x'] }],
      description: 'The `sqrt` function calculates the square root of a number.',
      seeAlso: ['cbrt', '^'],
      examples: [
        'sqrt(0)',
        'sqrt(9)',
        'sqrt(2)',
        'sqrt(1)',
      ],
    },
  },
  'cbrt': {
    evaluate: unaryMathOp(val => Math.cbrt(val)),
    arity: toFixedArity(1),
    docs: {
      type: '((Number) -> Number)',
      category: 'math',
      returns: { type: 'number' },
      args: {
        x: { type: 'number' },
      },
      variants: [{ argumentNames: ['x'] }],
      description: 'The `cbrt` function calculates the cube root of a number.',
      seeAlso: ['sqrt', '^'],
      examples: [
        'cbrt(0)',
        'cbrt(27)',
        'cbrt(2)',
        'cbrt(1)',
        'cbrt(-8)',
      ],
    },
  },
  '^': {
    evaluate: binaryMathOp((a, b) => a ** b),
    arity: toFixedArity(2),
    docs: {
      type: '((Number, Number) -> Number)',
      category: 'math',
      returns: { type: 'number' },
      args: {
        a: { type: 'number' },
        b: { type: 'number' },
      },
      variants: [{ argumentNames: ['a', 'b'] }],
      description: 'The `^` function computes exponentiation, raising the first number to the power of the second.',
      seeAlso: ['sqrt', 'cbrt', '*', 'math.ln'],
      examples: [
        '2 ^ 3',
        '2 ^ 0',
        '2 ^ -3',
        '^(-2, 3)',
        '^(-2, -3)',
        '^(16, 0.5)',
      ],
    },
  },
  'round': {
    evaluate: ([value, decimals], sourceCodeInfo): Any => {
      const [operand] = getNumberOperands([value], sourceCodeInfo)
      if (decimals === undefined || decimals === 0) {
        return Math.round(operand!)
      } else {
        assertNumber(decimals, sourceCodeInfo, { integer: true, positive: true })
        const factor = 10 ** decimals
        return Math.round(operand! * factor) / factor
      }
    },
    arity: { min: 1, max: 2 },
    docs: {
      // 1-arg form returns Integer (Math.round); 2-arg form (round to N
      // decimals) returns Number. `returns` below reports 'number' as the
      // broader view — `dvala doc round` readers see the overloaded `type`
      // field for precision.
      type: '((Number) -> Integer) & ((Number, Integer) -> Number)',
      category: 'math',
      returns: { type: 'number' },
      args: {
        a: { type: 'number' },
        b: { type: 'integer' },
      },
      variants: [
        { argumentNames: ['a'] },
        { argumentNames: ['a', 'b'] },
      ],
      description: 'The `round` function rounds a number to the nearest integer or to a specified number of decimal places.',
      seeAlso: ['floor', 'ceil', 'trunc'],
      examples: [
        'round(2)',
        'round(2.49)',
        'round(2.5)',
        'round(-2.49)',
        'round(-2.5)',
        'round(-2.501)',
        'round(1.23456789, 4)',
        '1.123456789 round 2',
        'round(-0.125, 1)',
      ],
    },
  },
  'trunc': {
    evaluate: unaryMathOp(val => Math.trunc(val)),
    arity: toFixedArity(1),
    docs: {
      type: '((Number) -> Integer)',
      category: 'math',
      returns: { type: 'integer' },
      args: {
        x: { type: 'number' },
      },
      variants: [{ argumentNames: ['x'] }],
      description: 'The `trunc` function truncates a number toward zero, removing its decimal portion without rounding.',
      seeAlso: ['round', 'floor', 'ceil', 'quot'],
      examples: [
        'trunc(2)',
        'trunc(2.49)',
        'trunc(2.5)',
        'trunc(-2.49)',
        'trunc(-2.5)',
        'trunc(-2.501)',
        'trunc(0.999)',
      ],
    },
  },
  'floor': {
    evaluate: unaryMathOp(val => Math.floor(val)),
    arity: toFixedArity(1),
    docs: {
      type: '((Number) -> Integer)',
      category: 'math',
      returns: { type: 'integer' },
      args: {
        x: { type: 'number' },
      },
      variants: [{ argumentNames: ['x'] }],
      description: 'The `floor` function returns the largest integer less than or equal to a number.',
      seeAlso: ['ceil', 'round', 'trunc'],
      examples: [
        'floor(2)',
        'floor(2.49)',
        'floor(2.5)',
        'floor(-2.49)',
        'floor(-2.5)',
        'floor(-2.501)',
        'floor(0.4)',
      ],
    },
  },
  'ceil': {
    evaluate: unaryMathOp(val => Math.ceil(val)),
    arity: toFixedArity(1),
    docs: {
      type: '((Number) -> Integer)',
      category: 'math',
      returns: { type: 'integer' },
      args: {
        x: { type: 'number' },
      },
      variants: [{ argumentNames: ['x'] }],
      description: 'The `ceil` function returns the smallest integer greater than or equal to a number.',
      seeAlso: ['floor', 'round', 'trunc'],
      examples: [
        'ceil(2)',
        'ceil(2.49)',
        'ceil(2.5)',
        'ceil(-2.49)',
        'ceil(-2.5)',
        'ceil(-2.501)',
        'ceil(0.4)',
      ],
    },
  },
  'min': {
    evaluate: (params, sourceCodeInfo): number => {
      if (params.size === 1 && isVector(params.get(0))) {
        const vector = assertNonEmptyVector(params.get(0), sourceCodeInfo)
        return vector.reduce((m, val) => Math.min(m, val), Infinity)
      }
      const [first, ...rest] = params
      assertNumber(first, sourceCodeInfo)
      return rest.reduce((m: number, value) => {
        assertNumber(value, sourceCodeInfo)
        return Math.min(m, value)
      }, first)
    },
    arity: { min: 1 },
    docs: {
      type: '((Number, ...Number[]) -> Number) & ((Number[]) -> Number)',
      category: 'math',
      returns: { type: 'number' },
      args: {
        a: { type: 'number' },
        b: { type: 'number' },
        xs: { type: 'number', rest: true },
        vector: { type: 'vector' },
      },
      variants: [
        { argumentNames: ['xs'] },
        { argumentNames: ['vector'] },
      ],
      description: 'Returns the smallest value. Accepts either multiple numbers or a single vector of numbers.',
      seeAlso: ['max', 'vector.span', 'vector.minIndex'],
      examples: [
        '2 min 3',
        'min(2, 0, 1)',
        'min(2, -1, 1)',
        'min([2, 0, -1])',
        '12 min 14',
      ],
    },
  },
  'max': {
    evaluate: (params, sourceCodeInfo): number => {
      if (params.size === 1 && isVector(params.get(0))) {
        const vector = assertNonEmptyVector(params.get(0), sourceCodeInfo)
        return vector.reduce((m, val) => Math.max(m, val), -Infinity)
      }
      const [first, ...rest] = params
      assertNumber(first, sourceCodeInfo)
      return rest.reduce((m: number, value) => {
        assertNumber(value, sourceCodeInfo)
        return Math.max(m, value)
      }, first)
    },
    arity: { min: 1 },
    docs: {
      type: '((Number, ...Number[]) -> Number) & ((Number[]) -> Number)',
      category: 'math',
      returns: { type: 'number' },
      args: {
        a: { type: 'number' },
        b: { type: 'number' },
        xs: { type: 'number', rest: true },
        vector: { type: 'vector' },
      },
      variants: [
        { argumentNames: ['xs'] },
        { argumentNames: ['vector'] },
      ],
      description: 'Returns the largest value. Accepts either multiple numbers or a single vector of numbers.',
      seeAlso: ['min', 'vector.span', 'vector.maxIndex'],
      examples: [
        '2 max 3',
        'max(2, 0, 1)',
        'max(2, -1, 1)',
        'max([2, 0, -1])',
        '4 max 2',
      ],
    },
  },
  'abs': {
    evaluate: unaryMathOp(val => Math.abs(val)),
    arity: toFixedArity(1),
    docs: {
      type: '((Number) -> Number)',
      category: 'math',
      returns: { type: 'number' },
      args: {
        x: { type: 'number' },
      },
      variants: [{ argumentNames: ['x'] }],
      description: 'The `abs` function returns the absolute value of a number.',
      seeAlso: ['sign', '-'],
      examples: [
        'abs(-2.3)',
        'abs(0)',
        'abs(2.5)',
        'abs(-0)',
      ],
    },
  },
  'sign': {
    evaluate: unaryMathOp(val => Math.sign(val)),
    arity: toFixedArity(1),
    docs: {
      // `Math.sign` returns -1, -0, 0, or 1 — all four are integer-valued
      // (`Number.isInteger(-0) === true`). NaN input is rejected by the
      // `isNumber` input guard; Infinity input returns ±1, also integer.
      // So the `Integer` return type is sound for every reachable value.
      type: '((Number) -> Integer)',
      category: 'math',
      returns: { type: 'integer' },
      args: {
        x: { type: 'number' },
      },
      variants: [{ argumentNames: ['x'] }],
      description: 'The `sign` function returns the sign of a number: `-1` for negative, `0` for zero, and `1` for positive.',
      seeAlso: ['abs'],
      examples: [
        'sign(-2.3)',
        'sign(-0)',
        'sign(0)',
        'sign(12312)',
        'sign(-2)',
      ],
    },
  },
}
