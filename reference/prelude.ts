import type { PreludeReference } from '.'
import type { PreludeName } from './api'
import { snippet } from './dvala'

/**
 * Reference entries for the standard prelude type aliases declared in
 * `src/prelude.dvala`. Keep `definition` in sync with the alias body
 * there — these are documentation surfaces and the prelude file is the
 * source of truth for typechecker semantics.
 */
export const prelude: Record<PreludeName, PreludeReference> = {
  '-prelude-Positive': {
    prelude: true,
    title: 'Positive',
    category: 'prelude',
    definition: 'Number & {n | n > 0}',
    description: 'Strictly positive numbers (n > 0). Use as a precondition where zero and negatives are both invalid — e.g. divisor in a count-style formula, quantities, lengths.',
    examples: [
      snippet('let x: Positive = 5'),
      snippet('let f = (n: Positive) -> 100 / n'),
    ],
    seeAlso: ['-prelude-NonNegative', '-prelude-NonZero'],
  },
  '-prelude-NonNegative': {
    prelude: true,
    title: 'NonNegative',
    category: 'prelude',
    definition: 'Number & {n | n >= 0}',
    description: 'Non-negative numbers (n >= 0). The natural-number sense from CS where 0 is included; common precondition for array indices and counts.',
    examples: [
      snippet('let i: NonNegative = 0'),
      snippet('let f = (idx: NonNegative) -> idx + 1'),
    ],
    seeAlso: ['-prelude-Positive', '-prelude-NonZero'],
  },
  '-prelude-NonZero': {
    prelude: true,
    title: 'NonZero',
    category: 'prelude',
    definition: 'Number & {n | n != 0}',
    description: 'Non-zero numbers (n != 0). The minimal precondition for division — `Positive` is stricter than needed when negative divisors are also fine.',
    examples: [
      snippet('let d: NonZero = -3'),
      snippet('let safeDivide = (a: Number, b: NonZero) -> a / b'),
    ],
    seeAlso: ['-prelude-Positive', '-prelude-NonNegative'],
  },
  '-prelude-NonEmpty': {
    prelude: true,
    title: 'NonEmpty',
    category: 'prelude',
    definition: 'T & {xs | count(xs) > 0} where T: Sequence',
    description: 'Non-empty sequences (count(xs) > 0). Generic over the `Sequence` upper bound, so it works for both arrays and strings — `NonEmpty<Array<Number>>` and `NonEmpty<String>` are both valid.',
    examples: [
      snippet('let xs: NonEmpty<Number[]> = [1, 2, 3]'),
      snippet('let s: NonEmpty<String> = "hi"'),
    ],
  },
}
