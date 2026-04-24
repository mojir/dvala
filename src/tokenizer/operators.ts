import { TokenizerError } from '../errors'

const binaryOperators = [
  '^', // exponentiation

  '*', // multiplication
  '/', // division
  '%', // remainder

  '+', // addition
  '-', // subtraction

  '<<', // left shift
  '>>', // signed right shift
  '>>>', // unsigned right shift

  '++', // string concatenation

  '<', // less than
  '<=', // less than or equal
  '≤', // less than or equal
  '>', // greater than
  '>=', // greater than or equal
  '≥', // greater than or equal

  '==', // equal
  '!=', // not equal
  '!=', // not equal

  '&', // bitwise AND
  'xor', // bitwise XOR
  '|', // bitwise OR

  '&&', // logical AND
  '||', // logical OR
  '??', // nullish coalescing

  '|>', // pipe
] as const

// Unary prefix operators. Kept separate from binaryOperators so the
// parser's binary-dispatch paths don't accidentally treat them as infix
// — unary prefix is resolved at the site where an operand is expected.
// `!=` (2-char) still wins over `!` (1-char) via the longest-match loop
// in tokenizeOperator, so `a != b` tokenizes unchanged.
const unaryPrefixOperators = [
  '!', // logical negation (Boolean) -> Boolean
] as const

const otherOperators = [
  '@', // effect-set type annotation prefix
  ':', // property assignment
  '->', // lambda
  '...', // rest
  '?.', // safe property accessor (returns null for missing key)
  '.', // property accessor (strict — throws on missing key)
  '?', // nullable type suffix (Number? = Number | Null)
  ',', // item separator
  '=', // assignment
  ':', // property assignment
  ';', // statement terminator
] as const

const symbolicOperators = [
  ...binaryOperators,
  ...unaryPrefixOperators,
  ...otherOperators,
] as const

const nonFunctionOperators = [
  'comment',
  'block',
  'if',
  'let',
  'loop',
  'recur',
  'while',
  'handler',
  'transform',
  'resume',
]

const nonFunctionOperatorSet = new Set(nonFunctionOperators)
export function isFunctionOperator(operator: string): boolean {
  return !nonFunctionOperatorSet.has(operator)
}

export type SymbolicBinaryOperator = typeof binaryOperators[number]
export type SymbolicUnaryPrefixOperator = typeof unaryPrefixOperators[number]
export type SymbolicOperator = typeof symbolicOperators[number]

const binaryOperatorSet = new Set(binaryOperators)
export function isBinaryOperator(operator: string): operator is SymbolicBinaryOperator {
  return binaryOperatorSet.has(operator as SymbolicBinaryOperator)
}
export function assertBinaryOperator(operator: string): asserts operator is SymbolicBinaryOperator {
  if (!isBinaryOperator(operator)) {
    throw new TokenizerError(`Expected symbolic binary operator, got ${operator}`, undefined)
  }
}
export function asBinaryOperator(operator: string): SymbolicBinaryOperator {
  assertBinaryOperator(operator)
  return operator
}

const unaryPrefixOperatorSet = new Set(unaryPrefixOperators)
export function isUnaryPrefixOperator(operator: string): operator is SymbolicUnaryPrefixOperator {
  return unaryPrefixOperatorSet.has(operator as SymbolicUnaryPrefixOperator)
}

const symbolicOperatorSet = new Set(symbolicOperators)
export function isSymbolicOperator(operator: string): operator is SymbolicOperator {
  return symbolicOperatorSet.has(operator as SymbolicOperator)
}
export function assertSymbolicOperator(operator: string): asserts operator is SymbolicOperator {
  if (!isSymbolicOperator(operator)) {
    throw new TokenizerError(`Expected symbolic operator, got ${operator}`, undefined)
  }
}
export function asSymbolicOperator(operator: string): SymbolicOperator {
  assertSymbolicOperator(operator)
  return operator
}
